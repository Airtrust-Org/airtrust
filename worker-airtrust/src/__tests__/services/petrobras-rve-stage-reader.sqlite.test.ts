import { afterEach, describe, expect, it, vi } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { buildDailyPetrobrasRveXml, type PetrobrasRveFlightRow, type PetrobrasRveStageRow } from '../../services/controle-voos/petrobras-rve-daily-export';
import { PETROBRAS_RVE_STAGE_READ_CHUNK, readPetrobrasStagesByFlight } from '../../services/controle-voos/petrobras-rve-stage-reader';

const dbs: SqliteD1Database[] = [];
afterEach(() => { for (const db of dbs.splice(0)) db.close(); });

function setup(): SqliteD1Database {
  const db = new SqliteD1Database();
  dbs.push(db);
  db.database.exec(`CREATE TABLE cv_voo_etapas (
    id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, voo_id INTEGER NOT NULL,
    numero_etapa INTEGER NOT NULL, origem_icao TEXT, destino_icao TEXT,
    horario_motor_ligado TEXT, horario_decolagem TEXT,
    horario_pouso TEXT, horario_motor_desligado TEXT, deleted_at TEXT
  );
  CREATE INDEX idx_cv_etapa_scope ON cv_voo_etapas(empresa_id, voo_id, numero_etapa);`);
  return db;
}

function addStage(db: SqliteD1Database, company: number, flightId: number, order: number, deleted = false) {
  db.database.prepare(`INSERT INTO cv_voo_etapas (
    empresa_id, voo_id, numero_etapa, origem_icao, destino_icao,
    horario_motor_ligado, horario_decolagem, horario_pouso,
    horario_motor_desligado, deleted_at
  ) VALUES (?,?,?,'SBME','SBME','06:00','06:10','06:40','06:50',?)`)
    .run(company, flightId, order, deleted ? '2026-01-01' : null);
}

const flight = (voo_id: number): PetrobrasRveFlightRow => ({
  voo_id, data_voo: '2026-09-19', prefixo: 'PS-CDV',
  petrobras_equipamento: '30131647', petrobras_atendimento: '509573593',
  sigvoos_flight_report_id: null, sigvoos_flight_report_id_confident: 0,
});

describe('PERF-05 daily Petrobras RDV export stage reader', () => {
  it('reads every stage in one call for a normal day and keeps tenant isolation, deletions, and order', async () => {
    const db = setup();
    addStage(db, 1, 601, 2);
    addStage(db, 1, 601, 1);
    addStage(db, 1, 602, 3);
    addStage(db, 2, 601, 99);
    addStage(db, 1, 601, 4, true);
    const prepare = vi.spyOn(db, 'prepare');
    const stages = await readPetrobrasStagesByFlight(db.asD1(), 1, [601, 602, 601, 603]);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect([...stages.keys()]).toEqual([601, 602, 603]);
    expect(stages.get(601)?.map((stage) => stage.numero_etapa)).toEqual([1, 2]);
    expect(stages.get(602)?.map((stage) => stage.numero_etapa)).toEqual([3]);
    expect(stages.get(603)).toEqual([]);
  });

  it('keeps the byte-exact XML result for multiple flights versus the old per-flight reader', async () => {
    const db = setup();
    addStage(db, 1, 601, 1);
    addStage(db, 1, 602, 1);
    const flights = [flight(602), flight(601)];
    const expected: Array<{flight: PetrobrasRveFlightRow; stages: PetrobrasRveStageRow[]}> = [];
    for (const row of flights) {
      const response = await db.prepare(`SELECT numero_etapa, origem_icao, destino_icao,
        horario_motor_ligado, horario_decolagem, horario_pouso, horario_motor_desligado
        FROM cv_voo_etapas WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL
        ORDER BY numero_etapa ASC`).bind(1, row.voo_id).all<PetrobrasRveStageRow>();
      expected.push({flight: row, stages: response.results});
    }
    const actualStages = await readPetrobrasStagesByFlight(db.asD1(), 1, flights.map((row) => row.voo_id));
    const actual = flights.map((row) => ({flight: row, stages: actualStages.get(row.voo_id) || []}));
    expect(buildDailyPetrobrasRveXml(actual).records).toEqual(buildDailyPetrobrasRveXml(expected).records);
    expect([...buildDailyPetrobrasRveXml(actual).bytes]).toEqual([...buildDailyPetrobrasRveXml(expected).bytes]);
  });

  it('chunks a large selection under the SQLite bind limit, not one query per flight', async () => {
    const db = setup();
    const ids = Array.from({ length: PETROBRAS_RVE_STAGE_READ_CHUNK + 5 }, (_, i) => 700 + i);
    for (const id of ids) addStage(db, 1, id, 1);
    const prepare = vi.spyOn(db, 'prepare');
    const grouped = await readPetrobrasStagesByFlight(db.asD1(), 1, ids);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(grouped.size).toBe(ids.length);
    expect(grouped.get(ids[ids.length - 1])).toHaveLength(1);
  });

  it('does not hit D1 for zero flights and refuses invalid cross-company identifiers', async () => {
    const db = setup();
    const prepare = vi.spyOn(db, 'prepare');
    expect((await readPetrobrasStagesByFlight(db.asD1(), 1, [])).size).toBe(0);
    expect(prepare).not.toHaveBeenCalled();
    await expect(readPetrobrasStagesByFlight(db.asD1(), 0, [601])).rejects.toThrow('INVALID_PETROBRAS_RVE_STAGE_SCOPE');
    await expect(readPetrobrasStagesByFlight(db.asD1(), 1, [-5])).rejects.toThrow('INVALID_PETROBRAS_RVE_STAGE_SCOPE');
    expect(prepare).not.toHaveBeenCalled();
  });
});

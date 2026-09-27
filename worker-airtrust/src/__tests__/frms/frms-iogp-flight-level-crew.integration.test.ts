import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runFrmsIogpShadowForJornada } from '../../lib/frms/frms-iogp-shadow-caller';

const tempDirs: string[] = [];

function sqlLiteral(value: unknown): string {
  if (value == null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function bindSql(sql: string, params: unknown[]): string {
  let index = 0;
  return sql.replace(/\?/g, () => {
    if (index >= params.length) throw new Error('missing sqlite test bind parameter');
    return sqlLiteral(params[index++]);
  });
}

class StatementAdapter {
  constructor(
    private readonly dbPath: string,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new StatementAdapter(this.dbPath, this.sql, params);
  }

  async all<T>() {
    const result = spawnSync('sqlite3', ['-json', this.dbPath, bindSql(this.sql, this.params)], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || 'sqlite all failed');
    return { results: result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [] };
  }

  async first<T>() {
    const rows = await this.all<T>();
    return rows.results[0] ?? null;
  }

  async run() {
    const result = spawnSync('sqlite3', [this.dbPath, bindSql(this.sql, this.params)], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || 'sqlite run failed');
    return { meta: { changes: 1 } };
  }
}

function buildDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-iogp-flight-crew-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'test.sqlite');
  const schema = `
    CREATE TABLE cv_voos (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, data_programacao TEXT NOT NULL, origem_id INTEGER, destino_id INTEGER, sigvoos_flight_report_id INTEGER, deleted_at TEXT);
    CREATE TABLE cv_voo_etapas (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, voo_id INTEGER NOT NULL, numero_etapa INTEGER, sigvoos_leg_number INTEGER, origem_icao TEXT, destino_icao TEXT, horario_decolagem TEXT, horario_pouso TEXT, pousos_diurnos INTEGER, pousos_noturnos INTEGER, metadata_sigvoos_json TEXT, deleted_at TEXT);
    CREATE TABLE cv_voo_tripulantes (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, voo_id INTEGER NOT NULL, funcionario_id INTEGER NOT NULL, etapa_id INTEGER, deleted_at TEXT);
    CREATE TABLE cv_aeroportos (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT, codigo_icao TEXT, deleted_at TEXT);
    CREATE TABLE frms_location_catalog (id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, location_code TEXT NOT NULL, operational_class TEXT NOT NULL, timezone_iana TEXT, weather_source_kind TEXT NOT NULL, redemet_station_icao TEXT, active INTEGER NOT NULL, deleted_at TEXT);
    CREATE TABLE frms_profile_assignments (id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, regulatory_profile_id TEXT NOT NULL, profile_code TEXT NOT NULL, status TEXT NOT NULL, effective_from TEXT NOT NULL, effective_to TEXT);
    CREATE TABLE frms_regulatory_profiles (id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, profile_code TEXT NOT NULL, service_category TEXT, approval_reference TEXT, policy_version TEXT NOT NULL, limits_json TEXT, source_document_hash TEXT, effective_from TEXT NOT NULL, effective_to TEXT, active INTEGER NOT NULL, deleted_at TEXT);
    CREATE TABLE frms_jornada_avaliacoes (id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, jornada_id TEXT NOT NULL, evaluation_version TEXT NOT NULL, input_fingerprint TEXT NOT NULL, regulatory_profile_id TEXT, compliance_json TEXT NOT NULL, biological_summary_json TEXT, operational_demand_json TEXT NOT NULL, environmental_json TEXT NOT NULL, overall_level TEXT NOT NULL, automatic_approval_allowed INTEGER NOT NULL DEFAULT 0, evidence_hash TEXT, calculated_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
    CREATE UNIQUE INDEX idx_frms_jornada_avaliacoes_input_active ON frms_jornada_avaliacoes (empresa_id, jornada_id, evaluation_version, input_fingerprint) WHERE deleted_at IS NULL;
    INSERT INTO cv_voos (id, empresa_id, data_programacao, sigvoos_flight_report_id, deleted_at) VALUES (10, 6, '2026-09-21', 9001, NULL);
    INSERT INTO cv_voo_etapas (id, empresa_id, voo_id, numero_etapa, sigvoos_leg_number, origem_icao, destino_icao, horario_decolagem, horario_pouso, pousos_diurnos, pousos_noturnos, metadata_sigvoos_json, deleted_at) VALUES (100, 6, 10, 1, 1, 'SBME', '9PGB', '10:00', '10:20', 1, 0, '{}', NULL);
    INSERT INTO cv_voo_tripulantes (id, empresa_id, voo_id, funcionario_id, etapa_id, deleted_at) VALUES (1000, 6, 10, 42, NULL, NULL);
    INSERT INTO frms_location_catalog (id, empresa_id, location_code, operational_class, timezone_iana, weather_source_kind, redemet_station_icao, active, deleted_at) VALUES ('loc-sbme', 6, 'SBME', 'AERODROME', 'America/Sao_Paulo', 'REDEMET', 'SBME', 1, NULL), ('loc-9pgb', 6, '9PGB', 'HELIDECK', 'America/Sao_Paulo', 'NONE', NULL, 1, NULL);
    INSERT INTO frms_regulatory_profiles (id, empresa_id, profile_code, service_category, approval_reference, policy_version, limits_json, source_document_hash, effective_from, effective_to, active, deleted_at) VALUES ('frms-regulatory-profile-6-helicopter-offshore-v1', 6, 'HELICOPTER_OFFSHORE', 'OFFSHORE_HELICOPTER', 'AIRTRUST_FRMS_REGULATORY_SOURCE_MANIFEST_2026-09-27', 'LEGACY_MODEL_V2', '{"rbac117_appendices":[]}', '${'a'.repeat(64)}', '1970-01-01', NULL, 1, NULL);
    INSERT INTO frms_profile_assignments (id, empresa_id, regulatory_profile_id, profile_code, status, effective_from, effective_to) VALUES ('assignment-6', 6, 'frms-regulatory-profile-6-helicopter-offshore-v1', 'HELICOPTER_OFFSHORE', 'ACTIVE', '1970-01-01', NULL);
  `;
  const result = spawnSync('sqlite3', [dbPath], { input: schema, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'sqlite schema failed');
  return dbPath;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('FRMS IOGP flight-level crew integration', () => {
  it('expands etapa_id=NULL to the flight legs and persists the governed profile id', async () => {
    const dbPath = buildDb();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const db = { prepare: (sql: string) => new StatementAdapter(dbPath, sql) } as never;

    await runFrmsIogpShadowForJornada(
      db,
      { id: 'j-42-2026-09-21', tripulante_id: 42, data: '2026-09-21', status: 'ES', origem: 'SIGVOOS' },
      { fatorizacao: { effectiveness_nivel: 'verde', effectiveness_pct: 95 }, acumulo: { hv_dia_min: 20, hv_7_dias_min: 120, hv_28_dias_min: 400, hv_365_dias_min: 4000 } },
      { ENVIRONMENT: 'staging', FRMS_IOGP_SHADOW_MODE_TENANTS: '6' },
      6,
    );

    const query = spawnSync('sqlite3', ['-json', dbPath, `SELECT jornada_id, regulatory_profile_id, operational_demand_json, evidence_hash FROM frms_jornada_avaliacoes;`], { encoding: 'utf8' });
    expect(query.status, query.stderr).toBe(0);
    const rows = JSON.parse(query.stdout) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].jornada_id).toBe('j-42-2026-09-21');
    expect(rows[0].regulatory_profile_id).toBe('frms-regulatory-profile-6-helicopter-offshore-v1');
    expect(JSON.parse(String(rows[0].operational_demand_json)).sectorCount).toBe(1);
    const evidence = JSON.parse(String(rows[0].evidence_hash));
    expect(evidence.missingData).toContain('WEATHER_EVIDENCE');
    expect(evidence.regulatoryProfile).toEqual({
      id: 'frms-regulatory-profile-6-helicopter-offshore-v1',
      code: 'HELICOPTER_OFFSHORE',
      reference: 'AIRTRUST_FRMS_REGULATORY_SOURCE_MANIFEST_2026-09-27',
      sourceDocumentHash: 'a'.repeat(64),
    });
    expect(warn).toHaveBeenCalledWith('[FRMS] Final canonical convergence after REDEMET evidence failed', expect.objectContaining({ jornadaId: 'j-42-2026-09-21' }));
  });
});

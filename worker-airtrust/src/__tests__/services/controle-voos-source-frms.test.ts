import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  fetchControleVoosOperationalRecords,
  CONTROLE_VOOS_FRMS_KNOWN_GAPS,
} from '../../lib/frms/controle-voos-source';
import {
  compareControleVoosWithLegacyJornada,
  type FrmsJornadaLegacyRow,
} from '../../lib/frms/controle-voos-shadow-comparator';
import { isControleVoosShadowModeEnabledForEmpresa } from '../../lib/frms/controle-voos-shadow-flag';

type SqliteD1 = D1Database & { databasePath: string };

const tempDirs: string[] = [];
const testDir = dirname(fileURLToPath(import.meta.url));
const migration0410Sql = readFileSync(join(testDir, '../../../migrations/0410_controle_voos_n1_schema.sql'), 'utf8');
const migration0411Sql = readFileSync(
  join(testDir, '../../../migrations/0411_controle_voos_sigvoos_integration_schema.sql'),
  'utf8',
);

function runSql(databasePath: string, sql: string) {
  const result = spawnSync('sqlite3', [databasePath], { input: sql, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
}

function queryJson<T>(databasePath: string, sql: string): T[] {
  const result = spawnSync('sqlite3', ['-json', databasePath, sql], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
}

function createSqliteD1(): SqliteD1 {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-cv-frms-source-'));
  const databasePath = join(tempDir, 'cv-frms.sqlite');
  tempDirs.push(tempDir);

  runSql(databasePath, 'PRAGMA foreign_keys = ON;');
  runSql(databasePath, migration0410Sql);
  runSql(databasePath, migration0411Sql);
  runSql(
    databasePath,
    `
      CREATE TABLE funcionarios (
        id INTEGER PRIMARY KEY,
        nome TEXT,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE frms_jornada (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        tripulante_id INTEGER NOT NULL,
        data TEXT NOT NULL
      );
    `,
  );

  return {
    databasePath,
    prepare(sql: string) {
      let binds: unknown[] = [];
      const statement = {
        bind: (...args: unknown[]) => {
          binds = args;
          return statement;
        },
        first: async <T = unknown>() => {
          const rows = queryJson<T>(databasePath, interpolate(sql, binds));
          return rows[0] || null;
        },
        all: async <T = unknown>() => ({ results: queryJson<T>(databasePath, interpolate(sql, binds)) }),
        run: async () => ({ meta: { changes: 1, last_row_id: 0 } }),
      };
      return statement;
    },
  } as unknown as SqliteD1;
}

function interpolate(sql: string, binds: unknown[]): string {
  const remaining = [...binds];
  return sql.replace(/\?/g, () => {
    const value = remaining.shift();
    if (value == null) return 'NULL';
    if (typeof value === 'number') return String(value);
    return `'${String(value).replace(/'/g, "''")}'`;
  });
}

function seedEmpresa(databasePath: string, empresaId: number, prefixoAeroporto: string) {
  runSql(
    databasePath,
    `
      INSERT INTO cv_aeroportos (id, empresa_id, codigo, codigo_icao, nome, tipo, ativo, ordem)
      VALUES (${empresaId}01, ${empresaId}, '${prefixoAeroporto}A', '${prefixoAeroporto}A', 'Origem', 'aeroporto', 1, 1),
             (${empresaId}02, ${empresaId}, '${prefixoAeroporto}B', '${prefixoAeroporto}B', 'Destino', 'aeroporto', 1, 2);

      INSERT INTO cv_tipos_voo (id, empresa_id, codigo, nome, ativo, ordem)
      VALUES (${empresaId}01, ${empresaId}, 'REG', 'Regular', 1, 1);

      INSERT INTO cv_naturezas_voo (id, empresa_id, codigo, nome, ativo, ordem)
      VALUES (${empresaId}01, ${empresaId}, 'PAX', 'Passageiro', 1, 1);
    `,
  );
}

function seedVooComTripulante(
  databasePath: string,
  args: {
    empresaId: number;
    vooId: number;
    etapaId: number;
    tripulanteRecordId: number;
    funcionarioId: number;
    data: string;
    takeoff: string;
    landing: string;
    externalIdSigvoos: number | null;
  },
) {
  const { empresaId, vooId, etapaId, tripulanteRecordId, funcionarioId, data, takeoff, landing, externalIdSigvoos } = args;
  runSql(
    databasePath,
    `
      INSERT INTO cv_voos (
        id, empresa_id, prefixo, data_programacao, origem_id, destino_id,
        tipo_voo_id, natureza_voo_id, horario_previsto_partida, horario_previsto_chegada,
        status, origem_importacao, sigvoos_flight_report_id, sigvoos_importado_em, created_by, updated_by
      ) VALUES (
        ${vooId}, ${empresaId}, 'PFX-${vooId}', '${data}', ${empresaId}01, ${empresaId}02,
        ${empresaId}01, ${empresaId}01, '${data}T10:00:00Z', '${data}T11:00:00Z',
        'planejado', 'SIGVOOS', ${externalIdSigvoos ?? 'NULL'}, '${data}T12:00:00Z', 1, 1
      );

      INSERT INTO cv_voo_etapas (
        id, empresa_id, voo_id, numero_etapa, sigvoos_leg_number,
        origem_icao, destino_icao, horario_motor_ligado, horario_decolagem,
        horario_pouso, horario_motor_desligado, tempo_total, tempo_navegacao,
        pousos_diurnos, pousos_noturnos, starts, pax, origem_dados, sigvoos_importado_em
      ) VALUES (
        ${etapaId}, ${empresaId}, ${vooId}, 1, 1,
        'AAA', 'BBB', '${takeoff}', '${takeoff}',
        '${landing}', '${landing}', '01:00', '00:50',
        1, 0, 1, 5, 'SIGVOOS', '${data}T12:00:00Z'
      );

      INSERT INTO funcionarios (id, nome, empresa_id, deleted_at)
      VALUES (${funcionarioId}, 'Tripulante ${funcionarioId}', ${empresaId}, NULL);

      INSERT INTO cv_voo_tripulantes (
        id, empresa_id, voo_id, funcionario_id, funcao, etapa_id, sigvoos_staff_id, created_by, updated_by
      ) VALUES (
        ${tripulanteRecordId}, ${empresaId}, ${vooId}, ${funcionarioId}, 'PIC', ${etapaId}, 700${funcionarioId}, 1, 1
      );
    `,
  );
}

afterAll(() => {
  for (const tempDir of tempDirs) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('fetchControleVoosOperationalRecords', () => {
  it('retorna registros escopados à empresa autenticada, sem misturar dados de outra empresa', async () => {
    const db = createSqliteD1();
    seedEmpresa(db.databasePath, 1, 'X');
    seedEmpresa(db.databasePath, 2, 'Y');
    seedVooComTripulante(db.databasePath, {
      empresaId: 1,
      vooId: 601,
      etapaId: 9001,
      tripulanteRecordId: 9101,
      funcionarioId: 1001,
      data: '2026-06-14',
      takeoff: '08:00',
      landing: '09:00',
      externalIdSigvoos: 700101,
    });
    seedVooComTripulante(db.databasePath, {
      empresaId: 2,
      vooId: 701,
      etapaId: 9002,
      tripulanteRecordId: 9102,
      funcionarioId: 2001,
      data: '2026-06-14',
      takeoff: '10:00',
      landing: '11:00',
      externalIdSigvoos: 800101,
    });

    const empresa1Records = await fetchControleVoosOperationalRecords(db, 1, '2026-06-14', '2026-06-14');
    expect(empresa1Records).toHaveLength(1);
    expect(empresa1Records[0]).toMatchObject({
      empresaId: 1,
      tripulanteId: 1001,
      vooId: 601,
      identificadorExterno: '700101',
      minutosVoo: 60,
      timezone: 'America/Sao_Paulo',
    });

    const empresa2Records = await fetchControleVoosOperationalRecords(db, 2, '2026-06-14', '2026-06-14');
    expect(empresa2Records).toHaveLength(1);
    expect(empresa2Records[0].tripulanteId).toBe(2001);
    expect(empresa2Records.some((r) => r.tripulanteId === 1001)).toBe(false);
  });

  it('rejeita empresaId inválido (defesa contra tenant ausente/inválido)', async () => {
    const db = createSqliteD1();
    await expect(fetchControleVoosOperationalRecords(db, 0, '2026-06-14', '2026-06-14')).rejects.toThrow();
    await expect(fetchControleVoosOperationalRecords(db, -1, '2026-06-14', '2026-06-14')).rejects.toThrow();
    await expect(
      fetchControleVoosOperationalRecords(db, Number.NaN, '2026-06-14', '2026-06-14'),
    ).rejects.toThrow();
  });

  it('retorna lista vazia para período sem voos, sem lançar erro', async () => {
    const db = createSqliteD1();
    seedEmpresa(db.databasePath, 1, 'X');
    const records = await fetchControleVoosOperationalRecords(db, 1, '2026-01-01', '2026-01-01');
    expect(records).toEqual([]);
  });

  it('documenta a lacuna de cancelamento explicitamente no contrato retornado', async () => {
    const db = createSqliteD1();
    seedEmpresa(db.databasePath, 1, 'X');
    seedVooComTripulante(db.databasePath, {
      empresaId: 1,
      vooId: 601,
      etapaId: 9001,
      tripulanteRecordId: 9101,
      funcionarioId: 1001,
      data: '2026-06-14',
      takeoff: '08:00',
      landing: '09:00',
      externalIdSigvoos: null,
    });
    const records = await fetchControleVoosOperationalRecords(db, 1, '2026-06-14', '2026-06-14');
    expect(records[0].statusCancelamentoConfirmado).toBe(false);
    expect(records[0].identificadorExterno).toBeNull();
    expect(CONTROLE_VOOS_FRMS_KNOWN_GAPS.length).toBeGreaterThan(0);
    expect(CONTROLE_VOOS_FRMS_KNOWN_GAPS.some((gap) => gap.toLowerCase().includes('cancelamento'))).toBe(true);
  });
});

describe('compareControleVoosWithLegacyJornada', () => {
  it('não reporta divergência quando legado e Controle de Voos têm exatamente as mesmas chaves tripulante+data', async () => {
    const db = createSqliteD1();
    seedEmpresa(db.databasePath, 1, 'X');
    seedVooComTripulante(db.databasePath, {
      empresaId: 1,
      vooId: 601,
      etapaId: 9001,
      tripulanteRecordId: 9101,
      funcionarioId: 1001,
      data: '2026-06-14',
      takeoff: '08:00',
      landing: '09:00',
      externalIdSigvoos: 700101,
    });
    const cvRecords = await fetchControleVoosOperationalRecords(db, 1, '2026-06-14', '2026-06-14');
    const legacyRows: FrmsJornadaLegacyRow[] = [{ tripulante_id: 1001, data: '2026-06-14', empresa_id: 1 }];

    const summary = compareControleVoosWithLegacyJornada(cvRecords, legacyRows, { from: '2026-06-14', to: '2026-06-14' });
    expect(summary.totalDivergencias).toBe(0);
    expect(summary.totalRegistrosLegado).toBe(1);
    expect(summary.totalRegistrosControleVoos).toBe(1);
  });

  it('reporta AUSENTE_NO_CONTROLE_VOOS quando o legado tem um registro que o Controle de Voos não tem', () => {
    const legacyRows: FrmsJornadaLegacyRow[] = [{ tripulante_id: 9999, data: '2026-06-14', empresa_id: 1 }];
    const summary = compareControleVoosWithLegacyJornada([], legacyRows, { from: '2026-06-14', to: '2026-06-14' });
    expect(summary.totalDivergencias).toBe(1);
    expect(summary.divergenciasPorTipo.AUSENTE_NO_CONTROLE_VOOS).toBe(1);
    expect(summary.amostraDivergencias[0]).not.toHaveProperty('nome');
    expect(summary.amostraDivergencias[0].tripulanteId).toBe(9999);
  });

  it('reporta AUSENTE_NO_LEGADO quando o Controle de Voos tem um registro que o legado não tem', async () => {
    const db = createSqliteD1();
    seedEmpresa(db.databasePath, 1, 'X');
    seedVooComTripulante(db.databasePath, {
      empresaId: 1,
      vooId: 601,
      etapaId: 9001,
      tripulanteRecordId: 9101,
      funcionarioId: 1001,
      data: '2026-06-14',
      takeoff: '08:00',
      landing: '09:00',
      externalIdSigvoos: 700101,
    });
    const cvRecords = await fetchControleVoosOperationalRecords(db, 1, '2026-06-14', '2026-06-14');
    const summary = compareControleVoosWithLegacyJornada(cvRecords, [], { from: '2026-06-14', to: '2026-06-14' });
    expect(summary.divergenciasPorTipo.AUSENTE_NO_LEGADO).toBe(1);
  });

  it('nunca inclui nome, matrícula ou CPF nas divergências (proteção de PII)', () => {
    const legacyRows: FrmsJornadaLegacyRow[] = [{ tripulante_id: 42, data: '2026-06-14', empresa_id: 1 }];
    const summary = compareControleVoosWithLegacyJornada([], legacyRows, { from: '2026-06-14', to: '2026-06-14' });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toMatch(/nome|matricula|cpf/i);
  });
});

describe('isControleVoosShadowModeEnabledForEmpresa', () => {
  it('retorna false por padrão quando a env var está ausente (default seguro)', () => {
    expect(isControleVoosShadowModeEnabledForEmpresa(1, {})).toBe(false);
  });

  it('retorna false quando a env var está vazia', () => {
    expect(isControleVoosShadowModeEnabledForEmpresa(1, { CONTROLE_VOOS_FRMS_SHADOW_MODE_TENANTS: '' })).toBe(false);
  });

  it('retorna true para todas as empresas quando configurado como "all"', () => {
    expect(isControleVoosShadowModeEnabledForEmpresa(999, { CONTROLE_VOOS_FRMS_SHADOW_MODE_TENANTS: 'all' })).toBe(true);
  });

  it('retorna true apenas para empresas listadas explicitamente', () => {
    const env = { CONTROLE_VOOS_FRMS_SHADOW_MODE_TENANTS: '12,47,103' };
    expect(isControleVoosShadowModeEnabledForEmpresa(47, env)).toBe(true);
    expect(isControleVoosShadowModeEnabledForEmpresa(48, env)).toBe(false);
  });

  it('rollback: desativar a flag (remover a empresa da lista) volta ao comportamento legado imediatamente', () => {
    const enabledEnv = { CONTROLE_VOOS_FRMS_SHADOW_MODE_TENANTS: '47' };
    expect(isControleVoosShadowModeEnabledForEmpresa(47, enabledEnv)).toBe(true);
    const rolledBackEnv = { CONTROLE_VOOS_FRMS_SHADOW_MODE_TENANTS: '' };
    expect(isControleVoosShadowModeEnabledForEmpresa(47, rolledBackEnv)).toBe(false);
  });
});

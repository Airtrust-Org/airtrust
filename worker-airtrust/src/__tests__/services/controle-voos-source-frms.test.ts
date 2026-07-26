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
import {
  buildFrmsControleVoosContractV1,
  buildFrmsControleVoosContractV1Batch,
  frmsControleVoosContractV1Schema,
  FRMS_CONTROLE_VOOS_CONTRACT_VERSION,
  SIGVOOS_EXTERNAL_EVIDENCE_PENDING,
} from '../../lib/frms/controle-voos-contract';

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
    flightStatus?: string;
    staffExternalId?: number;
  },
) {
  const {
    empresaId,
    vooId,
    etapaId,
    tripulanteRecordId,
    funcionarioId,
    data,
    takeoff,
    landing,
    externalIdSigvoos,
    flightStatus = 'planejado',
    staffExternalId = Number(`700${funcionarioId}`),
  } = args;
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
        '${flightStatus}', 'SIGVOOS', ${externalIdSigvoos ?? 'NULL'}, '${data}T12:00:00Z', 1, 1
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
        ${tripulanteRecordId}, ${empresaId}, ${vooId}, ${funcionarioId}, 'PIC', ${etapaId}, ${staffExternalId}, 1, 1
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
      identificadorExternoTripulante: '7001001',
      minutosVoo: 60,
      timezone: null,
      timezoneFonte: 'INDISPONIVEL',
      statusOperacional: 'PLANEJADO',
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

  it('expõe status operacional e timezone indisponível sem fallback silencioso', async () => {
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
      flightStatus: 'cancelado',
      staffExternalId: 991001,
    });
    const records = await fetchControleVoosOperationalRecords(db, 1, '2026-06-14', '2026-06-14');
    expect(records[0]).toMatchObject({
      statusOperacional: 'CANCELADO',
      statusOperacionalRaw: 'cancelado',
      cancelado: true,
      corrigido: false,
      identificadorExterno: null,
      identificadorExternoTripulante: '991001',
      timezone: null,
      timezoneFonte: 'INDISPONIVEL',
    });
    expect(CONTROLE_VOOS_FRMS_KNOWN_GAPS.length).toBeGreaterThan(0);
    expect(CONTROLE_VOOS_FRMS_KNOWN_GAPS.some((gap) => gap.toLowerCase().includes('timezone'))).toBe(true);
  });

  it('mapeia status não reconhecido como DESCONHECIDO', async () => {
    const db = createSqliteD1();
    seedEmpresa(db.databasePath, 1, 'X');
    seedVooComTripulante(db.databasePath, {
      empresaId: 1,
      vooId: 602,
      etapaId: 9002,
      tripulanteRecordId: 9102,
      funcionarioId: 1002,
      data: '2026-06-15',
      takeoff: '08:00',
      landing: '09:00',
      externalIdSigvoos: null,
      flightStatus: 'alternado_divergido',
    });
    const records = await fetchControleVoosOperationalRecords(db, 1, '2026-06-15', '2026-06-15');
    expect(records[0]?.statusOperacional).toBe('DESCONHECIDO');
    expect(records[0].identificadorExterno).toBeNull();
  });
});

describe('contrato FRMS v1 (controle-voos-contract)', () => {
  it('produz um payload que satisfaz o schema versionado, com base/planejados marcados como pendentes explicitamente', async () => {
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
    const [record] = await fetchControleVoosOperationalRecords(db, 1, '2026-06-14', '2026-06-14');

    const contract = buildFrmsControleVoosContractV1(record);
    expect(() => frmsControleVoosContractV1Schema.parse(contract)).not.toThrow();

    expect(contract.contractVersion).toBe(FRMS_CONTROLE_VOOS_CONTRACT_VERSION);
    expect(contract.origem).toBe('CONTROLE_VOOS');
    expect(contract.horarios.planejados).toEqual({
      partida: null,
      chegada: null,
      fonte: 'NAO_DISPONIVEL_NO_READ_MODEL',
    });
    expect(contract.base).toEqual({ codigo: null, fonte: SIGVOOS_EXTERNAL_EVIDENCE_PENDING });
    expect(contract.idempotencyKey).toBe(
      `cv:${FRMS_CONTROLE_VOOS_CONTRACT_VERSION}:1:${record.identificadorInterno}:${record.atualizadoEm}`,
    );
  });

  it('idempotencyKey e estavel para o mesmo registro e muda quando sourceVersion muda', async () => {
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
    const [record] = await fetchControleVoosOperationalRecords(db, 1, '2026-06-14', '2026-06-14');

    const contractA = buildFrmsControleVoosContractV1(record);
    const contractB = buildFrmsControleVoosContractV1(record);
    expect(contractA.idempotencyKey).toBe(contractB.idempotencyKey);

    const contractC = buildFrmsControleVoosContractV1({ ...record, atualizadoEm: '2026-06-15T00:00:00Z' });
    expect(contractC.idempotencyKey).not.toBe(contractA.idempotencyKey);
  });

  it('occurredAt so e preenchido quando timezone explicito E hora de decolagem existem; sem timezone fica null (nao fabrica offset)', async () => {
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
    const [record] = await fetchControleVoosOperationalRecords(db, 1, '2026-06-14', '2026-06-14');
    expect(record.timezoneFonte).toBe('INDISPONIVEL');

    const semTimezone = buildFrmsControleVoosContractV1(record);
    expect(semTimezone.occurredAt).toBeNull();

    const comTimezone = buildFrmsControleVoosContractV1({
      ...record,
      timezone: 'America/Sao_Paulo',
      timezoneFonte: 'EXPLICITO',
    });
    expect(comTimezone.occurredAt).toBe('2026-06-14T08:00:00');
  });

  it('nao usa IDs internos do SIGVOOS como chave canonica — idempotencyKey e vooId/tripulanteId sao sempre do AirTrust', async () => {
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
    const [record] = await fetchControleVoosOperationalRecords(db, 1, '2026-06-14', '2026-06-14');
    const contract = buildFrmsControleVoosContractV1(record);

    expect(contract.idempotencyKey).not.toContain('700101');
    expect(contract.vooId).toBe(601);
    expect(contract.tripulanteId).toBe(1001);
  });

  it('lote (batch) preserva ordem e escopo de tenant dos registros de origem', async () => {
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
    seedVooComTripulante(db.databasePath, {
      empresaId: 1,
      vooId: 602,
      etapaId: 9002,
      tripulanteRecordId: 9102,
      funcionarioId: 1002,
      data: '2026-06-14',
      takeoff: '10:00',
      landing: '11:00',
      externalIdSigvoos: 700102,
    });
    const records = await fetchControleVoosOperationalRecords(db, 1, '2026-06-14', '2026-06-14');
    expect(records.length).toBe(2);

    const contracts = buildFrmsControleVoosContractV1Batch(records);
    expect(contracts.map((c) => c.vooId)).toEqual(records.map((r) => r.vooId));
    expect(contracts.every((c) => c.empresaId === 1)).toBe(true);
  });
});

describe('compareControleVoosWithLegacyJornada', () => {
  it('não reporta divergência quando legado e Controle de Voos têm exatamente as mesmas chaves tripulante+data e o contrato já traz timezone explícito', () => {
    const cvRecords = [
      {
        empresaId: 1,
        identificadorInterno: 'v601-e9001-t9101',
        identificadorExterno: '700101',
        identificadorExternoTripulante: '7001001',
        origem: 'CONTROLE_VOOS' as const,
        origemDados: 'importado' as const,
        tripulanteId: 1001,
        funcao: 'PIC',
        dataOperacional: '2026-06-14',
        horaDecolagem: '08:00',
        horaPouso: '09:00',
        timezone: 'America/Sao_Paulo',
        timezoneFonte: 'EXPLICITO' as const,
        vooId: 601,
        etapaId: 9001,
        aeronaveIdentificador: 'PFX-601',
        origemIcao: 'AAA',
        destinoIcao: 'BBB',
        statusOperacional: 'PLANEJADO' as const,
        statusOperacionalRaw: 'planejado',
        cancelado: false,
        corrigido: false,
        minutosVoo: 60,
        atualizadoEm: '2026-06-14T12:00:00Z',
        qualidadeDado: 'completo' as const,
        estadoConflito: null,
      },
    ];
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

  it('reporta TIMEZONE_INDISPONIVEL de forma conservadora mesmo quando a chave existe nos dois lados', async () => {
    const db = createSqliteD1();
    seedEmpresa(db.databasePath, 1, 'X');
    seedVooComTripulante(db.databasePath, {
      empresaId: 1,
      vooId: 603,
      etapaId: 9003,
      tripulanteRecordId: 9103,
      funcionarioId: 1003,
      data: '2026-06-16',
      takeoff: '08:00',
      landing: '09:00',
      externalIdSigvoos: 700103,
    });
    const cvRecords = await fetchControleVoosOperationalRecords(db, 1, '2026-06-16', '2026-06-16');
    const legacyRows: FrmsJornadaLegacyRow[] = [{ tripulante_id: 1003, data: '2026-06-16', empresa_id: 1 }];

    const summary = compareControleVoosWithLegacyJornada(cvRecords, legacyRows, { from: '2026-06-16', to: '2026-06-16' });
    expect(summary.divergenciasPorTipo.TIMEZONE_INDISPONIVEL).toBe(1);
    expect(summary.totalDivergencias).toBe(1);
  });

  it('reporta STATUS_NAO_CONFIAVEL para voo cancelado com chave presente nos dois lados', () => {
    const summary = compareControleVoosWithLegacyJornada(
      [
        {
          empresaId: 1,
          identificadorInterno: 'v601-e9001-t9101',
          identificadorExterno: '700101',
          identificadorExternoTripulante: '991001',
          origem: 'CONTROLE_VOOS',
          origemDados: 'importado',
          tripulanteId: 1001,
          funcao: 'PIC',
          dataOperacional: '2026-06-14',
          horaDecolagem: '08:00',
          horaPouso: '09:00',
          timezone: 'America/Sao_Paulo',
          timezoneFonte: 'EXPLICITO',
          vooId: 601,
          etapaId: 9001,
          aeronaveIdentificador: 'PFX-601',
          origemIcao: 'AAA',
          destinoIcao: 'BBB',
          statusOperacional: 'CANCELADO',
          statusOperacionalRaw: 'cancelado',
          cancelado: true,
          corrigido: false,
          minutosVoo: 60,
          atualizadoEm: '2026-06-14T12:00:00Z',
          qualidadeDado: 'completo',
          estadoConflito: null,
        },
      ],
      [{ tripulante_id: 1001, data: '2026-06-14', empresa_id: 1 }],
      { from: '2026-06-14', to: '2026-06-14' },
    );
    expect(summary.divergenciasPorTipo.STATUS_NAO_CONFIAVEL).toBe(1);
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

  it('ignora SIGVOOS_CONFIG_ENCRYPTION_KEY ao decidir o shadow mode', () => {
    const unrelatedEnv = { SIGVOOS_CONFIG_ENCRYPTION_KEY: 'present-but-unrelated' } as unknown as Parameters<
      typeof isControleVoosShadowModeEnabledForEmpresa
    >[1];
    const enabledEnv = {
      CONTROLE_VOOS_FRMS_SHADOW_MODE_TENANTS: '47',
      SIGVOOS_CONFIG_ENCRYPTION_KEY: 'present-but-unrelated',
    } as unknown as Parameters<typeof isControleVoosShadowModeEnabledForEmpresa>[1];
    expect(
      isControleVoosShadowModeEnabledForEmpresa(47, unrelatedEnv),
    ).toBe(false);
    expect(isControleVoosShadowModeEnabledForEmpresa(47, enabledEnv)).toBe(true);
  });
});

describe('Controle de Voos / SIGVOOS import architecture boundary', () => {
  it('never lets the Controle de Voos read model or the SIGVOOS importer depend on the legacy direct SIGVOOS-to-FRMS sync service', () => {
    // Required architecture: SIGVOOS/SIGI -> Controle de Voos -> FRMS. The files
    // below must stay free of a direct dependency on the legacy sync service that
    // still writes frms_jornada straight from SIGVOOS (services/sigvoos-frms.ts),
    // otherwise the two pipelines merge and tenant/identity guarantees built into
    // Controle de Voos stop applying to what FRMS actually reads.
    const guardedFiles = [
      join(testDir, '../../lib/frms/controle-voos-source.ts'),
      join(testDir, '../../lib/frms/controle-voos-shadow-comparator.ts'),
      join(testDir, '../../lib/frms/controle-voos-shadow-flag.ts'),
      join(testDir, '../../services/controle-voos/sigvoos-importer.ts'),
      join(testDir, '../../services/controle-voos/controle-voos-jornadas.ts'),
    ];

    for (const filePath of guardedFiles) {
      const source = readFileSync(filePath, 'utf8');
      expect(source).not.toMatch(/from ['"].*services\/sigvoos-frms['"]/);
      expect(source).not.toMatch(/from ['"].*routes\/frms['"]/);
      expect(source).not.toMatch(/from ['"].*routes\/frms-fira['"]/);
    }
  });
});

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

type NamedRow = {
  name: string;
};

type TableColumn = {
  name: string;
  dflt_value: string | null;
};

type IndexRow = {
  name: string;
  partial?: number;
};

type SigvoosFixture = {
  flight_report?: {
    id?: number;
    report_number?: string;
    flight_number?: string;
  };
  flight_report_leg?: {
    number?: number | null;
  };
  staff?: {
    id?: number;
    name?: string;
    inscription?: string | number | null;
    canac?: string;
  };
  date?: string;
  aircraft_registration?: string;
};

const tempDirs: string[] = [];
const testDir = dirname(fileURLToPath(import.meta.url));
const migration0410Sql = readFileSync(join(testDir, '../../../migrations/0410_controle_voos_n1_schema.sql'), 'utf8');
const migration0411Sql = readFileSync(
  join(testDir, '../../../migrations/0411_controle_voos_sigvoos_integration_schema.sql'),
  'utf8',
);
const fixturesDir = join(testDir, '../fixtures/sigvoos');
const rollback0411Sql = `
DROP TRIGGER IF EXISTS trg_cv_conflitos_integracao_tripulante_update;
DROP TRIGGER IF EXISTS trg_cv_conflitos_integracao_tripulante_insert;
DROP TRIGGER IF EXISTS trg_cv_conflitos_integracao_etapa_update;
DROP TRIGGER IF EXISTS trg_cv_conflitos_integracao_etapa_insert;
DROP TRIGGER IF EXISTS trg_cv_conflitos_integracao_voo_update;
DROP TRIGGER IF EXISTS trg_cv_conflitos_integracao_voo_insert;
DROP TRIGGER IF EXISTS trg_cv_conflitos_integracao_staging_update;
DROP TRIGGER IF EXISTS trg_cv_conflitos_integracao_staging_insert;
DROP TRIGGER IF EXISTS trg_cv_sigvoos_staging_tripulante_update;
DROP TRIGGER IF EXISTS trg_cv_sigvoos_staging_tripulante_insert;
DROP TRIGGER IF EXISTS trg_cv_sigvoos_staging_etapa_update;
DROP TRIGGER IF EXISTS trg_cv_sigvoos_staging_etapa_insert;
DROP TRIGGER IF EXISTS trg_cv_sigvoos_staging_voo_update;
DROP TRIGGER IF EXISTS trg_cv_sigvoos_staging_voo_insert;
DROP TRIGGER IF EXISTS trg_cv_voo_tripulantes_etapa_update;
DROP TRIGGER IF EXISTS trg_cv_voo_tripulantes_etapa_insert;
DROP TRIGGER IF EXISTS trg_cv_voo_etapas_empresa_update;
DROP TRIGGER IF EXISTS trg_cv_voo_etapas_empresa_insert;

DROP INDEX IF EXISTS idx_cv_conflitos_empresa_staging;
DROP INDEX IF EXISTS idx_cv_conflitos_empresa_deleted;
DROP INDEX IF EXISTS idx_cv_conflitos_empresa_entidade;
DROP INDEX IF EXISTS idx_cv_conflitos_empresa_status_severidade;
DROP INDEX IF EXISTS idx_cv_conflitos_empresa_entidade_campo_aberto;
DROP TABLE IF EXISTS cv_conflitos_integracao;

DROP INDEX IF EXISTS idx_cv_sigvoos_staging_empresa_deleted;
DROP INDEX IF EXISTS idx_cv_sigvoos_staging_empresa_window;
DROP INDEX IF EXISTS idx_cv_sigvoos_staging_empresa_fr_id;
DROP INDEX IF EXISTS idx_cv_sigvoos_staging_empresa_status_data;
DROP INDEX IF EXISTS idx_cv_sigvoos_staging_empresa_hash;
DROP TABLE IF EXISTS cv_sigvoos_staging;

DROP INDEX IF EXISTS idx_cv_voo_tripulantes_empresa_sigvoos_staff;
DROP INDEX IF EXISTS idx_cv_voo_tripulantes_empresa_etapa;
DROP INDEX IF EXISTS idx_cv_voo_tripulantes_empresa_etapa_staff;

DROP INDEX IF EXISTS idx_cv_voos_empresa_sigvoos_importado;
DROP INDEX IF EXISTS idx_cv_voos_empresa_origem_importacao;
DROP INDEX IF EXISTS idx_cv_voos_empresa_sigvoos_fr_id;

DROP INDEX IF EXISTS idx_cv_voo_etapas_empresa_deleted;
DROP INDEX IF EXISTS idx_cv_voo_etapas_empresa_importado;
DROP INDEX IF EXISTS idx_cv_voo_etapas_empresa_voo_numero;
DROP INDEX IF EXISTS idx_cv_voo_etapas_empresa_voo_leg;
DROP TABLE IF EXISTS cv_voo_etapas;
`;

function createDb({ apply0411 = true }: { apply0411?: boolean } = {}) {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-controle-voos-0411-'));
  const databasePath = join(tempDir, 'schema.sqlite');
  tempDirs.push(tempDir);

  function sqlite(sql: string): string {
    const result = spawnSync('sqlite3', [databasePath], {
      input: sql,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  }

  function sqliteResult(sql: string) {
    return spawnSync('sqlite3', [databasePath], {
      input: sql,
      encoding: 'utf8',
    });
  }

  function queryJson<T>(sql: string): T[] {
    const result = spawnSync('sqlite3', ['-json', databasePath, sql], {
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
  }

  sqlite('PRAGMA foreign_keys = ON;');
  sqlite(migration0410Sql);

  if (apply0411) {
    sqlite(migration0411Sql);
  }

  return { sqlite, sqliteResult, queryJson };
}

function expectSqlFailure(result: ReturnType<typeof spawnSync>, messagePattern: RegExp) {
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(messagePattern);
}

function catalogIds(empresaId: number) {
  return {
    origemId: empresaId * 1000 + 101,
    destinoId: empresaId * 1000 + 102,
    plataformaId: empresaId * 1000 + 103,
    tipoId: empresaId * 1000 + 201,
    naturezaId: empresaId * 1000 + 301,
    motivoId: empresaId * 1000 + 401,
  };
}

function seedMinimumCatalogs(sqlite: (sql: string) => string, empresaId = 6) {
  const ids = catalogIds(empresaId);

  sqlite(`
    INSERT INTO cv_aeroportos (id, empresa_id, codigo, codigo_icao, nome, tipo)
    VALUES
      (${ids.origemId}, ${empresaId}, 'SBRJ-${empresaId}', 'SBRJ', 'Santos Dumont ${empresaId}', 'aeroporto'),
      (${ids.destinoId}, ${empresaId}, 'SBSP-${empresaId}', 'SBSP', 'Congonhas ${empresaId}', 'aeroporto'),
      (${ids.plataformaId}, ${empresaId}, 'SBPL-${empresaId}', 'SBPL${empresaId}', 'Plataforma ${empresaId}', 'plataforma');

    INSERT INTO cv_tipos_voo (id, empresa_id, codigo, nome)
    VALUES (${ids.tipoId}, ${empresaId}, 'REG-${empresaId}', 'Regular ${empresaId}');

    INSERT INTO cv_naturezas_voo (id, empresa_id, codigo, nome)
    VALUES (${ids.naturezaId}, ${empresaId}, 'PAX-${empresaId}', 'Passageiro ${empresaId}');

    INSERT INTO cv_motivos_operacionais (id, empresa_id, codigo, nome, tipo)
    VALUES (${ids.motivoId}, ${empresaId}, 'WX-${empresaId}', 'Meteorologia ${empresaId}', 'atraso');
  `);
}

function insertManualFlight(
  sqlite: (sql: string) => string,
  {
    empresaId = 6,
    flightId = 500 + empresaId,
    prefixo = `ATX-${empresaId}`,
    dataProgramacao = '2026-06-14',
  }: {
    empresaId?: number;
    flightId?: number;
    prefixo?: string;
    dataProgramacao?: string;
  } = {},
) {
  const ids = catalogIds(empresaId);

  sqlite(`
    INSERT INTO cv_voos (
      id, empresa_id, prefixo, data_programacao, origem_id, destino_id,
      tipo_voo_id, natureza_voo_id, aeronave_id, horario_previsto_partida,
      horario_previsto_chegada, status, created_by
    ) VALUES (
      ${flightId}, ${empresaId}, '${prefixo}', '${dataProgramacao}', ${ids.origemId}, ${ids.destinoId},
      ${ids.tipoId}, ${ids.naturezaId}, ${empresaId * 900},
      '${dataProgramacao}T10:00:00', '${dataProgramacao}T11:15:00', 'planejado', 10
    );
  `);

  return flightId;
}

function insertManualTripulante(
  sqlite: (sql: string) => string,
  {
    empresaId = 6,
    tripulanteId = 9000 + empresaId,
    vooId = 500 + empresaId,
    funcionarioId = 7000 + empresaId,
    funcao = 'PIC',
  }: {
    empresaId?: number;
    tripulanteId?: number;
    vooId?: number;
    funcionarioId?: number;
    funcao?: 'PIC' | 'SIC' | 'COM' | 'MEC' | 'OUTRO';
  } = {},
) {
  sqlite(`
    INSERT INTO cv_voo_tripulantes (
      id, empresa_id, voo_id, funcionario_id, funcao, horario_apresentacao, horario_dispensa, created_by
    ) VALUES (
      ${tripulanteId}, ${empresaId}, ${vooId}, ${funcionarioId}, '${funcao}',
      '2026-06-14T09:30:00', '2026-06-14T11:40:00', 10
    );
  `);

  return tripulanteId;
}

function readFixture(name: string): SigvoosFixture | { variants: SigvoosFixture[] } {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as SigvoosFixture | { variants: SigvoosFixture[] };
}

function sanitizeSigvoosPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeSigvoosPayload(entry));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/(token|secret|password|credential)/i.test(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, sanitizeSigvoosPayload(entryValue)]);

    return Object.fromEntries(entries);
  }

  return value;
}

function hashSanitizedPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(sanitizeSigvoosPayload(value))).digest('hex');
}

function normalizeInscription(value: unknown): string {
  return String(value ?? '')
    .replace(/\D/g, '')
    .padStart(5, '0');
}

afterAll(() => {
  for (const tempDir of tempDirs) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('migration 0411 controle voos SIGVOOS integration schema', () => {
  it('creates the new tables, columns and indexes required by the 0411 design', () => {
    const { queryJson } = createDb();

    const tables = queryJson<NamedRow>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('cv_voo_etapas', 'cv_sigvoos_staging', 'cv_conflitos_integracao') ORDER BY name;",
    ).map(({ name }) => name);
    expect(tables).toEqual(['cv_conflitos_integracao', 'cv_sigvoos_staging', 'cv_voo_etapas']);

    const vooColumns = queryJson<TableColumn>('PRAGMA table_info(cv_voos);').map(({ name }) => name);
    expect(vooColumns).toEqual(
      expect.arrayContaining([
        'sigvoos_flight_report_id',
        'sigvoos_flight_report_id_confident',
        'sigvoos_report_number',
        'sigvoos_flight_number',
        'sigvoos_client_name',
        'sigvoos_contract_name',
        'sigvoos_importado_em',
        'sigvoos_content_hash',
        'origem_importacao',
        'campos_editados_json',
      ]),
    );

    const tripulanteColumns = queryJson<TableColumn>('PRAGMA table_info(cv_voo_tripulantes);').map(({ name }) => name);
    expect(tripulanteColumns).toEqual(
      expect.arrayContaining([
        'etapa_id',
        'sigvoos_staff_id',
        'sigvoos_staff_inscription',
        'funcao_origem',
        'resolucao_funcionario_fonte',
        'sigvoos_content_hash',
      ]),
    );

    const conflictIndexes = queryJson<IndexRow>('PRAGMA index_list(cv_conflitos_integracao);');
    const conflictIndexNames = conflictIndexes.map(({ name }) => name);
    expect(conflictIndexNames).toEqual(
      expect.arrayContaining([
        'idx_cv_conflitos_empresa_entidade_campo_aberto',
        'idx_cv_conflitos_empresa_status_severidade',
        'idx_cv_conflitos_empresa_entidade',
        'idx_cv_conflitos_empresa_deleted',
      ]),
    );

    const vooIndexByName = new Map(
      queryJson<IndexRow>('PRAGMA index_list(cv_voos);').map(({ name, partial }) => [name, partial ?? 0]),
    );
    expect(vooIndexByName.get('idx_cv_voos_empresa_sigvoos_fr_id')).toBe(1);
  });

  it('applies additively on top of manual N1 data and preserves manual defaults', () => {
    const db = createDb({ apply0411: false });
    seedMinimumCatalogs(db.sqlite, 6);
    const vooId = insertManualFlight(db.sqlite, { empresaId: 6, flightId: 601, prefixo: 'ATX-MANUAL-1' });
    insertManualTripulante(db.sqlite, {
      empresaId: 6,
      tripulanteId: 9601,
      vooId,
      funcionarioId: 7601,
      funcao: 'PIC',
    });

    db.sqlite(migration0411Sql);

    const vooRow = db.queryJson<{
      prefixo: string;
      sigvoos_flight_report_id: number | null;
      origem_importacao: string;
    }>("SELECT prefixo, sigvoos_flight_report_id, origem_importacao FROM cv_voos WHERE id = 601;");
    expect(vooRow).toEqual([
      {
        prefixo: 'ATX-MANUAL-1',
        sigvoos_flight_report_id: null,
        origem_importacao: 'MANUAL',
      },
    ]);

    const tripulanteRow = db.queryJson<{ etapa_id: number | null }>(
      'SELECT etapa_id FROM cv_voo_tripulantes WHERE id = 9601;',
    );
    expect(tripulanteRow).toEqual([{ etapa_id: null }]);
  });

  it('allows multiple NULL flight_report ids and blocks duplicated non-null ids per empresa', () => {
    const { sqlite, sqliteResult, queryJson } = createDb();
    seedMinimumCatalogs(sqlite, 6);
    seedMinimumCatalogs(sqlite, 7);

    insertManualFlight(sqlite, { empresaId: 6, flightId: 610, prefixo: 'ATX-NULL-1' });
    insertManualFlight(sqlite, { empresaId: 6, flightId: 611, prefixo: 'ATX-NULL-2' });
    insertManualFlight(sqlite, { empresaId: 6, flightId: 612, prefixo: 'ATX-ID-1' });
    insertManualFlight(sqlite, { empresaId: 6, flightId: 613, prefixo: 'ATX-ID-2' });
    insertManualFlight(sqlite, { empresaId: 7, flightId: 710, prefixo: 'ATX-ID-OTHER' });

    sqlite(`
      UPDATE cv_voos SET sigvoos_flight_report_id = NULL WHERE id IN (610, 611);
      UPDATE cv_voos SET sigvoos_flight_report_id = 700101 WHERE id = 612;
      UPDATE cv_voos SET sigvoos_flight_report_id = 700101 WHERE id = 710;
    `);

    const nullRows = queryJson<{ total: number }>(
      'SELECT COUNT(*) AS total FROM cv_voos WHERE empresa_id = 6 AND sigvoos_flight_report_id IS NULL;',
    );
    expect(nullRows).toEqual([{ total: 3 }]);

    expectSqlFailure(
      sqliteResult("UPDATE cv_voos SET sigvoos_flight_report_id = 700101 WHERE id = 613;"),
      /UNIQUE constraint failed/i,
    );

    const otherEmpresa = queryJson<{ total: number }>(
      'SELECT COUNT(*) AS total FROM cv_voos WHERE sigvoos_flight_report_id = 700101;',
    );
    expect(otherEmpresa).toEqual([{ total: 2 }]);
  });

  it('enforces idempotency for etapas and SIGVOOS tripulantes when external ids are present', () => {
    const { sqlite, sqliteResult, queryJson } = createDb();
    seedMinimumCatalogs(sqlite, 6);
    const vooId = insertManualFlight(sqlite, { empresaId: 6, flightId: 620, prefixo: 'ATX-IDEMP' });

    sqlite(`
      INSERT INTO cv_voo_etapas (
        id, empresa_id, voo_id, numero_etapa, sigvoos_leg_number, origem_icao, destino_icao, origem_dados
      ) VALUES (
        1620, 6, ${vooId}, 1, 1, 'SBRJ', 'SBSP', 'SIGVOOS'
      );

      INSERT INTO cv_voo_etapas (
        id, empresa_id, voo_id, numero_etapa, sigvoos_leg_number, origem_icao, destino_icao, origem_dados
      ) VALUES (
        1621, 6, ${vooId}, 2, NULL, 'SBSP', 'SBRJ', 'MANUAL'
      );

      INSERT INTO cv_voo_etapas (
        id, empresa_id, voo_id, numero_etapa, sigvoos_leg_number, origem_icao, destino_icao, origem_dados
      ) VALUES (
        1622, 6, ${vooId}, 3, NULL, 'SBSP', 'SBRJ', 'MANUAL'
      );
    `);

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO cv_voo_etapas (
          empresa_id, voo_id, numero_etapa, sigvoos_leg_number, origem_icao, destino_icao, origem_dados
        ) VALUES (
          6, ${vooId}, 4, 1, 'SBRJ', 'SBSP', 'SIGVOOS'
        );
      `),
      /UNIQUE constraint failed/i,
    );

    insertManualTripulante(sqlite, {
      empresaId: 6,
      tripulanteId: 9620,
      vooId,
      funcionarioId: 7620,
      funcao: 'PIC',
    });

    sqlite(`
      INSERT INTO cv_voo_tripulantes (
        id, empresa_id, voo_id, funcionario_id, funcao, etapa_id, sigvoos_staff_id, sigvoos_staff_inscription
      ) VALUES (
        9621, 6, ${vooId}, 7621, 'SIC', 1620, 8801, '01234'
      );
    `);

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO cv_voo_tripulantes (
          empresa_id, voo_id, funcionario_id, funcao, etapa_id, sigvoos_staff_id, sigvoos_staff_inscription
        ) VALUES (
          6, ${vooId}, 7622, 'COM', 1620, 8801, '01234'
        );
      `),
      /UNIQUE constraint failed/i,
    );

    const nullableLegRows = queryJson<{ total: number }>(
      'SELECT COUNT(*) AS total FROM cv_voo_etapas WHERE empresa_id = 6 AND sigvoos_leg_number IS NULL;',
    );
    expect(nullableLegRows).toEqual([{ total: 2 }]);
  });

  it('enforces tenant isolation on etapas, staging links and conflicts', () => {
    const { sqlite, sqliteResult } = createDb();
    seedMinimumCatalogs(sqlite, 6);
    seedMinimumCatalogs(sqlite, 7);
    const vooEmpresa6 = insertManualFlight(sqlite, { empresaId: 6, flightId: 630, prefixo: 'ATX-TENANT-A' });
    const vooEmpresa7 = insertManualFlight(sqlite, { empresaId: 7, flightId: 730, prefixo: 'ATX-TENANT-B' });

    sqlite(`
      INSERT INTO cv_voo_etapas (
        id, empresa_id, voo_id, numero_etapa, sigvoos_leg_number, origem_icao, destino_icao, origem_dados
      ) VALUES (
        1630, 6, ${vooEmpresa6}, 1, 1, 'SBRJ', 'SBSP', 'SIGVOOS'
      );

      INSERT INTO cv_voo_tripulantes (
        id, empresa_id, voo_id, funcionario_id, funcao, etapa_id, sigvoos_staff_id
      ) VALUES (
        9630, 6, ${vooEmpresa6}, 7630, 'PIC', 1630, 8801
      );
    `);

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO cv_voo_etapas (
          empresa_id, voo_id, numero_etapa, sigvoos_leg_number, origem_icao, destino_icao, origem_dados
        ) VALUES (
          7, ${vooEmpresa6}, 1, 1, 'SBRJ', 'SBSP', 'SIGVOOS'
        );
      `),
      /empresa_id mismatch/i,
    );

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO cv_voo_tripulantes (
          empresa_id, voo_id, funcionario_id, funcao, etapa_id, sigvoos_staff_id
        ) VALUES (
          7, ${vooEmpresa7}, 7730, 'PIC', 1630, 9901
        );
      `),
      /etapa_id mismatch/i,
    );

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO cv_sigvoos_staging (
          id, empresa_id, sigvoos_flight_report_id, data_operacional, source_window_start, source_window_end,
          payload_hash, import_status, cv_voo_id
        ) VALUES (
          'stage-mismatch', 7, 700101, '2026-06-14', '2026-06-01', '2026-06-14',
          'hash-stage-mismatch', 'PENDING', ${vooEmpresa6}
        );
      `),
      /cv_voo_id mismatch/i,
    );

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO cv_conflitos_integracao (
          empresa_id, entidade_tipo, entidade_id, campo, valor_airtrust, valor_sigvoos
        ) VALUES (
          7, 'voo', ${vooEmpresa6}, 'horario_real_partida', '2026-06-14T10:00:00', '2026-06-14T10:15:00'
        );
      `),
      /entidade_id mismatch/i,
    );
  });

  it('stores raw staff inscription as text, normalizes it deterministically and does not depend on CANAC', () => {
    const { sqlite, queryJson } = createDb();
    seedMinimumCatalogs(sqlite, 6);
    const vooId = insertManualFlight(sqlite, { empresaId: 6, flightId: 640, prefixo: 'ATX-INSCR' });

    const variants = readFixture('sigvoos-apenas-staff-inscription.json') as { variants: SigvoosFixture[] };
    const [firstVariant, secondVariant] = variants.variants;
    expect(firstVariant.staff?.canac).toBeUndefined();
    expect(secondVariant.staff?.canac).toBeUndefined();
    expect(normalizeInscription(firstVariant.staff?.inscription)).toBe('00252');
    expect(normalizeInscription(secondVariant.staff?.inscription)).toBe('00252');

    sqlite(`
      INSERT INTO cv_voo_etapas (
        id, empresa_id, voo_id, numero_etapa, sigvoos_leg_number, origem_icao, destino_icao, origem_dados
      ) VALUES (
        1640, 6, ${vooId}, 1, 1, 'SBJR', 'SBRJ', 'SIGVOOS'
      );

      INSERT INTO cv_voo_tripulantes (
        id, empresa_id, voo_id, funcionario_id, funcao, etapa_id, sigvoos_staff_id,
        sigvoos_staff_inscription, funcao_origem, resolucao_funcionario_fonte
      ) VALUES (
        9640, 6, ${vooId}, 7640, 'PIC', 1640, 8804,
        '${String(firstVariant.staff?.inscription ?? '')}', 'PILOTO', 'MATRICULA'
      );
    `);

    const row = queryJson<{ sigvoos_staff_inscription: string; resolucao_funcionario_fonte: string }>(
      'SELECT sigvoos_staff_inscription, resolucao_funcionario_fonte FROM cv_voo_tripulantes WHERE id = 9640;',
    );
    expect(row).toEqual([{ sigvoos_staff_inscription: '252', resolucao_funcionario_fonte: 'MATRICULA' }]);
  });

  it('derives deterministic staging hashes from sanitized payloads and strips secrets', () => {
    const { sqlite, queryJson } = createDb();
    seedMinimumCatalogs(sqlite, 6);

    const baseFixture = readFixture('sigvoos-com-flight-report-id.json') as SigvoosFixture;
    const payloadWithSecrets = {
      ...baseFixture,
      api_token: 'token-super-secreto',
      nested_secret: 'credencial-1',
      auth: {
        password: 'senha-nao-persistir',
        refresh_token: 'refresh-nao-persistir',
      },
    };
    const payloadWithDifferentSecrets = {
      ...baseFixture,
      api_token: 'token-diferente',
      nested_secret: 'credencial-2',
      auth: {
        password: 'outra-senha',
        refresh_token: 'outro-refresh',
      },
    };

    const payloadHash = hashSanitizedPayload(payloadWithSecrets);
    const payloadHashAgain = hashSanitizedPayload(payloadWithDifferentSecrets);
    expect(payloadHash).toBe(payloadHashAgain);

    const sanitizedJson = JSON.stringify(sanitizeSigvoosPayload(payloadWithSecrets));
    expect(sanitizedJson).not.toMatch(/token-super-secreto|senha-nao-persistir|credencial-1/);
    expect(sanitizedJson).not.toMatch(/api_token|nested_secret|password|refresh_token/);

    sqlite(`
      INSERT INTO cv_sigvoos_staging (
        id, empresa_id, sigvoos_flight_report_id, sigvoos_leg_number, sigvoos_staff_id,
        data_operacional, source_window_start, source_window_end, payload_hash, payload_sanitizado_json, import_status
      ) VALUES (
        'stage-sanitized-1', 6, 700101, 1, 8801,
        '2026-06-14', '2026-06-01', '2026-06-14', '${payloadHash}', '${sanitizedJson.replaceAll("'", "''")}', 'PENDING'
      );
    `);

    const stagingRow = queryJson<{ payload_hash: string; payload_sanitizado_json: string }>(
      "SELECT payload_hash, payload_sanitizado_json FROM cv_sigvoos_staging WHERE id = 'stage-sanitized-1';",
    );
    expect(stagingRow).toEqual([{ payload_hash: payloadHash, payload_sanitizado_json: sanitizedJson }]);
  });

  it('represents unresolved employees as conflicts instead of silent tripulante inserts', () => {
    const { sqlite, sqliteResult, queryJson } = createDb();
    seedMinimumCatalogs(sqlite, 6);
    const vooId = insertManualFlight(sqlite, { empresaId: 6, flightId: 650, prefixo: 'ATX-CONFLICT' });

    sqlite(`
      INSERT INTO cv_sigvoos_staging (
        id, empresa_id, sigvoos_flight_report_id, sigvoos_leg_number, sigvoos_staff_id,
        data_operacional, source_window_start, source_window_end, payload_hash, payload_sanitizado_json, import_status, cv_voo_id, erro_msg
      ) VALUES (
        'stage-conflict-1', 6, NULL, NULL, 9901,
        '2026-06-14', '2026-06-01', '2026-06-14', 'hash-conflict-1', '{"motivo":"funcionario_nao_resolvido"}',
        'CONFLICT', ${vooId}, 'funcionario nao resolvido por staff.id ou staff.inscription'
      );
    `);

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO cv_voo_tripulantes (
          empresa_id, voo_id, funcionario_id, funcao, sigvoos_staff_id, sigvoos_staff_inscription
        ) VALUES (
          6, ${vooId}, NULL, 'PIC', 9901, '09999'
        );
      `),
      /NOT NULL constraint failed: cv_voo_tripulantes.funcionario_id/i,
    );

    sqlite(`
      INSERT INTO cv_conflitos_integracao (
        empresa_id, entidade_tipo, entidade_id, campo, valor_airtrust, valor_sigvoos, staging_id, severidade, status, decisao
      ) VALUES (
        6, 'voo', ${vooId}, 'funcionario_id', NULL, 'staff:9901', 'stage-conflict-1', 'ALTA', 'ABERTO', NULL
      );
    `);

    const conflictRows = queryJson<{ staging_id: string; status: string; campo: string }>(
      "SELECT staging_id, status, campo FROM cv_conflitos_integracao WHERE staging_id = 'stage-conflict-1';",
    );
    expect(conflictRows).toEqual([{ staging_id: 'stage-conflict-1', status: 'ABERTO', campo: 'funcionario_id' }]);
  });

  it('supports a documented local rollback of new tables, indexes and triggers on a disposable database', () => {
    const { sqlite, queryJson } = createDb();
    seedMinimumCatalogs(sqlite, 6);
    insertManualFlight(sqlite, { empresaId: 6, flightId: 660, prefixo: 'ATX-ROLLBACK' });

    sqlite(rollback0411Sql);

    const remaining0411Tables = queryJson<NamedRow>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('cv_voo_etapas', 'cv_sigvoos_staging', 'cv_conflitos_integracao') ORDER BY name;",
    );
    expect(remaining0411Tables).toEqual([]);

    const baseTable = queryJson<NamedRow>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cv_voos';");
    expect(baseTable).toEqual([{ name: 'cv_voos' }]);

    const baseIndexes = queryJson<NamedRow>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_cv_voos_empresa_prefixo_data';",
    );
    expect(baseIndexes).toEqual([{ name: 'idx_cv_voos_empresa_prefixo_data' }]);
  });
});

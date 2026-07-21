import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

// Achado A3 da auditoria do PR #419: a migration 0438 criava um índice
// único sobre (empresa_id, voo_id, numero_etapa) em cv_voo_etapas sem
// verificar antes se já existia alguma duplicidade ativa — o que faria a
// migration falhar de forma pouco clara, potencialmente após outras
// alterações do mesmo arquivo já terem sido aplicadas. Corrigido com uma
// guarda fail-closed logo no início do arquivo (antes de qualquer
// ALTER/CREATE), que aborta explicitamente quando há duplicidade ativa.

const tempDirs: string[] = [];
const testDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(testDir, '../../../migrations');
const migration0410Sql = readFileSync(
  join(migrationsDir, '0410_controle_voos_n1_schema.sql'),
  'utf8',
);
const migration0411Sql = readFileSync(
  join(migrationsDir, '0411_controle_voos_sigvoos_integration_schema.sql'),
  'utf8',
);
const migration0438Sql = readFileSync(
  join(migrationsDir, '0438_controle_voos_rdv_coordenacao_workflow.sql'),
  'utf8',
);

afterAll(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function sqlite(databasePath: string, sql: string) {
  return spawnSync('sqlite3', [databasePath], { input: sql, encoding: 'utf8' });
}

function queryJson<T>(databasePath: string, sql: string): T[] {
  const result = spawnSync('sqlite3', ['-json', databasePath, sql], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
}

/** Schema 0410+0411 aplicado, mas SEM 0438 — para preparar cada cenário antes de tentar aplicar 0438. */
function createPreMigrationDb(): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-0438-preflight-'));
  tempDirs.push(tempDir);
  const databasePath = join(tempDir, 'pre.sqlite');

  let result = sqlite(databasePath, 'PRAGMA foreign_keys = ON;');
  expect(result.status, result.stderr).toBe(0);
  result = sqlite(databasePath, migration0410Sql);
  expect(result.status, result.stderr).toBe(0);
  result = sqlite(databasePath, migration0411Sql);
  expect(result.status, result.stderr).toBe(0);

  result = sqlite(
    databasePath,
    `
      INSERT INTO cv_aeroportos (id, empresa_id, codigo, codigo_icao, nome, tipo, ativo, ordem)
      VALUES (101, 1, 'SBRJ', 'SBRJ', 'Santos Dumont', 'aeroporto', 1, 1),
             (102, 1, 'SBSP', 'SBSP', 'Congonhas', 'aeroporto', 1, 2);
      INSERT INTO cv_tipos_voo (id, empresa_id, codigo, nome, ativo, ordem)
      VALUES (301, 1, 'REG', 'Regular', 1, 1);
      INSERT INTO cv_naturezas_voo (id, empresa_id, codigo, nome, ativo, ordem)
      VALUES (401, 1, 'PAX', 'Passageiro', 1, 1);
      INSERT INTO cv_voos (
        id, empresa_id, prefixo, data_programacao, origem_id, destino_id,
        tipo_voo_id, natureza_voo_id, horario_previsto_partida, horario_previsto_chegada, status
      ) VALUES (601, 1, 'ATX-1001', '2026-06-14', 101, 102, 301, 401, '2026-06-14T10:00:00Z', '2026-06-14T11:00:00Z', 'planejado');
    `,
  );
  expect(result.status, result.stderr).toBe(0);

  return databasePath;
}

describe('0438 — preflight guard do índice único idx_cv_voo_etapas_empresa_voo_numero_unique', () => {
  it('duas etapas ATIVAS com o mesmo numero_etapa: migration aborta (fail-closed) antes de criar o índice', () => {
    const databasePath = createPreMigrationDb();
    const seed = sqlite(
      databasePath,
      `
        INSERT INTO cv_voo_etapas (empresa_id, voo_id, numero_etapa, origem_icao, destino_icao)
        VALUES (1, 601, 1, 'SBRJ', 'SBSP'),
               (1, 601, 1, 'SBGL', 'SBSP');
      `,
    );
    expect(seed.status, seed.stderr).toBe(0);

    const applied = sqlite(databasePath, migration0438Sql);
    expect(applied.status).not.toBe(0);
    expect(applied.stderr).toMatch(/CHECK constraint failed: ok = 1/);

    const index = queryJson<{ name: string }>(
      databasePath,
      `SELECT name FROM sqlite_master WHERE name = 'idx_cv_voo_etapas_empresa_voo_numero_unique'`,
    );
    expect(index.length).toBe(0);
  });

  it('uma etapa ativa e uma soft-deletada com o mesmo numero_etapa: migration aplica normalmente', () => {
    const databasePath = createPreMigrationDb();
    const seed = sqlite(
      databasePath,
      `
        INSERT INTO cv_voo_etapas (empresa_id, voo_id, numero_etapa, origem_icao, destino_icao, deleted_at)
        VALUES (1, 601, 1, 'SBRJ', 'SBSP', datetime('now'));
        INSERT INTO cv_voo_etapas (empresa_id, voo_id, numero_etapa, origem_icao, destino_icao)
        VALUES (1, 601, 1, 'SBGL', 'SBSP');
      `,
    );
    expect(seed.status, seed.stderr).toBe(0);

    const applied = sqlite(databasePath, migration0438Sql);
    expect(applied.status, applied.stderr).toBe(0);

    const index = queryJson<{ name: string }>(
      databasePath,
      `SELECT name FROM sqlite_master WHERE name = 'idx_cv_voo_etapas_empresa_voo_numero_unique'`,
    );
    expect(index.length).toBe(1);
  });

  it('sem nenhuma duplicidade: migration aplica normalmente e cria o índice único', () => {
    const databasePath = createPreMigrationDb();
    const seed = sqlite(
      databasePath,
      `
        INSERT INTO cv_voo_etapas (empresa_id, voo_id, numero_etapa, origem_icao, destino_icao)
        VALUES (1, 601, 1, 'SBRJ', 'SBSP');
      `,
    );
    expect(seed.status, seed.stderr).toBe(0);

    const applied = sqlite(databasePath, migration0438Sql);
    expect(applied.status, applied.stderr).toBe(0);

    const index = queryJson<{ name: string }>(
      databasePath,
      `SELECT name FROM sqlite_master WHERE name = 'idx_cv_voo_etapas_empresa_voo_numero_unique'`,
    );
    expect(index.length).toBe(1);

    const workflowStatusColumn = queryJson<{ name: string }>(
      databasePath,
      `SELECT name FROM pragma_table_info('cv_rdv_operacional') WHERE name = 'workflow_status'`,
    );
    expect(workflowStatusColumn.length).toBe(1);
  });

  it('duplicidade nao e apagada ou alterada automaticamente pela guarda', () => {
    const databasePath = createPreMigrationDb();
    const seed = sqlite(
      databasePath,
      `
        INSERT INTO cv_voo_etapas (empresa_id, voo_id, numero_etapa, origem_icao, destino_icao)
        VALUES (1, 601, 1, 'SBRJ', 'SBSP'),
               (1, 601, 1, 'SBGL', 'SBSP');
      `,
    );
    expect(seed.status, seed.stderr).toBe(0);

    sqlite(databasePath, migration0438Sql);

    const etapas = queryJson<{ id: number; numero_etapa: number; deleted_at: string | null }>(
      databasePath,
      `SELECT id, numero_etapa, deleted_at FROM cv_voo_etapas WHERE voo_id = 601 ORDER BY id`,
    );
    expect(etapas.length).toBe(2);
    expect(etapas.every((e) => e.numero_etapa === 1 && e.deleted_at === null)).toBe(true);
  });
});

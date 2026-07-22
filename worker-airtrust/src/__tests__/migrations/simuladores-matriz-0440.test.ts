import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const MIGRATION_PATH = join(ROOT, 'migrations/0440_simuladores_matriz_versionada_metadata.sql');
const migration = readFileSync(MIGRATION_PATH, 'utf8');

function dbPath(name: string) {
  return join(
    tmpdir(),
    `airtrust-0440-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
  );
}

function run(db: string, sql: string) {
  return spawnSync('sqlite3', ['-bail', db], {
    input: `PRAGMA foreign_keys=ON;\nPRAGMA recursive_triggers=OFF;\n${sql}`,
    encoding: 'utf8',
  });
}

function runMigration(db: string) {
  return spawnSync('sqlite3', ['-bail', db], {
    input: `PRAGMA foreign_keys=ON;\nPRAGMA recursive_triggers=OFF;\nBEGIN IMMEDIATE;\n${migration}\nCOMMIT;`,
    encoding: 'utf8',
  });
}

function queryJson<T = unknown>(db: string, sql: string): T {
  const result = spawnSync('sqlite3', ['-json', db], {
    input: `PRAGMA foreign_keys=ON;\n${sql}`,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  const trimmed = result.stdout.trim();
  return (trimmed ? JSON.parse(trimmed) : []) as T;
}

function queryValue(db: string, sql: string): string {
  const result = spawnSync('sqlite3', ['-bail', db], {
    input: `PRAGMA foreign_keys=ON;\n${sql}`,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return result.stdout.trim();
}

const PRE_0440_SCHEMA = `
PRAGMA foreign_keys=ON;
CREATE TABLE empresas(id INTEGER PRIMARY KEY);
CREATE TABLE modelos_sessao(
  id INTEGER PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL DEFAULT 'fixture',
  empresa_id INTEGER NOT NULL,
  created_at TEXT,
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT
);
CREATE TABLE manobras(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, deleted_at TEXT);
CREATE TABLE modelos_sessao_manobras(
  id INTEGER PRIMARY KEY,
  modelo_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  ordem INTEGER NOT NULL,
  obrigatoria INTEGER,
  observacoes TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  tripulante TEXT NOT NULL DEFAULT 'AB',
  UNIQUE(modelo_id, manobra_id),
  FOREIGN KEY(modelo_id) REFERENCES modelos_sessao(id),
  FOREIGN KEY(manobra_id) REFERENCES manobras(id)
);
CREATE INDEX idx_modelos_sessao_manobras_modelo_id ON modelos_sessao_manobras(modelo_id);
CREATE INDEX idx_modelos_sessao_manobras_manobra_id ON modelos_sessao_manobras(manobra_id);
CREATE INDEX idx_modelos_sessao_manobras_ordem ON modelos_sessao_manobras(modelo_id, ordem);
CREATE TRIGGER trigger_modelos_sessao_manobras_updated_at
AFTER UPDATE ON modelos_sessao_manobras FOR EACH ROW BEGIN
  UPDATE modelos_sessao_manobras SET updated_at = datetime('now') WHERE id = NEW.id;
END;
CREATE TABLE simulador_agendamentos(
  id INTEGER PRIMARY KEY,
  template_id INTEGER,
  empresa_id INTEGER REFERENCES empresas(id),
  FOREIGN KEY(template_id) REFERENCES modelos_sessao(id)
);
CREATE TABLE fichas_sessao(
  id INTEGER PRIMARY KEY,
  agendamento_slot_id INTEGER,
  modelo_id INTEGER REFERENCES modelos_sessao(id),
  empresa_id INTEGER REFERENCES empresas(id)
);
CREATE TABLE simulador_atribuicoes_curriculares(
  id INTEGER PRIMARY KEY,
  modelo_sessao_id INTEGER REFERENCES modelos_sessao(id),
  empresa_id INTEGER REFERENCES empresas(id)
);
`;

function seedHealthy(db: string) {
  const sql = `${PRE_0440_SCHEMA}
INSERT INTO empresas VALUES(7),(8);
INSERT INTO modelos_sessao(id,codigo,empresa_id,created_at,deleted_at,created_by,updated_by) VALUES
  (10,'OLD-A',7,'2020-01-01',NULL,'author-a','editor-a'),
  (20,'OTHER',8,'2020-01-01',NULL,'author-b','editor-b'),
  (30,'DELETED',7,'2019-01-01','2020-01-01','author-c','editor-c');
INSERT INTO manobras VALUES(100,7,NULL),(101,7,NULL),(102,7,NULL),(103,7,NULL),(200,8,NULL);
INSERT INTO modelos_sessao_manobras
  (id,modelo_id,manobra_id,ordem,obrigatoria,observacoes,created_at,updated_at,deleted_at,created_by,updated_by,tripulante)
VALUES
  (1,10,100,1,1,'obs-1','2019-06-01','2019-06-02',NULL,'ca','ua','AB'),
  (2,10,101,2,1,'obs-2','2019-06-01','2019-06-02',NULL,'ca','ua','A'),
  (22,10,102,22,1,'obs-22','2019-06-01','2019-06-02',NULL,'ca','ua','B'),
  (23,10,103,5,1,'soft','2019-06-01','2019-06-02','2026-01-01','ca','ua','AB'),
  (24,20,200,1,1,'other','2019-06-01','2019-06-02',NULL,'cb','ub','AB');
INSERT INTO simulador_agendamentos VALUES(1,10,7);
INSERT INTO fichas_sessao VALUES(1,1,10,7);
INSERT INTO simulador_atribuicoes_curriculares VALUES(1,10,7);`;
  const seeded = run(db, sql);
  expect(seeded.status, seeded.stderr || seeded.stdout).toBe(0);
}

function assertNoPartial0440(
  db: string,
  options?: { allowPreexistingTemp?: boolean; allowPreexistingVersionamento?: boolean },
) {
  const excluded = new Set<string>();
  if (options?.allowPreexistingTemp) excluded.add('modelos_sessao_manobras_0440');
  if (options?.allowPreexistingVersionamento) excluded.add('modelos_sessao_versionamento');
  const tables = queryJson<Array<{ name: string }>>(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('modelos_sessao_versionamento','modelos_sessao_manobras_contexto','simuladores_matriz_imports','simuladores_matriz_import_changes','modelos_sessao_manobras_0440') ORDER BY name",
  ).filter((row) => !excluded.has(row.name));
  expect(tables).toEqual([]);
  const indexes = queryJson<Array<{ name: string }>>(
    db,
    "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('uq_modelos_sessao_manobras_ordem_ativa','uq_modelo_canonico_corrente_tenant')",
  );
  expect(indexes).toEqual([]);
}

function expectMigrationFailure(
  db: string,
  messagePart: string,
  options?: { allowPreexistingTemp?: boolean; allowPreexistingVersionamento?: boolean },
) {
  const applied = runMigration(db);
  expect(applied.status).not.toBe(0);
  expect(`${applied.stderr}\n${applied.stdout}`).toContain(messagePart);
  assertNoPartial0440(db, options);
  const original = queryJson<Array<{ id: number }>>(
    db,
    'SELECT id FROM modelos_sessao_manobras ORDER BY id',
  );
  expect(original.length).toBeGreaterThan(0);
}

describe('migration 0440 simulator matrix versioning', () => {
  it('preserves historical ids/FKs and enforces published immutability with foreign_keys=1', () => {
    const db = dbPath('positive');
    try {
      seedHealthy(db);
      const fkBefore = queryJson<Array<{ foreign_keys: number }>>(db, 'PRAGMA foreign_keys');
      expect(fkBefore[0]?.foreign_keys).toBe(1);

      const applied = runMigration(db);
      expect(applied.status, applied.stderr || applied.stdout).toBe(0);

      const fkAfter = queryJson<Array<{ foreign_keys: number }>>(db, 'PRAGMA foreign_keys');
      expect(fkAfter[0]?.foreign_keys).toBe(1);
      expect(queryValue(db, 'PRAGMA foreign_key_check')).toBe('');

      const links = queryJson<
        Array<{
          id: number;
          ordem: number;
          deleted_at: string | null;
          created_at: string;
          created_by: string;
          observacoes: string;
        }>
      >(
        db,
        'SELECT id,ordem,deleted_at,created_at,created_by,observacoes FROM modelos_sessao_manobras ORDER BY id',
      );
      expect(links.map((row) => row.id)).toEqual([1, 2, 22, 23, 24]);
      expect(links.find((row) => row.id === 22)?.ordem).toBe(22);
      expect(
        links
          .filter((row) => row.ordem >= 1 && row.ordem <= 22)
          .map((row) => row.ordem)
          .sort((a, b) => a - b),
      ).toEqual([1, 1, 2, 5, 22]);
      expect(links.find((row) => row.id === 23)?.deleted_at).toBe('2026-01-01');
      expect(links.find((row) => row.id === 1)?.created_at).toBe('2019-06-01');
      expect(links.find((row) => row.id === 1)?.created_by).toBe('ca');
      expect(links.find((row) => row.id === 22)?.observacoes).toBe('obs-22');

      const seq = queryJson<Array<{ name: string; seq: number }>>(
        db,
        "SELECT name, seq FROM sqlite_sequence WHERE name='modelos_sessao_manobras'",
      );
      expect(seq[0]?.seq).toBeGreaterThanOrEqual(24);

      expect(queryJson(db, 'SELECT template_id FROM simulador_agendamentos WHERE id=1')).toEqual([
        { template_id: 10 },
      ]);
      expect(queryJson(db, 'SELECT modelo_id FROM fichas_sessao WHERE id=1')).toEqual([
        { modelo_id: 10 },
      ]);
      expect(
        queryJson(db, 'SELECT modelo_sessao_id FROM simulador_atribuicoes_curriculares WHERE id=1'),
      ).toEqual([{ modelo_sessao_id: 10 }]);

      const versions = queryJson<
        Array<{
          modelo_id: number;
          is_current: number;
          versao_matriz: string;
          efetivo_em: string;
          efetivo_ate: string | null;
        }>
      >(
        db,
        'SELECT modelo_id,is_current,versao_matriz,efetivo_em,efetivo_ate FROM modelos_sessao_versionamento ORDER BY modelo_id',
      );
      expect(versions.find((row) => row.modelo_id === 10)).toMatchObject({
        is_current: 1,
        versao_matriz: 'LEGACY',
        efetivo_em: '2020-01-01',
        efetivo_ate: null,
      });
      expect(versions.find((row) => row.modelo_id === 30)).toMatchObject({
        is_current: 0,
        versao_matriz: 'LEGACY',
        efetivo_em: '2019-01-01',
        efetivo_ate: '2020-01-01',
      });

      expect(
        run(
          db,
          "INSERT INTO modelos_sessao_manobras(modelo_id,manobra_id,ordem,tripulante) VALUES(10,100,2,'AB')",
        ).status,
      ).not.toBe(0);
      expect(
        run(
          db,
          "INSERT INTO modelos_sessao_manobras(modelo_id,manobra_id,ordem,tripulante) VALUES(10,100,3,'AB')",
        ).status,
      ).toBe(0);
      expect(
        run(
          db,
          "INSERT INTO modelos_sessao_manobras(modelo_id,manobra_id,ordem,tripulante) VALUES(10,200,4,'AB')",
        ).status,
      ).not.toBe(0);

      const linkId = queryJson<Array<{ id: number }>>(
        db,
        'SELECT id FROM modelos_sessao_manobras WHERE modelo_id=10 AND ordem=3',
      )[0].id;
      expect(
        run(
          db,
          `INSERT INTO modelos_sessao_manobras_contexto(modelo_manobra_id,empresa_id,metadados_json) VALUES(${linkId},7,'{"fase":"prep"}')`,
        ).status,
      ).toBe(0);

      expect(
        run(
          db,
          "UPDATE modelos_sessao_versionamento SET is_current=0, efetivo_ate='2099-01-02' WHERE modelo_id=10",
        ).status,
      ).toBe(0);
      expect(
        run(
          db,
          'UPDATE modelos_sessao_versionamento SET is_current=1, efetivo_ate=NULL WHERE modelo_id=10',
        ).status,
      ).not.toBe(0);

      expect(
        run(
          db,
          `INSERT INTO modelos_sessao(id,codigo,empresa_id,created_at) VALUES(11,'OLD-A@M2026-V2',7,'2026-02-01');
INSERT INTO modelos_sessao_manobras(id,modelo_id,manobra_id,ordem,tripulante) VALUES(50,11,100,1,'AB'),(51,11,101,2,'AB');
INSERT INTO modelos_sessao_manobras_contexto(modelo_manobra_id,empresa_id,metadados_json) VALUES(50,7,'{"fase":"decolagem"}');
INSERT INTO modelos_sessao_versionamento(modelo_id,empresa_id,codigo_canonico,versao_numero,versao_matriz,is_current,modelo_anterior_id,efetivo_em,efetivo_ate)
VALUES(11,7,'OLD-A',2,'M2026.07',1,10,'2026-02-01',NULL);`,
        ).status,
      ).toBe(0);

      expect(
        run(
          db,
          "INSERT INTO modelos_sessao_manobras(modelo_id,manobra_id,ordem,tripulante) VALUES(11,102,3,'AB')",
        ).status,
      ).not.toBe(0);
      expect(run(db, 'UPDATE modelos_sessao_manobras SET ordem=9 WHERE id=50').status).not.toBe(0);
      expect(
        run(db, "UPDATE modelos_sessao_manobras SET deleted_at='2026-03-01' WHERE id=50").status,
      ).not.toBe(0);
      expect(run(db, 'DELETE FROM modelos_sessao_manobras WHERE id=50').status).not.toBe(0);
      expect(
        run(
          db,
          `INSERT INTO modelos_sessao_manobras_contexto(modelo_manobra_id,empresa_id,metadados_json) VALUES(51,7,'{"fase":"late"}')`,
        ).status,
      ).not.toBe(0);
      expect(
        run(
          db,
          `UPDATE modelos_sessao_manobras_contexto SET metadados_json='{"fase":"x"}' WHERE modelo_manobra_id=50`,
        ).status,
      ).not.toBe(0);
      expect(
        run(db, 'DELETE FROM modelos_sessao_manobras_contexto WHERE modelo_manobra_id=50').status,
      ).not.toBe(0);

      const importSql = `INSERT INTO simuladores_matriz_imports(uuid,empresa_id,versao_matriz,schema_version,status,plan_sha256,source_hashes_json,base_fingerprint,expected_counts_json)
VALUES('import-1',7,'M1',2,'DRY_RUN','${'a'.repeat(64)}','{}','${'b'.repeat(64)}','{"modelos":51}')`;
      expect(run(db, importSql).status).toBe(0);
      expect(
        run(db, "UPDATE simuladores_matriz_imports SET status='APPLIED' WHERE uuid='import-1'")
          .status,
      ).not.toBe(0);
      expect(
        run(db, "UPDATE simuladores_matriz_imports SET status='APPLYING' WHERE uuid='import-1'")
          .status,
      ).toBe(0);
      expect(
        run(
          db,
          "UPDATE simuladores_matriz_imports SET status='APPLIED', applied_at='2026-01-02', applied_counts_json='{\"modelos\":51}' WHERE uuid='import-1'",
        ).status,
      ).toBe(0);
      expect(
        run(
          db,
          `UPDATE simuladores_matriz_imports SET plan_sha256='${'c'.repeat(64)}' WHERE uuid='import-1'`,
        ).status,
      ).not.toBe(0);
      expect(
        run(
          db,
          "UPDATE simuladores_matriz_imports SET applied_counts_json='{\"modelos\":0}' WHERE uuid='import-1'",
        ).status,
      ).not.toBe(0);
      expect(
        run(
          db,
          "UPDATE simuladores_matriz_imports SET updated_at='1999-01-01' WHERE uuid='import-1'",
        ).status,
      ).not.toBe(0);
      expect(
        run(
          db,
          "INSERT INTO simuladores_matriz_import_changes(import_id,entidade,entity_id,operacao,after_json) VALUES(1,'modelos_sessao',11,'COMPENSATE','{}')",
        ).status,
      ).toBe(0);
      expect(
        run(
          db,
          "INSERT INTO simuladores_matriz_import_changes(import_id,entidade,entity_id,operacao,after_json) VALUES(1,'modelos_sessao',11,'REACTIVATE','{}')",
        ).status,
      ).not.toBe(0);
    } finally {
      rmSync(db, { force: true });
    }
  });

  it('fails preflight for orphan modelo before rebuild', () => {
    const db = dbPath('orphan-modelo');
    try {
      expect(
        run(
          db,
          `${PRE_0440_SCHEMA}
INSERT INTO empresas VALUES(7);
INSERT INTO manobras VALUES(100,7,NULL);
PRAGMA foreign_keys=OFF;
INSERT INTO modelos_sessao_manobras VALUES(1,999,100,1,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB');
PRAGMA foreign_keys=ON;`,
        ).status,
      ).toBe(0);
      expectMigrationFailure(db, 'modelo órfão');
    } finally {
      rmSync(db, { force: true });
    }
  });

  it('fails preflight for orphan manobra before rebuild', () => {
    const db = dbPath('orphan-manobra');
    try {
      expect(
        run(
          db,
          `${PRE_0440_SCHEMA}
INSERT INTO empresas VALUES(7);
INSERT INTO modelos_sessao(id,codigo,empresa_id) VALUES(10,'OLD-A',7);
PRAGMA foreign_keys=OFF;
INSERT INTO modelos_sessao_manobras VALUES(1,10,999,1,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB');
PRAGMA foreign_keys=ON;`,
        ).status,
      ).toBe(0);
      expectMigrationFailure(db, 'manobra órfã');
    } finally {
      rmSync(db, { force: true });
    }
  });

  it('fails preflight for cross-tenant vínculo', () => {
    const db = dbPath('cross-tenant');
    try {
      expect(
        run(
          db,
          `${PRE_0440_SCHEMA}
INSERT INTO empresas VALUES(7),(8);
INSERT INTO modelos_sessao(id,codigo,empresa_id) VALUES(10,'OLD-A',7);
INSERT INTO manobras VALUES(200,8,NULL);
INSERT INTO modelos_sessao_manobras VALUES(1,10,200,1,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB');`,
        ).status,
      ).toBe(0);
      expectMigrationFailure(db, 'cross-tenant');
    } finally {
      rmSync(db, { force: true });
    }
  });

  it('fails preflight for duplicated active order', () => {
    const db = dbPath('dup-order');
    try {
      expect(
        run(
          db,
          `${PRE_0440_SCHEMA}
INSERT INTO empresas VALUES(7);
INSERT INTO modelos_sessao(id,codigo,empresa_id) VALUES(10,'OLD-A',7);
INSERT INTO manobras VALUES(100,7,NULL),(101,7,NULL);
INSERT INTO modelos_sessao_manobras VALUES
  (1,10,100,1,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB'),
  (2,10,101,1,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB');`,
        ).status,
      ).toBe(0);
      expectMigrationFailure(db, 'ordem ativa duplicada');
    } finally {
      rmSync(db, { force: true });
    }
  });

  it('fails preflight for null order', () => {
    const db = dbPath('null-order');
    try {
      const seeded = run(
        db,
        `
PRAGMA foreign_keys=ON;
CREATE TABLE empresas(id INTEGER PRIMARY KEY);
CREATE TABLE modelos_sessao(id INTEGER PRIMARY KEY, codigo TEXT NOT NULL UNIQUE, nome TEXT NOT NULL DEFAULT 'fixture', empresa_id INTEGER NOT NULL, created_at TEXT, deleted_at TEXT);
CREATE TABLE manobras(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, deleted_at TEXT);
CREATE TABLE modelos_sessao_manobras(
  id INTEGER PRIMARY KEY,
  modelo_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  ordem INTEGER,
  obrigatoria INTEGER,
  observacoes TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  tripulante TEXT NOT NULL DEFAULT 'AB',
  UNIQUE(modelo_id, manobra_id),
  FOREIGN KEY(modelo_id) REFERENCES modelos_sessao(id),
  FOREIGN KEY(manobra_id) REFERENCES manobras(id)
);
CREATE INDEX idx_modelos_sessao_manobras_modelo_id ON modelos_sessao_manobras(modelo_id);
CREATE INDEX idx_modelos_sessao_manobras_manobra_id ON modelos_sessao_manobras(manobra_id);
CREATE INDEX idx_modelos_sessao_manobras_ordem ON modelos_sessao_manobras(modelo_id, ordem);
CREATE TRIGGER trigger_modelos_sessao_manobras_updated_at
AFTER UPDATE ON modelos_sessao_manobras FOR EACH ROW BEGIN
  UPDATE modelos_sessao_manobras SET updated_at = datetime('now') WHERE id = NEW.id;
END;
INSERT INTO empresas VALUES(7);
INSERT INTO modelos_sessao(id,codigo,empresa_id) VALUES(10,'OLD-A',7);
INSERT INTO manobras VALUES(100,7,NULL);
INSERT INTO modelos_sessao_manobras(id,modelo_id,manobra_id,ordem,tripulante) VALUES(1,10,100,NULL,'AB');
`,
      );
      expect(seeded.status, seeded.stderr || seeded.stdout).toBe(0);
      expectMigrationFailure(db, 'ordem nula');
    } finally {
      rmSync(db, { force: true });
    }
  });

  it('fails preflight for invalid tripulante', () => {
    const db = dbPath('bad-crew');
    try {
      expect(
        run(
          db,
          `${PRE_0440_SCHEMA}
INSERT INTO empresas VALUES(7);
INSERT INTO modelos_sessao(id,codigo,empresa_id) VALUES(10,'OLD-A',7);
INSERT INTO manobras VALUES(100,7,NULL);
INSERT INTO modelos_sessao_manobras VALUES(1,10,100,1,1,NULL,NULL,NULL,NULL,NULL,NULL,'Z');`,
        ).status,
      ).toBe(0);
      expectMigrationFailure(db, 'tripulante inválido');
    } finally {
      rmSync(db, { force: true });
    }
  });

  it('fails preflight for unknown legacy trigger', () => {
    const db = dbPath('unknown-trigger');
    try {
      seedHealthy(db);
      expect(
        run(
          db,
          `CREATE TRIGGER trg_unexpected BEFORE INSERT ON modelos_sessao_manobras BEGIN SELECT 1; END;`,
        ).status,
      ).toBe(0);
      expectMigrationFailure(db, 'trigger legado não inventariado');
    } finally {
      rmSync(db, { force: true });
    }
  });

  it('fails preflight for unknown legacy index', () => {
    const db = dbPath('unknown-index');
    try {
      seedHealthy(db);
      expect(
        run(db, 'CREATE INDEX idx_unexpected_legacy ON modelos_sessao_manobras(observacoes);')
          .status,
      ).toBe(0);
      expectMigrationFailure(db, 'índice legado não inventariado');
    } finally {
      rmSync(db, { force: true });
    }
  });

  it('fails preflight for child FK referencing vínculos', () => {
    const db = dbPath('child-fk');
    try {
      seedHealthy(db);
      expect(
        run(
          db,
          `CREATE TABLE child_vinculo(id INTEGER PRIMARY KEY, modelo_manobra_id INTEGER REFERENCES modelos_sessao_manobras(id));`,
        ).status,
      ).toBe(0);
      expectMigrationFailure(db, 'FK filha para vínculos');
    } finally {
      rmSync(db, { force: true });
    }
  });

  it('fails preflight when destination temp table already exists', () => {
    const db = dbPath('temp-exists');
    try {
      seedHealthy(db);
      expect(
        run(db, `CREATE TABLE modelos_sessao_manobras_0440(id INTEGER PRIMARY KEY);`).status,
      ).toBe(0);
      expectMigrationFailure(db, 'tabela temporária de destino já existe', {
        allowPreexistingTemp: true,
      });
    } finally {
      rmSync(db, { force: true });
    }
  });

  it('fails preflight on partial previous execution', () => {
    const db = dbPath('partial');
    try {
      seedHealthy(db);
      expect(
        run(
          db,
          `CREATE TABLE modelos_sessao_versionamento(
            modelo_id INTEGER PRIMARY KEY,
            empresa_id INTEGER NOT NULL,
            codigo_canonico TEXT NOT NULL,
            versao_numero INTEGER NOT NULL,
            versao_matriz TEXT NOT NULL,
            is_current INTEGER NOT NULL,
            efetivo_em TEXT NOT NULL,
            efetivo_ate TEXT
          );`,
        ).status,
      ).toBe(0);
      expectMigrationFailure(db, 'execução parcial anterior', {
        allowPreexistingVersionamento: true,
      });
    } finally {
      rmSync(db, { force: true });
    }
  });

  it('fails incompatible repeated migration after successful apply', () => {
    const db = dbPath('repeat');
    try {
      seedHealthy(db);
      expect(runMigration(db).status).toBe(0);
      const before = queryJson(db, 'SELECT id,ordem FROM modelos_sessao_manobras ORDER BY id');
      const applied = runMigration(db);
      expect(applied.status).not.toBe(0);
      expect(`${applied.stderr}\n${applied.stdout}`).toContain(
        'estado incompatível com reexecução',
      );
      expect(queryJson(db, 'SELECT id,ordem FROM modelos_sessao_manobras ORDER BY id')).toEqual(
        before,
      );
      expect(
        queryJson(db, "SELECT name FROM sqlite_master WHERE name='modelos_sessao_versionamento'"),
      ).toEqual([{ name: 'modelos_sessao_versionamento' }]);
    } finally {
      rmSync(db, { force: true });
    }
  });

  it('also applies through local D1/wrangler file runner when available', () => {
    const wrangler = spawnSync('npx', ['--no-install', 'wrangler', '--version'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    if (wrangler.status !== 0) {
      expect(wrangler.status).not.toBe(0);
      return;
    }

    const dir = mkdtempSync(join(tmpdir(), 'airtrust-0440-d1-'));
    const configPath = join(dir, 'wrangler.toml');
    writeFileSync(
      configPath,
      `name = "airtrust-0440-local-proof"
main = "index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "airtrust-0440-local-proof"
database_id = "00000000-0000-0000-0000-000000000440"
`,
    );
    writeFileSync(
      join(dir, 'index.js'),
      'export default { fetch(){ return new Response("ok"); } };',
    );
    writeFileSync(
      join(dir, 'seed.sql'),
      PRE_0440_SCHEMA +
        `
INSERT INTO empresas VALUES(7);
INSERT INTO modelos_sessao(id,codigo,empresa_id,created_at) VALUES(10,'OLD-A',7,'2020-01-01');
INSERT INTO manobras VALUES(100,7,NULL),(101,7,NULL);
INSERT INTO modelos_sessao_manobras VALUES(1,10,100,1,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB'),(22,10,101,22,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB');
`,
    );

    try {
      const seed = spawnSync(
        'npx',
        [
          '--no-install',
          'wrangler',
          'd1',
          'execute',
          'airtrust-0440-local-proof',
          '--local',
          '--config',
          configPath,
          '--file',
          join(dir, 'seed.sql'),
        ],
        { cwd: ROOT, encoding: 'utf8' },
      );
      expect(seed.status, seed.stderr || seed.stdout).toBe(0);

      // D1 local rejects BEGIN/COMMIT; apply the migration body via wrangler --local.
      const d1MigrationPath = join(dir, '0440.d1.sql');
      writeFileSync(d1MigrationPath, migration);
      const applied = spawnSync(
        'npx',
        [
          '--no-install',
          'wrangler',
          'd1',
          'execute',
          'airtrust-0440-local-proof',
          '--local',
          '--config',
          configPath,
          '--file',
          d1MigrationPath,
        ],
        { cwd: ROOT, encoding: 'utf8' },
      );
      expect(applied.status, applied.stderr || applied.stdout).toBe(0);

      const probe = spawnSync(
        'npx',
        [
          '--no-install',
          'wrangler',
          'd1',
          'execute',
          'airtrust-0440-local-proof',
          '--local',
          '--config',
          configPath,
          '--json',
          '--command',
          "SELECT id,ordem FROM modelos_sessao_manobras WHERE id=22; SELECT name FROM sqlite_master WHERE name='modelos_sessao_versionamento';",
        ],
        { cwd: ROOT, encoding: 'utf8' },
      );
      expect(probe.status, probe.stderr || probe.stdout).toBe(0);
      const payload = JSON.parse(probe.stdout);
      const flat = payload.flatMap((block: { results?: unknown[] }) => block.results || []);
      expect(
        flat.some((row: { id?: number; ordem?: number }) => row.id === 22 && row.ordem === 22),
      ).toBe(true);
      expect(
        flat.some((row: { name?: string }) => row.name === 'modelos_sessao_versionamento'),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

import { readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(process.cwd(), 'migrations/0440_simuladores_matriz_versionada_metadata.sql'), 'utf8');

function dbPath(name: string) { return join(tmpdir(), `airtrust-0440-${name}-${Date.now()}-${Math.random()}.sqlite`); }
function run(db: string, sql: string) {
  return spawnSync('sqlite3', ['-bail', db], { input: `PRAGMA foreign_keys=ON;\n${sql}`, encoding: 'utf8' });
}
function query(db: string, sql: string) {
  return spawnSync('sqlite3', ['-json', db], { input: `PRAGMA foreign_keys=ON;\n${sql}`, encoding: 'utf8' });
}
const schema = `
PRAGMA foreign_keys=ON;
CREATE TABLE empresas(id INTEGER PRIMARY KEY);
CREATE TABLE modelos_sessao(id INTEGER PRIMARY KEY, codigo TEXT NOT NULL UNIQUE, nome TEXT NOT NULL DEFAULT 'fixture', empresa_id INTEGER NOT NULL, created_at TEXT, deleted_at TEXT);
CREATE TABLE manobras(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL);
CREATE TABLE modelos_sessao_manobras(id INTEGER PRIMARY KEY, modelo_id INTEGER NOT NULL, manobra_id INTEGER NOT NULL, ordem INTEGER NOT NULL, obrigatoria INTEGER, observacoes TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT, created_by TEXT, updated_by TEXT, tripulante TEXT NOT NULL DEFAULT 'AB', UNIQUE(modelo_id,manobra_id), FOREIGN KEY(modelo_id) REFERENCES modelos_sessao(id), FOREIGN KEY(manobra_id) REFERENCES manobras(id));
CREATE INDEX idx_modelos_sessao_manobras_modelo_id ON modelos_sessao_manobras(modelo_id);
CREATE INDEX idx_modelos_sessao_manobras_manobra_id ON modelos_sessao_manobras(manobra_id);
CREATE INDEX idx_modelos_sessao_manobras_ordem ON modelos_sessao_manobras(modelo_id, ordem);
CREATE TABLE simulador_agendamentos(id INTEGER PRIMARY KEY, template_id INTEGER, empresa_id INTEGER REFERENCES empresas(id));
CREATE TABLE fichas_sessao(id INTEGER PRIMARY KEY, agendamento_slot_id INTEGER);
CREATE TABLE simulador_atribuicoes_curriculares(id INTEGER PRIMARY KEY, modelo_sessao_id INTEGER REFERENCES modelos_sessao(id), empresa_id INTEGER REFERENCES empresas(id));
`;

describe('migration 0440 simulator matrix versioning', () => {
  it('preserves historical ids and position 22 while enforcing active order uniqueness', () => {
    const db = dbPath('positive');
    try {
      const setup = run(db, `${schema}
INSERT INTO empresas VALUES(7),(8);
INSERT INTO modelos_sessao(id,codigo,empresa_id,created_at,deleted_at) VALUES(10,'OLD-A',7,'2020-01-01',NULL),(20,'OTHER',8,'2020-01-01',NULL),(30,'DELETED',7,'2019-01-01','2020-01-01');
INSERT INTO manobras VALUES(100,7),(101,7),(102,7),(200,8);
INSERT INTO modelos_sessao_manobras VALUES(1,10,100,1,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB'),(22,10,102,22,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB'),(23,10,101,1,1,NULL,NULL,NULL,'2026-01-01',NULL,NULL,'AB');
INSERT INTO simulador_agendamentos VALUES(1,10,7); INSERT INTO fichas_sessao VALUES(1,1); INSERT INTO simulador_atribuicoes_curriculares VALUES(1,10,7);`);
      expect(setup.status).toBe(0);
      expect(query(db, 'PRAGMA foreign_keys').stdout).toContain('"foreign_keys":1');
      const applied = run(db, migration);
      expect(applied.status).toBe(0);
      expect(query(db, 'PRAGMA foreign_keys').stdout).toContain('"foreign_keys":1');
      expect(query(db, 'SELECT id,ordem,deleted_at FROM modelos_sessao_manobras ORDER BY id').stdout).toContain('\"ordem\":22');
      expect(query(db, 'PRAGMA foreign_key_check').stdout.trim()).toBe('');
      expect(query(db, 'SELECT modelo_id,empresa_id,codigo_canonico FROM modelos_sessao_versionamento ORDER BY modelo_id').stdout).toContain('\"modelo_id\":10');
      expect(run(db, "INSERT INTO modelos_sessao_manobras(modelo_id,manobra_id,ordem,tripulante) VALUES(10,100,22,'AB')").status).not.toBe(0);
      expect(run(db, "INSERT INTO modelos_sessao_manobras(modelo_id,manobra_id,ordem,tripulante) VALUES(10,100,2,'AB')").status).toBe(0);
      expect(run(db, "INSERT INTO modelos_sessao_manobras(modelo_id,manobra_id,ordem,tripulante) VALUES(10,200,3,'AB')").status).not.toBe(0);
      expect(run(db, "UPDATE modelos_sessao_versionamento SET is_current=0, efetivo_ate='2099-01-02' WHERE modelo_id=10").status).toBe(0);
      expect(run(db, "UPDATE modelos_sessao_versionamento SET is_current=1, efetivo_ate=NULL WHERE modelo_id=10").status).not.toBe(0);
      expect(query(db, 'SELECT is_current FROM modelos_sessao_versionamento WHERE modelo_id=30').stdout).toContain('0');
      const importSql = "INSERT INTO simuladores_matriz_imports(uuid,empresa_id,versao_matriz,schema_version,status,plan_sha256,source_hashes_json,base_fingerprint,expected_counts_json) VALUES('import-1',7,'M1',2,'DRY_RUN','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','{}','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','{}')";
      expect(run(db, importSql).status).toBe(0);
      expect(run(db, "UPDATE simuladores_matriz_imports SET status='APPLIED' WHERE uuid='import-1'").status).not.toBe(0);
      expect(run(db, "UPDATE simuladores_matriz_imports SET status='APPLYING' WHERE uuid='import-1'").status).toBe(0);
      expect(run(db, "UPDATE simuladores_matriz_imports SET status='APPLIED', applied_at='2026-01-02', applied_counts_json='{}' WHERE uuid='import-1'").status).toBe(0);
      expect(run(db, "UPDATE simuladores_matriz_imports SET plan_sha256='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' WHERE uuid='import-1'").status).not.toBe(0);
      expect(query(db, 'SELECT agendamento_slot_id FROM fichas_sessao WHERE id=1').stdout).toContain('1');
      expect(query(db, 'SELECT template_id FROM simulador_agendamentos WHERE id=1').stdout).toContain('10');
      expect(query(db, 'SELECT modelo_sessao_id FROM simulador_atribuicoes_curriculares WHERE id=1').stdout).toContain('10');
      expect(query(db, 'SELECT efetivo_em,efetivo_ate FROM modelos_sessao_versionamento WHERE modelo_id=30').stdout).toContain('2019-01-01');
    } finally { rmSync(db, { force: true }); }
  });

  it('fails preflight before rebuilding when an active order is duplicated', () => {
    const db = dbPath('negative');
    try {
      expect(run(db, `${schema}
INSERT INTO empresas VALUES(7); INSERT INTO modelos_sessao(id,codigo,empresa_id) VALUES(10,'OLD-A',7); INSERT INTO manobras VALUES(100,7),(101,7);
INSERT INTO modelos_sessao_manobras VALUES(1,10,100,1,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB'),(2,10,101,1,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB');`).status).toBe(0);
      expect(run(db, migration).status).not.toBe(0);
      expect(query(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='modelos_sessao_manobras'").stdout).toContain('modelos_sessao_manobras');
      expect(query(db, 'SELECT id FROM modelos_sessao_manobras ORDER BY id').stdout).toContain('1');
      expect(query(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='modelos_sessao_versionamento'").stdout.trim()).toBe('');
    } finally { rmSync(db, { force: true }); }
  });

  it('fails preflight for a legacy manoeuvre linked across tenants', () => {
    const db = dbPath('cross-tenant');
    try {
      expect(run(db, `${schema}
INSERT INTO empresas VALUES(7),(8); INSERT INTO modelos_sessao(id,codigo,empresa_id) VALUES(10,'OLD-A',7); INSERT INTO manobras VALUES(200,8);
INSERT INTO modelos_sessao_manobras VALUES(1,10,200,1,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB');`).status).toBe(0);
      expect(run(db, migration).status).not.toBe(0);
      expect(query(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='modelos_sessao_versionamento'").stdout.trim()).toBe('');
    } finally { rmSync(db, { force: true }); }
  });
});

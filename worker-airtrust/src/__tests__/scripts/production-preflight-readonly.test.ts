/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-ignore
import { sqliteExecutor } from '../../../../scripts/production/lib/executors.mjs';
// @ts-ignore
import { inspectDumpWithSqlite } from '../../../../scripts/production/lib/backup-d1-readonly.mjs';
// @ts-ignore
import {
  ALLOWED_EMPRESA_ID,
  assertAdminAuth,
  assertReadOnlySql,
  buildReadOnlySqlList,
  collectOperationalWindowStatus,
  collectTenantState,
  strictReadOnlyExecutor,
  validateTenantStateSnapshot,
} from '../../../../scripts/production/lib/simuladores-matriz-preflight.mjs';
// @ts-ignore
import {
  assertProductionTarget,
  PRODUCTION_TARGET,
} from '../../../../scripts/production/lib/reconcile-gates.mjs';

const WORKER_ROOT = process.cwd();
const MIGRATION_0440 = readFileSync(
  join(WORKER_ROOT, 'migrations/0440_simuladores_matriz_versionada_metadata.sql'),
  'utf8',
);

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tmp(name: string) {
  const dir = mkdtempSync(join(tmpdir(), `preflight-${name}-`));
  tempDirs.push(dir);
  return dir;
}

function sqlite(db: string, sql: string) {
  const res = spawnSync('sqlite3', ['-bail', db], {
    input: `PRAGMA foreign_keys=ON;\nPRAGMA recursive_triggers=OFF;\n${sql}`,
    encoding: 'utf8',
  });
  if (res.status !== 0) throw new Error(res.stderr || res.stdout);
}

const PRE_0440_SCHEMA = `
CREATE TABLE empresas(id INTEGER PRIMARY KEY, deleted_at TEXT, ativo INTEGER DEFAULT 1);
CREATE TABLE modelos_sessao(
  id INTEGER PRIMARY KEY, codigo TEXT NOT NULL UNIQUE, nome TEXT NOT NULL DEFAULT 'f',
  empresa_id INTEGER NOT NULL, created_at TEXT, deleted_at TEXT, created_by TEXT, updated_by TEXT);
CREATE TABLE manobras(
  id INTEGER PRIMARY KEY, codigo TEXT NOT NULL, empresa_id INTEGER NOT NULL, deleted_at TEXT
);
CREATE TABLE modelos_sessao_manobras(
  id INTEGER PRIMARY KEY, modelo_id INTEGER NOT NULL, manobra_id INTEGER NOT NULL, ordem INTEGER NOT NULL,
  obrigatoria INTEGER, observacoes TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT, created_by TEXT, updated_by TEXT,
  tripulante TEXT NOT NULL DEFAULT 'AB',
  UNIQUE(modelo_id, manobra_id),
  FOREIGN KEY(modelo_id) REFERENCES modelos_sessao(id),
  FOREIGN KEY(manobra_id) REFERENCES manobras(id));
CREATE INDEX idx_modelos_sessao_manobras_modelo_id ON modelos_sessao_manobras(modelo_id);
CREATE INDEX idx_modelos_sessao_manobras_manobra_id ON modelos_sessao_manobras(manobra_id);
CREATE INDEX idx_modelos_sessao_manobras_ordem ON modelos_sessao_manobras(modelo_id, ordem);
CREATE TRIGGER trigger_modelos_sessao_manobras_updated_at
AFTER UPDATE ON modelos_sessao_manobras FOR EACH ROW BEGIN
  UPDATE modelos_sessao_manobras SET updated_at = datetime('now') WHERE id = NEW.id;
END;
CREATE TABLE simulador_agendamentos(
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  status TEXT,
  data TEXT,
  hora_inicio TEXT,
  hora_fim TEXT,
  duracao_minutos INTEGER,
  is_check INTEGER DEFAULT 0,
  deleted_at TEXT
);
CREATE TABLE funcionarios(id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT);
CREATE TABLE fichas_sessao(
  id INTEGER PRIMARY KEY,
  colaborador_id_aluno INTEGER,
  empresa_id INTEGER,
  agendamento_slot_id INTEGER,
  deleted_at TEXT
);
CREATE TABLE fichas_sessao_edicoes(
  id INTEGER PRIMARY KEY,
  ficha_id INTEGER,
  empresa_id INTEGER,
  status TEXT,
  deleted_at TEXT
);
CREATE TABLE d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO empresas VALUES(6, NULL, 1);
INSERT INTO modelos_sessao(id,codigo,empresa_id,created_at) VALUES(10,'A139-I-01',6,'2020-01-01');
INSERT INTO manobras VALUES(100,'MAN-001',6,NULL),(101,'MAN-002',6,NULL);
INSERT INTO modelos_sessao_manobras VALUES
  (1,10,100,1,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB'),
  (2,10,101,2,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB');
INSERT INTO d1_migrations(name, applied_at) VALUES ('0439_bootstrap.sql', datetime('now'));
INSERT INTO funcionarios(id,empresa_id,deleted_at) VALUES (77,6,NULL);
INSERT INTO fichas_sessao(id,colaborador_id_aluno,empresa_id,agendamento_slot_id,deleted_at) VALUES (900,77,6,NULL,NULL);
`;

function fixtureApplied0440(name: string) {
  const db = join(tmp(name), 'prod-copy.db');
  sqlite(db, PRE_0440_SCHEMA);
  sqlite(db, `BEGIN IMMEDIATE;\n${MIGRATION_0440}\nCOMMIT;`);
  return db;
}

describe('production preflight readonly guards', () => {
  it('refuses a wrong D1 target', () => {
    expect(assertProductionTarget({ ...PRODUCTION_TARGET })).toBe(true);
    expect(() =>
      assertProductionTarget({
        database_name: 'wrong',
        database_id: PRODUCTION_TARGET.database_id,
      }),
    ).toThrow(/database_name/);
  });

  it('rejects an invalid backup dump during disposable SQLite restore', () => {
    const dir = tmp('invalid-dump');
    const dump = join(dir, 'broken.sql');
    writeFileSync(dump, 'THIS IS NOT SQL;\nINSERT INTO nope VALUES(');
    expect(() => inspectDumpWithSqlite(dump)).toThrow();
  });

  it('rejects tenant mismatch and incomplete snapshots', () => {
    expect(() =>
      validateTenantStateSnapshot(
        {
          empresa_id: 7,
          current_versions: [
            { codigo_canonico: 'A', modelo_id: 1, versao_numero: 1, is_current: 1 },
          ],
          resolved_manoeuvres: [{ id: 1, codigo: 'M', empresa_id: 7 }],
          links: [{ id: 1, modelo_id: 1, manobra_id: 1, ordem: 1, deleted_at: null }],
          migration_state: { has_0440: true, versionamento_count: 1 },
          existing_manobra_resolutions: [],
        },
        { expectedEmpresaId: ALLOWED_EMPRESA_ID },
      ),
    ).toThrow(/empresa_id divergente/);

    expect(() =>
      validateTenantStateSnapshot(
        {
          empresa_id: 6,
          current_versions: [],
          resolved_manoeuvres: [{ id: 1, codigo: 'M', empresa_id: 6 }],
          links: [{ id: 1, modelo_id: 1, manobra_id: 1, ordem: 1, deleted_at: null }],
          migration_state: { has_0440: true, versionamento_count: 1 },
          existing_manobra_resolutions: [],
        },
        { expectedEmpresaId: ALLOWED_EMPRESA_ID },
      ),
    ).toThrow(/versões correntes/);
  });

  it('rejects non-admin auth or wrong tenant claim', () => {
    expect(() =>
      assertAdminAuth({
        jwtClaims: { empresa_id: 6, role: 'manager' },
        mePayload: { data: { id: 1, email: 'ops@example.com', role: 'manager', nome: 'Ops' } },
      }),
    ).toThrow(/role=admin/);

    expect(() =>
      assertAdminAuth({
        jwtClaims: { empresa_id: 7, role: 'admin' },
        mePayload: { data: { id: 1, email: 'ops@example.com', role: 'admin', nome: 'Ops' } },
      }),
    ).toThrow(/empresa_id divergente/);
  });

  it('flags active sessions/checks and pending edits', () => {
    const db = fixtureApplied0440('window-active');
    sqlite(
      db,
      `
      INSERT INTO simulador_agendamentos(id,empresa_id,status,data,hora_inicio,hora_fim,duracao_minutos,is_check,deleted_at)
      VALUES
        (501,6,'EM_ANDAMENTO','2026-07-23','10:00','12:00',120,0,NULL),
        (502,6,'CONFIRMADO','2026-07-23','10:10','11:10',60,1,NULL);
      INSERT INTO fichas_sessao_edicoes(id,ficha_id,empresa_id,status,deleted_at) VALUES (1,900,6,'PENDENTE',NULL);
      `,
    );
    const status = collectOperationalWindowStatus({
      executor: sqliteExecutor(db),
      empresaId: 6,
      nowKey: '2026-07-23 10:15:00',
      endKey: '2026-07-23 10:45:00',
    });
    expect(status).toEqual({
      active_sessions: 2,
      active_checks: 1,
      pending_edits: 1,
    });
  });

  it('runs tenant collection with read-only SQL only and zero exec calls', () => {
    const db = fixtureApplied0440('readonly');
    let execCalls = 0;
    const base = sqliteExecutor(db);
    const spy = strictReadOnlyExecutor({
      ...base,
      exec(sql: string) {
        execCalls += 1;
        return base.exec(sql);
      },
    });

    const queries = Object.values(
      buildReadOnlySqlList({
        empresaId: 6,
        matrixVersion: 'M2026.07',
        nowKey: '2026-07-23 10:00:00',
        endKey: '2026-07-23 10:30:00',
      }),
    );
    for (const sql of queries) {
      expect(() => assertReadOnlySql(sql)).not.toThrow();
    }

    const result = collectTenantState({
      executor: spy,
      empresaId: 6,
      nowKey: '2026-07-23 10:00:00',
      endKey: '2026-07-23 10:30:00',
      fkBaseline: 0,
    });
    expect(result.tenantState.empresa_id).toBe(6);
    expect(result.migrationState.audit_state).toBe('INTEGRALMENTE_APLICADA');
    expect(execCalls).toBe(0);
  });
});

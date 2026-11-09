/**
 * P13-01 (deteccao): o alerta CRON_HEALTH_DEGRADED nunca foi criado em producao
 * porque os INSERTs usavam colunas que nao existem no schema real
 * (usuarios.ativo, usuarios_empresas.ativo/deleted_at). Estes testes executam a
 * persistencia contra SQLite com as colunas reais de producao.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import {
  persistCronHealthAdminAlerts,
  type CronHealthSnapshot,
} from '../../cron/resilient/cron-health';

const opened: SqliteD1Database[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

function snapshot(scopes: Array<{ job: string; scope: string }>): CronHealthSnapshot {
  return {
    checkedScopes: scopes.length,
    repeatedFailureScopes: scopes.length,
    expiredLeaseScopes: 0,
    backlogScopes: 0,
    exhaustedItemScopes: 0,
    delayedScopes: 0,
    stalledCursorScopes: 0,
    staleRunningScopes: 0,
    tenantErrorScopes: 0,
    pendingItems: 0,
    exhaustedItems: 0,
    affectedScopes: scopes.map((s) => ({
      job_name: s.job,
      scope_key: s.scope,
      error_code: 'D1_ERROR',
      signals: ['REPEATED_FAILURE'],
    })),
  };
}

function fixture() {
  const db = new SqliteD1Database();
  opened.push(db);
  // Colunas conforme PRAGMA table_info em producao (2026-11-08).
  db.database.exec(`
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY, email TEXT, perfil TEXT, funcionario_id INTEGER,
      deleted_at TEXT, active INTEGER, last_login TEXT
    );
    CREATE TABLE usuarios_empresas (
      id INTEGER PRIMARY KEY, usuario_id INTEGER, empresa_id INTEGER, role TEXT,
      is_primary INTEGER, created_at TEXT
    );
    CREATE TABLE usuarios_empresas_perfis (
      id INTEGER PRIMARY KEY, usuario_id INTEGER, empresa_id INTEGER, perfil TEXT,
      ativo INTEGER, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE user_platform_roles (
      id INTEGER PRIMARY KEY, user_id INTEGER, role_code TEXT, expires_at TEXT,
      revoked_at TEXT
    );
    CREATE TABLE notificacoes_sistema (
      id INTEGER PRIMARY KEY, tipo TEXT, prioridade TEXT, titulo TEXT, mensagem TEXT,
      dados TEXT, grupo TEXT, user_id TEXT, empresa_id INTEGER, lida INTEGER,
      created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    INSERT INTO usuarios (id, email, active) VALUES (1,'a@x',1),(2,'b@x',1),(3,'c@x',0),(4,'d@x',1);
    INSERT INTO usuarios_empresas (usuario_id, empresa_id, role) VALUES
      (1,6,'admin'),(2,6,'viewer'),(3,6,'admin'),(4,7,'admin');
    INSERT INTO user_platform_roles (user_id, role_code) VALUES (1,'platform_admin'),(3,'platform_admin');
  `);
  return db;
}

function alerts(db: SqliteD1Database) {
  return db.database
    .prepare("SELECT user_id, empresa_id FROM notificacoes_sistema WHERE tipo = 'CRON_HEALTH_DEGRADED' ORDER BY user_id, empresa_id")
    .all() as Array<{ user_id: string; empresa_id: number | null }>;
}

describe('persistCronHealthAdminAlerts no schema real', () => {
  it('escopo global alerta platform_admin ativo (conta inativa fica de fora)', async () => {
    const db = fixture();
    await persistCronHealthAdminAlerts(db.asD1(), snapshot([{ job: 'ead-renewal', scope: 'global' }]));
    expect(alerts(db)).toEqual([{ user_id: '1', empresa_id: null }]);
  });

  it('escopo de tenant alerta apenas admins ativos daquele tenant', async () => {
    const db = fixture();
    await persistCronHealthAdminAlerts(db.asD1(), snapshot([{ job: 'sigvoos-ingest', scope: 'empresa:6' }]));
    expect(alerts(db)).toEqual([{ user_id: '1', empresa_id: 6 }]);
  });

  it('nao duplica alerta dentro da janela de deduplicacao', async () => {
    const db = fixture();
    const snap = snapshot([{ job: 'ead-renewal', scope: 'global' }]);
    await persistCronHealthAdminAlerts(db.asD1(), snap);
    await persistCronHealthAdminAlerts(db.asD1(), snap);
    expect(alerts(db)).toHaveLength(1);
  });
});

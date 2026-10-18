import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

const SqliteDatabase = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

const baseline = readFileSync(resolve(process.cwd(), 'schema-v2/changes/0554_simulator_individual_check_evidence.sql'), 'utf8');
const deleteGuard = readFileSync(resolve(process.cwd(), 'schema-v2/changes/0560_simulator_individual_check_delete_guard.sql'), 'utf8');

function fixture() {
  const db = new SqliteDatabase(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, deleted_at TEXT);
    CREATE TABLE simulador_agendamentos (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, examinador_id INTEGER, deleted_at TEXT);
    CREATE TABLE fichas_sessao (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL,
      agendamento_slot_id INTEGER, colaborador_id_aluno INTEGER, instrutor_id INTEGER,
      assinatura_aluno_timestamp TEXT, assinatura_instrutor_timestamp TEXT,
      status TEXT, aprovado INTEGER, deleted_at TEXT
    );
    CREATE TABLE sessoes_checks (id INTEGER PRIMARY KEY, sessao_id INTEGER, qualificacao_tipo_id INTEGER, deleted_at TEXT);
    CREATE TABLE auditoria_avancada_v2 (id INTEGER PRIMARY KEY, tabela TEXT, acao TEXT);
    INSERT INTO funcionarios VALUES (101,6,NULL),(102,6,NULL),(201,7,NULL),(202,7,NULL);
    INSERT INTO simulador_agendamentos VALUES (10,6,102,NULL),(20,7,202,NULL);
    INSERT INTO fichas_sessao VALUES
      (11,6,10,101,102,'2026-10-17','2026-10-17','APROVADO',1,NULL),
      (21,7,20,201,202,'2026-10-17','2026-10-17','APROVADO',1,NULL);
    INSERT INTO sessoes_checks VALUES (51,10,301,NULL),(52,20,302,NULL);
    INSERT INTO auditoria_avancada_v2 VALUES (1,'fichas_sessao','INSERT');
  `);
  db.exec(baseline);
  db.exec(deleteGuard);
  return db;
}

function insert(db: DatabaseSync, tenant: number, state: 'CONFIRMADO'|'ANULADO'|'RASCUNHO', approved: number | null) {
  const cross = tenant === 7;
  return db.prepare(`
    INSERT INTO sessoes_checks_resultados_individuais
      (empresa_id, sessao_check_id, ficha_id, funcionario_id, avaliador_funcionario_id,
       estado, aprovado, confirmado_em, confirmado_por_usuario_id)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    tenant, cross ? 52 : 51, cross ? 21 : 11, cross ? 201 : 101, cross ? 202 : 102,
    state, approved, state === 'CONFIRMADO' ? '2026-10-17' : null,
    state === 'CONFIRMADO' ? 900 : null,
  );
}

describe('Schema V2 0560 — append-only individual simulator evidence', () => {
  let db: DatabaseSync | null = null;
  afterEach(() => { db?.close(); db = null; });

  for (const [name, state, approved, tenant] of [
    ['approved', 'CONFIRMADO', 1, 6],
    ['rejected', 'CONFIRMADO', 0, 6],
    ['annulled', 'ANULADO', 0, 6],
    ['draft', 'RASCUNHO', null, 6],
    ['other tenant', 'CONFIRMADO', 1, 7],
  ] as const) {
    it(`denies physical deletion of ${name} without losing audit or evidence`, () => {
      db = fixture();
      insert(db, tenant, state, approved);
      const before = db.prepare('SELECT COUNT(*) AS n FROM sessoes_checks_resultados_individuais').get();
      expect(() => db!.exec('DELETE FROM sessoes_checks_resultados_individuais')).toThrow(/INDIVIDUAL_CHECK_DELETE_FORBIDDEN/);
      expect(db.prepare('SELECT COUNT(*) AS n FROM sessoes_checks_resultados_individuais').get()).toEqual(before);
      expect(db.prepare('SELECT COUNT(*) AS n FROM auditoria_avancada_v2').get()).toEqual({ n: 1 });
    });
  }

  it('retains 0554 signed-result UPDATE immutability', () => {
    db = fixture();
    insert(db, 6, 'CONFIRMADO', 1);
    expect(() => db!.exec("UPDATE sessoes_checks_resultados_individuais SET aprovado=0")).toThrow(/INDIVIDUAL_CHECK_CONFIRMED_IMMUTABLE/);
    expect(db.prepare('SELECT aprovado FROM sessoes_checks_resultados_individuais').get()).toEqual({ aprovado: 1 });
  });

  it('retains 0554 annulment UPDATE immutability', () => {
    db = fixture();
    insert(db, 6, 'ANULADO', 0);
    expect(() => db!.exec("UPDATE sessoes_checks_resultados_individuais SET estado='CONFIRMADO', aprovado=1")).toThrow(/INDIVIDUAL_CHECK_ANNULLED_IMMUTABLE/);
    expect(db.prepare('SELECT estado FROM sessoes_checks_resultados_individuais').get()).toEqual({ estado: 'ANULADO' });
  });

  it('adds exactly one DELETE trigger without rewriting any historic result', () => {
    db = fixture();
    insert(db, 6, 'CONFIRMADO', 1);
    const before = db.prepare('SELECT id, funcionario_id, aprovado, estado FROM sessoes_checks_resultados_individuais').all();
    db.exec(deleteGuard);
    expect(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND tbl_name='sessoes_checks_resultados_individuais'").get()).toEqual({ n: 7 });
    expect(db.prepare('SELECT id, funcionario_id, aprovado, estado FROM sessoes_checks_resultados_individuais').all()).toEqual(before);
  });
});

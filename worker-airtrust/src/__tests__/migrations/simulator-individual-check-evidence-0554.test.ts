import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
const SqliteDatabase = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve(process.cwd(), 'schema-v2/changes/0554_simulator_individual_check_evidence.sql'),
  'utf8',
);

function fixture() {
  const db = new SqliteDatabase(':memory:');
  db!.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE funcionarios (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, deleted_at TEXT
    );
    CREATE TABLE simulador_agendamentos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL,
      examinador_id INTEGER, funcionario_id INTEGER, deleted_at TEXT
    );
    CREATE TABLE fichas_sessao (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL,
      agendamento_slot_id INTEGER NOT NULL,
      colaborador_id_aluno INTEGER NOT NULL,
      instrutor_id INTEGER,
      assinatura_aluno_timestamp TEXT,
      assinatura_instrutor_timestamp TEXT,
      status TEXT, aprovado INTEGER, deleted_at TEXT
    );
    CREATE TABLE sessoes_checks (
      id INTEGER PRIMARY KEY, sessao_id INTEGER NOT NULL, deleted_at TEXT
    );
    INSERT INTO funcionarios VALUES
      (201, 6, NULL),(202, 6, NULL),(301, 6, NULL),
      (501, 7, NULL),(601, 7, NULL);
    INSERT INTO simulador_agendamentos VALUES
      (10, 6, 301, NULL, NULL),
      (20, 7, 601, NULL, NULL);
    INSERT INTO fichas_sessao VALUES
      (101, 6, 10, 201, 301, '2026-10-10', '2026-10-11','APROVADO',1,NULL),
      (102, 6, 10, 202, 301, '2026-10-10', NULL,'AGUARDANDO_ASSINATURA_INSTRUTOR',0,NULL),
      (201, 7, 20, 501, 601, '2026-10-10', '2026-10-11','APROVADO',1,NULL);
    INSERT INTO sessoes_checks VALUES (900,10,NULL),(901,10,NULL),(999,20,NULL);
  `);
  db!.exec(migration);
  return db;
}

function insert(db: DatabaseSync, props: {
  empresa?: number; fiche?: number; check?: number; employee?: number;
  evaluator?: number; approved?: number | null;
  state?: string; signed?: boolean;
} = {}) {
  const state = props.state ?? 'CONFIRMADO';
  return db!.prepare(`
    INSERT INTO sessoes_checks_resultados_individuais
      (empresa_id, sessao_check_id, ficha_id, funcionario_id,
       avaliador_funcionario_id, aprovado, estado, confirmado_em,
       confirmado_por_usuario_id, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    props.empresa ?? 6,
    props.check ?? 900,
    props.fiche ?? 101,
    props.employee ?? 201,
    props.evaluator ?? 301,
    props.approved === undefined ? 1 : props.approved,
    state,
    props.signed === false ? null : '2026-10-11T16:00:00Z',
    props.signed === false ? null : 35,
    'Revisado individualmente',
  );
}

describe('Schema V2 0554 — simulator check evidence belongs to a person', () => {
  let db: DatabaseSync | null = null;
  afterEach(() => { db?.close(); db = null; });

  it('stores distinct approved/rejected results for two people in the same session', () => {
    db = fixture();
    insert(db!);
    // The second fiche gets its own signature, without inheriting first result.
    db!.exec(`UPDATE fichas_sessao SET
      assinatura_instrutor_timestamp='2026-10-12',
      status='NAO_APROVADO', aprovado=0 WHERE id=102;`);
    insert(db!, { fiche: 102, employee: 202, approved: 0 });
    const rows = db!.prepare(
      'SELECT funcionario_id,aprovado FROM sessoes_checks_resultados_individuais ORDER BY funcionario_id',
    ).all();
    expect(rows).toEqual([
      { funcionario_id: 201, aprovado: 1 },
      { funcionario_id: 202, aprovado: 0 },
    ]);
  });

  it('records explicit check failure even when the signed individual fiche was not approved', () => {
    db = fixture();
    db!.exec("UPDATE fichas_sessao SET assinatura_instrutor_timestamp='2026-10-12', status='NAO_APROVADO', aprovado=0 WHERE id=102;");
    insert(db!, { fiche:102, employee:202, approved:0 });
    const item = db!.prepare('SELECT funcionario_id, aprovado, estado FROM sessoes_checks_resultados_individuais').get();
    expect(item).toEqual({ funcionario_id:202, aprovado:0, estado:'CONFIRMADO' });
    expect(() => insert(db!, { fiche:102, employee:202, approved:1 })).toThrow(/UNIQUE constraint failed/);
  });

  it('cannot insert approval for a different employee or fiche/session', () => {
    db = fixture();
    expect(() => insert(db!, { employee: 202, state: 'RASCUNHO', signed: false })).toThrow(/INDIVIDUAL_CHECK_SCOPE_INVALID/);
    expect(() => insert(db!, { fiche: 201, employee: 501, evaluator: 601, empresa: 7, check: 900, state:'RASCUNHO', signed: false }))
      .toThrow(/INDIVIDUAL_CHECK_SCOPE_INVALID/);
    expect(() => insert(db!, { fiche: 101, employee: 201, check: 999, state:'RASCUNHO', signed: false }))
      .toThrow(/INDIVIDUAL_CHECK_SCOPE_INVALID/);
  });

  it('does not confirm evidence without the individual instructor signature', () => {
    db = fixture();
    expect(() => insert(db!, { fiche: 102, employee: 202 }))
      .toThrow(/INDIVIDUAL_CHECK_FICHE_NOT_SIGNED/);
  });

  it('keeps confirmed results immutable and unique per fiche/check', () => {
    db = fixture();
    insert(db!);
    expect(() => insert(db!)).toThrow(/UNIQUE constraint failed/);
    expect(() => db!.exec(
      "UPDATE sessoes_checks_resultados_individuais SET aprovado=0 WHERE ficha_id=101",
    )).toThrow(/INDIVIDUAL_CHECK_CONFIRMED_IMMUTABLE/);
    expect(() => db!.exec(
      "UPDATE sessoes_checks_resultados_individuais SET funcionario_id=202 WHERE ficha_id=101",
    )).toThrow(/INDIVIDUAL_CHECK_SCOPE_IMMUTABLE|INDIVIDUAL_CHECK_CONFIRMED_IMMUTABLE/);
  });

  it('cannot resurrect an annulled result into an approved result', () => {
    db = fixture();
    insert(db!, { state:'ANULADO', approved:0, signed:false });
    expect(() => db!.exec(`UPDATE sessoes_checks_resultados_individuais
      SET estado='CONFIRMADO', aprovado=1,
          confirmado_em='2026-10-12', confirmado_por_usuario_id=35
      WHERE ficha_id=101`)).toThrow(/INDIVIDUAL_CHECK_ANNULLED_IMMUTABLE/);
    const item = db!.prepare('SELECT estado, aprovado FROM sessoes_checks_resultados_individuais').get();
    expect(item).toEqual({ estado:'ANULADO', aprovado:0 });
  });

  it('never backfills or infers approvals from legacy session checks', () => {
    db = fixture();
    expect(db!.prepare('SELECT COUNT(*) as total FROM sessoes_checks_resultados_individuais').get())
      .toEqual({ total: 0 });
    insert(db!, { state:'RASCUNHO', approved:null, signed:false });
    expect(db!.prepare("SELECT COUNT(*) AS total FROM sessoes_checks_resultados_individuais WHERE estado='CONFIRMADO'").get())
      .toEqual({ total: 0 });
  });

  it('disallows confirmation of pending results if fiche remains unsigned', () => {
    db = fixture();
    insert(db!, { fiche: 102, employee: 202, state: 'RASCUNHO', signed:false });
    expect(() => db!.exec(`UPDATE sessoes_checks_resultados_individuais SET
      estado='CONFIRMADO', aprovado=1, confirmado_em='2026-10-11', confirmado_por_usuario_id=35
      WHERE ficha_id=102`)).toThrow(/INDIVIDUAL_CHECK_FICHE_NOT_SIGNED/);
  });
});

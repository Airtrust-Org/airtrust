import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

const migration = readFileSync('migrations/0457_qualification_category_lms_contract.sql', 'utf8');

function createPre0457Schema(db: DatabaseSync) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE dominios_operacionais (
      codigo TEXT PRIMARY KEY,
      nome TEXT,
      ativo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE qualificacoes_categorias (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      codigo TEXT NOT NULL,
      nome TEXT NOT NULL,
      cor TEXT,
      descricao TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      dominio_codigo TEXT,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );

    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      codigo TEXT NOT NULL,
      nome TEXT NOT NULL,
      categoria_id INTEGER,
      categoria TEXT,
      formato_id INTEGER,
      dominio_codigo TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );

    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      funcionario_id INTEGER NOT NULL,
      qualificacao_id INTEGER,
      qualificacao_codigo TEXT,
      categoria_id INTEGER,
      categoria TEXT,
      categoria_codigo TEXT,
      formato_id INTEGER,
      formato_codigo TEXT,
      data_conclusao TEXT,
      status TEXT,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );

    CREATE TABLE lms_cursos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      titulo TEXT NOT NULL,
      qualificacao_tipo_id INTEGER,
      categoria TEXT,
      formato_id INTEGER,
      dominio_codigo TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );

    INSERT INTO dominios_operacionais (codigo, nome)
    VALUES ('OPERACOES', 'Operações'), ('MANUTENCAO', 'Manutenção');

    INSERT INTO qualificacoes_categorias
      (id, empresa_id, codigo, nome, ativo, dominio_codigo, created_at, updated_at)
    VALUES
      (10, 1, 'EAD', 'Ensino Digital', 1, NULL, datetime('now'), datetime('now')),
      (11, 1, 'OPS', 'Operações', 1, 'OPERACOES', datetime('now'), datetime('now')),
      (12, 1, 'OLD', 'Inativa', 0, NULL, datetime('now'), datetime('now')),
      (20, 2, 'EAD', 'Ensino Digital', 1, NULL, datetime('now'), datetime('now'));

    INSERT INTO qualificacoes_tipos
      (id, empresa_id, codigo, nome, categoria_id, categoria, ativo, created_at, updated_at)
    VALUES
      (100, 1, 'Q-EAD', 'Curso EAD', 10, 'EAD antigo', 1, datetime('now'), datetime('now')),
      (200, 2, 'Q-EAD', 'Curso EAD', 20, 'EAD antigo', 1, datetime('now'), datetime('now'));
  `);
}

describe('migration 0457 canonical qualification category contract', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new NodeDatabaseSync(':memory:');
    createPre0457Schema(db);
    db.exec(migration);
  });

  afterEach(() => db.close());

  it('allows equal names in different tenants and marks one LMS category per tenant', () => {
    const rows = db
      .prepare(
        `SELECT empresa_id, codigo, nome, lms_integrada
           FROM qualificacoes_categorias
          WHERE codigo = 'EAD'
          ORDER BY empresa_id`,
      )
      .all();

    expect(rows).toEqual([
      { empresa_id: 1, codigo: 'EAD', nome: 'Ensino Digital', lms_integrada: 1 },
      { empresa_id: 2, codigo: 'EAD', nome: 'Ensino Digital', lms_integrada: 1 },
    ]);
  });

  it('derives the model snapshot from categoria_id and rejects text-only or inactive FKs', () => {
    db.prepare(
      `INSERT INTO qualificacoes_tipos
        (id, empresa_id, codigo, nome, categoria_id, categoria, ativo, created_at, updated_at)
       VALUES (101, 1, 'Q-OPS', 'Operacional', 11, 'texto incorreto', 1, datetime('now'), datetime('now'))`,
    ).run();

    expect(
      db.prepare('SELECT categoria_id, categoria FROM qualificacoes_tipos WHERE id = 101').get(),
    ).toEqual({ categoria_id: 11, categoria: 'Operações' });

    expect(() =>
      db
        .prepare(
          `INSERT INTO qualificacoes_tipos
          (id, empresa_id, codigo, nome, categoria_id, categoria, ativo)
         VALUES (102, 1, 'TEXT', 'Somente texto', NULL, 'Operações', 1)`,
        )
        .run(),
    ).toThrow(/QUALIFICATION_CATEGORY_INVALID/);

    expect(() =>
      db
        .prepare(
          `INSERT INTO qualificacoes_tipos
          (id, empresa_id, codigo, nome, categoria_id, categoria, ativo)
         VALUES (103, 1, 'INACTIVE', 'Inativa', 12, 'Inativa', 1)`,
        )
        .run(),
    ).toThrow(/QUALIFICATION_CATEGORY_INVALID/);
  });

  it('rejects cross-tenant category IDs', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO qualificacoes_tipos
          (id, empresa_id, codigo, nome, categoria_id, categoria, ativo)
         VALUES (104, 1, 'CROSS', 'Cross tenant', 20, 'Ensino Digital', 1)`,
        )
        .run(),
    ).toThrow(/QUALIFICATION_CATEGORY_INVALID/);
  });

  it('blocks deactivation while an active model references the category', () => {
    expect(() =>
      db.prepare('UPDATE qualificacoes_categorias SET ativo = 0 WHERE id = 10').run(),
    ).toThrow(/QUALIFICATION_CATEGORY_IN_USE/);

    db.prepare('UPDATE qualificacoes_tipos SET ativo = 0 WHERE id = 100').run();
    expect(() =>
      db.prepare('UPDATE qualificacoes_categorias SET ativo = 0 WHERE id = 10').run(),
    ).not.toThrow();
  });

  it('writes canonical history snapshots in the same transaction', () => {
    const result = db
      .prepare(
        `INSERT INTO qualificacoes_historico
        (empresa_id, funcionario_id, qualificacao_id, qualificacao_codigo,
         categoria_id, categoria, categoria_codigo, data_conclusao, status,
         created_at, updated_at)
       VALUES (1, 77, 100, 'Q-EAD', NULL, 'errado', 'ERRADO', '2026-08-06',
               'CONCLUIDA', datetime('now'), datetime('now'))`,
      )
      .run();

    expect(
      db
        .prepare(
          `SELECT categoria_id, categoria, categoria_codigo
             FROM qualificacoes_historico WHERE id = ?`,
        )
        .get(result.lastInsertRowid),
    ).toEqual({
      categoria_id: 10,
      categoria: 'Ensino Digital',
      categoria_codigo: 'EAD',
    });
  });

  it('rejects history without a canonical qualification type', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO qualificacoes_historico
          (empresa_id, funcionario_id, qualificacao_id, qualificacao_codigo,
           categoria, data_conclusao, status)
         VALUES (1, 77, NULL, 'LEGACY', 'EAD', '2026-08-06', 'CONCLUIDA')`,
        )
        .run(),
    ).toThrow(/QUALIFICATION_HISTORY_CATEGORY_INVALID/);
  });

  it('derives linked LMS category/domain and neutralizes formato', () => {
    db.prepare(
      `INSERT INTO lms_cursos
        (empresa_id, titulo, qualificacao_tipo_id, categoria, formato_id,
         dominio_codigo, ativo, created_at, updated_at)
       VALUES (1, 'Curso', 100, 'errado', 999, 'OPERACOES', 1,
               datetime('now'), datetime('now'))`,
    ).run();

    expect(
      db
        .prepare(
          `SELECT categoria, formato_id, dominio_codigo
           FROM lms_cursos WHERE titulo = 'Curso'`,
        )
        .get(),
    ).toEqual({
      categoria: 'Ensino Digital',
      formato_id: null,
      dominio_codigo: null,
    });
  });

  it('treats NULL domain as domain-agnostic, not as a missing category', () => {
    expect(
      db
        .prepare(
          `SELECT qt.categoria_id, qc.dominio_codigo
           FROM qualificacoes_tipos qt
           JOIN qualificacoes_categorias qc
             ON qc.id = qt.categoria_id AND qc.empresa_id = qt.empresa_id
          WHERE qt.id = 100`,
        )
        .get(),
    ).toEqual({ categoria_id: 10, dominio_codigo: null });
  });

  it('keeps category code immutable', () => {
    expect(() =>
      db.prepare("UPDATE qualificacoes_categorias SET codigo = 'NOVO' WHERE id = 10").run(),
    ).toThrow(/QUALIFICATION_CATEGORY_CODE_IMMUTABLE/);
  });
});

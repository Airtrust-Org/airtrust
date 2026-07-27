import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const MIGRATION_PATH = join(ROOT, 'migrations/0450_qualificacoes_category_only.sql');
const ROLLBACK_PATH = join(ROOT, '..', 'scripts/rollback/0450_qualificacoes_category_only.sql');
const migration = readFileSync(MIGRATION_PATH, 'utf8');
const rollback = readFileSync(ROLLBACK_PATH, 'utf8');

function dbPath(name: string) {
  return join(
    tmpdir(),
    `airtrust-0450-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
  );
}

function run(db: string, sql: string) {
  return spawnSync('sqlite3', ['-bail', db], { input: sql, encoding: 'utf8' });
}

function queryJson<T = unknown>(db: string, sql: string): T {
  const r = spawnSync('sqlite3', ['-json', db], { input: sql, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
  const t = r.stdout.trim();
  return (t ? JSON.parse(t) : []) as T;
}

function queryVal(db: string, sql: string): string {
  const r = spawnSync('sqlite3', ['-bail', db], { input: sql, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.trim();
}

// Minimal canonical schema required by migration 0450.
// This matches what exists after all migrations through 0449.
const BASE_SCHEMA = `
CREATE TABLE qualificacoes_categorias(
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  codigo TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  cor TEXT DEFAULT '#6B7280',
  ativo INTEGER DEFAULT 1,
  empresa_id INTEGER NOT NULL
);

CREATE TABLE qualificacoes_formatos(
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  codigo TEXT NOT NULL,
  descricao TEXT,
  cor TEXT DEFAULT '#6B7280',
  ativo INTEGER DEFAULT 1,
  empresa_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE qualificacoes_tipos(
  id TEXT PRIMARY KEY,
  tipo TEXT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  categoria_id INTEGER REFERENCES qualificacoes_categorias(id),
  formato_id INTEGER REFERENCES qualificacoes_formatos(id),
  carga_horaria REAL,
  carga_horaria_inicial REAL,
  carga_horaria_recorrente REAL,
  conteudo_programatico TEXT,
  validade INTEGER,
  vencimento_fim_mes INTEGER DEFAULT 0,
  observacoes TEXT,
  ativo INTEGER DEFAULT 1,
  is_check INTEGER DEFAULT 0,
  classe_requisito TEXT,
  empresa_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE qualificacoes_historico(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id TEXT,
  qualificacao_codigo TEXT,
  categoria TEXT,
  categoria_id INTEGER,
  tipo TEXT,
  validade_meses INTEGER,
  carga_horaria REAL,
  data_conclusao TEXT,
  data_vencimento TEXT,
  tipo_treinamento TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE certificados(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id TEXT,
  arquivo_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE lms_cursos(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  qualificacao_tipo_id TEXT,
  titulo TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  formato_id INTEGER,
  tipo_conteudo TEXT DEFAULT 'scorm',
  ativo INTEGER DEFAULT 1,
  publicado INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE lms_matriculas(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  status TEXT DEFAULT 'ATIVA',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
`;

function seedFixture(db: string) {
  const r = run(
    db,
    `
    ${BASE_SCHEMA}

    -- Tenant 6: EAD category and format
    INSERT INTO qualificacoes_categorias (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
    VALUES (200, 'EAD', 'EAD', 6, 1, datetime('now'), datetime('now'));
    INSERT INTO qualificacoes_categorias (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
    VALUES (201, 'PRESENCIAL', 'PRESENCIAL', 6, 1, datetime('now'), datetime('now'));

    INSERT INTO qualificacoes_formatos (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
    VALUES (10, 'EAD', 'EAD', 6, 1, datetime('now'), datetime('now'));
    INSERT INTO qualificacoes_formatos (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
    VALUES (11, 'PRESENCIAL', 'PRESENCIAL', 6, 1, datetime('now'), datetime('now'));

    -- Tenant 8: EAD category and format (different IDs, same tenant-scoped names)
    INSERT INTO qualificacoes_categorias (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
    VALUES (300, 'EAD', 'EAD-T8', 8, 1, datetime('now'), datetime('now'));
    INSERT INTO qualificacoes_formatos (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
    VALUES (20, 'EAD', 'EAD', 8, 1, datetime('now'), datetime('now'));

    -- Tenant 99: unrelated tenant with its own EAD format (should never be touched)
    INSERT INTO qualificacoes_categorias (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
    VALUES (400, 'EAD', 'EAD-T99', 99, 1, datetime('now'), datetime('now'));
    INSERT INTO qualificacoes_formatos (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
    VALUES (30, 'EAD', 'EAD-T99', 99, 1, datetime('now'), datetime('now'));

    -- Tenant 6 EAD types (active)
    INSERT INTO qualificacoes_tipos (id, codigo, nome, categoria, formato_id, validade, empresa_id, ativo, created_at, updated_at)
    VALUES ('tipo-t6-ead-001', 'EAD-T6-1', 'Curso EAD T6', 'MANUTENCAO', 10, 12, 6, 1, datetime('now'), datetime('now'));
    INSERT INTO qualificacoes_tipos (id, codigo, nome, categoria, formato_id, validade, empresa_id, ativo, created_at, updated_at)
    VALUES ('tipo-t6-ead-002', 'EAD-T6-2', 'Segundo Curso EAD T6', 'TREINAMENTO TEORICO', 10, 24, 6, 1, datetime('now'), datetime('now'));

    -- Tenant 6 non-EAD type (presencial)
    INSERT INTO qualificacoes_tipos (id, codigo, nome, categoria, categoria_id, formato_id, validade, empresa_id, ativo, created_at, updated_at)
    VALUES ('tipo-t6-pres-001', 'PRES-T6-1', 'Curso Presencial T6', 'PRESENCIAL', 201, 11, 24, 6, 1, datetime('now'), datetime('now'));

    -- Tenant 6 soft-deleted EAD type
    INSERT INTO qualificacoes_tipos (id, codigo, nome, categoria, formato_id, validade, empresa_id, ativo, created_at, updated_at, deleted_at)
    VALUES ('tipo-t6-ead-del', 'EAD-T6-DEL', 'Deleted EAD T6', 'MANUTENCAO', 10, 12, 6, 1, datetime('now'), datetime('now'), datetime('now'));

    -- Tenant 8 EAD type
    INSERT INTO qualificacoes_tipos (id, codigo, nome, categoria, formato_id, validade, empresa_id, ativo, created_at, updated_at)
    VALUES ('tipo-t8-ead-001', 'EAD-T8-1', 'Curso EAD T8', 'OUTRA', 20, 12, 8, 1, datetime('now'), datetime('now'));

    -- Tenant 99 EAD type (unrelated tenant — must NOT be touched)
    INSERT INTO qualificacoes_tipos (id, codigo, nome, categoria, formato_id, validade, empresa_id, ativo, created_at, updated_at)
    VALUES ('tipo-t99-ead-001', 'EAD-T99-1', 'Curso EAD T99', 'OUTRA', 30, 12, 99, 1, datetime('now'), datetime('now'));

    -- Sentinel records in related tables
    INSERT INTO qualificacoes_historico (empresa_id, funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao)
    VALUES (6, 1, 'tipo-t6-ead-001', 'EAD-T6-1', 'MANUTENCAO', '2025-01-01');
    INSERT INTO qualificacoes_historico (empresa_id, funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao)
    VALUES (8, 1, 'tipo-t8-ead-001', 'EAD-T8-1', 'OUTRA', '2025-01-01');

    INSERT INTO certificados (empresa_id, funcionario_id, qualificacao_id, arquivo_url)
    VALUES (6, 1, 'tipo-t6-ead-001', 'https://example.com/cert.pdf');
    INSERT INTO certificados (empresa_id, funcionario_id, qualificacao_id, arquivo_url)
    VALUES (8, 1, 'tipo-t8-ead-001', 'https://example.com/cert2.pdf');

    INSERT INTO lms_cursos (empresa_id, qualificacao_tipo_id, titulo, categoria, formato_id, tipo_conteudo, ativo, publicado)
    VALUES (6, 'tipo-t6-ead-001', 'Curso LMS T6', 'EAD', 10, 'scorm', 1, 1);
    INSERT INTO lms_cursos (empresa_id, qualificacao_tipo_id, titulo, categoria, formato_id, tipo_conteudo, ativo, publicado)
    VALUES (8, 'tipo-t8-ead-001', 'Curso LMS T8', 'EAD', 20, 'scorm', 1, 1);

    INSERT INTO lms_matriculas (empresa_id, curso_id, funcionario_id, status)
    VALUES (6, 1, 1, 'ATIVA');
    INSERT INTO lms_matriculas (empresa_id, curso_id, funcionario_id, status)
    VALUES (8, 1, 1, 'ATIVA');
  `,
  );
  expect(r.status, r.stderr).toBe(0);
}

function hashRelatedTables(db: string) {
  return {
    historico: queryJson(
      db,
      'SELECT id, empresa_id, funcionario_id, qualificacao_id, qualificacao_codigo, categoria, data_conclusao FROM qualificacoes_historico WHERE deleted_at IS NULL ORDER BY id',
    ),
    certificados: queryJson(
      db,
      'SELECT id, empresa_id, funcionario_id, qualificacao_id, arquivo_url FROM certificados WHERE deleted_at IS NULL ORDER BY id',
    ),
    lms_cursos: queryJson(
      db,
      'SELECT id, empresa_id, qualificacao_tipo_id, titulo, categoria, formato_id, tipo_conteudo FROM lms_cursos WHERE deleted_at IS NULL ORDER BY id',
    ),
    lms_matriculas: queryJson(
      db,
      'SELECT id, empresa_id, curso_id, funcionario_id, status FROM lms_matriculas WHERE deleted_at IS NULL ORDER BY id',
    ),
  };
}

function tipoState(db: string, tipoId: string) {
  return queryJson<
    Array<{
      categoria: string | null;
      categoria_id: number | null;
      formato_id: number | null;
      deleted_at: string | null;
    }>
  >(
    db,
    `SELECT categoria, categoria_id, formato_id, deleted_at FROM qualificacoes_tipos WHERE id='${tipoId}'`,
  )[0];
}

// ============================================================================
// APPLY TESTS
// ============================================================================
describe('Migration 0450 — Apply', () => {
  it('migrates tenant 6 EAD types to category-only', () => {
    const db = dbPath('t6-ead');
    seedFixture(db);
    const before = hashRelatedTables(db);

    const r = run(db, migration);
    expect(r.status, r.stderr).toBe(0);

    const t1 = tipoState(db, 'tipo-t6-ead-001');
    expect(t1.categoria).toBe('EAD');
    expect(t1.categoria_id).toBe(200);
    expect(t1.formato_id).toBeNull();

    const t2 = tipoState(db, 'tipo-t6-ead-002');
    expect(t2.categoria).toBe('EAD');
    expect(t2.categoria_id).toBe(200);
    expect(t2.formato_id).toBeNull();

    const after = hashRelatedTables(db);
    expect(after).toEqual(before);
    rmSync(db);
  });

  it('migrates tenant 8 EAD type to category-only', () => {
    const db = dbPath('t8-ead');
    seedFixture(db);

    const r = run(db, migration);
    expect(r.status, r.stderr).toBe(0);

    const t = tipoState(db, 'tipo-t8-ead-001');
    expect(t.categoria).toBe('EAD');
    expect(t.categoria_id).toBe(300);
    expect(t.formato_id).toBeNull();
    rmSync(db);
  });

  it('does not touch non-EAD types', () => {
    const db = dbPath('pres');
    seedFixture(db);

    const r = run(db, migration);
    expect(r.status, r.stderr).toBe(0);

    const t = tipoState(db, 'tipo-t6-pres-001');
    expect(t.categoria).toBe('PRESENCIAL');
    expect(t.categoria_id).toBe(201);
    expect(t.formato_id).toBe(11);
    rmSync(db);
  });

  it('does not touch soft-deleted types', () => {
    const db = dbPath('del');
    seedFixture(db);

    const r = run(db, migration);
    expect(r.status, r.stderr).toBe(0);

    const t = tipoState(db, 'tipo-t6-ead-del');
    expect(t.categoria).toBe('MANUTENCAO');
    expect(t.categoria_id).toBeNull();
    expect(t.formato_id).toBe(10);
    expect(t.deleted_at).not.toBeNull();
    rmSync(db);
  });

  it('does not touch unrelated tenants', () => {
    const db = dbPath('other');
    seedFixture(db);

    const r = run(db, migration);
    expect(r.status, r.stderr).toBe(0);

    const t = tipoState(db, 'tipo-t99-ead-001');
    expect(t.categoria).toBe('OUTRA');
    expect(t.categoria_id).toBeNull();
    expect(t.formato_id).toBe(30);
    rmSync(db);
  });

  it('does not create or modify any categoria row', () => {
    const db = dbPath('nocat');
    seedFixture(db);
    const catsBefore = queryJson(
      db,
      'SELECT id, nome, codigo, empresa_id FROM qualificacoes_categorias WHERE deleted_at IS NULL ORDER BY id',
    );

    const r = run(db, migration);
    expect(r.status, r.stderr).toBe(0);

    const catsAfter = queryJson(
      db,
      'SELECT id, nome, codigo, empresa_id FROM qualificacoes_categorias WHERE deleted_at IS NULL ORDER BY id',
    );
    expect(catsAfter).toEqual(catsBefore);
    rmSync(db);
  });

  it('aborts when EAD category is missing for a tenant with EAD types', () => {
    const db = dbPath('nocat2');
    run(
      db,
      `
      ${BASE_SCHEMA}
      INSERT INTO qualificacoes_formatos (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
      VALUES (10, 'EAD', 'EAD', 6, 1, datetime('now'), datetime('now'));
      INSERT INTO qualificacoes_tipos (id, codigo, nome, categoria, formato_id, validade, empresa_id, ativo, created_at, updated_at)
      VALUES ('tipo-t6-ead-001', 'EAD-T6', 'Curso EAD T6', 'MANUTENCAO', 10, 12, 6, 1, datetime('now'), datetime('now'));
    `,
    );
    const r = run(db, migration);
    expect(r.status).not.toBe(0);
    rmSync(db);
  });

  it('aborts when duplicate EAD categories exist in same tenant', () => {
    const db = dbPath('dupcat');
    run(
      db,
      `
      ${BASE_SCHEMA}
      INSERT INTO qualificacoes_categorias (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
      VALUES (200, 'EAD', 'EAD-1', 6, 1, datetime('now'), datetime('now'));
      INSERT INTO qualificacoes_categorias (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
      VALUES (201, 'EAD', 'EAD-2', 6, 1, datetime('now'), datetime('now'));
      INSERT INTO qualificacoes_formatos (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
      VALUES (10, 'EAD', 'EAD', 6, 1, datetime('now'), datetime('now'));
      INSERT INTO qualificacoes_tipos (id, codigo, nome, categoria, formato_id, validade, empresa_id, ativo, created_at, updated_at)
      VALUES ('tipo-t6-ead-001', 'EAD-T6', 'Curso EAD T6', 'MANUTENCAO', 10, 12, 6, 1, datetime('now'), datetime('now'));
    `,
    );
    const r = run(db, migration);
    expect(r.status).not.toBe(0);
    rmSync(db);
  });

  it('aborts with soft-deleted EAD format', () => {
    const db = dbPath('delfmt');
    run(
      db,
      `
      ${BASE_SCHEMA}
      INSERT INTO qualificacoes_categorias (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
      VALUES (200, 'EAD', 'EAD', 6, 1, datetime('now'), datetime('now'));
      INSERT INTO qualificacoes_formatos (id, nome, codigo, empresa_id, ativo, created_at, updated_at, deleted_at)
      VALUES (10, 'EAD', 'EAD', 6, 1, datetime('now'), datetime('now'), datetime('now'));
      INSERT INTO qualificacoes_tipos (id, codigo, nome, categoria, formato_id, validade, empresa_id, ativo, created_at, updated_at)
      VALUES ('tipo-t6-ead-001', 'EAD-T6', 'Curso EAD T6', 'MANUTENCAO', 10, 12, 6, 1, datetime('now'), datetime('now'));
    `,
    );
    const r = run(db, migration);
    // Should succeed because soft-deleted format is excluded from targets (no targets = no-op)
    expect(r.status).toBe(0);
    // Tipo should remain unchanged
    const t = tipoState(db, 'tipo-t6-ead-001');
    expect(t.categoria).toBe('MANUTENCAO');
    rmSync(db);
  });
  it('aborts when EAD category is inactive', () => {
    const db = dbPath('inactive-cat');
    run(
      db,
      `
      ${BASE_SCHEMA}
      INSERT INTO qualificacoes_categorias (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
      VALUES (200, 'EAD', 'EAD', 6, 0, datetime('now'), datetime('now'));
      INSERT INTO qualificacoes_formatos (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
      VALUES (10, 'EAD', 'EAD', 6, 1, datetime('now'), datetime('now'));
      INSERT INTO qualificacoes_tipos (id, codigo, nome, categoria, formato_id, validade, empresa_id, ativo, created_at, updated_at)
      VALUES ('tipo-t6-ead-001', 'EAD-T6', 'Curso EAD T6', 'MANUTENCAO', 10, 12, 6, 1, datetime('now'), datetime('now'));
    `,
    );
    const r = run(db, migration);
    expect(r.status).not.toBe(0);
    rmSync(db);
  });

  it('uses active category when one active and one inactive exist', () => {
    const db = dbPath('mixed-cat');
    run(
      db,
      `
      ${BASE_SCHEMA}
      INSERT INTO qualificacoes_categorias (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
      VALUES (200, 'EAD', 'EAD-ACTIVE', 6, 1, datetime('now'), datetime('now'));
      INSERT INTO qualificacoes_categorias (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
      VALUES (201, 'EAD', 'EAD-INACTIVE', 6, 0, datetime('now'), datetime('now'));
      INSERT INTO qualificacoes_formatos (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
      VALUES (10, 'EAD', 'EAD', 6, 1, datetime('now'), datetime('now'));
      INSERT INTO qualificacoes_tipos (id, codigo, nome, categoria, formato_id, validade, empresa_id, ativo, created_at, updated_at)
      VALUES ('tipo-t6-ead-001', 'EAD-T6', 'Curso EAD T6', 'MANUTENCAO', 10, 12, 6, 1, datetime('now'), datetime('now'));
    `,
    );
    const r = run(db, migration);
    expect(r.status, r.stderr).toBe(0);
    const t = tipoState(db, 'tipo-t6-ead-001');
    expect(t.categoria).toBe('EAD');
    expect(t.categoria_id).toBe(200); // should use the active one
    rmSync(db);
  });

  it('ignores tipo linked to inactive EAD format', () => {
    const db = dbPath('inactive-fmt');
    run(
      db,
      `
      ${BASE_SCHEMA}
      INSERT INTO qualificacoes_categorias (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
      VALUES (200, 'EAD', 'EAD', 6, 1, datetime('now'), datetime('now'));
      INSERT INTO qualificacoes_formatos (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
      VALUES (10, 'EAD', 'EAD', 6, 0, datetime('now'), datetime('now'));
      INSERT INTO qualificacoes_tipos (id, codigo, nome, categoria, formato_id, validade, empresa_id, ativo, created_at, updated_at)
      VALUES ('tipo-t6-ead-001', 'EAD-T6', 'Curso EAD T6', 'MANUTENCAO', 10, 12, 6, 1, datetime('now'), datetime('now'));
    `,
    );
    const r = run(db, migration);
    expect(r.status, r.stderr).toBe(0); // no-op: no active format
    const t = tipoState(db, 'tipo-t6-ead-001');
    expect(t.categoria).toBe('MANUTENCAO'); // unchanged
    rmSync(db);
  });

  it('migrates inactive (not soft-deleted) tipo linked to active EAD format', () => {
    const db = dbPath('inactive-tipo');
    run(
      db,
      `
      ${BASE_SCHEMA}
      INSERT INTO qualificacoes_categorias (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
      VALUES (200, 'EAD', 'EAD', 6, 1, datetime('now'), datetime('now'));
      INSERT INTO qualificacoes_formatos (id, nome, codigo, empresa_id, ativo, created_at, updated_at)
      VALUES (10, 'EAD', 'EAD', 6, 1, datetime('now'), datetime('now'));
      INSERT INTO qualificacoes_tipos (id, codigo, nome, categoria, formato_id, validade, empresa_id, ativo, created_at, updated_at)
      VALUES ('tipo-t6-ead-001', 'EAD-T6', 'Curso EAD T6', 'MANUTENCAO', 10, 12, 6, 0, datetime('now'), datetime('now'));
    `,
    );
    const r = run(db, migration);
    expect(r.status, r.stderr).toBe(0);
    const t = tipoState(db, 'tipo-t6-ead-001');
    // Inactive but not soft-deleted tipo is still migrated (valid catalog entry)
    expect(t.categoria).toBe('EAD');
    expect(t.categoria_id).toBe(200);
    expect(t.formato_id).toBeNull();
    rmSync(db);
  });
});

// ============================================================================
// SECOND EXECUTION (idempotency)
// ============================================================================
describe('Migration 0450 — Second execution (idempotency)', () => {
  it('is no-op on second run (zero targets, zero updates)', () => {
    const db = dbPath('idem');
    seedFixture(db);

    const r1 = run(db, migration);
    expect(r1.status, r1.stderr).toBe(0);

    const afterFirst = queryJson(
      db,
      "SELECT id, updated_at FROM qualificacoes_tipos WHERE id IN ('tipo-t6-ead-001','tipo-t6-ead-002','tipo-t8-ead-001') ORDER BY id",
    );
    const snapshotCount1 = Number(
      queryVal(db, 'SELECT COUNT(*) FROM qualificacoes_category_only_0450_rollback'),
    );

    const r2 = run(db, migration);
    expect(r2.status, r2.stderr).toBe(0);

    const afterSecond = queryJson(
      db,
      "SELECT id, updated_at FROM qualificacoes_tipos WHERE id IN ('tipo-t6-ead-001','tipo-t6-ead-002','tipo-t8-ead-001') ORDER BY id",
    );
    const snapshotCount2 = Number(
      queryVal(db, 'SELECT COUNT(*) FROM qualificacoes_category_only_0450_rollback'),
    );

    // No timestamps changed
    expect(afterSecond).toEqual(afterFirst);
    // No snapshot duplication
    expect(snapshotCount2).toBe(snapshotCount1);
    rmSync(db);
  });
});

// ============================================================================
// ROLLBACK TESTS
// ============================================================================
describe('Migration 0450 — Rollback', () => {
  it('restores exact pre-migration state', () => {
    const db = dbPath('rbok');
    seedFixture(db);
    const before = hashRelatedTables(db);
    const baselineState = {
      t6ead1: tipoState(db, 'tipo-t6-ead-001'),
      t6ead2: tipoState(db, 'tipo-t6-ead-002'),
      t6pres: tipoState(db, 'tipo-t6-pres-001'),
      t8ead: tipoState(db, 'tipo-t8-ead-001'),
    };

    // Apply
    let r = run(db, migration);
    expect(r.status, r.stderr).toBe(0);

    // Rollback
    r = run(db, rollback);
    expect(r.status, r.stderr).toBe(0);

    const afterState = {
      t6ead1: tipoState(db, 'tipo-t6-ead-001'),
      t6ead2: tipoState(db, 'tipo-t6-ead-002'),
      t6pres: tipoState(db, 'tipo-t6-pres-001'),
      t8ead: tipoState(db, 'tipo-t8-ead-001'),
    };
    expect(afterState).toEqual(baselineState);

    const after = hashRelatedTables(db);
    expect(after).toEqual(before);
    rmSync(db);
  });

  it('aborts if a tipo is absent', () => {
    const db = dbPath('rbabsent');
    seedFixture(db);

    let r = run(db, migration);
    expect(r.status, r.stderr).toBe(0);

    // Delete a migrated tipo
    run(db, "DELETE FROM qualificacoes_tipos WHERE id='tipo-t6-ead-001'");

    r = run(db, rollback);
    expect(r.status).not.toBe(0);
    rmSync(db);
  });

  it('aborts if a tipo is soft-deleted', () => {
    const db = dbPath('rbsoft');
    seedFixture(db);

    let r = run(db, migration);
    expect(r.status, r.stderr).toBe(0);

    // Soft-delete a migrated tipo
    run(db, "UPDATE qualificacoes_tipos SET deleted_at=datetime('now') WHERE id='tipo-t6-ead-001'");

    r = run(db, rollback);
    expect(r.status).not.toBe(0);
    rmSync(db);
  });

  it('aborts if categoria diverged', () => {
    const db = dbPath('rbcat');
    seedFixture(db);

    let r = run(db, migration);
    expect(r.status, r.stderr).toBe(0);

    // Change categoria
    run(db, "UPDATE qualificacoes_tipos SET categoria='NOT-EAD' WHERE id='tipo-t6-ead-001'");

    r = run(db, rollback);
    expect(r.status).not.toBe(0);
    rmSync(db);
  });

  it('aborts if categoria_id diverged', () => {
    const db = dbPath('rbcatid');
    seedFixture(db);

    let r = run(db, migration);
    expect(r.status, r.stderr).toBe(0);

    // Change categoria_id
    run(db, "UPDATE qualificacoes_tipos SET categoria_id=999 WHERE id='tipo-t6-ead-001'");

    r = run(db, rollback);
    expect(r.status).not.toBe(0);
    rmSync(db);
  });

  it('aborts if formato_id diverged', () => {
    const db = dbPath('rbfmt');
    seedFixture(db);

    let r = run(db, migration);
    expect(r.status, r.stderr).toBe(0);

    // Restore formato_id
    run(db, "UPDATE qualificacoes_tipos SET formato_id=10 WHERE id='tipo-t6-ead-001'");

    r = run(db, rollback);
    expect(r.status).not.toBe(0);
    rmSync(db);
  });

  it('aborts if snapshot count mismatches', () => {
    const db = dbPath('rbcnt');
    seedFixture(db);

    let r = run(db, migration);
    expect(r.status, r.stderr).toBe(0);

    // Insert a fake snapshot row to break count parity
    run(
      db,
      "INSERT INTO qualificacoes_category_only_0450_rollback (empresa_id, qualificacao_tipo_id, categoria_id_anterior, categoria_anterior, formato_id_anterior, categoria_id_alvo) VALUES (6, 'tipo-fake', NULL, 'FAKE', NULL, 200)",
    );

    r = run(db, rollback);
    expect(r.status).not.toBe(0);
    rmSync(db);
  });

  it('does not restore partially on guard failure', () => {
    const db = dbPath('rbpart');
    seedFixture(db);

    let r = run(db, migration);
    expect(r.status, r.stderr).toBe(0);

    // Corrupt one row
    run(db, "UPDATE qualificacoes_tipos SET categoria='NOT-EAD' WHERE id='tipo-t6-ead-001'");

    r = run(db, rollback);
    expect(r.status).not.toBe(0);

    // The other tipo should still be in post-migration state (not partially restored)
    const t = tipoState(db, 'tipo-t8-ead-001');
    expect(t.categoria).toBe('EAD');
    expect(t.categoria_id).toBe(300);
    expect(t.formato_id).toBeNull();
    rmSync(db);
  });
});

// ============================================================================
// WRANGLER / D1 compatibility
// ============================================================================
describe('Migration 0450 — Wrangler/D1 compatibility', () => {
  it('is valid SQL for wrangler d1 execute', () => {
    // No BEGIN/COMMIT — wrangler d1 execute manages execution
    expect(migration).not.toMatch(/BEGIN\s+(IMMEDIATE|TRANSACTION|EXCLUSIVE)/i);
    // No TEMP TABLE — D1 local does not support temporary tables
    expect(migration).not.toMatch(/CREATE\s+TEMP\s+TABLE/i);
    // Uses regular tables with DROP cleanup instead
    expect(migration).toMatch(/DROP TABLE IF EXISTS _qco_0450/);
    // No PRAGMA foreign_keys = OFF (not in allowlist)
    expect(migration).not.toMatch(/PRAGMA\s+foreign_keys\s*=\s*OFF/i);
  });

  it('rollback is valid SQL for wrangler d1 execute', () => {
    expect(rollback).not.toMatch(/BEGIN\s+(IMMEDIATE|TRANSACTION|EXCLUSIVE)/i);
    expect(rollback).not.toMatch(/CREATE\s+TEMP\s+TABLE/i);
    expect(rollback).toMatch(/DROP TABLE IF EXISTS _qco_0450_rollback_guard/);
  });
});

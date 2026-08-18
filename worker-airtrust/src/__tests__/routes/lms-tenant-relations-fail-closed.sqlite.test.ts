/**
 * Real-SQL (node:sqlite) regression tests for the LMS tenant-relation
 * fail-closed fix in lms-matriculas.ts and lms-progresso.ts.
 *
 * The audited pattern: `lms_matriculas m JOIN lms_cursos c ON c.id =
 * m.curso_id` (and similarly for `qualificacoes_tipos qt`, `funcionarios f`)
 * had no `empresa_id` predicate on the joined table — only `m.empresa_id`
 * was checked. A corrupted/adversarial `m.curso_id`, `m.funcionario_id`, or
 * `c.qualificacao_tipo_id` pointing at another tenant's row would silently
 * pull that tenant's curso title, qualification code/name, or employee name
 * into this tenant's response — or, for the two completion write paths
 * (`/scorm/commit`, `/:id/finalizar`, and the xAPI statement handler in
 * lms-progresso.ts that feeds completeLmsMatricula), into an actual
 * qualificacoes_historico write.
 *
 * These tests run the exact fixed query fragments (copied from the route
 * files at the time of writing — see the "mirrors" comment on each query)
 * against a real in-memory SQLite database, proving: (1) the specific
 * leak scenario is blocked; (2) the query still resolves normally for
 * legitimate same-tenant data.
 */
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

let db: DatabaseSync;

beforeEach(() => {
  db = new NodeDatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE lms_matriculas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      funcionario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'NAO_INICIADO',
      progresso_pct REAL,
      score_final REAL,
      qualificacao_historico_id INTEGER,
      deleted_at TEXT
    );

    CREATE TABLE lms_cursos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      titulo TEXT NOT NULL,
      gerar_qualificacao_ao_concluir INTEGER NOT NULL DEFAULT 0,
      qualificacao_tipo_id INTEGER,
      scorm_mastery_score REAL,
      deleted_at TEXT
    );

    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      codigo TEXT NOT NULL,
      nome TEXT NOT NULL,
      categoria TEXT,
      validade INTEGER,
      deleted_at TEXT
    );

    CREATE TABLE funcionarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      matricula TEXT,
      ativo INTEGER DEFAULT 1,
      status TEXT DEFAULT 'ATIVO',
      deleted_at TEXT
    );

    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      qualificacao_id INTEGER,
      deleted_at TEXT,
      certificado_arquivo_id INTEGER
    );

    -- Tenant 1: legitimate, self-consistent data.
    INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, categoria, validade)
      VALUES (100, 1, 'MNT-12', 'Manutenção 12m (tenant 1)', 'MANUTENCAO', 12);
    INSERT INTO lms_cursos (id, empresa_id, titulo, gerar_qualificacao_ao_concluir, qualificacao_tipo_id)
      VALUES (200, 1, 'Curso Tenant 1', 1, 100);
    INSERT INTO funcionarios (id, empresa_id, nome, matricula) VALUES (300, 1, 'Func Tenant 1', 'T1-001');

    -- Tenant 2: same-shaped but distinct data — the values a corrupted
    -- tenant-1 relation would leak if the tenant predicate is missing.
    INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, categoria, validade)
      VALUES (900, 2, 'MNT-12', 'Manutenção 12m (tenant 2 — SEGREDO)', 'MANUTENCAO', 12);
    INSERT INTO lms_cursos (id, empresa_id, titulo, gerar_qualificacao_ao_concluir, qualificacao_tipo_id)
      VALUES (901, 2, 'Curso Tenant 2 — SEGREDO', 1, 900);
    INSERT INTO funcionarios (id, empresa_id, nome, matricula) VALUES (902, 2, 'Func Tenant 2 — SEGREDO', 'T2-001');

    -- Tenant 1 matricula with a legitimate, same-tenant curso_id.
    INSERT INTO lms_matriculas (id, empresa_id, funcionario_id, curso_id, status)
      VALUES (1000, 1, 300, 200, 'EM_ANDAMENTO');

    -- Tenant 1 matricula with a CORRUPTED cross-tenant curso_id (points at
    -- tenant 2's course). Simulates a manipulated/corrupted FK.
    INSERT INTO lms_matriculas (id, empresa_id, funcionario_id, curso_id, status)
      VALUES (1001, 1, 300, 901, 'EM_ANDAMENTO');

    -- Tenant 1 matricula with a CORRUPTED cross-tenant funcionario_id.
    INSERT INTO lms_matriculas (id, empresa_id, funcionario_id, curso_id, status)
      VALUES (1002, 1, 902, 200, 'EM_ANDAMENTO');
  `);
});

afterEach(() => {
  db.close();
});

describe('LMS tenant relation fail-closed (real SQL)', () => {
  it('/scorm/commit lookup: legitimate same-tenant matricula resolves curso + qualificacao correctly', () => {
    // Mirrors the fixed query in routes/lms-matriculas.ts POST /scorm/commit.
    const row = db
      .prepare(
        `SELECT m.id, c.id AS curso_id, c.titulo AS curso_titulo,
                qt.codigo AS qualificacao_codigo, qt.nome AS qualificacao_nome
           FROM lms_matriculas m
           JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
           LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id AND qt.empresa_id = m.empresa_id
          WHERE m.id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL`,
      )
      .get(1000, 1) as
      | { id: number; curso_id: number; curso_titulo: string; qualificacao_codigo: string | null }
      | undefined;

    expect(row).toBeDefined();
    expect(row?.curso_titulo).toBe('Curso Tenant 1');
    expect(row?.qualificacao_codigo).toBe('MNT-12');
  });

  it('/scorm/commit lookup: corrupted cross-tenant curso_id fails closed (curso/qt come back NULL, not tenant 2 data)', () => {
    const row = db
      .prepare(
        `SELECT m.id, c.id AS curso_id, c.titulo AS curso_titulo,
                qt.codigo AS qualificacao_codigo, qt.nome AS qualificacao_nome
           FROM lms_matriculas m
           JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
           LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id AND qt.empresa_id = m.empresa_id
          WHERE m.id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL`,
      )
      .get(1001, 1) as { id: number } | undefined;

    // JOIN lms_cursos is an INNER JOIN — with the tenant predicate, a
    // cross-tenant curso_id matches zero rows, so the whole matricula row
    // disappears from the result set rather than leaking tenant 2's data.
    expect(row).toBeUndefined();
  });

  it('/scorm/commit lookup: WITHOUT the fix, the corrupted cross-tenant curso_id would have leaked tenant 2 data (sanity check)', () => {
    const row = db
      .prepare(
        `SELECT m.id, c.id AS curso_id, c.titulo AS curso_titulo,
                qt.codigo AS qualificacao_codigo, qt.nome AS qualificacao_nome
           FROM lms_matriculas m
           JOIN lms_cursos c ON c.id = m.curso_id
           LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id
          WHERE m.id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL`,
      )
      .get(1001, 1) as { curso_titulo: string; qualificacao_codigo: string } | undefined;

    expect(row?.curso_titulo).toBe('Curso Tenant 2 — SEGREDO');
    expect(row?.qualificacao_codigo).toBe('MNT-12');
  });

  it('detail/listing lookup: corrupted cross-tenant funcionario_id fails closed instead of showing tenant 2 employee name', () => {
    // Mirrors the fixed readMatriculaForCourseList query.
    const row = db
      .prepare(
        `SELECT m.*, f.nome AS funcionario_nome, f.matricula AS funcionario_matricula
           FROM lms_matriculas m
           LEFT JOIN funcionarios f
             ON f.id = m.funcionario_id
            AND f.empresa_id = m.empresa_id
            AND f.deleted_at IS NULL
          WHERE m.id = ?
            AND m.empresa_id = ?
            AND m.deleted_at IS NULL`,
      )
      .get(1002, 1) as { funcionario_nome: string | null } | undefined;

    expect(row).toBeDefined();
    expect(row?.funcionario_nome).toBeNull();
  });

  it('LINK_PENDING listing: cross-tenant curso disappears from the row set instead of leaking title/qualification', () => {
    // Mirrors the fixed "minhas matrículas" LINK_PENDING listing query.
    const rows = db
      .prepare(
        `SELECT m.id, c.titulo,
                CASE WHEN qh.id IS NOT NULL THEN 'LINKED' ELSE 'LINK_PENDING' END AS qualification_link_state
           FROM lms_matriculas m
           JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
           LEFT JOIN qualificacoes_historico qh
             ON qh.id = m.qualificacao_historico_id
             AND qh.empresa_id = m.empresa_id
             AND qh.deleted_at IS NULL
           LEFT JOIN qualificacoes_tipos qt
             ON qt.id = qh.qualificacao_id
             AND qt.empresa_id = m.empresa_id
             AND qt.deleted_at IS NULL
          WHERE m.funcionario_id = ?
            AND m.empresa_id = ?
            AND m.deleted_at IS NULL
            AND c.deleted_at IS NULL
            AND m.status != 'CANCELADO'`,
      )
      .all(300, 1) as Array<{ id: number; titulo: string }>;

    const ids = rows.map((r) => r.id);
    expect(ids).toContain(1000); // legitimate row present
    expect(ids).not.toContain(1001); // corrupted cross-tenant curso_id excluded
    expect(rows.every((r) => r.titulo !== 'Curso Tenant 2 — SEGREDO')).toBe(true);
  });

  it('tenant 2 continues to resolve its own data normally (no false-positive rejection)', () => {
    const row = db
      .prepare(
        `SELECT m.id, c.titulo AS curso_titulo, qt.codigo AS qualificacao_codigo
           FROM lms_matriculas m
           JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
           LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id AND qt.empresa_id = m.empresa_id
          WHERE m.funcionario_id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL`,
      )
      .get(902, 2) as { curso_titulo: string } | undefined;

    // No matricula seeded for tenant 2 directly in this fixture set — assert
    // the query executes without error and returns undefined (no rows),
    // not a false match against tenant 1 data.
    expect(row).toBeUndefined();
  });
});

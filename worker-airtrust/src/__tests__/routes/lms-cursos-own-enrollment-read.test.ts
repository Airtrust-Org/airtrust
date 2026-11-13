import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { buildCatalogCourseReadScope } from '../../routes/lms-cursos-setor-scope';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { hasOwnEnrolledCourseReadAccess } from '../../routes/lms-cursos-legacy';
import type { EmployeeSectorAccess } from '../../middleware/employee-sector-access';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

const student: EmployeeSectorAccess = {
  mode: 'self', funcionarioId: 17, setorIds: [4],
};

function enrollmentDb(allowedTriples: Array<[number, number, number]>) {
  const prepare = vi.fn((sql: string) => {
    if (!sql.includes('FROM lms_matriculas')) throw new Error('Unexpected query');
    return {
      bind: (empresaId: number, cursoId: number, funcionarioId: number) => ({
      first: async () => ({
        allowed: allowedTriples.some(([empresa, curso, funcionario]) =>
          empresa === empresaId && curso === cursoId && funcionario === funcionarioId) ? 1 : 0,
      }),
    }),
    };
  });
  return { db: { prepare } as unknown as D1Database, prepare };
}

describe('LMS course details — own enrollment exception', () => {
  it('permite ao aluno somente o detalhe de um curso em que está matriculado', async () => {
    const { db, prepare } = enrollmentDb([[1, 55, 17]]);

    await expect(hasOwnEnrolledCourseReadAccess(db, 1, 55, student)).resolves.toBe(true);
    await expect(hasOwnEnrolledCourseReadAccess(db, 1, 56, student)).resolves.toBe(false);
    await expect(hasOwnEnrolledCourseReadAccess(db, 2, 55, student)).resolves.toBe(false);

    const sql = String(prepare.mock.calls[0]?.[0]);
    expect(sql).toContain('empresa_id = ? AND curso_id = ? AND funcionario_id = ?');
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).toContain("status IN ('NAO_INICIADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'REPROVADO')");
  });

  it('não libera matrícula de outro funcionário ou de outra empresa', async () => {
    const { db } = enrollmentDb([[1, 55, 99], [2, 55, 17]]);
    await expect(hasOwnEnrolledCourseReadAccess(db, 1, 55, student)).resolves.toBe(false);
  });

  it('gestor com escopo restrito nunca recebe exceção de aluno', async () => {
    const { db, prepare } = enrollmentDb([[1, 55, 17]]);
    const manager: EmployeeSectorAccess = { mode: 'restricted', funcionarioId: null, setorIds: [4] };
    await expect(hasOwnEnrolledCourseReadAccess(db, 1, 55, manager)).resolves.toBe(false);
    await expect(hasOwnEnrolledCourseReadAccess(db, 1, -1, student)).resolves.toBe(false);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('sem matrícula ativa, a consulta continua negada', async () => {
    const { db } = enrollmentDb([]);
    await expect(hasOwnEnrolledCourseReadAccess(db, 1, 55, student)).resolves.toBe(false);
  });
});

describe('LMS catalog operational enrollment count', () => {
  it('counts only actionable cycles and leaves completed audit history separate', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/lms-cursos-legacy.ts'), 'utf8');
    expect(source).toMatch(/m\.deleted_at IS NULL\s+AND UPPER\(TRIM\(COALESCE\(m\.status,''\)\)\) IN \('NAO_INICIADO','EM_ANDAMENTO','REPROVADO'\)\$\{matriculaScope\.clause\}\) AS total_matriculas/);
    expect(source).toContain("m.status = 'CONCLUIDO' AND m.deleted_at IS NULL");
  });
});

describe('LMS learner catalog excludes published SCORM with no package', () => {
  it('hides LGPD-like unlaunchable SCORM but preserves valid and non-SCORM courses', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/lms-cursos-legacy.ts'), 'utf8');
    expect(source).toContain("NULLIF(TRIM(c.scorm_package_r2_prefix), '') IS NOT NULL");
    expect(source).toContain("NULLIF(TRIM(c.scorm_launch_file), '') IS NOT NULL");
    expect(source).toContain("if (!hasRole(c, 'admin', 'manager'))");
    const db = new NodeDatabaseSync(':memory:');
    db.exec(`CREATE TABLE c (id INTEGER, empresa_id INTEGER, publicado INTEGER, ativo INTEGER,
      tipo_conteudo TEXT, scorm_package_r2_prefix TEXT, scorm_launch_file TEXT);
      INSERT INTO c VALUES
       (69,6,1,1,'scorm',NULL,NULL), (23,6,1,1,'scorm','lms/scorm/6/23/','index.html'),
       (68,6,1,1,'scorm','lms/scorm/6/68/_candidates/live/','index.html'),
       (80,6,0,1,'scorm',NULL,NULL), (99,6,1,1,'pdf',NULL,NULL),
       (100,7,1,1,'scorm',NULL,NULL), (101,6,1,1,'scorm',NULL,'index.html');`);
    const rows = db.prepare(`SELECT id FROM c WHERE empresa_id=6 AND ativo=1 AND publicado=1
      AND (tipo_conteudo != 'scorm' OR NULLIF(TRIM(scorm_package_r2_prefix),'') IS NOT NULL OR NULLIF(TRIM(scorm_launch_file),'') IS NOT NULL)
      ORDER BY id`).all() as Array<{id:number}>;
    expect(rows.map(row => row.id)).toEqual([23,68,99,101]);
    const adminRows = db.prepare('SELECT id FROM c WHERE empresa_id=6 AND ativo=1 AND publicado=1 ORDER BY id').all() as Array<{id:number}>;
    expect(adminRows.map(row=>row.id)).toEqual([23,68,69,99,101]);
  });
});

describe('LMS catalog — real SQL own-enrollment authorization matrix', () => {
  function setupDb() {
    const db = new NodeDatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE lms_cursos (id INTEGER, empresa_id INTEGER, ativo INTEGER, publicado INTEGER, deleted_at TEXT, qualificacao_tipo_id INTEGER);
      CREATE TABLE lms_cursos_setores (curso_id INTEGER, empresa_id INTEGER, setor_id INTEGER, deleted_at TEXT);
      CREATE TABLE qualificacoes_tipos_setores (tipo_id INTEGER, empresa_id INTEGER, setor_id INTEGER, deleted_at TEXT);
      CREATE TABLE lms_matriculas (curso_id INTEGER, empresa_id INTEGER, funcionario_id INTEGER, status TEXT, deleted_at TEXT);
      INSERT INTO lms_cursos VALUES
        (1,6,1,1,NULL,NULL), (2,6,1,1,NULL,NULL), (3,6,1,1,NULL,NULL),
        (4,6,1,1,NULL,NULL), (5,6,1,1,NULL,NULL), (6,7,1,1,NULL,NULL),
        (7,6,1,1,NULL,NULL), (8,6,1,1,NULL,80), (9,6,1,1,NULL,NULL),
        (10,6,1,1,NULL,NULL);
      INSERT INTO lms_cursos_setores VALUES
        (1,6,10,NULL), (2,6,20,NULL), (3,6,20,NULL), (4,6,20,NULL),
        (5,6,20,NULL), (6,7,20,NULL), (7,6,20,NULL), (9,6,20,NULL), (10,6,20,NULL);
      INSERT INTO qualificacoes_tipos_setores VALUES (80,6,10,NULL);
      INSERT INTO lms_matriculas VALUES
        (2,6,17,'EM_ANDAMENTO',NULL),
        (3,6,18,'EM_ANDAMENTO',NULL),
        (4,6,17,'CANCELADO',NULL),
        (5,6,17,'EM_ANDAMENTO','2026-11-12'),
        (6,7,17,'EM_ANDAMENTO',NULL),
        (7,6,17,'CONCLUIDO',NULL),
        (10,7,17,'EM_ANDAMENTO',NULL);
    `);
    return db;
  }

  const schema = { hasCursoSetores: true, hasQualificacaoTipoSetores: true };
  function list(db: DatabaseSync, access: EmployeeSectorAccess, setorIds: number[] | null, tenant = 6) {
    const scope = buildCatalogCourseReadScope(access, setorIds, schema);
    const rows = db.prepare(
      `SELECT c.id FROM lms_cursos c WHERE c.empresa_id = ? AND c.deleted_at IS NULL
         AND c.ativo = 1 AND c.publicado = 1 ${scope.clause} ORDER BY c.id`,
    ).all(tenant, ...scope.bindings) as Array<{ id: number }>;
    return rows.map((r) => r.id);
  }

  it('includes only the learner own enrolled courses outside current sector, retaining sector-visible catalog', () => {
    const db = setupDb();
    try {
      expect(list(db, student, [10])).toEqual([1, 2, 7, 8]);
      expect(list(db, student, [])).toEqual([2, 7]);
    } finally { db.close(); }
  });

  it('does not admit other employees, another tenant, canceled or deleted enrollments', () => {
    const db = setupDb();
    try {
      const visible = list(db, student, []);
      expect(visible).not.toContain(3);
      expect(visible).not.toContain(4);
      expect(visible).not.toContain(5);
      expect(visible).not.toContain(6);
      expect(visible).not.toContain(9);
      expect(visible).not.toContain(10);
    } finally { db.close(); }
  });

  it('does not grant managers or missing employee identities the self-enrollment exception', () => {
    const db = setupDb();
    try {
      const manager: EmployeeSectorAccess = { mode: 'restricted', funcionarioId: null, setorIds: [10] };
      const orphan: EmployeeSectorAccess = { mode: 'restricted', funcionarioId: null, setorIds: [] };
      expect(list(db, manager, [10])).toEqual([1, 8]);
      expect(list(db, manager, [])).toEqual([]);
      expect(list(db, orphan, [])).toEqual([]);
    } finally { db.close(); }
  });

  it('fails closed without sector tables except for actual self-enrollments', () => {
    const db = setupDb();
    try {
      const selfScope = buildCatalogCourseReadScope(student, [10], {
        hasCursoSetores: false, hasQualificacaoTipoSetores: false,
      });
      const rows = db.prepare(
        `SELECT c.id FROM lms_cursos c WHERE c.empresa_id = 6 ${selfScope.clause} ORDER BY c.id`,
      ).all(...selfScope.bindings) as Array<{ id: number }>;
      expect(rows.map((r) => r.id)).toEqual([2, 7]);
      expect(buildCatalogCourseReadScope(
        { mode: 'restricted', funcionarioId: null, setorIds: [] }, [],
        { hasCursoSetores: false, hasQualificacaoTipoSetores: false },
      )).toEqual({ clause: ' AND 1 = 0', bindings: [] });
    } finally { db.close(); }
  });

  it('routes catalog reads through the verified scope builder', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/lms-cursos-legacy.ts'), 'utf8');
    expect(source).toContain('buildCatalogCourseReadScope(access, finalSetorIds, courseSetorSchema)');
    expect(source).toContain('binds.push(...catalogScope.bindings)');
  });
});

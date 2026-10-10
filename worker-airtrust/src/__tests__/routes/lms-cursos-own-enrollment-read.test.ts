import { describe, expect, it, vi } from 'vitest';
import { hasOwnEnrolledCourseReadAccess } from '../../routes/lms-cursos-legacy';
import type { EmployeeSectorAccess } from '../../services/employee-sector-access';

const student: EmployeeSectorAccess = {
  mode: 'self', funcionarioId: 17, setorIds: [4],
};

function enrollmentDb(allowedTriples: Array<[number, number, number]>) {
  const prepare = vi.fn((sql: string) => ({
    bind: (empresaId: number, cursoId: number, funcionarioId: number) => ({
      first: async () => ({
        allowed: allowedTriples.some(([empresa, curso, funcionario]) =>
          empresa === empresaId && curso === cursoId && funcionario === funcionarioId) ? 1 : 0,
      }),
    }),
  }));
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

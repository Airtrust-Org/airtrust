import { describe, expect, it, vi } from 'vitest';
import { hasOwnLmsCourseEnrollment } from '../../routes/lms-cursos-setor-scope';

function dbWithResult(row: { ok: number } | null) {
  const first = vi.fn(async () => row);
  const bind = vi.fn((_empresaId: number, _cursoId: number, _funcionarioId: number) => ({ first }));
  const prepare = vi.fn((_sql: string) => ({ bind }));
  return { db: { prepare } as unknown as D1Database, first, bind, prepare };
}

describe('LMS player: acesso aos metadados do curso pela matrícula', () => {
  it('permite apenas a matrícula do funcionário ativo autenticado no tenant', async () => {
    const { db, bind, prepare } = dbWithResult({ ok: 1 });
    expect(await hasOwnLmsCourseEnrollment(db, 6, 40, 77)).toBe(true);
    expect(bind).toHaveBeenCalledWith(6, 40, 77);
    const sql = prepare.mock.calls[0]?.[0] as string;
    expect(sql).toContain('m.empresa_id = ?');
    expect(sql).toContain('m.curso_id = ?');
    expect(sql).toContain('m.funcionario_id = ?');
    expect(sql).toContain('m.deleted_at IS NULL');
    expect(sql).toContain("UPPER(COALESCE(m.status, '')) <> 'CANCELADO'");
    expect(sql).toContain('f.deleted_at IS NULL');
    expect(sql).toContain("COALESCE(f.ativo, 1) = 1");
  });

  it('nega ausência da matrícula, usuário diferente e matrícula cancelada', async () => {
    const { db } = dbWithResult(null);
    expect(await hasOwnLmsCourseEnrollment(db, 6, 40, 88)).toBe(false);
    expect(await hasOwnLmsCourseEnrollment(db, 6, 40, 77)).toBe(false);
  });

  it('falha fechado com identificadores inválidos', async () => {
    const { db, prepare } = dbWithResult({ ok: 1 });
    expect(await hasOwnLmsCourseEnrollment(db, 0, 40, 77)).toBe(false);
    expect(await hasOwnLmsCourseEnrollment(db, 6, -1, 77)).toBe(false);
    expect(await hasOwnLmsCourseEnrollment(db, 6, 40, Number.NaN)).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
  });
});

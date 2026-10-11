import { describe, expect, it } from 'vitest';
import {
  NativeAdmissionError,
  resolveNativeEnrollmentAdmission,
} from '../../services/lms-native-enrollment-access';

type Row = {
  id: number; curso_id: number; funcionario_id: number; empresa_id: number;
  status: string; tipo_conteudo: string; ativo: number; publicado: number;
};
function createHarness(override: Partial<Row> | null = {}, actor: { funcionario_id: number | null } | null = { funcionario_id: 18 }) {
  const row = override === null ? null : {
    id: 99, curso_id: 8, funcionario_id: 18, empresa_id: 6,
    status: 'EM_ANDAMENTO', tipo_conteudo: 'native', ativo: 1, publicado: 1,
    ...override,
  };
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          calls.push({ sql, bindings });
          return {
            async first() {
              return sql.includes('FROM lms_matriculas') ? row : actor;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, calls };
}
const request = (db: D1Database, extra: Partial<Parameters<typeof resolveNativeEnrollmentAdmission>[0]> = {}) =>
  resolveNativeEnrollmentAdmission({ db, empresaId: 6, matriculaId: 99, actorUserId: 101, ...extra });

describe('Native V1 read-only enrollment admission / integration contract', () => {
  it('admits the owner only with scoped D1 data', async () => {
    const { db, calls } = createHarness();
    await expect(request(db)).resolves.toEqual({
      empresaId: 6, matriculaId: 99, cursoId: 8, funcionarioId: 18, mode: 'LEARN',
    });
    expect(calls[0]?.sql).toContain('c.empresa_id = m.empresa_id');
    expect(calls[0]?.sql).toContain('m.empresa_id = ?');
    expect(calls[0]?.sql).toContain('m.deleted_at IS NULL');
    expect(calls[0]?.sql).toContain('c.deleted_at IS NULL');
    expect(calls[0]?.bindings).toEqual([99, 6]);
    expect(calls[1]?.bindings).toEqual([101]);
  });

  it('read-only completed enrollment is REVIEW, not a new training cycle', async () => {
    const { db } = createHarness({ status: 'CONCLUIDO' });
    await expect(request(db)).resolves.toMatchObject({ mode: 'REVIEW' });
  });

  it('rejects tenant mismatch even if mock DB returns an unrelated enrollment', async () => {
    const { db } = createHarness({ empresa_id: 7 });
    await expect(request(db)).rejects.toMatchObject({ code: 'NATIVE_ENROLLMENT_NOT_FOUND', status: 404 });
  });

  it('does not admit an enrollment owned by a different employee', async () => {
    const { db } = createHarness({ funcionario_id: 20 });
    await expect(request(db)).rejects.toMatchObject({ code: 'NATIVE_ENROLLMENT_ACCESS_DENIED', status: 403 });
  });

  it('denies missing user-employee linkage and does not trust JWT employee claims', async () => {
    const { db } = createHarness({}, null);
    await expect(request(db)).rejects.toBeInstanceOf(NativeAdmissionError);
    const other = createHarness({}, { funcionario_id: null });
    await expect(request(other.db)).rejects.toMatchObject({ status: 403 });
  });

  it('never silently falls back to SCORM or an older active package', async () => {
    const { db } = createHarness({ tipo_conteudo: 'scorm' });
    await expect(request(db)).rejects.toMatchObject({ code: 'NATIVE_COURSE_NOT_AVAILABLE', status: 404 });
  });

  it('requires published, active course', async () => {
    for (const override of [{ publicado: 0 }, { ativo: 0 }]) {
      const { db } = createHarness(override);
      await expect(request(db)).rejects.toMatchObject({ code: 'NATIVE_COURSE_NOT_PUBLISHED' });
    }
  });

  it('rejects cancelled/reproved enrollment, rather than silently granting a retry', async () => {
    for (const status of ['CANCELADO', 'REPROVADO']) {
      const { db } = createHarness({ status });
      await expect(request(db)).rejects.toMatchObject({ code: 'NATIVE_ENROLLMENT_NOT_ACTIVE' });
    }
  });

  it('rejects invalid IDs and never queries the DB', async () => {
    const { db, calls } = createHarness();
    await expect(request(db, { empresaId: 0 })).rejects.toMatchObject({ status: 400 });
    await expect(request(db, { actorUserId: NaN })).rejects.toMatchObject({ status: 400 });
    await expect(request(db, { matriculaId: 1.5 })).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('returns a 404 without probing for employee if enrollment is not found', async () => {
    const { db, calls } = createHarness(null);
    await expect(request(db)).rejects.toMatchObject({ code: 'NATIVE_ENROLLMENT_NOT_FOUND' });
    expect(calls).toHaveLength(1);
  });
});

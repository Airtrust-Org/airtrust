import { describe, expect, it, vi } from 'vitest';
import { projectNativeCatalogCourses } from '../../services/lms-native-catalog-course-projection';
import type { Env } from '../../types';

const courses = [
  { id: 8, titulo: 'Curso SCORM antigo', tipo_conteudo: 'scorm' },
  { id: 9, titulo: 'Curso Native novo', tipo_conteudo: 'scorm' },
  { id: 10, titulo: 'Curso PDF', tipo_conteudo: 'pdf' },
];
function setup(marked: unknown, flag = '6', environment: Env['ENVIRONMENT'] = 'staging') {
  const all = vi.fn(async () => ({ results: marked }));
  const bind = vi.fn(() => ({ all }));
  const prepare = vi.fn(() => ({ bind }));
  const env = {
    ENVIRONMENT: environment,
    NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS: flag,
    DB: { prepare } as unknown as D1Database,
  } as Env;
  return { env, all, bind, prepare };
}
describe('Native catalog API effective type projection', () => {
  it('projects only tenant-scoped activation rows into Native without mutating source rows', async () => {
    const { env, bind } = setup([{ curso_id: 9 }]);
    const out = await projectNativeCatalogCourses(env, 6, courses);
    expect(out.map((x) => x.tipo_conteudo)).toEqual(['scorm', 'native', 'pdf']);
    expect(courses[1].tipo_conteudo).toBe('scorm');
    expect(bind).toHaveBeenCalledWith(6, 8, 9, 10);
  });
  it('does not consult marker table without exact staging opt-in or with empty results', async () => {
    const inactive = setup([{ curso_id: 9 }], '');
    expect(await projectNativeCatalogCourses(inactive.env, 6, courses)).toEqual(courses);
    expect(inactive.prepare).not.toHaveBeenCalled();
    const production = setup([{ curso_id: 9 }], '6', 'production');
    expect(await projectNativeCatalogCourses(production.env, 6, courses)).toEqual(courses);
    expect(production.prepare).not.toHaveBeenCalled();
    const empty = setup([{ curso_id: 9 }]);
    expect(await projectNativeCatalogCourses(empty.env, 6, [])).toEqual([]);
    expect(empty.prepare).not.toHaveBeenCalled();
  });
  it('preserves unmarked SCORM courses for allowlisted tenants', async () => {
    const { env } = setup([]);
    expect(await projectNativeCatalogCourses(env, 6, courses)).toEqual(courses);
  });
  it('refuses a marker pointing to non-SCORM content', async () => {
    const { env } = setup([{ curso_id: 10 }]);
    await expect(projectNativeCatalogCourses(env, 6, courses)).rejects.toMatchObject({
      statusCode: 503, code: 'NATIVE_CATALOG_ACTIVATION_CONFLICT',
    });
  });
  it('rejects unauthorized, duplicate and malformed marker IDs without returning a classification', async () => {
    for (const bad of [[{ curso_id: 7 }], [{ curso_id: 9 }, { curso_id: 9 }], [{ curso_id: '9' }]]) {
      const { env } = setup(bad);
      await expect(projectNativeCatalogCourses(env, 6, courses)).rejects.toMatchObject({
        statusCode: 503, code: 'NATIVE_CATALOG_ACTIVATION_CONFLICT',
      });
    }
  });
  it('fails closed on missing marker table or unavailable D1 once enabled', async () => {
    const { env, all } = setup([]);
    all.mockRejectedValueOnce(new Error('no such table'));
    await expect(projectNativeCatalogCourses(env, 6, courses)).rejects.toMatchObject({
      statusCode: 503, code: 'NATIVE_CATALOG_ACTIVATION_LOOKUP_FAILED',
    });
  });
  it('rejects malformed course identities before SQL generation', async () => {
    const { env, prepare } = setup([]);
    await expect(projectNativeCatalogCourses(env, 6, [
      { id: 8, tipo_conteudo: 'scorm' }, { id: 8, tipo_conteudo: 'scorm' },
    ])).rejects.toMatchObject({ code: 'NATIVE_CATALOG_INVALID_COURSE_IDS' });
    expect(prepare).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mayNotifyEnrollmentForCourse } from '../../services/lms-draft-enrollment-policy';

describe('LMS draft enrollment notification policy', () => {
  it('keeps draft pre-enrollments silent even when an admin requested invitations', () => {
    expect(mayNotifyEnrollmentForCourse({ publicado: 0 })).toBe(false);
    expect(mayNotifyEnrollmentForCourse({ publicado: '0' })).toBe(false);
    expect(mayNotifyEnrollmentForCourse({ publicado: null })).toBe(false);
  });
  it('preserves published course invitations and in-app notices', () => {
    expect(mayNotifyEnrollmentForCourse({ publicado: 1 })).toBe(true);
    expect(mayNotifyEnrollmentForCourse({ publicado: '1' })).toBe(true);
  });
  it('requires both single and batch routes to check publication before all invitations', () => {
    const source = readFileSync(new URL('../../routes/lms-matriculas.ts', import.meta.url).pathname, 'utf8');
    const postOne = source.split("app.post('/', async (c) => {")[1].split("app.post('/lote'")[0];
    const postBatch = source.split("app.post('/lote'")[1].split("app.post('/scorm/commit'")[0];
    for (const route of [postOne, postBatch]) {
      expect(route.match(/if \(mayNotifyEnrollmentForCourse\(curso\)\) await createLmsInAppNotification/g)?.length).toBe(2);
      expect(route.match(/if \(mayNotifyEnrollmentForCourse\(curso\) && enviar_convite_email\)/g)?.length).toBe(2);
      expect(route).toMatch(/publicado, tipo_conteudo, scorm_package_r2_prefix FROM lms_cursos/);
      expect(route).toMatch(/await assertPublishedScormEnrollmentReady\(db, empresaId, curso_id, curso\)/);
    }
  });
});

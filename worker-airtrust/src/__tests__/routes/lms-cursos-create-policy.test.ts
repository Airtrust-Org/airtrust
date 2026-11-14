import { describe, expect, it } from 'vitest';
import { parseCursoCreateRequest } from '../../routes/lms-cursos-legacy';

function requestFor(role: 'admin' | 'manager', payload: Record<string, string>, multipart: boolean) {
  const form = new FormData();
  for (const [key, value] of Object.entries(payload)) form.set(key, value);
  return {
    get(key: string) { return key === 'userRole' ? role : undefined; },
    req: {
      header(key: string) { return key === 'content-type' ? (multipart ? 'multipart/form-data; boundary=test' : 'application/json') : undefined; },
      async json() { return payload; },
      async formData() { return form; },
    },
  } as never;
}

describe('SCORM course create request policy defaults by RBAC role', () => {
  for (const multipart of [false, true]) {
    const kind = multipart ? 'multipart' : 'JSON';
    it(`defaults admin ${kind} SCORM to FORMATIVE`, async () => {
      const request = requestFor('admin', { titulo: 'Treinamento novo', tipo_conteudo: 'scorm' }, multipart);
      const { data } = await parseCursoCreateRequest(request);
      expect(data.scorm_assessment_policy).toBe('FORMATIVE');
    });
    it(`keeps manager ${kind} SCORM default SCORED (no unexpected 403)`, async () => {
      const request = requestFor('manager', { titulo: 'Treinamento novo', tipo_conteudo: 'scorm' }, multipart);
      const { data } = await parseCursoCreateRequest(request);
      expect(data.scorm_assessment_policy).toBe('SCORED');
    });
    it(`preserves explicitly chosen SCORED for admin ${kind}`, async () => {
      const request = requestFor('admin', {
        titulo: 'Treinamento com avaliação', tipo_conteudo: 'scorm',
        scorm_assessment_policy: 'SCORED',
      }, multipart);
      const { data } = await parseCursoCreateRequest(request);
      expect(data.scorm_assessment_policy).toBe('SCORED');
    });
  }
});

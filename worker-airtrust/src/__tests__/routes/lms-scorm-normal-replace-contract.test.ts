import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/routes/lms-cursos-upload-routes.ts'),
  'utf8',
);

describe('LMS SCORM normal replacement contract', () => {
  it('keeps the normal edit flow separate from candidate Quality Gate publication', () => {
    expect(source).toContain("uploadMode === 'replace-content'");
    expect(source).toContain("tipoConteudo: 'scorm'");
    expect(source).toContain('await uploadLmsZipPackage({');
    expect(source).toContain('await createScormPackageCandidate({');
  });

  it('preserves RBAC on the direct SCORM endpoint', () => {
    const routeStart = source.indexOf("'/:id/scorm-upload'");
    expect(routeStart).toBeGreaterThan(-1);
    const routeBlock = source.slice(routeStart, routeStart + 260);
    expect(routeBlock).toContain("requireRole('admin', 'manager')");
    expect(routeBlock).toContain("requireOperacoesCurso('update')");
  });

  it('does not redirect normal SCORM replacement to the Quality Gate message', () => {
    expect(source).not.toContain(
      'Upload SCORM estruturado foi desativado: envie o ZIP para o Quality Gate',
    );
    expect(source).toContain(
      'Upload SCORM arquivo-a-arquivo não é suportado; envie o ZIP completo',
    );
  });
});

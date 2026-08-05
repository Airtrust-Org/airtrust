import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const domainMiddleware = readFileSync(
  join(root, 'worker-airtrust/src/middleware/domainEventProcessor.ts'),
  'utf8',
);
const integrityMiddleware = readFileSync(
  join(root, 'worker-airtrust/src/middleware/lms-completion-integrity.ts'),
  'utf8',
);
const matriculasRoute = readFileSync(
  join(root, 'worker-airtrust/src/routes/lms-matriculas.ts'),
  'utf8',
);
const progressoRoute = readFileSync(
  join(root, 'worker-airtrust/src/routes/lms-progresso.ts'),
  'utf8',
);
const validationRoute = readFileSync(
  join(root, 'worker-airtrust/src/routes/certificados/validacao.ts'),
  'utf8',
);

describe('guard:lms-completion-single-entry-point', () => {
  it('runs the integrity gate after auth/tenant middleware and before route handlers', () => {
    expect(domainMiddleware).toContain("import { enforceLmsCompletionIntegrity }");
    const gate = domainMiddleware.indexOf('await enforceLmsCompletionIntegrity');
    const next = domainMiddleware.indexOf('await next();');
    expect(gate).toBeGreaterThan(0);
    expect(next).toBeGreaterThan(gate);
  });

  it('keeps completion persistence behind the canonical completion service', () => {
    for (const source of [matriculasRoute, progressoRoute]) {
      expect(source).toContain('completeLmsMatricula');
      expect(source).not.toMatch(/INSERT\s+INTO\s+qualificacoes_historico/i);
      expect(source).not.toContain('generateCertificateForHistorico');
    }
    expect(matriculasRoute).toContain('ensureCertificateForQualification');
    expect(matriculasRoute.indexOf('completeLmsMatricula')).toBeLessThan(
      matriculasRoute.lastIndexOf('ensureCertificateForQualification'),
    );
  });

  it('guards every completion-capable LMS surface with the same decision engine', () => {
    expect(integrityMiddleware).toContain("path === '/api/lms/matriculas/scorm/commit'");
    expect(integrityMiddleware).toContain("path === '/api/lms/xapi/statements'");
    expect(integrityMiddleware).toContain('/finalizar');
    expect(integrityMiddleware).toContain('/status');
    expect(integrityMiddleware).toContain('evaluateLmsCompletionEvidence');
  });

  it('uses canonical usuario-to-funcionario linkage for own progress', () => {
    expect(integrityMiddleware).toContain(
      'SELECT funcionario_id FROM usuarios WHERE id = ? AND deleted_at IS NULL',
    );
    expect(integrityMiddleware).not.toContain(
      'SELECT id FROM funcionarios WHERE usuario_id = ?',
    );
    expect(integrityMiddleware).toContain('LMS_PROGRESS_OWNERSHIP_REQUIRED');
    expect(integrityMiddleware).toContain('AND empresa_id = ? AND funcionario_id = ?');
  });

  it('20-22. governs rematriculation and own/other employee progress explicitly', () => {
    expect(integrityMiddleware).toContain('LMS_REMATRICULATION_REQUIRED');
    expect(integrityMiddleware).toContain('/rematricular');
    expect(integrityMiddleware).toContain("status = 'NAO_INICIADO'");
    expect(integrityMiddleware).toContain("INSERT INTO lms_matricula_ciclos");
    expect(integrityMiddleware).toContain('actorFuncionarioId !== existing.funcionario_id');
  });

  it('23-25. reverses completion without silent deletion and invalidates certificate QR', () => {
    expect(integrityMiddleware).toContain('LMS_COMPLETION_REVERSED');
    expect(integrityMiddleware).toContain("status = 'INVALIDADA'");
    expect(integrityMiddleware).toContain('UPDATE documentos');
    expect(integrityMiddleware).toContain('qr_valido: false');
    expect(validationRoute).toContain('WHERE qh.deleted_at IS NULL');
    expect(validationRoute).toContain('AND d.deleted_at IS NULL');
  });

  it('17. scopes all completion evidence by matrícula and authenticated tenant', () => {
    expect(integrityMiddleware).toContain('WHERE m.id = ?');
    expect(integrityMiddleware).toContain('AND m.empresa_id = ?');
    expect(integrityMiddleware).toContain('Number(payload.empresa_id ?? 0) === row.empresa_id');
  });

  it('26. blocks new direct qualification or certificate generation in SCORM routes', () => {
    const forbidden = [
      /INSERT\s+INTO\s+qualificacoes_historico/i,
      /generateCertificateForHistorico\s*\(/,
      /INSERT\s+INTO\s+documentos[\s\S]{0,200}certificado/i,
    ];
    for (const source of [matriculasRoute, progressoRoute, integrityMiddleware]) {
      for (const pattern of forbidden) expect(source).not.toMatch(pattern);
    }
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const cwd = process.cwd();
const workerRoot = existsSync(join(cwd, 'src', 'middleware', 'domainEventProcessor.ts'))
  ? cwd
  : join(cwd, 'worker-airtrust');
const domainMiddleware = readFileSync(
  join(workerRoot, 'src/middleware/domainEventProcessor.ts'),
  'utf8',
);
const integrityMiddleware = readFileSync(
  join(workerRoot, 'src/middleware/lms-completion-integrity.ts'),
  'utf8',
);
const persistedProgressMiddleware = readFileSync(
  join(workerRoot, 'src/middleware/lms-completion-persisted-progress.ts'),
  'utf8',
);
const reversalMiddleware = readFileSync(
  join(workerRoot, 'src/middleware/lms-completion-reversal.ts'),
  'utf8',
);
const enrollmentMiddleware = readFileSync(
  join(workerRoot, 'src/middleware/lms-enrollment-integrity.ts'),
  'utf8',
);
const matriculasRoute = readFileSync(join(workerRoot, 'src/routes/lms-matriculas.ts'), 'utf8');
const progressoRoute = readFileSync(join(workerRoot, 'src/routes/lms-progresso.ts'), 'utf8');
const validationRoute = readFileSync(
  join(workerRoot, 'src/routes/certificados/validacao.ts'),
  'utf8',
);

describe('guard:lms-completion-single-entry-point', () => {
  it('runs all LMS integrity gates after auth/tenant and before route handlers', () => {
    expect(domainMiddleware).toContain('import { enforceLmsCompletionIntegrity }');
    expect(domainMiddleware).toContain('import { enforceLmsCompletionReversal }');
    expect(domainMiddleware).toContain('import { enforceLmsEnrollmentIntegrity }');
    expect(domainMiddleware).toContain('import { enforcePersistedLmsProgressEvidence }');
    const reversal = domainMiddleware.indexOf('await enforceLmsCompletionReversal');
    const enrollment = domainMiddleware.indexOf('await enforceLmsEnrollmentIntegrity');
    const persisted = domainMiddleware.indexOf('await enforcePersistedLmsProgressEvidence');
    const integrity = domainMiddleware.indexOf('await enforceLmsCompletionIntegrity');
    const next = domainMiddleware.indexOf('await next();');
    expect(reversal).toBeGreaterThan(0);
    expect(enrollment).toBeGreaterThan(reversal);
    expect(persisted).toBeGreaterThan(enrollment);
    expect(integrity).toBeGreaterThan(persisted);
    expect(next).toBeGreaterThan(integrity);
  });

  it('requires progress persisted before the terminal SCORM/xAPI payload', () => {
    expect(persistedProgressMiddleware).toContain('LMS_PERSISTED_PROGRESS_REQUIRED');
    expect(persistedProgressMiddleware).toContain('m.progresso_pct AS matricula_progresso_pct');
    expect(persistedProgressMiddleware).toContain('FROM lms_xapi_statements x');
    expect(persistedProgressMiddleware).toContain('hasPersistedCompletionProgressEvidence(row)');
    expect(persistedProgressMiddleware).not.toMatch(/score_raw|score_scaled/);
    expect(persistedProgressMiddleware).not.toContain('body.cmi_json');
  });

  it('rejects xAPI completion flags without a canonical terminal verb', () => {
    expect(persistedProgressMiddleware).toContain('LMS_XAPI_TERMINAL_VERB_REQUIRED');
    expect(persistedProgressMiddleware).toContain("verb.endsWith('/passed')");
    expect(persistedProgressMiddleware).toContain("verb.endsWith('/completed')");
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
    expect(integrityMiddleware).not.toContain('SELECT id FROM funcionarios WHERE usuario_id = ?');
    expect(integrityMiddleware).toContain('LMS_PROGRESS_OWNERSHIP_REQUIRED');
    expect(integrityMiddleware).toContain('AND empresa_id = ? AND funcionario_id = ?');
  });

  it('applies direct course scope before qualification-sector fallback', () => {
    const directAny = enrollmentMiddleware.indexOf('direct_any');
    const directMatch = enrollmentMiddleware.indexOf('direct_match');
    const fallback = enrollmentMiddleware.indexOf('fallback_match');
    expect(directAny).toBeGreaterThan(0);
    expect(directMatch).toBeGreaterThan(directAny);
    expect(fallback).toBeGreaterThan(directMatch);
    expect(enrollmentMiddleware).toContain('LMS_SELF_ENROLLMENT_NOT_ALLOWED');
    expect(enrollmentMiddleware).toContain('LMS_SELF_ENROLLMENT_POLICY_UNAVAILABLE');
  });

  it('20-22. governs rematriculation and own/other employee progress explicitly', () => {
    expect(integrityMiddleware).toContain('LMS_REMATRICULATION_REQUIRED');
    expect(enrollmentMiddleware).toContain('/rematricular');
    expect(enrollmentMiddleware).toContain("status = 'NAO_INICIADO'");
    expect(enrollmentMiddleware).toMatch(/INSERT\s+INTO\s+lms_matricula_ciclos/);
    expect(enrollmentMiddleware).toContain('LMS_REMATRICULATION_CONFLICT');
    expect(enrollmentMiddleware).toContain('operation_id');
    expect(enrollmentMiddleware).toContain('LMS_REMATRICULATION:');
    expect(integrityMiddleware).toContain('actorFuncionarioId !== existing.funcionario_id');
  });

  it('makes concurrent rematriculation conditional on the winning operation marker', () => {
    expect(enrollmentMiddleware).toContain('instr(COALESCE(marker_m.observacoes');
    expect(enrollmentMiddleware).toContain('WHERE ${markerExists}');
    expect(enrollmentMiddleware).toContain("action = 'LMS_REMATRICULATION'");
    expect(enrollmentMiddleware).toContain('A matrícula já foi reativada por outra operação.');
  });

  it('23-25. reverses completion with a schema-valid revocation and invalidates QR', () => {
    expect(reversalMiddleware).toContain('LMS_COMPLETION_REVERSED');
    expect(reversalMiddleware).toContain("status = 'CANCELADA'");
    expect(reversalMiddleware).not.toContain("status = 'INVALIDADA'");
    expect(reversalMiddleware).toContain('UPDATE documentos');
    expect(reversalMiddleware).toContain('deleted_at = COALESCE(deleted_at');
    expect(reversalMiddleware).toContain('qr_valido: false');
    expect(validationRoute).toContain('WHERE qh.deleted_at IS NULL');
    expect(validationRoute).toContain('AND d.deleted_at IS NULL');
  });

  it('17. scopes all completion evidence by matrícula and authenticated tenant', () => {
    expect(integrityMiddleware).toContain('WHERE m.id = ?');
    expect(integrityMiddleware).toContain('AND m.empresa_id = ?');
    expect(integrityMiddleware).toContain('Number(payload.empresa_id ?? 0) === row.empresa_id');
    expect(persistedProgressMiddleware).toContain('AND m.empresa_id = ?');
    expect(enrollmentMiddleware).toContain('AND c.empresa_id = ?');
    expect(reversalMiddleware).toContain('WHERE m.id = ? AND m.empresa_id = ?');
  });

  it('26. blocks new direct qualification or certificate generation in SCORM routes', () => {
    const forbidden = [
      /INSERT\s+INTO\s+qualificacoes_historico/i,
      /generateCertificateForHistorico\s*\(/,
      /INSERT\s+INTO\s+documentos[\s\S]{0,200}certificado/i,
    ];
    for (const source of [
      matriculasRoute,
      progressoRoute,
      integrityMiddleware,
      persistedProgressMiddleware,
      reversalMiddleware,
      enrollmentMiddleware,
    ]) {
      for (const pattern of forbidden) expect(source).not.toMatch(pattern);
    }
  });
});

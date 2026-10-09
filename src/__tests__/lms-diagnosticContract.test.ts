import { describe, expect, it } from 'vitest';

import {
  GENERIC_PENDING_FALLBACK,
  MAX_DIAGNOSTIC_PAYLOAD_CHARS,
  formatPendingItemDisplay,
  parseGranularDiagnostic,
  resolveCompletionExplanation,
  sanitizeText,
  type LmsGranularDiagnostic,
} from '@/react-app/utils/lmsDiagnosticContract';

function baseGranular(overrides: Partial<LmsGranularDiagnostic> = {}): LmsGranularDiagnostic {
  return {
    version: 1,
    courseId: 'curso-1',
    currentSlide: null,
    slides: { totalRequired: 10, completedRequired: 10, missing: [] },
    assessment: {
      required: false,
      completed: true,
      scoreRaw: null,
      masteryScore: null,
      passed: null,
      unanswered: [],
      incomplete: [],
    },
    packageStatus: { lessonStatus: 'incomplete', finishRequested: false },
    updatedAt: '2026-08-24T00:00:00Z',
    ...overrides,
  };
}

const REJECTED = { status: 'rejected', code: 'SCORM_COMPLETION_REJECTED', can_finalize: false };

describe('parseGranularDiagnostic', () => {
  it('rejects malformed / invalid payloads silently (test 6)', () => {
    expect(parseGranularDiagnostic(null)).toBeNull();
    expect(parseGranularDiagnostic(undefined)).toBeNull();
    expect(parseGranularDiagnostic('nope')).toBeNull();
    expect(parseGranularDiagnostic(42)).toBeNull();
    expect(parseGranularDiagnostic([])).toBeNull();
    expect(parseGranularDiagnostic({})).toBeNull();
    expect(parseGranularDiagnostic({ version: 2 })).toBeNull();
    expect(parseGranularDiagnostic({ version: '1' })).toBeNull();
  });

  it('rejects oversized payloads', () => {
    const huge = { version: 1, courseId: 'x'.repeat(MAX_DIAGNOSTIC_PAYLOAD_CHARS + 10) };
    expect(parseGranularDiagnostic(huge)).toBeNull();
  });

  it('rejects circular structures without throwing', () => {
    const circular: Record<string, unknown> = { version: 1 };
    circular.self = circular;
    expect(parseGranularDiagnostic(circular)).toBeNull();
  });

  it('drops unknown fields and tolerates missing sections', () => {
    const parsed = parseGranularDiagnostic({ version: 1, hackerField: 'x', slides: 'not-an-object' });
    expect(parsed).not.toBeNull();
    expect(parsed as unknown as Record<string, unknown>).not.toHaveProperty('hackerField');
    expect(parsed?.slides.missing).toEqual([]);
  });

  it('ignores tenant/enrollment identifiers asserted by the payload (test 9)', () => {
    const parsed = parseGranularDiagnostic({
      version: 1,
      courseId: 'curso-legit',
      matriculaId: 999,
      empresaId: 42,
      empresa_id: 42,
      userId: 7,
    });
    const asRecord = parsed as unknown as Record<string, unknown>;
    expect(asRecord).not.toHaveProperty('matriculaId');
    expect(asRecord).not.toHaveProperty('empresaId');
    expect(asRecord).not.toHaveProperty('empresa_id');
    expect(asRecord).not.toHaveProperty('userId');
  });

  it('sanitizes control characters and caps text length', () => {
    expect(sanitizeText('a\u0000b\u001fc')).toBe('a b c');
    expect(sanitizeText('  spaced   out  ')).toBe('spaced out');
    expect(sanitizeText(123)).toBeNull();
    expect(sanitizeText('')).toBeNull();
    expect(sanitizeText('x'.repeat(500))?.length).toBe(200);
  });

  it('caps collection sizes', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ id: `s${i}`, index: i, title: `T${i}` }));
    const parsed = parseGranularDiagnostic({ version: 1, slides: { missing: many } });
    expect(parsed!.slides.missing.length).toBeLessThanOrEqual(200);
  });
});

describe('formatPendingItemDisplay', () => {
  it('uses friendly names when the package supplies them', () => {
    expect(
      formatPendingItemDisplay({ id: 's12', index: 12, title: 'Sistema Hidráulico' }, 'slide'),
    ).toBe('Slide 12 — Sistema Hidráulico');
  });

  it('never invents a title when none is supplied', () => {
    expect(formatPendingItemDisplay({ id: 's12', index: 12, title: null }, 'slide')).toBe('Slide 12');
    expect(formatPendingItemDisplay(null, 'question')).toBe('Questão');
  });
});

describe('PPSP: aceitação canônica versus matrícula em aberto', () => {
  it('não inventa pendências para SCORM aprovado que aguarda o registro da matrícula', () => {
    const result = resolveCompletionExplanation({
      canonical: {
        status: 'accepted', code: 'SCORM_COMPLETION_ACCEPTED',
        can_finalize: false, explicit_completion: true,
        explicit_failure: false, mastery_score: 70, score_pct: 100,
      },
      granular: null,
    });
    expect(result.canComplete).toBe(false);
    expect(result.registrationPending).toBe(true);
    expect(result.items).toEqual([]);
    expect(result.adminItems).toEqual([]);
    expect(result.summary).toMatch(/AirTrust está confirmando a matrícula/);
    expect(result.summary).not.toBe(GENERIC_PENDING_FALLBACK);
  });
  it('preserva alertas legítimos para conclusão rejeitada sem evidências', () => {
    const result = resolveCompletionExplanation({ canonical: REJECTED, granular: null });
    expect(result.registrationPending).not.toBe(true);
    expect(result.summary).toBe(GENERIC_PENDING_FALLBACK);
  });
});

describe('resolveCompletionExplanation', () => {
  it('returns exactly 3 items for 3 missing slides (test 1)', () => {
    const result = resolveCompletionExplanation({
      canonical: REJECTED,
      granular: baseGranular({
        slides: {
          totalRequired: 10,
          completedRequired: 7,
          missing: [
            { id: 's3', index: 3, title: 'Motores' },
            { id: 's7', index: 7, title: null },
            { id: 's9', index: 9, title: 'Hidráulico' },
          ],
        },
      }),
    });
    expect(result.canComplete).toBe(false);
    expect(result.category).toBe('CONTENT');
    expect(result.items).toHaveLength(3);
    expect(result.items[0].label).toBe('Slide 3 — Motores');
    expect(result.items[1].label).toBe('Slide 7');
    expect(result.diagnosticsAvailable).toBe(true);
  });

  it('returns exactly 2 items for 2 unanswered questions and exposes no answers (test 2)', () => {
    const result = resolveCompletionExplanation({
      canonical: REJECTED,
      granular: baseGranular({
        assessment: {
          required: true,
          completed: false,
          scoreRaw: null,
          masteryScore: null,
          passed: null,
          unanswered: [
            { id: 'q4', index: 4, title: 'Limites operacionais' },
            { id: 'q8', index: 8, title: 'Procedimento de degelo' },
          ],
          incomplete: [],
        },
      }),
    });
    expect(result.category).toBe('ASSESSMENT');
    expect(result.items).toHaveLength(2);
    const serialized = JSON.stringify(result).toLowerCase();
    for (const forbidden of ['correct', 'correta', 'resposta_correta', 'answerkey', 'gabarito']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('shows obtained and minimum score when below mastery (test 3)', () => {
    const result = resolveCompletionExplanation({
      canonical: { ...REJECTED, explicit_failure: true, score_pct: 62, mastery_score: 80 },
      granular: baseGranular({
        assessment: {
          required: true,
          completed: true,
          scoreRaw: 62,
          masteryScore: 80,
          passed: false,
          unanswered: [],
          incomplete: [],
        },
      }),
    });
    expect(result.category).toBe('SCORE');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].label).toContain('62');
    expect(result.items[0].label).toContain('80');
  });

  it('generic fallback for legacy packages, inventing nothing (test 5)', () => {
    const result = resolveCompletionExplanation({ canonical: REJECTED, granular: null });
    expect(result.canComplete).toBe(false);
    expect(result.diagnosticsAvailable).toBe(false);
    expect(result.category).toBe('UNKNOWN');
    expect(result.summary).toBe(GENERIC_PENDING_FALLBACK);
    expect(result.items).toHaveLength(0);
  });

  it('tracks ADMIN issues separately from student-actionable items (test 11)', () => {
    const result = resolveCompletionExplanation({
      canonical: { status: 'rejected', code: 'SCORM_STATUS_INCONSISTENT', can_finalize: false },
      granular: baseGranular({
        slides: { totalRequired: 5, completedRequired: 2, missing: [{ id: 's1', index: 1, title: null }] },
      }),
    });
    expect(result.category).toBe('ADMIN');
    expect(result.adminItems).toHaveLength(1);
    expect(result.adminItems[0].adminActionable).toBe(true);
    expect(result.items).toHaveLength(0);
  });

  it('does not complete when payload claims done but canonical says incomplete (test 10)', () => {
    const result = resolveCompletionExplanation({
      canonical: REJECTED,
      granular: baseGranular({
        assessment: {
          required: true,
          completed: true,
          scoreRaw: 100,
          masteryScore: 70,
          passed: true,
          unanswered: [],
          incomplete: [],
        },
        packageStatus: { lessonStatus: 'completed', finishRequested: true },
      }),
    });
    expect(result.canComplete).toBe(false);
  });

  it('completes when canonical authorizes it (test 16)', () => {
    const result = resolveCompletionExplanation({
      canonical: { status: 'accepted', code: 'SCORM_COMPLETION_ACCEPTED', can_finalize: true },
      granular: baseGranular(),
    });
    expect(result.canComplete).toBe(true);
    expect(result.items).toHaveLength(0);
  });

  it('applies priority ADMIN > score > questions > slides', () => {
    const everything = baseGranular({
      slides: { totalRequired: 5, completedRequired: 1, missing: [{ id: 's1', index: 1, title: null }] },
      assessment: {
        required: true,
        completed: false,
        scoreRaw: 10,
        masteryScore: 80,
        passed: false,
        unanswered: [{ id: 'q1', index: 1, title: null }],
        incomplete: [],
      },
    });
    expect(
      resolveCompletionExplanation({
        canonical: { code: 'SCORM_STATUS_INCONSISTENT', can_finalize: false },
        granular: everything,
      }).category,
    ).toBe('ADMIN');
    expect(
      resolveCompletionExplanation({ canonical: REJECTED, granular: everything }).category,
    ).toBe('SCORE');
  });

  it('falls back generically when granular exists but lists nothing (priority 5)', () => {
    const result = resolveCompletionExplanation({ canonical: REJECTED, granular: baseGranular() });
    expect(result.category).toBe('SCORM_STATUS');
    expect(result.summary).toBe(GENERIC_PENDING_FALLBACK);
    expect(result.items).toHaveLength(0);
    expect(result.diagnosticsAvailable).toBe(true);
  });
});

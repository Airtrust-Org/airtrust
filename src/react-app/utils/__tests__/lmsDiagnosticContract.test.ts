import { describe, it, expect } from 'vitest';
import { resolveCompletionExplanation } from '../lmsDiagnosticContract';

describe('resolveCompletionExplanation', () => {
  it('A. canonical PASS 100/70 + granular stale failed -> NÃO mostrar falha', () => {
    const res = resolveCompletionExplanation({
      canonical: { can_finalize: true, score_pct: 100, mastery_score: 70, explicit_failure: false },
      granular: {
        assessment: { required: true, completed: true, passed: false },
        moduleResults: [
          {
            module: { id: 'm1' },
            assessment: { required: true, completed: true, passed: false, scoreRaw: 50, masteryScore: 70 }
          }
        ],
        slides: { missing: [], total: 10 }
      }
    });
    expect(res.canComplete).toBe(true);
    expect(res.items.length).toBe(0);
  });

  it('B. canonical SCORE_BELOW_MASTERY/0 + module 3 completed=false -> mostrar Módulo 3 avaliação não concluída, não apenas Nota 0', () => {
    const res = resolveCompletionExplanation({
      canonical: { can_finalize: false, score_pct: 0, mastery_score: 70, explicit_failure: true },
      granular: {
        assessment: { required: true, completed: false, passed: false },
        moduleResults: [
          {
            module: { index: 3 },
            assessment: { required: true, completed: false, passed: false, scoreRaw: 0, masteryScore: 70 }
          }
        ],
        slides: { missing: [], total: 10 }
      }
    });
    expect(res.canComplete).toBe(false);
    expect(res.items.length).toBe(1);
    expect(res.items[0].label).toContain('Módulo 3 — avaliação não concluída');
    expect(res.items[0].category).toBe('CONTENT');
  });

  it('C. canonical failure + módulo 5 score 60/70 -> mostrar módulo 5 + 60/70', () => {
    const res = resolveCompletionExplanation({
      canonical: { can_finalize: false, score_pct: 60, mastery_score: 70, explicit_failure: true },
      granular: {
        assessment: { required: true, completed: true, passed: false },
        moduleResults: [
          {
            module: { index: 5 },
            assessment: { required: true, completed: true, passed: false, scoreRaw: 60, masteryScore: 70 }
          }
        ],
        slides: { missing: [], total: 10 }
      }
    });
    expect(res.canComplete).toBe(false);
    expect(res.items.length).toBe(1);
    expect(res.items[0].label).toContain('Módulo 5');
    expect(res.items[0].label).toContain('60');
    expect(res.items[0].category).toBe('SCORE');
  });

  it('D. dois módulos pendentes -> listar ambos', () => {
    const res = resolveCompletionExplanation({
      canonical: { can_finalize: false, explicit_failure: true },
      granular: {
        assessment: { required: true, completed: false, passed: false },
        moduleResults: [
          { module: { index: 1 }, assessment: { required: true, completed: false, passed: false } },
          { module: { index: 2 }, assessment: { required: true, completed: false, passed: false } }
        ],
        slides: { missing: [], total: 10 }
      }
    });
    expect(res.canComplete).toBe(false);
    expect(res.items.length).toBe(2);
  });

  it('E. módulo incompleto + módulo reprovado -> listar ambos com severidades corretas', () => {
    const res = resolveCompletionExplanation({
      canonical: { can_finalize: false, explicit_failure: true },
      granular: {
        assessment: { required: true, completed: false, passed: false },
        moduleResults: [
          { module: { index: 1 }, assessment: { required: true, completed: false, passed: false } },
          { module: { index: 2 }, assessment: { required: true, completed: true, passed: false, scoreRaw: 40, masteryScore: 70 } }
        ],
        slides: { missing: [], total: 10 }
      }
    });
    expect(res.canComplete).toBe(false);
    expect(res.items.length).toBe(2);
    expect(res.items.find(i => i.ref?.index === 1)?.category).toBe('CONTENT'); // incompleto
    expect(res.items.find(i => i.ref?.index === 2)?.category).toBe('SCORE'); // reprovado
  });

  it('F. sem granular -> fallback global continua funcionando', () => {
    const res = resolveCompletionExplanation({
      canonical: { can_finalize: false, score_pct: 0, mastery_score: 70, explicit_failure: true },
      granular: null
    });
    expect(res.canComplete).toBe(false);
    expect(res.items.length).toBe(1);
    expect(res.items[0].category).toBe('SCORE');
    expect(res.items[0].label).toContain('Nota obtida 0');
  });

  it('G. payload malformado -> fail-safe, sem crash', () => {
    const res = resolveCompletionExplanation({
      canonical: null as any,
      granular: {} as any
    });
    expect(res.canComplete).toBe(false);
    expect(res.category).toBe('SCORM_STATUS');
  });
});

import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildScormFunctionalDriverScript } from '../../lib/lms/lms-scorm-functional-driver';

describe('SCORM Browser Rendering legacy globals fail-closed', () => {
  // ANAC #23's real R2 app defines current, completed and SLIDES, but
  // does NOT define scenarioDone, interactions or moduleQuiz. Browser
  // rendering previously threw ReferenceError at DRIVE_SCO_INTERACTIONS
  // before it could verify the genuine unload/LMSFinish lifecycle.
  const missingCases = [
    'scenarioDone', 'interactions', 'moduleQuiz', 'completed',
  ] as const;
  for (const missing of missingCases) {
    it('does not throw or fabricate completion when legacy ' + missing + ' is absent', () => {
      const ctx = createContext({
        SLIDES: [{ id: 'legacy-slide', layout: 'summary' }],
        current: 0,
        document: {
          querySelector: () => null,
          querySelectorAll: () => [],
        },
      });
      runInContext([
        'globalThis.completed=new Set();',
        'globalThis.scenarioDone=new Set();',
        'globalThis.interactions=new Map();',
        'globalThis.moduleQuiz={};',
      ].join('\n'), ctx);
      runInContext('delete globalThis.' + missing, ctx);
      const result = runInContext(buildScormFunctionalDriverScript(), ctx) as {
        supported: boolean; completed: boolean; steps: number; reason: string;
      };
      expect(result).toEqual({
        supported: false, completed: false, steps: 0,
        reason: 'NO_FACTORY_M8_DRIVER',
      });
    });
  }
  it('does not promote unsupported legacy package to certified SCO', () => {
    const ctx = createContext({ document: {
      querySelector: () => null, querySelectorAll: () => [],
    } });
    const result = runInContext(buildScormFunctionalDriverScript(), ctx);
    expect(result).toMatchObject({
      supported: false, completed: false, reason: 'NO_FACTORY_M8_DRIVER',
    });
  });
});

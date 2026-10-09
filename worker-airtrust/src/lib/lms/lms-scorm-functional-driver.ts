/**
 * Browser-only certification driver for the versioned AirTrust Factory M8 SCO.
 * It clicks the package's actual controls in sequence. It never writes LMS
 * progress directly, calls SCORM API itself, or exposes answer keys in traces.
 * Unknown packages fail closed as unverified rather than claiming publication.
 */
function driveFactoryCourse() {
  type DriverState = {
    active: number;
    mode?: string;
    completed?: boolean;
    ended?: boolean;
    done?: number[];
    choices?: Record<string, number>;
    assess?: Record<string, { passed?: boolean }>;
  };
  type DriverSlide = {
    id: string;
    kind: string;
    chapter?: number;
    options?: unknown[];
    questions?: Array<{ answer?: unknown; options?: unknown[] }>;
  };
  type DriverWindow = {
    COURSE_DATA?: { slides?: DriverSlide[]; packageVersion?: string };
    __AIRTRUST_PLAYER_TEST__?: { getState?: () => DriverState };
    document?: {
      querySelector: (selector: string) => { disabled?: boolean; click: () => void } | null;
    };
  };
  const w = globalThis as DriverWindow;
  const slides = w.COURSE_DATA?.slides;
  const getState = w.__AIRTRUST_PLAYER_TEST__?.getState;
  if (!Array.isArray(slides) || slides.length === 0 || slides.length > 1000 ||
      typeof getState !== 'function' || !w.document) {
    return { supported: false, completed: false, steps: 0, reason: 'NO_FACTORY_M8_DRIVER' };
  }
  const click = (selector: string): boolean => {
    const control = w.document?.querySelector(selector);
    if (!control || control.disabled) return false;
    control.click();
    return true;
  };
  const fail = (reason: string, steps: number) => ({
    supported: true, completed: false, steps, reason,
  });
  const limit = Math.min(3000, Math.max(120, slides.length * 5));
  for (let steps = 0; steps < limit; steps++) {
    const state = getState();
    // A resumed course may require fewer clicks than its full slide count.
    // Certify only when every authored slide index was completed in the
    // package's own state, not because a short tail reached LMSFinish.
    if (state?.completed && state.ended && steps > 0 &&
        Array.isArray(state.done) && state.done.length === slides.length &&
        new Set(state.done).size === slides.length &&
        state.done.every((n) => Number.isInteger(n) && n >= 0 && n < slides.length)) {
      return { supported: true, completed: true, steps, reason: null };
    }
    if (!state || !Number.isInteger(state.active) || state.active < 0 ||
        state.active >= slides.length || state.mode === 'preview') {
      return fail('INVALID_FACTORY_STATE', steps);
    }
    const current = state.active;
    const slide = slides[current];
    if (slide.kind === 'decision' && state.choices?.[slide.id] === undefined) {
      if (!click('button[data-choice]')) return fail('DECISION_CONTROL_MISSING', steps);
    }
    if (slide.kind === 'assessment' && !state.assess?.[String(slide.chapter)]?.passed) {
      if (!Array.isArray(slide.questions) || !slide.questions.length ||
          slide.questions.length > 100) return fail('ASSESSMENT_FORMAT_UNSUPPORTED', steps);
      for (let index = 0; index < slide.questions.length; index++) {
        const question = slide.questions[index];
        if (!question || !Array.isArray(question.options)) {
          return fail('ASSESSMENT_FORMAT_UNSUPPORTED', steps);
        }
        const correct = question.answer;
        if (!Number.isInteger(correct) || Number(correct) < 0 ||
            Number(correct) >= question.options.length) {
          return fail('AUTHORED_ANSWER_UNAVAILABLE', steps);
        }
        if (index > 0 && !click('#qNext')) return fail('QUESTION_NEXT_MISSING', steps);
        if (!click('button[data-answer="' + String(correct) + '"]')) {
          return fail('ANSWER_CONTROL_MISSING', steps);
        }
      }
      if (!click('#next')) return fail('ASSESSMENT_SUBMIT_MISSING', steps);
      if (!getState().assess?.[String(slide.chapter)]?.passed) {
        return fail('ASSESSMENT_NOT_MASTERED', steps);
      }
    }
    if (!click('#next')) return fail('COURSE_NEXT_MISSING', steps);
    const after = getState();
    if (after.active === current && !after.ended) return fail('COURSE_NOT_ADVANCED', steps);
  }
  return fail('MAX_FACTORY_STEPS_EXCEEDED', limit);
}

export function buildScormFunctionalDriverScript(): string {
  return '(' + driveFactoryCourse.toString() + ')()';
}

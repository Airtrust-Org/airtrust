/**
 * Browser-only certification driver for supported AirTrust Factory M8 SCOs.
 * It clicks the package's actual controls in sequence. It never writes LMS
 * progress directly, calls SCORM API itself, or exposes answer keys in traces.
 * Unknown packages fail closed as unverified rather than claiming publication.
 */
function driveFactoryCourse() {
  type DriverState = {
    active?: number;
    view?: number;
    journey?: number;
    mode?: string;
    completed?: boolean;
    ended?: boolean;
    courseCompleted?: boolean;
    done?: number[];
    choices?: Record<string, number>;
    scenarioState?: Record<string, number>;
    scenario?: Record<string, number>;
    gateSeen?: string[];
    assess?: Record<string, { passed?: boolean; q?: number }>;
    assessmentState?: Record<string, { passed?: boolean; q?: number }>;
    assessments?: Record<string, { passed?: boolean; q?: number }>;
    completionReady?: boolean;
  };
  type DriverSlide = {
    id: string;
    kind: string;
    chapter?: number;
    questions?: Array<{ answer?: unknown; correctIndex?: unknown; options?: unknown[] }>;
    content?: { options?: unknown[]; questions?: Array<{ answer?: unknown; correctIndex?: unknown; options?: unknown[] }> };
    gateItems?: unknown[];
    sectionGroups?: unknown[];
    options?: unknown[];
  };
  type DriverWindow = {
    COURSE_DATA?: { slides?: DriverSlide[]; packageVersion?: string };
    __AIRTRUST_PLAYER_TEST__?: { getState?: () => DriverState };
    document?: {
      querySelector: (selector: string) => { disabled?: boolean; click: () => void } | null;
      querySelectorAll: (selector: string) => ArrayLike<{
        disabled?: boolean;
        offsetParent?: unknown;
        click: () => void;
      }>;
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
  const clickRequiredInteractions = (): number => {
    const items = Array.from(w.document?.querySelectorAll('.screen.active [data-gate-id]') ?? []);
    let clicked = 0;
    for (const item of items) {
      if (item.disabled || item.offsetParent === null) continue;
      item.click();
      clicked++;
    }
    return clicked;
  };
  const fail = (reason: string, steps: number) => ({
    supported: true, completed: false, steps, reason,
  });
  const activeIndex = (state: DriverState): number | null => {
    const value = [state.active, state.journey, state.view].find(Number.isInteger);
    return typeof value === 'number' ? value : null;
  };
  const assessmentState = (state: DriverState, slide: DriverSlide) => {
    const bag = state.assessmentState ?? state.assessments ?? state.assess;
    return bag?.[slide.id] ?? bag?.[String(slide.chapter)];
  };
  const scenarioState = (state: DriverState, slide: DriverSlide) =>
    state.choices?.[slide.id] ?? state.scenarioState?.[slide.id] ?? state.scenario?.[slide.id];
  const authoredQuestions = (slide: DriverSlide) => slide.questions ?? slide.content?.questions ?? [];
  const allSlidesDone = (state: DriverState) =>
    Array.isArray(state.done) && state.done.length === slides.length &&
    new Set(state.done).size === slides.length &&
    state.done.every((n) => Number.isInteger(n) && n >= 0 && n < slides.length);
  const limit = Math.min(3000, Math.max(120, slides.length * 5));
  for (let steps = 0; steps < limit; steps++) {
    const state = getState();
    // A resumed course may require fewer clicks than its full slide count.
    // Certify only when every authored slide index was completed in the
    // package's own state, not because a short tail reached LMSFinish.
    if (steps > 0 && allSlidesDone(state) &&
        ((state.completed === true && state.ended === true) ||
         (state.courseCompleted === true && state.completionReady === true) ||
         (state.completionReady === true && activeIndex(state) === slides.length - 1))) {
      return { supported: true, completed: true, steps, reason: null };
    }
    const current = activeIndex(state);
    if (current === null || current < 0 || current >= slides.length || state.mode === 'preview') {
      return fail('INVALID_FACTORY_STATE', steps);
    }
    const slide = slides[current];
    if ((slide.kind === 'decision' || slide.kind === 'scenario') &&
        scenarioState(state, slide) === undefined) {
      const options = slide.content?.options ?? slide.options ?? [];
      const correct = options.findIndex((option) =>
        Array.isArray(option)
          ? option[1] === true
          : Boolean(option && typeof option === 'object' && 'correct' in option && option.correct === true),
      );
      const selected = correct >= 0 ? correct : 0;
      if (!click(`button[data-choice="${selected}"]`) &&
          !click(`[data-scenario][data-opt="${selected}"]`) &&
          !click(`[data-opt="${selected}"]`)) {
        return fail('DECISION_CONTROL_MISSING', steps);
      }
    }
    const gates = slide.gateItems ?? slide.sectionGroups ?? [];
    if (gates.length > 0 && Array.isArray(state.gateSeen)) {
      for (let index = 0; index < gates.length; index++) {
        const gateKey = `${slide.id}:${index}`;
        if (!state.gateSeen.includes(gateKey) &&
            !click(`[data-gate="${index}"]`)) {
          return fail('REQUIRED_INTERACTION_CONTROL_MISSING', steps);
        }
      }
    }
    if (slide.kind === 'assessment' && !assessmentState(state, slide)?.passed) {
      const questions = authoredQuestions(slide);
      if (!Array.isArray(questions) || !questions.length || questions.length > 100) {
        return fail('ASSESSMENT_FORMAT_UNSUPPORTED', steps);
      }
      for (let index = 0; index < questions.length; index++) {
        const question = questions[index];
        if (!question || !Array.isArray(question.options)) {
          return fail('ASSESSMENT_FORMAT_UNSUPPORTED', steps);
        }
        const correct = question.answer ?? question.correctIndex;
        if (!Number.isInteger(correct) || Number(correct) < 0 ||
            Number(correct) >= question.options.length) {
          return fail('AUTHORED_ANSWER_UNAVAILABLE', steps);
        }
        const qState = assessmentState(getState(), slide);
        const currentQuestion = Number.isInteger(qState?.q) ? Number(qState?.q) : index;
        if (currentQuestion !== index) return fail('ASSESSMENT_QUESTION_STATE_INVALID', steps);
        const answerSelector = `button[data-answer="${String(correct)}"]`;
        const scopedAnswerSelector = `[data-assessment="${slide.id}"] .ans[data-i="${String(correct)}"]`;
        if (!click(answerSelector) && !click(scopedAnswerSelector)) {
          return fail('ANSWER_CONTROL_MISSING', steps);
        }
        if (index < questions.length - 1 &&
            !click('#qNext') && !click(`[data-assessment="${slide.id}"] .qnext`)) {
          return fail('QUESTION_NEXT_MISSING', steps);
        }
      }
      if (!click('#next')) return fail('ASSESSMENT_SUBMIT_MISSING', steps);
      if (!assessmentState(getState(), slide)?.passed) {
        return fail('ASSESSMENT_NOT_MASTERED', steps);
      }
    }
    // Some authored Factory packages gate progression on learner exploration of
    // visible DOM interactions (tabs, checklists, system diagrams and timelines).
    // Their test state intentionally does not expose gate keys, so drive the
    // package's real active-screen controls and let their own click handlers
    // record the interactions before attempting the course's Next control.
    clickRequiredInteractions();
    if (!click('#next')) return fail('COURSE_NEXT_MISSING', steps);
    const after = getState();
    if (activeIndex(after) === current && after.ended !== true && after.courseCompleted !== true &&
        !(after.completionReady === true && allSlidesDone(after))) {
      return fail('COURSE_NOT_ADVANCED', steps);
    }
  }
  return fail('MAX_FACTORY_STEPS_EXCEEDED', limit);
}

/**
 * The Worker bundler may preserve inner function names by emitting __name(...)
 * inside driveFactoryCourse. Function.toString() copies that reference into
 * Browser Rendering, where the bundler's outer helper is not defined.
 * Supply a tiny, local name-annotation no-op so the authored DOM driver
 * stays self-contained in the isolated browser. This helper does NOT write
 * SCORM state or bypass any completion/assessment gate.
 */
export function wrapScormBrowserDriver(source: string): string {
  return '(() => { const __name = (target) => target; return (' + source + ')(); })()';
}

export function buildScormFunctionalDriverScript(): string {
  return wrapScormBrowserDriver(driveFactoryCourse.toString());
}

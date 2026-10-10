// The SCORM 1.2 modular Factory packages intentionally keep these bindings
// lexical instead of exporting a test hook. The browser-only serialized driver
// reads them for decisions and verification; all course progress still comes
// from clicks on the package's own controls.
declare const SLIDES: unknown;
declare const current: unknown;
declare const completed: unknown;
declare const scenarioDone: unknown;
declare const interactions: unknown;
declare const moduleQuiz: unknown;
declare const MODULE_QUIZZES: unknown;
declare const completionReady: unknown;
declare const Scorm: unknown;

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
  type ModularSlide = {
    id: string;
    layout: string;
    required?: boolean;
    objectives?: unknown[];
    steps?: unknown[];
    lanes?: unknown[];
    groups?: unknown[];
    options?: Array<{ correct?: boolean }>;
  };
  type ModularQuizQuestion = { answer?: unknown; options?: unknown[] };
  type ModularQuizState = {
    index?: number;
    answers?: boolean[];
    passed?: boolean;
    resultShown?: boolean;
    score?: number;
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
    Scorm?: { get?: (key: string) => string | null };
  };
  const w = globalThis as DriverWindow;
  const slides = w.COURSE_DATA?.slides;
  const getState = w.__AIRTRUST_PLAYER_TEST__?.getState;
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
  if (!Array.isArray(slides) || slides.length === 0 || slides.length > 1000 ||
      typeof getState !== 'function' || !w.document) {
    // Earlier Factory M8 SCORM 1.2 packages use a modular renderer whose
    // bindings are classic-script lexical globals. Support only that explicit
    // authored contract and keep all state transitions behind actual controls.
    const modularSlides = typeof SLIDES !== 'undefined' ? SLIDES as ModularSlide[] : null;
    const quizData = typeof MODULE_QUIZZES !== 'undefined'
      ? MODULE_QUIZZES as Record<string, ModularQuizQuestion[]>
      : null;
    const state = () => {
      if (!Array.isArray(modularSlides) || modularSlides.length === 0 || modularSlides.length > 1000 ||
          typeof current !== 'number' || !(completed instanceof Set) ||
          !(scenarioDone instanceof Set) || !(interactions instanceof Map) ||
          !moduleQuiz || typeof moduleQuiz !== 'object' || typeof completionReady !== 'function') return null;
      return {
        slides: modularSlides,
        current: current as number,
        completed: completed as Set<string>,
        scenarioDone: scenarioDone as Set<string>,
        interactions: interactions as Map<string, Set<number>>,
        moduleQuiz: moduleQuiz as Record<string, ModularQuizState>,
        completionReady: completionReady as () => boolean,
      };
    };
    const modular = state();
    if (!modular || !w.document || !quizData || !w.Scorm?.get) {
      return { supported: false, completed: false, steps: 0, reason: 'NO_FACTORY_M8_DRIVER' };
    }
    const itemCount = (slide: ModularSlide): number => {
      if (slide.layout === 'objectives') return slide.objectives?.length ?? 0;
      if (slide.layout === 'timeline' || slide.layout === 'roadmap') return slide.steps?.length ?? 0;
      if (slide.layout === 'flowchart') return slide.lanes?.length ?? 0;
      if (slide.layout === 'checklist_groups') return slide.groups?.length ?? 0;
      return 0;
    };
    const modularLimit = Math.min(4000, Math.max(240, modular.slides.length * 40));
    for (let step = 0; step < modularLimit; step++) {
      const currentState = state();
      if (!currentState) return { supported: true, completed: false, steps: step, reason: 'MODULAR_FACTORY_STATE_INVALID' };
      const last = currentState.slides[currentState.slides.length - 1];
      if (currentState.current === currentState.slides.length - 1 &&
          currentState.completed.has(last.id) && currentState.completionReady() === true) {
        const lessonStatus = String(w.Scorm.get('cmi.core.lesson_status') ?? '').toLowerCase();
        const score = Number(w.Scorm.get('cmi.core.score.raw'));
        if (lessonStatus === 'passed' && Number.isFinite(score) && score >= 70) {
          return { supported: true, completed: true, steps: step, reason: null };
        }
        return { supported: true, completed: false, steps: step, reason: 'MODULAR_SCORM_COMPLETION_EVIDENCE_MISSING' };
      }
      const slide = currentState.slides[currentState.current];
      if (!slide || !slide.id || currentState.current < 0 || currentState.current >= currentState.slides.length) {
        return { supported: true, completed: false, steps: step, reason: 'MODULAR_FACTORY_CURRENT_INVALID' };
      }
      if (slide.layout === 'scenario' && !currentState.scenarioDone.has(slide.id)) {
        const options = slide.options ?? [];
        const answer = options.findIndex((option) => option?.correct === true);
        if (answer < 0 || !click(`[data-opt="${answer}"]`)) {
          return { supported: true, completed: false, steps: step, reason: 'MODULAR_SCENARIO_CONTROL_MISSING' };
        }
      }
      if (slide.layout === 'module_quiz') {
        const questions = quizData[slide.id];
        const quiz = currentState.moduleQuiz[slide.id];
        if (!Array.isArray(questions) || questions.length === 0 || !quiz) {
          return { supported: true, completed: false, steps: step, reason: 'MODULAR_QUIZ_FORMAT_UNSUPPORTED' };
        }
        if (quiz.resultShown && !quiz.passed) {
          return { supported: true, completed: false, steps: step, reason: 'MODULAR_QUIZ_NOT_MASTERED' };
        }
        if (!quiz.passed) {
          const index = Number.isInteger(quiz.index) ? Number(quiz.index) : 0;
          const question = questions[index];
          if (!question || !Number.isInteger(question.answer) || Number(question.answer) < 0 ||
              Number(question.answer) >= (question.options?.length ?? 0)) {
            return { supported: true, completed: false, steps: step, reason: 'MODULAR_QUIZ_ANSWER_UNAVAILABLE' };
          }
          if (!click(`[data-module-quiz="${Number(question.answer)}"]`) || !click('#quizNext')) {
            return { supported: true, completed: false, steps: step, reason: 'MODULAR_QUIZ_CONTROL_MISSING' };
          }
          continue;
        }
      }
      if (slide.required && itemCount(slide) > 0) {
        const seen = currentState.interactions.get(slide.id) ?? new Set<number>();
        for (let index = 0; index < itemCount(slide); index++) {
          if (!seen.has(index) && !click(`[data-touch="${index}"]`)) {
            return { supported: true, completed: false, steps: step, reason: 'MODULAR_REQUIRED_INTERACTION_MISSING' };
          }
        }
      }
      const previous = currentState.current;
      if (!click('#nextBtn')) {
        return { supported: true, completed: false, steps: step, reason: 'MODULAR_COURSE_NEXT_MISSING' };
      }
      const after = state();
      if (!after || (after.current === previous && after.completionReady() !== true)) {
        return { supported: true, completed: false, steps: step, reason: 'MODULAR_COURSE_NOT_ADVANCED' };
      }
    }
    return { supported: true, completed: false, steps: modularLimit, reason: 'MODULAR_MAX_STEPS_EXCEEDED' };
  }
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

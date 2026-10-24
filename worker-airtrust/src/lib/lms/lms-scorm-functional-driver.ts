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
  type AirTrustCourseModelSlide = {
    id: string;
    kind: string;
    gateItems?: Array<{ id: string }>;
    hotspots?: Array<{ id: string }>;
    choices?: Array<{ ok?: boolean }>;
  };
  type AirTrustCourseModel = {
    schema?: string;
    navigationGate?: string;
    slides?: AirTrustCourseModelSlide[];
    assessment?: {
      masteryScore?: number;
      questions?: Array<{ id: string; correct?: unknown; a?: unknown[] }>;
    };
  };
  type AirTrustCourseModelState = {
    a?: number;
    c?: string[];
    d?: Record<string, number>;
    g?: Record<string, string[]>;
    q?: Record<string, number>;
    best?: number;
    assessmentPassed?: boolean;
    passed?: boolean;
    failed?: boolean;
    assessmentEvaluated?: boolean;
  };
  type DriverWindow = {
    COURSE_DATA?: { slides?: DriverSlide[]; packageVersion?: string };
    AIRTRUST_COURSE_MODEL?: AirTrustCourseModel;
    __AIRTRUST_PLAYER_TEST__?: { getState?: () => DriverState };
    document?: {
      querySelector: (selector: string) => { disabled?: boolean; textContent?: string | null; click: () => void } | null;
      querySelectorAll: (selector: string) => ArrayLike<{
        disabled?: boolean;
        dataset?: Record<string, string | undefined>;
        getBoundingClientRect?: () => { width: number; height: number };
        click: () => void;
      }>;
    };
    Scorm?: { get?: (key: string) => string | null };
    API?: { LMSGetValue?: (key: string) => string | null };
    AirTrustSCORM?: { get?: (key: string) => string | null };
    getComputedStyle?: (element: unknown) => {
      display?: string;
      visibility?: string;
      pointerEvents?: string;
    };
  };
  const w = globalThis as DriverWindow;
  const authoredModel = w.AIRTRUST_COURSE_MODEL;
  if (authoredModel?.schema === 'AIRTRUST_TRAINING_MODEL_M8' &&
      authoredModel.navigationGate === 'module-assessment') {
    const modelSlides = authoredModel.slides;
    const assessment = authoredModel.assessment;
    const questions = assessment?.questions;
    const scorm = w.AirTrustSCORM;
    const doc = w.document;
    const modelClick = (selector: string): boolean => {
      const control = doc?.querySelector(selector);
      if (!control || control.disabled) return false;
      control.click();
      return true;
    };
    const modelClickData = (attribute: string, value: string): boolean => {
      const control = Array.from(doc?.querySelectorAll(`[data-${attribute}]`) ?? [])
        .find((item) => item.dataset?.[attribute] === value);
      if (!control || control.disabled) return false;
      control.click();
      return true;
    };
    const readCmiValue = (key: string): string => {
      try {
        const value = w.API?.LMSGetValue?.(key);
        if (value !== undefined && value !== null) return String(value);
      } catch {
        // Fall back to the package's read-only SCORM adapter when direct API access is unavailable.
      }
      return String(scorm?.get?.(key) ?? '');
    };
    const readModelState = (): AirTrustCourseModelState | null => {
      try {
        const raw = readCmiValue('cmi.suspend_data');
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? parsed as AirTrustCourseModelState
          : null;
      } catch {
        return null;
      }
    };
    if (!Array.isArray(modelSlides) || modelSlides.length === 0 || modelSlides.length > 1000 ||
        !Array.isArray(questions) || questions.length === 0 || questions.length > 100 ||
        !doc || !scorm?.get) {
      return { supported: false, completed: false, steps: 0, reason: 'NO_AIRTRUST_COURSE_MODEL_DRIVER' };
    }
    const mastery = Number(assessment?.masteryScore);
    if (!Number.isFinite(mastery) || mastery <= 0 || questions.some((question) =>
      !question || typeof question.id !== 'string' || !Array.isArray(question.a) ||
      !Number.isInteger(question.correct) || Number(question.correct) < 0 ||
      Number(question.correct) >= question.a.length,
    )) {
      return { supported: true, completed: false, steps: 0, reason: 'AIRTRUST_COURSE_MODEL_ANSWER_UNAVAILABLE' };
    }
    const last = modelSlides[modelSlides.length - 1];
    const limit = Math.min(4000, Math.max(120, modelSlides.length * 20));
    for (let step = 0; step < limit; step++) {
      const state = readModelState();
      if (!state) return { supported: true, completed: false, steps: step, reason: 'AIRTRUST_COURSE_MODEL_STATE_INVALID' };
      const completed = Array.isArray(state.c) ? state.c : [];
      const lessonStatus = readCmiValue('cmi.core.lesson_status').toLowerCase();
      const score = Number(readCmiValue('cmi.core.score.raw'));
      if (state.passed === true && completed.length >= modelSlides.length &&
          modelSlides.every((slide) => completed.includes(slide.id)) && lessonStatus === 'passed' &&
          Number.isFinite(score) && score >= mastery) {
        return { supported: true, completed: true, steps: step, reason: null };
      }
      const rawCounter = doc.querySelector('#counter')?.textContent ?? '';
      const counter = rawCounter.match(/^(\d+)\s*\/\s*(\d+)$/);
      const index = counter ? Number(counter[1]) - 1 : Number(state.a ?? 0);
      if (!Number.isInteger(index) || index < 0 || index >= modelSlides.length ||
          (counter && Number(counter[2]) !== modelSlides.length)) {
        return { supported: true, completed: false, steps: step, reason: 'AIRTRUST_COURSE_MODEL_POSITION_INVALID' };
      }
      const slide = modelSlides[index];
      if (!slide?.id) return { supported: true, completed: false, steps: step, reason: 'AIRTRUST_COURSE_MODEL_SLIDE_INVALID' };
      if (slide.kind === 'scenario' && state.d?.[slide.id] === undefined) {
        const correct = (slide.choices ?? []).findIndex((choice) => choice?.ok === true);
        if (correct < 0 || !modelClick(`[data-choice="${correct}"]`)) {
          return { supported: true, completed: false, steps: step, reason: 'AIRTRUST_COURSE_MODEL_SCENARIO_CONTROL_MISSING' };
        }
      }
      for (const item of [...(slide.gateItems ?? []), ...(slide.hotspots ?? [])]) {
        const seen = state.g?.[slide.id] ?? [];
        if (typeof item?.id !== 'string' || !seen.includes(item.id)) {
          const attribute = slide.hotspots?.some((hotspot) => hotspot.id === item?.id)
            ? 'hotspot'
            : 'gate';
          if (typeof item?.id !== 'string' || !modelClickData(attribute, item.id)) {
            return { supported: true, completed: false, steps: step, reason: 'AIRTRUST_COURSE_MODEL_INTERACTION_MISSING' };
          }
        }
      }
      if (slide.kind === 'assessment') {
        const assessmentState = readModelState();
        if (!assessmentState?.assessmentPassed) {
          if (assessmentState?.assessmentEvaluated || assessmentState?.failed) {
            if (!modelClick('#retryAssessment')) {
              return { supported: true, completed: false, steps: step, reason: 'AIRTRUST_COURSE_MODEL_ASSESSMENT_RETRY_MISSING' };
            }
          }
          for (let questionIndex = 0; questionIndex < questions.length; questionIndex++) {
            const question = questions[questionIndex];
            if (readModelState()?.q?.[question.id] === Number(question.correct)) {
              // Resume safely when a correct learner answer is already persisted.
            } else if (!modelClick(`[data-answer="${Number(question.correct)}"]`)) {
              return { supported: true, completed: false, steps: step, reason: 'AIRTRUST_COURSE_MODEL_ANSWER_CONTROL_MISSING' };
            }
            if (questionIndex < questions.length - 1 && !modelClick('#qNext')) {
              return { supported: true, completed: false, steps: step, reason: 'AIRTRUST_COURSE_MODEL_QUESTION_NEXT_MISSING' };
            }
          }
          if (!modelClick('#submitAssessment')) {
            return { supported: true, completed: false, steps: step, reason: 'AIRTRUST_COURSE_MODEL_ASSESSMENT_SUBMIT_MISSING' };
          }
          if (!readModelState()?.assessmentPassed) {
            return { supported: true, completed: false, steps: step, reason: 'AIRTRUST_COURSE_MODEL_ASSESSMENT_NOT_MASTERED' };
          }
          if (!modelClick('#completeCourse')) {
            return { supported: true, completed: false, steps: step, reason: 'AIRTRUST_COURSE_MODEL_COMPLETE_CONTROL_MISSING' };
          }
          continue;
        }
      }
      if (index === modelSlides.length - 1 && slide.id === last.id) {
        return { supported: true, completed: false, steps: step, reason: 'AIRTRUST_COURSE_MODEL_COMPLETION_EVIDENCE_MISSING' };
      }
      if (!modelClick('#nextBtn')) {
        return { supported: true, completed: false, steps: step, reason: 'AIRTRUST_COURSE_MODEL_NEXT_CONTROL_MISSING' };
      }
    }
    return { supported: true, completed: false, steps: limit, reason: 'AIRTRUST_COURSE_MODEL_MAX_STEPS_EXCEEDED' };
  }
  const slides = w.COURSE_DATA?.slides;
  const getState = w.__AIRTRUST_PLAYER_TEST__?.getState;
  const click = (selector: string): boolean => {
    const control = w.document?.querySelector(selector);
    if (!control || control.disabled) return false;
    control.click();
    return true;
  };
  const clickScenarioOption = (slideId: string, selected: number): boolean => {
    const controls = Array.from(w.document?.querySelectorAll('.screen.active [data-scenario][data-opt]') ?? []);
    const authored = controls.find((control) =>
      control.dataset?.scenario === slideId && control.dataset?.opt === String(selected),
    );
    if (authored && !authored.disabled) {
      authored.click();
      return true;
    }

    const activeScreenControls = Array.from(w.document?.querySelectorAll(
      '.screen.active [data-choice], .screen.active [data-opt]',
    ) ?? []);
    const active = activeScreenControls.find((control) =>
      (control.dataset?.choice ?? control.dataset?.opt) === String(selected),
    );
    if (active && !active.disabled) {
      active.click();
      return true;
    }

    // Keep support for the minimal legacy Factory markup used by existing
    // packages and tests when it exposes a single unscoped option control.
    const legacy = Array.from(w.document?.querySelectorAll('[data-choice], [data-opt]') ?? [])
      .filter((control) => (control.dataset?.choice ?? control.dataset?.opt) === String(selected));
    if (legacy.length !== 1 || legacy[0].disabled) return false;
    legacy[0].click();
    return true;
  };
  const clickRequiredInteractions = (): number => {
    const items = Array.from(w.document?.querySelectorAll('.screen.active [data-gate-id]') ?? []);
    let clicked = 0;
    for (const item of items) {
      const style = w.getComputedStyle?.(item);
      const rect = item.getBoundingClientRect?.();
      // Match the package's own requiredInteractionItems() visibility rule.
      // offsetParent is null for visible fixed-position controls, so it cannot
      // be used as a visibility test here.
      if (item.disabled || !style || style.display === 'none' ||
          style.visibility === 'hidden' || style.pointerEvents === 'none' ||
          !rect || rect.width <= 0 || rect.height <= 0) continue;
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
      if (!clickScenarioOption(slide.id, selected)) {
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

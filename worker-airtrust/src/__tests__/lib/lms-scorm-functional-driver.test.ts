/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildScormFunctionalDriverScript, wrapScormBrowserDriver } from '../../lib/lms/lms-scorm-functional-driver';

type TestWindow = typeof globalThis & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const global = globalThis as TestWindow;

describe('SCORM functional browser driver (no synthetic SCORM statuses)', () => {
  beforeEach(() => {
    global.document.body.innerHTML = '';
    delete global.window.COURSE_DATA;
    delete global.window.__AIRTRUST_PLAYER_TEST__;
    for (const key of [
      'SLIDES', 'current', 'completed', 'scenarioDone', 'interactions', 'moduleQuiz',
      'MODULE_QUIZZES', 'completionReady', 'Scorm',
    ]) delete global[key];
  });

  it('executes bundled inner function annotations without leaking bundler globals', () => {
    // esbuild with keepNames emits __name(...) inside serialized function
    // bodies. The isolated Chromium context has no ambient __name global.
    const bundleStyleFunction =
      'function () { const next = __name((value) => value + 1, "next"); return next(41); }';
    const script = wrapScormBrowserDriver(bundleStyleFunction);
    expect(new Function('return ' + script)()).toBe(42);
    expect(script).not.toContain('LMSSetValue');
  });

  it('fails closed on packages without the Factory authoring contract', () => {
    const result = new Function('return ' + buildScormFunctionalDriverScript())();
    expect(result).toEqual({
      supported: false, completed: false, steps: 0, reason: 'NO_FACTORY_M8_DRIVER',
    });
  });

  it('completes only by invoking actual navigation controls', () => {
    let active = 0;
    let completed = false;
    let ended = false;
    const next = global.document.createElement('button');
    next.id = 'next';
    next.addEventListener('click', () => {
      active++;
      if (active >= 2) {
        completed = true;
        ended = true;
        active = 1;
      }
    });
    global.document.body.append(next);
    global.window.COURSE_DATA = {
      packageVersion: 'V1',
      slides: [{ id: 'intro', kind: 'cover' }, { id: 'lesson', kind: 'lesson' }],
    };
    global.window.__AIRTRUST_PLAYER_TEST__ = {
      getState: () => ({ active, completed, ended, mode: 'journey', done: completed ? [0, 1] : active === 0 ? [] : [0] }),
    };
    const result = new Function('return ' + buildScormFunctionalDriverScript())();
    expect(result).toMatchObject({ supported: true, completed: true, steps: 2 });
    expect(completed).toBe(true);
  });

  it('clicks decisions and authored assessment answers without forcing SCORM status', () => {
    const slides = [
      { id: 'decision', kind: 'decision', chapter: 1 },
      { id: 'assessment', kind: 'assessment', chapter: 1,
        questions: [
          { options: ['wrong', 'right'], answer: 1 },
          { options: ['right', 'wrong'], answer: 0 },
        ] },
      { id: 'finish', kind: 'lesson', chapter: 1 },
    ];
    let active = 0;
    let question = 0;
    let completed = false;
    let ended = false;
    const done: number[] = [];
    const choices: Record<string, number> = {};
    const assess = { 1: { passed: false } };
    const selected: number[] = [];

    const make = (id: string, attr?: string) => {
      const element = global.document.createElement('button');
      element.id = id;
      if (attr) {
        const [name, value] = attr.split('=');
        element.setAttribute(name, value);
      }
      global.document.body.append(element);
      return element;
    };
    make('choice', 'data-choice=0').addEventListener('click', () => { choices.decision = 0; });
    make('a0', 'data-answer=0').addEventListener('click', () => { selected.push(0); });
    make('a1', 'data-answer=1').addEventListener('click', () => { selected.push(1); });
    make('qNext').addEventListener('click', () => { question++; });
    make('next').addEventListener('click', () => {
      if (active === 1 && !assess[1].passed) {
        assess[1].passed = question === 1 && selected.length === 2 &&
          selected[0] === 1 && selected[1] === 0;
      } else {
        done.push(active);
        if (active < 2) active++;
        else { completed = true; ended = true; }
      }
    });
    global.window.COURSE_DATA = { packageVersion: 'V2', slides };
    global.window.__AIRTRUST_PLAYER_TEST__ = {
      getState: () => ({
        active, completed, ended, done: [...done], choices: { ...choices },
        assess: { 1: { ...assess[1] } }, mode: completed ? 'review' : 'journey',
      }),
    };
    const result = new Function('return ' + buildScormFunctionalDriverScript())();
    expect(result).toMatchObject({ supported: true, completed: true, steps: 3 });
    expect(selected).toEqual([1, 0]);
    expect(done).toEqual([0, 1, 2]);
  });

  it('supports the authored Factory PBN view/scenario/assessment contract', () => {
    const slides = [
      { id: 'scenario', kind: 'scenario', content: { options: [{ correct: false }, { correct: true }] } },
      { id: 'assessment', kind: 'assessment', content: { questions: [
        { options: ['wrong', 'right'], answer: 1 },
        { options: ['right', 'wrong'], answer: 0 },
      ] } },
      { id: 'finish', kind: 'lesson' },
    ];
    let view = 0;
    let journey = 0;
    let question = 0;
    let ready = false;
    const done: number[] = [];
    const scenarioState: Record<string, number> = {};
    const assessmentState: Record<string, { q: number; passed: boolean }> = {
      assessment: { q: 0, passed: false },
    };
    const selected: number[] = [];
    const choice = global.document.createElement('button');
    choice.setAttribute('data-scenario', '');
    choice.setAttribute('data-opt', '1');
    choice.addEventListener('click', () => { scenarioState.scenario = 1; });
    global.document.body.append(choice);
    const assessment = global.document.createElement('div');
    assessment.setAttribute('data-assessment', 'assessment');
    global.document.body.append(assessment);
    const answer0 = global.document.createElement('button');
    answer0.className = 'ans';
    answer0.setAttribute('data-i', '0');
    answer0.addEventListener('click', () => selected.push(0));
    assessment.append(answer0);
    const answer1 = global.document.createElement('button');
    answer1.className = 'ans';
    answer1.setAttribute('data-i', '1');
    answer1.addEventListener('click', () => selected.push(1));
    assessment.append(answer1);
    const qNext = global.document.createElement('button');
    qNext.className = 'qnext';
    qNext.addEventListener('click', () => { question++; assessmentState.assessment.q = question; });
    assessment.append(qNext);
    const next = global.document.createElement('button');
    next.id = 'next';
    next.addEventListener('click', () => {
      if (view === 1 && !assessmentState.assessment.passed) {
        assessmentState.assessment.passed = question === 1 && selected.join(',') === '1,0';
      } else {
        done.push(journey);
        if (journey < slides.length - 1) journey++;
        view = journey;
        ready = assessmentState.assessment.passed && done.length === slides.length;
      }
    });
    global.document.body.append(next);
    global.window.COURSE_DATA = { packageVersion: 'V4.9.0', slides };
    global.window.__AIRTRUST_PLAYER_TEST__ = {
      getState: () => ({ view, journey, mode: 'journey', done: [...done], scenarioState: { ...scenarioState }, assessmentState: { ...assessmentState }, completionReady: ready }),
    };

    const result = new Function('return ' + buildScormFunctionalDriverScript())();
    expect(result).toMatchObject({ supported: true, completed: true, steps: 3 });
    expect(scenarioState.scenario).toBe(1);
    expect(selected).toEqual([1, 0]);
    expect(done).toEqual([0, 1, 2]);
  });

  it('clicks visible authored interaction gates before advancing the learner journey', () => {
    const first = global.document.createElement('section');
    first.className = 'screen active';
    const gate = global.document.createElement('button');
    gate.setAttribute('data-gate-id', 'micro-0');
    // jsdom has no layout; model a visible browser control.
    Object.defineProperty(gate, 'offsetParent', { configurable: true, value: first });
    gate.getBoundingClientRect = () => ({
      x: 10, y: 10, top: 10, right: 110, bottom: 40, left: 10,
      width: 100, height: 30, toJSON: () => ({}),
    });
    first.append(gate);
    const second = global.document.createElement('section');
    second.className = 'screen';
    global.document.body.append(first, second);

    let active = 0;
    let gateVisited = false;
    let completed = false;
    let ended = false;
    const done: number[] = [];
    const next = global.document.createElement('button');
    next.id = 'next';
    next.disabled = true;
    next.addEventListener('click', () => {
      if (active === 0 && !gateVisited) return;
      done.push(active);
      if (active === 0) {
        active = 1;
        first.classList.remove('active');
        second.classList.add('active');
        next.disabled = false;
      } else {
        completed = true;
        ended = true;
      }
    });
    gate.addEventListener('click', () => {
      gateVisited = true;
      next.disabled = false;
    });
    global.document.body.append(next);
    global.window.COURSE_DATA = {
      slides: [{ id: 'interactive', kind: 'lesson' }, { id: 'finish', kind: 'lesson' }],
    };
    global.window.__AIRTRUST_PLAYER_TEST__ = {
      getState: () => ({
        active, done: [...done], completed, ended, mode: 'journey',
      }),
    };

    const result = new Function('return ' + buildScormFunctionalDriverScript())();
    expect(result).toMatchObject({ supported: true, completed: true, steps: 2 });
    expect(gateVisited).toBe(true);
    expect(done).toEqual([0, 1]);
  });

  it('drives the earlier modular Factory contract only through authored learner controls', () => {
    const slides = [
      { id: 'interactive', layout: 'objectives', required: true, objectives: [{}, {}] },
      { id: 'finish', layout: 'cover' },
    ];
    let current = 0;
    const completed = new Set<string>();
    const scenarioDone = new Set<string>();
    const interactions = new Map<string, Set<number>>();
    let lessonStatus = 'incomplete';
    let score = '0';
    global.SLIDES = slides;
    global.current = current;
    global.completed = completed;
    global.scenarioDone = scenarioDone;
    global.interactions = interactions;
    global.moduleQuiz = {};
    global.MODULE_QUIZZES = {};
    global.completionReady = () => current === 1 && completed.has('finish');
    global.Scorm = {
      get: (key: string) => key === 'cmi.core.lesson_status' ? lessonStatus : score,
    };

    const first = global.document.createElement('section');
    const seen = new Set<number>();
    for (const index of [0, 1]) {
      const item = global.document.createElement('button');
      item.setAttribute('data-touch', String(index));
      item.addEventListener('click', () => {
        seen.add(index);
        interactions.set('interactive', new Set(seen));
        if (seen.size === 2) next.disabled = false;
      });
      first.append(item);
    }
    global.document.body.append(first);
    const next = global.document.createElement('button');
    next.id = 'nextBtn';
    next.disabled = true;
    next.addEventListener('click', () => {
      if (current === 0 && seen.size === 2) {
        completed.add('interactive');
        current = 1;
        global.current = current;
        next.disabled = false;
      } else if (current === 1) {
        completed.add('finish');
        lessonStatus = 'passed';
        score = '100';
      }
    });
    global.document.body.append(next);
    global.SLIDES = slides;

    const result = new Function('return ' + buildScormFunctionalDriverScript())();
    expect(result).toMatchObject({ supported: true, completed: true, reason: null });
    expect(seen).toEqual(new Set([0, 1]));
    expect(completed).toEqual(new Set(['interactive', 'finish']));
  });

  it('supports safety course tuple choices and gate interactions using visible controls', () => {
    const slides = [
      { id: 'lesson', kind: 'lesson', gateItems: ['a', 'b'] },
      { id: 'scenario', kind: 'scenario', options: [['wrong', false], ['right', true]] },
    ];
    let active = 0;
    const done: number[] = [];
    const gateSeen: string[] = [];
    const scenario: Record<string, number> = {};
    for (const index of [0, 1]) {
      const gate = global.document.createElement('button');
      gate.setAttribute('data-gate', String(index));
      gate.addEventListener('click', () => { gateSeen.push(`lesson:${index}`); });
      global.document.body.append(gate);
    }
    const option = global.document.createElement('button');
    option.setAttribute('data-opt', '1');
    option.addEventListener('click', () => { scenario.scenario = 1; });
    global.document.body.append(option);
    const next = global.document.createElement('button');
    next.id = 'next';
    next.addEventListener('click', () => {
      done.push(active);
      if (active < slides.length - 1) active++;
    });
    global.document.body.append(next);
    global.window.COURSE_DATA = { packageVersion: 'RC8.1', slides };
    global.window.__AIRTRUST_PLAYER_TEST__ = {
      getState: () => ({ active, done: [...done], gateSeen: [...gateSeen], scenario: { ...scenario }, courseCompleted: done.length === slides.length, completionReady: true, mode: 'journey' }),
    };

    const result = new Function('return ' + buildScormFunctionalDriverScript())();
    expect(result).toMatchObject({ supported: true, completed: true, steps: 2 });
    expect(gateSeen).toEqual(['lesson:0', 'lesson:1']);
    expect(scenario.scenario).toBe(1);
  });

  it('rejects courses without an actionable next control', () => {
    global.window.COURSE_DATA = {
      slides: [{ id: 'intro', kind: 'cover' }],
    };
    global.window.__AIRTRUST_PLAYER_TEST__ = {
      getState: () => ({ active: 0, completed: false, ended: false, mode: 'journey' }),
    };
    const result = new Function('return ' + buildScormFunctionalDriverScript())();
    expect(result).toMatchObject({
      supported: true, completed: false, reason: 'COURSE_NEXT_MISSING',
    });
  });

  it('clicks visible fixed-position interaction gates even when offsetParent is null', () => {
    const slides = [{ id: 'fixed-gate', kind: 'lesson' }];
    let active = 0;
    let completed = false;
    const screen = global.document.createElement('section');
    screen.className = 'screen active';
    const gate = global.document.createElement('button');
    gate.setAttribute('data-gate-id', 'fixed-control');
    Object.defineProperty(gate, 'offsetParent', { get: () => null });
    gate.getBoundingClientRect = () => ({
      x: 10, y: 10, top: 10, right: 110, bottom: 40, left: 10,
      width: 100, height: 30, toJSON: () => ({}),
    });
    const next = global.document.createElement('button');
    next.id = 'next';
    next.disabled = true;
    gate.addEventListener('click', () => { next.disabled = false; });
    next.addEventListener('click', () => { completed = true; });
    screen.append(gate);
    global.document.body.append(screen, next);
    global.window.COURSE_DATA = { slides };
    global.window.__AIRTRUST_PLAYER_TEST__ = {
      getState: () => ({ active, done: completed ? [0] : [], courseCompleted: completed, completionReady: completed, mode: 'journey' }),
    };

    const result = new Function('return ' + buildScormFunctionalDriverScript())();
    expect(result).toMatchObject({ supported: true, completed: true, steps: 1 });
  });
});

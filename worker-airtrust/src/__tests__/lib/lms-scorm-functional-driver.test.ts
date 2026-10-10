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
});

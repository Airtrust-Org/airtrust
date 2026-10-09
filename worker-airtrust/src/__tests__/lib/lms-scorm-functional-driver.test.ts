/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildScormFunctionalDriverScript } from '../../lib/lms/lms-scorm-functional-driver';

type TestWindow = typeof globalThis & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const global = globalThis as TestWindow;

describe('SCORM functional browser driver (no synthetic SCORM statuses)', () => {
  beforeEach(() => {
    global.document.body.innerHTML = '';
    delete global.window.COURSE_DATA;
    delete global.window.__AIRTRUST_PLAYER_TEST__;
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

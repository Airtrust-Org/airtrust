import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseScormLocationMarker,
  parseScormLocationPair,
  resolveScormResumeTargetSlide,
} from '../../routes/lms-assets';
import { buildScormLaunchState, readScormNavigationBookmark } from '../../services/lms-scorm-launch-state';

describe('SCORM resume restore helpers', () => {
  it('parseia marcadores numericos simples usados por alguns pacotes AW', () => {
    expect(parseScormLocationMarker('238')).toEqual({ current: 238, total: null });
    expect(parseScormLocationPair('238')).toBeNull();
  });

  it('parseia localizações SCORM numéricas nos formatos suportados', () => {
    expect(parseScormLocationPair('22/103')).toEqual({ current: 22, total: 103 });
    expect(parseScormLocationPair(' 22 / 103 ')).toEqual({ current: 22, total: 103 });
    expect(parseScormLocationPair('22 of 103')).toEqual({ current: 22, total: 103 });
    expect(parseScormLocationPair('22of103')).toEqual({ current: 22, total: 103 });
    expect(parseScormLocationPair('bookmark-abc')).toBeNull();
    expect(parseScormLocationPair('')).toBeNull();
    expect(parseScormLocationPair('22/0')).toBeNull();
  });

  it('só restaura quando o slide observado está atrás do slide salvo', () => {
    expect(resolveScormResumeTargetSlide('238', null)).toBe(238);
    expect(resolveScormResumeTargetSlide('238', '1/380')).toBe(238);
    expect(resolveScormResumeTargetSlide('238', '238/380')).toBeNull();
    expect(resolveScormResumeTargetSlide('22/103', null)).toBe(22);
    expect(resolveScormResumeTargetSlide('22/103', '1/103')).toBe(22);
    expect(resolveScormResumeTargetSlide('22 of 103', ' 1 / 103 ')).toBe(22);
    expect(resolveScormResumeTargetSlide('22/103', '22/103')).toBeNull();
    expect(resolveScormResumeTargetSlide('22/103', '23/103')).toBeNull();
    expect(resolveScormResumeTargetSlide('1/103', '1/103')).toBeNull();
    expect(resolveScormResumeTargetSlide('22/103', '22/0')).toBe(22);
  });

  it('injeta o restore de resume no ciclo de load do wrapper compartilhado', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/lms-assets.ts'), 'utf8');

    expect(source).toContain('function restoreResumeLocation(remainingAttempts)');
    expect(source).toContain('function applyLocalResumeBackup()');
    expect(source).toContain('function scheduleInteractionProbe(delayMs, remainingAttempts)');
    expect(source).toContain('function bindFrameProgressTracking()');
    expect(source).toContain('function navigateFrameToSlide(frameWindow, target)');
    expect(source).toContain('restoreResumeLocation(12);');
    expect(source).toContain('applyLocalResumeBackup();');
    expect(source).toContain('bindFrameProgressTracking();');
    expect(source).toContain('resolveScormResumeTargetSlide(savedLocation, observedLocation)');
    expect(source).toContain('var shouldCommitLocation = previousLocation !== location;');
    expect(source).toContain('scheduleCommit(800);');
  });

  it('agenda commit quando o pacote marca conclusão por status SCORM', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/lms-assets.ts'), 'utf8');

    expect(source).toMatch(
      /if \(element === 'cmi\.core\.lesson_status'\) \{\s*checkCompletion\(\);\s*scheduleCommit\(800\);\s*\}/,
    );
    expect(source).toMatch(
      /if \(element === 'cmi\.completion_status' \|\| element === 'cmi\.success_status'\) \{\s*checkCompletion\(\);\s*scheduleCommit\(800\);\s*\}/,
    );
  });

  it('protege location e suspend_data regressivos com telemetria sanitizada', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/lms-assets.ts'), 'utf8');

    expect(source).toContain("function protectLocationValue(currentValue, nextValue)");
    expect(source).toContain("function protectSuspendDataValue(currentValue, nextValue)");
    expect(source).toContain('SCORM_REGRESSION_BLOCKED');
    expect(source).toContain('SCORM_BEFORE_UNLOAD_COMMIT');
    expect(source).toContain('SCORM_VISIBILITY_COMMIT');
    expect(source).toContain("console.info('[SCORM_TELEMETRY]'");
  });
});

describe('completed enrollment review virtual CMI', () => {
  it('starts SCORM 1.2 review from the beginning while preserving terminal status in memory', () => {
    const persisted = JSON.stringify({
      'cmi.core.lesson_status': 'incomplete',
      'cmi.core.lesson_location': '17/55',
      'cmi.core.entry': 'resume',
      'cmi.core.exit': 'suspend',
      'cmi.suspend_data': 'stale-checkpoint',
    });
    const result = buildScormLaunchState(persisted, 'stale-checkpoint', false, true);
    const cmi = JSON.parse(result.initialCmiJson);
    expect(result.hasResumeState).toBe(false);
    expect(cmi['cmi.core.lesson_status']).toBe('passed');
    expect(cmi['cmi.core.lesson_location']).toBeUndefined();
    expect(cmi['cmi.suspend_data']).toBeUndefined();
    expect(cmi['cmi.core.entry']).toBeUndefined();
    expect(cmi['cmi.core.exit']).toBeUndefined();
  });

  it('starts SCORM 2004 review from the beginning while preserving terminal completion in memory', () => {
    const persisted = JSON.stringify({
      'cmi.completion_status': 'incomplete',
      'cmi.success_status': 'unknown',
      'cmi.location': '17/55',
      'cmi.entry': 'resume',
      'cmi.exit': 'suspend',
      'cmi.suspend_data': 'stale-checkpoint',
    });
    const result = buildScormLaunchState(persisted, 'stale-checkpoint', true, true);
    const cmi = JSON.parse(result.initialCmiJson);
    expect(result.hasResumeState).toBe(false);
    expect(cmi['cmi.completion_status']).toBe('completed');
    expect(cmi['cmi.success_status']).toBe('passed');
    expect(cmi['cmi.location']).toBeUndefined();
    expect(cmi['cmi.suspend_data']).toBeUndefined();
    expect(cmi['cmi.entry']).toBeUndefined();
    expect(cmi['cmi.exit']).toBeUndefined();
  });

  it('preserves normal resume behavior for active journeys', () => {
    const result = buildScormLaunchState(
      JSON.stringify({ 'cmi.core.lesson_location': '17/55' }),
      'active-checkpoint',
      false,
      false,
    );
    const cmi = JSON.parse(result.initialCmiJson);
    expect(result.hasResumeState).toBe(true);
    expect(cmi['cmi.core.lesson_location']).toBe('17/55');
    expect(cmi['cmi.suspend_data']).toBe('active-checkpoint');
    expect(cmi['cmi.core.entry']).toBe('resume');
  });

  it('never injects a handoff bookmark as a bare lesson_location (F5 cores would lock to preview)', () => {
    const result = buildScormLaunchState(null, null, false, false, { position: 33, total: 43 });
    const cmi = JSON.parse(result.initialCmiJson);
    expect(result.hasResumeState).toBe(false);
    expect(cmi['cmi.core.lesson_location']).toBeUndefined();
    expect(cmi['cmi.core.entry']).toBeUndefined();
    expect(cmi['cmi.suspend_data']).toBeUndefined();
    expect(cmi['cmi.core.lesson_status']).toBeUndefined();
    expect(cmi['cmi.core.score.raw']).toBeUndefined();
  });

  it('drops a bare location persisted by an earlier handoff launch', () => {
    const stale = JSON.stringify({ 'cmi.core.lesson_location': '2/59', 'cmi.core.entry': 'resume' });
    const result = buildScormLaunchState(stale, null, false, false, { position: 2, total: 59 });
    const cmi = JSON.parse(result.initialCmiJson);
    expect(result.hasResumeState).toBe(false);
    expect(cmi['cmi.core.lesson_location']).toBeUndefined();
    expect(cmi['cmi.core.entry']).toBeUndefined();
  });

  it('preserves a package-authored location after a handoff (only the synthetic anchor is dropped)', () => {
    const saved = JSON.stringify({ 'cmi.core.lesson_location': '20/59', 'cmi.core.entry': 'resume' });
    const result = buildScormLaunchState(saved, null, false, false, { position: 2, total: 59 });
    const cmi = JSON.parse(result.initialCmiJson);
    expect(result.hasResumeState).toBe(true);
    expect(cmi['cmi.core.lesson_location']).toBe('20/59');
    expect(cmi['cmi.core.entry']).toBe('resume');
  });

  describe('stranded F5 cursor repair', () => {
    const suspend = (a: number, d: number[], extra: Record<string, unknown> = {}) =>
      JSON.stringify({ v: 4, p: 'PKG', a, d, s: {}, g: [], h: {}, vs: {}, q: { answers: [] }, c: false, ...extra });
    const launch = (loc: string, sd: string, extra: Record<string, unknown> = {}) => {
      const raw = JSON.stringify({
        'cmi.core.lesson_location': loc, 'cmi.suspend_data': sd, 'airtrust.total_slides': 59, ...extra,
      });
      const cmi = JSON.parse(buildScormLaunchState(raw, null, false).initialCmiJson);
      return { cmi, state: JSON.parse(cmi['cmi.suspend_data']) };
    };
    const allBut = (hole: number, upTo: number) =>
      Array.from({ length: upTo }, (_, i) => i).filter(i => i !== hole);

    it('rewinds the cursor to the first uncompleted screen without crediting it', () => {
      const { cmi, state } = launch('59/59', suspend(58, allBut(2, 58)));
      expect(state.a).toBe(2);
      expect(state.d).toEqual(allBut(2, 58));
      expect(cmi['cmi.core.lesson_location']).toBe('3/59');
    });

    it('clamps a bookmark that is ahead of the cursor', () => {
      const { cmi, state } = launch('14/59', suspend(3, [0, 1, 2]));
      expect(state.a).toBe(3);
      expect(cmi['cmi.core.lesson_location']).toBe('4/59');
    });

    it('clamps both location aliases (SCORM 1.2 snapshots carry cmi.core.lesson_location and cmi.location)', () => {
      const { cmi, state } = launch('59/59', suspend(58, allBut(2, 58)), { 'cmi.location': '59/59' });
      expect(state.a).toBe(2);
      expect(cmi['cmi.core.lesson_location']).toBe('3/59');
      expect(cmi['cmi.location']).toBe('3/59');
    });

    it('leaves a consistent state untouched', () => {
      const sd = suspend(5, [0, 1, 2, 3, 4]);
      const { cmi } = launch('6/59', sd);
      expect(cmi['cmi.suspend_data']).toBe(sd);
      expect(cmi['cmi.core.lesson_location']).toBe('6/59');
    });

    it('does not touch a finished course or non-v4 / location-only packages', () => {
      const done = suspend(58, allBut(2, 58), { c: true });
      expect(launch('59/59', done).cmi['cmi.suspend_data']).toBe(done);
      const legacy = 'active-checkpoint';
      const cmi = JSON.parse(buildScormLaunchState(JSON.stringify({
        'cmi.core.lesson_location': '17/55', 'cmi.suspend_data': legacy,
      }), null, false).initialCmiJson);
      expect(cmi['cmi.suspend_data']).toBe(legacy);
      expect(cmi['cmi.core.lesson_location']).toBe('17/55');
    });
  });

  it('rejects malformed, completion-capable, or out-of-range handoff bookmarks', () => {
    expect(readScormNavigationBookmark(JSON.stringify({
      status: 'MATCHED_ANCHOR', targetPosition: 33, activeTotal: 43,
      canMarkComplete: false, canTransferScore: false,
    }))).toEqual({ position: 33, total: 43 });
    expect(readScormNavigationBookmark(JSON.stringify({
      status: 'MATCHED_ANCHOR', targetPosition: 33, activeTotal: 43,
      canMarkComplete: true, canTransferScore: false,
    }))).toBeNull();
    expect(readScormNavigationBookmark(JSON.stringify({
      status: 'MATCHED_ANCHOR', targetPosition: 44, activeTotal: 43,
      canMarkComplete: false, canTransferScore: false,
    }))).toBeNull();
  });
});

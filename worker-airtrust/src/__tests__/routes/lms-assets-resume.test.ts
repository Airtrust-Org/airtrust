import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseScormLocationMarker,
  parseScormLocationPair,
  resolveScormResumeTargetSlide,
} from '../../routes/lms-assets';

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
    expect(source).toContain("localStorage.getItem(LOCAL_RESUME_KEY)");
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

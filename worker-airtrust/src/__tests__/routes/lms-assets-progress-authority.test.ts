/**
 * Regressions for the LMS SCORM wrapper hardening (fix/lms-e2e-reliability-final).
 *
 *  - Fix 1: an explicit package-authored SCORM location is authoritative; a
 *    generic `x/y` fraction scraped from the frame DOM must never replace it,
 *    not even with a larger denominator (Wagner/MOM: package 47/47 vs DOM
 *    "121/135" -> persisted stays 47/47).
 *  - Fix 8: numeric zero in the SCORM payload (score_raw=0, score_min=0, …) must
 *    round-trip as 0, never null.
 *  - Wrapper wiring for the governed session close and the diagnostics relay.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { finiteNumberOrNull, resolveProbedScormLocation } from '../../routes/lms-assets';

const SOURCE = readFileSync(resolve(process.cwd(), 'src/routes/lms-assets.ts'), 'utf8');

describe('resolveProbedScormLocation — DOM never overrides explicit SCORM location', () => {
  it('keeps an explicit 47/47 even when the DOM also shows a bigger 121/135', () => {
    const decision = resolveProbedScormLocation({
      authored: true,
      explicitLocation: '47/47',
      domLocation: '121/135',
    });
    expect(decision.persist).toBe(false);
    expect(decision.location).toBe('47/47');
    expect(decision.reason).toBe('explicit-package-location');
  });

  it('still keeps the explicit marker when the DOM fraction happens to match', () => {
    const decision = resolveProbedScormLocation({
      authored: true,
      explicitLocation: '47/47',
      domLocation: '47/47',
    });
    expect(decision).toEqual({ location: '47/47', persist: false, reason: 'explicit-package-location' });
  });

  it('falls back to the DOM only when no location was ever authored', () => {
    const decision = resolveProbedScormLocation({
      authored: false,
      explicitLocation: null,
      domLocation: '12/135',
    });
    expect(decision.persist).toBe(true);
    expect(decision.location).toBe('12/135');
    expect(decision.reason).toBe('dom-fallback');
  });

  it('does not persist when there is neither an authored location nor DOM progress', () => {
    const decision = resolveProbedScormLocation({
      authored: false,
      explicitLocation: null,
      domLocation: 'bookmark-xyz',
    });
    expect(decision.persist).toBe(false);
    expect(decision.location).toBeNull();
  });

  it('an authored-but-degenerate location (0 or empty) does not freeze the DOM fallback', () => {
    const decision = resolveProbedScormLocation({
      authored: true,
      explicitLocation: '',
      domLocation: '3/40',
    });
    expect(decision.persist).toBe(true);
    expect(decision.location).toBe('3/40');
  });
});

describe('finiteNumberOrNull — SCORM zero is a valid value', () => {
  it('preserves numeric and string zero', () => {
    expect(finiteNumberOrNull(0)).toBe(0);
    expect(finiteNumberOrNull('0')).toBe(0);
    expect(finiteNumberOrNull('0.0')).toBe(0);
  });

  it('round-trips a full zero-score payload without nulling anything', () => {
    const cmi: Record<string, string> = {
      'cmi.core.score.raw': '0',
      'cmi.core.score.min': '0',
      'cmi.core.score.max': '100',
    };
    const payload = {
      score_raw: finiteNumberOrNull(cmi['cmi.core.score.raw']),
      score_min: finiteNumberOrNull(cmi['cmi.core.score.min']),
      score_max: finiteNumberOrNull(cmi['cmi.core.score.max']),
    };
    expect(payload).toEqual({ score_raw: 0, score_min: 0, score_max: 100 });
  });

  it('returns null only for absent / non-numeric values', () => {
    expect(finiteNumberOrNull(undefined)).toBeNull();
    expect(finiteNumberOrNull(null)).toBeNull();
    expect(finiteNumberOrNull('')).toBeNull();
    expect(finiteNumberOrNull('abc')).toBeNull();
    expect(finiteNumberOrNull(Number.NaN)).toBeNull();
    expect(finiteNumberOrNull(Infinity)).toBeNull();
  });
});

describe('wrapper wiring', () => {
  it('buildPayload uses finiteNumberOrNull for every score field (no `|| null`)', () => {
    expect(SOURCE).toContain("score_raw: finiteNumberOrNull(cmi['cmi.core.score.raw'])");
    expect(SOURCE).toContain("score_min: finiteNumberOrNull(cmi['cmi.score.min'])");
    expect(SOURCE).not.toContain("parseFloat(cmi['cmi.core.score.raw']) || null");
  });

  it('probeFrameProgress consults resolveProbedScormLocation and bails out when it must not persist', () => {
    expect(SOURCE).toContain('var probeDecision = resolveProbedScormLocation(');
    expect(SOURCE).toContain('if (!probeDecision.persist) {');
    expect(SOURCE).toContain('explicitLocationAuthored');
  });

  it('explicitLocationAuthored is set from resume state / initial CMI and on accepted SetValue', () => {
    expect(SOURCE).toContain('var explicitLocationAuthored = (function() {');
    expect(SOURCE).toMatch(/decision !== 'blocked' && parseScormLocationMarker\(String\(nextValue \|\| ''\)\)/);
  });

  it('exposes an idempotent governed session-close handshake with a bounded timeout', () => {
    expect(SOURCE).toContain("event.data.type === 'lms:session-close'");
    expect(SOURCE).toContain('function performGovernedSessionClose(reason)');
    expect(SOURCE).toContain('if (sessionCloseHandled) {');
    expect(SOURCE).toContain("type: 'lms:session-close:ack'");
    expect(SOURCE).toContain('SESSION_CLOSE_TIMEOUT_MS');
    // never fabricates completion: it commits SCORM_FINISH and mirrors the API
    // terminate, but sets no lesson_status / score itself.
    expect(SOURCE).toContain("commit(buildPayload(), 0, 'SCORM_FINISH')");
    expect(SOURCE).toContain('if (apiInitialized) {');
  });

  it('relays inner-frame AIRTRUST_COMPLETION_DIAGNOSTICS_V1 only from the scorm-frame window', () => {
    expect(SOURCE).toContain('function relayPackageDiagnostics(event)');
    expect(SOURCE).toContain("event.source !== frame.contentWindow");
    expect(SOURCE).toContain("data.type !== 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1'");
    expect(SOURCE).toContain('MAX_RELAYED_DIAGNOSTICS_CHARS');
    expect(SOURCE).toContain("type: 'lms:completion-diagnostics'");
  });

  it('keeps the suspend_data regression guard intact (fix 9 — no global bypass)', () => {
    expect(SOURCE).toContain('function protectSuspendDataValue(currentValue, nextValue)');
    expect(SOURCE).toContain("reason: 'shorter-suspend-data'");
    expect(SOURCE).toContain('SUSPEND_DATA_NEAR_LIMIT_THRESHOLD');
  });
});

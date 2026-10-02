import { describe, expect, it } from 'vitest';
import {
  clampPct,
  extractProgressPctFromCmiJson,
  formatScormLocationTelemetry,
  isMatriculaUniqueConstraintError,
  isScormFailed,
  isScormSuccess,
  parsePositiveInt,
  requiresServerValidatedNonScormEvidence,
  resolveScormScorePct,
  summarizeScormTextPayload,
} from '../../services/lms-matricula-runtime-domain';

describe('LMS matricula runtime domain helpers', () => {
  it('parses positive integers and recognizes only the matricula unique constraint', () => {
    expect(parsePositiveInt('12', 5)).toBe(12);
    expect(parsePositiveInt('0', 5)).toBe(5);
    expect(parsePositiveInt('x', 5)).toBe(5);
    expect(isMatriculaUniqueConstraintError(new Error('UNIQUE constraint failed: lms_matriculas.curso_id'))).toBe(true);
    expect(isMatriculaUniqueConstraintError(new Error('UNIQUE constraint failed: outra_tabela.id'))).toBe(false);
  });

  it('preserves telemetry formatting without exposing payload content', () => {
    expect(formatScormLocationTelemetry({ current: 10, total: 76 })).toBe('10/76');
    expect(formatScormLocationTelemetry({ current: 10, total: null })).toBe('10');
    expect(formatScormLocationTelemetry(null)).toBeNull();
    expect(summarizeScormTextPayload(' abc ')).toEqual({ present: true, bytes: 5 });
    expect(summarizeScormTextPayload('   ')).toEqual({ present: false, bytes: 3 });
    expect(summarizeScormTextPayload(null)).toEqual({ present: false, bytes: 0 });
  });

  it('keeps qualification evidence requirements limited to non-SCORM/H5P content', () => {
    expect(requiresServerValidatedNonScormEvidence('pdf', 1)).toBe(true);
    expect(requiresServerValidatedNonScormEvidence('video', 1)).toBe(true);
    expect(requiresServerValidatedNonScormEvidence('SCORM', 1)).toBe(false);
    expect(requiresServerValidatedNonScormEvidence('h5p', 1)).toBe(false);
    expect(requiresServerValidatedNonScormEvidence('pdf', 0)).toBe(false);
  });

  it('derives SCORM progress with the route legacy precedence unchanged', () => {
    expect(extractProgressPctFromCmiJson(JSON.stringify({ 'cmi.progress_measure': 0.42, 'cmi.location': '1/10' }))).toBe(42);
    expect(extractProgressPctFromCmiJson(JSON.stringify({ 'cmi.location': '10/76' }))).toBe(13);
    expect(extractProgressPctFromCmiJson(JSON.stringify({ 'cmi.core.lesson_location': '38 of 76' }))).toBe(50);
    expect(extractProgressPctFromCmiJson(JSON.stringify({ 'cmi.progress_measure': 1.2, 'cmi.location': '76/76' }))).toBe(100);
    expect(extractProgressPctFromCmiJson('{invalid')).toBeNull();
  });

  it('preserves score precedence and scaled-score range contract', () => {
    expect(resolveScormScorePct({ scoreScaled: 0.755, scoreRaw: 1, scoreMax: 100 })).toBe(76);
    expect(resolveScormScorePct({ scoreScaled: 1.2, scoreRaw: 80, scoreMax: 100 })).toBe(80);
    expect(resolveScormScorePct({ scoreRaw: 40, scoreMax: 50 })).toBe(80);
    expect(resolveScormScorePct({ scoreRaw: 87 })).toBe(87);
    expect(resolveScormScorePct({ scoreRaw: -1 })).toBeNull();
    expect(clampPct(100.7)).toBe(100);
    expect(clampPct(-2)).toBe(0);
  });

  it('preserves completion and failure semantics, including mastery gating', () => {
    expect(isScormSuccess({ lesson_status: 'passed' }, { masteryScore: 90, effectiveScorePct: 10 })).toBe(true);
    expect(isScormSuccess({ lesson_status: 'completed' }, { masteryScore: 80, effectiveScorePct: 79 })).toBe(false);
    expect(isScormSuccess({ lesson_status: 'completed' }, { masteryScore: 80, effectiveScorePct: 80 })).toBe(true);
    expect(isScormSuccess({ completion_status: 'completed', success_status: 'unknown' }, { masteryScore: 70, effectiveScorePct: 70 })).toBe(true);
    expect(isScormFailed({ lesson_status: 'failed' })).toBe(true);
    expect(isScormFailed({ success_status: 'failed' })).toBe(true);
    expect(isScormFailed({ lesson_status: 'completed' })).toBe(false);
  });
});

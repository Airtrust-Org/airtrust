/**
 * TESTES — mergeScormRuntimeState / proteção de cmi.suspend_data
 *
 * Cobre a exceção de "encolhimento perto do teto SCORM 1.2 (~4096 bytes)":
 * pacotes finalizando o curso podem gravar um suspend_data menor de
 * propósito quando o valor atual já está próximo do limite prático — sem
 * isso, a proteção contra reset acidental de progresso (commit 82683c1c)
 * também bloqueia essa finalização legítima.
 */

import { describe, expect, it } from 'vitest';
import { mergeScormRuntimeState } from '../../services/lms-progress-guardrails';

describe('mergeScormRuntimeState — proteção de suspend_data', () => {
  it('bloqueia encolhimento em sessão normal (longe do teto SCORM)', () => {
    const current = 'a'.repeat(500);
    const incoming = 'b'.repeat(100);
    const result = mergeScormRuntimeState({
      currentSuspendData: current,
      incomingSuspendData: incoming,
    });
    expect(result.decisions.blockedShorterSuspendData).toBe(true);
    expect(result.suspendData).toBe(current);
  });

  it('permite encolhimento quando o valor atual já está perto do teto (>=3800 bytes)', () => {
    const current = 'a'.repeat(3897);
    const incoming = 'b'.repeat(200);
    const result = mergeScormRuntimeState({
      currentSuspendData: current,
      incomingSuspendData: incoming,
    });
    expect(result.decisions.blockedShorterSuspendData).toBe(false);
    expect(result.suspendData).toBe(incoming);
  });

  it('continua bloqueando escrita vazia mesmo perto do teto', () => {
    const current = 'a'.repeat(3897);
    const result = mergeScormRuntimeState({
      currentSuspendData: current,
      incomingSuspendData: '',
    });
    expect(result.decisions.blockedEmptySuspendData).toBe(true);
    expect(result.suspendData).toBe(current);
  });
});

describe('mergeScormRuntimeState — never overwrite terminal evidence on SCORM reopening', () => {
  it('preserves passed status, score, bookmark and suspend data after a downgraded reopen', () => {
    const current = {
      'cmi.core.lesson_status': 'passed',
      'cmi.core.score.raw': '100',
      'cmi.core.lesson_location': '53/53',
      'cmi.suspend_data': 'completed-checkpoint',
    };
    const incoming = {
      'cmi.core.lesson_status': 'incomplete',
      'cmi.core.score.raw': '0',
      'cmi.core.lesson_location': '52/53',
      'cmi.suspend_data': 'restarted',
    };
    const result = mergeScormRuntimeState({
      currentCmiJson: JSON.stringify(current),
      incomingCmiJson: JSON.stringify(incoming),
      currentSuspendData: 'completed-checkpoint',
      incomingSuspendData: 'restarted',
    });
    expect(result.decisions.blockedTerminalRegression).toBe(true);
    expect(JSON.parse(result.cmiJson!)).toMatchObject(current);
    expect(result.suspendData).toBe('completed-checkpoint');
    expect(result.location?.current).toBe(53);
  });

  it('recovers missing observed slides after a terminal SCO reopens as incomplete', () => {
    const old = {
      'cmi.core.lesson_status': 'passed',
      'cmi.core.score.raw': '100',
      'cmi.core.lesson_location': '4/4',
      'airtrust.total_slides': 4,
      'airtrust.viewed_slides': [1, 4],
    };
    const resumed = {
      'cmi.core.lesson_status': 'incomplete',
      'cmi.core.score.raw': '0',
      'cmi.core.lesson_location': '3/4',
      'airtrust.total_slides': 4,
      'airtrust.viewed_slides': [2, 3],
    };
    const result = mergeScormRuntimeState({
      currentCmiJson: JSON.stringify(old), incomingCmiJson: JSON.stringify(resumed),
    });
    const merged = JSON.parse(result.cmiJson!);
    expect(result.decisions.blockedTerminalRegression).toBe(true);
    expect(merged['cmi.core.lesson_status']).toBe('passed');
    expect(merged['cmi.core.score.raw']).toBe('100');
    expect(merged['cmi.core.lesson_location']).toBe('4/4');
    expect(merged['airtrust.viewed_slides']).toEqual([1, 2, 3, 4]);
  });

  it('preserves new visits when an old terminal CMI lacked the visit map', () => {
    const result = mergeScormRuntimeState({
      currentCmiJson: JSON.stringify({
        'cmi.core.lesson_status': 'passed', 'cmi.core.lesson_location': '4/4',
      }),
      incomingCmiJson: JSON.stringify({
        'cmi.core.lesson_status': 'incomplete', 'cmi.core.lesson_location': '2/4',
        'airtrust.total_slides': 4, 'airtrust.viewed_slides': [2],
      }),
    });
    const merged = JSON.parse(result.cmiJson!);
    expect(merged['cmi.core.lesson_status']).toBe('passed');
    expect(merged['airtrust.viewed_slides']).toEqual([2]);
  });

  it('does not launder mismatched slide totals or fabricated invalid arrays', () => {
    for (const bad of [
      { 'airtrust.total_slides': 5, 'airtrust.viewed_slides': [2] },
      { 'airtrust.total_slides': 4, 'airtrust.viewed_slides': [2, 2] },
      { 'airtrust.total_slides': 4, 'airtrust.viewed_slides': [0, 2] },
    ]) {
      const result = mergeScormRuntimeState({
        currentCmiJson: JSON.stringify({
          'cmi.core.lesson_status': 'passed', 'cmi.core.lesson_location': '4/4',
          'airtrust.total_slides': 4, 'airtrust.viewed_slides': [1, 4],
        }),
        incomingCmiJson: JSON.stringify({
          'cmi.core.lesson_status': 'incomplete', 'cmi.core.lesson_location': '2/4',
          ...bad,
        }),
      });
      const merged = JSON.parse(result.cmiJson!);
      expect(merged['airtrust.viewed_slides']).toEqual([1, 4]);
    }
  });

  it('retains ordinary incomplete-course progress updates', () => {
    const result = mergeScormRuntimeState({
      currentCmiJson: JSON.stringify({
        'cmi.core.lesson_status': 'incomplete', 'cmi.core.lesson_location': '21/53',
      }),
      incomingCmiJson: JSON.stringify({
        'cmi.core.lesson_status': 'incomplete', 'cmi.core.lesson_location': '22/53',
      }),
    });
    expect(result.decisions.blockedTerminalRegression).toBe(false);
    expect(result.location?.current).toBe(22);
  });

  it('allows a later legitimate passed result to replace incomplete state', () => {
    const result = mergeScormRuntimeState({
      currentCmiJson: JSON.stringify({ 'cmi.core.lesson_status': 'incomplete' }),
      incomingCmiJson: JSON.stringify({
        'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '100',
      }),
    });
    expect(result.decisions.blockedTerminalRegression).toBe(false);
    expect(JSON.parse(result.cmiJson!)['cmi.core.lesson_status']).toBe('passed');
  });
});

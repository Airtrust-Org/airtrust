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

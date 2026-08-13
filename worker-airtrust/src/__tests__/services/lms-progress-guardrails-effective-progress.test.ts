/**
 * TESTES — resolveLmsEffectiveProgress
 *
 * Cobre a regra de progresso efetivo 99/100:
 *   - CONCLUIDO sempre reporta 100
 *   - qualquer outro status é limitado a 99
 *   - progresso bruto 100 sem conclusão aceita vira PENDING_FINAL_STEP (99%)
 */

import { describe, expect, it } from 'vitest';
import {
  buildScormCompletionDiagnostic,
  resolveLmsEffectiveProgress,
} from '../../services/lms-progress-guardrails';

describe('resolveLmsEffectiveProgress', () => {
  it('CONCLUIDO reporta progresso efetivo 100 independente do bruto', () => {
    expect(resolveLmsEffectiveProgress({ status: 'CONCLUIDO', progressoBruto: 100 })).toEqual({
      progresso_bruto: 100,
      progresso_efetivo: 100,
      completion_state: 'COMPLETED',
      completion_reason_code: 'MATRICULA_CONCLUIDA',
    });

    expect(resolveLmsEffectiveProgress({ status: 'concluido', progressoBruto: 42 })).toMatchObject({
      progresso_efetivo: 100,
      completion_state: 'COMPLETED',
    });
  });

  it('progresso bruto 100 sem status CONCLUIDO vira PENDING_FINAL_STEP em 99%', () => {
    expect(resolveLmsEffectiveProgress({ status: 'EM_ANDAMENTO', progressoBruto: 100 })).toEqual({
      progresso_bruto: 100,
      progresso_efetivo: 99,
      completion_state: 'PENDING_FINAL_STEP',
      completion_reason_code: 'PROGRESS_100_WITHOUT_ACCEPTED_COMPLETION',
    });
  });

  it('EM_ANDAMENTO abaixo de 100 preserva o valor bruto como efetivo', () => {
    expect(resolveLmsEffectiveProgress({ status: 'EM_ANDAMENTO', progressoBruto: 63 })).toEqual({
      progresso_bruto: 63,
      progresso_efetivo: 63,
      completion_state: 'IN_PROGRESS',
      completion_reason_code: 'MATRICULA_EM_ANDAMENTO',
    });
  });

  it('NAO_INICIADO sempre reporta progresso efetivo 0', () => {
    expect(resolveLmsEffectiveProgress({ status: 'NAO_INICIADO', progressoBruto: 15 })).toEqual({
      progresso_bruto: 15,
      progresso_efetivo: 0,
      completion_state: 'NOT_STARTED',
      completion_reason_code: 'MATRICULA_NAO_INICIADA',
    });
  });

  it('REPROVADO limita o progresso efetivo a 99 mesmo com bruto 100', () => {
    expect(resolveLmsEffectiveProgress({ status: 'REPROVADO', progressoBruto: 100 })).toEqual({
      progresso_bruto: 100,
      progresso_efetivo: 99,
      completion_state: 'FAILED',
      completion_reason_code: 'MATRICULA_REPROVADA',
    });
  });

  it('CANCELADO limita o progresso efetivo a 99 mesmo com bruto 100', () => {
    expect(resolveLmsEffectiveProgress({ status: 'CANCELADO', progressoBruto: 100 })).toEqual({
      progresso_bruto: 100,
      progresso_efetivo: 99,
      completion_state: 'CANCELLED',
      completion_reason_code: 'MATRICULA_CANCELADA',
    });
  });

  it('trata status ausente/legado como EM_ANDAMENTO', () => {
    expect(resolveLmsEffectiveProgress({ status: null, progressoBruto: 50 })).toMatchObject({
      completion_state: 'IN_PROGRESS',
      progresso_efetivo: 50,
    });
    expect(
      resolveLmsEffectiveProgress({ status: 'STATUS_DESCONHECIDO', progressoBruto: 100 }),
    ).toMatchObject({
      completion_state: 'PENDING_FINAL_STEP',
      progresso_efetivo: 99,
    });
  });

  it('normaliza progresso bruto fora de faixa (negativo/NaN/>100)', () => {
    expect(
      resolveLmsEffectiveProgress({ status: 'EM_ANDAMENTO', progressoBruto: -10 }),
    ).toMatchObject({
      progresso_bruto: 0,
      progresso_efetivo: 0,
    });
    expect(
      resolveLmsEffectiveProgress({ status: 'EM_ANDAMENTO', progressoBruto: Number.NaN }),
    ).toMatchObject({
      progresso_bruto: 0,
      progresso_efetivo: 0,
    });
    expect(
      resolveLmsEffectiveProgress({ status: 'EM_ANDAMENTO', progressoBruto: 250 }),
    ).toMatchObject({
      progresso_bruto: 100,
      progresso_efetivo: 99,
      completion_state: 'PENDING_FINAL_STEP',
    });
  });
});

describe('buildScormCompletionDiagnostic — SCORM 1.2 Finish confiável', () => {
  const finalSnapshot = {
    lessonStatus: 'incomplete',
    scoreRaw: 96,
    scoreMax: 100,
    masteryScore: 70,
    progressoPct: 100,
    cmiJson: JSON.stringify({
      'cmi.core.lesson_status': 'incomplete',
      'cmi.core.lesson_location': '405/405',
      'cmi.core.score.raw': '96',
    }),
    suspendData: 'checkpoint-final-aw139',
    sessionTime: '0000:10:00.00',
  };

  it('aceita Finish observado no último slide com mastery atingido', () => {
    expect(
      buildScormCompletionDiagnostic({
        ...finalSnapshot,
        commitEvent: 'SCORM_FINISH',
        completionCandidate: true,
        completionObservedAt: '2026-08-12T18:42:00.000Z',
      }),
    ).toMatchObject({
      status: 'accepted',
      code: 'SCORM_COMPLETION_ACCEPTED',
      explicit_completion: false,
      reached_final_location: true,
      final_commit_observed: true,
      reasons: expect.arrayContaining(['trusted-scorm-1.2-finish']),
    });
  });

  it('mantém commit comum sem status conclusivo como candidato, não como sucesso', () => {
    expect(
      buildScormCompletionDiagnostic({
        ...finalSnapshot,
        commitEvent: 'SCORM_COMMIT',
        completionCandidate: true,
        completionObservedAt: '2026-08-12T18:42:00.000Z',
      }),
    ).toMatchObject({
      status: 'candidate',
      code: 'SCORM_STATUS_INCONSISTENT',
      explicit_completion: false,
    });
  });

  it('rejeita status realmente contraditório mesmo com Finish no slide final', () => {
    expect(
      buildScormCompletionDiagnostic({
        ...finalSnapshot,
        lessonStatus: 'failed',
        commitEvent: 'SCORM_FINISH',
        completionCandidate: true,
        completionObservedAt: '2026-08-12T18:42:00.000Z',
      }),
    ).toMatchObject({
      status: 'rejected',
      code: 'SCORM_COMPLETION_REJECTED',
      explicit_failure: true,
    });
  });
});

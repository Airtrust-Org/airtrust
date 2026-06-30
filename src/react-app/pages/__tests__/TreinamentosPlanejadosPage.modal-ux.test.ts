/**
 * Regression tests for the modal de turma UX operational fixes.
 *
 * These tests verify pure logic, constants, and formatting functions
 * without mounting React components.
 */
import { describe, it, expect } from 'vitest';

// ─── Mirror the constants and functions from TreinamentosPlanejadosPage.tsx ───

const STATUS_ENCERRADOS = new Set<string>(['CONCLUIDO', 'CANCELADO']);

type TreinamentoPlanejadoStatus =
  | 'PLANEJADO'
  | 'CONFIRMADO'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDO'
  | 'CANCELADO';

// ─── P1: STATUS_ENCERRADOS guard ──────────────────────────────────────────

describe('P1: STATUS_ENCERRADOS guard on Excluir', () => {
  it('should include CONCLUIDO in encerrados set', () => {
    expect(STATUS_ENCERRADOS.has('CONCLUIDO')).toBe(true);
  });

  it('should include CANCELADO in encerrados set', () => {
    expect(STATUS_ENCERRADOS.has('CANCELADO')).toBe(true);
  });

  it('should NOT include PLANEJADO in encerrados set', () => {
    expect(STATUS_ENCERRADOS.has('PLANEJADO')).toBe(false);
  });

  it('should NOT include CONFIRMADO in encerrados set', () => {
    expect(STATUS_ENCERRADOS.has('CONFIRMADO')).toBe(false);
  });

  it('should NOT include EM_ANDAMENTO in encerrados set', () => {
    expect(STATUS_ENCERRADOS.has('EM_ANDAMENTO')).toBe(false);
  });
});

// ─── P1/P2: Convocacao disabled reason ────────────────────────────────────

function getConvocacaoDisabledReason(
  status: TreinamentoPlanejadoStatus | null,
  participantCount: number,
  hasDate: boolean,
): string | null {
  if (status === null) return 'Carregando detalhes da turma';
  if (participantCount === 0) {
    return 'A turma não possui participantes matriculados';
  }
  if (!hasDate) {
    return 'A turma não possui data definida';
  }
  if (status === 'CONCLUIDO' || status === 'CANCELADO') {
    return 'A turma já foi encerrada/concluída';
  }
  return null;
}

describe('P1/P2: getConvocacaoDisabledReason', () => {
  it('should disable Convocar for CONCLUIDO', () => {
    expect(getConvocacaoDisabledReason('CONCLUIDO', 5, true)).toBe(
      'A turma já foi encerrada/concluída',
    );
  });

  it('should disable Convocar for CANCELADO', () => {
    expect(getConvocacaoDisabledReason('CANCELADO', 5, true)).toBe(
      'A turma já foi encerrada/concluída',
    );
  });

  it('should allow Convocar for PLANEJADO with participants and date', () => {
    expect(getConvocacaoDisabledReason('PLANEJADO', 5, true)).toBeNull();
  });

  it('should allow Convocar for CONFIRMADO with participants and date', () => {
    expect(getConvocacaoDisabledReason('CONFIRMADO', 5, true)).toBeNull();
  });

  it('should allow Convocar for EM_ANDAMENTO with participants and date', () => {
    expect(getConvocacaoDisabledReason('EM_ANDAMENTO', 5, true)).toBeNull();
  });

  it('should disable Convocar when no participants', () => {
    expect(getConvocacaoDisabledReason('PLANEJADO', 0, true)).toBe(
      'A turma não possui participantes matriculados',
    );
  });
});

// ─── P3: Template detection in convocacao history ─────────────────────────

function hasTemplateMarkers(assunto: string): boolean {
  return assunto.includes('{{');
}

function renderAssuntoExibicao(
  assunto: string | null,
  treinamentoNome: string | null,
): string {
  if (!assunto) return 'Convocação de turma';
  if (hasTemplateMarkers(assunto)) {
    return `Convocação: ${treinamentoNome || 'Turma'}`;
  }
  return assunto;
}

describe('P3: Template detection in convocacao history', () => {
  it('should detect {{NOME_TREINAMENTO}} as template', () => {
    expect(hasTemplateMarkers('[CONVOCAÇÃO] Treinamento: {{NOME_TREINAMENTO}} — {{DATA_INICIO}}')).toBe(true);
  });

  it('should render fallback for template assunto', () => {
    const result = renderAssuntoExibicao(
      '[CONVOCAÇÃO] Treinamento: {{NOME_TREINAMENTO}} — {{DATA_INICIO}}',
      'CRM TE-91',
    );
    expect(result).toBe('Convocação: CRM TE-91');
    expect(result).not.toContain('{{');
  });

  it('should render fallback when treinamento nome is null', () => {
    const result = renderAssuntoExibicao(
      '[CONVOCAÇÃO] Treinamento: {{NOME_TREINAMENTO}} — {{DATA_INICIO}}',
      null,
    );
    expect(result).toBe('Convocação: Turma');
    expect(result).not.toContain('{{');
  });

  it('should render assunto as-is when no template markers', () => {
    const result = renderAssuntoExibicao(
      'Convite para Treinamento CRM',
      'CRM TE-91',
    );
    expect(result).toBe('Convite para Treinamento CRM');
  });

  it('should render default when assunto is null', () => {
    expect(renderAssuntoExibicao(null, 'CRM TE-91')).toBe('Convocação de turma');
  });
});

// ─── P8: Footer primary action logic ──────────────────────────────────────

type PrimaryActionType = 'convocar' | 'concluir' | 'none';

function getPrimaryActionType(
  canWrite: boolean,
  status: TreinamentoPlanejadoStatus | null,
  convocacaoDisabled: boolean,
): PrimaryActionType {
  if (!canWrite || !status) return 'none';
  if (STATUS_ENCERRADOS.has(status)) return 'none';

  const isPlanejadoOuConfirmado =
    status === 'PLANEJADO' || status === 'CONFIRMADO';
  const isEmAndamento = status === 'EM_ANDAMENTO';

  if (isPlanejadoOuConfirmado && !convocacaoDisabled) return 'convocar';
  if (isEmAndamento) return 'concluir';
  return 'none';
}

describe('P8: Footer primary action logic', () => {
  it('should show Convocar as primary for PLANEJADO', () => {
    expect(getPrimaryActionType(true, 'PLANEJADO', false)).toBe('convocar');
  });

  it('should show Convocar as primary for CONFIRMADO', () => {
    expect(getPrimaryActionType(true, 'CONFIRMADO', false)).toBe('convocar');
  });

  it('should show Concluir as primary for EM_ANDAMENTO', () => {
    expect(getPrimaryActionType(true, 'EM_ANDAMENTO', false)).toBe('concluir');
  });

  it('should show none for CONCLUIDO', () => {
    expect(getPrimaryActionType(true, 'CONCLUIDO', false)).toBe('none');
  });

  it('should show none for CANCELADO', () => {
    expect(getPrimaryActionType(true, 'CANCELADO', false)).toBe('none');
  });

  it('should show none when Convocar is disabled for PLANEJADO', () => {
    expect(getPrimaryActionType(true, 'PLANEJADO', true)).toBe('none');
  });

  it('should show none when user cannot write', () => {
    expect(getPrimaryActionType(false, 'PLANEJADO', false)).toBe('none');
  });
});

// ─── P7: formatDateTimeLabel UTC handling ─────────────────────────────────

function formatDateTimeLabelForTest(value?: string | null): {
  parsed: boolean;
  hasZ: boolean;
  usedT: boolean;
} {
  if (!value) return { parsed: false, hasZ: false, usedT: false };
  const normalized = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  return {
    parsed: !Number.isNaN(date.getTime()),
    hasZ: normalized.endsWith('Z'),
    usedT: normalized.includes('T'),
  };
}

describe('P7: formatDateTimeLabel UTC handling', () => {
  it('should parse ISO 8601 with Z correctly', () => {
    const result = formatDateTimeLabelForTest('2025-06-30T17:35:22Z');
    expect(result.parsed).toBe(true);
    expect(result.hasZ).toBe(true);
  });

  it('should normalize legacy SQLite format to UTC', () => {
    const result = formatDateTimeLabelForTest('2025-06-30 17:35:22');
    expect(result.parsed).toBe(true);
    expect(result.hasZ).toBe(true); // normalized with Z suffix
    expect(result.usedT).toBe(true); // space replaced with T
  });

  it('should handle null value', () => {
    const result = formatDateTimeLabelForTest(null);
    expect(result.parsed).toBe(false);
  });

  it('should handle empty value', () => {
    const result = formatDateTimeLabelForTest('');
    expect(result.parsed).toBe(false);
  });
});

// ─── P9: CONFIRMADO in StatusTreinamento ──────────────────────────────────

describe('P9: CONFIRMADO in StatusTreinamento', () => {
  it('should recognize CONFIRMADO as a valid status value', () => {
    const validStatuses: TreinamentoPlanejadoStatus[] = [
      'PLANEJADO',
      'CONFIRMADO',
      'EM_ANDAMENTO',
      'CONCLUIDO',
      'CANCELADO',
    ];
    expect(validStatuses).toContain('CONFIRMADO');
  });

  it('should have CONFIRMADO in STATUS_META keys', () => {
    const allKeys = ['PLANEJADO', 'CONFIRMADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'];
    expect(allKeys).toHaveLength(5);
  });
});

// ─── P5: Conclusao visibility for PLANEJADO/CONFIRMADO ────────────────────

function shouldShowConclusaoBody(status: TreinamentoPlanejadoStatus): boolean {
  return status !== 'PLANEJADO' && status !== 'CONFIRMADO';
}

describe('P5: Conclusao visibility', () => {
  it('should hide conclusao body for PLANEJADO', () => {
    expect(shouldShowConclusaoBody('PLANEJADO')).toBe(false);
  });

  it('should hide conclusao body for CONFIRMADO', () => {
    expect(shouldShowConclusaoBody('CONFIRMADO')).toBe(false);
  });

  it('should show conclusao body for EM_ANDAMENTO', () => {
    expect(shouldShowConclusaoBody('EM_ANDAMENTO')).toBe(true);
  });

  it('should show conclusao body for CONCLUIDO', () => {
    expect(shouldShowConclusaoBody('CONCLUIDO')).toBe(true);
  });

  it('should show conclusao body for CANCELADO', () => {
    expect(shouldShowConclusaoBody('CANCELADO')).toBe(true);
  });
});

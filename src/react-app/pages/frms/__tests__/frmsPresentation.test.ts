import { describe, expect, it } from 'vitest';
import {
  formatCheckinStatus, formatDataQuality, formatFrmsActivity, formatOptionalMinutesCompact,
  formatFrmsReason, formatRecoveryCredit, formatRecoveryState, formatSnapshotSource,
} from '../frmsPresentation';

describe('FRMS presentation helpers', () => {
  it('não transforma ausência em zero', () => {
    expect(formatOptionalMinutesCompact(null)).toBe('—');
    expect(formatOptionalMinutesCompact(undefined)).toBe('—');
    expect(formatRecoveryCredit(null)).toBe('Não informado');
  });
  it('preserva zero real como valor válido', () => {
    expect(formatOptionalMinutesCompact(0)).toBe('00h00');
    expect(formatRecoveryCredit(0)).toBe('0,0 pt');
    expect(formatRecoveryCredit(1.5)).toBe('+1,5 pt');
  });
  it('não expõe enums internos ao usuário', () => {
    expect(formatCheckinStatus('NAO_APLICAVEL')).toBe('Não aplicável');
    expect(formatFrmsActivity('ATIVIDADE')).toBe('Atividade operacional');
    expect(formatRecoveryState('PARTIAL')).toBe('Recuperação parcial');
    expect(formatDataQuality('INCOMPLETE')).toBe('Incompleta');
    expect(formatSnapshotSource('REAL')).toBe('Confirmado');
    expect(formatFrmsReason('ROLLING_REGULATORY_EVIDENCE_MISSING')).toContain('Histórico móvel');
    expect(formatFrmsReason('ACTIVITY_INTERVAL_MISSING')).toContain('Horário de início ou fim da atividade');
    expect(formatFrmsReason('ACTIVITY_REALIZATION_UNCONFIRMED')).toContain('Realização da atividade');
    expect(formatFrmsReason('SOME_NEW_INTERNAL_CODE')).toBe('Informação operacional incompleta — revisar dados de origem');
    expect(formatFrmsReason('Mensagem já apresentada ao usuário')).toBe('Mensagem já apresentada ao usuário');
  });
});

import { describe, expect, it } from 'vitest';
import { classificarStatusPorVencimento, diasEntreDatas } from '../../lib/status/operational-status';

describe('operational-status', () => {
  describe('diasEntreDatas', () => {
    it('retorna 0 para a mesma data', () => {
      expect(diasEntreDatas('2026-07-04', '2026-07-04')).toBe(0);
    });

    it('retorna positivo quando data alvo esta no futuro', () => {
      expect(diasEntreDatas('2026-08-03', '2026-07-04')).toBe(30);
    });

    it('retorna negativo quando data alvo esta no passado', () => {
      expect(diasEntreDatas('2026-06-04', '2026-07-04')).toBe(-30);
    });
  });

  describe('classificarStatusPorVencimento', () => {
    it('retorna SEM_VENCIMENTO quando nao ha data de vencimento', () => {
      expect(classificarStatusPorVencimento(null, '2026-07-04')).toBe('SEM_VENCIMENTO');
      expect(classificarStatusPorVencimento(undefined, '2026-07-04')).toBe('SEM_VENCIMENTO');
    });

    it('retorna VENCIDA quando a data ja passou', () => {
      expect(classificarStatusPorVencimento('2026-07-03', '2026-07-04')).toBe('VENCIDA');
    });

    it('retorna VENCENDO_30 quando faltam ate 30 dias', () => {
      expect(classificarStatusPorVencimento('2026-08-03', '2026-07-04')).toBe('VENCENDO_30');
      expect(classificarStatusPorVencimento('2026-07-04', '2026-07-04')).toBe('VENCENDO_30');
    });

    it('retorna VALIDA quando faltam mais de 30 dias', () => {
      expect(classificarStatusPorVencimento('2026-08-05', '2026-07-04')).toBe('VALIDA');
    });

    it('respeita threshold customizado', () => {
      expect(classificarStatusPorVencimento('2026-07-10', '2026-07-04', 5)).toBe('VALIDA');
      expect(classificarStatusPorVencimento('2026-07-08', '2026-07-04', 5)).toBe('VENCENDO_30');
    });
  });
});

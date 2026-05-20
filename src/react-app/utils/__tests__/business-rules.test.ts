/**
 * Tests for business-rules utility
 */

import { describe, it, expect } from 'vitest';
import { businessRules } from '../business-rules';

describe('businessRules', () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);

  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 30);

  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 1);

  describe('isCertificadoExpiringSoon', () => {
    it('deve detectar certificado expirando em breve', () => {
      expect(businessRules.isCertificadoExpiringSoon(futureDate, 30)).toBe(true);
    });

    it('deve retornar false para certificado longe do vencimento', () => {
      const farFutureDate = new Date();
      farFutureDate.setDate(farFutureDate.getDate() + 60);
      expect(businessRules.isCertificadoExpiringSoon(farFutureDate, 30)).toBe(false);
    });

    it('deve retornar false para certificado vencido', () => {
      expect(businessRules.isCertificadoExpiringSoon(expiredDate, 30)).toBe(false);
    });
  });

  describe('isCertificadoExpired', () => {
    it('deve detectar certificado vencido', () => {
      expect(businessRules.isCertificadoExpired(expiredDate)).toBe(true);
    });

    it('deve retornar false para certificado válido', () => {
      expect(businessRules.isCertificadoExpired(futureDate)).toBe(false);
    });
  });

  describe('isHabilitacaoExpiringSoon', () => {
    it('deve detectar habilitação expirando em breve', () => {
      expect(businessRules.isHabilitacaoExpiringSoon(futureDate, 30)).toBe(true);
    });

    it('deve retornar false para habilitação longe do vencimento', () => {
      const farFutureDate = new Date();
      farFutureDate.setDate(farFutureDate.getDate() + 60);
      expect(businessRules.isHabilitacaoExpiringSoon(farFutureDate, 30)).toBe(false);
    });
  });

  describe('isHabilitacaoExpired', () => {
    it('deve detectar habilitação vencida', () => {
      expect(businessRules.isHabilitacaoExpired(expiredDate)).toBe(true);
    });

    it('deve retornar false para habilitação válida', () => {
      expect(businessRules.isHabilitacaoExpired(futureDate)).toBe(false);
    });
  });

  describe('daysUntilExpiration', () => {
    it('deve calcular dias até vencimento', () => {
      const result = businessRules.daysUntilExpiration(futureDate);
      expect(result).toBeGreaterThanOrEqual(29);
      expect(result).toBeLessThanOrEqual(31);
    });

    it('deve retornar valor negativo para datas passadas', () => {
      expect(businessRules.daysUntilExpiration(expiredDate)).toBeLessThan(0);
    });
  });

  describe('calculateComplianceScore', () => {
    it('deve retornar 100 para funcionário sem documentação', () => {
      expect(businessRules.calculateComplianceScore([], [])).toBe(100);
    });

    it('deve reduzir score para certificado vencido', () => {
      const certificados = [{ id: '1', dataValidade: expiredDate }];
      const score = businessRules.calculateComplianceScore(certificados, []);
      expect(score).toBeLessThan(100);
    });

    it('deve reduzir score para certificado próximo a vencer', () => {
      const certificados = [{ id: '1', dataValidade: futureDate }];
      const score = businessRules.calculateComplianceScore(certificados, []);
      expect(score).toBeLessThan(100);
    });
  });

  describe('getComplianceStatus', () => {
    it('deve retornar excelente para score alto', () => {
      expect(businessRules.getComplianceStatus(95)).toBe('excelente');
    });

    it('deve retornar bom para score médio', () => {
      expect(businessRules.getComplianceStatus(80)).toBe('bom');
    });

    it('deve retornar alerta para score baixo', () => {
      expect(businessRules.getComplianceStatus(60)).toBe('alerta');
    });

    it('deve retornar crítico para score muito baixo', () => {
      expect(businessRules.getComplianceStatus(30)).toBe('critico');
    });
  });

  describe('getComplianceColor', () => {
    it('deve retornar cor verde para score excelente', () => {
      expect(businessRules.getComplianceColor(95)).toBe('#22c55e');
    });

    it('deve retornar cor vermelha para score crítico', () => {
      expect(businessRules.getComplianceColor(30)).toBe('#dc2626');
    });
  });

  describe('isEmDia', () => {
    it('deve retornar true para funcionário em dia', () => {
      const funcionario = {
        id: '1',
        certificados: [{ id: '1', dataValidade: futureDate }],
        habilitacoes: [{ id: '1', tipo: 'PLA', dataVencimento: futureDate }],
      };

      expect(businessRules.isEmDia(funcionario)).toBe(true);
    });

    it('deve retornar false se certificado vencido', () => {
      const funcionario = {
        id: '1',
        certificados: [{ id: '1', dataValidade: expiredDate }],
        habilitacoes: [{ id: '1', tipo: 'PLA', dataVencimento: futureDate }],
      };

      expect(businessRules.isEmDia(funcionario)).toBe(false);
    });

    it('deve retornar false se habilitação vencida', () => {
      const funcionario = {
        id: '1',
        certificados: [{ id: '1', dataValidade: futureDate }],
        habilitacoes: [{ id: '1', tipo: 'PLA', dataVencimento: expiredDate }],
      };

      expect(businessRules.isEmDia(funcionario)).toBe(false);
    });
  });

  describe('canFly', () => {
    it('deve retornar true se funcionário pode voar', () => {
      const funcionario = {
        id: '1',
        certificados: [{ id: '1', dataValidade: futureDate }],
        habilitacoes: [{ id: '1', tipo: 'PLA', dataVencimento: futureDate }],
      };

      expect(businessRules.canFly(funcionario)).toBe(true);
    });

    it('deve retornar false se sem certificado', () => {
      const funcionario = {
        id: '1',
        certificados: [],
        habilitacoes: [{ id: '1', tipo: 'PLA', dataVencimento: futureDate }],
      };

      expect(businessRules.canFly(funcionario)).toBe(false);
    });

    it('deve retornar false se sem habilitação', () => {
      const funcionario = {
        id: '1',
        certificados: [{ id: '1', dataValidade: futureDate }],
        habilitacoes: [],
      };

      expect(businessRules.canFly(funcionario)).toBe(false);
    });
  });

  describe('getCannotFlyReasons', () => {
    it('deve listar motivos para não voar', () => {
      const funcionario = {
        id: '1',
        certificados: [{ id: '1', dataValidade: expiredDate }],
        habilitacoes: [{ id: '1', tipo: 'PLA', dataVencimento: expiredDate }],
      };

      const reasons = businessRules.getCannotFlyReasons(funcionario);
      expect(reasons.length).toBeGreaterThan(0);
      expect(reasons.some((r) => r.includes('vencido'))).toBe(true);
    });
  });

  describe('getActiveHabilitacoesPercentage', () => {
    it('deve calcular percentual de habilitações ativas', () => {
      const habilitacoes = [
        { id: '1', tipo: 'PLA', dataVencimento: futureDate },
        { id: '2', tipo: 'COM', dataVencimento: futureDate },
      ];

      const percentage = businessRules.getActiveHabilitacoesPercentage(habilitacoes);
      expect(percentage).toBe(100);
    });

    it('deve retornar 0 para sem habilitações', () => {
      expect(businessRules.getActiveHabilitacoesPercentage([])).toBe(0);
    });

    it('deve calcular percentual parcial', () => {
      const habilitacoes = [
        { id: '1', tipo: 'PLA', dataVencimento: futureDate },
        { id: '2', tipo: 'COM', dataVencimento: expiredDate },
      ];

      const percentage = businessRules.getActiveHabilitacoesPercentage(habilitacoes);
      expect(percentage).toBe(50);
    });
  });
});

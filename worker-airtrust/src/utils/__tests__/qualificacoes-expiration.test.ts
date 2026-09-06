/**
 * Testes para cálculos de vencimento de qualificações
 * @file worker-airtrust/src/utils/__tests__/qualificacoes-expiration.test.ts
 */

import {
  calcularDataVencimento,
  calcularDiasAteVencimento,
  determinarStatus,
  calcularValidade,
  estaVigente,
  filtrarExpirando,
  filtrarVencidas,
  agruparPorStatus,
  determinarUrgencia,
} from '../qualificacoes-expiration';

describe('qualificacoes-expiration', () => {
  // Data de referência fixa para testes
  const dataBase = '2024-01-15';
  const proximoMes = '2024-02-15';
  const mesPassado = '2023-12-15';

  describe('calcularDataVencimento', () => {
    it('deve calcular vencimento no dia exato (modo 0)', () => {
      const resultado = calcularDataVencimento(dataBase, 12, 0);
      expect(resultado).toBe('2025-01-15');
    });

    it('deve calcular vencimento no fim do mês (modo 1)', () => {
      const resultado = calcularDataVencimento(dataBase, 12, 1);
      expect(resultado).toBe('2025-01-31');
    });

    it('deve calcular vencimento em 3 meses (dia exato)', () => {
      const resultado = calcularDataVencimento(dataBase, 3, 0);
      expect(resultado).toBe('2024-04-15');
    });

    it('deve calcular vencimento em 3 meses (fim do mês)', () => {
      const resultado = calcularDataVencimento(dataBase, 3, 1);
      expect(resultado).toBe('2024-04-30');
    });

    it('deve lançar erro para data inválida', () => {
      expect(() => calcularDataVencimento('invalid-date', 12, 0)).toThrow();
    });

    it('deve lançar erro para validade inválida', () => {
      expect(() => calcularDataVencimento(dataBase, 0, 0)).toThrow();
      expect(() => calcularDataVencimento(dataBase, -1, 0)).toThrow();
    });

    it('deve considerar fevereiro corretamente (fim de mês)', () => {
      // Jan 15, 2024 + 1 mês + fim do mês = Feb 29 (2024 é bissexto)
      const resultado = calcularDataVencimento('2024-01-15', 1, 1);
      expect(resultado).toBe('2024-02-29');
    });
  });

  describe('calcularDiasAteVencimento', () => {
    it('deve calcular dias até vencimento futuro', () => {
      const dias = calcularDiasAteVencimento(proximoMes, dataBase);
      expect(dias).toBeGreaterThan(0);
      expect(dias).toBeCloseTo(31, 1); // ~31 dias entre 15 de jan e 15 de fev
    });

    it('deve retornar valor negativo para data passada', () => {
      const dias = calcularDiasAteVencimento(mesPassado, dataBase);
      expect(dias).toBeLessThan(0);
    });

    it('deve retornar 0 para mesma data', () => {
      const dias = calcularDiasAteVencimento(dataBase, dataBase);
      expect(dias).toBe(0);
    });

    it('deve usar data atual como referência padrão', () => {
      // Este teste pode variar dependendo da data atual
      const hoje = new Date().toISOString().split('T')[0];
      const dias = calcularDiasAteVencimento(hoje);
      expect(dias).toBe(0);
    });
  });

  describe('determinarStatus', () => {
    it('deve marcar como vigente', () => {
      const futuro = new Date();
      futuro.setDate(futuro.getDate() + 60);
      const dataFuturo = futuro.toISOString().split('T')[0];
      expect(determinarStatus(dataFuturo)).toBe('vigente');
    });

    it('deve marcar como expirando', () => {
      const proximo = new Date();
      proximo.setDate(proximo.getDate() + 15);
      const dataProximo = proximo.toISOString().split('T')[0];
      expect(determinarStatus(dataProximo)).toBe('expirando');
    });

    it('deve marcar como vencida', () => {
      const passado = new Date();
      passado.setDate(passado.getDate() - 10);
      const dataPassado = passado.toISOString().split('T')[0];
      expect(determinarStatus(dataPassado)).toBe('vencida');
    });

    it('deve respeitar dias customizados para expirando', () => {
      const proximo = new Date();
      proximo.setDate(proximo.getDate() + 50);
      const dataProximo = proximo.toISOString().split('T')[0];
      expect(determinarStatus(dataProximo, 30)).toBe('vigente');
      expect(determinarStatus(dataProximo, 60)).toBe('expirando');
    });
  });

  describe('calcularValidade', () => {
    it('deve retornar objeto completo com cálculos', () => {
      const resultado = calcularValidade(dataBase, 12, 0);
      expect(resultado).toHaveProperty('data_conclusao', dataBase);
      expect(resultado).toHaveProperty('data_vencimento', '2025-01-15');
      expect(resultado).toHaveProperty('validade_meses', 12);
      expect(resultado).toHaveProperty('vencimento_fim_mes', 0);
      expect(resultado).toHaveProperty('dias_validade');
      expect(resultado).toHaveProperty('status');
    });

    it('deve calcular dias corretamente', () => {
      const resultado = calcularValidade(dataBase, 12, 0);
      // 12 meses = ~365 dias
      expect(resultado.dias_validade).toBeGreaterThan(360);
      expect(resultado.dias_validade).toBeLessThan(370);
    });
  });

  describe('estaVigente', () => {
    it('deve retornar true para data futura', () => {
      const futuro = new Date();
      futuro.setDate(futuro.getDate() + 10);
      const dataFuturo = futuro.toISOString().split('T')[0];
      expect(estaVigente(dataFuturo)).toBe(true);
    });

    it('deve retornar false para data passada', () => {
      const passado = new Date();
      passado.setDate(passado.getDate() - 10);
      const dataPassado = passado.toISOString().split('T')[0];
      expect(estaVigente(dataPassado)).toBe(false);
    });
  });

  describe('filtrarExpirando', () => {
    const qualificacoes = [
      { id: 1, data_vencimento: '2025-06-01' }, // Vigente
      { id: 2, data_vencimento: '2024-01-20' }, // Expirando (em relação a 2024-01-15)
      { id: 3, data_vencimento: '2024-01-10' }, // Vencida
    ];

    it('deve filtrar qualificações expirando', () => {
      const resultado = filtrarExpirando(qualificacoes, 30, dataBase);
      expect(resultado.length).toBe(1);
      expect(resultado[0].id).toBe(2);
    });

    it('deve retornar array vazio quando nenhuma expira', () => {
      const qualAtivos = [{ id: 1, data_vencimento: '2026-01-01' }];
      const resultado = filtrarExpirando(qualAtivos, 30, dataBase);
      expect(resultado).toHaveLength(0);
    });
  });

  describe('filtrarVencidas', () => {
    const qualificacoes = [
      { id: 1, data_vencimento: '2025-06-01' }, // Vigente
      { id: 2, data_vencimento: '2024-01-20' }, // Expirando
      { id: 3, data_vencimento: '2024-01-10' }, // Vencida
    ];

    it('deve filtrar qualificações vencidas', () => {
      const resultado = filtrarVencidas(qualificacoes, dataBase);
      expect(resultado.length).toBe(1);
      expect(resultado[0].id).toBe(3);
    });

    it('deve retornar array vazio quando nenhuma vencida', () => {
      const qualAtivos = [{ id: 1, data_vencimento: '2026-01-01' }];
      const resultado = filtrarVencidas(qualAtivos, dataBase);
      expect(resultado).toHaveLength(0);
    });
  });

  describe('agruparPorStatus', () => {
    const qualificacoes = [
      { id: 1, data_vencimento: '2025-06-01' }, // Vigente
      { id: 2, data_vencimento: '2024-01-25' }, // Expirando (15-30 dias)
      { id: 3, data_vencimento: '2024-01-10' }, // Vencida
    ];

    it('deve agrupar por status corretamente', () => {
      const resultado = agruparPorStatus(qualificacoes, 30, dataBase);
      expect(resultado.vigentes.length).toBe(1);
      expect(resultado.expirando.length).toBe(1);
      expect(resultado.vencidas.length).toBe(1);
    });

    it('deve agrupar corretamente com dias customizados', () => {
      const resultado = agruparPorStatus(qualificacoes, 15, dataBase);
      expect(resultado.vigentes.length).toBe(1); // 2025 é vigente
      expect(resultado.expirando.length).toBe(1); // 2024-01-25 está a 10 dias, dentro do range de 15
      expect(resultado.vencidas.length).toBeGreaterThan(0);
    });
  });

  describe('determinarUrgencia', () => {
    it('deve retornar critical para vencidas', () => {
      expect(determinarUrgencia(-10)).toBe('critical');
    });

    it('deve retornar critical para menos de 7 dias', () => {
      expect(determinarUrgencia(5)).toBe('critical');
    });

    it('deve retornar high para 8-15 dias', () => {
      expect(determinarUrgencia(10)).toBe('high');
    });

    it('deve retornar medium para 16-30 dias', () => {
      expect(determinarUrgencia(20)).toBe('medium');
    });

    it('deve retornar low para mais de 30 dias', () => {
      expect(determinarUrgencia(60)).toBe('low');
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  applyModelChangeDefaults,
  deriveSpecialFichaFlags,
  filterModelosSessaoForModal,
  isModeloSessaoCompativel,
  normalizeModeloSessaoEquipamento,
  resolveEditModeloSelection,
} from '../modalNovaSessaoRules';

describe('modalNovaSessaoRules', () => {
  describe('resolveEditModeloSelection', () => {
    const modelos = [
      { id: 10, nome: 'REC NORM ALFA' },
      { id: 20, nome: 'FAP14 BETA' },
    ];

    it('prioriza template_id persistido sobre tema_sessao', () => {
      const result = resolveEditModeloSelection({
        modelos,
        modeloSessaoId: null,
        isEditMode: true,
        templateId: 20,
        temaSessao: 'REC NORM ALFA',
      });

      expect(result).toEqual({
        id: 20,
        temaSessao: 'FAP14 BETA',
        source: 'template_id',
      });
    });

    it('faz fallback para tema_sessao quando template_id nao encontra modelo', () => {
      const result = resolveEditModeloSelection({
        modelos,
        modeloSessaoId: null,
        isEditMode: true,
        templateId: 999,
        temaSessao: 'REC NORM ALFA',
      });

      expect(result).toEqual({
        id: 10,
        temaSessao: 'REC NORM ALFA',
        source: 'tema',
      });
    });
  });

  describe('deriveSpecialFichaFlags', () => {
    const tiposCheck = [
      { id: 1, codigo: 'FAP07-TRI' },
      { id: 2, codigo: 'FAP13-CRED' },
      { id: 3, codigo: 'FAP14-LOFT' },
    ];

    it('ativa ficha especial por FAP07/FAP13 mesmo sem toggle manual', () => {
      const result = deriveSpecialFichaFlags({
        checksSelecionados: [1, 2],
        tiposCheck,
        gerarFichaInstrutorManual: false,
        gerarFichaExaminadorManual: false,
      });

      expect(result.hasFap07Selecionada).toBe(true);
      expect(result.hasFap13Selecionada).toBe(true);
      expect(result.gerarFichaInstrutorEfetivo).toBe(true);
      expect(result.gerarFichaExaminadorEfetivo).toBe(true);
    });

    it('preserva toggle manual quando nao ha FAP especial selecionada', () => {
      const result = deriveSpecialFichaFlags({
        checksSelecionados: [3],
        tiposCheck,
        gerarFichaInstrutorManual: true,
        gerarFichaExaminadorManual: false,
      });

      expect(result.hasFap07Selecionada).toBe(false);
      expect(result.hasFap13Selecionada).toBe(false);
      expect(result.gerarFichaInstrutorEfetivo).toBe(true);
      expect(result.gerarFichaExaminadorEfetivo).toBe(false);
    });
  });

  describe('applyModelChangeDefaults', () => {
    it('reaplica checks padrao e limpa toggles manuais ao trocar modelo', () => {
      const result = applyModelChangeDefaults({
        modeloAnteriorId: 10,
        modeloId: 20,
        checksPadrao: [7, 14],
      });

      expect(result).toEqual({
        checksSelecionados: [7, 14],
        gerarFichaInstrutor: false,
        gerarFichaExaminador: false,
      });
    });

    it('nao altera estado quando o modelo nao mudou', () => {
      const result = applyModelChangeDefaults({
        modeloAnteriorId: 20,
        modeloId: 20,
        checksPadrao: [7, 14],
      });

      expect(result).toBeNull();
    });
  });

  describe('filterModelosSessaoForModal', () => {
    const modelos = [
      {
        id: 1,
        codigo: 'SK76-I-01/12',
        nome: '01/12 - Familiarizacao',
        tipo: 'INICIAL',
        tipo_sessao_id: 10,
        tipo_sessao_codigo: 'INI',
        tipo_sessao_nome: 'Inicial',
        modelo_aeronave: 'SK76',
      },
      {
        id: 2,
        codigo: 'SK76-PER-01',
        nome: 'SK76 Periodico',
        tipo: 'SIMULADOR',
        tipo_sessao_id: 20,
        tipo_sessao_codigo: 'PER',
        tipo_sessao_nome: 'Periodico',
        modelo_aeronave: 'S-76',
      },
      {
        id: 3,
        codigo: 'AW139-I-01',
        nome: 'AW139 Inicial',
        tipo: 'SIMULADOR',
        tipo_sessao_id: 10,
        tipo_sessao_codigo: 'INI',
        tipo_sessao_nome: 'Inicial',
        modelo_aeronave: 'AW139',
      },
      {
        id: 4,
        codigo: 'AW139-PER-01',
        nome: 'AW139 Periodico',
        tipo: 'Treinamento Inicial',
        tipo_sessao_id: 20,
        tipo_sessao_codigo: 'PER',
        tipo_sessao_nome: 'Periodico',
        modelo_aeronave: 'AW139',
      },
      {
        id: 5,
        codigo: 'SK76-AER-01',
        nome: 'SK76 Aeronave',
        tipo: 'AERONAVE',
        tipo_sessao_id: 10,
        tipo_sessao_codigo: 'INI',
        tipo_sessao_nome: 'Inicial',
        modelo_aeronave: 'SK76',
      },
      {
        id: 6,
        codigo: 'SK76-INS-01',
        nome: 'SK76 Instrutor',
        tipo: 'INSTRUTOR',
        tipo_sessao_id: 30,
        tipo_sessao_codigo: 'INS',
        tipo_sessao_nome: 'Instrutor',
        modelo_aeronave: 'SK76',
      },
      {
        id: 7,
        codigo: 'GLOBAL-EXA-01',
        nome: 'Credenciamento Examinador',
        tipo: 'RECORRENTE',
        tipo_sessao_id: 23,
        tipo_sessao_codigo: 'EXA',
        tipo_sessao_nome: 'Examinador',
        modelo_aeronave: null,
      },
      {
        id: 8,
        codigo: 'GLOBAL-INS-01',
        nome: 'Treinamento Instrutor',
        tipo: 'RECORRENTE',
        tipo_sessao_id: 22,
        tipo_sessao_codigo: 'INS',
        tipo_sessao_nome: 'Instrutor',
        modelo_aeronave: null,
      },
    ];

    it('normaliza aliases de equipamento SK76', () => {
      expect(normalizeModeloSessaoEquipamento('SK76 (Sikorsky)')).toBe('SK76');
      expect(normalizeModeloSessaoEquipamento('S-76')).toBe('SK76');
      expect(normalizeModeloSessaoEquipamento('s76')).toBe('SK76');
    });

    it('retorna modelos SK76 Inicial para equipamento com fabricante e tipo INI', () => {
      const result = filterModelosSessaoForModal({
        modelos,
        tipoSessao: { codigo: 'INI', nome: 'Inicial' },
        equipamento: 'SK76 (Sikorsky)',
        tipoDispositivo: 'SIMULADOR',
      });

      expect(result.map((modelo) => modelo.codigo)).toEqual(['SK76-I-01/12']);
    });

    it('mantem AW139 funcionando com o mesmo filtro de tipo', () => {
      const result = filterModelosSessaoForModal({
        modelos,
        tipoSessao: { codigo: 'INI', nome: 'Inicial' },
        equipamento: 'AW139',
        tipoDispositivo: 'SIMULADOR',
      });

      expect(result.map((modelo) => modelo.codigo)).toEqual(['AW139-I-01']);
    });

    it('prioriza metadado canonico do tipo e ignora legado ambiguo', () => {
      const result = filterModelosSessaoForModal({
        modelos,
        tipoSessao: { codigo: 'INI', nome: 'Inicial' },
        equipamento: 'AW139',
        tipoDispositivo: 'SIMULADOR',
      });

      expect(result.map((modelo) => modelo.codigo)).not.toContain('AW139-PER-01');
    });

    it('mantem filtro por tipo Periodico sem misturar Inicial', () => {
      const result = filterModelosSessaoForModal({
        modelos,
        tipoSessao: { codigo: 'PER', nome: 'Periódico' },
        equipamento: 'SK76',
        tipoDispositivo: 'SIMULADOR',
      });

      expect(result.map((modelo) => modelo.codigo)).toEqual(['SK76-PER-01']);
    });

    it('nao deixa modelo de outro equipamento aparecer indevidamente', () => {
      expect(
        isModeloSessaoCompativel(modelos[2], {
          tipoSessao: { codigo: 'INI', nome: 'Inicial' },
          equipamento: 'SK76',
          tipoDispositivo: 'SIMULADOR',
        }),
      ).toBe(false);
    });

    it('nao inclui modelo de aeronave real quando a sessao e de simulador', () => {
      const result = filterModelosSessaoForModal({
        modelos,
        tipoSessao: { codigo: 'INI', nome: 'Inicial' },
        equipamento: 'SK76',
        tipoDispositivo: 'SIMULADOR',
      });

      expect(result.map((modelo) => modelo.codigo)).not.toContain('SK76-AER-01');
    });

    it('suporta tipos adicionais (INS) sem misturar outros tipos', () => {
      const result = filterModelosSessaoForModal({
        modelos,
        tipoSessao: { codigo: 'INS', nome: 'Instrutor' },
        equipamento: 'SK76',
        tipoDispositivo: 'SIMULADOR',
      });

      expect(result.map((modelo) => modelo.codigo)).toEqual(['SK76-INS-01', 'GLOBAL-INS-01']);
    });

    it('permite modelo generico sem equipamento para tipos globais', () => {
      const result = filterModelosSessaoForModal({
        modelos,
        tipoSessao: { codigo: 'EXA', nome: 'Examinador' },
        equipamento: 'AW139',
        tipoDispositivo: 'SIMULADOR',
      });

      expect(result.map((modelo) => modelo.codigo)).toEqual(['GLOBAL-EXA-01']);
    });
  });
});

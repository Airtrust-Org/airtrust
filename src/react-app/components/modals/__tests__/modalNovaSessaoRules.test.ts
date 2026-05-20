import { describe, expect, it } from 'vitest';

import {
  applyModelChangeDefaults,
  deriveSpecialFichaFlags,
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
});
import { formatarNomeSessaoVisivel, getNomeExibicaoGuia } from '../helpers';
import { describe, it, expect } from 'vitest';

describe('guias-instrutor/helpers', () => {
  describe('formatarNomeSessaoVisivel', () => {
    it('remove o prefixo padrão', () => {
      const result = formatarNomeSessaoVisivel('AW139 - INICIAL - 02/12 - EMERGÊNCIAS DE MOTOR, OEI E AUTORROTAÇÃO');
      expect(result).toBe('Emergências de motor, oei e autorrotação');
    });

    it('remove prefixo S-76 com acentos', () => {
      const result = formatarNomeSessaoVisivel('S-76 - PERIÓDICO - 01/01 - PROCEDIMENTOS NORMAIS');
      expect(result).toBe('Procedimentos normais');
    });
    
    it('remove o fallback sem numero/ciclo', () => {
      const result = formatarNomeSessaoVisivel('S-76 - CHECK - EMERGÊNCIAS');
      expect(result).toBe('Emergências');
    });

    it('mantém o nome original se não casar, mas arruma caixa se tudo em maíusculas', () => {
      const result = formatarNomeSessaoVisivel('SESSÃO DE REFORÇO');
      expect(result).toBe('Sessão de reforço');
    });

    it('mantém a caixa original se for mista', () => {
      const result = formatarNomeSessaoVisivel('AW139 Especial - Autorrotação');
      expect(result).toBe('AW139 Especial - Autorrotação');
    });
  });

  describe('getNomeExibicaoGuia', () => {
    it('prioriza nome_sessao formatado', () => {
      const res = getNomeExibicaoGuia({
        nome_sessao: 'AW139 - INICIAL - 02/12 - TESTE',
        titulo: 'A139-I-02/12',
        codigo: 'A139-I-02/12',
        sessao_numero: 2,
        sessao_total: 12,
      });
      expect(res.visivel).toBe('Teste');
      expect(res.tooltip).toBe('AW139 - INICIAL - 02/12 - TESTE');
    });

    it('faz fallback para titulo se for diferente de codigo', () => {
      const res = getNomeExibicaoGuia({
        nome_sessao: null,
        titulo: 'Título Amigável',
        codigo: 'A139-I-02/12',
        sessao_numero: 2,
        sessao_total: 12,
      });
      expect(res.visivel).toBe('Título Amigável');
      expect(res.tooltip).toBe('Título Amigável');
    });

    it('faz fallback para Sessao X de Y', () => {
      const res = getNomeExibicaoGuia({
        nome_sessao: null,
        titulo: 'A139-I-02/12',
        codigo: 'A139-I-02/12',
        sessao_numero: 2,
        sessao_total: 12,
      });
      expect(res.visivel).toBe('Sessão 2 de 12');
      expect(res.tooltip).toBe('Sessão 2 de 12');
    });

    it('faz fallback para codigo como ultima opcao', () => {
      const res = getNomeExibicaoGuia({
        nome_sessao: null,
        titulo: 'A139-I-02/12',
        codigo: 'A139-I-02/12',
        sessao_numero: null,
        sessao_total: null,
      });
      expect(res.visivel).toBe('A139-I-02/12');
      expect(res.tooltip).toBe('A139-I-02/12');
    });
  });
});

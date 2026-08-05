import { describe, expect, it } from 'vitest';

import {
  buildTipoPayload,
  buildTipoSaveSuccessMessage,
  getTipoRelatedCachePatterns,
} from '../qualificacoes/tipoSaveFeedback';

describe('tipoSaveFeedback', () => {
  it('monta payload do modelo com conversoes numericas e campos opcionais', () => {
    expect(
      buildTipoPayload({
        nome: ' AS350 B2 ',
        codigo: ' as350-b2 ',
        categoria: 'MANUTENCAO',
        categoria_id: 17,
        conteudo_programatico: ' Conteudo ',
        carga_horaria_inicial: '8',
        carga_horaria_recorrente: 4,
        ativo: 1,
        vencimento_fim_mes: 1,
        is_check: false,
        validade: '12',
        descricao: ' Descricao ',
      }),
    ).toEqual({
      nome: 'AS350 B2',
      codigo: 'as350-b2',
      categoria: 'MANUTENCAO',
      categoria_id: 17,
      conteudo_programatico: 'Conteudo',
      carga_horaria_inicial: 8,
      carga_horaria_recorrente: 4,
      ativo: 1,
      vencimento_fim_mes: 1,
      is_check: 0,
      validade: 12,
      descricao: 'Descricao',
    });
  });

  it('exibe contagem de historicos recalculados e ignorados ao editar', () => {
    expect(
      buildTipoSaveSuccessMessage(
        {
          historicos_recalculados: 7,
          historicos_ignorados: 2,
          warnings: ['override manual nao detectavel'],
        },
        true,
      ),
    ).toBe(
      'Modelo atualizado. 7 registro(s) de histórico recalculado(s). 2 registro(s) sem alteração. Avisos: override manual nao detectavel',
    );
  });

  it('limpa caches de modelos, historico e dashboard', () => {
    expect(getTipoRelatedCachePatterns()).toEqual([
      '/qualificacoes/tipos',
      '/qualificacoes/historico',
      '/dashboard/qualificacoes',
    ]);
  });

  describe('buildTipoPayload — validade sempre presente no payload', () => {
    it('inclui validade como null quando campo e null (remover vencimento)', () => {
      const payload = buildTipoPayload({
        nome: 'Curso X',
        categoria: 'Outros',
        validade: null,
      });
      expect(Object.prototype.hasOwnProperty.call(payload, 'validade')).toBe(true);
      expect(payload.validade).toBeNull();
    });

    it('inclui validade como null quando valor e 0 (invalido — banco rejeita 0)', () => {
      const payload = buildTipoPayload({
        nome: 'Curso Y',
        categoria: 'Manutenção',
        validade: 0,
      });
      expect(payload.validade).toBeNull();
    });

    it('inclui validade positiva quando fornecida', () => {
      const payload = buildTipoPayload({
        nome: 'MGM',
        categoria: 'EAD',
        validade: 24,
      });
      expect(payload.validade).toBe(24);
    });

    it('inclui validade mesmo quando undefined (null por default)', () => {
      const payload = buildTipoPayload({ nome: 'X', categoria: 'Outros' });
      expect(Object.prototype.hasOwnProperty.call(payload, 'validade')).toBe(true);
      expect(payload.validade).toBeNull();
    });
  });

  describe('buildTipoSaveSuccessMessage — criação sem recalculo', () => {
    it('retorna mensagem de criacao quando nao e edicao', () => {
      expect(buildTipoSaveSuccessMessage(null, false)).toBe('Modelo criado.');
    });

    it('retorna contagem zero quando sem historico recalculado', () => {
      const msg = buildTipoSaveSuccessMessage(
        { historicos_recalculados: 0, historicos_ignorados: 5, warnings: [] },
        true,
      );
      expect(msg).toContain('Modelo atualizado.');
      expect(msg).toContain('0 registro(s)');
    });
  });
});

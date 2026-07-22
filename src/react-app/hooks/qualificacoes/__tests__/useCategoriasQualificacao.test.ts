import { describe, expect, it } from 'vitest';
import { normalizeCategoriasQualificacaoResponse } from '../useCategoriasQualificacao';

const categoria = {
  id: 1,
  codigo: 'OPERACIONAL',
  nome: 'Operacional',
  descricao: null,
  cor: null,
  ativo: true,
  ordem: 1,
};

describe('normalizeCategoriasQualificacaoResponse', () => {
  it('desembrulha o envelope retornado por GET /api/categorias', () => {
    expect(
      normalizeCategoriasQualificacaoResponse({
        success: true,
        data: [categoria],
      }),
    ).toEqual([categoria]);
  });

  it('aceita array direto para compatibilidade com clientes já normalizados', () => {
    expect(normalizeCategoriasQualificacaoResponse([categoria])).toEqual([categoria]);
  });

  it('propaga erro funcional retornado dentro do envelope', () => {
    expect(() =>
      normalizeCategoriasQualificacaoResponse({ success: false, error: 'Catálogo indisponível' }),
    ).toThrow('Catálogo indisponível');
  });

  it.each([undefined, null, {}, { success: true }, { success: true, data: {} }])(
    'falha fechado para contrato não iterável: %j',
    (payload) => {
      expect(() => normalizeCategoriasQualificacaoResponse(payload)).toThrow(
        'Resposta inválida ao carregar categorias de qualificações',
      );
    },
  );
});

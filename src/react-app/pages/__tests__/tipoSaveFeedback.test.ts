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
});

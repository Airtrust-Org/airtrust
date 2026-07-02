import { describe, expect, it, vi } from 'vitest';
import { syncLmsCourseFromQualificacaoTipo } from '../../services/lms-ead-ssot';

function createMockDb() {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'run' }> = [];
  const insertCalled = { value: false };

  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          calls.push({ query, args, method: 'first' });

          if (query.includes('FROM qualificacoes_tipos') && query.includes('formato_codigo')) {
            return {
              id: 10,
              empresa_id: 7,
              codigo: 'EMERG-001',
              nome: 'Emergências Gerais',
              descricao: 'Curso EAD',
              categoria: 'Treinamento Teórico',
              formato_id: 2,
              formato_codigo: 'EAD',
              conteudo_programatico: 'Conteúdo',
              observacoes: null,
              carga_horaria: 8,
              carga_horaria_inicial: 8,
              carga_horaria_recorrente: 8,
              deleted_at: null,
            };
          }

          if (query.includes('FROM lms_cursos') && query.includes('qualificacao_tipo_id')) {
            return {
              id: 44,
              empresa_id: 7,
              qualificacao_tipo_id: 10,
              titulo: 'Emergências Gerais',
              descricao: 'Curso EAD',
              categoria: 'Treinamento Teórico',
              formato_id: 2,
              formato_codigo: 'EAD',
              carga_horaria_minutos: 480,
              conteudo_programatico: 'Conteúdo',
              observacoes: null,
              carga_horaria_inicial_horas: 8,
              carga_horaria_recorrente_horas: 8,
              tipo_conteudo: 'scorm',
              scorm_versao: '1.2',
              scorm_mastery_score: 70,
              idioma: 'pt-BR',
              publicado: 1,
              ativo: 0,
              deleted_at: '2026-07-01 12:00:00',
            };
          }

          return null;
        },
        run: async () => {
          calls.push({ query, args, method: 'run' });

          if (query.includes('INSERT INTO lms_cursos')) {
            insertCalled.value = true;
          }

          return { meta: { changes: 1, last_row_id: 44 } };
        },
      }),
    })),
  } as unknown as D1Database;

  return { db, calls, insertCalled };
}

describe('lms-ead-ssot', () => {
  it('reativa o curso soft-deletado sem recriar uma linha nova ao sincronizar um tipo EAD', async () => {
    const { db, calls, insertCalled } = createMockDb();

    const cursoId = await syncLmsCourseFromQualificacaoTipo(db, {
      empresaId: 7,
      qualificacaoTipoId: 10,
    });

    expect(cursoId).toBe(44);
    expect(insertCalled.value).toBe(false);
    expect(calls.some((call) => call.query.includes('UPDATE lms_cursos') && call.method === 'run')).toBe(
      true,
    );
    expect(
      calls.some(
        (call) =>
          call.query.includes('UPDATE lms_cursos') &&
          call.query.includes('deleted_at = NULL') &&
          call.query.includes('ativo = 1') &&
          call.query.includes('formato_id = ?') &&
          call.query.includes('gerar_qualificacao_ao_concluir = 1'),
      ),
    ).toBe(true);
  });
});

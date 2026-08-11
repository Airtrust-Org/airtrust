import { describe, expect, it, vi } from 'vitest';
import {
  syncLmsCourseFromQualificacaoTipo,
  syncQualificacaoTipoFromCurso,
} from '../../services/lms-ead-ssot';

type QueryCall = { query: string; args: unknown[]; method: 'first' | 'all' | 'run' };

function makeTipoRow() {
  return {
    id: 10,
    empresa_id: 7,
    codigo: 'EMERG-001',
    nome: 'Emergências Gerais',
    descricao: 'Curso EAD',
    categoria: 'EAD',
    formato_id: null,
    formato_codigo: 'EAD',
    conteudo_programatico: 'Conteúdo',
    observacoes: null,
    carga_horaria: 8,
    carga_horaria_inicial: 8,
    carga_horaria_recorrente: 8,
    deleted_at: null,
  };
}

function makeCourseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 44,
    empresa_id: 7,
    qualificacao_tipo_id: 10,
    titulo: 'Emergências Gerais',
    descricao: 'Curso EAD',
    categoria: 'EAD',
    formato_id: null,
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
    scorm_package_r2_prefix: null,
    scorm_launch_file: null,
    thumbnail_r2_key: null,
    conteudo_arquivo_nome: null,
    matriculas_total: 0,
    progressos_scorm_total: 0,
    ...overrides,
  };
}

function createMockDb(courseCandidates: Array<Record<string, unknown>>) {
  const calls: QueryCall[] = [];
  const insertCalled = { value: false };

  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          calls.push({ query, args, method: 'first' });

          if (query.includes('FROM qualificacoes_tipos') && query.includes('formato_codigo')) {
            return makeTipoRow();
          }

          if (query.includes('FROM qualificacoes_formatos')) {
            return { id: 2 };
          }

          if (query.includes('FROM qualificacoes_categorias')) {
            return null;
          }

          return null;
        },
        all: async () => {
          calls.push({ query, args, method: 'all' });

          if (query.includes('FROM lms_cursos') && query.includes('progressos_scorm_total')) {
            return { results: courseCandidates };
          }

          if (query.includes('FROM qualificacoes_categorias')) {
            return { results: [{ id: 13 }] };
          }

          return { results: [] };
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
    const { db, calls, insertCalled } = createMockDb([makeCourseRow()]);

    const cursoId = await syncLmsCourseFromQualificacaoTipo(db, {
      empresaId: 7,
      qualificacaoTipoId: 10,
    });

    expect(cursoId).toBe(44);
    expect(insertCalled.value).toBe(false);
    expect(
      calls.some((call) => call.query.includes('UPDATE lms_cursos') && call.method === 'run'),
    ).toBe(true);
    const update = calls.find(
      (call) => call.query.includes('UPDATE lms_cursos') && call.method === 'run',
    );
    expect(update?.query).toContain('formato_id = NULL');
  });

  it('prefere o curso original com assets e matrículas ao shell vazio mais novo', async () => {
    const { db, calls, insertCalled } = createMockDb([
      makeCourseRow({
        id: 35,
        ativo: 1,
        deleted_at: null,
      }),
      makeCourseRow({
        id: 5,
        ativo: 0,
        deleted_at: '2026-07-02 15:56:44',
        scorm_package_r2_prefix: 'lms/scorm/6/5/',
        scorm_launch_file: 'index.html',
        thumbnail_r2_key: 'lms/course-thumbnails/6/5/1781455432443.png',
        conteudo_arquivo_nome: 'TRIP_Emergencias_Gerais_SCORM12_RevLMS2026-06-28.zip',
        matriculas_total: 13,
        progressos_scorm_total: 6,
      }),
    ]);

    const cursoId = await syncLmsCourseFromQualificacaoTipo(db, {
      empresaId: 7,
      qualificacaoTipoId: 10,
    });

    expect(cursoId).toBe(5);
    expect(insertCalled.value).toBe(false);
    const updateCall = calls.find(
      (call) => call.query.includes('UPDATE lms_cursos') && call.method === 'run',
    );
    expect(updateCall?.args.at(-2)).toBe(5);
  });

  it('falha fechado quando encontra mais de um curso recuperável com evidência equivalente', async () => {
    const { db, insertCalled } = createMockDb([
      makeCourseRow({
        id: 5,
        scorm_package_r2_prefix: 'lms/scorm/6/5/',
        scorm_launch_file: 'index.html',
        matriculas_total: 13,
        progressos_scorm_total: 6,
      }),
      makeCourseRow({
        id: 8,
        scorm_package_r2_prefix: 'lms/scorm/6/8/',
        scorm_launch_file: 'index.html',
        matriculas_total: 9,
        progressos_scorm_total: 6,
      }),
    ]);

    await expect(
      syncLmsCourseFromQualificacaoTipo(db, {
        empresaId: 7,
        qualificacaoTipoId: 10,
      }),
    ).rejects.toThrow(/Ambiguidade ao resolver curso LMS canônico/);
    expect(insertCalled.value).toBe(false);
  });
});

describe('syncQualificacaoTipoFromCurso', () => {
  // Incident 2026-08-10: production had exactly one 'EAD' categoria row for
  // the tenant, but with ativo=0 — resolveCanonicalEadCategoriaId's original
  // ativo=1-only query found zero rows and threw a raw Error, escalating to
  // an uncaught 500 on every metadata save of every EAD-linked course
  // (PUT /api/lms/cursos/:id, before the SCORM upload even starts).
  function makeCursoJoinRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 43,
      empresa_id: 6,
      qualificacao_tipo_id: 139,
      titulo: 'MEL - Lista de Equipamentos Mínimos',
      descricao: null,
      categoria: null,
      formato_id: null,
      formato_codigo: null,
      carga_horaria_minutos: 480,
      conteudo_programatico: null,
      observacoes: null,
      carga_horaria_inicial_horas: null,
      carga_horaria_recorrente_horas: null,
      qualificacao_categoria: 'EAD',
      qualificacao_formato_id: null,
      qualificacao_formato_codigo: null,
      ...overrides,
    };
  }

  function makeMockDb(categoriaRows: Array<{ id: number }>) {
    const updateCalls: unknown[][] = [];

    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (
              query.includes('FROM lms_cursos c') &&
              query.includes('JOIN qualificacoes_tipos qt')
            ) {
              return makeCursoJoinRow();
            }
            return null;
          },
          all: async () => {
            if (query.includes('FROM qualificacoes_categorias')) {
              if (query.includes('ativo = 1')) return { results: [] };
              return { results: categoriaRows };
            }
            if (/PRAGMA\s+table_info\s*\(\s*qualificacoes_tipos\s*\)/i.test(query)) {
              return { results: [{ name: 'categoria_id' }] };
            }
            return { results: [] };
          },
          run: async () => {
            if (query.includes('UPDATE qualificacoes_tipos')) {
              updateCalls.push(args);
            }
            return { meta: { changes: 1, last_row_id: 0 } };
          },
        }),
      })),
    } as unknown as D1Database;

    return { db, updateCalls };
  }

  it('sincroniza usando a categoria EAD inativa quando é a única candidata', async () => {
    const { db, updateCalls } = makeMockDb([{ id: 13 }]);

    const result = await syncQualificacaoTipoFromCurso(db, { empresaId: 6, cursoId: 43 });

    expect(result).toBe(139);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toContain(13);
  });

  it('continua fail-closed quando existem duas categorias EAD (mesmo com nenhuma ativa)', async () => {
    const { db } = makeMockDb([{ id: 13 }, { id: 21 }]);

    await expect(syncQualificacaoTipoFromCurso(db, { empresaId: 6, cursoId: 43 })).rejects.toThrow(
      /Categoria EAD canônica inválida/,
    );
  });
});

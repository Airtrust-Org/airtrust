import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCompletionCategory, type CompleteLmsMatriculaParams } from '../../services/lms-completion';

const { categoryMock } = vi.hoisted(() => ({
  categoryMock: vi.fn(),
}));

vi.mock('../../services/qualification-category-contract', () => ({
  requireActiveQualificationCategoryById: categoryMock,
}));

const OPERATIONAL = {
  id: 17, empresaId: 6, nome: 'Treinamentos Operacionais',
  codigo: 'TREINAMENTO_OPERACIONAL', ativo: true,
  dominioCodigo: null, lmsIntegrada: false,
  lmsIntegrationSource: 'legacy-code-compat',
};

function fixtures(options: {
  typeCode?: string;
  categoryCode?: string;
  allowEnrollment?: boolean;
  empresaId?: number;
} = {}) {
  const typeCode = options.typeCode ?? 'FDM-TRIPULACAO';
  const prepared: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          prepared.push({ sql, args });
          return {
            first: async () => {
              if (sql.includes('FROM qualificacoes_tipos')) {
                return { id: 204, categoria_id: 17, codigo: typeCode };
              }
              if (sql.includes('FROM lms_cursos c')) {
                const expected = [71, 6, 204, 'FDM-TRIPULACAO', 'TREINAMENTO_OPERACIONAL', 700, 6, 77];
                if (!sql.includes('c.ativo = 1') ||
                  !sql.includes('c.publicado = 1') ||
                  !sql.includes("m.status IN ('EM_ANDAMENTO', 'CONCLUIDO')") ||
                  !sql.includes("c.tipo_conteudo = 'scorm'") ||
                  !sql.includes('m.deleted_at IS NULL')) {
                  return null;
                }
                if (options.allowEnrollment === false ||
                  args.length !== expected.length ||
                  !args.every((value, index) => value === expected[index])) return null;
                return { allowed: 1 };
              }
              throw new Error('Unexpected DB query');
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  const params = {
    db, empresaId: options.empresaId ?? 6, cursoId: 71, matriculaId: 700, funcionarioId: 77,
    cursoTitulo: 'FDM - Tripulação', gerarQualificacaoAoConcluir: true,
    qualificacaoTipoId: 204, qualificacaoCodigo: 'FDM-TRIPULACAO',
    qualificacaoNome: 'FDM Tripulação', qualificacaoCategoria: null,
    validade: 24, dataConclusao: '2026-10-10',
    action: 'LMS_MATRICULA_CONCLUIDA',
  } satisfies CompleteLmsMatriculaParams;
  return { db, params, prepared };
}

describe('LMS FDM operational category — exact guarded completion', () => {
  beforeEach(() => {
    categoryMock.mockReset().mockResolvedValue(OPERATIONAL);
  });

  it('permite FDM 71 / modelo 204 com categoria operacional vigente, após conferir vínculo da matrícula no D1', async () => {
    const { db, params, prepared } = fixtures();
    const category = await resolveCompletionCategory(db, params);
    expect(category.codigo).toBe('TREINAMENTO_OPERACIONAL');
    expect(prepared.some(x=>x.sql.includes('FROM lms_cursos c'))).toBe(true);
    expect(prepared.filter(x=>x.sql.includes('FROM lms_cursos c'))[0].args)
      .toEqual([71, 6, 204, 'FDM-TRIPULACAO', 'TREINAMENTO_OPERACIONAL', 700, 6, 77]);
  });

  it('nunca libera outro curso ou outro tenant com categoria operacional', async () => {
    for (const overrides of [{ cursoId: 73 }, { cursoId: 72 }, { empresaId: 7 }]) {
      const { db, params, prepared } = fixtures();
      await expect(resolveCompletionCategory(db, { ...params, ...overrides }))
        .rejects.toMatchObject({ code: 'LMS_QUALIFICATION_CATEGORY_NOT_INTEGRATED' });
      expect(prepared.some(x=>x.sql.includes('FROM lms_cursos c'))).toBe(false);
    }
  });

  it('nega se o tipo/categoria divergir do modelo FDM-TRIPULACAO canônico', async () => {
    const { db, params } = fixtures({ typeCode: 'FDM-MECANICO' });
    await expect(resolveCompletionCategory(db, params))
      .rejects.toMatchObject({ code: 'LMS_QUALIFICATION_CATEGORY_NOT_INTEGRATED' });
    categoryMock.mockResolvedValue({ ...OPERATIONAL, codigo: 'EAD_OUTRO' });
    const validDb = fixtures();
    await expect(resolveCompletionCategory(validDb.db, validDb.params))
      .rejects.toMatchObject({ code: 'LMS_QUALIFICATION_CATEGORY_NOT_INTEGRATED' });
  });

  it('nega se matrícula não estiver vinculada ao próprio funcionário, curso e empresa', async () => {
    const { db, params } = fixtures({ allowEnrollment: false });
    await expect(resolveCompletionCategory(db, params))
      .rejects.toMatchObject({ code: 'LMS_QUALIFICATION_CATEGORY_NOT_INTEGRATED' });
  });

  it('nega um modelo sem categoria ativa, sem promover EAD automaticamente', async () => {
    const { db, params, prepared } = fixtures();
    categoryMock.mockRejectedValue(new Error('QUALIFICATION_CATEGORY_INVALID'));
    await expect(resolveCompletionCategory(db, params))
      .rejects.toMatchObject({ code: 'LMS_QUALIFICATION_MAPPING_INVALID' });
    expect(prepared.some(x=>x.sql.includes('FROM lms_cursos c'))).toBe(false);
  });

  it('continua permitindo categoria LMS-integrada normal sem a exceção FDM', async () => {
    categoryMock.mockResolvedValue({ ...OPERATIONAL, codigo: 'EAD', lmsIntegrada: true });
    const { db, params, prepared } = fixtures();
    await expect(resolveCompletionCategory(db, { ...params, cursoId: 100 }))
      .resolves.toMatchObject({ codigo: 'EAD', lmsIntegrada: true });
    expect(prepared.some(x=>x.sql.includes('FROM lms_cursos c'))).toBe(false);
  });
});

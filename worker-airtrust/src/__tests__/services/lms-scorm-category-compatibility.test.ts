import { describe, expect, it, vi } from 'vitest';
import {
  hasApprovedScormCategoryLink,
  type ScormCategoryCompatibilityContext,
} from '../../services/lms-scorm-category-compatibility';

const mappings = [
  { course: 26, type: 125, model: 'MNT_MGM', category: 'TREINAMENTO-DE-DOUTRINACAO' },
  { course: 27, type: 124, model: 'MNT_MCQ', category: 'TREINAMENTO-DE-DOUTRINACAO' },
  { course: 29, type: 123, model: 'MNT_MOM', category: 'TREINAMENTO-DE-DOUTRINACAO' },
  { course: 70, type: 188, model: 'NR-05', category: 'TREINAMENTO_GERAL' },
  { course: 71, type: 204, model: 'FDM-TRIPULACAO', category: 'TREINAMENTO_OPERACIONAL' },
] as const;

function fixture(mapping: (typeof mappings)[number] = mappings[0]) {
  const first = vi.fn(async (): Promise<{ allowed: number } | null> => ({ allowed: 1 }));
  const bind = vi.fn(() => ({ first }));
  const prepare = vi.fn((_sql: string) => ({ bind }));
  const params: ScormCategoryCompatibilityContext = {
    db: { prepare } as unknown as D1Database,
    empresaId: 6,
    cursoId: mapping.course,
    matriculaId: 800,
    funcionarioId: 77,
    qualificacaoTipoId: mapping.type,
    qualificacaoTipoCodigo: mapping.model,
    categoriaCodigo: mapping.category,
    gerarQualificacaoAoConcluir: true,
  };
  return { params, prepare, bind, first };
}

describe('reviewed LMS non-EAD SCORM category compatibility', () => {
  for (const mapping of mappings) {
    it(`allows only reviewed course #${mapping.course} after canonical enrollment and category recheck`, async () => {
      const { params, prepare, bind } = fixture(mapping);
      await expect(hasApprovedScormCategoryLink(params)).resolves.toBe(true);
      const sql = String(prepare.mock.calls[0][0]);
      expect(sql).toContain('JOIN qualificacoes_tipos qt');
      expect(sql).toContain('JOIN qualificacoes_categorias qc');
      expect(sql).toContain('qt.deleted_at IS NULL AND qt.ativo = 1');
      expect(sql).toContain('qc.deleted_at IS NULL AND qc.ativo = 1');
      expect(sql).toContain('c.gerar_qualificacao_ao_concluir = 1');
      expect(sql).toContain("m.status IN ('EM_ANDAMENTO', 'CONCLUIDO')");
      expect(bind).toHaveBeenCalledWith(mapping.course, 6, mapping.type, mapping.model, mapping.category, 800, 6, 77);
    });
  }

  it('blocks unreviewed course, other tenant, type or category without querying D1', async () => {
    const { params, prepare } = fixture();
    for (const changes of [
      { cursoId: 28 }, { empresaId: 7 }, { qualificacaoTipoId: 777 },
      { qualificacaoTipoCodigo: 'MNT_MCQ' }, { categoriaCodigo: 'EAD' },
      { gerarQualificacaoAoConcluir: false }, { matriculaId: 0 },
      { funcionarioId: -1 }, { cursoId: null },
    ]) {
      await expect(hasApprovedScormCategoryLink({ ...params, ...changes })).resolves.toBe(false);
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  it('refuses when enrollment, type, or category query yields no match', async () => {
    const { params, first } = fixture();
    first.mockResolvedValueOnce(null);
    await expect(hasApprovedScormCategoryLink(params)).resolves.toBe(false);
  });
});

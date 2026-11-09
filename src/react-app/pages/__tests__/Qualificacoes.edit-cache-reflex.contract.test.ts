import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Reflexo entre telas: editar um registro do Histórico precisa invalidar também as projeções de
 * Compliance/Funcionários/Dashboard (como confirmar, cancelar, excluir e renovar), não só recarregar
 * a lista local. Antes o onSuccess do modal de edição chamava apenas carregarHistorico().
 */
const source = readFileSync('src/react-app/pages/Qualificacoes.tsx', 'utf8');
const compliance = readFileSync('src/react-app/lib/compliance-source-invalidation.ts', 'utf8');

describe('edição de histórico de qualificação invalida as demais telas', () => {
  it('o onSuccess de TODAS as instâncias do modal de criar/editar usa recarregarHistoricoEStats()', () => {
    const blocks: string[] = [];
    let from = 0;
    for (;;) {
      const start = source.indexOf('<ModalAtribuirQualificacao', from);
      if (start < 0) break;
      const end = source.indexOf('</Suspense>', start);
      blocks.push(source.slice(start, end));
      from = end;
    }
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const block of blocks) {
      expect(block).toContain('onSuccess={async () => {');
      expect(block).toContain('await recarregarHistoricoEStats();');
      expect(block).not.toMatch(/await carregarHistorico\(\);/);
    }
  });

  it('recarregarHistoricoEStats recarrega a lista e invalida as projeções de evidência', () => {
    const start = source.indexOf('const recarregarHistoricoEStats = useCallback');
    const block = source.slice(start, source.indexOf('}, [carregarHistorico', start));
    expect(block).toContain('carregarHistorico()');
    expect(block).toContain('invalidateTrainingEvidenceProjections(queryClient)');
  });

  it('as projeções invalidadas cobrem Compliance, Funcionários (Ficha), Dashboard e Histórico', () => {
    for (const key of ["['training-compliance']", "'funcionarios'", "'dashboard'", "['historico-qualificacoes']", "['qualificacoes']"]) {
      expect(compliance).toContain(key);
    }
  });
});

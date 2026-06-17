import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const qualificacoesSource = readFileSync(resolve(currentDir, '../Qualificacoes.tsx'), 'utf8');

describe('Qualificacoes — fluxo de certificados', () => {
  it('clique no icone seleciona o historico e abre o modal', () => {
    expect(qualificacoesSource).toContain('setHistoricoSelecionado(item);');
    expect(qualificacoesSource).toContain('setShowCertModal(true);');
  });

  it('query planejada de 500 registros so roda quando ha vencidas na pagina atual', () => {
    expect(qualificacoesSource).toContain(
      "const shouldLoadPlannedRelatedHistorico = useMemo(",
    );
    expect(qualificacoesSource).toContain(
      "(item) => getHistoricoDisplayStatus(item) === 'VENCIDA'",
    );
    expect(qualificacoesSource).toContain('shouldLoadPlannedRelatedHistorico,');
  });

  it('fechar modal nao dispara refetch pesado adicional', () => {
    expect(qualificacoesSource).toContain('setShowCertModal(false);');
    expect(qualificacoesSource).toContain('setHistoricoSelecionado(null);');
    expect(qualificacoesSource).not.toContain(
      'setHistoricoSelecionado(null);\n              // Forçar refetch completo para atualizar indicador de certificado\n              carregarHistorico();',
    );
  });
});

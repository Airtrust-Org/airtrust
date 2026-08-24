/**
 * Testes de caracterização do botão "Gerar PDF" por proposta em
 * PlanejamentoSimuladores.tsx (Fase G do CAE Planning V3). Mesmo padrão de
 * PlanejamentoSimuladores.resource-assignment.test.tsx.
 */

import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(
  'src/react-app/pages/simuladores/planejamento/PlanejamentoSimuladores.tsx',
  'utf-8',
);

describe('PlanejamentoSimuladores PDF export — caracterização de contrato', () => {
  it('chama GET /:id/pdf via fetchWithAuth (não apiJson, pois a resposta é binária)', () => {
    const idx = src.indexOf('const handleProposalPdf');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/fetchWithAuth\(`\/api\/simuladores\/planejamento\/\$\{id\}\/pdf`\)/);
  });

  it('baixa o PDF via downloadBlob com nome de arquivo por proposta', () => {
    const idx = src.indexOf('const handleProposalPdf');
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/downloadBlob\(blob, `proposta-cae-\$\{id\}\.pdf`\)/);
  });

  it('erros do backend são refletidos via toast, não silenciados', () => {
    const idx = src.indexOf('const handleProposalPdf');
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/showToast\.error\(frontendErrorMessage\(error\)\)/);
  });

  it('botão existe na coluna de Ação, por proposta', () => {
    expect(src).toMatch(/onClick=\{\(\) => void handleProposalPdf\(item\.id\)\}/);
    expect(src).toContain('Gerar PDF');
  });
});

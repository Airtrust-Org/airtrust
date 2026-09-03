import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/react-app/pages/simuladores/planejamento/PlanejamentoSimuladoresV3.tsx'),
  'utf8',
);

describe('Planejamento de Simulador V3 — fluxo persistente de CAE', () => {
  it('permite salvar uma proposta antes da CAE e retomá-la posteriormente', () => {
    expect(source).toContain("'/api/simuladores/planejamento-v2/rascunhos'");
    expect(source).toContain("'AGUARDANDO_CAE'");
    expect(source).toContain('Salvar e aguardar CAE');
    expect(source).toContain('Planejamentos em andamento');
    expect(source).toContain('Retome a proposta exatamente de onde parou');
  });

  it('preserva a referência do PDF CAE e atualiza o estado após comparação', () => {
    expect(source).toContain('caeFileKey');
    expect(source).toContain("'CAE_RECEBIDA'");
    expect(source).toContain("'PLANEJADO'");
    expect(source).toContain("'REPLANEJAR'");
    expect(source).toContain('Comparar e definir datas');
  });

  it('mantém o fluxo como planejamento, sem materializar qualificação ou sessão pela tela', () => {
    expect(source).not.toContain('/materializar');
    expect(source).not.toContain('/qualificacoes/historico');
    expect(source).toContain('Isso não agenda sessão nem altera qualificação.');
  });
});

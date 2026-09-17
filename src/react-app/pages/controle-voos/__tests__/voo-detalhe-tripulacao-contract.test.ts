import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Controle de Voos - gestão de tripulação no voo criado', () => {
  it('remove o placeholder N1 e oferece cadastro e troca de tripulação', () => {
    const detail = source('src/react-app/pages/controle-voos/ControleVoosVooDetalhe.tsx');
    const card = source('src/react-app/pages/controle-voos/components/ControleVoosTripulacaoCard.tsx');
    expect(detail).not.toContain('Dados de tripulação não disponíveis nesta versão N1');
    expect(detail).toContain('ControleVoosTripulacaoCard');
    expect(detail).toContain('Alterar Tripulação');
    expect(card).toContain('Cadastrar tripulação');
    expect(card).toContain('Trocar');
    expect(card).toContain('useCriarTripulante');
    expect(card).toContain('useAtualizarTripulante');
  });
});

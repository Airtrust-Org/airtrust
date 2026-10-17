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
    // A troca permanece no cartão de cada tripulante; não duplicar o botão geral.
    expect(detail).not.toContain('Alterar Tripulação');
    expect(detail).toContain('ControleVoosFadigaCard');
    expect(detail).toContain('ControleVoosEdicaoRapida');
    expect(card).toContain('Cadastrar tripulação');
    expect(card).toContain('Trocar');
    expect(card).toContain('useCriarTripulante');
    expect(card).toContain('useAtualizarTripulante');
  });
  it('permite informar e alterar a apresentação manual sem substituir tripulante', () => {
    const card = source('src/react-app/pages/controle-voos/components/ControleVoosTripulacaoCard.tsx');
    const hooks = source('src/react-app/hooks/useControleVoos.ts');
    const offline = source('worker-airtrust/src/routes/controle-voos-pilot-offline-core.ts');

    expect(card).toContain('Hora de apresentação (manual)');
    expect(card).toContain('Editar apresentação');
    expect(card).toContain("dialog?.mode === 'edit-time'");
    expect(card).toContain('horario_apresentacao: horarioApresentacao || null');
    expect(hooks).toContain('...(horario_apresentacao !== undefined ? { horario_apresentacao } : {})');
    expect(offline).toMatch(/COALESCE\\(\\s*t\\.horario_apresentacao,\\s*\\(/);
  });

});

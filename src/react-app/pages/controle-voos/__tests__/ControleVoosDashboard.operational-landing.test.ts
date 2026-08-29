import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/react-app/pages/controle-voos/ControleVoosDashboard.tsx'),
  'utf8',
);

describe('ControleVoosDashboard operational landing', () => {
  it('prioriza pendências e programação em vez de KPI cards e menus duplicados', () => {
    expect(source).toContain('Atenção operacional');
    expect(source).toContain('Próximos voos');
    expect(source).toContain('Situação do período');
    expect(source).not.toContain('ControleVoosStatCards');
    expect(source).not.toContain('lg:grid-cols-5');
  });

  it('mantém erros técnicos fora da mensagem apresentada ao usuário', () => {
    expect(source).toContain('Não foi possível carregar a situação operacional.');
    expect(source).not.toContain('Erro ao carregar dashboard: {error.message}');
  });
});

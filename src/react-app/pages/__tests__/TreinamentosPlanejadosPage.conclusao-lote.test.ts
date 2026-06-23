import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(currentDir, '../TreinamentosPlanejadosPage.tsx'), 'utf8');
const hookSource = readFileSync(resolve(currentDir, '../../hooks/useTreinamentosPlanejados.ts'), 'utf8');

describe('TreinamentosPlanejadosPage conclusão em lote UX contract', () => {
  it('expõe resumo operacional e ações em lote no bloco de conclusão', () => {
    expect(pageSource).toContain('Conclusão da turma');
    expect(pageSource).toContain('Históricos gerados');
    expect(pageSource).toContain('Marcar todos como presentes');
    expect(pageSource).toContain('Marcar todos como aprovados');
    expect(pageSource).toContain('Marcar todos presentes e aprovados');
    expect(pageSource).toContain('Concluir turma e salvar');
  });

  it('mostra confirmação explícita antes de salvar a conclusão', () => {
    expect(pageSource).toContain('Confirmar conclusão da turma');
    expect(pageSource).toContain('Você está prestes a concluir a turma e registrar presença/aprovação');
    expect(pageSource).toContain('Esta ação pode gerar histórico e qualificações para participantes');
    expect(pageSource).toContain('Pendentes sem conclusão');
  });

  it('explica que o status concluído depende do resultado final dos participantes', () => {
    expect(pageSource).toContain(
      'A turma só pode ser marcada como concluída quando todos os participantes tiverem resultado final.',
    );
    expect(pageSource).toContain('Use "Concluir turma e salvar"');
  });

  it('oculta a conclusão para perfis sem permissão de escrita', () => {
    expect(pageSource).toContain("const canConcluirTurma = canWriteTraining;");
    expect(pageSource).toContain('Apenas admin/gestor autorizado pode concluir a turma.');
  });

  it('usa o endpoint dedicado de conclusão em lote', () => {
    expect(hookSource).toContain('/planejados/${id}/conclusao-lote');
    expect(hookSource).toContain('TreinamentoPlanejadoConclusaoLoteResultado');
  });
});

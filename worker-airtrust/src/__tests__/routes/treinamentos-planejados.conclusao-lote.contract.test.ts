import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../routes/treinamentos-planejados.ts', import.meta.url).pathname,
  'utf8',
);

describe('treinamentos-planejados conclusão em lote route contract', () => {
  it('expõe endpoint de conclusão em lote protegido por admin/manager', () => {
    expect(source).toContain("'/planejados/:id/conclusao-lote'");
    expect(source).toContain("requireRole('admin', 'manager')");
  });

  it('rejeita turma futura, turma sem participantes e submissão vazia', () => {
    expect(source).toContain('Turma futura não pode ser concluída');
    expect(source).toContain('Turma sem participantes para concluir');
    expect(source).toContain('Nenhuma alteração foi aplicada');
  });

  it('retorna resumo explícito da operação para evitar 200 enganoso', () => {
    expect(source).toContain('status_turma');
    expect(source).toContain('total_participantes');
    expect(source).toContain('criados');
    expect(source).toContain('ja_existentes');
    expect(source).toContain('ignorados');
    expect(source).toContain('erros');
  });

  it('bloqueia concluir manualmente a turma sem resultados finais de todos os participantes', () => {
    expect(source).toContain('A turma só pode ser marcada como Concluída quando todos os participantes tiverem resultado final.');
    expect(source).toContain('Use "Concluir turma e salvar"');
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(currentDir, '../TreinamentosPlanejadosPage.tsx'), 'utf8');
const hookSource = readFileSync(resolve(currentDir, '../../hooks/useTreinamentosPlanejados.ts'), 'utf8');

describe('TreinamentosPlanejadosPage daily attendance UI contract', () => {
  it('keeps daily attendance separate from participant completion', () => {
    expect(pageSource).toContain('Presenca diaria');
    expect(pageSource).toContain('Registro por dia da turma; aprovacao e emissao continuam no bloco de conclusao.');
    expect(pageSource).toContain('useAtualizarPresencaDiaTreinamento');
    expect(pageSource).toContain('TreinamentoPlanejadoPresencaDiaStatus');
  });

  it('exposes per-day bulk and per-participant actions', () => {
    expect(pageSource).toContain('Marcar todos presentes');
    expect(pageSource).toContain('Marcar todos ausentes');
    expect(pageSource).toContain('Limpar dia');
    expect(pageSource).toContain('PRESENCA_DIA_OPTIONS.map');
  });

  it('uses the backend daily-attendance endpoint instead of participant completion', () => {
    expect(hookSource).toContain('/planejados/${id}/dias/${diaId}/presencas');
    expect(hookSource).toContain('TreinamentoPlanejadoPresencaDiaInput');
  });

  it('usa linguagem de participantes nas convocações operacionais da turma', () => {
    expect(pageSource).toContain(
      'Registro operacional dos envios de e-mail e das falhas por participante.',
    );
    expect(pageSource).toContain('Alguns participantes não entrarão na fila');
    expect(pageSource).not.toContain('falhas por tripulante');
    expect(pageSource).not.toContain('Alguns tripulantes não entrarão na fila');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const plannedSource = readFileSync(
  decodeURIComponent(new URL('../../routes/treinamentos-planejados.ts', import.meta.url).pathname),
  'utf8',
);
const requestSource = readFileSync(
  decodeURIComponent(new URL('../../routes/solicitacoes-treinamento.ts', import.meta.url).pathname),
  'utf8',
);

describe('Agendamentos dynamic permission wiring', () => {
  it('governs planned-training writes without making the UI an authority', () => {
    expect(plannedSource).toContain("requirePermission('agendamentos', 'criar', 'admin', 'manager')");
    expect(plannedSource.match(/requirePermission\('agendamentos', 'editar', 'admin', 'manager'\)/g)?.length).toBe(7);
    expect(plannedSource).toContain("requirePermission('agendamentos', 'deletar', 'admin', 'manager')");
    expect(plannedSource).toContain("requirePermission('agendamentos', 'criar', 'admin')");
    expect(plannedSource).not.toContain('requireRole(');
  });

  it('governs request approval, scheduling, rejection and completion server-side', () => {
    expect(requestSource.match(/requirePermission\('agendamentos', 'editar', 'admin', 'manager'\)/g)?.length).toBe(5);
    expect(requestSource).not.toContain('requireRole(');
  });
});

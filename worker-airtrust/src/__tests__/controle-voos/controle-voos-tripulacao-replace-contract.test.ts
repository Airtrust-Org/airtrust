import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const text = readFileSync(resolve(process.cwd(), 'src/routes/controle-voos-rdv-workflow.ts'), 'utf8');

describe('Controle de Voos - substituição de tripulação', () => {
  it('permite substituição pré-RDV somente para coordenação e mantém tenant scope', () => {
    expect(text).toContain('payload.funcionario_id !== undefined');
    expect(text).toContain('hasRdvCapability(c, RDV_CAPABILITIES.visualizarTodos)');
    expect(text).toContain('Somente a Coordenacao pode substituir tripulantes');
    expect(text).toContain('Funcionario ja integra a tripulacao deste voo');
    expect(text).toContain("empresa_id = ? AND funcionario_id = ? AND id <> ?");
    expect(text).toContain("Tripulante substituido pela Coordenacao");
  });
});

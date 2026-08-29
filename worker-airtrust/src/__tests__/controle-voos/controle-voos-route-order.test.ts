import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url) as any);
const readRepoFile = (path: string) =>
  readFileSync(new URL(path, `file://${REPO_ROOT}/`) as any, 'utf8');

describe('Controle de Voos route precedence', () => {
  it('mounts the RDV workflow static routes before the generic /voos/:id router', () => {
    const source = readRepoFile('worker-airtrust/src/index.ts');
    const workflowMount = source.indexOf(
      "app.route('/api/controle-voos', controleVoosRdvWorkflowRoutes);",
    );
    const genericMount = source.indexOf(
      "app.route('/api/controle-voos', controleVoosRoutes);",
    );

    expect(workflowMount).toBeGreaterThanOrEqual(0);
    expect(genericMount).toBeGreaterThanOrEqual(0);
    expect(workflowMount).toBeLessThan(genericMount);
  });

  it('keeps /voos/meus tenant- and employee-scoped in the workflow handler', () => {
    const source = readRepoFile('worker-airtrust/src/routes/controle-voos-rdv-workflow.ts');

    expect(source).toContain("rdvWorkflow.get('/voos/meus'");
    expect(source).toContain('v.empresa_id = ?');
    expect(source).toContain('t.empresa_id = v.empresa_id');
    expect(source).toContain('t.funcionario_id = ?');
    expect(source).toContain("return c.json({ success: true, data: [], meta: { count: 0 } });");
  });
});

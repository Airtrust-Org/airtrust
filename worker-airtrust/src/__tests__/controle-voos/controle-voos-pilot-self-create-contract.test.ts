import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8');
}

describe('Pilot self-service flight creation contract', () => {
  it('creates only a planned flight and binds the authenticated employee as crew', () => {
    const text = source('worker-airtrust/src/routes/controle-voos-pilot-self-create.ts');

    expect(text).toContain("post('/voos/meus/criar'");
    expect(text).toContain('getFuncionarioIdForUser');
    expect(text).toContain("status, observacoes");
    expect(text).toContain("'planejado'");
    expect(text).toContain('INSERT INTO cv_voo_tripulantes');
    expect(text).toContain("['PIC', 'SIC']");
    expect(text).toContain('empresa_id = ?');
  });

  it('does not grant the generic editor middleware to a student', () => {
    const text = source('worker-airtrust/src/routes/controle-voos-pilot-self-create.ts');

    expect(text).not.toContain('requireControleVoosWrite');
    expect(text).not.toContain("checkPermission(c, 'editor')");
    expect(text).toContain('requireAnyRdvAccess()');
    expect(text).toContain('CONTROLE_VOOS_PILOT_CREATE_FORBIDDEN_FIELD');
  });

  it('is composed through the already-mounted pilot route without changing index routing', () => {
    const wrapper = source('worker-airtrust/src/routes/controle-voos-pilot-offline.ts');
    const index = source('worker-airtrust/src/index.ts');

    expect(wrapper).toContain("import pilotSelfCreate from './controle-voos-pilot-self-create'");
    expect(wrapper).toContain("import pilotOfflineCore from './controle-voos-pilot-offline-core'");
    expect(index).toContain("import controleVoosPilotOfflineRoutes from './routes/controle-voos-pilot-offline'");
    expect(index).toContain("app.route('/api/controle-voos', controleVoosPilotOfflineRoutes)");
  });
});

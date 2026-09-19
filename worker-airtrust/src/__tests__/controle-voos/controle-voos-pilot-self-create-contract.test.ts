import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Pilot self-service flight creation contract', () => {
  it('creates only a planned flight and binds the authenticated employee with an onboard-role catalog id', () => {
    const text = source('src/routes/controle-voos-pilot-self-create.ts');
    expect(text).toContain("post('/voos/meus/criar'");
    expect(text).toContain('getFuncionarioIdForUser');
    expect(text).toContain("'planejado'");
    expect(text).toContain('INSERT INTO cv_voo_tripulantes');
    expect(text).toContain('funcao_bordo_id');
    expect(text).toContain('empresa_id = ?');
  });

  it('requires canonical route, flight type, contract and onboard role instead of free-text/Petrobras defaults', () => {
    const text = source('src/routes/controle-voos-pilot-self-create.ts');
    expect(text).toContain("'rota_ids'");
    expect(text).toContain("'tipo_voo_id'");
    expect(text).toContain("'contrato_id'");
    expect(text).toContain("'funcao_bordo_id'");
    expect(text).toContain('resolveFlightRoutePoints');
    expect(text).toContain("'cv_tipos_voo'");
    expect(text).toContain("'cv_contratos'");
    expect(text).toContain("'cv_funcoes_bordo'");
    expect(text).not.toContain("'PETROBRAS'");
    expect(text).not.toContain("'origem_texto'");
    expect(text).not.toContain('ensureTemporaryAirport');
  });

  it('keeps Natureza hidden as neutral legacy compatibility only', () => {
    const text = source('src/routes/controle-voos-pilot-self-create.ts');
    expect(text).toContain("codigo = 'OPERACIONAL'");
    expect(text).toContain('CONTROLE_VOOS_OPERATIONAL_NATURE_MISSING');
    expect(text).not.toContain('natureza_voo_codigo');
  });

  it('does not grant the generic editor middleware to a pilot', () => {
    const text = source('src/routes/controle-voos-pilot-self-create.ts');
    expect(text).not.toContain('requireControleVoosWrite');
    expect(text).not.toContain("checkPermission(c, 'editor')");
    expect(text).toContain('requireAnyRdvAccess()');
    expect(text).toContain('CONTROLE_VOOS_PILOT_CREATE_FORBIDDEN_FIELD');
  });

  it('is composed through the already-mounted pilot route without changing index routing', () => {
    const wrapper = source('src/routes/controle-voos-pilot-offline.ts');
    const index = source('src/index.ts');
    expect(wrapper).toContain("import pilotSelfCreate from './controle-voos-pilot-self-create'");
    expect(wrapper).toContain("import pilotOfflineCore from './controle-voos-pilot-offline-core'");
    expect(index).toContain("import controleVoosPilotOfflineRoutes from './routes/controle-voos-pilot-offline'");
    expect(index).toContain("app.route('/api/controle-voos', controleVoosPilotOfflineRoutes)");
  });
});

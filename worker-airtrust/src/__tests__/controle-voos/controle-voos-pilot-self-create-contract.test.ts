import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Pilot flight creation ownership contract', () => {
  it('does not mount a pilot self-service flight creation route', () => {
    const wrapper = source('src/routes/controle-voos-pilot-offline.ts');
    const index = source('src/index.ts');

    expect(wrapper).not.toContain('controle-voos-pilot-self-create');
    expect(wrapper).not.toContain('pilotSelfCreate');
    expect(wrapper).toContain("import pilotOfflineCore from './controle-voos-pilot-offline-core'");
    expect(index).toContain("import controleVoosPilotOfflineRoutes from './routes/controle-voos-pilot-offline'");
    expect(index).toContain("app.route('/api/controle-voos', controleVoosPilotOfflineRoutes)");
  });

  it('keeps flight creation under the coordination route instead of the pilot route', () => {
    const routes = source('src/routes/controle-voos.ts');
    expect(routes).toContain("post('/voos'");
    expect(routes).not.toContain("post('/voos/meus/criar'");
  });
});

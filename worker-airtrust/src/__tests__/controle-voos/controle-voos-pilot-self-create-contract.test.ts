import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Pilot self-service flight creation contract', () => {
  it('creates only a planned flight and binds the authenticated employee as crew', () => {
    const text = source('src/routes/controle-voos-pilot-self-create.ts');

    expect(text).toContain("post('/voos/meus/criar'");
    expect(text).toContain('getFuncionarioIdForUser');
    expect(text).toContain("status, observacoes");
    expect(text).toContain("'planejado'");
    expect(text).toContain('INSERT INTO cv_voo_tripulantes');
    expect(text).toContain("['PIC', 'SIC']");
    expect(text).toContain('empresa_id = ?');
  });

  it('accepts temporary manual operational fields without requiring pilot catalog selection', () => {
    const text = source('src/routes/controle-voos-pilot-self-create.ts');

    expect(text).toContain("'origem_texto'");
    expect(text).toContain("'destino_texto'");
    expect(text).toContain("'tipo_voo_texto'");
    expect(text).toContain("'natureza_voo_codigo'");
    expect(text).toContain("new Set(['MANUTENCAO', 'PETROBRAS'])");
    expect(text).toContain('ensureTemporaryAirport');
    expect(text).toContain('ensureTemporaryFlightType');
    expect(text).toContain('resolvePilotNature');
    expect(text).toContain('CONTROLE_VOOS_PILOT_CREATE_NATURE_NOT_CONFIGURED');
    expect(text).not.toContain('INSERT INTO cv_naturezas_voo');
    expect(text).toContain('entrada_livre_temporaria: manualMode');
  });

  it('resolves typed aerodrome or ICAO against the active tenant catalog before creating a temporary entry', () => {
    const text = source('src/routes/controle-voos-pilot-self-create.ts');

    expect(text).toContain("UPPER(codigo) = ?");
    expect(text).toContain("UPPER(COALESCE(codigo_icao, '')) = ?");
    expect(text).toContain('CONTROLE_VOOS_PILOT_CREATE_AMBIGUOUS_AIRPORT');
    expect(text).toContain('empresa_id = ? AND ativo = 1 AND deleted_at IS NULL');
  });

  it('does not grant the generic editor middleware to a student', () => {
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

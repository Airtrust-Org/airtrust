import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const {
  assertRdvSelfScope,
  hasRdvCapability,
  getFlightOrThrow,
  getActiveRdvByFlight,
  getFuncionarioIdForUser,
  isCrewOnFlight,
  buildPilotOfflineLeaseClaims,
  signPilotOfflineLease,
} = vi.hoisted(() => ({
  assertRdvSelfScope: vi.fn(async () => undefined),
  hasRdvCapability: vi.fn(async () => true),
  getFlightOrThrow: vi.fn(),
  getActiveRdvByFlight: vi.fn(),
  getFuncionarioIdForUser: vi.fn(async () => 77),
  isCrewOnFlight: vi.fn(async () => true),
  buildPilotOfflineLeaseClaims: vi.fn(() => ({
    lease_version: 1,
    purpose: 'offline_flight_lease',
    tenant_id: 7,
    user_id: 70,
    funcionario_id: 77,
    flight_ids: [42],
    device_id: 'device-1234567890',
    issued_at: '2026-09-09T10:00:00.000Z',
    valid_from: '2026-09-09T09:55:00.000Z',
    valid_until: '2026-09-09T22:00:00.000Z',
    app_min_version: '1.0.0',
    allowed_local_actions: ['open_package', 'edit_rdv_draft'],
    nonce: 'nonce-test',
  })),
  signPilotOfflineLease: vi.fn(async () => ({
    envelope_version: 1,
    alg: 'ES256',
    key_id: 'pilot-test-key',
    payload: 'payload',
    signature: 'signature',
  })),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    if (!c.req.header('Authorization')) {
      return c.json({ success: false, error: 'Token de autenticacao nao fornecido' }, 401);
    }
    c.set('empresaId', 7);
    c.set('userId', 70);
    c.set('userRole', 'student');
    c.set('tenantContext', { empresaId: 7, role: 'student' });
    await next();
  },
}));

vi.mock('../../repositories/controle-voos/rdv-repository', () => ({
  getActorId: () => 70,
  getEmpresaIdSafe: () => 7,
  getFlightOrThrow,
  getActiveRdvByFlight,
  getFuncionarioIdForUser,
  isCrewOnFlight,
}));

vi.mock('../../services/controle-voos/rdv-workflow', () => ({
  RDV_CAPABILITIES: {
    visualizarProprio: 'voos.rdv.visualizar_proprio',
    editarRascunhoProprio: 'voos.rdv.editar_rascunho_proprio',
    criarProprio: 'voos.rdv.criar_proprio',
  },
  requireAnyRdvAccess: () => async (_c: any, next: () => Promise<void>) => next(),
  assertRdvSelfScope,
  hasRdvCapability,
}));

vi.mock('../../services/controle-voos/pilot-offline-lease', () => ({
  validatePilotOfflineDeviceId: (value: unknown) => String(value || ''),
  validatePilotOfflineAppVersion: (value: unknown) => String(value || ''),
  buildPilotOfflineLeaseClaims,
  signPilotOfflineLease,
}));

import pilotOfflineRoutes from '../../routes/controle-voos-pilot-offline';

function statementFor(sql: string) {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  const statement: any = {
    binds: [] as unknown[],
    bind(...args: unknown[]) {
      statement.binds = args;
      return statement;
    },
    async all() {
      if (normalized.includes('FROM cv_voo_tripulantes')) {
        return {
          results: [
            {
              id: 1,
              funcionario_id: 77,
              etapa_id: null,
              funcao: 'PIC',
              horario_apresentacao: '2026-09-09T09:00:00Z',
              horario_dispensa: null,
              observacoes: null,
              nome: 'Piloto Teste',
              codigo_anac: '123456',
              updated_at: '2026-09-09T09:01:00Z',
            },
          ],
        };
      }
      if (normalized.includes('FROM cv_voo_etapas')) {
        return {
          results: [
            {
              id: 10,
              numero_etapa: 1,
              origem_icao: 'SBME',
              destino_icao: '9PCP',
              horario_motor_ligado: null,
              horario_decolagem: null,
              horario_pouso: null,
              horario_motor_desligado: null,
              tempo_decolagem_pouso: null,
              tempo_total: null,
              tempo_navegacao: '00:50',
              tempo_ifr: '00:10',
              tempo_noturno: '00:05',
              pousos_diurnos: 0,
              pousos_noturnos: 0,
              starts: 0,
              pax: 8,
              payload: 720,
              combustivel_inicio: 2400,
              combustivel_fim: null,
              unidade_combustivel: 'LB',
              origem_dados: 'manual',
              updated_at: '2026-09-09T09:02:00Z',
            },
          ],
        };
      }
      if (normalized.includes('FROM cv_voo_abastecimentos')) {
        return {
          results: [
            {
              id: 20,
              etapa_id: null,
              fornecedor: 'Fornecedor',
              localidade: 'SBME',
              combustivel_solicitado: 200,
              unidade: 'L',
              combustivel_abastecido: 198,
              numero_ce: 'CE-1',
              anexo_r2_key: 'controle-voos/7/42/abastecimentos/20/comprovante.pdf',
              responsavel_id: 70,
              data_hora: '2026-09-09T09:03:00Z',
              observacoes: null,
              updated_at: '2026-09-09T09:04:00Z',
            },
          ],
        };
      }
      return { results: [] };
    },
    async first() {
      if (normalized.includes('FROM cv_aeroportos')) {
        const id = statement.binds[0];
        return {
          id,
          codigo: id === 1 ? 'SBME' : '9PCP',
          codigo_icao: id === 1 ? 'SBME' : null,
          codigo_iata: null,
          nome: id === 1 ? 'Macaé' : 'Plataforma',
          cidade: 'Macaé',
          uf: 'RJ',
          tipo: 'operacional',
        };
      }
      if (normalized.includes('FROM aeronaves')) {
        return { id: 3, modelo: 'AW139' };
      }
      return null;
    },
  };
  return statement;
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError((error, c) => c.json({ success: false, error: error.message }, 403));
  app.route('/api/controle-voos', pilotOfflineRoutes);
  return app;
}

function createEnv() {
  return {
    DB: {
      prepare: vi.fn((sql: string) => statementFor(sql)),
    },
  } as unknown as Env;
}

describe('Pilot offline package', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFlightOrThrow.mockResolvedValue({
      id: 42,
      empresa_id: 7,
      prefixo: 'PR-TST',
      data_programacao: '2026-09-09',
      origem_id: 1,
      destino_id: 2,
      tipo_voo_id: 4,
      natureza_voo_id: 5,
      aeronave_id: 3,
      horario_previsto_partida: '2026-09-09T10:00:00Z',
      horario_previsto_chegada: '2026-09-09T11:00:00Z',
      horario_real_partida: null,
      horario_real_chegada: null,
      status: 'planejado',
      observacoes: null,
      cancelado_motivo_id: null,
      alternado_destino_id: null,
      versao: 6,
      created_at: '2026-09-09T08:00:00Z',
      updated_at: '2026-09-09T09:00:00Z',
    });
    getActiveRdvByFlight.mockResolvedValue({
      id: 90,
      empresa_id: 7,
      voo_id: 42,
      numero: 'RDV-42',
      data_voo: '2026-09-09',
      horario_decolagem_real: null,
      horario_pouso_real: null,
      horas_voadas: null,
      numero_pousos: null,
      ciclos: null,
      combustivel_decolagem: 2400,
      combustivel_pouso: null,
      combustivel_consumo: null,
      pob: 10,
      carga_kg: 720,
      ocorrencias: null,
      divergencias: null,
      status: 'rascunho',
      workflow_status: 'rascunho',
      versao: 3,
      updated_at: '2026-09-09T09:05:00Z',
    });
  });

  it('exige autenticacao', async () => {
    const response = await createApp().request(
      'http://localhost/api/controle-voos/voos/42/offline-package',
      {},
      createEnv(),
    );
    expect(response.status).toBe(401);
  });

  it('reutiliza o self-scope do RDV antes de devolver o snapshot', async () => {
    const response = await createApp().request(
      'http://localhost/api/controle-voos/voos/42/offline-package',
      { headers: { Authorization: 'Bearer test' } },
      createEnv(),
    );
    expect(response.status).toBe(200);
    expect(assertRdvSelfScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      7,
      42,
      'voos.rdv.visualizar_proprio',
    );
  });

  it('retorna contrato read-only versionado sem expor a chave interna do R2', async () => {
    const response = await createApp().request(
      'http://localhost/api/controle-voos/voos/42/offline-package',
      { headers: { Authorization: 'Bearer test' } },
      createEnv(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');

    const body = (await response.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.contract).toMatchObject({
      name: 'airtrust-pilot-offline-package',
      version: 1,
      package_id: 'pilot-offline:v1:voo:42:v6:rdv:3',
      read_only: true,
      sync_supported: false,
      attachments_included: false,
      regulated_edb: false,
    });
    expect(body.data.identity).toEqual({
      tenant_id: 7,
      user_id: 70,
      funcionario_id: 77,
    });
    expect(body.data.voo).toMatchObject({ id: 42, prefixo: 'PR-TST', versao: 6 });
    expect(body.data.rdv).toMatchObject({ id: 90, versao: 3, workflow_status: 'rascunho' });
    expect(body.data.tripulantes).toHaveLength(1);
    expect(body.data.etapas).toHaveLength(1);
    expect(body.data.etapas[0]).toMatchObject({
      tempo_navegacao: '00:50',
      tempo_ifr: '00:10',
      tempo_noturno: '00:05',
    });
    expect(body.data.abastecimentos[0]).toMatchObject({ id: 20, tem_anexo: true });
    expect(body.data.abastecimentos[0].anexo_r2_key).toBeUndefined();
  });

  it('emite lease somente para ator vinculado ao voo e em estado editavel', async () => {
    const response = await createApp().request(
      'http://localhost/api/controle-voos/voos/42/offline-lease',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: 'device-1234567890',
          app_version: '1.0.0',
        }),
      },
      createEnv(),
    );

    expect(response.status).toBe(200);
    expect(hasRdvCapability).toHaveBeenCalledWith(
      expect.anything(),
      'voos.rdv.editar_rascunho_proprio',
    );
    expect(isCrewOnFlight).toHaveBeenCalledWith(expect.anything(), 7, 42, 77);
    expect(buildPilotOfflineLeaseClaims).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 7,
        userId: 70,
        funcionarioId: 77,
        flightId: 42,
        deviceId: 'device-1234567890',
      }),
    );
    expect(signPilotOfflineLease).toHaveBeenCalled();

    const body = (await response.json()) as any;
    expect(body.data.lease).toMatchObject({
      envelope_version: 1,
      alg: 'ES256',
      key_id: 'pilot-test-key',
    });
    expect(body.data.lease_meta).toMatchObject({
      tenant_id: 7,
      user_id: 70,
      funcionario_id: 77,
      flight_id: 42,
    });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('nega lease quando o ator nao integra a tripulacao, mesmo tendo capability', async () => {
    isCrewOnFlight.mockResolvedValueOnce(false);
    const response = await createApp().request(
      'http://localhost/api/controle-voos/voos/42/offline-lease',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: 'device-1234567890',
          app_version: '1.0.0',
        }),
      },
      createEnv(),
    );

    expect(response.status).toBe(403);
    expect(signPilotOfflineLease).not.toHaveBeenCalled();
  });

  it('propaga a negativa de ownership/tenant antes das consultas complementares', async () => {
    assertRdvSelfScope.mockRejectedValueOnce(new Error('NOT_CREW'));
    const env = createEnv();
    const response = await createApp().request(
      'http://localhost/api/controle-voos/voos/42/offline-package',
      { headers: { Authorization: 'Bearer test' } },
      env,
    );
    expect(response.status).toBe(403);
    expect((env.DB.prepare as any).mock.calls).toHaveLength(0);
  });
});

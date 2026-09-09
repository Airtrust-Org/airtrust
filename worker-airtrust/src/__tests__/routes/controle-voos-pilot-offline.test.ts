import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const assertRdvSelfScope = vi.fn(async () => undefined);
const getFlightOrThrow = vi.fn();
const getActiveRdvByFlight = vi.fn();

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
  getEmpresaIdSafe: () => 7,
  getFlightOrThrow,
  getActiveRdvByFlight,
}));

vi.mock('../../services/controle-voos/rdv-workflow', () => ({
  RDV_CAPABILITIES: { visualizarProprio: 'voos.rdv.visualizar_proprio' },
  requireAnyRdvAccess: () => async (_c: any, next: () => Promise<void>) => next(),
  assertRdvSelfScope,
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
              tempo_navegacao: null,
              tempo_ifr: null,
              tempo_noturno: null,
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
    expect(body.data.voo).toMatchObject({ id: 42, prefixo: 'PR-TST', versao: 6 });
    expect(body.data.rdv).toMatchObject({ id: 90, versao: 3, workflow_status: 'rascunho' });
    expect(body.data.tripulantes).toHaveLength(1);
    expect(body.data.etapas).toHaveLength(1);
    expect(body.data.abastecimentos[0]).toMatchObject({ id: 20, tem_anexo: true });
    expect(body.data.abastecimentos[0].anexo_r2_key).toBeUndefined();
  });

  it('propaga a negativa de ownership/tenant antes das consultas complementares', async () => {
    assertRdvSelfScope.mockRejectedValueOnce(new Error('NOT_CREW'));
    const env = createEnv();
    await expect(
      createApp().request(
        'http://localhost/api/controle-voos/voos/42/offline-package',
        { headers: { Authorization: 'Bearer test' } },
        env,
      ),
    ).rejects.toThrow('NOT_CREW');
    expect((env.DB.prepare as any).mock.calls).toHaveLength(0);
  });
});

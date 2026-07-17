import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const getCoverageMock = vi.fn();

vi.mock('../../lib/frms/db-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/frms/db-service')>();
  return {
    ...actual,
    carregarLimites: vi.fn().mockResolvedValue({}),
    reprocessarTripulanteCompleto: vi.fn().mockResolvedValue(3),
  };
});

vi.mock('../../lib/frms/fortnight-coverage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/frms/fortnight-coverage')>();
  return {
    ...actual,
    getFrmsFortnightCoverage: (...args: unknown[]) => getCoverageMock(...args),
  };
});

import * as frmsDbService from '../../lib/frms/db-service';
import frmsRoutes from '../../routes/frms';

function createDb() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ success: true }),
    })),
  } as unknown as D1Database;
}

function createLocalMaintenanceEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: createDb(),
    ENVIRONMENT: 'development',
    ENABLE_LOCAL_MAINTENANCE: 'true',
    LOCAL_MAINTENANCE_RUNTIME: 'true',
    MAINTENANCE_SECRET: 'segredo-correto',
    ...overrides,
  } as unknown as Env;
}

describe('GET /maintenance/fortnight-coverage', () => {
  beforeEach(() => {
    getCoverageMock.mockReset();
    vi.mocked(frmsDbService.reprocessarTripulanteCompleto).mockClear();
  });

  it('falha fechado com 404 quando MAINTENANCE_SECRET nao esta configurado', async () => {
    const response = await frmsRoutes.request(
      'http://localhost/maintenance/fortnight-coverage?data_inicio=2026-06-01&data_fim=2026-06-07',
      { method: 'GET' },
      { DB: createDb() } as unknown as Env,
    );

    expect(response.status).toBe(404);
    expect(getCoverageMock).not.toHaveBeenCalled();
  });

  it('responde 404 sem secret valido', async () => {
    const response = await frmsRoutes.request(
      'http://localhost/maintenance/fortnight-coverage?data_inicio=2026-06-01&data_fim=2026-06-07',
      { method: 'GET' },
      createLocalMaintenanceEnv(),
    );

    expect(response.status).toBe(404);
    expect(getCoverageMock).not.toHaveBeenCalled();
  });

  it('aceita o header legado x-airtrust-maintenance', async () => {
    getCoverageMock.mockResolvedValueOnce({
      periodo: {
        data_inicio: '2026-06-01',
        data_fim: '2026-06-07',
      },
      resumo: {
        total_fatorizacoes: 1,
        com_dia_periodo: 1,
        sem_dia_periodo: 0,
        pct_cobertura: 100,
        com_total_dias: 1,
        sem_total_dias: 0,
      },
      por_origem: [],
      por_status_jornada: [],
      por_fonte_periodo: [],
      recuperaveis_estimados: {
        com_escala_alocacoes: 0,
        com_frms_escala_quinzenal: 0,
        sem_escala_detectada: 0,
      },
      notas: ['Endpoint read-only; nao executa reprocessamento.'],
    });

    const response = await frmsRoutes.request(
      'http://localhost/maintenance/fortnight-coverage?empresa_id=6&data_inicio=2026-06-01&data_fim=2026-06-07',
      {
        method: 'GET',
        headers: {
          'x-airtrust-maintenance': 'segredo-correto',
        },
      },
      createLocalMaintenanceEnv(),
    );

    expect(response.status).toBe(200);
    expect(getCoverageMock).toHaveBeenCalledWith(expect.anything(), {
      empresaId: 6,
      dataInicio: '2026-06-01',
      dataFim: '2026-06-07',
      origem: undefined,
      status: undefined,
    });
  });

  it('rejeita janelas acima do limite maximo', async () => {
    const response = await frmsRoutes.request(
      'http://localhost/maintenance/fortnight-coverage?empresa_id=6&data_inicio=2026-06-01&data_fim=2026-07-15',
      {
        method: 'GET',
        headers: {
          'x-maintenance-secret': 'segredo-correto',
        },
      },
      createLocalMaintenanceEnv(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Janela máxima de 31 dias para coverage.',
    });
    expect(getCoverageMock).not.toHaveBeenCalled();
  });

  it('retorna payload agregado sem PII e sem chamar reprocessamento', async () => {
    getCoverageMock.mockResolvedValueOnce({
      periodo: {
        data_inicio: '2026-06-01',
        data_fim: '2026-06-07',
      },
      resumo: {
        total_fatorizacoes: 10,
        com_dia_periodo: 7,
        sem_dia_periodo: 3,
        pct_cobertura: 70,
        com_total_dias: 7,
        sem_total_dias: 3,
      },
      por_origem: [
        {
          origem: 'SIGVOOS',
          total: 8,
          com_dia_periodo: 7,
          sem_dia_periodo: 1,
          pct_cobertura: 87.5,
        },
      ],
      por_status_jornada: [],
      por_fonte_periodo: [
        {
          fonte_periodo: 'DERIVADO',
          total: 7,
          com_dia_periodo: 7,
          sem_dia_periodo: 0,
          pct_cobertura: 100,
        },
      ],
      recuperaveis_estimados: {
        com_escala_alocacoes: 1,
        com_frms_escala_quinzenal: 2,
        sem_escala_detectada: 0,
      },
      notas: [
        'Indicador operacional descritivo; nao e compliance regulatorio.',
        'Endpoint read-only; nao executa reprocessamento.',
      ],
    });

    const response = await frmsRoutes.request(
      'http://localhost/maintenance/fortnight-coverage?empresa_id=6&data_inicio=2026-06-01&data_fim=2026-06-07&origem=SIGVOOS&status=ES,FE',
      {
        method: 'GET',
        headers: {
          'x-maintenance-secret': 'segredo-correto',
        },
      },
      createLocalMaintenanceEnv(),
    );

    expect(response.status).toBe(200);
    expect(getCoverageMock).toHaveBeenCalledWith(expect.anything(), {
      empresaId: 6,
      dataInicio: '2026-06-01',
      dataFim: '2026-06-07',
      origem: ['SIGVOOS'],
      status: ['ES', 'FE'],
    });
    expect(frmsDbService.reprocessarTripulanteCompleto).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      resumo: {
        total_fatorizacoes: 10,
        com_dia_periodo: 7,
      },
      notas: expect.arrayContaining([
        'Indicador operacional descritivo; nao e compliance regulatorio.',
      ]),
    });

    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/nome|email|cpf|matricula/i);
  });
});

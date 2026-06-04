import { describe, expect, it, vi } from 'vitest';
import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';
import type { Env } from '../../types';

const subtleCrypto = globalThis.crypto.subtle as SubtleCrypto & {
  timingSafeEqual?: (a: ArrayBuffer, b: ArrayBuffer) => boolean;
};

if (!subtleCrypto.timingSafeEqual) {
  Object.defineProperty(subtleCrypto, 'timingSafeEqual', {
    value: (a: ArrayBuffer, b: ArrayBuffer) =>
      nodeTimingSafeEqual(Buffer.from(a), Buffer.from(b)),
    configurable: true,
  });
}

vi.mock('../../lib/frms/db-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/frms/db-service')>();
  return {
    ...actual,
    carregarLimites: vi.fn().mockResolvedValue({}),
    reprocessarTripulanteCompleto: vi.fn().mockResolvedValue(3),
  };
});

vi.mock('../../services/sigvoos-frms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/sigvoos-frms')>();
  return {
    ...actual,
    syncSigvoosForFrms: vi.fn().mockResolvedValue({
      totalImportados: 2,
      totalErros: 0,
      windows: [],
    }),
  };
});

import * as frmsDbService from '../../lib/frms/db-service';
import * as sigvoosService from '../../services/sigvoos-frms';
import frmsRoutes from '../../routes/frms';
import { sigvoosRouter } from '../../routes/integracoes_sigvoos';

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

describe('maintenance guards', () => {
  it('FRMS falha fechado com 503 quando MAINTENANCE_SECRET não está configurado', async () => {
    const response = await frmsRoutes.request(
      'http://localhost/maintenance/reprocessar-lote',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripulante_ids: [11] }),
      },
      { DB: createDb() } as unknown as Env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Maintenance endpoint not configured.',
    });
    expect(frmsDbService.reprocessarTripulanteCompleto).not.toHaveBeenCalled();
  });

  it('FRMS exige token válido mesmo em localhost', async () => {
    const response = await frmsRoutes.request(
      'http://localhost/maintenance/reprocessar-lote',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripulante_ids: [11] }),
      },
      {
        DB: createDb(),
        MAINTENANCE_SECRET: 'segredo-correto',
      } as unknown as Env,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Token de manutenção inválido.',
    });
    expect(frmsDbService.reprocessarTripulanteCompleto).not.toHaveBeenCalled();
  });

  it('FRMS permite reprocessamento controlado somente com secret válido', async () => {
    const response = await frmsRoutes.request(
      'http://localhost/maintenance/reprocessar-lote',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-maintenance-secret': 'segredo-correto',
        },
        body: JSON.stringify({ tripulante_ids: [11, 12] }),
      },
      {
        DB: createDb(),
        MAINTENANCE_SECRET: 'segredo-correto',
      } as unknown as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        tripulantes: [
          { tripulante_id: 11, jornadas: 3 },
          { tripulante_id: 12, jornadas: 3 },
        ],
      },
    });
    expect(frmsDbService.reprocessarTripulanteCompleto).toHaveBeenCalledTimes(2);
  });

  it('SIGVOOS maintenance falha fechado sem secret válido e só libera fluxo controlado com token correto', async () => {
    const forbiddenResponse = await sigvoosRouter.request(
      'http://localhost/maintenance/sincronizar-frms',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: '2026-06-01', to: '2026-06-02' }),
      },
      {
        DB: createDb(),
        MAINTENANCE_SECRET: 'segredo-correto',
      } as unknown as Env,
    );

    expect(forbiddenResponse.status).toBe(403);
    await expect(forbiddenResponse.json()).resolves.toMatchObject({
      success: false,
      error: 'Token de manutencao invalido.',
    });
    expect(sigvoosService.syncSigvoosForFrms).not.toHaveBeenCalled();

    const allowedResponse = await sigvoosRouter.request(
      'http://localhost/maintenance/sincronizar-frms',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-airtrust-maintenance': 'segredo-correto',
        },
        body: JSON.stringify({ from: '2026-06-01', to: '2026-06-02' }),
      },
      {
        DB: createDb(),
        MAINTENANCE_SECRET: 'segredo-correto',
      } as unknown as Env,
    );

    expect(allowedResponse.status).toBe(200);
    await expect(allowedResponse.json()).resolves.toMatchObject({
      success: true,
      data: {
        totalImportados: 2,
        totalErros: 0,
      },
    });
    expect(sigvoosService.syncSigvoosForFrms).toHaveBeenCalledWith(
      expect.anything(),
      1,
      '0',
      expect.objectContaining({ from: '2026-06-01', to: '2026-06-02' }),
      expect.objectContaining({ MAINTENANCE_SECRET: 'segredo-correto' }),
    );
  });
});

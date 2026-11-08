import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../middleware/error-handler';

const viewer = vi.hoisted(() => ({ empresaId: 1, role: 'manager', userId: 9 }));
vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('empresaId', viewer.empresaId);
    c.set('userId', viewer.userId);
    c.set('userRole', viewer.role);
    c.set('tenantContext', { empresaId: viewer.empresaId, role: viewer.role, userId: viewer.userId });
    await next();
  },
}));
vi.mock('../../middleware/employee-sector-access', async () => {
  const actual = await vi.importActual<typeof import('../../middleware/employee-sector-access')>(
    '../../middleware/employee-sector-access',
  );
  return {
    ...actual,
    getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [], funcionarioId: null })),
  };
});
vi.mock('../../middleware/legacy-tenant-boundaries', () => ({
  enforceLegacyTenantBoundaries: async () => undefined,
}));
vi.mock('../../services/training-alert-reservation', () => ({
  reserveTrainingAlert: vi.fn(),
  commitTrainingAlertReservation: vi.fn(async () => undefined),
}));
vi.mock('../../utils/alert-whatsapp-templates-store', async () => {
  const actual = await vi.importActual<typeof import('../../utils/alert-whatsapp-templates-store')>(
    '../../utils/alert-whatsapp-templates-store',
  );
  return { ...actual, getLocalWhatsAppTemplateRecord: vi.fn(async () => null) };
});
vi.mock('../../utils/whatsapp-send', () => ({
  sendWhatsAppMessage: vi.fn(async () => ({
    provider: 'synthetic', providerStatus: 'accepted',
    providerMessageId: null, destination: '+5521999999999',
    source: '', messageMode: 'free-form',
  })),
}));

import alertasRoutes from '../../routes/alertas';
import { reserveTrainingAlert, commitTrainingAlertReservation } from '../../services/training-alert-reservation';
import { sendWhatsAppMessage } from '../../utils/whatsapp-send';

const reserve = vi.mocked(reserveTrainingAlert);
const commit = vi.mocked(commitTrainingAlertReservation);
const delivery = vi.mocked(sendWhatsAppMessage);

function createApp() {
  const app = new Hono<any>();
  app.onError(errorHandler);
  app.route('/api', alertasRoutes);
  const db = {
    prepare: vi.fn(() => ({
      bind: (...args: unknown[]) => ({
        first: async () => args[1] === 1 ? ({
          id: 17,
          funcionario_id: 44,
          qualificacao_id: 7,
          data_vencimento: '2026-01-01',
          tipo_codigo: 'CMA',
          categoria: 'CMA',
          tipo_nome: 'CMA',
          funcionario_nome: 'Pessoa Sintetica',
          funcionario_email: 'synthetic@example.invalid',
          funcionario_telefone: '21999999999',
        }) : null,
      }),
    })),
  };
  return { app, db };
}

function request(app: Hono<any>, db: unknown, reenviar_hoje = false) {
  return app.request('/api/alertas/ead-vencido/17', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      enviarEmail: false,
      enviarWhatsApp: true,
      reenviar_hoje,
    }),
  }, { DB: db, ENVIRONMENT: 'production' } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  viewer.empresaId = 1;
  viewer.role = 'manager';
});

describe('manual qualification alerts share durable daily dedup with Compliance/LMS', () => {
  it('returns 409 with explicit resend option, never calling provider when already sent today', async () => {
    const { app, db } = createApp();
    reserve.mockResolvedValueOnce({
      reserved: false, key: 'TRAINING_ALERT:2026-11-08:44:q:7:WHATSAPP',
      reason: 'already_sent', existingStatus: 'enviada',
    });
    const response = await request(app, db);
    expect(response.status).toBe(409);
    const result = (await response.json()) as any;
    expect(result.code).toBe('ALERTA_ALREADY_SENT_TODAY');
    expect(result.reenvio_permitido).toBe(true);
    expect(result.canais_ja_alertados_hoje).toEqual(['WHATSAPP']);
    expect(reserve).toHaveBeenCalledWith(db, expect.objectContaining({
      empresaId: 1,
      target: { funcionario_id: 44, qualificacao_tipo_id: 7 },
      channel: 'WHATSAPP',
      reenviarHoje: false,
      manual: true,
      qualificacaoNome: 'CMA',
    }));
    expect(delivery).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('resends only with affirmative reenviar_hoje and finalizes accepted delivery', async () => {
    const { app, db } = createApp();
    reserve.mockResolvedValueOnce({
      reserved: true, reservationId: 24,
      key: 'TRAINING_ALERT:2026-11-08:44:q:7:WHATSAPP',
      isResend: true,
    });
    const response = await request(app, db, true);
    expect(response.status).toBe(200);
    expect(delivery).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledWith(db, expect.objectContaining({
      channel: 'WHATSAPP', reenviarHoje: true,
    }));
    expect(commit).toHaveBeenCalledWith(db, expect.objectContaining({
      empresaId: 1,
      notificationKey: 'TRAINING_ALERT:2026-11-08:44:q:7:WHATSAPP',
      outcome: 'enviada',
    }));
    expect(((await response.json()) as any).data.canais_ja_alertados_hoje).toEqual([]);
  });

  it('releases a confirmed pre-dispatch phone failure and permits a corrected same-day attempt', async () => {
    const { app, db } = createApp();
    const key = 'TRAINING_ALERT:2026-11-08:44:q:7:WHATSAPP';
    reserve.mockResolvedValueOnce({ reserved: true, reservationId: 24, key, isResend: false });
    delivery.mockRejectedValueOnce(new Error('WHATSAPP_INVALID_PHONE'));
    const failed = await request(app, db);
    expect(failed.status).toBe(400);
    expect(commit).toHaveBeenCalledWith(db, expect.objectContaining({
      notificationKey: key, outcome: 'erro', errorMessage: 'WHATSAPP_INVALID_PHONE',
    }));
    expect(delivery).toHaveBeenCalledTimes(1);

    reserve.mockResolvedValueOnce({ reserved: true, reservationId: 25, key, isResend: false });
    delivery.mockResolvedValueOnce({
      provider: 'generic', providerStatus: 'accepted', providerMessageId: 'synthetic-msg',
      destination: '+5521999999999', source: '', messageMode: 'free-form',
    });
    const corrected = await request(app, db);
    expect(corrected.status).toBe(200);
    expect(delivery).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledWith(db, expect.objectContaining({
      notificationKey: key, outcome: 'enviada', providerMessageId: 'synthetic-msg',
    }));
  });

  it('never overrides a pending or indeterminate send, even with resend confirmation', async () => {
    const { app, db } = createApp();
    reserve.mockResolvedValueOnce({
      reserved: false, key: 'TRAINING_ALERT:2026-11-08:44:q:7:WHATSAPP',
      reason: 'pending_indeterminate', existingStatus: 'pendente',
    });
    const response = await request(app, db, true);
    expect(response.status).toBe(409);
    expect(((await response.json()) as any).code).toBe('ALERTA_PENDING_RECONCILIATION');
    expect(delivery).not.toHaveBeenCalled();
  });

  it('fails closed on reservation uncertainty without contacting an external provider', async () => {
    const { app, db } = createApp();
    reserve.mockRejectedValueOnce(new Error('synthetic D1 timeout after possible commit'));
    const response = await request(app, db);
    expect(response.status).toBe(500);
    expect(((await response.json()) as any).code).toBe('ALERTA_RESERVATION_UNCERTAIN');
    expect(delivery).not.toHaveBeenCalled();
  });

  it('preserves tenant scope before trying to reserve or send', async () => {
    const { app, db } = createApp();
    viewer.empresaId = 2;
    const response = await request(app, db);
    expect(response.status).toBe(404);
    expect(reserve).not.toHaveBeenCalled();
    expect(delivery).not.toHaveBeenCalled();
  });
});

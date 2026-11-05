import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const { sendNotification, readHistory, pendingState } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  readHistory: vi.fn(),
  pendingState: { active: false },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../middleware/tenant', () => ({ getEmpresaId: () => 1 }));
vi.mock('../../middleware/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [] })),
  employeeSectorSql: () => ({ clause: '1 = 1', bindings: [] }),
  filterRequestedSetorIdsByAccess: vi.fn((ids: number[]) => ids),
}));
vi.mock('../../services/training-alert-same-day', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/training-alert-same-day')>();
  return { ...original, readSameDayTrainingAlerts: readHistory };
});
vi.mock('../../services/training-compliance-notifications', () => ({
  sendComplianceNotification: sendNotification,
}));
vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn(async () => undefined),
  extrairUsuarioAuditoria: vi.fn(() => ({})),
}));

import { createTrainingComplianceIntelligenceRoutes } from '../../routes/compliance-treinamentos-intelligence';

const people = [101, 102].map((id) => ({
  id,
  nome: `Funcionário ${id}`,
  cpf: String(id),
  email: `funcionario${id}@example.com`,
  telefone: `+5521999999${id}`,
  setor_id: 5,
  setor_nome: 'Operações',
  requisitos: [{
    qualificacao_tipo_id: 55, qualificacao_tipo_nome: 'CRM',
    qualificacao_tipo_codigo: 'CRM',
    obrigatoriedade: 'OBRIGATORIA',
    evidencia_pendente_validacao: false,
    status_compliance: 'VENCIDO',
    data_validade: '2026-11-01',
    dias_para_vencer: -4,
  }],
}));

const app = createTrainingComplianceIntelligenceRoutes({
  buildSnapshot: async () => ({ people }) as never,
  tableExists: async () => true,
});
const targets = people.map((person) => ({
  funcionario_id: person.id,
  qualificacao_tipo_id: 55,
}));

async function post(path: string, data: Record<string, unknown>) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    }),
    { DB: {} } as Env,
    {} as ExecutionContext,
  );
}

describe('Compliance manual same-day notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingState.active = false;
    readHistory.mockResolvedValue({
      wasSent: (target: { funcionario_id: number }, channel: string) =>
        target.funcionario_id === 101 && channel === 'EMAIL',
      isPending: (target: { funcionario_id: number }, channel: string) =>
        pendingState.active && target.funcionario_id === 101 && channel === 'EMAIL',
    });
    sendNotification.mockImplementation(async (
      _env: unknown, _db: unknown,
      target: { funcionario_id: number; qualificacao_tipo_id: number },
      channels: { email: boolean; whatsapp: boolean },
    ) => ({
      funcionario_id: target.funcionario_id,
      qualificacao_tipo_id: target.qualificacao_tipo_id,
      email: { attempted: channels.email, ok: channels.email },
      whatsapp: { attempted: channels.whatsapp, ok: channels.whatsapp },
    }));
  });

  it('previews earlier accepted alerts without sending again', async () => {
    const response = await post('/avisos/preview', { targets });
    expect(response.status).toBe(200);
    const payload = await response.json() as { data: Record<string, number> };
    expect(payload.data.email_ja_alertado).toBe(1);
    expect(payload.data.whatsapp_ja_alertado).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('skips only the previously accepted e-mail in a combined batch', async () => {
    const response = await post('/avisos/enviar', {
      targets, canais: { email: true, whatsapp: true },
    });
    expect(response.status).toBe(200);
    const payload = await response.json() as { data: Record<string, number> };
    expect(payload.data.email_ja_alertado).toBe(1);
    expect(payload.data.email_sucesso).toBe(1);
    expect(payload.data.whatsapp_sucesso).toBe(2);
    const calls = sendNotification.mock.calls;
    const first = calls.find((args) => args[2].funcionario_id === 101);
    expect(first?.[3]).toEqual({ email: false, whatsapp: true });
  });

  it('resends an earlier accepted notice only on explicit override', async () => {
    const response = await post('/avisos/enviar', {
      targets, canais: { email: true, whatsapp: false }, reenviar_hoje: true,
    });
    expect(response.status).toBe(200);
    const payload = await response.json() as { data: Record<string, number> };
    expect(payload.data.email_ja_alertado).toBe(0);
    expect(payload.data.email_sucesso).toBe(2);
  });

  it('não força reenvio quando o aviso anterior tem resultado de auditoria pendente', async () => {
    pendingState.active = true;
    const preview = await post('/avisos/preview', { targets });
    expect(preview.status).toBe(200);
    const snapshot = await preview.json() as { data: Record<string, number> };
    expect(snapshot.data.email_pendente_historico).toBe(1);
    const response = await post('/avisos/enviar', {
      targets, canais: { email: true, whatsapp: false }, reenviar_hoje: true,
    });
    expect(response.status).toBe(200);
    const payload = await response.json() as { data: Record<string, number> };
    expect(payload.data.email_ja_alertado).toBe(1);
    expect(payload.data.email_pendente_historico).toBe(1);
    expect(payload.data.email_sucesso).toBe(1);
    expect(sendNotification.mock.calls.map((args) => args[2].funcionario_id)).toEqual([102]);
  });

  it('fails closed without sending if the history is unavailable', async () => {
    readHistory.mockRejectedValueOnce(new Error('UNAVAILABLE'));
    const response = await post('/avisos/enviar', {
      targets, canais: { email: true, whatsapp: true },
    });
    expect(response.status).toBe(500);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

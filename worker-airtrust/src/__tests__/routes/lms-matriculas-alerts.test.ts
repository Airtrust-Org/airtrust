import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const {
  sendEmailMock,
  sendWhatsAppMessageMock,
  logAuditMock,
  getLocalWhatsAppTemplateRecordMock,
} = vi.hoisted(() => ({
  sendEmailMock: vi.fn(async () => true),
  sendWhatsAppMessageMock: vi.fn(async () => ({ sid: 'SM123' })),
  logAuditMock: vi.fn(async () => undefined),
  getLocalWhatsAppTemplateRecordMock: vi.fn(async () => ({
    template_key: 'ead_enrollment_reminder',
    template_name: 'airtrust_lembrete_treinamento_matriculado',
    body_text:
      'Olá {{1}}! Treinamento: {{2}}. Prazo: {{3}}. Status: {{4}}. Acesse: {{5}}',
    approval_status: 'approved',
    twilio_content_sid: 'HX123',
  })),
}));

vi.mock('../../middleware/rbac', () => ({
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: () => 1,
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [] })),
  employeeSectorSql: () => ({ clause: '1 = 1', bindings: [] }),
}));

vi.mock('../../utils/db', () => ({
  logAudit: logAuditMock,
}));

vi.mock('../../lib/email', () => ({
  sendEmail: sendEmailMock,
}));

vi.mock('../../utils/whatsapp-send', () => ({
  sendWhatsAppMessage: sendWhatsAppMessageMock,
}));

vi.mock('../../utils/alert-whatsapp-templates-store', () => ({
  getLocalWhatsAppTemplateRecord: getLocalWhatsAppTemplateRecordMock,
  isWhatsAppTemplateApproved: (status: string) => status === 'approved',
}));

vi.mock('../../utils/lms-training-link', () => ({
  resolveTrainingAccessUrl: vi.fn(async (_env, _db, params) =>
    `https://airtrust.online/lms/player/${params.cursoId}`,
  ),
}));

import routes from '../../routes/lms-matriculas-convites';
import { errorHandler } from '../../middleware/error-handler';

const enrollmentRows = [
  {
    id: 11,
    funcionario_id: 101,
    curso_id: 32,
    data_expiracao: '2026-10-20',
    status: 'NAO_INICIADO',
    curso_titulo: 'Integração Corporativa',
  },
  {
    id: 12,
    funcionario_id: 102,
    curso_id: 32,
    data_expiracao: null,
    status: 'EM_ANDAMENTO',
    curso_titulo: 'Integração Corporativa',
  },
];

function createDb() {
  return {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => ({
        all: async () => {
          if (query.includes('SELECT m.id,m.funcionario_id,m.curso_id')) {
            return { results: enrollmentRows };
          }
          return { results: [] };
        },
        first: async () => {
          const funcionarioId = Number(args[0]);
          if (query.includes('SELECT nome, email FROM funcionarios')) {
            return {
              nome: funcionarioId === 101 ? 'Ana Piloto' : 'Bruno Piloto',
              email: funcionarioId === 101 ? 'ana@example.com' : 'bruno@example.com',
            };
          }
          if (query.includes('SELECT nome, telefone FROM funcionarios')) {
            return {
              nome: funcionarioId === 101 ? 'Ana Piloto' : 'Bruno Piloto',
              telefone: funcionarioId === 101 ? '+5521999999991' : '+5521999999992',
            };
          }
          return null;
        },
        run: async () => ({ meta: { changes: 1 } }),
      }),
    })),
  } as unknown as D1Database;
}

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/convites', routes);
  app.onError(errorHandler);
  return app;
}

async function post(body: object) {
  const db = createDb();
  const response = await makeApp().fetch(
    new Request('http://localhost/convites/lote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    {
      DB: db,
      FRONTEND_URL: 'https://airtrust.online',
    } as Env,
    {} as ExecutionContext,
  );
  return { response, db };
}

describe('LMS matrícula alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMock.mockResolvedValue(true);
    sendWhatsAppMessageMock.mockResolvedValue({ sid: 'SM123' });
  });

  it('preserva o convite legado como envio somente por e-mail', async () => {
    const { response } = await post({ matricula_ids: [11, 12] });
    expect(response.status).toBe(200);
    const json = (await response.json()) as { data: Record<string, number> };

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    expect(json.data.enviados).toBe(2);
    expect(json.data.email_enviados).toBe(2);
    expect(json.data.whatsapp_enviados).toBe(0);
  });

  it('envia alerta de matrícula por e-mail e WhatsApp no mesmo lote', async () => {
    const { response } = await post({
      matricula_ids: [11, 12, 12],
      modo: 'alerta',
      canais: { email: true, whatsapp: true },
    });
    expect(response.status).toBe(200);
    const json = (await response.json()) as { data: Record<string, number> };

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendWhatsAppMessageMock).toHaveBeenCalledTimes(2);
    expect(json.data.selecionados).toBe(2);
    expect(json.data.processados).toBe(2);
    expect(json.data.email_enviados).toBe(2);
    expect(json.data.whatsapp_enviados).toBe(2);
    expect(logAuditMock).toHaveBeenCalledTimes(2);
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'LMS_MATRICULA_ALERTA' }),
    );
  });

  it('recusa alerta sem canal selecionado', async () => {
    const { response } = await post({
      matricula_ids: [11],
      modo: 'alerta',
      canais: { email: false, whatsapp: false },
    });
    expect(response.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
  });
});

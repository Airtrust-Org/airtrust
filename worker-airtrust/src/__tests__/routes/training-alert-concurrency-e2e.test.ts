import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import type { Env } from '../../types';

const { sendEmailMock, sendEmailDetailedMock, sendWhatsAppMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(async () => true),
  sendEmailDetailedMock: vi.fn(async () => ({ ok: true, providerResponse: 'OK' })),
  sendWhatsAppMock: vi.fn(async () => ({ sid: 'SM_CONCURRENCY_TEST' })),
}));

vi.mock('../../middleware/rbac', () => ({
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 1,
}));

vi.mock('../../utils/tenant-resolution', () => ({
  getEmpresaIdSafe: () => 1,
}));

vi.mock('../../middleware/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [] })),
  employeeSectorSql: () => ({ clause: '1 = 1', bindings: [] }),
  filterRequestedSetorIdsByAccess: vi.fn((ids: number[]) => ids),
}));

vi.mock('../../lib/email', () => ({
  sendEmail: sendEmailMock,
  sendEmailDetailed: sendEmailDetailedMock,
}));

vi.mock('../../utils/whatsapp-send', () => ({
  sendWhatsAppMessage: sendWhatsAppMock,
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn(async () => undefined),
  extrairUsuarioAuditoria: vi.fn(() => ({})),
}));

vi.mock('../../utils/alert-whatsapp-templates-store', () => ({
  getLocalWhatsAppTemplateRecord: vi.fn(async () => null),
  isWhatsAppTemplateApproved: () => false,
}));

vi.mock('../../utils/lms-training-link', () => ({
  resolveTrainingAccessUrl: vi.fn(async () => 'https://airtrust.online/lms/player/32'),
}));

import lmsRoutes from '../../routes/lms-matriculas-convites';
import { createTrainingComplianceIntelligenceRoutes } from '../../routes/compliance-treinamentos-intelligence';

let db: SqliteD1Database;

beforeEach(() => {
  vi.clearAllMocks();
  db = new SqliteD1Database();
  db.database.exec(`
    CREATE TABLE IF NOT EXISTS notificacoes_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      config_id INTEGER,
      qualificacao_historico_id INTEGER,
      funcionario_id INTEGER,
      funcionario_cpf TEXT,
      notification_key TEXT,
      tipo TEXT,
      destinatario TEXT,
      assunto TEXT,
      corpo TEXT,
      status TEXT,
      tentativas_envio INTEGER NOT NULL DEFAULT 0,
      erro_mensagem TEXT,
      provedor_mensagem_id TEXT,
      provedor_resultado TEXT,
      enviado_em TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notificacoes_log_empresa_notification_key
      ON notificacoes_log(empresa_id, notification_key)
      WHERE notification_key IS NOT NULL AND empresa_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS lms_cursos (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      titulo TEXT,
      qualificacao_tipo_id INTEGER,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS lms_matriculas (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      funcionario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      status TEXT,
      data_expiracao TEXT,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      empresa_id INTEGER NOT NULL,
      action TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      old_values TEXT,
      new_values TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS empresas_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      chave TEXT,
      valor TEXT,
      cores_tema TEXT
    );

    ALTER TABLE funcionarios ADD COLUMN email TEXT;
    ALTER TABLE funcionarios ADD COLUMN telefone TEXT;
    ALTER TABLE funcionarios ADD COLUMN status TEXT;
    ALTER TABLE funcionarios ADD COLUMN ativo INTEGER DEFAULT 1;
    ALTER TABLE funcionarios ADD COLUMN funcao_id INTEGER;
    ALTER TABLE empresas ADD COLUMN cores_tema TEXT;

    INSERT INTO funcionarios (id, empresa_id, nome, email, telefone, status, ativo)
      VALUES (101, 1, 'Piloto Concorrente', 'piloto@example.com', '+5521999991111', 'ATIVO', 1);

    INSERT INTO lms_cursos (id, empresa_id, titulo, qualificacao_tipo_id)
      VALUES (32, 1, 'Segurança de Voo', 55);

    INSERT INTO lms_matriculas (id, empresa_id, funcionario_id, curso_id, status, data_expiracao)
      VALUES (11, 1, 101, 32, 'NAO_INICIADO', '2026-12-31');
  `);
});

function makeLmsApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/convites', lmsRoutes);
  return app;
}

describe('LMS Alert Concurrency — simulated simultaneous HTTP dispatches', () => {
  it('dispatches exactly once when two identical alert requests execute simultaneously', async () => {
    const app = makeLmsApp();
    const env = { DB: db, FRONTEND_URL: 'https://airtrust.online' } as unknown as Env;

    const requestBody = JSON.stringify({
      matricula_ids: [11],
      modo: 'alerta',
      canais: { email: true, whatsapp: false },
    });

    const runRequest = () =>
      app.fetch(
        new Request('http://localhost/convites/lote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: requestBody,
        }),
        env,
        {} as ExecutionContext,
      );

    // Two requests fired concurrently at the exact same instant
    const [res1, res2] = await Promise.all([runRequest(), runRequest()]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const json1 = (await res1.json()) as { data: Record<string, number> };
    const json2 = (await res2.json()) as { data: Record<string, number> };

    // Exactly one sent, the other was deduplicated by atomic reservation
    const totalEnviados = json1.data.email_enviados + json2.data.email_enviados;
    const totalDeduplicated =
      (json1.data.email_ja_alertado || 0) +
      (json1.data.email_pendente_historico || 0) +
      (json2.data.email_ja_alertado || 0) +
      (json2.data.email_pendente_historico || 0);

    expect(totalEnviados).toBe(1);
    expect(totalDeduplicated).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});

describe('Cross-Origin Alert Concurrency — LMS vs Compliance simultaneous dispatch', () => {
  it('prevents duplicate send when LMS and Compliance alert the same employee for the same qualification at the same millisecond', async () => {
    const lmsApp = makeLmsApp();
    const people = [
      {
        id: 101,
        nome: 'Piloto Concorrente',
        cpf: '12345678900',
        email: 'piloto@example.com',
        telefone: '+5521999991111',
        setor_id: 1,
        setor_nome: 'Operações',
        requisitos: [
          {
            qualificacao_tipo_id: 55,
            qualificacao_tipo_nome: 'Segurança de Voo',
            qualificacao_tipo_codigo: 'SV',
            obrigatoriedade: 'OBRIGATORIA',
            evidencia_pendente_validacao: false,
            status_compliance: 'VENCIDO',
            data_validade: '2026-11-01',
            dias_para_vencer: -5,
          },
        ],
      },
    ];

    const complianceApp = createTrainingComplianceIntelligenceRoutes({
      buildSnapshot: async () => ({ people }) as never,
      tableExists: async () => true,
    });

    const env = { DB: db, FRONTEND_URL: 'https://airtrust.online' } as unknown as Env;

    const lmsPromise = lmsApp.fetch(
      new Request('http://localhost/convites/lote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_ids: [11],
          modo: 'alerta',
          canais: { email: true, whatsapp: false },
        }),
      }),
      env,
      {} as ExecutionContext,
    );

    const compliancePromise = complianceApp.fetch(
      new Request('http://localhost/avisos/enviar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targets: [{ funcionario_id: 101, qualificacao_tipo_id: 55 }],
          canais: { email: true, whatsapp: false },
        }),
      }),
      env,
      {} as ExecutionContext,
    );

    const [lmsRes, compRes] = await Promise.all([lmsPromise, compliancePromise]);

    expect(lmsRes.status).toBe(200);
    expect(compRes.status).toBe(200);

    const lmsJson = (await lmsRes.json()) as { data: Record<string, number> };
    const compJson = (await compRes.json()) as { data: Record<string, number> };

    const totalEmailSent = (lmsJson.data.email_enviados || 0) + (compJson.data.email_sucesso || 0);
    const totalDuplicates =
      (lmsJson.data.email_ja_alertado || 0) +
      (lmsJson.data.email_pendente_historico || 0) +
      (compJson.data.email_ja_alertado || 0) +
      (compJson.data.email_pendente_historico || 0);

    // Exactly 1 email sent across both systems, 1 deduplicated!
    expect(totalEmailSent).toBe(1);
    expect(totalDuplicates).toBe(1);
  });
});

function injectReservationWriteFailure(persistThenTimeout: boolean) {
  const realPrepare = db.prepare.bind(db);
  return vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
    const statement = realPrepare(sql);
    if (!sql.includes('INSERT INTO notificacoes_log')) return statement;
    return {
      bind: (...args: unknown[]) => ({
        run: async () => {
          if (persistThenTimeout) await statement.bind(...args).run();
          throw new Error(persistThenTimeout ? 'D1 timeout after commit' : 'D1 unavailable');
        },
      }),
    } as unknown as ReturnType<typeof db.prepare>;
  });
}

function failClosedComplianceApp() {
  return createTrainingComplianceIntelligenceRoutes({
    buildSnapshot: async () => ({
      people: [{
        id: 101, nome: 'Piloto Concorrente', cpf: '12345678900',
        email: 'piloto@example.com', telefone: '+5521999991111',
        setor_id: 1, setor_nome: 'Operações',
        requisitos: [{
          qualificacao_tipo_id: 55, qualificacao_tipo_nome: 'Segurança de Voo',
          qualificacao_tipo_codigo: 'SV', obrigatoriedade: 'OBRIGATORIA',
          evidencia_pendente_validacao: false, status_compliance: 'VENCIDO',
          data_validade: '2026-11-01', dias_para_vencer: -5,
        }],
      }],
    }) as never,
    tableExists: async () => true,
  });
}

describe('D1 reservation failures must never reach external providers', () => {
  for (const persistThenTimeout of [false, true]) {
    it(`LMS blocks both channels when reservation ${persistThenTimeout ? 'commits then times out' : 'fails before commit'}`, async () => {
      const app = makeLmsApp();
      const spy = injectReservationWriteFailure(persistThenTimeout);
      try {
        const response = await app.fetch(new Request('http://localhost/convites/lote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            matricula_ids: [11], modo: 'alerta',
            canais: { email: true, whatsapp: true },
          }),
        }), { DB: db, FRONTEND_URL: 'https://airtrust.online' } as unknown as Env,
        {} as ExecutionContext);
        const result = await response.json() as { success: boolean; data: Record<string, number> };
        expect(result.success).toBe(false);
        expect(result.data.email_enviados).toBe(0);
        expect(result.data.whatsapp_enviados).toBe(0);
        expect(result.data.auditoria_preparo_falhas).toBeGreaterThanOrEqual(2);
        expect(sendEmailMock).not.toHaveBeenCalled();
        expect(sendWhatsAppMock).not.toHaveBeenCalled();
        if (persistThenTimeout) {
          const row = db.database.prepare(
            'SELECT status FROM notificacoes_log WHERE notification_key LIKE ? LIMIT 1',
          ).get('TRAINING_ALERT:%') as { status: string };
          expect(row.status).toBe('pendente');
        }
      } finally {
        spy.mockRestore();
      }
    });

    it(`Compliance blocks both channels when reservation ${persistThenTimeout ? 'commits then times out' : 'fails before commit'}`, async () => {
      const app = failClosedComplianceApp();
      const spy = injectReservationWriteFailure(persistThenTimeout);
      try {
        const response = await app.fetch(new Request('http://localhost/avisos/enviar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targets: [{ funcionario_id: 101, qualificacao_tipo_id: 55 }],
            canais: { email: true, whatsapp: true },
          }),
        }), { DB: db, FRONTEND_URL: 'https://airtrust.online' } as unknown as Env,
        {} as ExecutionContext);
        const result = await response.json() as { success: boolean; data: Record<string, number> };
        expect(result.success).toBe(false);
        expect(result.data.email_sucesso).toBe(0);
        expect(result.data.whatsapp_sucesso).toBe(0);
        expect(result.data.reservas_falharam).toBeGreaterThanOrEqual(2);
        expect(sendEmailDetailedMock).not.toHaveBeenCalled();
        expect(sendWhatsAppMock).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  }
});

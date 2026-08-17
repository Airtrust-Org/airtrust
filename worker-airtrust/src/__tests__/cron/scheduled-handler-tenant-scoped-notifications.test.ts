import { describe, expect, it, vi } from 'vitest';

// Mute all sibling cron side-effects so this test focuses purely on the two
// audit notifications inside runScheduledJobs (soft-delete audit + weekly
// qualifications-expiring summary), which previously aggregated PII
// (employee names) across ALL tenants into a single empresa_id = NULL
// notification.
vi.mock('../../cron/notificacoes', () => ({
  processarNotificacoes: vi.fn().mockResolvedValue(undefined),
  enviarEmailAlert: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../cron/alertasDiarios', () => ({
  alertasDiariosHandler: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../cron/frms-daily-check', () => ({
  frmsDailyCheck: vi.fn().mockResolvedValue({ tripulantesProcessados: 0, alertasGerados: 0 }),
}));
vi.mock('../../cron/frms-fadiga-reminder', () => ({
  frmsFadigaReminder: vi.fn().mockResolvedValue({ notificacoes: 0 }),
}));
vi.mock('../../cron/sgso-notificacoes', () => ({
  processarNotificacoesSgso: vi
    .fn()
    .mockResolvedValue({ processadas: 0, enviadas: 0, falhas: 0 }),
  enqueueSlaAlerts: vi
    .fn()
    .mockResolvedValue({ alertasTriagem: 0, alertasInvestigacao: 0, alertasBarreiras: 0 }),
}));
vi.mock('../../shared/handlers', () => ({
  processarEventosParaModulo: vi.fn().mockResolvedValue({ processados: 0, erros: 0 }),
}));
vi.mock('../../services/sigvoos-frms', () => ({
  getSigvoosConfig: vi.fn().mockResolvedValue(null),
  syncSigvoosForFrms: vi.fn().mockResolvedValue(undefined),
  upsertSigvoosConfig: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/lms-matricula-cycle', () => ({
  ensureMatriculaCycle: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../lib/frms/db-service-config', () => ({
  carregarLimites: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../lib/frms/db-service', () => ({
  reprocessarTripulanteCompleto: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../lib/frms/controle-voos-source', () => ({
  fetchControleVoosOperationalRecords: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../lib/frms/controle-voos-shadow-comparator', () => ({
  compareControleVoosWithLegacyJornada: vi.fn().mockReturnValue({ matches: true }),
}));
vi.mock('../../lib/frms/controle-voos-shadow-flag', () => ({
  isControleVoosShadowModeEnabledForEmpresa: vi.fn().mockResolvedValue(false),
}));
vi.mock('../../lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

import { runScheduledJobs } from '../../cron/scheduled-handler';

type InsertCall = { sql: string; args: unknown[] };

/**
 * Minimal fake D1 that routes SELECT queries by a keyword match and records
 * every INSERT INTO notificacoes_sistema call so the test can assert on
 * tenant scoping.
 */
function createFakeDb(opts: {
  softDeleteRows: Array<{
    funcionario_id: number;
    nome: string;
    empresa_id: number;
    total_historico: number;
    ativos: number;
  }>;
  qualifRows: Array<{
    empresa_id: number;
    funcionario_nome: string;
    codigo: string;
    qualificacao_nome: string;
    categoria: string;
    validade_fim: string;
    dias_restantes: number;
  }>;
  inserts: InsertCall[];
}) {
  const { softDeleteRows, qualifRows, inserts } = opts;

  return {
    prepare(sql: string) {
      const statement = {
        _sql: sql,
        _args: [] as unknown[],
        bind(...args: unknown[]) {
          statement._args = args;
          return statement;
        },
        async all() {
          if (sql.includes('SUM(CASE WHEN qh.deleted_at IS NULL THEN 1 ELSE 0 END) as ativos')) {
            return { results: softDeleteRows };
          }
          if (sql.includes('ALERTA_SEMANAL_QUALIFICACOES') || sql.includes('dias_restantes')) {
            if (sql.includes('SELECT') && sql.includes('funcionario_nome')) {
              return { results: qualifRows };
            }
          }
          // Everything else (LMS reminders, EAD renewal candidates, domain
          // events tenant list, etc.) — return empty so those code paths are
          // effectively no-ops for this test.
          return { results: [] };
        },
        async first() {
          // FRMS integrity audit counters and misc COUNT(*) queries.
          if (sql.includes('COUNT(*) AS total')) {
            return { total: 0 };
          }
          return null;
        },
        async run() {
          if (sql.includes('INSERT INTO notificacoes_sistema')) {
            inserts.push({ sql, args: statement._args });
          }
          return { success: true };
        },
      };
      return statement;
    },
  };
}

function makeEnv(inserts: InsertCall[], overrides: Partial<Parameters<typeof createFakeDb>[0]>) {
  const db = createFakeDb({
    softDeleteRows: [],
    qualifRows: [],
    inserts,
    ...overrides,
  });
  return {
    DB: db,
    ENVIRONMENT: 'test',
    FRONTEND_URL: 'https://airtrust.online',
  } as unknown as import('../../types').Env;
}

const noopCtx = {
  waitUntil: (p: Promise<unknown>) => {
    // Execute eagerly but swallow errors so unrelated waitUntil branches
    // (e.g. sigvoos sync) never fail the test.
    void p.catch(() => undefined);
  },
} as unknown as ExecutionContext;

describe('runScheduledJobs — tenant-scoped audit notifications', () => {
  it('emits one soft-delete audit notification per tenant, each with only that tenant employees, empresa_id always set', async () => {
    const inserts: InsertCall[] = [];
    const env = makeEnv(inserts, {
      softDeleteRows: [
        {
          funcionario_id: 1,
          nome: 'Alice Tenant A',
          empresa_id: 111,
          total_historico: 2,
          ativos: 0,
        },
        {
          funcionario_id: 2,
          nome: 'Bruno Tenant B',
          empresa_id: 222,
          total_historico: 3,
          ativos: 0,
        },
      ],
    });

    await runScheduledJobs({ cron: '0 8 * * *' } as ScheduledEvent, env, noopCtx);

    const auditInserts = inserts.filter((i) =>
      i.sql.includes('Auditoria: Qualificações removidas em massa'),
    );

    expect(auditInserts).toHaveLength(2);

    for (const insert of auditInserts) {
      const empresaIdArg = insert.args[insert.args.length - 1];
      expect(empresaIdArg).not.toBeNull();
      expect([111, 222]).toContain(empresaIdArg);
    }

    const tenantAInsert = auditInserts.find((i) => i.args[i.args.length - 1] === 111);
    const tenantBInsert = auditInserts.find((i) => i.args[i.args.length - 1] === 222);

    expect(String(tenantAInsert?.args[0])).toContain('Alice Tenant A');
    expect(String(tenantAInsert?.args[0])).not.toContain('Bruno Tenant B');

    expect(String(tenantBInsert?.args[0])).toContain('Bruno Tenant B');
    expect(String(tenantBInsert?.args[0])).not.toContain('Alice Tenant A');
  });

  it('emits one weekly qualifications-expiring notification per tenant, never mixing employee names across tenants', async () => {
    const inserts: InsertCall[] = [];
    // Force diaSemanaHoje === 1 (Monday) branch by mocking Date.
    const monday = new Date('2026-08-17T12:00:00Z'); // 2026-08-17 is a Monday
    vi.setSystemTime(monday);

    const env = makeEnv(inserts, {
      qualifRows: [
        {
          empresa_id: 111,
          funcionario_nome: 'Alice Tenant A',
          codigo: 'QC1',
          qualificacao_nome: 'Qualif A',
          categoria: 'CAT',
          validade_fim: '2026-09-01',
          dias_restantes: 15,
        },
        {
          empresa_id: 222,
          funcionario_nome: 'Bruno Tenant B',
          codigo: 'QC2',
          qualificacao_nome: 'Qualif B',
          categoria: 'CAT',
          validade_fim: '2026-09-15',
          dias_restantes: 29,
        },
      ],
    });

    await runScheduledJobs({ cron: '0 8 * * *' } as ScheduledEvent, env, noopCtx);

    vi.useRealTimers();

    const weeklyInserts = inserts.filter((i) => i.sql.includes('ALERTA_SEMANAL_QUALIFICACOES'));

    expect(weeklyInserts).toHaveLength(2);

    for (const insert of weeklyInserts) {
      const empresaIdArg = insert.args[insert.args.length - 1];
      expect(empresaIdArg).not.toBeNull();
      expect([111, 222]).toContain(empresaIdArg);
    }

    const tenantAInsert = weeklyInserts.find((i) => i.args[i.args.length - 1] === 111);
    const tenantBInsert = weeklyInserts.find((i) => i.args[i.args.length - 1] === 222);

    expect(String(tenantAInsert?.args[0])).toContain('Alice Tenant A');
    expect(String(tenantAInsert?.args[0])).not.toContain('Bruno Tenant B');

    expect(String(tenantBInsert?.args[0])).toContain('Bruno Tenant B');
    expect(String(tenantBInsert?.args[0])).not.toContain('Alice Tenant A');
  });

  it('never writes empresa_id IS NULL for the PII-bearing audit notifications', async () => {
    const inserts: InsertCall[] = [];
    const env = makeEnv(inserts, {
      softDeleteRows: [
        {
          funcionario_id: 9,
          nome: 'Carla Tenant C',
          empresa_id: 333,
          total_historico: 1,
          ativos: 0,
        },
      ],
    });

    await runScheduledJobs({ cron: '0 8 * * *' } as ScheduledEvent, env, noopCtx);

    const piiInserts = inserts.filter(
      (i) =>
        i.sql.includes('Auditoria: Qualificações removidas em massa') ||
        i.sql.includes('ALERTA_SEMANAL_QUALIFICACOES'),
    );

    expect(piiInserts.length).toBeGreaterThan(0);
    for (const insert of piiInserts) {
      expect(insert.args[insert.args.length - 1]).not.toBeNull();
    }
  });
});

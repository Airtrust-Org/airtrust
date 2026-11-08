import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import {
  buildTrainingAlertReservationKey,
  reserveTrainingAlert,
  commitTrainingAlertReservation,
  isUniqueConstraintError,
} from '../../services/training-alert-reservation';

let db: SqliteD1Database;

beforeEach(() => {
  db = new SqliteD1Database();
  db.database.exec(`
    CREATE TABLE IF NOT EXISTS notificacoes_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      funcionario_id INTEGER,
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
  `);
});

describe('Training alert reservation — key generation and uniqueness', () => {
  it('generates consistent canonical keys for qualification and course targets', () => {
    const keyQualif = buildTrainingAlertReservationKey({
      target: { funcionario_id: 101, qualificacao_tipo_id: 55, curso_id: 32 },
      channel: 'EMAIL',
      diaOperacional: '2026-11-06',
    });
    expect(keyQualif).toBe('TRAINING_ALERT:2026-11-06:101:q:55:EMAIL');

    const keyCourse = buildTrainingAlertReservationKey({
      target: { funcionario_id: 101, qualificacao_tipo_id: null, curso_id: 32 },
      channel: 'WHATSAPP',
      diaOperacional: '2026-11-06',
    });
    expect(keyCourse).toBe('TRAINING_ALERT:2026-11-06:101:c:32:WHATSAPP');
  });

  it('correctly detects unique constraint errors', () => {
    expect(isUniqueConstraintError(new Error('UNIQUE constraint failed: notificacoes_log.empresa_id, notificacoes_log.notification_key'))).toBe(true);
    expect(isUniqueConstraintError(new Error('sqlite error: UNIQUE constraint violation'))).toBe(true);
    expect(isUniqueConstraintError(new Error('D1_ERROR: connection reset'))).toBe(false);
  });
});

describe('Training alert reservation — concurrency and atomic claim', () => {
  it('reserves a fresh alert slot atomically on the first attempt', async () => {
    const outcome = await reserveTrainingAlert(db as never, {
      empresaId: 1,
      target: { funcionario_id: 101, qualificacao_tipo_id: 55 },
      channel: 'EMAIL',
      destinatarioMascarado: 'a***@example.com',
      diaOperacional: '2026-11-06',
      origem: 'COMPLIANCE',
    });

    expect(outcome.reserved).toBe(true);
    if (outcome.reserved) {
      expect(outcome.isResend).toBe(false);
      expect(outcome.key).toBe('TRAINING_ALERT:2026-11-06:101:q:55:EMAIL');
    }

    const row = db.database
      .prepare('SELECT status, destinatario, tentativas_envio FROM notificacoes_log WHERE notification_key = ?')
      .get('TRAINING_ALERT:2026-11-06:101:q:55:EMAIL') as { status: string; destinatario: string; tentativas_envio: number };
    expect(row.status).toBe('pendente');
    expect(row.destinatario).toBe('a***@example.com');
    expect(row.tentativas_envio).toBe(1);
  });

  it('simulates real concurrent requests: only ONE acquires the reservation, the other is safely rejected', async () => {
    const params = {
      empresaId: 1,
      target: { funcionario_id: 200, qualificacao_tipo_id: 77 },
      channel: 'WHATSAPP' as const,
      destinatarioMascarado: '***9999',
      diaOperacional: '2026-11-06',
      origem: 'COMPLIANCE' as const,
    };

    // Run both reservations simultaneously
    const [resultA, resultB] = await Promise.all([
      reserveTrainingAlert(db as never, params),
      reserveTrainingAlert(db as never, params),
    ]);

    const successes = [resultA, resultB].filter((r) => r.reserved);
    const conflicts = [resultA, resultB].filter((r) => !r.reserved);

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reason).toBe('pending_indeterminate');

    // Only 1 row created in DB
    const count = db.database
      .prepare('SELECT COUNT(*) as total FROM notificacoes_log WHERE notification_key = ?')
      .get(resultA.key) as { total: number };
    expect(count.total).toBe(1);
  });

  it('blocks resend if the alert was already delivered today and reenviarHoje is false', async () => {
    const params = {
      empresaId: 1,
      target: { funcionario_id: 301, curso_id: 10 },
      channel: 'EMAIL' as const,
      destinatarioMascarado: 'p***@example.com',
      diaOperacional: '2026-11-06',
      origem: 'LMS_ALERTA' as const,
    };

    const first = await reserveTrainingAlert(db as never, params);
    expect(first.reserved).toBe(true);

    // Commit delivery
    await commitTrainingAlertReservation(db as never, {
      empresaId: 1,
      notificationKey: first.key,
      outcome: 'enviada',
    });

    // Second sequential request without reenviarHoje
    const second = await reserveTrainingAlert(db as never, {
      ...params,
      reenviarHoje: false,
    });

    expect(second.reserved).toBe(false);
    if (!second.reserved) {
      expect(second.reason).toBe('already_sent');
    }
  });

  it('retains explicit manual provenance when overriding an earlier LMS bulk reservation', async () => {
    const previous = await reserveTrainingAlert(db as never, {
      empresaId: 1,
      target: { funcionario_id: 401, qualificacao_tipo_id: 88, curso_id: 30 },
      channel: 'EMAIL',
      destinatarioMascarado: 'p***@example.com',
      diaOperacional: '2026-11-06',
      origem: 'LMS_ALERTA',
    });
    expect(previous.reserved).toBe(true);
    await commitTrainingAlertReservation(db as never, {
      empresaId: 1, notificationKey: previous.key, outcome: 'enviada',
    });

    const manual = await reserveTrainingAlert(db as never, {
      empresaId: 1,
      target: { funcionario_id: 401, qualificacao_tipo_id: 88 },
      channel: 'EMAIL',
      destinatarioMascarado: 'p***@example.com',
      diaOperacional: '2026-11-06',
      origem: 'COMPLIANCE',
      manual: true,
      qualificacaoNome: 'CMA sintetico',
      reenviarHoje: true,
    });
    expect(manual).toMatchObject({ reserved: true, isResend: true });
    const row = db.database.prepare(
      'SELECT corpo, tipo, assunto, status, tentativas_envio FROM notificacoes_log WHERE notification_key = ?',
    ).get(previous.key) as {
      corpo: string; tipo: string; assunto: string; status: string; tentativas_envio: number;
    };
    expect(row.status).toBe('pendente');
    expect(row.tentativas_envio).toBe(2);
    expect(row.tipo).toBe('EMAIL_COMPLIANCE');
    expect(row.assunto).toContain('[COMPLIANCE_TREINAMENTO:RESERVA:');
    expect(JSON.parse(row.corpo)).toMatchObject({
      manual: true, qualificacao_nome: 'CMA sintetico',
      funcionario_id: 401, qualificacao_tipo_id: 88,
    });
  });

  it('simulates concurrent voluntary resends (reenviarHoje=true): only ONE resend wins', async () => {
    const params = {
      empresaId: 1,
      target: { funcionario_id: 400, qualificacao_tipo_id: 88 },
      channel: 'EMAIL' as const,
      destinatarioMascarado: 'c***@example.com',
      diaOperacional: '2026-11-06',
      origem: 'COMPLIANCE' as const,
    };

    // Initial alert delivered at 10:00
    const initial = await reserveTrainingAlert(db as never, params);
    expect(initial.reserved).toBe(true);
    await commitTrainingAlertReservation(db as never, {
      empresaId: 1,
      notificationKey: initial.key,
      outcome: 'enviada',
    });

    // Two concurrent requests both requesting voluntary resend at 14:00
    const [resendA, resendB] = await Promise.all([
      reserveTrainingAlert(db as never, { ...params, reenviarHoje: true }),
      reserveTrainingAlert(db as never, { ...params, reenviarHoje: true }),
    ]);

    const resendWins = [resendA, resendB].filter((r) => r.reserved);
    const resendBlocked = [resendA, resendB].filter((r) => !r.reserved);

    expect(resendWins).toHaveLength(1);
    expect(resendWins[0].isResend).toBe(true);
    expect(resendBlocked).toHaveLength(1);
    expect(resendBlocked[0].reason).toBe('concurrent_conflict');
  });


  it('prevents ABA resend race when a stale second CAS runs after the first dispatch is finalized', async () => {
    const params = {
      empresaId: 1,
      target: { funcionario_id: 402, qualificacao_tipo_id: 88 },
      channel: 'EMAIL' as const,
      diaOperacional: '2026-11-06',
      origem: 'COMPLIANCE' as const,
      reenviarHoje: true,
    };
    const initial = await reserveTrainingAlert(db as never, params);
    expect(initial.reserved).toBe(true);
    await commitTrainingAlertReservation(db as never, {
      empresaId: 1, notificationKey: initial.key, outcome: 'enviada',
    });

    const original = db.prepare.bind(db);
    let resumeBothReads!: () => void;
    const bothReads = new Promise<void>((resolve) => { resumeBothReads = resolve; });
    let releaseStaleCas!: () => void;
    const staleCasGate = new Promise<void>((resolve) => { releaseStaleCas = resolve; });
    let readCount = 0;
    let casCount = 0;

    const spy = vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      const statement = original(sql);
      if (sql.includes('SELECT id, status, tentativas_envio')) {
        return {
          bind: (...args: unknown[]) => ({
            first: async () => {
              const row = await statement.bind(...args).first();
              readCount++;
              if (readCount === 2) resumeBothReads();
              await bothReads;
              return row; // Both callers observed 'enviada' at attempt 1.
            },
          }),
        } as unknown as ReturnType<typeof db.prepare>;
      }
      if (sql.includes("AND status = 'enviada'")) {
        return {
          bind: (...args: unknown[]) => ({
            run: async () => {
              casCount++;
              if (casCount === 2) await staleCasGate;
              return statement.bind(...args).run();
            },
          }),
        } as unknown as ReturnType<typeof db.prepare>;
      }
      return statement;
    });
    try {
      const promises = [
        reserveTrainingAlert(db as never, params),
        reserveTrainingAlert(db as never, params),
      ];
      const winner = await Promise.race(promises);
      expect(winner.reserved).toBe(true);
      if (!winner.reserved) throw new Error('Expected first CAS owner');
      await commitTrainingAlertReservation(db as never, {
        empresaId: 1, notificationKey: winner.key, outcome: 'enviada',
      });
      releaseStaleCas();
      const settled = await Promise.all(promises);
      expect(settled.filter((outcome) => outcome.reserved)).toHaveLength(1);
      expect(settled.filter((outcome) => !outcome.reserved)).toHaveLength(1);
      expect(casCount).toBe(2);
      const row = db.database.prepare(
        'SELECT status, tentativas_envio FROM notificacoes_log WHERE notification_key = ?',
      ).get(initial.key) as { status: string; tentativas_envio: number };
      expect(row).toMatchObject({ status: 'enviada', tentativas_envio: 2 });
    } finally {
      releaseStaleCas();
      spy.mockRestore();
    }
  });

  it('blocks voluntary resend if the previous attempt is still pending/indeterminate', async () => {
    const params = {
      empresaId: 1,
      target: { funcionario_id: 500, curso_id: 20 },
      channel: 'WHATSAPP' as const,
      diaOperacional: '2026-11-06',
      origem: 'LMS_ALERTA' as const,
    };

    // Initial attempt reserved (status = 'pendente'), provider called, but commit never occurred
    const initial = await reserveTrainingAlert(db as never, params);
    expect(initial.reserved).toBe(true);

    // Operator tries to force resend with reenviarHoje: true
    const attempt = await reserveTrainingAlert(db as never, {
      ...params,
      reenviarHoje: true,
    });

    expect(attempt.reserved).toBe(false);
    if (!attempt.reserved) {
      expect(attempt.reason).toBe('pending_indeterminate');
    }
  });

  it('allows retrying a previously failed attempt with atomic CAS lock', async () => {
    const params = {
      empresaId: 1,
      target: { funcionario_id: 600, qualificacao_tipo_id: 99 },
      channel: 'EMAIL' as const,
      diaOperacional: '2026-11-06',
      origem: 'COMPLIANCE' as const,
    };

    const initial = await reserveTrainingAlert(db as never, params);
    expect(initial.reserved).toBe(true);
    await commitTrainingAlertReservation(db as never, {
      empresaId: 1,
      notificationKey: initial.key,
      outcome: 'erro',
      errorMessage: 'SMTP timeout',
    });

    // Retry should be permitted and acquire the lock
    const retry = await reserveTrainingAlert(db as never, params);
    expect(retry.reserved).toBe(true);

    const row = db.database
      .prepare('SELECT status, tentativas_envio FROM notificacoes_log WHERE notification_key = ?')
      .get(initial.key) as { status: string; tentativas_envio: number };
    expect(row.status).toBe('pendente');
    expect(row.tentativas_envio).toBe(2);
  });


  it('reclaims a no-contact reservation after contact is corrected, with one atomic winner', async () => {
    const params = {
      empresaId: 1,
      target: { funcionario_id: 701, qualificacao_tipo_id: 12 },
      channel: 'EMAIL' as const,
      diaOperacional: '2026-11-06',
      origem: 'COMPLIANCE' as const,
    };
    const initial = await reserveTrainingAlert(db as never, params);
    expect(initial.reserved).toBe(true);
    await commitTrainingAlertReservation(db as never, {
      empresaId: 1, notificationKey: initial.key, outcome: 'sem_contato',
    });

    const [a, b] = await Promise.all([
      reserveTrainingAlert(db as never, { ...params, destinatarioMascarado: 'a***@example.com' }),
      reserveTrainingAlert(db as never, { ...params, destinatarioMascarado: 'a***@example.com' }),
    ]);
    expect([a, b].filter((r) => r.reserved)).toHaveLength(1);
    expect([a, b].filter((r) => !r.reserved)).toHaveLength(1);
    const row = db.database.prepare(
      'SELECT status, tentativas_envio FROM notificacoes_log WHERE notification_key = ?',
    ).get(initial.key) as { status: string; tentativas_envio: number };
    expect(row).toMatchObject({ status: 'pendente', tentativas_envio: 2 });
  });

  it('maintains strict multi-tenant isolation: identical targets under different empresa_id never collide', async () => {
    const target = { funcionario_id: 700, qualificacao_tipo_id: 12 };
    const day = '2026-11-06';

    const tenantA = await reserveTrainingAlert(db as never, {
      empresaId: 1,
      target,
      channel: 'EMAIL',
      diaOperacional: day,
      origem: 'COMPLIANCE',
    });

    const tenantB = await reserveTrainingAlert(db as never, {
      empresaId: 2,
      target,
      channel: 'EMAIL',
      diaOperacional: day,
      origem: 'COMPLIANCE',
    });

    expect(tenantA.reserved).toBe(true);
    expect(tenantB.reserved).toBe(true);
  });
});

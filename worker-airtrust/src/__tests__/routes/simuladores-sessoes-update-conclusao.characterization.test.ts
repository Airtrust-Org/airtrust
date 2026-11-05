import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv, Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { createSessoesUpdateSchema } from '../helpers/simuladores-sessoes-update-fixture';

// Caracterização da CAUDA do PUT /sessoes/:id (SQLite real): transição para CONCLUIDA
// (qualificações + e-mail de avaliação pendente ao instrutor), eventos de domínio por participante
// e notificação por e-mail da atualização.

const criarMock = vi.hoisted(() => vi.fn());
const syncEscalaMock = vi.hoisted(() => vi.fn());
const syncQualMock = vi.hoisted(() => vi.fn());
const publishMock = vi.hoisted(() => vi.fn());
const fichaEmailMock = vi.hoisted(() => vi.fn());
const sendNotifMock = vi.hoisted(() => vi.fn());

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 'user-1');
    c.set('userRole', 'admin');
    c.set('empresaId', 1);
    await next();
  },
}));
vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));
vi.mock('../../middleware/operational-domain-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/operational-domain-access')>()),
  requireOperationalAccess: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));
vi.mock('../../shared/syncEscalaEventosExternos', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/syncEscalaEventosExternos')>()),
  replaceManagedEscalaEvents: vi.fn(async () => undefined),
  removeManagedEscalaEvents: vi.fn(async () => undefined),
}));
vi.mock('../../services/simuladores/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/simuladores/shared')>()),
  criarQualificacoesPlanejadas: criarMock,
  syncSessaoEscalaEventos: syncEscalaMock,
  sincronizarQualificacoesDaSessaoConcluida: syncQualMock,
}));
vi.mock('../../shared/domainEvents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/domainEvents')>()),
  publishDomainEvent: publishMock,
}));
vi.mock('../../lib/fichaEmails', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/fichaEmails')>()),
  enviarEmailFichaSessao: fichaEmailMock,
}));
vi.mock('../../services/simuladores-session-notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/simuladores-session-notifications')>()),
  sendSimulatorSessionEmailNotifications: sendNotifMock,
}));

import sessoesUpdateApp from '../../routes/simuladores-sessoes-update';

let sqlite: SqliteD1Database;
let app: Hono<AppEnv>;
let waitUntilPromises: Promise<unknown>[];

async function put(id: number, body: Record<string, unknown>) {
  const res = await app.request(
    `/sessoes/${id}`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    { DB: sqlite.asD1() } as unknown as Env,
    {
      waitUntil: (p: Promise<unknown>) => void waitUntilPromises.push(p),
      passThroughOnException: () => undefined,
    } as never,
  );
  await Promise.all(waitUntilPromises);
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

const statusDe = (id: number) =>
  (sqlite.database.prepare('SELECT status FROM simulador_agendamentos WHERE id = ?').get(id) as { status: string }).status;

beforeEach(() => {
  for (const m of [criarMock, syncEscalaMock, syncQualMock, publishMock, fichaEmailMock, sendNotifMock]) m.mockReset();
  criarMock.mockResolvedValue({ criadas: 0, puladas: 0, conflitosUniques: 0, bloqueadasDataPassada: 0 });
  syncQualMock.mockResolvedValue({ atualizadas: 3 });
  publishMock.mockResolvedValue(undefined);
  fichaEmailMock.mockResolvedValue(undefined);
  sendNotifMock.mockResolvedValue([]);
  waitUntilPromises = [];
  sqlite = new SqliteD1Database();
  createSessoesUpdateSchema(sqlite);
  sqlite.database.exec(`
    -- o PUT preenche tipo_dispositivo=SIMULADOR quando nulo, o que já contaria como mudança
    UPDATE simulador_agendamentos SET tipo_dispositivo = 'SIMULADOR' WHERE id IN (10, 11);
    INSERT INTO sessoes_participantes (uuid, sessao_id, funcionario_id, funcao, status, deleted_at) VALUES
      ('p1', 10, 200, 'PIC', 'CONFIRMADO', NULL),
      ('p2', 10, 201, 'SIC', 'CONFIRMADO', NULL),
      ('p3', 10, 202, 'SIC', 'CONFIRMADO', '2026-01-01');
    INSERT INTO fichas_sessao (id, agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, status, empresa_id, deleted_at) VALUES
      (901, 10, 200, 100, 'PERIODICO', 'AVALIACAO_PENDENTE', 1, NULL),
      (902, 10, 201, 100, 'PERIODICO', 'AVALIACAO_PENDENTE', 1, NULL),
      (903, 10, 202, 100, 'PERIODICO', 'AVALIACAO_PENDENTE', 1, '2026-01-01'),
      (904, 10, 203, 100, 'PERIODICO', 'APROVADO', 1, NULL),
      (905, 11, 200, 100, 'PERIODICO', 'AVALIACAO_PENDENTE', 1, NULL);
  `);
  app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('tenantContext', { empresaId: 1, role: 'admin', empresaCodigo: 'T', empresaNome: 'T', plano: 'pro', permissions: [] });
    await next();
  });
  app.route('/', sessoesUpdateApp);
});

afterEach(() => sqlite.close());

describe('PUT /sessoes/:id — transição para CONCLUIDA', () => {
  it('AGENDADA → CONCLUIDA sincroniza as qualificações e devolve a contagem no diagnóstico', async () => {
    const r = await put(10, { status: 'CONCLUIDA', resetar_fluxo_fichas: false });
    expect(r.status).toBe(200);
    expect(statusDe(10)).toBe('CONCLUIDA');
    expect(syncQualMock).toHaveBeenCalledTimes(1);
    expect(syncQualMock.mock.calls[0][1]).toEqual({ sessaoId: 10, empresaId: 1 });
    expect(r.json._diag_planejadas.qualificacoesConcluidas).toBe(3);
  });

  it('só dispara na transição: CONCLUIDA → CONCLUIDA e CONCLUIDA → outro status não sincronizam', async () => {
    sqlite.database.exec(`UPDATE simulador_agendamentos SET status = 'CONCLUIDA' WHERE id = 10`);
    await put(10, { status: 'CONCLUIDA', resetar_fluxo_fichas: false });
    await put(10, { status: 'AGENDADA', resetar_fluxo_fichas: false });
    expect(syncQualMock).not.toHaveBeenCalled();
    expect(fichaEmailMock).not.toHaveBeenCalled();
  });

  it('PUT sem mudar o status de uma sessão agendada não sincroniza', async () => {
    await put(10, { observacoes: 'x', resetar_fluxo_fichas: false });
    expect(syncQualMock).not.toHaveBeenCalled();
  });

  it('falha na sincronização não desfaz a conclusão: 409 QUALIFICATION_INTEGRATION_PENDING com a mensagem no diagnóstico', async () => {
    syncQualMock.mockRejectedValueOnce(new Error('falha de qualificação'));
    const r = await put(10, { status: 'CONCLUIDA', resetar_fluxo_fichas: false });
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({
      partial: true,
      code: 'SIMULATOR_QUALIFICATION_INTEGRATION_PENDING',
      primary_saved: true,
      qualification_synced: false,
      scale_synced: true,
    });
    expect(r.json._diag_planejadas.qualificacoesConcluidasErro).toBe('falha de qualificação');
    expect(statusDe(10)).toBe('CONCLUIDA');
  });

  it('falha de qualificação + falha de escala viram o código combinado', async () => {
    syncQualMock.mockRejectedValueOnce(new Error('q'));
    syncEscalaMock.mockRejectedValueOnce(new Error('e'));
    const r = await put(10, { status: 'CONCLUIDA', resetar_fluxo_fichas: false });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe('SIMULATOR_INTEGRATION_PENDING');
  });

  it('avisa o instrutor de cada ficha AVALIACAO_PENDENTE viva da sessão, e só delas', async () => {
    await put(10, { status: 'CONCLUIDA', resetar_fluxo_fichas: false });
    const chamadas = fichaEmailMock.mock.calls.map((c) => [c[2], c[3]]);
    expect(chamadas.sort()).toEqual([
      [901, 'instrutor_avaliacao_pendente'],
      [902, 'instrutor_avaliacao_pendente'],
    ]);
  });

  it('falha ao enviar o e-mail do instrutor não afeta a resposta', async () => {
    fichaEmailMock.mockRejectedValue(new Error('smtp'));
    const r = await put(10, { status: 'CONCLUIDA', resetar_fluxo_fichas: false });
    expect(r.status).toBe(200);
  });
});

describe('PUT /sessoes/:id — eventos de domínio', () => {
  it('publica SIMULADOR_AGENDADO por participante ativo, com os dados da sessão', async () => {
    await put(10, { observacoes: 'x', resetar_fluxo_fichas: false });
    expect(publishMock).toHaveBeenCalledTimes(2);
    expect(publishMock.mock.calls.map((c) => [c[1], c[2], c[3].funcionario_id]).sort()).toEqual([
      ['simuladores', 'SIMULADOR_AGENDADO', '200'],
      ['simuladores', 'SIMULADOR_AGENDADO', '201'],
    ]);
    expect(publishMock.mock.calls[0][3]).toEqual({
      funcionario_id: '200',
      empresa_id: 1,
      origem_modulo: 'simuladores',
      sessao_id: '10',
      data_sessao: '2026-05-10',
      tipo_sessao: 'PERIODICO',
    });
  });

  it('com a sessão concluída o tipo é SIMULADOR_REALIZADO — inclusive se já estava concluída', async () => {
    await put(10, { status: 'CONCLUIDA', resetar_fluxo_fichas: false });
    expect(new Set(publishMock.mock.calls.map((c) => c[2]))).toEqual(new Set(['SIMULADOR_REALIZADO']));

    publishMock.mockClear();
    await put(10, { observacoes: 'de novo', resetar_fluxo_fichas: false });
    expect(publishMock).toHaveBeenCalledTimes(2);
    expect(publishMock.mock.calls[0][2]).toBe('SIMULADOR_REALIZADO');
  });

  it('sem participantes não publica nada; falha de um evento não derruba a resposta', async () => {
    await put(11, { observacoes: 'x', resetar_fluxo_fichas: false });
    expect(publishMock).not.toHaveBeenCalled();

    publishMock.mockRejectedValue(new Error('boom'));
    const r = await put(10, { observacoes: 'y', resetar_fluxo_fichas: false });
    expect(r.status).toBe(200);
    expect(publishMock).toHaveBeenCalledTimes(2);
  });
});

describe('PUT /sessoes/:id — e-mail de atualização da sessão', () => {
  it('mudança em campo relevante enfileira o envio com reason=updated e a empresa da sessão', async () => {
    await put(10, { observacoes: 'mudou', resetar_fluxo_fichas: false });
    expect(sendNotifMock).toHaveBeenCalledTimes(1);
    expect(sendNotifMock.mock.calls[0][2]).toBe(10);
    expect(sendNotifMock.mock.calls[0][3]).toEqual({ reason: 'updated', empresaId: 1 });
  });

  it('nada relevante mudou: não envia', async () => {
    await put(10, { resetar_fluxo_fichas: false });
    expect(sendNotifMock).not.toHaveBeenCalled();
  });

  it('troca de participantes basta para notificar, mesmo sem mudar a sessão', async () => {
    await put(10, { participantes: [{ funcionario_id: 200 }], resetar_fluxo_fichas: false });
    expect(sendNotifMock).toHaveBeenCalledTimes(1);
  });

  it('mesma lista de participantes não notifica', async () => {
    await put(10, { participantes: [{ funcionario_id: 200, funcao: 'PIC' }, { funcionario_id: 201, funcao: 'SIC' }], resetar_fluxo_fichas: false });
    expect(sendNotifMock).not.toHaveBeenCalled();
  });

  it('falha do envio é absorvida (a resposta segue 200)', async () => {
    sendNotifMock.mockRejectedValueOnce(new Error('smtp'));
    const r = await put(10, { observacoes: 'mudou', resetar_fluxo_fichas: false });
    expect(r.status).toBe(200);
  });
});

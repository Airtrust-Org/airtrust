import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv, Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { createSessoesUpdateSchema } from '../helpers/simuladores-sessoes-update-fixture';

// Caracterização do sincronismo de instrutor nas fichas e do RESET DO FLUXO DE FICHAS do
// PUT /sessoes/:id (SQLite real). Fixa o comportamento atual: `resetar_fluxo_fichas` é
// opt-out (vale true quando ausente). O reset PROTEGE fichas com assinatura (aluno ou instrutor)
// ou conclusão: elas e as respectivas manobras são preservadas; só as fichas em andamento voltam
// a pendente.

const criarMock = vi.hoisted(() => vi.fn());

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
// Integração de Escalas fora do escopo desta fase (tem testes próprios).
vi.mock('../../shared/syncEscalaEventosExternos', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/syncEscalaEventosExternos')>()),
  replaceManagedEscalaEvents: vi.fn(async () => undefined),
  removeManagedEscalaEvents: vi.fn(async () => undefined),
}));
vi.mock('../../services/simuladores/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/simuladores/shared')>()),
  criarQualificacoesPlanejadas: criarMock,
}));

import sessoesUpdateApp from '../../routes/simuladores-sessoes-update';

let sqlite: SqliteD1Database;
let app: Hono<AppEnv>;

async function put(id: number, body: Record<string, unknown>) {
  const res = await app.request(
    `/sessoes/${id}`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    { DB: sqlite.asD1() } as unknown as Env,
    { waitUntil: () => undefined, passThroughOnException: () => undefined } as never,
  );
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}


const ficha = (id: number) =>
  sqlite.database.prepare('SELECT * FROM fichas_sessao WHERE id = ?').get(id) as Record<string, any>;
const manobra = (id: number) =>
  sqlite.database.prepare('SELECT * FROM fichas_sessao_manobras WHERE id = ?').get(id) as Record<string, any>;

function seedFichas() {
  sqlite.database.exec(`
    -- 501: ficha CONCLUÍDA e assinada pelos dois lados, da sessão 10
    INSERT INTO fichas_sessao (id, agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, status,
      resultado_final, aprovado, observacoes, observacoes_gerais, assinatura_aluno_ip, assinatura_aluno_timestamp,
      assinatura_aluno_imagem, assinatura_instrutor_ip, assinatura_instrutor_timestamp, assinatura_instrutor_imagem,
      assinatura_tripulante, assinatura_instrutor, assinatura_aluno_completa, assinatura_instrutor_completa,
      data_conclusao, empresa_id)
    VALUES (501, 10, 1000, 100, 'PERIODICO', 'APROVADO', 'APROVADO', 1, 'obs', 'obs gerais', '1.1.1.1',
      '2026-05-10 10:00:00', 'img-a', '2.2.2.2', '2026-05-10 10:05:00', 'img-i', 1, 1, 1, 1, '2026-05-10', 1);
    -- 502: ficha ainda não assinada pelo instrutor
    INSERT INTO fichas_sessao (id, agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, status, empresa_id)
    VALUES (502, 10, 1001, 100, 'PERIODICO', 'AVALIACAO_PENDENTE', 1);
    -- 503/504: fichas especiais (o instrutor é o aluno); 505: apagada; 506: outra sessão
    INSERT INTO fichas_sessao (id, agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, status, empresa_id)
    VALUES (503, 10, 100, 200, 'CRED-EXA', 'AVALIACAO_PENDENTE', 1),
           (504, 10, 100, 200, 'TRE-INST', 'AVALIACAO_PENDENTE', 1),
           (506, 11, 1000, 100, 'PERIODICO', 'APROVADO', 1);
    INSERT INTO fichas_sessao (id, agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, status, empresa_id, deleted_at)
    VALUES (505, 10, 1002, 100, 'PERIODICO', 'APROVADO', 1, '2026-01-01');
    INSERT INTO fichas_sessao_manobras (id, ficha_id, resultado, observacoes) VALUES
      (601, 501, 'S', 'bom'), (602, 506, 'S', 'bom');
    UPDATE simulador_agendamentos SET instrutor_id = 100 WHERE id = 11;
  `);
}

beforeEach(() => {
  sqlite = new SqliteD1Database();
  createSessoesUpdateSchema(sqlite);
  seedFichas();
  app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('tenantContext', { empresaId: 1, role: 'admin', empresaCodigo: 'T', empresaNome: 'T', plano: 'pro', permissions: [] });
    await next();
  });
  app.route('/', sessoesUpdateApp);
});

afterEach(() => sqlite.close());

describe('PUT /sessoes/:id — reset do fluxo de fichas', () => {
  const PRESERVADA = {
    status: 'APROVADO',
    resultado_final: 'APROVADO',
    aprovado: 1,
    observacoes: 'obs',
    observacoes_gerais: 'obs gerais',
    assinatura_aluno_ip: '1.1.1.1',
    assinatura_aluno_timestamp: '2026-05-10 10:00:00',
    assinatura_aluno_imagem: 'img-a',
    assinatura_instrutor_ip: '2.2.2.2',
    assinatura_instrutor_timestamp: '2026-05-10 10:05:00',
    assinatura_instrutor_imagem: 'img-i',
    assinatura_tripulante: 1,
    assinatura_instrutor: 1,
    assinatura_aluno_completa: 1,
    assinatura_instrutor_completa: 1,
    data_conclusao: '2026-05-10',
  };

  it('SEM a flag, um PUT qualquer preserva a ficha já aprovada e assinada e suas manobras', async () => {
    const r = await put(10, { observacoes: 'só mudei uma observação' });
    expect(r.status).toBe(200);
    expect(ficha(501)).toMatchObject(PRESERVADA);
    expect(manobra(601)).toMatchObject({ resultado: 'S', observacoes: 'bom' });
  });

  it('resetar_fluxo_fichas:true (o que o modal de edição envia) também preserva a ficha assinada', async () => {
    await put(10, { observacoes: 'x', resetar_fluxo_fichas: true });
    expect(ficha(501)).toMatchObject(PRESERVADA);
    expect(manobra(601)).toMatchObject({ resultado: 'S', observacoes: 'bom' });
  });

  it('as fichas em andamento seguem resetadas (inclusive as especiais), com suas manobras', async () => {
    sqlite.database.exec(`
      UPDATE fichas_sessao SET status = 'EM_ANDAMENTO', resultado_final = 'REPROVADO', aprovado = 0,
        observacoes = 'rascunho' WHERE id IN (502, 503);
      INSERT INTO fichas_sessao_manobras (id, ficha_id, resultado, observacoes) VALUES (603, 502, 'S', 'rascunho');
    `);
    await put(10, { observacoes: 'x' });
    for (const id of [502, 503]) {
      expect(ficha(id)).toMatchObject({
        status: 'AVALIACAO_PENDENTE', resultado_final: 'PENDENTE', aprovado: null, observacoes: null,
      });
    }
    expect(manobra(603)).toMatchObject({ resultado: null, observacoes: '' });
  });

  it.each([
    ['assinatura do aluno', `assinatura_aluno_timestamp = '2026-05-10 10:00:00'`],
    ['assinatura do instrutor', `assinatura_instrutor_timestamp = '2026-05-10 10:05:00'`],
    ['aluno completo', `assinatura_aluno_completa = 1`],
    ['instrutor completo', `assinatura_instrutor_completa = 1`],
    ['data de conclusão', `data_conclusao = '2026-05-10'`],
  ])('uma única marca de %s basta para proteger a ficha', async (_nome, set) => {
    sqlite.database.exec(`
      UPDATE fichas_sessao SET status = 'EM_ANDAMENTO', ${set} WHERE id = 502;
      INSERT INTO fichas_sessao_manobras (id, ficha_id, resultado, observacoes) VALUES (603, 502, 'S', 'bom');
    `);
    await put(10, { observacoes: 'x' });
    expect(ficha(502).status).toBe('EM_ANDAMENTO');
    expect(manobra(603)).toMatchObject({ resultado: 'S', observacoes: 'bom' });
  });

  it('resetar_fluxo_fichas:false não reseta nada', async () => {
    sqlite.database.exec(`UPDATE fichas_sessao SET status = 'EM_ANDAMENTO' WHERE id = 502`);
    await put(10, { observacoes: 'x', resetar_fluxo_fichas: false });
    expect(ficha(501)).toMatchObject(PRESERVADA);
    expect(ficha(502).status).toBe('EM_ANDAMENTO');
  });

  it('o reset só alcança as fichas vivas da sessão; não toca outra sessão nem apagadas', async () => {
    sqlite.database.exec(`
      UPDATE fichas_sessao SET status = 'EM_ANDAMENTO', data_conclusao = NULL, assinatura_aluno_timestamp = NULL,
        assinatura_instrutor_timestamp = NULL, assinatura_aluno_completa = 0, assinatura_instrutor_completa = 0
        WHERE id IN (505, 506);
      INSERT INTO fichas_sessao_manobras (id, ficha_id, resultado, observacoes) VALUES (604, 505, 'S', 'x');
    `);
    await put(10, { observacoes: 'x' });
    expect(ficha(505).status).toBe('EM_ANDAMENTO'); // apagada
    expect(ficha(506).status).toBe('EM_ANDAMENTO'); // outra sessão
    expect(manobra(602)).toMatchObject({ resultado: 'S', observacoes: 'bom' });
    expect(manobra(604)).toMatchObject({ resultado: 'S', observacoes: 'x' });
  });

  it('em sessão CONCLUIDA as fichas assinadas continuam intactas', async () => {
    sqlite.database.exec(`UPDATE simulador_agendamentos SET status = 'CONCLUIDA' WHERE id = 10`);
    await put(10, { observacoes: 'x' });
    expect(ficha(501)).toMatchObject(PRESERVADA);
  });
});

describe('PUT /sessoes/:id — sincronismo do instrutor nas fichas', () => {
  const instrutorDe = (id: number) => ficha(id).instrutor_id;

  it('trocar o instrutor atualiza só as fichas sem assinatura do instrutor e fora de TRE-INST/CRED-EXA', async () => {
    await put(10, { instrutor_id: 100, resetar_fluxo_fichas: false }); // mesmo instrutor: nada muda
    expect([instrutorDe(501), instrutorDe(502), instrutorDe(503), instrutorDe(504)]).toEqual([100, 100, 200, 200]);

    sqlite.database.exec(`UPDATE funcionarios SET is_instrutor = 1 WHERE id = 202`);
    await put(10, { instrutor_id: 202, resetar_fluxo_fichas: false });
    expect(instrutorDe(501)).toBe(100); // assinada pelo instrutor: preservada
    expect(instrutorDe(502)).toBe(202); // sem assinatura: acompanha
    expect(instrutorDe(503)).toBe(200); // CRED-EXA: o examinador permanece
    expect(instrutorDe(504)).toBe(200); // TRE-INST: idem
    expect(instrutorDe(506)).toBe(100); // outra sessão
  });

  it('com o reset padrão, a troca de instrutor deixa a ficha assinada intacta', async () => {
    sqlite.database.exec(`UPDATE funcionarios SET is_instrutor = 1 WHERE id = 202`);
    await put(10, { instrutor_id: 202 });
    // 501 estava assinada: mantém instrutor antigo e continua aprovada
    expect(instrutorDe(501)).toBe(100);
    expect(ficha(501).status).toBe('APROVADO');
    expect(instrutorDe(502)).toBe(202);
  });

  it('instrutor sem flag is_instrutor é recusado antes de qualquer escrita', async () => {
    const r = await put(10, { instrutor_id: 201 });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(ficha(501).status).toBe('APROVADO');
    expect(instrutorDe(502)).toBe(100);
  });
});

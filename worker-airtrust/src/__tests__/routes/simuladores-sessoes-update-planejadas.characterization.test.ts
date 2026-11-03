import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv, Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { createSessoesUpdateSchema } from '../helpers/simuladores-sessoes-update-fixture';

// Caracterização da fase "criar qualificações PLANEJADAS se a sessão ainda não tem" do
// PUT /sessoes/:id, com SQLite real. criarQualificacoesPlanejadas (outro módulo, com
// testes próprios) é um spy: aqui vale a decisão — quando chamar, com quais argumentos,
// qual modelo escolher — e o diagnóstico `_diag_planejadas` devolvido na resposta.

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

/** Só as chaves de `_diag_planejadas` produzidas por esta fase. */
const PLAN_KEYS = [
  'hasPlanejadas',
  'tipoSessao',
  'modeloIdInicial',
  'templateIdFinal',
  'fallbackModelo',
  'modeloIdFinal',
  'numParticipantes',
  'resultado',
  'criadas',
  'puladas',
  'conflitosUniques',
  'bloqueadasDataPassada',
  'erro',
];
const diagOf = (json: any) =>
  Object.fromEntries(PLAN_KEYS.filter((k) => k in json._diag_planejadas).map((k) => [k, json._diag_planejadas[k]]));

function seedModelos() {
  sqlite.database.exec(`
    INSERT INTO tipos_sessao (id, empresa_id, codigo) VALUES (1, 1, 'PERIODICO'), (2, 1, 'INICIAL'), (3, 2, 'PERIODICO');
    INSERT INTO modelos_sessao (id, empresa_id, codigo, nome, tipo_sessao_id, modelo_aeronave, gera_qualificacao) VALUES
      (101, 1, 'SEM-GERA', 'Treino A', 1, 'AW139', 0),
      (102, 1, 'GERA-A', 'Treino A', 1, 'AW139', 1),
      (103, 1, 'GERA-B', 'Outro nome', 1, 'AW139', 1),
      (104, 1, 'OUTRA-AERONAVE', 'Treino A', 1, 'SK76', 1),
      (105, 1, 'OUTRO-TIPO', 'Treino A', 2, 'AW139', 1),
      (201, 2, 'OUTRO-TENANT', 'Treino A', 3, 'AW139', 1);
  `);
}
const addParticipantes = (...ids: number[]) =>
  sqlite.database.exec(
    ids.map((i) => `INSERT INTO sessoes_participantes (sessao_id, funcionario_id) VALUES (10, ${i});`).join('\n'),
  );

beforeEach(() => {
  criarMock.mockReset();
  criarMock.mockResolvedValue({ criadas: 2, puladas: 1, conflitosUniques: 0, bloqueadasDataPassada: 0 });
  sqlite = new SqliteD1Database();
  createSessoesUpdateSchema(sqlite);
  app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('tenantContext', {
      empresaId: 1,
      role: 'admin',
      empresaCodigo: 'T',
      empresaNome: 'T',
      plano: 'pro',
      permissions: [],
    });
    await next();
  });
  app.route('/', sessoesUpdateApp);
});

afterEach(() => sqlite.close());

describe('PUT /sessoes/:id — qualificações planejadas', () => {
  it('sessão que já tem PLANEJADA viva não cria nada', async () => {
    sqlite.database.exec(`
      INSERT INTO qualificacoes_historico (funcionario_id, status, empresa_id, sessao_id)
      VALUES (1000, 'PLANEJADA', 1, 10);
    `);
    const r = await put(10, { observacoes: 'x' });
    expect(r.status).toBe(200);
    expect(diagOf(r.json)).toEqual({ hasPlanejadas: true, resultado: 'ja_tem_planejadas' });
    expect(criarMock).not.toHaveBeenCalled();
  });

  it('PLANEJADA apagada ou de outra sessão não conta', async () => {
    sqlite.database.exec(`
      INSERT INTO qualificacoes_historico (funcionario_id, status, empresa_id, sessao_id, deleted_at)
      VALUES (1000, 'PLANEJADA', 1, 10, '2026-01-01');
      INSERT INTO qualificacoes_historico (funcionario_id, status, empresa_id, sessao_id)
      VALUES (1000, 'PLANEJADA', 1, 11), (1000, 'VALIDA', 1, 10);
    `);
    const r = await put(10, { observacoes: 'x' });
    expect(diagOf(r.json).hasPlanejadas).toBe(false);
  });

  it('sem modelo (nem o da sessão nem fallback): resultado sem_modelo', async () => {
    const r = await put(10, { observacoes: 'x' });
    expect(r.status).toBe(200);
    expect(diagOf(r.json)).toEqual({
      hasPlanejadas: false,
      tipoSessao: 'PERIODICO',
      modeloIdInicial: null,
      templateIdFinal: null,
      fallbackModelo: null,
      modeloIdFinal: null,
      resultado: 'sem_modelo',
    });
    expect(criarMock).not.toHaveBeenCalled();
  });

  it('com modelo mas sem participantes: sem_participantes', async () => {
    const r = await put(10, { template_id: 77 });
    expect(diagOf(r.json)).toEqual({
      hasPlanejadas: false,
      tipoSessao: 'PERIODICO',
      modeloIdInicial: 77,
      templateIdFinal: 77,
      modeloIdFinal: 77,
      numParticipantes: 0,
      resultado: 'sem_participantes',
    });
    expect(criarMock).not.toHaveBeenCalled();
  });

  it('com modelo e participantes cria; passa sessão, modelo, tipo, data e tenant', async () => {
    addParticipantes(1000, 1001);
    const r = await put(10, { template_id: 77, data: '2026-05-20' });
    expect(r.status).toBe(200);
    expect(criarMock).toHaveBeenCalledTimes(1);
    const [, args] = criarMock.mock.calls[0];
    expect(args).toEqual({
      sessaoId: 10,
      modeloId: 77,
      tipoSessao: 'PERIODICO',
      data: '2026-05-20',
      participantes: [{ funcionario_id: 1000 }, { funcionario_id: 1001 }],
      empresaId: 1,
    });
    expect(diagOf(r.json)).toMatchObject({
      numParticipantes: 2,
      resultado: 'criadas',
      criadas: 2,
      puladas: 1,
      conflitosUniques: 0,
      bloqueadasDataPassada: 0,
    });
  });

  it('sem participantes na tabela canônica, usa os alunos das fichas da sessão', async () => {
    sqlite.database.exec(`
      INSERT INTO fichas_sessao (agendamento_slot_id, colaborador_id_aluno, tipo_sessao, empresa_id)
      VALUES (10, 1002, 'PERIODICO', 1), (10, 1002, 'PERIODICO', 1);
    `);
    await put(10, { template_id: 77 });
    expect(criarMock.mock.calls[0][1].participantes).toEqual([{ funcionario_id: 1002 }]);
  });

  it('data da chamada vem da sessão quando o corpo não traz data', async () => {
    addParticipantes(1000);
    await put(10, { template_id: 77 });
    expect(criarMock.mock.calls[0][1].data).toBe('2026-05-10');
  });

  it('criação que não gera nada vira sem_novas', async () => {
    addParticipantes(1000);
    criarMock.mockResolvedValue({ criadas: 0, puladas: 1, conflitosUniques: 1, bloqueadasDataPassada: 0 });
    const r = await put(10, { template_id: 77 });
    expect(diagOf(r.json)).toMatchObject({ resultado: 'sem_novas', criadas: 0, puladas: 1, conflitosUniques: 1 });
  });

  it('falha na criação não derruba o PUT: vira 409 parcial SIMULATOR_QUALIFICATION_INTEGRATION_PENDING', async () => {
    addParticipantes(1000);
    criarMock.mockRejectedValue(new Error('boom'));
    const r = await put(10, { template_id: 77, observacoes: 'salvo' });
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({
      success: false,
      partial: true,
      code: 'SIMULATOR_QUALIFICATION_INTEGRATION_PENDING',
      primary_saved: true,
      qualification_synced: false,
      scale_synced: true,
    });
    expect(diagOf(r.json)).toMatchObject({ resultado: 'erro', erro: 'boom' });
    expect(r.json.data.observacoes).toBe('salvo'); // o estado principal foi preservado
  });

  describe('fallback de modelo (quando nem o template nem o nome exato resolvem)', () => {
    beforeEach(() => {
      seedModelos();
      // nenhum modelo se chama "Sem match": a resolução por nome exato falha e o fallback entra
      sqlite.database.exec(`UPDATE simulador_agendamentos SET nome = 'Sem match' WHERE id = 10`);
      addParticipantes(1000);
    });

    it('um nome exato resolve antes do fallback (o fallback nem roda)', async () => {
      const r = await put(10, { tema_sessao: 'Treino A' });
      expect(diagOf(r.json)).toMatchObject({ modeloIdInicial: 102, templateIdFinal: 102, modeloIdFinal: 102 });
      expect(diagOf(r.json)).not.toHaveProperty('fallbackModelo');
    });

    it('prioridade 1: gera qualificação, mesmo tipo e aeronave, do tenant; maior id sem nome igual', async () => {
      const r = await put(10, { observacoes: 'x' });
      expect(r.status).toBe(200);
      // 101 não gera; 104 é de outra aeronave; 105 de outro tipo; 201 de outro tenant
      expect(diagOf(r.json)).toMatchObject({ modeloIdInicial: null, fallbackModelo: 103, modeloIdFinal: 103 });
      expect(criarMock.mock.calls[0][1].modeloId).toBe(103);
    });

    it('no fallback o nome é comparado sem diferenciar caixa e desempata a favor do mesmo nome', async () => {
      const r = await put(10, { tema_sessao: 'treino a' }); // a resolução exata é sensível à caixa
      expect(diagOf(r.json).fallbackModelo).toBe(102);
    });

    it('prioridade 2: sem modelo que gere, aceita qualquer do tipo/aeronave (maior id)', async () => {
      sqlite.database.exec(`UPDATE modelos_sessao SET gera_qualificacao = 0`);
      const r = await put(10, { observacoes: 'x' });
      expect(diagOf(r.json).fallbackModelo).toBe(103);
    });

    it('o tipo de sessão do corpo troca o tipo usado no fallback', async () => {
      const r = await put(10, { tipo_sessao: 'INICIAL' });
      expect(diagOf(r.json)).toMatchObject({ tipoSessao: 'INICIAL', fallbackModelo: 105 });
    });

    it('sem tipo de sessão não tenta fallback', async () => {
      sqlite.database.exec(`UPDATE simulador_agendamentos SET tipo_sessao = NULL WHERE id = 10`);
      const r = await put(10, { observacoes: 'x' });
      expect(diagOf(r.json)).toEqual({
        hasPlanejadas: false,
        tipoSessao: '',
        modeloIdInicial: null,
        templateIdFinal: null,
        modeloIdFinal: null,
        resultado: 'sem_modelo',
      });
    });

    it('sem nenhum candidato: fallbackModelo null e sem_modelo', async () => {
      sqlite.database.exec(`UPDATE modelos_sessao SET deleted_at = '2026-01-01'`);
      const r = await put(10, { observacoes: 'x' });
      expect(diagOf(r.json)).toMatchObject({ fallbackModelo: null, modeloIdFinal: null, resultado: 'sem_modelo' });
    });

    it('com template válido na sessão o fallback nem roda', async () => {
      const r = await put(10, { template_id: 77 });
      expect(diagOf(r.json)).not.toHaveProperty('fallbackModelo');
      expect(diagOf(r.json).modeloIdFinal).toBe(77);
    });
  });
});

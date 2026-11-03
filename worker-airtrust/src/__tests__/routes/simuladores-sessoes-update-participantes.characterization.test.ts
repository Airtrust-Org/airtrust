import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv, Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { createSessoesUpdateSchema } from '../helpers/simuladores-sessoes-update-fixture';
import { NOTECHS_ITENS_CATALOGO } from '../../constants/notechs';

// Caracterização da fase PARTICIPANTES + FICHAS do PUT /sessoes/:id (SQLite real): troca da lista
// de participantes, soft-delete das fichas de quem saiu, criação das fichas de quem entrou (tipo de
// aeronave, modelo e manobras) e integração com a escala.

const criarMock = vi.hoisted(() => vi.fn());
const syncEscalaMock = vi.hoisted(() => vi.fn());
const removeEventosMock = vi.hoisted(() => vi.fn());

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
  removeManagedEscalaEvents: removeEventosMock,
}));
vi.mock('../../services/simuladores/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/simuladores/shared')>()),
  criarQualificacoesPlanejadas: criarMock,
  syncSessaoEscalaEventos: syncEscalaMock,
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

const rows = (sql: string, ...args: unknown[]) =>
  sqlite.database.prepare(sql).all(...(args as never[])) as Array<Record<string, any>>;
const participantes = (sessaoId = 10) =>
  rows(
    'SELECT funcionario_id, funcao, status, deleted_at FROM sessoes_participantes WHERE sessao_id = ? ORDER BY id',
    sessaoId,
  );
const vivos = (sessaoId = 10) => participantes(sessaoId).filter((p) => p.deleted_at === null);
const fichasVivas = (sessaoId = 10) =>
  rows(
    'SELECT * FROM fichas_sessao WHERE agendamento_slot_id = ? AND deleted_at IS NULL ORDER BY colaborador_id_aluno',
    sessaoId,
  );
const manobrasDe = (fichaId: number) =>
  rows('SELECT * FROM fichas_sessao_manobras WHERE ficha_id = ? ORDER BY id', fichaId);

beforeEach(() => {
  criarMock.mockReset();
  criarMock.mockResolvedValue({ criadas: 0, puladas: 0, conflitosUniques: 0, bloqueadasDataPassada: 0 });
  syncEscalaMock.mockReset();
  removeEventosMock.mockReset();
  sqlite = new SqliteD1Database();
  createSessoesUpdateSchema(sqlite);
  sqlite.database.exec(`
    ALTER TABLE fichas_sessao_manobras ADD COLUMN codigo TEXT;
    ALTER TABLE fichas_sessao_manobras ADD COLUMN nome TEXT;
    ALTER TABLE fichas_sessao_manobras ADD COLUMN descricao TEXT;
    ALTER TABLE fichas_sessao_manobras ADD COLUMN categoria TEXT;
    ALTER TABLE fichas_sessao_manobras ADD COLUMN ordem INTEGER;
    ALTER TABLE fichas_sessao_manobras ADD COLUMN tripulante TEXT;
    CREATE TABLE manobras (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, codigo TEXT, nome TEXT, descricao TEXT, categoria TEXT, deleted_at TEXT
    );
    CREATE TABLE modelos_sessao_manobras (
      id INTEGER PRIMARY KEY AUTOINCREMENT, modelo_id INTEGER, manobra_id INTEGER, ordem INTEGER,
      observacoes TEXT, tripulante TEXT, deleted_at TEXT
    );
    INSERT INTO tipos_sessao (id, empresa_id, codigo) VALUES (1, 1, 'PERIODICO'), (2, 2, 'PERIODICO');
    INSERT INTO modelos_sessao (id, empresa_id, codigo, tipo_sessao_id, modelo_aeronave) VALUES
      (90, 1, 'P-AW139', 1, 'AW139'),
      (91, 2, 'P-AW139-OUTRA', 2, 'AW139'),
      (92, 1, 'EXPLICITO', NULL, NULL);
    INSERT INTO manobras (id, empresa_id, codigo, nome, descricao, categoria) VALUES
      (1, 1, 'M1', 'Manobra 1', 'Desc 1', 'CAT-A'),
      (2, 1, 'M2', 'Manobra 2', 'Desc 2', NULL),
      (3, 2, 'MX', 'Manobra X', 'Desc X', 'CAT-X');
    INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, tripulante) VALUES
      (90, 1, 2, NULL), (90, 2, 1, 'PF'), (91, 3, 1, NULL), (92, 2, 1, NULL);
    -- sessão 10 já tem 200 (PIC) e 201 (SIC), cada um com ficha; 201 tem manobra já preenchida
    INSERT INTO sessoes_participantes (uuid, sessao_id, funcionario_id, funcao, status)
    VALUES ('p1', 10, 200, 'PIC', 'CONFIRMADO'), ('p2', 10, 201, 'SIC', 'CONFIRMADO');
    INSERT INTO fichas_sessao (id, agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, tipo_aeronave,
      status, empresa_id, assinatura_aluno_timestamp)
    VALUES (701, 10, 200, 100, 'PERIODICO', 'SK76', 'AVALIACAO_PENDENTE', 1, NULL),
           (702, 10, 201, 100, 'PERIODICO', 'SK76', 'AVALIACAO_PENDENTE', 1, '2026-05-10 10:00:00');
    INSERT INTO fichas_sessao_manobras (id, ficha_id, codigo, resultado, observacoes) VALUES (801, 702, 'M1', 'S', 'bom');
  `);
  app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('tenantContext', { empresaId: 1, role: 'admin', empresaCodigo: 'T', empresaNome: 'T', plano: 'pro', permissions: [] });
    await next();
  });
  app.route('/', sessoesUpdateApp);
});

afterEach(() => sqlite.close());

describe('PUT /sessoes/:id — troca de participantes', () => {
  it('sem a chave participantes, nada muda nos participantes nem nas fichas', async () => {
    await put(10, { observacoes: 'x', resetar_fluxo_fichas: false });
    expect(vivos().map((p) => p.funcionario_id)).toEqual([200, 201]);
    expect(fichasVivas()).toHaveLength(2);
    // sem lista nova, a escala é ressincronizada pelo ramo "sem participantes" com os ativos
    expect(syncEscalaMock.mock.calls.at(-1)?.[1].participantes).toEqual([{ funcionario_id: 200 }, { funcionario_id: 201 }]);
    expect(removeEventosMock).not.toHaveBeenCalled();
  });

  it('substitui a lista: apaga (soft) os antigos e insere os novos CONFIRMADO, com PIC/SIC por posição', async () => {
    const r = await put(10, { participantes: [{ funcionario_id: 202 }, { funcionario_id: 200 }, { funcionario_id: 201, funcao: 'OBS' }] });
    expect(r.status).toBe(200);
    expect(participantes().filter((p) => p.deleted_at !== null).map((p) => p.funcionario_id)).toEqual([200, 201]);
    expect(vivos()).toEqual([
      { funcionario_id: 202, funcao: 'PIC', status: 'CONFIRMADO', deleted_at: null },
      { funcionario_id: 200, funcao: 'SIC', status: 'CONFIRMADO', deleted_at: null },
      { funcionario_id: 201, funcao: 'OBS', status: 'CONFIRMADO', deleted_at: null },
    ]);
  });

  it('itens sem funcionario_id são ignorados; lista vazia remove todos', async () => {
    await put(10, { participantes: [{ funcao: 'PIC' }, { funcionario_id: 202 }] });
    expect(vivos().map((p) => [p.funcionario_id, p.funcao])).toEqual([[202, 'PIC']]); // índice conta só os válidos

    await put(10, { participantes: [] });
    expect(vivos()).toEqual([]);
    expect(fichasVivas()).toEqual([]);
  });

  it('participantes que saem têm a ficha apagada (soft) mesmo se assinada; quem fica mantém a ficha e as manobras', async () => {
    await put(10, { participantes: [{ funcionario_id: 200 }], resetar_fluxo_fichas: false });
    expect(fichasVivas().map((f) => f.id)).toEqual([701]);
    expect(rows('SELECT deleted_at FROM fichas_sessao WHERE id = 702')[0].deleted_at).not.toBeNull();
    // a ficha de 702 foi apagada junto: as manobras ficam órfãs, mas não são tocadas
    expect(manobrasDe(702)).toHaveLength(1);
  });

  it('quem já tinha ficha não ganha segunda ficha', async () => {
    await put(10, { participantes: [{ funcionario_id: 200 }, { funcionario_id: 201 }], resetar_fluxo_fichas: false });
    expect(fichasVivas().map((f) => f.id)).toEqual([701, 702]);
    expect(manobrasDe(702)).toEqual([expect.objectContaining({ resultado: 'S', observacoes: 'bom' })]);
  });

  it('instrutor entre os participantes é recusado (400) sem trocar a lista', async () => {
    const r = await put(10, { participantes: [{ funcionario_id: 100 }] });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/instrutor/i);
    expect(vivos().map((p) => p.funcionario_id)).toEqual([200, 201]);
    expect(fichasVivas()).toHaveLength(2);
  });

  it('instrutor novo no mesmo corpo também vale para o bloqueio (instrutor efetivo)', async () => {
    sqlite.database.exec(`UPDATE funcionarios SET is_instrutor = 1 WHERE id = 202`);
    const r = await put(10, { instrutor_id: 202, participantes: [{ funcionario_id: 202 }] });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(vivos().map((p) => p.funcionario_id)).toEqual([200, 201]);
  });

  it('o bloqueio do instrutor roda DEPOIS do UPDATE do horário: a sessão já foi alterada quando devolve 400', async () => {
    const r = await put(10, { observacoes: 'gravada mesmo assim', participantes: [{ funcionario_id: 100 }] });
    expect(r.status).toBe(400);
    expect(rows('SELECT observacoes FROM simulador_agendamentos WHERE id = 10')[0].observacoes).toBe('gravada mesmo assim');
  });

  it('só apaga participantes de sessão da própria empresa (EXISTS no tenant)', async () => {
    sqlite.database.exec(`INSERT INTO sessoes_participantes (uuid, sessao_id, funcionario_id, funcao, status)
      VALUES ('o1', 20, 300, 'PIC', 'CONFIRMADO')`);
    await put(10, { participantes: [{ funcionario_id: 202 }] });
    expect(vivos(20).map((p) => p.funcionario_id)).toEqual([300]);
  });
});

describe('PUT /sessoes/:id — criação da ficha de quem entrou', () => {
  const novaFicha = () => fichasVivas().find((f) => f.colaborador_id_aluno === 202)!;

  it('herda tipo_sessao, instrutor e data da sessão; nasce AVALIACAO_PENDENTE na empresa', async () => {
    await put(10, { participantes: [{ funcionario_id: 202 }] });
    expect(novaFicha()).toMatchObject({
      agendamento_slot_id: 10,
      instrutor_id: 100,
      tipo_sessao: 'PERIODICO',
      data_sessao: '2026-05-10',
      status: 'AVALIACAO_PENDENTE',
      empresa_id: 1,
    });
    expect(novaFicha().uuid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('usa instrutor e data do corpo quando enviados', async () => {
    await put(10, { participantes: [{ funcionario_id: 202 }], instrutor_id: 100, data: '2026-05-20' });
    expect(novaFicha()).toMatchObject({ instrutor_id: 100, data_sessao: '2026-05-20' });
  });

  it('tipo_aeronave: payload > ficha existente da sessão > modelo do simulador', async () => {
    await put(10, { participantes: [{ funcionario_id: 202 }], tipo_aeronave: 'AW169' });
    expect(novaFicha().tipo_aeronave).toBe('AW169');

    sqlite.database.exec(`DELETE FROM fichas_sessao WHERE colaborador_id_aluno = 202; UPDATE fichas_sessao SET deleted_at = NULL WHERE id = 701`);
    await put(10, { participantes: [{ funcionario_id: 200 }, { funcionario_id: 202 }] });
    expect(novaFicha().tipo_aeronave).toBe('SK76'); // veio da ficha 701 da própria sessão

    sqlite.database.exec(`DELETE FROM fichas_sessao`);
    await put(10, { participantes: [{ funcionario_id: 202 }] });
    expect(novaFicha().tipo_aeronave).toBe('AW139'); // simulador 1 → aeronave_codigo
  });

  it('manobras: modelo explícito do tenant → manobras ordenadas + itens NOTECHS, todas sem resultado', async () => {
    await put(10, { participantes: [{ funcionario_id: 202 }], modelo_sessao_id: 92 });
    const m = manobrasDe(novaFicha().id);
    expect(m.slice(0, 1)).toEqual([
      expect.objectContaining({ codigo: 'M2', nome: 'Manobra 2', ordem: 1, categoria: 'GERAL', tripulante: 'AB', resultado: null, observacoes: '' }),
    ]);
    expect(m).toHaveLength(1 + NOTECHS_ITENS_CATALOGO.length);
  });

  it('manobras: sem modelo explícito, resolve por código do tipo + aeronave do tenant', async () => {
    await put(10, { participantes: [{ funcionario_id: 202 }], tipo_aeronave: 'AW139' });
    const m = manobrasDe(novaFicha().id);
    expect(m.slice(0, 2).map((x) => [x.codigo, x.ordem, x.tripulante, x.categoria])).toEqual([
      ['M2', 1, 'PF', 'GERAL'],
      ['M1', 2, 'AB', 'CAT-A'],
    ]);
    expect(m).toHaveLength(2 + NOTECHS_ITENS_CATALOGO.length);
  });

  it('modelo de OUTRA empresa é ignorado; cai na busca por código/aeronave do próprio tenant', async () => {
    await put(10, { participantes: [{ funcionario_id: 202 }], modelo_sessao_id: 91, tipo_aeronave: 'AW139' });
    const codigos = manobrasDe(novaFicha().id).map((x) => x.codigo);
    expect(codigos).toContain('M1');
    expect(codigos).not.toContain('MX');
  });

  it('sem modelo encontrado, a ficha nasce sem manobras', async () => {
    await put(10, { participantes: [{ funcionario_id: 202 }], tipo_aeronave: 'S92' });
    expect(manobrasDe(novaFicha().id)).toEqual([]);
  });

  it('o modelo vem também do template_id da sessão quando o corpo não manda', async () => {
    sqlite.database.exec(`UPDATE simulador_agendamentos SET template_id = 92 WHERE id = 10`);
    await put(10, { participantes: [{ funcionario_id: 202 }] });
    expect(manobrasDe(novaFicha().id).map((x) => x.codigo)[0]).toBe('M2');
  });

  it('participante de outra empresa NÃO é validado: entra na lista e ganha ficha (achado, comportamento atual)', async () => {
    await put(10, { participantes: [{ funcionario_id: 300 }] });
    expect(vivos().map((p) => p.funcionario_id)).toEqual([300]);
    expect(fichasVivas().map((f) => f.colaborador_id_aluno)).toEqual([300]);
  });
});

describe('PUT /sessoes/:id — escala após trocar participantes', () => {
  it('remove os eventos de quem saiu e ressincroniza a escala com a lista nova', async () => {
    await put(10, { participantes: [{ funcionario_id: 200 }, { funcionario_id: 202 }] });
    expect(removeEventosMock).toHaveBeenCalledTimes(1);
    expect(removeEventosMock).toHaveBeenCalledWith(
      expect.objectContaining({ funcionarioId: 201, origem: 'simuladores', linkId: 'sim_sessao:10' }),
    );
    expect(syncEscalaMock).toHaveBeenCalledTimes(1);
    expect(syncEscalaMock.mock.calls[0][1]).toMatchObject({
      empresaId: 1,
      sessaoId: '10',
      participantes: [{ funcionario_id: 200 }, { funcionario_id: 202 }],
      createdBy: 'system', // userId não é populado sem o middleware de auth real
    });
  });

  it('falha da escala não desfaz a troca: 409 SIMULATOR_SCALE_INTEGRATION_PENDING com estado principal salvo', async () => {
    syncEscalaMock.mockRejectedValueOnce(new Error('boom'));
    const r = await put(10, { participantes: [{ funcionario_id: 202 }] });
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ partial: true, code: 'SIMULATOR_SCALE_INTEGRATION_PENDING', primary_saved: true, scale_synced: false });
    expect(vivos().map((p) => p.funcionario_id)).toEqual([202]);
  });

  it('o reset do fluxo roda de novo depois da troca e deixa em andamento só o que estava em andamento', async () => {
    await put(10, { participantes: [{ funcionario_id: 200 }, { funcionario_id: 202 }] });
    expect(fichasVivas().map((f) => [f.colaborador_id_aluno, f.status])).toEqual([
      [200, 'AVALIACAO_PENDENTE'],
      [202, 'AVALIACAO_PENDENTE'],
    ]);
  });
});

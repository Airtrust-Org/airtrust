import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

// Caracterização de PUT e DELETE /:id/alocacoes/:aid (SQLite real). O SQL do próprio handler
// (escalas_mensais, escala_alocacoes, escala_eventos, funcionarios, restricoes_tripulacao e a
// substituição de alocação em conflito) roda de verdade; os helpers de consulta/regeneração de
// eventos e o motor de cobertura são substituídos e têm testes próprios.

const h = vi.hoisted(() => ({
  resolverQuinzena: vi.fn(),
  checarFunc: vi.fn(),
  checarSlot: vi.fn(),
  habilitacao: vi.fn(),
  cancelarFolgas: vi.fn(),
  removerFolgaSeExiste: vi.fn(),
  removerFeriasPorAlocacao: vi.fn(),
  auditar: vi.fn(),
  buscarDetalhadas: vi.fn(),
  folgaOrfa: vi.fn(),
  regenerar: vi.fn(),
  cobertura: vi.fn(),
  publish: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 'user-1');
    c.set('userRole', 'manager');
    c.set('empresaId', Number(c.req.header('x-empresa-id') || 1));
    await next();
  },
}));
vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
  requirePermission: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));
vi.mock('../../shared/domainEvents', () => ({ publishDomainEvent: h.publish }));
vi.mock('../../services/escalas/alocacao-engine', () => ({
  removerFolgaAutomaticaOrfa: h.folgaOrfa,
  regenerarEventosAutomaticosFuncionarioEscala: h.regenerar,
  recalcularCoberturaAeronave: h.cobertura,
  desalocarAeronaveInativa: vi.fn(),
}));
vi.mock('../../services/escalas/alocacao-helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/escalas/alocacao-helpers')>()),
  resolverQuinzenaPadraoPorPeriodo: h.resolverQuinzena,
  checarSobreposicaoFuncionario: h.checarFunc,
  checarSobreposicaoSlot: h.checarSlot,
  verificarHabilitacaoModelo: h.habilitacao,
  cancelarFolgasSobrepostas: h.cancelarFolgas,
  removerFolgaAutomaticaSeExiste: h.removerFolgaSeExiste,
  removerFuncionarioFeriasPorAlocacao: h.removerFeriasPorAlocacao,
  auditarAlocacao: h.auditar,
  buscarAlocacoesDetalhadas: h.buscarDetalhadas,
}));

import alocacoesRoutes from '../../routes/escalas-alocacoes';

let sqlite: SqliteD1Database;
let app: Hono<{ Bindings: Env }>;

async function call(method: 'PUT' | 'DELETE', path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.request(
    path,
    {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    },
    { DB: sqlite.asD1() } as unknown as Env,
  );
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}
const put = (aid: string, body: unknown, eid = 'esc-1', headers?: Record<string, string>) =>
  call('PUT', `/${eid}/alocacoes/${aid}`, body, headers);
const del = (aid: string, eid = 'esc-1', headers?: Record<string, string>) =>
  call('DELETE', `/${eid}/alocacoes/${aid}`, undefined, headers);

const aloc = (id: string) =>
  sqlite.database.prepare('SELECT * FROM escala_alocacoes WHERE id = ?').get(id) as Record<string, any>;
const evento = (id: string) =>
  sqlite.database.prepare('SELECT * FROM escala_eventos WHERE id = ?').get(id) as Record<string, any>;

beforeEach(() => {
  for (const m of Object.values(h)) m.mockReset();
  h.resolverQuinzena.mockResolvedValue(7);
  h.checarFunc.mockResolvedValue(null);
  h.checarSlot.mockResolvedValue(null);
  h.habilitacao.mockResolvedValue({ habilitado: true });
  h.buscarDetalhadas.mockResolvedValue([]);
  sqlite = new SqliteD1Database();
  sqlite.database.exec(`
    ALTER TABLE funcionarios ADD COLUMN ativo INTEGER DEFAULT 1;
    ALTER TABLE funcionarios ADD COLUMN status TEXT;
    INSERT INTO funcionarios (id, empresa_id, nome, ativo, status) VALUES
      (9001, 1, 'Ana', 1, 'ATIVO'), (9002, 1, 'Bia', 1, NULL), (9003, 1, 'Caio', 0, 'ATIVO'),
      (9004, 1, 'Dani', 1, 'INATIVO'), (9005, 2, 'Eva', 1, 'ATIVO'), (9006, 1, 'Fábio', 1, 'ATIVO');
    CREATE TABLE escalas_mensais (id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, ano INTEGER, mes INTEGER, status TEXT, deleted_at TEXT);
    INSERT INTO escalas_mensais VALUES ('esc-1', 1, 2026, 6, 'rascunho', NULL), ('esc-2', 1, 2026, 6, 'rascunho', NULL),
      ('esc-3', 2, 2026, 6, 'rascunho', NULL);
    CREATE TABLE escala_alocacoes (
      id TEXT PRIMARY KEY, escala_id TEXT NOT NULL, funcionario_id TEXT NOT NULL, aeronave_id INTEGER, funcao TEXT,
      quinzena_id INTEGER, data_inicio TEXT, data_fim TEXT, status TEXT, base TEXT, observacoes TEXT,
      padrao_escala_id TEXT, auto_gerado INTEGER DEFAULT 0, situacao_tipo TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    INSERT INTO escala_alocacoes (id, escala_id, funcionario_id, aeronave_id, funcao, quinzena_id, data_inicio, data_fim, status) VALUES
      ('a1', 'esc-1', '9001', 10, 'PIC', 5, '2026-06-01', '2026-06-15', 'planejado'),
      ('a-sem-aeronave', 'esc-1', '9001', NULL, 'PIC', NULL, '2026-06-01', '2026-06-15', 'planejado'),
      ('a-cancelada', 'esc-1', '9001', 10, 'PIC', 5, '2026-06-01', '2026-06-15', 'cancelado'),
      ('a-apagada', 'esc-1', '9001', 10, 'PIC', 5, '2026-06-01', '2026-06-15', 'planejado'),
      ('a-outra-escala', 'esc-2', '9001', 10, 'PIC', 5, '2026-06-01', '2026-06-15', 'planejado'),
      ('a-sic', 'esc-1', '9002', 10, 'SIC', 5, '2026-06-01', '2026-06-15', 'planejado'),
      ('a-conflito', 'esc-1', '9006', 11, 'PIC', 5, '2026-06-10', '2026-06-20', 'planejado');
    UPDATE escala_alocacoes SET deleted_at = '2026-01-01' WHERE id = 'a-apagada';
    CREATE TABLE escala_eventos (id TEXT PRIMARY KEY, alocacao_id TEXT, gerado_automaticamente INTEGER, deleted_at TEXT, updated_at TEXT);
    INSERT INTO escala_eventos (id, alocacao_id, gerado_automaticamente) VALUES
      ('ev-auto-1', 'a1', 1), ('ev-auto-2', 'a1', 1), ('ev-manual', 'a1', 0), ('ev-outra', 'a-sic', 1), ('ev-conf', 'a-conflito', 1);
    CREATE TABLE restricoes_tripulacao (
      id INTEGER PRIMARY KEY AUTOINCREMENT, funcionario_a_id TEXT, funcionario_b_id TEXT, tipo_restricao TEXT,
      ativo INTEGER DEFAULT 1, data_fim TEXT, deleted_at TEXT
    );
  `);
  app = new Hono<{ Bindings: Env }>();
  app.route('/', alocacoesRoutes);
});

afterEach(() => sqlite.close());

describe('PUT /:id/alocacoes/:aid — validação de entrada e escopo', () => {
  it('body que não é JSON → 400 ESCALAS_INVALID_BODY', async () => {
    const r = await put('a1', '{nao-json');
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('ESCALAS_INVALID_BODY');
  });

  it('schema inválido → 400 com as mensagens do zod', async () => {
    const r = await put('a1', { data_inicio: '2026-06-10', data_fim: '2026-06-01' });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain('data_fim deve ser >= data_inicio');
  });

  it('escala de outra empresa ou inexistente → 404 ESCALAS_NOT_FOUND', async () => {
    expect((await put('a1', { observacoes: 'x' }, 'esc-3')).json.code).toBe('ESCALAS_NOT_FOUND');
    expect((await put('a1', { observacoes: 'x' }, 'esc-1', { 'x-empresa-id': '2' })).status).toBe(404);
  });

  it('alocação apagada ou de outra escala → 404 ESCALAS_ALOCACAO_NOT_FOUND', async () => {
    for (const aid of ['a-apagada', 'a-outra-escala', 'nao-existe']) {
      const r = await put(aid, { observacoes: 'x' });
      expect([r.status, r.json.code]).toEqual([404, 'ESCALAS_ALOCACAO_NOT_FOUND']);
    }
  });

  it('alocação cancelada não pode ser editada → 409 ESCALAS_ALOCACAO_CANCELADA', async () => {
    const r = await put('a-cancelada', { observacoes: 'x' });
    expect([r.status, r.json.code]).toEqual([409, 'ESCALAS_ALOCACAO_CANCELADA']);
    expect(aloc('a-cancelada').observacoes).toBeNull();
  });

  it('corpo vazio (sem campos) → 400 ESCALAS_EMPTY_UPDATE e nada é gravado', async () => {
    const r = await put('a1', {});
    expect([r.status, r.json.code]).toEqual([400, 'ESCALAS_EMPTY_UPDATE']);
    expect(aloc('a1').updated_at).toBeNull();
  });
});

describe('PUT /:id/alocacoes/:aid — atualização', () => {
  it('só campos simples: grava somente o enviado, sem revalidar sobreposição, e roda os efeitos', async () => {
    const r = await put('a1', { observacoes: 'nova', base: 'SBJR', status: 'confirmado' });
    expect(r.status).toBe(200);
    expect(aloc('a1')).toMatchObject({ observacoes: 'nova', base: 'SBJR', status: 'confirmado', funcao: 'PIC', funcionario_id: '9001', quinzena_id: 5 });
    expect(aloc('a1').updated_at).not.toBeNull();
    expect(h.checarFunc).not.toHaveBeenCalled();
    expect(h.checarSlot).not.toHaveBeenCalled();
    expect(h.resolverQuinzena).not.toHaveBeenCalled();
    expect(h.regenerar).toHaveBeenCalledTimes(1);
    expect(h.regenerar.mock.calls[0][0]).toMatchObject({ empresa_id: 1, escala_id: 'esc-1', funcionario_id: '9001', created_by: 'user-1' });
    expect(h.cobertura).toHaveBeenCalledWith(expect.anything(), 'esc-1', 10, 6, 2026);
    expect(h.removerFolgaSeExiste).toHaveBeenCalledWith(expect.anything(), { escalaId: 'esc-1', funcionarioId: '9001', quinzenaId: 5 });
    expect(h.auditar.mock.calls[0][1]).toMatchObject({ escala_id: 'esc-1', acao: 'EDITAR_ALOCACAO', alocacao_id: 'a1', realizado_por: 'user-1' });
    expect(JSON.parse(h.auditar.mock.calls[0][1].valor_anterior)).toEqual({ funcao: 'PIC', data_inicio: '2026-06-01', data_fim: '2026-06-15' });
  });

  it('devolve a alocação detalhada recarregada (null se não vier)', async () => {
    expect((await put('a1', { observacoes: 'x' })).json).toEqual({ success: true, data: null });
  });

  it('sem aeronave não recalcula cobertura', async () => {
    await put('a-sem-aeronave', { observacoes: 'x' });
    expect(h.cobertura).not.toHaveBeenCalled();
  });

  it('mudar datas sem informar quinzena resolve a quinzena padrão do período e limpa a folga órfã da antiga', async () => {
    await put('a1', { data_inicio: '2026-06-16', data_fim: '2026-06-30' });
    expect(h.resolverQuinzena).toHaveBeenCalledWith(expect.anything(), { empresaId: 1, ano: 2026, mes: 6, dataInicio: '2026-06-16', dataFim: '2026-06-30' });
    expect(aloc('a1')).toMatchObject({ data_inicio: '2026-06-16', data_fim: '2026-06-30', quinzena_id: 7 });
    expect(h.folgaOrfa).toHaveBeenCalledWith(expect.anything(), { escalaId: 'esc-1', funcionarioId: '9001', quinzenaId: 5 });
    expect(h.cancelarFolgas).toHaveBeenCalledWith(expect.anything(), { escalaId: 'esc-1', funcionarioId: '9001', dataInicio: '2026-06-16', dataFim: '2026-06-30', ignorarAlocacaoId: 'a1' });
  });

  it('quinzena_id explícita vence a resolução automática; mesma quinzena não gera folga órfã', async () => {
    await put('a1', { data_inicio: '2026-06-02', quinzena_id: 5 });
    expect(h.resolverQuinzena).not.toHaveBeenCalled();
    expect(aloc('a1').quinzena_id).toBe(5);
    expect(h.folgaOrfa).not.toHaveBeenCalled();
  });

  it('quinzena_id:null é aceito pelo schema mas NÃO limpa a quinzena (`??` cai na atual) — comportamento atual', async () => {
    const r = await put('a1', { quinzena_id: null });
    expect(r.status).toBe(200);
    expect(aloc('a1').quinzena_id).toBe(5);
    expect(h.folgaOrfa).not.toHaveBeenCalled();
    expect(h.removerFolgaSeExiste).toHaveBeenCalledWith(expect.anything(), { escalaId: 'esc-1', funcionarioId: '9001', quinzenaId: 5 });
  });

  it('troca de função revalida com o período atual e o slot da nova função', async () => {
    await put('a1', { funcao: 'SIC' });
    expect(h.checarFunc).toHaveBeenCalledWith(expect.anything(), 1, '9001', '2026-06-01', '2026-06-15', 'a1', 10);
    expect(h.checarSlot).toHaveBeenCalledWith(expect.anything(), 'esc-1', 10, 'SIC', '2026-06-01', '2026-06-15', 'a1');
    expect(aloc('a1').funcao).toBe('SIC');
  });

  it('efeitos colaterais que falham não derrubam a resposta (o estado principal já foi gravado)', async () => {
    h.cancelarFolgas.mockRejectedValue(new Error('x'));
    h.auditar.mockRejectedValue(new Error('x'));
    h.regenerar.mockRejectedValue(new Error('x'));
    h.cobertura.mockRejectedValue(new Error('x'));
    const r = await put('a1', { observacoes: 'ok' });
    expect(r.status).toBe(200);
    expect(aloc('a1').observacoes).toBe('ok');
  });

  it('erro inesperado vira 500 ESCALAS_ALOCACAO_UPDATE_ERROR', async () => {
    h.resolverQuinzena.mockRejectedValue(new Error('boom'));
    const r = await put('a1', { data_inicio: '2026-06-02' });
    expect([r.status, r.json.code]).toEqual([500, 'ESCALAS_ALOCACAO_UPDATE_ERROR']);
  });
});

describe('PUT /:id/alocacoes/:aid — troca de funcionário', () => {
  it.each([
    ['inexistente', '99999'],
    ['de outra empresa', '9005'],
    ['inativo (ativo=0)', '9003'],
    ['com status INATIVO', '9004'],
  ])('funcionário %s → 404 ESCALAS_FUNCIONARIO_NOT_FOUND', async (_n, fid) => {
    const r = await put('a1', { funcionario_id: fid });
    expect([r.status, r.json.code]).toEqual([404, 'ESCALAS_FUNCIONARIO_NOT_FOUND']);
    expect(aloc('a1').funcionario_id).toBe('9001');
  });

  it('status nulo conta como ATIVO; habilitação do modelo da aeronave é conferida', async () => {
    const r = await put('a1', { funcionario_id: '9002' });
    expect(r.status).toBe(200);
    expect(h.habilitacao).toHaveBeenCalledWith(expect.anything(), '9002', 10, 1);
    expect(aloc('a1').funcionario_id).toBe('9002');
  });

  it('não habilitado no modelo → 400 MODELO_NAO_HABILITADO com o motivo', async () => {
    h.habilitacao.mockResolvedValue({ habilitado: false, motivo: 'sem qualificação AW139' });
    const r = await put('a1', { funcionario_id: '9002' });
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ success: false, error: 'sem qualificação AW139', code: 'MODELO_NAO_HABILITADO' });
    expect(aloc('a1').funcionario_id).toBe('9001');
  });

  it('alocação sem aeronave não confere habilitação', async () => {
    await put('a-sem-aeronave', { funcionario_id: '9002' });
    expect(h.habilitacao).not.toHaveBeenCalled();
  });

  it('regenera os eventos do funcionário antigo E do novo', async () => {
    await put('a1', { funcionario_id: '9002' });
    expect(h.regenerar.mock.calls.map((c) => c[0].funcionario_id).sort()).toEqual(['9001', '9002']);
    expect(h.cancelarFolgas.mock.calls[0][1].funcionarioId).toBe('9002');
  });
});

describe('PUT /:id/alocacoes/:aid — conflitos', () => {
  const conflito = { id: 'a-conflito', funcionario_nome: 'Fábio', data_inicio: '2026-06-10', data_fim: '2026-06-20' };

  it('sobreposição do funcionário sem override → 409 SOBREPOSICAO_FUNCIONARIO pedindo confirmação', async () => {
    h.checarFunc.mockResolvedValue(conflito);
    const r = await put('a1', { data_fim: '2026-06-20' });
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ success: false, code: 'SOBREPOSICAO_FUNCIONARIO', requer_confirmacao: true, conflito });
    expect(aloc('a1').data_fim).toBe('2026-06-15');
    expect(aloc('a-conflito').deleted_at).toBeNull();
  });

  it('com conflito_override=1 a alocação em conflito (da mesma empresa) é apagada junto com seus eventos automáticos', async () => {
    h.checarFunc.mockResolvedValue(conflito);
    const r = await put('a1', { data_fim: '2026-06-20', conflito_override: 1 });
    expect(r.status).toBe(200);
    expect(aloc('a-conflito').deleted_at).not.toBeNull();
    // ACHADO (não corrigido aqui): o UPDATE de escala_eventos exige `ea.deleted_at IS NULL`, mas a alocação
    // acabou de ser apagada no comando anterior, então o EXISTS não casa e o evento NÃO é apagado por ele
    // (a regeneração de eventos do funcionário é quem deveria limpar). Fixa o estado atual.
    expect(evento('ev-conf').deleted_at).toBeNull();
    expect(aloc('a1').data_fim).toBe('2026-06-20');
    expect(h.regenerar.mock.calls.some((c) => c[0].funcionario_id === '9006')).toBe(true);
    expect(h.cobertura).toHaveBeenCalledWith(expect.anything(), 'esc-1', 11, 6, 2026);
  });

  it('override com conflito de OUTRA empresa não apaga nada e volta a 409', async () => {
    h.checarFunc.mockResolvedValue({ ...conflito, id: 'a-de-outra-empresa' });
    sqlite.database.exec(`
      INSERT INTO escala_alocacoes (id, escala_id, funcionario_id, funcao, data_inicio, data_fim, status)
      VALUES ('a-de-outra-empresa', 'esc-3', '9005', 'PIC', '2026-06-10', '2026-06-20', 'planejado')`);
    const r = await put('a1', { data_fim: '2026-06-20', conflito_override: 1 });
    expect([r.status, r.json.code]).toEqual([409, 'SOBREPOSICAO_FUNCIONARIO']);
    expect(aloc('a-de-outra-empresa').deleted_at).toBeNull();
  });

  it('slot já ocupado → 409 SLOT_OCUPADO com quem ocupa', async () => {
    h.checarSlot.mockResolvedValue({ funcionario_nome: 'Fábio', data_inicio: '2026-06-10', data_fim: '2026-06-20' });
    const r = await put('a1', { funcao: 'SIC' });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ success: false, code: 'SLOT_OCUPADO', error: 'Slot SIC já está ocupado por Fábio de 2026-06-10 a 2026-06-20' });
  });

  it('a revalidação de slot só vale para alocação com aeronave', async () => {
    await put('a-sem-aeronave', { funcao: 'SIC' });
    expect(h.checarSlot).not.toHaveBeenCalled();
  });

  it('restrição "não pode voar junto" com o par PIC/SIC da mesma aeronave → 409 RESTRICAO_PAR', async () => {
    // a1 é PIC (9001); o parceiro SIC na aeronave 10 é a-sic (9002)
    sqlite.database.exec(`INSERT INTO restricoes_tripulacao (funcionario_a_id, funcionario_b_id, tipo_restricao, ativo)
      VALUES ('9002', '9001', 'nao_pode_voar_junto', 1)`);
    const r = await put('a1', { data_fim: '2026-06-14' });
    expect([r.status, r.json.code]).toEqual([409, 'RESTRICAO_PAR']);
    expect(aloc('a1').data_fim).toBe('2026-06-15');
  });

  it.each([
    ['restrição inativa', `ativo = 0`],
    ['restrição apagada', `deleted_at = '2026-01-01'`],
    ['restrição já encerrada', `data_fim = '2026-05-01'`],
    ['outro tipo de restrição', `tipo_restricao = 'preferencia'`],
  ])('%s não bloqueia', async (_n, set) => {
    sqlite.database.exec(`INSERT INTO restricoes_tripulacao (funcionario_a_id, funcionario_b_id, tipo_restricao, ativo)
      VALUES ('9001', '9002', 'nao_pode_voar_junto', 1); UPDATE restricoes_tripulacao SET ${set}`);
    expect((await put('a1', { data_fim: '2026-06-14' })).status).toBe(200);
  });

  it('o par só conta se estiver na função oposta, na mesma aeronave e com período sobreposto', async () => {
    sqlite.database.exec(`
      INSERT INTO restricoes_tripulacao (funcionario_a_id, funcionario_b_id, tipo_restricao) VALUES ('9001', '9002', 'nao_pode_voar_junto');
      UPDATE escala_alocacoes SET data_inicio = '2026-07-01', data_fim = '2026-07-15' WHERE id = 'a-sic'`);
    expect((await put('a1', { data_fim: '2026-06-14' })).status).toBe(200);
  });

  it('função de apoio (não PIC/SIC) não consulta restrição de par', async () => {
    sqlite.database.exec(`INSERT INTO restricoes_tripulacao (funcionario_a_id, funcionario_b_id, tipo_restricao) VALUES ('9001', '9002', 'nao_pode_voar_junto')`);
    const r = await put('a1', { funcao: 'INSTRUTOR' });
    expect(r.status).toBe(200);
  });
});

describe('DELETE /:id/alocacoes/:aid', () => {
  it('escala de outra empresa → 404; alocação inexistente/apagada/de outra escala → 404', async () => {
    expect((await del('a1', 'esc-3')).json.code).toBe('ESCALAS_NOT_FOUND');
    for (const aid of ['a-apagada', 'a-outra-escala', 'nao-existe']) {
      const r = await del(aid);
      expect([r.status, r.json.code]).toEqual([404, 'ESCALAS_ALOCACAO_NOT_FOUND']);
    }
    expect(aloc('a-outra-escala').deleted_at).toBeNull();
  });

  it('apaga (soft) a alocação e só os eventos AUTOMÁTICOS dela; devolve a contagem', async () => {
    const r = await del('a1');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ success: true, data: { eventos_removidos: 2 } });
    expect(aloc('a1').deleted_at).not.toBeNull();
    expect(evento('ev-auto-1').deleted_at).not.toBeNull();
    expect(evento('ev-auto-2').deleted_at).not.toBeNull();
    expect(evento('ev-manual').deleted_at).toBeNull();
    expect(evento('ev-outra').deleted_at).toBeNull();
    expect(aloc('a-sic').deleted_at).toBeNull();
  });

  it('roda os efeitos: folga órfã (com quinzena), regeneração, auditoria, evento de domínio e cobertura', async () => {
    await del('a1');
    expect(h.folgaOrfa).toHaveBeenCalledWith(expect.anything(), { escalaId: 'esc-1', funcionarioId: '9001', quinzenaId: 5 });
    expect(h.regenerar.mock.calls[0][0]).toMatchObject({ empresa_id: 1, escala_id: 'esc-1', funcionario_id: '9001', created_by: 'user-1' });
    expect(h.auditar.mock.calls[0][1]).toMatchObject({ escala_id: 'esc-1', acao: 'REMOVER_ALOCACAO', alocacao_id: 'a1', realizado_por: 'user-1' });
    expect(JSON.parse(h.auditar.mock.calls[0][1].valor_anterior)).toEqual({ funcionario_id: '9001', funcao: 'PIC' });
    expect(h.publish).toHaveBeenCalledWith(expect.anything(), 'escalas', 'TRIPULANTE_REMOVIDO', {
      empresa_id: 1,
      origem_modulo: 'escalas',
      origem_usuario_id: 'user-1',
      funcionario_id: '9001',
      escala_id: 'esc-1',
      alocacao_id: 'a1',
      papel: 'PIC',
    });
    expect(h.cobertura).toHaveBeenCalledWith(expect.anything(), 'esc-1', 10, 6, 2026);
  });

  it('sem quinzena não limpa folga; sem aeronave não recalcula cobertura', async () => {
    await del('a-sem-aeronave');
    expect(h.folgaOrfa).not.toHaveBeenCalled();
    expect(h.cobertura).not.toHaveBeenCalled();
  });

  it('efeitos que falham não derrubam a resposta nem desfazem o soft-delete', async () => {
    for (const m of [h.folgaOrfa, h.regenerar, h.auditar, h.publish, h.cobertura]) m.mockRejectedValue(new Error('x'));
    const r = await del('a1');
    expect(r.status).toBe(200);
    expect(aloc('a1').deleted_at).not.toBeNull();
  });

  it('apagar duas vezes: a segunda dá 404', async () => {
    await del('a1');
    expect((await del('a1')).status).toBe(404);
  });
});

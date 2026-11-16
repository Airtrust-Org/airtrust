/**
 * Retificação formal de fichas assinadas (schema V2 0587) — SQLite real.
 * Cobre o contrato da migration (idempotência, append-only, triggers) e o fluxo HTTP
 * (solicitar → decidir → assinar instrutor/aluno → concluir) sem alterar a ficha original.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync as DatabaseSyncType, SQLInputValue } from 'node:sqlite';
import { NOTECHS_CANONICAL_ITEMS } from '../../../../src/shared/simuladores/notechs-canonical';

const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as { new (path: string): DatabaseSyncType };
const sql0587 = readFileSync(join(process.cwd(), '..', 'worker-airtrust/schema-v2/changes/0587_simuladores_fichas_retificacoes.sql'), 'utf8');

// O guard real depende do esquema RBAC; aqui ele só registra QUAL ficha foi submetida à autorização.
const authorizedFichaIds: Array<number | null | undefined> = [];
vi.mock('../../middleware/operational-domain-access', () => ({
  requireOperationalAccess: (opts: { resolveResourceId?: (c: unknown) => number | null | undefined }) =>
    async (c: { req: { param: (k: string) => string } }, next: () => Promise<void>) => {
      authorizedFichaIds.push(opts.resolveResourceId ? opts.resolveResourceId(c) : Number(c.req.param('id')) || null);
      await next();
    },
}));
vi.mock('../../services/simuladores/shared', () => ({ audit: vi.fn(async () => undefined) }));

import retificacoes from '../../routes/simuladores-fichas-retificacoes';

class Stmt {
  constructor(private db: DatabaseSyncType, private sql: string, private vals: SQLInputValue[] = []) {}
  bind(...v: unknown[]) { return new Stmt(this.db, this.sql, v as SQLInputValue[]); }
  async first<T>() { return (this.db.prepare(this.sql).get(...this.vals) as T) ?? null; }
  async all<T>() { return { results: this.db.prepare(this.sql).all(...this.vals) as T[] }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.vals); return { meta: { changes: Number(r.changes) } }; }
}
function makeDb() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  const d1 = {
    database,
    prepare: (sql: string) => new Stmt(database, sql),
    async batch(stmts: Stmt[]) {
      database.exec('BEGIN');
      try { const out = []; for (const s of stmts) out.push(await s.run()); database.exec('COMMIT'); return out; }
      catch (e) { database.exec('ROLLBACK'); throw e; }
    },
  };
  return d1;
}

function bootstrap(db: DatabaseSyncType) {
  db.exec(`
    CREATE TABLE empresas (id INTEGER PRIMARY KEY, nome TEXT);
    CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT);
    CREATE TABLE usuarios (id INTEGER PRIMARY KEY, funcionario_id INTEGER, deleted_at TEXT);
    CREATE TABLE fichas_sessao (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, status TEXT, resultado_final TEXT, aprovado INTEGER,
      instrutor_id INTEGER, colaborador_id_aluno INTEGER,
      assinatura_instrutor_timestamp TEXT, assinatura_instrutor INTEGER,
      assinatura_aluno_timestamp TEXT, assinatura_tripulante INTEGER, deleted_at TEXT);
    CREATE TABLE fichas_sessao_manobras (
      id INTEGER PRIMARY KEY, ficha_id INTEGER NOT NULL REFERENCES fichas_sessao(id), codigo TEXT, categoria TEXT,
      resultado TEXT, ordem INTEGER, observacoes TEXT, deleted_at TEXT);
    INSERT INTO empresas VALUES (6,'A'),(7,'B');
    INSERT INTO funcionarios VALUES (10,6,NULL),(11,6,NULL),(12,6,NULL),(20,7,NULL);
    INSERT INTO usuarios VALUES (100,10,NULL),(101,11,NULL),(102,12,NULL),(200,20,NULL),(900,NULL,NULL),(901,NULL,NULL);
    -- ficha 1: assinada, aprovada, 1 técnica 8 + 15 NOTECHS (um NR)
    INSERT INTO fichas_sessao VALUES (1,6,'APROVADO','APROVADO',1,10,11,'2026-07-21T14:51:57Z',1,'2026-07-21T14:23:10Z',1,NULL);
    -- ficha 2: ainda não assinada
    INSERT INTO fichas_sessao VALUES (2,6,'RASCUNHO','PENDENTE',0,10,11,NULL,0,NULL,0,NULL);
    -- ficha 3: outro tenant, assinada
    INSERT INTO fichas_sessao VALUES (3,7,'APROVADO','APROVADO',1,20,20,'2026-07-21T14:51:57Z',1,NULL,1,NULL);
    INSERT INTO fichas_sessao_manobras VALUES (500,1,'A139-NRM-001','PROCEDIMENTOS','8',1,NULL,NULL);
  `);
  NOTECHS_CANONICAL_ITEMS.forEach((it, i) => {
    db.prepare(`INSERT INTO fichas_sessao_manobras VALUES (?,?,?,?,?,?,NULL,NULL)`)
      .run(600 + i, 1, it.codigo, 'NOTECHS', i === 2 ? 'NR' : '9', 1001 + i);
  });
  db.prepare(`INSERT INTO fichas_sessao_manobras VALUES (700,2,'X','PROCEDIMENTOS','7',1,NULL,NULL)`).run();
  db.prepare(`INSERT INTO fichas_sessao_manobras VALUES (800,3,'X','PROCEDIMENTOS','7',1,NULL,NULL)`).run();
  db.exec(sql0587);
}

const NR_ITEM = 602; // terceiro NOTECHS
const base = {
  motivo: 'Elemento NOTECHS registrado como NR em ficha aprovada; reavaliação com evidência.',
  fundamento_normativo: 'PTO Rev.10 V18 item 4.2',
  evidencia_nova: 'Gravação do debriefing e parecer do CRM',
  itens: [{ ficha_manobra_id: NR_ITEM, resultado_retificado: '8' }],
};

describe('0587 fichas_sessao_retificacoes', () => {
  let d1: ReturnType<typeof makeDb>;
  let app: Hono;
  beforeEach(() => {
    d1 = makeDb();
    authorizedFichaIds.length = 0;
    bootstrap(d1.database);
    app = new Hono();
    app.use('*', async (c, next) => {
      const ctx = c as unknown as { set: (k: string, v: unknown) => void };
      ctx.set('userId', c.req.header('x-user') || '900');
      ctx.set('empresaId', c.req.header('x-empresa') || '6');
      ctx.set('userRole', c.req.header('x-role') || 'ADMIN');
      await next();
    });
    app.route('/', retificacoes);
  });
  const call = (path: string, body: unknown, headers: Record<string, string> = {}, method = 'POST') =>
    app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: method === 'GET' ? undefined : JSON.stringify(body) }, { DB: d1 } as never);
  const snapshotOriginal = () => JSON.stringify([
    d1.database.prepare('SELECT * FROM fichas_sessao WHERE id=1').all(),
    d1.database.prepare('SELECT * FROM fichas_sessao_manobras WHERE ficha_id=1 ORDER BY id').all(),
  ]);

  it('migration é idempotente, aditiva e sem DROP/RENAME', () => {
    expect(() => d1.database.exec(sql0587)).not.toThrow();
    expect(sql0587).not.toMatch(/\bDROP\s+TABLE\b|\bRENAME\s+TO\b/i);
  });

  it('fluxo completo: solicita → aprova → instrutor e aluno assinam → conclui sem tocar a ficha original', async () => {
    const before = snapshotOriginal();
    const r1 = await call('/fichas/1/retificacoes', base, { 'x-user': '900' });
    expect(r1.status).toBe(201);
    const id = (await r1.json() as { data: { id: number } }).data.id;

    expect((await call(`/retificacoes/${id}/assinar`, { tipo: 'INSTRUTOR' }, { 'x-user': '100' })).status).toBe(409); // antes da decisão
    const same = await call(`/retificacoes/${id}/decisao`, { decisao: 'APROVAR', observacao: 'Parecer favorável do RT' }, { 'x-user': '900' });
    expect(same.status).toBe(403); // decisor = solicitante
    const ok = await call(`/retificacoes/${id}/decisao`, { decisao: 'APROVAR', observacao: 'Parecer favorável do RT' }, { 'x-user': '901' });
    expect(ok.status).toBe(200);

    // Admin NÃO assina pelo instrutor; usuário errado também não
    expect((await call(`/retificacoes/${id}/assinar`, { tipo: 'INSTRUTOR' }, { 'x-user': '901', 'x-role': 'ADMIN' })).status).toBe(403);
    expect((await call(`/retificacoes/${id}/assinar`, { tipo: 'INSTRUTOR' }, { 'x-user': '102', 'x-role': 'INSTRUTOR' })).status).toBe(403);
    expect((await call(`/retificacoes/${id}/assinar`, { tipo: 'INSTRUTOR' }, { 'x-user': '100', 'x-role': 'INSTRUTOR' })).status).toBe(200);
    expect((await call(`/retificacoes/${id}/assinar`, { tipo: 'INSTRUTOR' }, { 'x-user': '100', 'x-role': 'INSTRUTOR' })).status).toBe(409);
    const fin = await call(`/retificacoes/${id}/assinar`, { tipo: 'ALUNO' }, { 'x-user': '101', 'x-role': 'ALUNO' });
    expect(fin.status).toBe(200);
    const data = (await fin.json() as { data: { status: string; resultado_final_retificado: string } }).data;
    expect(data).toMatchObject({ status: 'CONCLUIDA', resultado_final_retificado: 'APROVADO' });
    expect(snapshotOriginal()).toBe(before);

    // concluída é imutável e não pode ser apagada
    expect(() => d1.database.exec(`UPDATE fichas_sessao_retificacoes SET motivo='x' WHERE id=${id}`)).toThrow(/ESTADO_TERMINAL/);
    expect(() => d1.database.exec(`DELETE FROM fichas_sessao_retificacoes WHERE id=${id}`)).toThrow(/APPEND_ONLY/);
    expect(() => d1.database.exec(`UPDATE fichas_sessao_retificacoes_itens SET resultado_retificado='1'`)).toThrow(/IMUTAVEIS/);
  });

  it('rejeita NR em NOTECHS, item de outra ficha, sem mudança, textos curtos e item duplicado', async () => {
    const bad = (patch: object) => call('/fichas/1/retificacoes', { ...base, ...patch });
    expect((await bad({ itens: [{ ficha_manobra_id: NR_ITEM, resultado_retificado: 'NR' }] })).status).toBe(400);
    expect((await bad({ itens: [{ ficha_manobra_id: NR_ITEM, resultado_retificado: '11' }] })).status).toBe(400);
    expect((await bad({ itens: [{ ficha_manobra_id: 700, resultado_retificado: '8' }] })).status).toBe(400);
    expect((await bad({ itens: [{ ficha_manobra_id: 500, resultado_retificado: '8' }] })).status).toBe(400); // sem mudança
    expect((await bad({ motivo: 'curto' })).status).toBe(400);
    expect((await bad({ itens: [{ ficha_manobra_id: NR_ITEM, resultado_retificado: '8' }, { ficha_manobra_id: NR_ITEM, resultado_retificado: '9' }] })).status).toBe(400);
  });

  it('exige ficha assinada, isola tenant e permite uma só retificação em andamento', async () => {
    expect((await call('/fichas/2/retificacoes', { ...base, itens: [{ ficha_manobra_id: 700, resultado_retificado: '9' }] })).status).toBe(409);
    expect((await call('/fichas/3/retificacoes', base)).status).toBe(404); // outro tenant
    expect((await call('/fichas/1/retificacoes', base)).status).toBe(201);
    expect((await call('/fichas/1/retificacoes', base)).status).toBe(409);
    expect((await call('/fichas/1/retificacoes', base, { 'x-user': '102', 'x-role': 'INSTRUTOR' })).status).toBe(403);
  });

  it('retificação que continua abaixo do mínimo conclui como REPROVADO (regra de aprovação reaplicada)', async () => {
    const r = await call('/fichas/1/retificacoes', { ...base, itens: [{ ficha_manobra_id: NR_ITEM, resultado_retificado: '4' }] });
    const id = (await r.json() as { data: { id: number } }).data.id;
    await call(`/retificacoes/${id}/decisao`, { decisao: 'APROVAR', observacao: 'Parecer do RT registrado' }, { 'x-user': '901' });
    await call(`/retificacoes/${id}/assinar`, { tipo: 'INSTRUTOR' }, { 'x-user': '100', 'x-role': 'INSTRUTOR' });
    const fin = await call(`/retificacoes/${id}/assinar`, { tipo: 'ALUNO' }, { 'x-user': '101', 'x-role': 'ALUNO' });
    expect((await fin.json() as { data: { resultado_final_retificado: string } }).data.resultado_final_retificado).toBe('REPROVADO');
  });

  it('triggers do banco bloqueiam inserção em ficha não assinada e conclusão sem assinaturas', () => {
    const ins = (f: number) => d1.database.prepare(
      `INSERT INTO fichas_sessao_retificacoes (empresa_id,ficha_id,motivo,fundamento_normativo,evidencia_nova,snapshot_original_sha256,snapshot_original_json,solicitante_usuario_id)
       VALUES (6,${f},'${'m'.repeat(20)}','${'f'.repeat(10)}','${'e'.repeat(10)}','${'a'.repeat(64)}','{}','900')`).run();
    expect(() => ins(2)).toThrow(/NAO_ASSINADA/);
    ins(1);
    expect(() => d1.database.exec(`UPDATE fichas_sessao_retificacoes SET status='CONCLUIDA' WHERE ficha_id=1`)).toThrow(/TRANSICAO_INVALIDA/);
    d1.database.exec(`UPDATE fichas_sessao_retificacoes SET status='APROVADA', decisao_usuario_id='901', decisao_em='t' WHERE ficha_id=1`);
    expect(() => d1.database.exec(`UPDATE fichas_sessao_retificacoes SET status='CONCLUIDA' WHERE ficha_id=1`)).toThrow(/ASSINATURAS_INCOMPLETAS/);
  });

  it('cancelar libera nova solicitação; terminal não reabre', async () => {
    const r = await call('/fichas/1/retificacoes', base);
    const id = (await r.json() as { data: { id: number } }).data.id;
    expect((await call(`/retificacoes/${id}/cancelar`, {})).status).toBe(200);
    expect((await call(`/retificacoes/${id}/cancelar`, {})).status).toBe(409);
    expect((await call('/fichas/1/retificacoes', base)).status).toBe(201);
  });

  it('rotas /retificacoes/:id autorizam sobre a ficha referenciada, nunca sobre o id da retificação', async () => {
    // retificação #1 cancelada; a #2 é da ficha 1 → id da retificação (2) ≠ id da ficha (1)
    const id1 = (await (await call('/fichas/1/retificacoes', base)).json() as { data: { id: number } }).data.id;
    await call(`/retificacoes/${id1}/cancelar`, {});
    const id2 = (await (await call('/fichas/1/retificacoes', base)).json() as { data: { id: number } }).data.id;
    expect(id2).not.toBe(1);
    authorizedFichaIds.length = 0;

    expect((await call(`/retificacoes/${id2}`, null, {}, 'GET')).status).toBe(200);
    await call(`/retificacoes/${id2}/decisao`, { decisao: 'APROVAR', observacao: 'Parecer favorável do RT' }, { 'x-user': '901' });
    await call(`/retificacoes/${id2}/assinar`, { tipo: 'INSTRUTOR' }, { 'x-user': '100', 'x-role': 'INSTRUTOR' });
    expect(authorizedFichaIds.length).toBe(3);
    expect(authorizedFichaIds.every((f) => f === 1)).toBe(true);
    // rota por ficha continua usando o :id da ficha
    authorizedFichaIds.length = 0;
    await call('/fichas/1/retificacoes', null, {}, 'GET');
    expect(authorizedFichaIds).toEqual([1]);
  });

  it('retificação inexistente ou de outro tenant → 404 antes da autorização', async () => {
    const id = (await (await call('/fichas/1/retificacoes', base)).json() as { data: { id: number } }).data.id;
    authorizedFichaIds.length = 0;
    expect((await call(`/retificacoes/${id}`, null, { 'x-empresa': '7' }, 'GET')).status).toBe(404);
    expect((await call('/retificacoes/9999/decisao', { decisao: 'APROVAR', observacao: 'Parecer favorável do RT' })).status).toBe(404);
    expect(authorizedFichaIds).toEqual([]);
  });

  it('falha ao persistir a 2ª assinatura é atômica: nada é gravado pela metade e o retry conclui', async () => {
    const id = (await (await call('/fichas/1/retificacoes', base)).json() as { data: { id: number } }).data.id;
    await call(`/retificacoes/${id}/decisao`, { decisao: 'APROVAR', observacao: 'Parecer favorável do RT' }, { 'x-user': '901' });
    await call(`/retificacoes/${id}/assinar`, { tipo: 'INSTRUTOR' }, { 'x-user': '100', 'x-role': 'INSTRUTOR' });

    const realBatch = d1.batch.bind(d1);
    let falhou = false;
    d1.batch = async (stmts: Stmt[]) => {
      if (!falhou) { falhou = true; throw new Error('simulated D1 failure'); }
      return realBatch(stmts);
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r1 = await call(`/retificacoes/${id}/assinar`, { tipo: 'ALUNO' }, { 'x-user': '101', 'x-role': 'ALUNO' });
    errSpy.mockRestore();
    expect(r1.status).toBe(500);
    const meio = d1.database.prepare(`SELECT status, assinatura_aluno_usuario_id a FROM fichas_sessao_retificacoes WHERE id=${id}`).get() as { status: string; a: string | null };
    expect(meio).toEqual({ status: 'APROVADA', a: null });

    const r2 = await call(`/retificacoes/${id}/assinar`, { tipo: 'ALUNO' }, { 'x-user': '101', 'x-role': 'ALUNO' });
    expect(r2.status).toBe(200);
    expect((await r2.json() as { data: { status: string } }).data.status).toBe('CONCLUIDA');
  });
});

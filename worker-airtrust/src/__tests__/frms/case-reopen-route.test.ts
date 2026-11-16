import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

// O RBAC real depende de overrides em D1; aqui só a regra de papel é reproduzida para exercitar a rota
// de verdade (tenant, validação, SQL e auditoria) sobre SQLite.
vi.mock('../../middleware/rbac', () => ({
  requirePermission: (_modulo: string, _acao: string, ...roles: string[]) =>
    async (c: { get: (key: string) => unknown; json: (body: unknown, status: number) => Response }, next: () => Promise<void>) => {
      if (!roles.includes(String(c.get('userRole')))) return c.json({ success: false, code: 'RBAC_FORBIDDEN' }, 403);
      await next();
      return undefined;
    },
}));

import frmsCaseRoutes from '../../routes/frms-cases';
import { buildFrmsCaseResolutionNotes } from '../../lib/frms/case-resolution';

const Db = createRequire(import.meta.url)('node:sqlite').DatabaseSync as { new (s: string): DatabaseSync };
const opened: DatabaseSync[] = [];

const closedNotes = buildFrmsCaseResolutionNotes({
  responsavel: 'Coordenação', prazo: '2026-11-10', acao_mitigacao: 'Reprogramar a escala do período.',
  justificativa: 'Medida definida após o alerta.', avaliacao_eficacia: 'Eficácia verificada na escala seguinte.',
}, 'gestor-1')!;

function setup() {
  const sqlite = new Db(':memory:');
  opened.push(sqlite);
  sqlite.exec([
    'CREATE TABLE funcionarios(id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT, ativo INTEGER DEFAULT 1, status TEXT DEFAULT "ATIVO")',
    `CREATE TABLE frms_alerta(id TEXT PRIMARY KEY, tripulante_id INTEGER, resolvido INTEGER DEFAULT 0, resolvido_em TEXT,
      resolvido_por TEXT, notas_resolucao TEXT, deleted_at TEXT, updated_at TEXT)`,
    'CREATE TABLE auditoria_avancada_v2(tabela TEXT, acao TEXT, registro_id TEXT, dados_anteriores TEXT, dados_novos TEXT)',
    'INSERT INTO funcionarios(id, empresa_id) VALUES (101, 7), (201, 8)',
  ].join(';') + ';');
  const insert = sqlite.prepare('INSERT INTO frms_alerta(id, tripulante_id, resolvido, notas_resolucao) VALUES (?,?,?,?)');
  insert.run('fechado7', 101, 1, closedNotes);
  insert.run('aberto7', 101, 0, null);
  insert.run('fechado8', 201, 1, closedNotes);
  const DB = {
    prepare(sql: string) {
      const make = (args: unknown[]) => ({
        bind: (...next: unknown[]) => make(next),
        async first() { return sqlite.prepare(sql).get(...args as []) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...args as []) }; },
        async run() { const r = sqlite.prepare(sql).run(...args as []); return { success: true, meta: { changes: Number(r.changes) } }; },
      });
      return make([]);
    },
  };
  const app = new Hono();
  app.use('*', async (c, next) => {
    const empresa = c.req.header('x-empresa');
    if (empresa) c.set('tenantContext' as never, { empresaId: Number(empresa) } as never);
    c.set('userRole' as never, (c.req.header('x-role') ?? 'viewer') as never);
    c.set('userId' as never, 'gestor-2' as never);
    await next();
  });
  app.route('/api/frms', frmsCaseRoutes);
  const reopen = (id: string, body: unknown, headers: Record<string, string>) =>
    app.request(`/api/frms/alertas/${id}/reabrir`, {
      method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers },
    }, { DB } as never);
  const row = (id: string) => sqlite.prepare('SELECT * FROM frms_alerta WHERE id = ?').get(id) as Record<string, unknown>;
  const audits = () => sqlite.prepare('SELECT acao, registro_id FROM auditoria_avancada_v2').all();
  return { reopen, row, audits };
}
afterEach(() => { for (const db of opened.splice(0)) db.close(); });

const manager = { 'x-role': 'manager', 'x-empresa': '7' };
const justificativa = 'Reincidência após a mitigação registrada.';

describe('PUT /api/frms/alertas/:id/reabrir', () => {
  it('gestor reabre caso encerrado da própria empresa; resolução anterior e auditoria ficam preservadas', async () => {
    const { reopen, row, audits } = setup();
    const response = await reopen('fechado7', { justificativa }, manager);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, status: 'REABERTO' });
    expect(row('fechado7')).toMatchObject({ resolvido: 0, resolvido_em: null, resolvido_por: null });
    const notes = JSON.parse(String(row('fechado7').notas_resolucao));
    expect(notes).toMatchObject({ schema: 'FRMS_CASE_REOPENED_V1', justificativa, reaberto_por: 'gestor-2' });
    expect(notes.historico[0]).toMatchObject({ schema: 'FRMS_CASE_RESOLUTION_V1', responsavel: 'Coordenação' });
    expect(audits()).toEqual([{ acao: 'REABERTO', registro_id: 'fechado7' }]);
  });

  it('exige justificativa; não altera o caso nem audita', async () => {
    const { reopen, row, audits } = setup();
    const response = await reopen('fechado7', { justificativa: 'curta' }, manager);
    expect(response.status).toBe(400);
    expect((await response.json() as { code: string }).code).toBe('FRMS_CASE_REOPEN_JUSTIFICATION_REQUIRED');
    expect(row('fechado7').resolvido).toBe(1);
    expect(audits()).toEqual([]);
  });

  it('caso aberto não pode ser reaberto', async () => {
    const { reopen } = setup();
    const response = await reopen('aberto7', { justificativa }, manager);
    expect(response.status).toBe(409);
    expect((await response.json() as { code: string }).code).toBe('FRMS_CASE_NOT_CLOSED');
  });

  it('caso de outra empresa é recusado e permanece encerrado', async () => {
    const { reopen, row, audits } = setup();
    const response = await reopen('fechado8', { justificativa }, manager);
    expect(response.status).not.toBe(200);
    expect(row('fechado8').resolvido).toBe(1);
    expect(audits()).toEqual([]);
  });

  it('papel sem permissão e requisição sem contexto de empresa são recusados', async () => {
    const { reopen, row } = setup();
    expect((await reopen('fechado7', { justificativa }, { 'x-role': 'viewer', 'x-empresa': '7' })).status).toBe(403);
    expect((await reopen('fechado7', { justificativa }, { 'x-role': 'manager' })).status).toBe(403);
    expect(row('fechado7').resolvido).toBe(1);
  });
});

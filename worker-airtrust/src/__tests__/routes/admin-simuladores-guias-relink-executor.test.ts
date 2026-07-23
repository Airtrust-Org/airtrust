import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 99);
    c.set('userRole', String(c.env?.__mockRole ?? 'admin'));
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    (...roles: string[]) =>
    async (c: any, next: () => Promise<void>) => {
      const role = String(c.get('userRole') || '').toLowerCase();
      if (!roles.includes(role)) return c.json({ success: false, error: 'forbidden' }, 403);
      await next();
    },
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: any) => ({ empresaId: Number(c.env?.__mockEmpresaId ?? 6) }),
}));

import executorRoutes from '../../routes/admin-simuladores-guias-relink-executor';

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/x', executorRoutes);
  return app;
}

type Guide = {
  id: number;
  codigo: string;
  programa: string;
  ciclo: number | null;
  sessao_numero: number | null;
  sessao_total: number | null;
  deleted_at: string | null;
  aeronave: string;
  status: string;
};
type CurrentModel = {
  modelo_id: number;
  codigo_canonico: string;
  is_current: number;
  versao_matriz: string;
};
type Link = {
  id: number;
  empresa_id: number;
  guia_id: number;
  modelo_sessao_id: number;
  principal: number;
  ordem: number;
  deleted_at: string | null;
};
type RelinkRow = {
  id: number;
  uuid: string;
  empresa_id: number;
  versao_matriz: string;
  status: string;
  expected_hash: string;
  expected_counts_json: string;
  applied_at: string | null;
  rolled_back_at: string | null;
  rollback_uuid: string | null;
};
type ChangeRow = {
  id: number;
  relink_id: number;
  guia_id: number;
  modelo_sessao_id: number | null;
  operacao: string;
  before_json: string | null;
  after_json: string | null;
};

const EMPRESA_ID = 6;
const VERSAO = 'M2026.07';

// Matches the real distribution the executor asserts on: 30 AW139 + 21 SK76
// (51 total). The matching policy itself (resolveGuiaLinks) already has
// dedicated coverage in matriz-guia-relink.test.ts / matriz-guia-resolution.test.ts;
// here every session/guia uses a trivially-matching exact codigo_canonico.
// Function declarations (unlike `const`) are hoisted with their body intact,
// so they remain safe to call from the vi.mock(...) factory below, which
// Vitest hoists above every top-level statement in this file — a top-level
// `const AW139_COUNT = 30` referenced from inside that factory would still
// throw a TDZ ReferenceError, so the counts are inlined as literals here.
function sessionCode(aircraft: 'AW139' | 'SK76', i: number, total: number) {
  return aircraft === 'AW139'
    ? `A139-I-${String(i + 1).padStart(2, '0')}/${total}`
    : `SK76-I-${String(i + 1).padStart(2, '0')}/${total}`;
}

function buildContract() {
  const aw139 = Array.from({ length: 30 }, (_, i) => ({
    codigo_canonico: sessionCode('AW139', i, 30),
    aeronave: 'AW139',
    programa: 'INICIAL',
    ciclo: null,
    html_relpath: `AW139/html/G_Inicial_Sessao_${i + 1}_de_30.html`,
  }));
  const sk76 = Array.from({ length: 21 }, (_, i) => ({
    codigo_canonico: sessionCode('SK76', i, 21),
    aeronave: 'SK76',
    programa: 'INICIAL',
    ciclo: null,
    html_relpath: `SK76/html/G_Inicial_Sessao_${i + 1}_de_21.html`,
  }));
  return { sessions: [...aw139, ...sk76] };
}

const AW139_COUNT = 30;
const SK76_COUNT = 21;
const TOTAL = AW139_COUNT + SK76_COUNT;

vi.mock('../../../data/simuladores-matriz/session-contract-51.json', () => ({
  default: buildContract(),
}));

function buildFixture() {
  const contract = buildContract();
  const guides: Guide[] = contract.sessions.map((s, i) => ({
    id: i + 1,
    codigo: s.codigo_canonico,
    programa: 'INICIAL',
    ciclo: null,
    sessao_numero: null,
    sessao_total: null,
    deleted_at: null,
    aeronave: s.aeronave,
    status: 'ATIVO',
  }));
  const currentModels: CurrentModel[] = guides.map((g, i) => ({
    modelo_id: 200 + i,
    codigo_canonico: g.codigo,
    is_current: 1,
    versao_matriz: VERSAO,
  }));
  // Every guia starts linked to a stale historical model (100+i), as if
  // never migrated yet.
  const links: Link[] = guides.map((g, i) => ({
    id: i + 1,
    empresa_id: EMPRESA_ID,
    guia_id: g.id,
    modelo_sessao_id: 100 + i,
    principal: 1,
    ordem: 1,
    deleted_at: null,
  }));
  return { guides, currentModels, links };
}

function createHarness(opts: {
  migrationsPresent?: boolean;
  guides: Guide[];
  currentModels: CurrentModel[];
  links: Link[];
}) {
  const migrationsPresent = opts.migrationsPresent ?? true;
  const guides = opts.guides;
  const currentModels = opts.currentModels;
  let links: Link[] = opts.links.map((l) => ({ ...l }));
  let relinkRows: RelinkRow[] = [];
  let changeRows: ChangeRow[] = [];
  let nextLinkId = Math.max(0, ...links.map((l) => l.id)) + 1;
  let nextRelinkId = 1;
  let nextChangeId = 1;
  let batchCallCount = 0;

  function findRelink(uuid: string, empresaId: number) {
    return relinkRows.find((r) => r.uuid === uuid && r.empresa_id === empresaId);
  }

  function respondAll(sql: string, args: unknown[]): unknown[] {
    if (sql.includes('sqlite_master')) {
      return migrationsPresent
        ? [
            { name: 'simuladores_matriz_guia_relink' },
            { name: 'simuladores_matriz_guia_relink_changes' },
          ]
        : [];
    }
    if (sql.includes('FROM simuladores_guias_instrutor g')) {
      return guides.filter((g) => !g.deleted_at && g.status === 'ATIVO');
    }
    if (sql.includes('FROM modelos_sessao_versionamento') && sql.includes('is_current=1')) {
      const versaoMatriz = args[1];
      return currentModels.filter((m) => m.is_current === 1 && m.versao_matriz === versaoMatriz);
    }
    if (sql.includes('FROM simuladores_modelos_sessao_guias') && sql.includes('guia_id IN')) {
      const ids = args.slice(1).map(Number);
      return links.filter((l) => !l.deleted_at && ids.includes(l.guia_id));
    }
    if (sql.startsWith('SELECT uuid,status,expected_hash FROM simuladores_matriz_guia_relink')) {
      const [uuid, empresaId] = args as [string, number];
      const row = findRelink(uuid, empresaId);
      return row ? [row] : [];
    }
    if (sql.startsWith('SELECT * FROM simuladores_matriz_guia_relink WHERE uuid=')) {
      const [uuid, empresaId] = args as [string, number];
      const row = findRelink(uuid, empresaId);
      return row ? [row] : [];
    }
    if (
      sql.includes('FROM simuladores_matriz_guia_relink_changes') &&
      sql.includes('operacao IN')
    ) {
      const [relinkId] = args as [number];
      return changeRows.filter(
        (c) =>
          c.relink_id === relinkId &&
          (c.operacao === 'GUIDE_LINK_DEACTIVATE' || c.operacao === 'GUIDE_LINK_INSERT'),
      );
    }
    if (
      sql.startsWith('SELECT id FROM simuladores_modelos_sessao_guias') &&
      sql.includes('deleted_at IS NULL')
    ) {
      const [empresaId, guiaId] = args as [number, number];
      return links.filter(
        (l) => l.empresa_id === empresaId && l.guia_id === guiaId && !l.deleted_at,
      );
    }
    if (
      sql.startsWith('SELECT modelo_sessao_id FROM simuladores_modelos_sessao_guias WHERE id=?1')
    ) {
      const [id] = args as [number];
      const row = links.find((l) => l.id === id);
      return row ? [{ modelo_sessao_id: row.modelo_sessao_id }] : [];
    }
    return [];
  }

  function num(re: RegExp, sql: string): number | undefined {
    const m = sql.match(re);
    return m ? Number(m[1]) : undefined;
  }
  function str(re: RegExp, sql: string): string | undefined {
    const m = sql.match(re);
    return m ? m[1] : undefined;
  }

  function resolveRelinkIdExpr(sql: string): number | undefined {
    const uuid = str(/uuid='([^']*)' AND empresa_id=(\d+)\)/, sql);
    const empresaId = num(/uuid='[^']*' AND empresa_id=(\d+)\)/, sql);
    if (uuid == null || empresaId == null) return undefined;
    return findRelink(uuid, empresaId)?.id;
  }

  function runAppliedAssertions(row: RelinkRow) {
    const insertedGuiaIds = changeRows
      .filter((c) => c.relink_id === row.id && c.operacao === 'GUIDE_LINK_INSERT')
      .map((c) => c.guia_id);
    if (insertedGuiaIds.length === 0)
      throw new Error('guia relink assertion: nenhum vínculo inserido');
    const expectedTotal = JSON.parse(row.expected_counts_json).total;
    const activeForInserted = links.filter(
      (l) =>
        !l.deleted_at && l.empresa_id === row.empresa_id && insertedGuiaIds.includes(l.guia_id),
    );
    if (activeForInserted.length !== expectedTotal) {
      throw new Error('guia relink assertion: total de vínculos ativos diverge do esperado');
    }
    const byGuia = new Map<number, number>();
    for (const l of activeForInserted) byGuia.set(l.guia_id, (byGuia.get(l.guia_id) || 0) + 1);
    if ([...byGuia.values()].some((c) => c !== 1))
      throw new Error('guia relink assertion: guia sem vínculo ativo único');
    const byModel = new Map<number, number>();
    for (const l of activeForInserted)
      byModel.set(l.modelo_sessao_id, (byModel.get(l.modelo_sessao_id) || 0) + 1);
    if ([...byModel.values()].some((c) => c !== 1))
      throw new Error('guia relink assertion: modelo com mais de um guia principal');
    const historicalModelIds = new Set(
      currentModels
        .filter((m) => m.is_current !== 1 || m.versao_matriz !== row.versao_matriz)
        .map((m) => m.modelo_id),
    );
    if (activeForInserted.some((l) => historicalModelIds.has(l.modelo_sessao_id))) {
      throw new Error('guia relink assertion: vínculo ativo para versão histórica');
    }
  }

  function runRolledBackAssertions(row: RelinkRow) {
    const relinkChanges = changeRows.filter((c) => c.relink_id === row.id);
    for (const c of relinkChanges.filter((c) => c.operacao === 'GUIDE_LINK_INSERT')) {
      const stillActive = links.some(
        (l) =>
          !l.deleted_at &&
          l.empresa_id === row.empresa_id &&
          l.guia_id === c.guia_id &&
          l.modelo_sessao_id === c.modelo_sessao_id,
      );
      if (stillActive)
        throw new Error('guia relink rollback assertion: vínculo inserido pelo relink ainda ativo');
    }
    for (const c of relinkChanges.filter((c) => c.operacao === 'GUIDE_LINK_DEACTIVATE')) {
      const restored = links.some(
        (l) =>
          !l.deleted_at &&
          l.empresa_id === row.empresa_id &&
          l.guia_id === c.guia_id &&
          l.modelo_sessao_id === c.modelo_sessao_id,
      );
      if (!restored)
        throw new Error('guia relink rollback assertion: vínculo anterior não restaurado');
    }
  }

  function applyStatement(sql: string) {
    if (sql.startsWith('INSERT INTO simuladores_matriz_guia_relink(')) {
      const m = sql.match(/VALUES\s*\('([^']*)',(\d+),'([^']*)','APPLYING','([^']*)','([^']*)'\)/);
      if (!m) throw new Error(`harness: insert relink não reconhecido: ${sql}`);
      const [, uuid, empresaId, versaoMatriz, expectedHash, countsJson] = m;
      relinkRows.push({
        id: nextRelinkId++,
        uuid,
        empresa_id: Number(empresaId),
        versao_matriz: versaoMatriz,
        status: 'APPLYING',
        expected_hash: expectedHash,
        expected_counts_json: countsJson,
        applied_at: null,
        rolled_back_at: null,
        rollback_uuid: null,
      });
      return;
    }
    if (sql.startsWith("UPDATE simuladores_matriz_guia_relink SET status='APPLYING'")) {
      // Defensive/dead path in production too: under D1's atomic batch()
      // semantics, an `existing` row with status='APPLYING' can never
      // actually persist (see admin-simuladores-guias-relink-executor.ts),
      // so this statement is never expected to match a row in practice.
      return;
    }
    if (
      sql.startsWith('UPDATE simuladores_modelos_sessao_guias') &&
      sql.includes('deleted_at=CURRENT_TIMESTAMP')
    ) {
      const hasId = /WHERE id=(\d+)/.test(sql);
      const empresaId = num(/empresa_id=(\d+)/, sql)!;
      const guiaId = num(/guia_id=(\d+)/, sql)!;
      const modeloId = num(/modelo_sessao_id=(\d+)/, sql)!;
      if (hasId) {
        const id = num(/WHERE id=(\d+)/, sql)!;
        const link = links.find(
          (l) =>
            l.id === id &&
            l.empresa_id === empresaId &&
            l.guia_id === guiaId &&
            l.modelo_sessao_id === modeloId &&
            !l.deleted_at,
        );
        if (link) link.deleted_at = 'DEACTIVATED'; // CAS miss (drift) silently affects 0 rows, like real SQL.
      } else {
        const link = links.find(
          (l) =>
            l.empresa_id === empresaId &&
            l.guia_id === guiaId &&
            l.modelo_sessao_id === modeloId &&
            !l.deleted_at,
        );
        if (link) link.deleted_at = 'DEACTIVATED';
      }
      return;
    }
    if (
      sql.startsWith('UPDATE simuladores_modelos_sessao_guias') &&
      sql.includes('deleted_at=NULL')
    ) {
      const id = num(/WHERE id=(\d+)/, sql)!;
      const empresaId = num(/empresa_id=(\d+)/, sql)!;
      const guiaId = num(/guia_id=(\d+)/, sql)!;
      const modeloId = num(/modelo_sessao_id=(\d+)/, sql)!;
      const link = links.find(
        (l) =>
          l.id === id &&
          l.empresa_id === empresaId &&
          l.guia_id === guiaId &&
          l.modelo_sessao_id === modeloId,
      );
      if (link) link.deleted_at = null; // exact restore only; no match => silently affects 0 rows.
      return;
    }
    if (
      sql.startsWith('INSERT INTO simuladores_modelos_sessao_guias(') &&
      sql.includes('WHERE NOT EXISTS')
    ) {
      const m = sql.match(/SELECT (\d+),(\d+),(\d+),1,1,/);
      if (!m) throw new Error(`harness: insert link não reconhecido: ${sql}`);
      const [, empresaId, modeloId, guiaId] = m;
      const exists = links.some(
        (l) =>
          !l.deleted_at &&
          l.empresa_id === Number(empresaId) &&
          l.guia_id === Number(guiaId) &&
          l.modelo_sessao_id === Number(modeloId),
      );
      if (!exists) {
        links.push({
          id: nextLinkId++,
          empresa_id: Number(empresaId),
          guia_id: Number(guiaId),
          modelo_sessao_id: Number(modeloId),
          principal: 1,
          ordem: 1,
          deleted_at: null,
        });
      }
      return;
    }
    if (
      sql.startsWith('INSERT INTO simuladores_matriz_guia_relink_changes(') &&
      sql.includes('before_json')
    ) {
      const m = sql.match(
        /VALUES\(.*?,(\d+),(\d+),'GUIDE_LINK_DEACTIVATE',\s*json_object\('id',(\d+),'guia_id',(\d+),'modelo_sessao_id',(\d+)\)\)/s,
      );
      if (!m) throw new Error(`harness: change deactivate não reconhecido: ${sql}`);
      const relinkId = resolveRelinkIdExpr(sql);
      if (relinkId == null) return;
      const [, guiaId, modeloId, linkId] = m;
      changeRows.push({
        id: nextChangeId++,
        relink_id: relinkId,
        guia_id: Number(guiaId),
        modelo_sessao_id: Number(modeloId),
        operacao: 'GUIDE_LINK_DEACTIVATE',
        before_json: JSON.stringify({
          id: Number(linkId),
          guia_id: Number(guiaId),
          modelo_sessao_id: Number(modeloId),
        }),
        after_json: null,
      });
      return;
    }
    if (
      sql.startsWith('INSERT INTO simuladores_matriz_guia_relink_changes(') &&
      sql.includes("'GUIDE_LINK_INSERT'") &&
      sql.includes('WHERE EXISTS')
    ) {
      const m = sql.match(/SELECT .*?,(\d+),(\d+),'GUIDE_LINK_INSERT',/);
      if (!m) throw new Error(`harness: change insert não reconhecido: ${sql}`);
      const [, guiaId, modeloId] = m;
      const relinkId = resolveRelinkIdExpr(sql);
      if (relinkId == null) return;
      const stillActive = links.some(
        (l) =>
          !l.deleted_at && l.guia_id === Number(guiaId) && l.modelo_sessao_id === Number(modeloId),
      );
      if (!stillActive) return; // WHERE EXISTS guard: no row inserted.
      changeRows.push({
        id: nextChangeId++,
        relink_id: relinkId,
        guia_id: Number(guiaId),
        modelo_sessao_id: Number(modeloId),
        operacao: 'GUIDE_LINK_INSERT',
        before_json: null,
        after_json: JSON.stringify({ guia_id: Number(guiaId), modelo_sessao_id: Number(modeloId) }),
      });
      return;
    }
    if (
      sql.startsWith('INSERT INTO simuladores_matriz_guia_relink_changes(') &&
      sql.includes("'GUIDE_LINK_COMPENSATE'")
    ) {
      const relinkId = resolveRelinkIdExpr(sql);
      const m = sql.match(/VALUES\(.*?,(\d+),(\d+),'GUIDE_LINK_COMPENSATE'/);
      if (relinkId != null && m) {
        changeRows.push({
          id: nextChangeId++,
          relink_id: relinkId,
          guia_id: Number(m[1]),
          modelo_sessao_id: Number(m[2]),
          operacao: 'GUIDE_LINK_COMPENSATE',
          before_json: null,
          after_json: '{}',
        });
      }
      return;
    }
    if (
      sql.startsWith('INSERT INTO simuladores_matriz_guia_relink_changes(') &&
      sql.includes("'GUIDE_LINK_RESTORE'")
    ) {
      const relinkId = resolveRelinkIdExpr(sql);
      const m = sql.match(/VALUES\(.*?,(\d+),(\d+),'GUIDE_LINK_RESTORE'/);
      if (relinkId != null && m) {
        changeRows.push({
          id: nextChangeId++,
          relink_id: relinkId,
          guia_id: Number(m[1]),
          modelo_sessao_id: Number(m[2]),
          operacao: 'GUIDE_LINK_RESTORE',
          before_json: null,
          after_json: '{}',
        });
      }
      return;
    }
    if (
      sql.startsWith('UPDATE simuladores_matriz_guia_relink') &&
      sql.includes("SET status='APPLIED'")
    ) {
      const uuid = str(/uuid='([^']*)'/, sql)!;
      const empresaId = num(/empresa_id=(\d+)/, sql)!;
      const row = findRelink(uuid, empresaId);
      if (!row || row.status !== 'APPLYING') return; // WHERE clause CAS: no row matched.
      runAppliedAssertions(row); // BEFORE UPDATE trigger equivalent (migration 0442).
      row.status = 'APPLIED';
      row.applied_at = 'NOW';
      return;
    }
    if (
      sql.startsWith('UPDATE simuladores_matriz_guia_relink') &&
      sql.includes("SET status='ROLLED_BACK'")
    ) {
      // Anchored to "WHERE uuid=", not just "uuid=": the SET clause on this
      // statement also contains "rollback_uuid='...'", whose trailing "uuid="
      // would otherwise be matched first by an unanchored /uuid='([^']*)'/.
      const uuid = str(/WHERE uuid='([^']*)'/, sql)!;
      const empresaId = num(/empresa_id=(\d+)/, sql)!;
      const rollbackUuid = str(/rollback_uuid='([^']*)'/, sql)!;
      const row = findRelink(uuid, empresaId);
      if (!row || row.status !== 'APPLIED') return;
      runRolledBackAssertions(row); // BEFORE UPDATE trigger equivalent (migration 0442).
      row.status = 'ROLLED_BACK';
      row.rolled_back_at = 'NOW';
      row.rollback_uuid = rollbackUuid;
      return;
    }
    throw new Error(`harness: statement não reconhecido: ${sql}`);
  }

  const db = {
    prepare(sql: string) {
      let boundArgs: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          boundArgs = args;
          return stmt;
        },
        async all() {
          return { results: respondAll(sql, boundArgs) };
        },
        async run() {
          return { success: true };
        },
        _sql: sql,
      };
      return stmt;
    },
    async batch(stmts: Array<{ _sql: string }>) {
      batchCallCount += 1;
      const snapshot = {
        links: links.map((l) => ({ ...l })),
        relinkRows: relinkRows.map((r) => ({ ...r })),
        changeRows: changeRows.map((c) => ({ ...c })),
        nextLinkId,
        nextRelinkId,
        nextChangeId,
      };
      try {
        for (const stmt of stmts) applyStatement(stmt._sql);
        return stmts.map(() => ({ success: true }));
      } catch (error) {
        // D1 batch() is one transaction: any failure rolls back every
        // statement already applied in this call.
        links = snapshot.links;
        relinkRows = snapshot.relinkRows;
        changeRows = snapshot.changeRows;
        nextLinkId = snapshot.nextLinkId;
        nextRelinkId = snapshot.nextRelinkId;
        nextChangeId = snapshot.nextChangeId;
        throw error;
      }
    },
  };

  return {
    db: db as unknown as D1Database,
    getLinks: () => links,
    getRelinkRows: () => relinkRows,
    getChangeRows: () => changeRows,
    getBatchCallCount: () => batchCallCount,
  };
}

function baseEnv(overrides: Record<string, unknown> = {}) {
  return {
    ENABLE_SIMULADORES_GUIA_RELINK_EXECUTOR: 'true',
    __mockEmpresaId: EMPRESA_ID,
    ...overrides,
  } as unknown as Env;
}

describe('admin-simuladores-guias-relink-executor: gating', () => {
  it('refuses when the executor is not explicitly enabled', async () => {
    const app = buildApp();
    const { db } = createHarness(buildFixture());
    const env = baseEnv({ ENABLE_SIMULADORES_GUIA_RELINK_EXECUTOR: undefined, DB: db });
    const res = await app.request(
      '/x/dry-run',
      { method: 'POST', body: JSON.stringify({ versao_matriz: VERSAO }) },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error?: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/desabilitado/);
  });

  it('refuses a non-admin role', async () => {
    const app = buildApp();
    const { db } = createHarness(buildFixture());
    const env = baseEnv({ __mockRole: 'manager', DB: db });
    const res = await app.request('/x/dry-run', { method: 'POST', body: '{}' }, env);
    expect(res.status).toBe(403);
  });

  it('refuses a tenant other than empresa_id 6', async () => {
    const app = buildApp();
    const { db } = createHarness(buildFixture());
    const env = baseEnv({ __mockEmpresaId: 8, DB: db });
    const res = await app.request(
      '/x/dry-run',
      { method: 'POST', body: JSON.stringify({ versao_matriz: VERSAO }) },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error?: string };
    expect(body.error).toMatch(/não autorizado/);
  });

  it('fails closed when migration 0442 tables are absent', async () => {
    const app = buildApp();
    const { db } = createHarness({ ...buildFixture(), migrationsPresent: false });
    const env = baseEnv({ DB: db });
    const res = await app.request(
      '/x/dry-run',
      { method: 'POST', body: JSON.stringify({ versao_matriz: VERSAO }) },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error?: string };
    expect(body.error).toMatch(/migration 0442/);
  });
});

describe('admin-simuladores-guias-relink-executor: dry-run', () => {
  it('is read-only and reports totals/ids without touching the database', async () => {
    const app = buildApp();
    const fixture = buildFixture();
    const { db, getLinks } = createHarness(fixture);
    const env = baseEnv({ DB: db });
    const res = await app.request(
      '/x/dry-run',
      { method: 'POST', body: JSON.stringify({ versao_matriz: VERSAO }) },
      env,
    );
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const range = (n: number, start = 0) => Array.from({ length: n }, (_, i) => start + i);
    expect(body.totals).toMatchObject({ total: TOTAL, AW139: AW139_COUNT, 'S-76': SK76_COUNT });
    expect(body.guia_ids).toEqual(range(TOTAL, 1));
    expect(body.modelo_destino_ids).toEqual(range(TOTAL, 200));
    expect(body.vinculo_antigo_ids).toEqual(range(TOTAL, 1));
    expect(typeof body.hash).toBe('string');
    expect(body.hash).toHaveLength(64);
    // No stale link was touched by dry-run.
    expect(getLinks().every((l) => l.deleted_at === null)).toBe(true);
    expect(getLinks()).toHaveLength(TOTAL);
  });

  it('produces the same hash on repeated calls against unchanged state', async () => {
    const app = buildApp();
    const { db } = createHarness(buildFixture());
    const env = baseEnv({ DB: db });
    const res1 = await app.request(
      '/x/dry-run',
      { method: 'POST', body: JSON.stringify({ versao_matriz: VERSAO }) },
      env,
    );
    const res2 = await app.request(
      '/x/dry-run',
      { method: 'POST', body: JSON.stringify({ versao_matriz: VERSAO }) },
      env,
    );
    const [b1, b2] = (await Promise.all([res1.json(), res2.json()])) as any[];
    expect(b1.hash).toBe(b2.hash);
  });
});

describe('admin-simuladores-guias-relink-executor: apply', () => {
  async function dryRun(app: ReturnType<typeof buildApp>, env: Env) {
    const res = await app.request(
      '/x/dry-run',
      { method: 'POST', body: JSON.stringify({ versao_matriz: VERSAO }) },
      env,
    );
    return (await res.json()) as { hash: string };
  }

  it('applies atomically: deactivates stale links, creates the 3 new ones, marks APPLIED', async () => {
    const app = buildApp();
    const fixture = buildFixture();
    const { db, getLinks, getRelinkRows, getBatchCallCount } = createHarness(fixture);
    const env = baseEnv({ DB: db });
    const { hash } = await dryRun(app, env);

    const res = await app.request(
      '/x/apply',
      {
        method: 'POST',
        body: JSON.stringify({ import_uuid: 'g1', versao_matriz: VERSAO, expected_hash: hash }),
      },
      env,
    );
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, status: 'APPLIED' });
    expect(getBatchCallCount()).toBe(1);

    const active = getLinks().filter((l) => !l.deleted_at);
    expect(active).toHaveLength(TOTAL);
    expect(active.map((l) => l.modelo_sessao_id).sort((a, b) => a - b)).toEqual(
      Array.from({ length: TOTAL }, (_, i) => 200 + i),
    );
    const stale = getLinks().filter((l) => l.id <= TOTAL);
    expect(stale.every((l) => l.deleted_at !== null)).toBe(true);
    expect(getRelinkRows()[0].status).toBe('APPLIED');
  });

  it('never touches matriz/manobras/sessoes tables — only simuladores_modelos_sessao_guias and its own audit', async () => {
    const app = buildApp();
    const fixture = buildFixture();
    const { db } = createHarness(fixture);
    const env = baseEnv({ DB: db });
    const { hash } = await dryRun(app, env);
    let captured: string[] = [];
    const originalBatch = (db as any).batch.bind(db);
    (db as any).batch = async (stmts: Array<{ _sql: string }>) => {
      captured = stmts.map((s) => s._sql);
      return originalBatch(stmts);
    };
    await app.request(
      '/x/apply',
      {
        method: 'POST',
        body: JSON.stringify({ import_uuid: 'g2', versao_matriz: VERSAO, expected_hash: hash }),
      },
      env,
    );
    const forbidden =
      /modelos_sessao\b|modelos_sessao_manobras|modelos_sessao_versionamento|\bmanobras\b|simuladores_matriz_manobra_resolution|simuladores_matriz_imports\b/;
    for (const sql of captured) {
      expect(sql).not.toMatch(forbidden);
    }
  });

  it('rejects CAS when the target model stopped being current between dry-run and apply', async () => {
    const app = buildApp();
    const fixture = buildFixture();
    const { db } = createHarness(fixture);
    const env = baseEnv({ DB: db });
    const { hash } = await dryRun(app, env);
    fixture.currentModels[0].is_current = 0; // drift after dry-run: model stopped being current
    const res = await app.request(
      '/x/apply',
      {
        method: 'POST',
        body: JSON.stringify({ import_uuid: 'g3', versao_matriz: VERSAO, expected_hash: hash }),
      },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    // Recomputing the live plan fails closed either as an explicit CAS
    // mismatch or, when the drift removes a target model entirely, as
    // "nenhuma versão corrente" from buildGuiaRelinkPlan itself — both are
    // the same fail-closed outcome: no apply proceeds.
    expect(body.error).toMatch(/CAS|nenhuma versão corrente/);
  });

  it('rejects CAS when a stale link changed between dry-run and apply', async () => {
    const app = buildApp();
    const fixture = buildFixture();
    const { db, getLinks } = createHarness(fixture);
    const env = baseEnv({ DB: db });
    const { hash } = await dryRun(app, env);
    // Mutate the harness's own (cloned) link state, not the original fixture
    // array — the harness clones links at creation time, so this is the only
    // way to simulate drift that happens *after* the dry-run already ran.
    getLinks()[0].modelo_sessao_id = 999;
    const res = await app.request(
      '/x/apply',
      {
        method: 'POST',
        body: JSON.stringify({ import_uuid: 'g4', versao_matriz: VERSAO, expected_hash: hash }),
      },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/CAS/);
  });

  it('second apply with the same import_uuid and hash is idempotent (no new batch call)', async () => {
    const app = buildApp();
    const fixture = buildFixture();
    const { db, getBatchCallCount } = createHarness(fixture);
    const env = baseEnv({ DB: db });
    const { hash } = await dryRun(app, env);
    await app.request(
      '/x/apply',
      {
        method: 'POST',
        body: JSON.stringify({ import_uuid: 'g5', versao_matriz: VERSAO, expected_hash: hash }),
      },
      env,
    );
    expect(getBatchCallCount()).toBe(1);
    const res2 = await app.request(
      '/x/apply',
      {
        method: 'POST',
        body: JSON.stringify({ import_uuid: 'g5', versao_matriz: VERSAO, expected_hash: hash }),
      },
      env,
    );
    const body2 = (await res2.json()) as any;
    expect(body2).toMatchObject({ success: true, idempotent: true, status: 'APPLIED' });
    expect(getBatchCallCount()).toBe(1); // no second batch executed
  });

  it('rejects the same import_uuid reused with a different expected_hash', async () => {
    const app = buildApp();
    const fixture = buildFixture();
    const { db } = createHarness(fixture);
    const env = baseEnv({ DB: db });
    const { hash } = await dryRun(app, env);
    await app.request(
      '/x/apply',
      {
        method: 'POST',
        body: JSON.stringify({ import_uuid: 'g6', versao_matriz: VERSAO, expected_hash: hash }),
      },
      env,
    );
    const res = await app.request(
      '/x/apply',
      {
        method: 'POST',
        body: JSON.stringify({
          import_uuid: 'g6',
          versao_matriz: VERSAO,
          expected_hash: 'x'.repeat(64),
        }),
      },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/hash diferente/);
  });

  it('requires the flag, admin role, and empresa_id 6', async () => {
    const app = buildApp();
    const { db } = createHarness(buildFixture());
    const envNoFlag = baseEnv({ ENABLE_SIMULADORES_GUIA_RELINK_EXECUTOR: undefined, DB: db });
    const res1 = await app.request(
      '/x/apply',
      {
        method: 'POST',
        body: JSON.stringify({
          import_uuid: 'g7',
          versao_matriz: VERSAO,
          expected_hash: 'x'.repeat(64),
        }),
      },
      envNoFlag,
    );
    expect(res1.status).toBe(400);

    const envWrongTenant = baseEnv({ __mockEmpresaId: 9, DB: db });
    const res2 = await app.request(
      '/x/apply',
      {
        method: 'POST',
        body: JSON.stringify({
          import_uuid: 'g8',
          versao_matriz: VERSAO,
          expected_hash: 'x'.repeat(64),
        }),
      },
      envWrongTenant,
    );
    expect(res2.status).toBe(400);

    const envWrongRole = baseEnv({ __mockRole: 'instructor', DB: db });
    const res3 = await app.request('/x/apply', { method: 'POST', body: '{}' }, envWrongRole);
    expect(res3.status).toBe(403);
  });
});

describe('admin-simuladores-guias-relink-executor: rollback', () => {
  async function applyOnce(app: ReturnType<typeof buildApp>, env: Env, uuid: string) {
    const dr = await app.request(
      '/x/dry-run',
      { method: 'POST', body: JSON.stringify({ versao_matriz: VERSAO }) },
      env,
    );
    const { hash } = (await dr.json()) as { hash: string };
    await app.request(
      '/x/apply',
      {
        method: 'POST',
        body: JSON.stringify({ import_uuid: uuid, versao_matriz: VERSAO, expected_hash: hash }),
      },
      env,
    );
  }

  it('restores exactly the previous links and marks ROLLED_BACK', async () => {
    const app = buildApp();
    const fixture = buildFixture();
    const { db, getLinks, getRelinkRows } = createHarness(fixture);
    const env = baseEnv({ DB: db });
    await applyOnce(app, env, 'r1');

    const res = await app.request(
      '/x/rollback',
      { method: 'POST', body: JSON.stringify({ import_uuid: 'r1' }) },
      env,
    );
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, status: 'ROLLED_BACK' });

    const active = getLinks().filter((l) => !l.deleted_at);
    expect(active.map((l) => l.modelo_sessao_id).sort((a, b) => a - b)).toEqual(
      Array.from({ length: TOTAL }, (_, i) => 100 + i),
    );
    expect(getRelinkRows()[0].status).toBe('ROLLED_BACK');
  });

  it('is idempotent on a second rollback of the same import_uuid', async () => {
    const app = buildApp();
    const fixture = buildFixture();
    const { db } = createHarness(fixture);
    const env = baseEnv({ DB: db });
    await applyOnce(app, env, 'r2');
    await app.request(
      '/x/rollback',
      { method: 'POST', body: JSON.stringify({ import_uuid: 'r2' }) },
      env,
    );
    const res2 = await app.request(
      '/x/rollback',
      { method: 'POST', body: JSON.stringify({ import_uuid: 'r2' }) },
      env,
    );
    const body2 = (await res2.json()) as any;
    expect(body2).toMatchObject({ success: true, idempotent: true, status: 'ROLLED_BACK' });
  });

  it('refuses rollback when a link the relink created was already changed by something else (drift)', async () => {
    const app = buildApp();
    const fixture = buildFixture();
    const { db, getLinks } = createHarness(fixture);
    const env = baseEnv({ DB: db });
    await applyOnce(app, env, 'r3');
    // Simulate an unrelated manual change to one of the new links.
    const link = getLinks().find((l) => l.modelo_sessao_id === 200)!;
    link.deleted_at = 'manual-change';

    const res = await app.request(
      '/x/rollback',
      { method: 'POST', body: JSON.stringify({ import_uuid: 'r3' }) },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/drift/);
  });

  it('permits reapply with a new import_uuid after a rollback', async () => {
    const app = buildApp();
    const fixture = buildFixture();
    const { db, getLinks } = createHarness(fixture);
    const env = baseEnv({ DB: db });
    await applyOnce(app, env, 'r4');
    await app.request(
      '/x/rollback',
      { method: 'POST', body: JSON.stringify({ import_uuid: 'r4' }) },
      env,
    );

    const dr = await app.request(
      '/x/dry-run',
      { method: 'POST', body: JSON.stringify({ versao_matriz: VERSAO }) },
      env,
    );
    const { hash } = (await dr.json()) as { hash: string };
    const res = await app.request(
      '/x/apply',
      {
        method: 'POST',
        body: JSON.stringify({ import_uuid: 'r5-new', versao_matriz: VERSAO, expected_hash: hash }),
      },
      env,
    );
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ success: true, status: 'APPLIED' });
    expect(
      getLinks()
        .filter((l) => !l.deleted_at)
        .map((l) => l.modelo_sessao_id)
        .sort((a, b) => a - b),
    ).toEqual(Array.from({ length: TOTAL }, (_, i) => 200 + i));
  });
});

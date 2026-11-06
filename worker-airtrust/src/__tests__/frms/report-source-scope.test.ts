import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { buildFuncionarioScopeWhere } from '../../middleware/employee-sector-access';
import { buscarAlertas } from '../../lib/frms/db-service-alertas';
import type { EmployeeSectorAccess } from '../../middleware/employee-sector-access';

vi.mock('../../lib/frms/db-service-acumulo', () => ({ buscarAcumuloFrota: vi.fn() }));
import { buscarAcumuloFrota } from '../../lib/frms/db-service-acumulo';
import { relatorioMapaFadiga } from '../../lib/frms/db-service-relatorios';

const restricted: EmployeeSectorAccess = { mode: 'restricted', setorIds: [10], funcionarioId: null };
const self: EmployeeSectorAccess = { mode: 'self', setorIds: [11], funcionarioId: 41 };
const blocked: EmployeeSectorAccess = { mode: 'restricted', setorIds: [], funcionarioId: null };

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

type SqliteValue = string | number | bigint | Uint8Array | null;
function normalizeSqliteValue(value: unknown): SqliteValue {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value as SqliteValue;
}

class SqliteD1Database {
  readonly database = new NodeDatabaseSync(':memory:');

  prepare(sql: string) {
    const database = this.database;
    return {
      bind(...values: unknown[]) {
        const bound = values.map(normalizeSqliteValue);
        return {
          async first<T = Record<string, unknown>>() {
            return (database.prepare(sql).get(...bound) as T | undefined) ?? null;
          },
          async all<T = Record<string, unknown>>() {
            return { results: database.prepare(sql).all(...bound) as T[] };
          },
        };
      },
    };
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}

describe('FRMS report SQL aliases and runtime-scoped reads', () => {
  beforeEach(() => vi.mocked(buscarAcumuloFrota).mockReset());

  it.each([
    ['manager', restricted, 'f.setor_id IN', 'p.setor_id IN', [6, 10]],
    ['self', self, 'f.id = ?', 'p.id = ?', [6, 41]],
    ['denied', blocked, '1 = 0', '1 = 0', [6]],
  ])('%s: SQL for rest uses f alias; fleet exposure uses p alias', async (_role, access, restClause, fleetClause, restArgs) => {
    const db = {
      prepare(sql: string) {
        expect(sql).toContain('f.empresa_id = ?');
        expect(sql).toContain(restClause);
        expect(sql).not.toContain('p.setor_id');
        return {
          bind(...args: unknown[]) {
            expect(args).toEqual(restArgs);
            return {
              all: async () => ({ results: [{ tripulante_id: '41', repouso_anterior_min: null, repouso_suficiente: 1, data_referencia: '2026-10-16' }] }),
            };
          },
        };
      },
    } as unknown as D1Database;
    vi.mocked(buscarAcumuloFrota).mockResolvedValue([{
      tripulante_id: '41', nome: 'Simulado',
      pct_dia: 1, pct_7d: 2, pct_mes: 3, pct_365d: 4, nivel_max: 'OK',
      hv_mes_min: 1, hv_7d_min: 1, hv_365d_min: 1, hv_dia_min: 1,
      data_referencia: '2026-10-12',
    }]);
    const rows = await relatorioMapaFadiga(db, 6, access);
    const scope = vi.mocked(buscarAcumuloFrota).mock.calls[0][5];
    expect(scope).toEqual(buildFuncionarioScopeWhere(access, 'p'));
    expect(scope?.clause).toContain(fleetClause);
    expect(rows[0]).toMatchObject({
      repouso_suficiente: null, repouso_estado: 'DESCONHECIDO',
      repouso_referencia: '2026-10-16', exposicao_referencia: '2026-10-12',
    });
  });

  it('historical alert total and rows use exactly the same current sector filter', async () => {
    const calls: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            calls.push({ sql, args });
            return {
              first: async () => ({ total: 1 }),
              all: async () => ({ results: [{ tripulante_id: '41', nivel: 'ATENCAO' }] }),
            };
          },
        };
      },
    } as unknown as D1Database;
    const result = await buscarAlertas(db, { limit: 20 }, 6, buildFuncionarioScopeWhere(restricted, 'f'));
    expect(result.total).toBe(1);
    expect(result.alertas).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain('f.setor_id IN (?)');
    expect(calls[1].sql).toContain('f.setor_id IN (?)');
    expect(calls[0].args).toEqual(calls[1].args.slice(0, -2));
    expect(calls[0].args).toContain(6);
    expect(calls[0].args).toContain(10);
  });

  it('excludes a tenant A alert linked to a tenant B journey from both rows and count in SQLite', async () => {
    const db = new SqliteD1Database();
    db.database.exec(`
      CREATE TABLE funcionarios (
        id INTEGER PRIMARY KEY, empresa_id INTEGER, setor_id INTEGER,
        deleted_at TEXT, nome TEXT
      );
      CREATE TABLE frms_jornada (
        id TEXT PRIMARY KEY, tripulante_id INTEGER, deleted_at TEXT,
        origem TEXT, duracao_jornada_minutos INTEGER, data TEXT
      );
      CREATE TABLE frms_alerta (
        id TEXT PRIMARY KEY, tripulante_id INTEGER, jornada_id TEXT,
        tipo_limite TEXT, valor_atual_min INTEGER, nivel TEXT, resolvido INTEGER,
        created_at TEXT, deleted_at TEXT
      );
      INSERT INTO funcionarios (id, empresa_id, setor_id, nome)
      VALUES (41, 6, 10, 'Crew A'), (99, 7, 20, 'Crew B');
      INSERT INTO frms_jornada
        (id, tripulante_id, origem, duracao_jornada_minutos, data)
      VALUES ('journey-tenant-b', 99, 'SIGVOOS', 300, '2026-10-12');
      INSERT INTO frms_alerta
        (id, tripulante_id, jornada_id, tipo_limite, valor_atual_min, nivel,
         resolvido, created_at)
      VALUES ('alert-tenant-a', 41, 'journey-tenant-b', 'HV_DIARIA', 300,
              'ATENCAO', 0, '2026-10-12T10:00:00Z');
    `);

    try {
      const result = await buscarAlertas(
        db.asD1(),
        { limit: 20 },
        6,
        buildFuncionarioScopeWhere(restricted, 'f'),
      );

      expect(result).toEqual({ alertas: [], total: 0 });
    } finally {
      db.database.close();
    }
  });

  it('four synthetic QA cases use the real alert SQL with tenant, source, link and pagination guards', async () => {
    // Disposable SQLite: no staging credentials, real people, remote D1 writes or
    // substitution of the existing staging 999013 acceptance contract.
    const db = new SqliteD1Database();
    db.database.exec(`
      CREATE TABLE funcionarios (
        id INTEGER PRIMARY KEY, empresa_id INTEGER, setor_id INTEGER,
        deleted_at TEXT, nome TEXT
      );
      CREATE TABLE frms_jornada (
        id TEXT PRIMARY KEY, tripulante_id INTEGER, deleted_at TEXT,
        origem TEXT, duracao_jornada_minutos INTEGER, data TEXT
      );
      CREATE TABLE frms_alerta (
        id TEXT PRIMARY KEY, tripulante_id INTEGER, jornada_id TEXT,
        tipo_limite TEXT, valor_atual_min INTEGER, nivel TEXT, resolvido INTEGER,
        created_at TEXT, deleted_at TEXT
      );
    `);

    const crew = db.database.prepare(
      'INSERT INTO funcionarios (id, empresa_id, setor_id, nome) VALUES (?, ?, ?, ?)',
    );
    const journey = db.database.prepare(
      'INSERT INTO frms_jornada (id, tripulante_id, origem, duracao_jornada_minutos, data) VALUES (?, ?, ?, ?, ?)',
    );
    const alert = db.database.prepare(
      'INSERT INTO frms_alerta (id, tripulante_id, jornada_id, tipo_limite, valor_atual_min, nivel, resolvido, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
    );
    const ids = ['qa-frms-ux-case-1', 'qa-frms-ux-case-2', 'qa-frms-ux-case-3', 'qa-frms-ux-case-4'];
    const dates = ['2026-10-12', '2026-10-11', '2026-10-10', '2026-10-09'];
    for (const [i, id] of ids.entries()) {
      const person = 9201 + i;
      crew.run(person, 999013, 44, `QA Tripulante ${i + 1}`);
      journey.run(`qa-frms-ux-j-${i + 1}`, person, 'SIGVOOS', 690, dates[i]);
      alert.run(id, person, `qa-frms-ux-j-${i + 1}`, 'FDP_DIARIO', 690, 'CRITICO', `${dates[i]}T10:00:00Z`);
    }
    // Negative controls are not counted as valid tenant cases.
    crew.run(9301, 999014, 45, 'QA Outro Tenant');
    journey.run('qa-j-other-tenant', 9301, 'SIGVOOS', 690, dates[0]);
    alert.run('qa-other-tenant', 9301, 'qa-j-other-tenant', 'FDP_DIARIO', 690, 'CRITICO', dates[0]);
    crew.run(9205, 999013, 44, 'QA Fonte Manual');
    journey.run('qa-j-manual', 9205, 'MANUAL', 690, dates[0]);
    alert.run('qa-manual', 9205, 'qa-j-manual', 'FDP_DIARIO', 690, 'CRITICO', dates[0]);
    crew.run(9206, 999013, 44, 'QA Sem Jornada');
    alert.run('qa-unlinked', 9206, null, 'FDP_DIARIO', 690, 'CRITICO', dates[0]);
    crew.run(9207, 999013, 44, 'QA FDP Antigo');
    journey.run('qa-j-stale', 9207, 'SIGVOOS', 710, dates[0]);
    alert.run('qa-stale', 9207, 'qa-j-stale', 'FDP_DIARIO', 690, 'CRITICO', dates[0]);
    crew.run(9208, 999013, 44, 'QA Vinculo Cruzado');
    alert.run('qa-cross-owner', 9208, 'qa-j-other-tenant', 'FDP_DIARIO', 690, 'CRITICO', dates[0]);

    const scope = { clause: 'f.setor_id IN (?)', bindings: [44] };
    const read = (page: number, limit = 2, start?: string) => buscarAlertas(
      db.asD1(),
      { resolvido: false, page, limit, ...(start ? { data_inicio: start } : {}) },
      999013,
      scope,
    );
    try {
      const first = await read(1);
      const second = await read(2);
      const empty = await read(3);
      expect(first.total).toBe(4);
      expect(second.total).toBe(4);
      expect(empty.total).toBe(4);
      expect(first.alertas).toHaveLength(2);
      expect(second.alertas).toHaveLength(2);
      expect(empty.alertas).toHaveLength(0);
      expect([...first.alertas, ...second.alertas].map(x => x.id).sort()).toEqual(ids);
      expect([...first.alertas, ...second.alertas].every(
        x => x.jornada_id?.startsWith('qa-frms-ux-j-'),
      )).toBe(true);
      expect((await read(1, 20, '2026-10-11')).total).toBe(2);
      expect((await buscarAlertas(db.asD1(), { limit: 20 }, 999014)).total).toBe(1);
      expect((await buscarAlertas(db.asD1(), { limit: 20 }, 999013,
        { clause: 'f.setor_id IN (?)', bindings: [45] })).total).toBe(0);

      // Reproduce the legacy mismatch in disposable storage, then confirm
      // no empty/stale cases are silently counted as valid.
      db.database.prepare("UPDATE frms_jornada SET origem = 'MANUAL' WHERE id = ?")
        .run('qa-frms-ux-j-1');
      expect((await read(1, 20)).total).toBe(3);
      db.database.prepare('UPDATE frms_alerta SET jornada_id = NULL WHERE id = ?')
        .run('qa-frms-ux-case-2');
      expect((await read(1, 20)).total).toBe(2);
      db.database.prepare('UPDATE frms_alerta SET valor_atual_min = 500 WHERE id = ?')
        .run('qa-frms-ux-case-3');
      expect((await read(1, 20)).total).toBe(1);
    } finally {
      db.database.close();
    }
  });
});

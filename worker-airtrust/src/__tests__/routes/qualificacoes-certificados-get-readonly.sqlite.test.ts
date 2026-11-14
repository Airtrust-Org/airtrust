import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import type { Env } from '../../types';

// F14-05: GET /historico/:id/certificados deve ser estritamente somente leitura.
// Antes, uma listagem vazia (ex.: documento com deleted_at) apagava
// certificado_arquivo_id, arquivo_url e numero_certificado do histórico.

type Sql = {
  exec(s: string): void;
  prepare(s: string): {
    run(...a: never[]): { changes: number };
    get(...a: never[]): unknown;
    all(...a: never[]): unknown[];
  };
};
const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as new (
  p: string,
) => Sql;

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 1);
    c.set('userRole', 'viewer');
    c.set('empresaId', 6);
    await next();
  },
}));
vi.mock('../../middleware/tenant', async (orig) => ({
  ...(await orig<typeof import('../../middleware/tenant')>()),
  getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
}));
vi.mock('../../middleware/employee-sector-access', async (orig) => ({
  ...(await orig<typeof import('../../middleware/employee-sector-access')>()),
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [], funcionarioId: null })),
}));
vi.mock('../../middleware/rbac', () => ({
  requirePermission: () => async (_c: any, next: () => Promise<void>) => next(),
}));

import routes from '../../routes/qualificacoes-certificados';

function sqliteD1(sql: Sql, writes: string[]): D1Database {
  const stmt = (q: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(q, a),
    first: async () => sql.prepare(q).get(...(args as never[])) ?? null,
    all: async () => ({ results: sql.prepare(q).all(...(args as never[])) }),
    run: async () => {
      writes.push(q);
      return { meta: { changes: sql.prepare(q).run(...(args as never[])).changes } };
    },
  });
  return { prepare: (q: string) => stmt(q) } as unknown as D1Database;
}

function seed(documentoDeleted: boolean) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, cpf TEXT, deleted_at TEXT);
    CREATE TABLE qualificacoes_tipos (id INTEGER PRIMARY KEY, nome TEXT, codigo TEXT, is_check INTEGER, deleted_at TEXT);
    CREATE TABLE documentos (id INTEGER PRIMARY KEY, uuid TEXT, funcionario_id INTEGER, empresa_id INTEGER, nome_arquivo TEXT, tipo TEXT, tamanho INTEGER, r2_key TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT);
    CREATE TABLE pasta_virtual (id INTEGER PRIMARY KEY, funcionario_id INTEGER, empresa_id INTEGER, certificacao_id INTEGER, documento_id INTEGER, caminho_arquivo TEXT, deleted_at TEXT);
    CREATE TABLE qualificacoes_historico (id INTEGER PRIMARY KEY, empresa_id INTEGER, funcionario_id INTEGER, qualificacao_id INTEGER,
      data_conclusao TEXT, data_vencimento TEXT, certificado_arquivo_id INTEGER, arquivo_url TEXT, numero_certificado TEXT, updated_at TEXT, deleted_at TEXT);
    INSERT INTO funcionarios VALUES (10, 6, 'Fulano', '00000000000', NULL);
    INSERT INTO qualificacoes_tipos VALUES (1, 'CMA', 'CMA', 0, NULL);
    INSERT INTO documentos VALUES (500, 'u-500', 10, 6, 'cert.pdf', 'certificado', 10, 'empresa-6/cert.pdf', '2026-01-01', '2026-01-01', ${documentoDeleted ? "'2026-11-01'" : 'NULL'});
    INSERT INTO pasta_virtual VALUES (900, 10, 6, 77, 500, 'empresa-6/cert.pdf', NULL);
    INSERT INTO qualificacoes_historico VALUES (77, 6, 10, 1, '2026-01-01', '2027-01-01', 500, 'https://x/cert.pdf', 'CERT-2026-0077', '2026-01-01', NULL);
  `);
  return sql;
}

async function get(sql: Sql) {
  const writes: string[] = [];
  const res = await routes.fetch(
    new Request('http://localhost/historico/77/certificados'),
    { DB: sqliteD1(sql, writes) } as unknown as Env,
    {} as ExecutionContext,
  );
  const body = (await res.json()) as Record<string, unknown>;
  const row = sql
    .prepare(
      'SELECT certificado_arquivo_id, arquivo_url, numero_certificado, updated_at FROM qualificacoes_historico WHERE id = 77',
    )
    .get();
  return { status: res.status, body, row, writes };
}

const VINCULO_ORIGINAL = {
  certificado_arquivo_id: 500,
  arquivo_url: 'https://x/cert.pdf',
  numero_certificado: 'CERT-2026-0077',
  updated_at: '2026-01-01',
};

describe('F14-05 — GET /historico/:id/certificados é somente leitura', () => {
  it('documento vivo: preserva o vínculo, lista o certificado e não escreve', async () => {
    const r = await get(seed(false));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toHaveLength(1);
    expect(r.body.orphan_reference).toBeUndefined();
    expect(r.row).toEqual(VINCULO_ORIGINAL);
    expect(r.writes).toEqual([]);
  });

  it('documento soft-deleted: preserva vínculo e número, sinaliza órfã e não escreve', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const r = await get(seed(true));
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ success: true, data: [], orphan_reference: true });
      expect(typeof r.body.warning).toBe('string');
      expect(r.row).toEqual(VINCULO_ORIGINAL);
      expect(r.writes).toEqual([]);

      const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('certificados.orphan_reference');
      // sem PII/segredos nos logs: nem número do certificado, nem CPF/nome, nem URL
      expect(logged).not.toContain('CERT-2026-0077');
      expect(logged).not.toContain('00000000000');
      expect(logged).not.toContain('Fulano');
      expect(logged).not.toContain('https://x/cert.pdf');
    } finally {
      warn.mockRestore();
    }
  });

  it('chamadas repetidas continuam idempotentes (nenhuma GET destrói o vínculo)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const sql = seed(true);
      await get(sql);
      const segunda = await get(sql);
      expect(segunda.body).toMatchObject({ data: [], orphan_reference: true });
      expect(segunda.row).toEqual(VINCULO_ORIGINAL);
    } finally {
      warn.mockRestore();
    }
  });
});

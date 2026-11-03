import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { buscarHistoricoFira } from '../../lib/frms/fira-service';

describe('FIRA history: tenant and crew ownership', () => {
  it('rejects missing tenant before SQL execution', async () => {
    const db = { prepare: vi.fn() } as unknown as D1Database;
    await expect(buscarHistoricoFira(db, { empresa_id: undefined as never }))
      .rejects.toThrow('Contexto de empresa inválido');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('excludes foreign crew even when importer is an employee of the querying tenant', async () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec('CREATE TABLE funcionarios (id INTEGER, empresa_id INTEGER, nome TEXT)');
      sqlite.exec('CREATE TABLE frms_importacao_fira (id TEXT, tripulante_id TEXT, importado_por TEXT, preview_json TEXT, deleted_at TEXT, created_at TEXT)');
      sqlite.exec("INSERT INTO funcionarios VALUES (70,7,'C7'),(80,8,'C8'),(90,7,'IMPORTADOR')");
      sqlite.exec("INSERT INTO frms_importacao_fira VALUES ('own','70','90','{\"empresa_id\":7}',NULL,'2026-11-01'),('foreign','80','90','{\"empresa_id\":7}',NULL,'2026-11-01'),('mismatch','70','90','{\"empresa_id\":8}',NULL,'2026-11-01'),('pending',NULL,'90','{\"empresa_id\":7}',NULL,'2026-11-01')");
      const statements: Array<{ sql: string; args: unknown[] }> = [];
      const db = {
        prepare(sql: string) {
          return {
            bind(...args: unknown[]) {
              statements.push({ sql, args });
              return {
                first: async () => sqlite.prepare(sql).get(...(args as (string | number | null)[])),
                all: async () => ({ results: [] }),
              };
            },
          };
        },
      } as unknown as D1Database;

      const results = await buscarHistoricoFira(db, { empresa_id: 7 });
      expect(results.total).toBe(2);
      expect(statements).toHaveLength(2);
      for (const statement of statements) {
        expect(statement.sql).not.toContain('OR op.empresa_id = ?');
        expect(statement.sql).toContain('p.empresa_id = ?');
        expect(statement.args.slice(0, 3)).toEqual([7, 7, 7]);
      }
    } finally {
      sqlite.close();
    }
  });
});

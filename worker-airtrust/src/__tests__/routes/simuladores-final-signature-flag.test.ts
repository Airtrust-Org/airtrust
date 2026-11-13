import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const route = readFileSync(
  fileURLToPath(new URL('../../routes/simuladores-fichas-acoes.ts', import.meta.url)),
  'utf8',
);
const sqlite = spawnSync('sqlite3', ['-version']).status === 0;

describe('simulator instructor signature — legacy flag preserves finality', () => {
  it('rejects signed flag at preflight and in atomic instructor UPDATE', () => {
    const start = route.indexOf('// Uma ficha já assinada pelo instrutor');
    const end = route.indexOf('const availability =', start);
    expect(start).toBeGreaterThan(0);
    expect(route.slice(start, end)).toContain(
      'f.assinatura_instrutor_timestamp || Number(f.assinatura_instrutor) === 1',
    );
    const updateStart = route.indexOf('const updateAssinatura =');
    const updateEnd = route.indexOf('const escrita =', updateStart);
    expect(updateStart).toBeGreaterThan(0);
    const updateSql = route.slice(updateStart, updateEnd);
    expect(updateSql).toContain('assinatura_instrutor_timestamp IS NULL');
    expect(updateSql).toMatch(/COALESCE\(assinatura_instrutor,\s*0\)\s*=\s*0/);
    expect(updateSql).toContain('empresa_id=?');
    expect(updateSql).toContain('deleted_at IS NULL');
  });

  it.skipIf(!sqlite)('rejects a timestamp/flag-signed or foreign-tenant ficha in SQLite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pto-instructor-sign-'));
    const db = join(dir, 'fichas.db');
    try {
      const sql = `
        CREATE TABLE fichas_sessao (
          id INTEGER, empresa_id INTEGER,
          assinatura_instrutor_timestamp TEXT, assinatura_instrutor INTEGER,
          deleted_at TEXT, aprovado INTEGER
        );
        INSERT INTO fichas_sessao VALUES
          (1,6,NULL,0,NULL,NULL),
          (2,6,'2026-11-12',1,NULL,1),
          (3,6,NULL,1,NULL,1),
          (4,7,NULL,0,NULL,NULL),
          (5,6,NULL,0,'2026-11-12',NULL);
        UPDATE fichas_sessao SET assinatura_instrutor=1, aprovado=1
          WHERE empresa_id=6 AND assinatura_instrutor_timestamp IS NULL
            AND COALESCE(assinatura_instrutor,0)=0 AND deleted_at IS NULL;
        SELECT id, aprovado FROM fichas_sessao ORDER BY id;
      `;
      const result = spawnSync('sqlite3', ['-json', db], { input: sql, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      const rows = JSON.parse(result.stdout) as Array<{ id: number; aprovado: number | null }>;
      expect(rows.map((x) => x.aprovado)).toEqual([1, 1, 1, null, null]);
      // A second UPDATE cannot re-sign even when timestamp was never recorded.
      const check = spawnSync('sqlite3', ['-json', db], {
        input: `UPDATE fichas_sessao SET aprovado=0 WHERE id=3 AND empresa_id=6
          AND assinatura_instrutor_timestamp IS NULL
          AND COALESCE(assinatura_instrutor,0)=0 AND deleted_at IS NULL;
          SELECT aprovado FROM fichas_sessao WHERE id=3;`,
        encoding: 'utf8',
      });
      expect(check.status, check.stderr).toBe(0);
      expect(JSON.parse(check.stdout)[0].aprovado).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('FIRA confirmation: immutable tenant ownership boundary', () => {
  it('never authorizes a foreign crew merely because the importer belongs to the requesting company', () => {
    const src = readFileSync('src/lib/frms/fira-service.ts', 'utf8');
    const start = src.indexOf('export async function confirmarImportacaoFira(');
    expect(start).toBeGreaterThanOrEqual(0);
    const tick = String.fromCharCode(96);
    const qStart = src.indexOf(tick + 'SELECT f.*', start);
    const qEnd = src.indexOf(tick, qStart + 1);
    expect(qStart).toBeGreaterThan(start);
    const sql = src.slice(qStart + 1, qEnd);
    expect(sql).toContain('AND p.empresa_id = ?');
    expect(sql).toContain("json_extract(f.preview_json, '$.empresa_id') IS NULL");

    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER)');
      db.exec('CREATE TABLE frms_importacao_fira (id TEXT PRIMARY KEY, tripulante_id TEXT, importado_por TEXT, deleted_at TEXT, preview_json TEXT)');
      db.exec("INSERT INTO funcionarios VALUES (70, 7), (80, 8), (90, 7)");
      db.exec("INSERT INTO frms_importacao_fira VALUES ('foreign-crew', '80', '90', NULL, '{\"empresa_id\":7}'), ('foreign-preview','70','90',NULL,'{\"empresa_id\":8}'), ('valid','70','90',NULL,'{\"empresa_id\":7}'), ('legacy','70','90',NULL,'{}')");
      const stmt = db.prepare(sql);
      expect(stmt.get('foreign-crew', 7, 7)).toBeUndefined();
      expect(stmt.get('foreign-preview', 7, 7)).toBeUndefined();
      expect(stmt.get('valid', 7, 7)).toMatchObject({ id: 'valid', tripulante_id: '70' });
      expect(stmt.get('legacy', 7, 7)).toMatchObject({ id: 'legacy', tripulante_id: '70' });
      expect(stmt.get('valid', 8, 8)).toBeUndefined();
    } finally {
      db.close();
    }
  });
});

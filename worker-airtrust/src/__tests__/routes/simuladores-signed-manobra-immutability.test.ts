import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source contract: test the exact SQL that the live PUT route uses, not a
// parallel reimplementation that might drift from production.
const source = readFileSync(
  fileURLToPath(new URL('../../routes/simuladores-fichas-simulador.ts', import.meta.url)),
  'utf8',
);
const route = source.slice(
  source.indexOf('// PUT /fichas-simulador/:fichaId/manobras/:ordem'),
  source.indexOf('// POST /fichas-simulador/:id/popular-manobras'),
);
const inserts = [...route.matchAll(/`(INSERT INTO fichas_sessao_manobras\([\s\S]*?\))`/g)]
  .map((m) => m[1]);
const updates = [...route.matchAll(/`(UPDATE fichas_sessao_manobras[\s\S]*?\))`/g)]
  .map((m) => m[1]);
const sqliteAvailable = spawnSync('sqlite3', ['-version']).status === 0;

function sqlLiteral(input: string | number | null) {
  if (input === null) return 'NULL';
  if (typeof input === 'number') return String(input);
  return "'" + input.replaceAll("'", "''") + "'";
}

function bind(sql: string, values: Array<string | number | null>) {
  expect((sql.match(/\?/g) || []).length).toBe(values.length);
  let i = 0;
  return sql.replaceAll('?', () => sqlLiteral(values[i++])) + ';';
}

function query(caseSql: string): Array<{ ficha_id: number; ordem: number; resultado: string | null }> {
  const dir = mkdtempSync(join(tmpdir(), 'pto-signed-ficha-'));
  const db = join(dir, 'test.db');
  try {
    const setup = `
      CREATE TABLE fichas_sessao (
        id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT,
        assinatura_instrutor_timestamp TEXT, assinatura_instrutor INTEGER
      );
      CREATE TABLE fichas_sessao_manobras (
        id INTEGER PRIMARY KEY, ficha_id INTEGER, ordem INTEGER,
        codigo TEXT, descricao TEXT, categoria TEXT,
        resultado TEXT, observacoes TEXT, updated_at TEXT, deleted_at TEXT
      );
      INSERT INTO fichas_sessao VALUES
        (1,6,NULL,NULL,0),
        (2,6,NULL,'2026-11-12T12:00:00Z',1),
        (3,7,NULL,NULL,0),
        (4,6,NULL,NULL,1),
        (5,6,'2026-11-12',NULL,0);
      INSERT INTO fichas_sessao_manobras
        (ficha_id,ordem,codigo,descricao,categoria,resultado,observacoes)
      VALUES
        (1,1,'T01','Item 1','TECNICA','6','original'),
        (2,1,'T01','Item 1','TECNICA','6','original'),
        (3,1,'T01','Item 1','TECNICA','6','original'),
        (4,1,'T01','Item 1','TECNICA','6','original'),
        (5,1,'T01','Item 1','TECNICA','6','original');
    `;
    const run = spawnSync('sqlite3', ['-bail', db], {
      input: setup + caseSql,
      encoding: 'utf8',
    });
    expect(run.status, run.stderr).toBe(0);
    const result = spawnSync('sqlite3', ['-json', db], {
      input: 'SELECT ficha_id,ordem,resultado FROM fichas_sessao_manobras ORDER BY ficha_id,ordem;',
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('signed simulator maneuver immutability — exact D1 SQL', () => {
  it('requires a scoped unsigned parent in BOTH INSERT branches and UPDATE', () => {
    expect(inserts).toHaveLength(2);
    expect(updates).toHaveLength(1);
    expect(route).toContain('FICHA_ALREADY_SIGNED');
    expect(route).toContain('FICHA_MANOBRA_CONCURRENT_SIGNATURE');
    expect(route).toContain('if (!created)');
    for (const statement of [...inserts, ...updates]) {
      expect(statement).toContain('f.empresa_id = ?');
      expect(statement).toContain('f.deleted_at IS NULL');
      expect(statement).toContain('f.assinatura_instrutor_timestamp IS NULL');
      expect(statement).toMatch(/COALESCE\(f\.assinatura_instrutor,\s*0\)\s*=\s*0/);
    }
  });

  it.skipIf(!sqliteAvailable)('prevents updates after signature, tenant mismatch or deletion', () => {
    const update = updates[0];
    const sql = [
      bind(update, ['5','edited-signed',2,1,2,6]),
      bind(update, ['5','edited-other-tenant',3,1,3,6]),
      bind(update, ['5','edited-sign-flag',4,1,4,6]),
      bind(update, ['5','edited-deleted',5,1,5,6]),
      bind(update, ['7','edited-valid',1,1,1,6]),
    ].join('\n');
    const rows = query(sql);
    expect(rows.filter((row) => row.resultado === '5')).toHaveLength(0);
    expect(rows.find((row) => row.ficha_id === 1)?.resultado).toBe('7');
    for (const id of [2,3,4,5]) {
      expect(rows.find((row) => row.ficha_id === id)?.resultado).toBe('6');
    }
  });

  it.skipIf(!sqliteAvailable)('prevents new rows after signature, foreign tenant, deleted parent', () => {
    const values = (id: number, ord = 2): Array<string | number | null> => [
      id,'T02','Item 2','TECNICA',ord,'5','new',id,6,
    ];
    const sql = [
      bind(inserts[0], values(2)),
      bind(inserts[1], values(3)),
      bind(inserts[0], values(4)),
      bind(inserts[1], values(5)),
      bind(inserts[0], values(1)),
    ].join('\n');
    const rows = query(sql);
    expect(rows.filter((row) => row.ordem === 2)).toEqual([
      { ficha_id: 1, ordem: 2, resultado: '5' },
    ]);
  });

  it.skipIf(!sqliteAvailable)('rejects a signature inserted between read and guarded DML', () => {
    const sql = [
      "UPDATE fichas_sessao SET assinatura_instrutor_timestamp='2026-11-13T12:00:00Z', assinatura_instrutor=1 WHERE id=1;",
      bind(updates[0], ['5','late-edit',1,1,1,6]),
      bind(inserts[0], [1,'T03','Item 3','TECNICA',3,'5','late-insert',1,6]),
    ].join('\n');
    const rows = query(sql);
    expect(rows.find((row) => row.ficha_id === 1 && row.ordem === 1)?.resultado).toBe('6');
    expect(rows.some((row) => row.ficha_id === 1 && row.ordem === 3)).toBe(false);
  });
});

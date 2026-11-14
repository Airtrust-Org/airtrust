import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const route = readFileSync(fileURLToPath(new URL('../../routes/simuladores-fichas-acoes.ts', import.meta.url).href), 'utf8');
const hasSqlite = spawnSync('sqlite3', ['-version']).status === 0;
const fingerprintStart = route.indexOf('AND (SELECT json_group_array(json_array(snapshot.id,');
const fingerprintEnd = route.indexOf(') = ?` :', fingerprintStart);
const sqlExpression = fingerprintStart >= 0 && fingerprintEnd > fingerprintStart
  ? route.slice(fingerprintStart + 'AND '.length, fingerprintEnd + 1).replace('ficha_id=?', 'ficha_id=500')
  : '';

function sqliteQuery(db: string, sql: string): Array<Record<string, unknown>> {
  const result = spawnSync('sqlite3', ['-json', db], { input: sql, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout || '[]');
}

describe('PTO evidence: atomic snapshot of all maneuver rows at final approval', () => {
  it('binds the entire maneuver snapshot to the atomic approved-signature UPDATE', () => {
    expect(sqlExpression).toContain('ORDER BY id');
    for (const column of ['snapshot.id', 'snapshot.codigo', 'snapshot.categoria',
      'snapshot.resultado', 'snapshot.ordem', 'snapshot.descricao', 'snapshot.observacoes']) {
      expect(sqlExpression).toContain(column);
    }
    expect(route).toContain('id, notechsFingerprint, id, fullManeuverFingerprint)');
    expect(route).toContain('JSON.stringify((notechsRows.results || [])');
    expect(route).toContain('AND COALESCE(assinatura_instrutor,0)=0 AND deleted_at IS NULL');
  });

  it.skipIf(!hasSqlite)('rejects concurrent technical changes while allowing unchanged approval', () => {
    const dir = mkdtempSync(join(tmpdir(), 'airtrust-ficha-cas-'));
    const db = join(dir, 'snapshot.sqlite');
    try {
      const schema = `
        CREATE TABLE fichas_sessao (id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT,
          assinatura_instrutor_timestamp TEXT, assinatura_instrutor INTEGER, aprovado INTEGER);
        CREATE TABLE fichas_sessao_manobras (id INTEGER PRIMARY KEY, ficha_id INTEGER,
          codigo TEXT, categoria TEXT, resultado TEXT, ordem INTEGER, descricao TEXT,
          observacoes TEXT, deleted_at TEXT);
        INSERT INTO fichas_sessao VALUES (500,6,NULL,NULL,0,NULL);
        INSERT INTO fichas_sessao_manobras VALUES
          (10,500,'T-01','TÉCNICA','8.0',1,'Falha técnica','observação',NULL),
          (11,500,'T-02','TÉCNICA','NR',2,'Outra técnica',NULL,NULL),
          (12,500,'N-01','NOTECHS','9.0',3,'Competência',NULL,NULL);
      `;
      sqliteQuery(db, schema);
      const fingerprint = sqliteQuery(db, `SELECT ${sqlExpression} AS fp;`)[0]?.fp as string;
      expect(fingerprint).toBe(JSON.stringify([
        [10,'T-01','TÉCNICA','8.0',1,'Falha técnica','observação'],
        [11,'T-02','TÉCNICA','NR',2,'Outra técnica',null],
        [12,'N-01','NOTECHS','9.0',3,'Competência',null],
      ]));
      const approveSql = `UPDATE fichas_sessao SET aprovado=1,assinatura_instrutor=1
        WHERE id=500 AND empresa_id=6 AND deleted_at IS NULL
          AND assinatura_instrutor_timestamp IS NULL AND COALESCE(assinatura_instrutor,0)=0
          AND ${sqlExpression} = '${fingerprint.replaceAll("'", "''")}';
        SELECT changes() AS changes;`;
      const mutations = [
        "UPDATE fichas_sessao_manobras SET resultado='5.0' WHERE id=10;",
        "UPDATE fichas_sessao_manobras SET observacoes='alterado' WHERE id=10;",
        "UPDATE fichas_sessao_manobras SET descricao='alterada' WHERE id=10;",
        "UPDATE fichas_sessao_manobras SET ordem=99 WHERE id=10;",
        "UPDATE fichas_sessao_manobras SET categoria='NOTECHS' WHERE id=10;",
        "UPDATE fichas_sessao_manobras SET codigo='T-CHANGED' WHERE id=10;",
        "UPDATE fichas_sessao_manobras SET deleted_at='2026-11-13' WHERE id=10;",
        "INSERT INTO fichas_sessao_manobras VALUES (13,500,'T-NEW','TÉCNICA','8',4,'Adicionada',NULL,NULL);",
      ];
      for (const mutate of mutations) {
        sqliteQuery(db, mutate);
        expect(sqliteQuery(db, approveSql)[0]?.changes, mutate).toBe(0);
        // Restore only maneuver evidence for the next adversarial case.
        sqliteQuery(db, 'DELETE FROM fichas_sessao_manobras;'+schema.slice(schema.indexOf('INSERT INTO fichas_sessao_manobras')));
      }
      expect(sqliteQuery(db, approveSql)[0]?.changes).toBe(1);
      expect(sqliteQuery(db, approveSql)[0]?.changes).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

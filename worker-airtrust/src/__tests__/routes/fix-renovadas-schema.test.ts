import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

import { buildMarkRenovadaSql, buildLinkRenovacaoDeSql } from '../../routes/fix-renovadas';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function bindPositional(sql: string, values: Array<string | number>): string {
  let index = 0;
  return sql.replace(/\?/g, () => {
    const value = values[index++];
    return typeof value === 'number' ? String(value) : `'${value}'`;
  });
}

describe('fix-renovadas.ts apply-time SQL — schema contract', () => {
  it('executa as duas mutações reais (RENOVADA + renovacao_de linkado) contra o schema canônico', () => {
    const dir = mkdtempSync(join(tmpdir(), 'airtrust-fix-renovadas-'));
    tempDirs.push(dir);
    const dbPath = join(dir, 'fixture.sqlite');

    // Two antigo records (10, 20) both superseded by the same id_mais_recente (99) —
    // mirrors a 3-cycle group where two older cycles point at the newest one.
    const markSql = buildMarkRenovadaSql(2);
    const linkSql = buildLinkRenovacaoDeSql([99]);

    const setup = `
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  status TEXT,
  renovada INTEGER DEFAULT 0,
  renovacao_de INTEGER,
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT INTO qualificacoes_historico (id, empresa_id, status, deleted_at) VALUES
  (10, 6, 'VENCIDA', NULL),
  (20, 6, 'VENCIDA', NULL),
  (99, 6, 'VALIDA', NULL);

${bindPositional(markSql, [6, 10, 20])};
${bindPositional(linkSql, [10, 6, 99])};
SELECT id, status, renovada, renovacao_de FROM qualificacoes_historico ORDER BY id;
`;

    const run = spawnSync('sqlite3', [dbPath], { input: setup, encoding: 'utf8' });

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('10|RENOVADA|1|');
    expect(run.stdout).toContain('20|RENOVADA|1|');
    // id 99 (the newest record) links back to the FIRST antigo bound (10, not 20).
    expect(run.stdout).toContain('99|VALIDA|0|10');
  });

  it('renovacao_de já vinculado não é sobrescrito por uma reaplicação', () => {
    const dir = mkdtempSync(join(tmpdir(), 'airtrust-fix-renovadas-idempotent-'));
    tempDirs.push(dir);
    const dbPath = join(dir, 'fixture.sqlite');

    const linkSql = buildLinkRenovacaoDeSql([99]);

    const setup = `
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  renovacao_de INTEGER,
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT INTO qualificacoes_historico (id, empresa_id, renovacao_de, deleted_at) VALUES (99, 6, 10, NULL);

${bindPositional(linkSql, [30, 6, 99])};
SELECT id, renovacao_de FROM qualificacoes_historico WHERE id = 99;
`;

    const run = spawnSync('sqlite3', [dbPath], { input: setup, encoding: 'utf8' });

    expect(run.status, run.stderr).toBe(0);
    // Still 10 — the CASE's "WHEN renovacao_de IS NOT NULL THEN renovacao_de" branch
    // preserves the existing link instead of overwriting it with 30.
    expect(run.stdout).toContain('99|10');
  });

  it('não reintroduz colunas inexistentes em qualificacoes_historico', () => {
    for (const sql of [buildMarkRenovadaSql(2), buildLinkRenovacaoDeSql([1, 2])]) {
      expect(sql).toContain('empresa_id');
      expect(sql).toContain('deleted_at');
    }
  });
});

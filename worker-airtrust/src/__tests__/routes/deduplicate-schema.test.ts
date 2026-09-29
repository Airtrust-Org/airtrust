import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEDUPLICATE_GROUP_QUERY_SQL,
  DEDUPLICATE_RECORDS_QUERY_SQL,
  buildDeduplicateSoftDeleteSql,
} from '../../routes/deduplicate';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function bindPositional(sql: string, values: Array<string | number | null>): string {
  let index = 0;
  return sql.replace(/\?/g, () => {
    const value = values[index++];
    if (value === null) return 'NULL';
    return typeof value === 'number' ? String(value) : `'${value}'`;
  });
}

describe('deduplicate.ts schema contract', () => {
  it('deduplica somente mesma qualificacao + mesma data de conclusao', () => {
    const dir = mkdtempSync(join(tmpdir(), 'airtrust-deduplicate-'));
    tempDirs.push(dir);
    const dbPath = join(dir, 'fixture.sqlite');

    const setup = `
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  funcionario_cpf TEXT,
  qualificacao_id INTEGER,
  qualificacao_codigo TEXT,
  codigo TEXT,
  data_vencimento TEXT,
  data_conclusao TEXT,
  status TEXT,
  renovada INTEGER DEFAULT 0,
  renovacao_de INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT INTO qualificacoes_historico (
  id, empresa_id, funcionario_id, funcionario_cpf, qualificacao_id,
  qualificacao_codigo, codigo, data_vencimento, data_conclusao, created_at, deleted_at
) VALUES
  (101, 6, 11, '11111111111', 7, 'SIM', 'SIM', '2026-12-31', '2026-01-03T08:00:00Z', '2026-01-03T10:00:00Z', NULL),
  (102, 6, 11, '11111111111', 8, 'sim', 'SIM', '2026-12-31', '2026-01-03T08:00:00Z', '2026-01-03T09:00:00Z', NULL),
  (103, 6, 11, '11111111111', 7, 'SIM', 'SIM', '2026-12-31', '2026-01-03T08:00:00Z', '2026-01-03T08:30:00Z', NULL),
  (104, 6, 11, '11111111111', 7, 'SIM', 'SIM', '2027-12-31', '2026-06-03T08:00:00Z', '2026-06-03T10:00:00Z', NULL);

${bindPositional(DEDUPLICATE_GROUP_QUERY_SQL, [6])};
${bindPositional(DEDUPLICATE_RECORDS_QUERY_SQL, [6, 11, 'SIM', '2026-01-03'])};
${bindPositional(buildDeduplicateSoftDeleteSql(2), [6, 102, 103])};
SELECT id, deleted_at FROM qualificacoes_historico ORDER BY id;
`;

    const run = spawnSync('sqlite3', [dbPath], { input: setup, encoding: 'utf8' });

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('11|SIM|7|SIM|2026-01-03|3');
    expect(run.stdout).not.toContain('2026-06-03|1');
    expect(run.stdout).toContain('101|2026-01-03T08:00:00Z|2026-01-03T10:00:00Z');
    expect(run.stdout).toContain('101|');
    expect(run.stdout).toMatch(/102\|\d{4}-\d{2}-\d{2}/);
    expect(run.stdout).toMatch(/103\|\d{4}-\d{2}-\d{2}/);
    expect(run.stdout).toContain('104|');
  });

  it('mantem tenant e soft-delete em todas as queries', () => {
    for (const sql of [
      DEDUPLICATE_GROUP_QUERY_SQL,
      DEDUPLICATE_RECORDS_QUERY_SQL,
      buildDeduplicateSoftDeleteSql(3),
    ]) {
      expect(sql).toContain('empresa_id');
      expect(sql).toContain('deleted_at');
    }
    expect(DEDUPLICATE_GROUP_QUERY_SQL).toContain('date(data_conclusao)');
    expect(DEDUPLICATE_GROUP_QUERY_SQL).not.toContain('GROUP BY funcionario_cpf');
    expect(DEDUPLICATE_GROUP_QUERY_SQL).not.toContain('qualificacao_id,\n        date(data_conclusao)');
    expect(DEDUPLICATE_RECORDS_QUERY_SQL).not.toContain('qualificacao_id = ?');
  });
});

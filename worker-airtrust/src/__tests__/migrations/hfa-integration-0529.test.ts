import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('0529 HFA integration bridge', () => {
  it('is additive, tenant scoped and mirrored in Schema V2', () => {
    const migration = read('migrations/0529_hfa_integration_bridge.sql');
    const change = read('schema-v2/changes/0529_hfa_integration_bridge.sql');
    expect(change).toBe(migration);
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS integracoes_hfa_config');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS integracoes_hfa_eventos');
    expect(migration).toContain('UNIQUE (empresa_id, relato_id)');
    expect(migration).toContain('relato fora do tenant');
    expect(migration).not.toMatch(/DROP TABLE|DELETE FROM sgso_relatos|UPDATE sgso_relatos/i);
  });
});

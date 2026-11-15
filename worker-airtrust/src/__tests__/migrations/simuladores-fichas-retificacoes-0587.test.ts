import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const changeId = 'simuladores-fichas-retificacoes-0587';
const sqlPath = 'worker-airtrust/schema-v2/changes/0587_simuladores_fichas_retificacoes.sql';
const planPath = 'worker-airtrust/schema-v2/plans/simuladores-fichas-retificacoes-0587.md';

describe('0587 fichas_sessao_retificacoes — contrato de governança', () => {
  it('manifesto revisado confere com SQL e plano e está classificado no contrato de baseline', () => {
    const sql = read(sqlPath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(`worker-airtrust/schema-v2/${changeId}.json`));
    expect(manifest).toMatchObject({
      changeId, baselineId: 'production-d1-baseline-v2-20260714', filePath: sqlPath, planPath,
      fileHash: hash(sql), planHash: hash(plan),
    });
    const contract = JSON.parse(read('docs/database/schema-contracts/production-d1-baseline-v2.json'));
    const entry = contract.schema_v2_since_baseline.find((e: { change_id: string }) => e.change_id === changeId);
    expect(entry).toMatchObject({
      sha256: hash(sql), governance_state: 'REMOTE_APPLY_PENDING', reviewed_manifest: `${changeId}.json`,
      targets: ['fichas_sessao_retificacoes', 'fichas_sessao_retificacoes_itens'],
    });
  });

  it('é estritamente aditivo: não altera nem apaga fichas existentes', () => {
    const sql = read(sqlPath).replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b|\bRENAME\s+TO\b|\bALTER\s+TABLE\b|\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\b(UPDATE|INSERT\s+INTO)\s+fichas_sessao(_manobras)?\b/i);
  });

  it('scripts de pré e pós-condição existem e referenciam o change_id', () => {
    for (const s of ['preflight', 'postconditions']) {
      expect(read(`scripts/schema-v2/validate-0587-production-${s}.sh`)).toContain(changeId);
    }
  });
});

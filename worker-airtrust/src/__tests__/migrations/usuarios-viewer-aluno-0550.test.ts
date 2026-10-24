import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (path: string) => readFileSync(join(repoRoot, path), 'utf8');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('Schema V2 0550 — viewer para aluno com Coordenação preservada', () => {
  const sql = read('worker-airtrust/schema-v2/changes/0550_usuarios_costa_do_sol_viewer_aluno.sql');
  const plan = read('worker-airtrust/schema-v2/plans/usuarios-costa-do-sol-viewer-aluno-0550.md');
  const manifest = JSON.parse(read('worker-airtrust/schema-v2/usuarios-costa-do-sol-viewer-aluno-0550.json'));

  it('exige arquivos íntegros e base do Schema V2', () => {
    expect(manifest.changeId).toBe('usuarios-costa-do-sol-viewer-aluno-0550');
    expect(manifest.baselineId).toBe('production-d1-baseline-v2-20260714');
    expect(manifest.fileHash).toBe(sha(sql));
    expect(manifest.planHash).toBe(sha(plan));
  });

  it('mantém transação fail-closed, tenant 6 e a autoridade COORDENACAO_VOO', () => {
    expect(sql).toContain('SELECT CASE WHEN');
    expect(sql).toContain("json_extract('INVALID_SCHEMA_0550_GUARD'");
    expect(sql).not.toContain('CREATE TEMP TABLE');
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).toContain('COORDENACAO_VOO');
    expect(sql).toContain("SET role='student'");
    expect(sql).toContain("SET role='viewer'");
    expect(sql).toContain('WHERE empresa_id=6');
    expect(sql).not.toContain('DELETE FROM usuarios');
    expect(sql).not.toContain('DROP TABLE usuarios');
    expect(sql).not.toContain('password_hash');
    expect(sql).not.toContain('lms_matriculas');
  });

  it('executa o cenário real e rejeita cinco desvios sem alterar os vínculos', () => {
    const output = execFileSync('python3', [
      join(repoRoot, 'scripts/__tests__/schema-v2-0550-user-roles-fixture.py'),
    ], { cwd: repoRoot, encoding: 'utf8', timeout: 15000 });
    expect(output).toContain('PASS schema-v2-0550');
  });

  it('vincula preflight e pós-condições ao workflow governado', () => {
    const workflow = read('.github/workflows/apply-schema-change-v2.yml');
    expect(workflow).toContain("inputs.change_id == 'usuarios-costa-do-sol-viewer-aluno-0550'");
    expect(workflow).toContain('validate-0550-production-preflight.sh');
    expect(workflow).toContain('validate-0550-production-postconditions.sh');
  });
});

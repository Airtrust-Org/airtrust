import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const hash = (v: string) => createHash('sha256').update(v).digest('hex');

describe('training Doutrinação bootstrap 0539', () => {
  it('pins identical SQL and reviewed manifest', () => {
    const migration = read('worker-airtrust/migrations/0539_training_doutrinacao_bootstrap.sql');
    const change = read('worker-airtrust/schema-v2/changes/0539_training_doutrinacao_bootstrap.sql');
    const plan = read('worker-airtrust/schema-v2/plans/training-doutrinacao-bootstrap-0539.md');
    const manifest = JSON.parse(read('worker-airtrust/schema-v2/training-doutrinacao-bootstrap-0539.json'));
    expect(migration).toBe(change);
    expect(manifest.fileHash).toBe(hash(change));
    expect(manifest.planHash).toBe(hash(plan));
  });

  it('preserves identity or bootstraps from the maintenance family', () => {
    const sql = read('worker-airtrust/schema-v2/changes/0539_training_doutrinacao_bootstrap.sql');
    expect(sql).toContain("UPPER(TRIM(codigo))='MNT_INTEGRACAO_DOUTRINACAO'");
    expect(sql).toContain("UPPER(TRIM(src.codigo))='MNT_MGM'");
    expect(sql).toContain('carga_horaria_inicial=8');
    expect(sql).toContain('carga_horaria_recorrente=4');
    expect(sql).toContain('validade=36');
    expect(sql).not.toContain('lms_matriculas');
    expect(sql).not.toContain('qualificacoes_historico');
  });

  it('checks the exact canonical source reference used by migration 0539', () => {
    const migration = read('worker-airtrust/schema-v2/changes/0539_training_doutrinacao_bootstrap.sql');
    const sourceReference = 'PRG-MNT-002 — Programa de Treinamento de Manutenção Rev.06';
    expect(migration).toContain(sourceReference);
    for (const file of [
      'scripts/staging/validate-0539-postconditions.sh',
      'scripts/schema-v2/validate-0539-production-postconditions.sh',
    ]) {
      const validator = read(file);
      expect(validator).toContain(
        "instr(referencias,'PRG-MNT-002')>0 AND instr(referencias,'Programa de Treinamento de Manutenção Rev.06')>0",
      );
      expect(validator).not.toContain("referencias LIKE '%PTM Rev.06%'");
      expect(validator).toContain('carga_horaria_inicial=8');
      expect(validator).toContain('carga_horaria_recorrente=4');
      expect(validator).toContain('validade=36');
    }
  });

  it('keeps the repair ordered before 0537 and 0538', () => {
    for (const p of [
      'scripts/staging/validate-0539-preflight.sh',
      'scripts/schema-v2/validate-0539-production-preflight.sh',
    ]) {
      const s = read(p);
      expect(s).toContain('dependency-0536-ledger');
      expect(s).toContain('unapplied-0537');
      expect(s).toContain('unapplied-0538');
      expect(s).toContain('canonical-doutrinacao-identity');
    }
  });
});

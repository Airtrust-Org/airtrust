import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root=join(process.cwd(),'..');
const read=(p:string)=>readFileSync(join(root,p),'utf8');
const sqlPath='worker-airtrust/schema-v2/changes/0546_training_compliance_canonical_category_repair.sql';
const planPath='worker-airtrust/schema-v2/plans/training-compliance-canonical-category-repair-0546.md';
const manifestPath='worker-airtrust/schema-v2/training-compliance-canonical-category-repair-0546.json';

describe('Schema V2 0546 canonical CIPA category integrity',()=>{
 it('pins immutable SQL and reviewed plan and preserves the historic 0545 without modification',()=>{
  const m=JSON.parse(read(manifestPath));
  const h=(s:string)=>createHash('sha256').update(s).digest('hex');
  expect(m.changeId).toBe('training-compliance-canonical-category-repair-0546');
  expect(m.baselineId).toBe('production-d1-baseline-v2-20260714');
  expect(m.filePath).toBe(sqlPath);expect(m.fileHash).toBe(h(read(sqlPath)));
  expect(m.planPath).toBe(planPath);expect(m.planHash).toBe(h(read(planPath)));
  expect(read('worker-airtrust/migrations/0546_training_compliance_canonical_category_repair.sql')).toBe(read(sqlPath));
  expect(read('worker-airtrust/schema-v2/changes/0545_training_compliance_canonical_pdf_alignment.sql')).toContain("categoria_id=NULL");
 });
 it('reproduces 0457 trigger failure and proves 0546 correction, role matrix, idempotency and tenant isolation',()=>{
  const r=spawnSync('python3',[join(root,'scripts/compliance/validate-0546-sqlite.py')],{encoding:'utf8'});
  expect(r.status,r.stderr).toBe(0);
  expect(r.stdout).toContain('TRAINING_COMPLIANCE_0546_SQLITE_TRIGGER_AND_TENANT_PASS');
 });
 it('is governable through exact staged/production workflows with strict production guards',()=>{
  const sql=read(sqlPath).toUpperCase();
  expect(sql).toContain('TREINAMENTO_GERAL');
  expect(sql).not.toMatch(/(?:DROP TRIGGER|DELETE FROM|UPDATE\s+FUNCIONARIOS|UPDATE\s+LMS_|UPDATE\s+QUALIFICACOES_HISTORICO)/);
  const wf=read('.github/workflows/apply-schema-change-v2.yml');
  expect(wf).toContain('Preflight Training Compliance canonical category-safe PDF 0546');
  expect(wf).toContain('Post-validate Training Compliance canonical category-safe PDF 0546');
  const condition = "inputs.change_id == 'training-compliance-canonical-category-repair-0546'";
  expect(wf.split(condition)).toHaveLength(3);
  expect(wf).not.toContain('training-compliance-canonical-pdf-alignment-0546');
  expect(read('.github/workflows/staging-d1-schema-change.yml')).toContain('0546_training_compliance_canonical_category_repair.sql');
  expect(read('scripts/staging/apply-approved-migration-with-recovery-point.sh')).toContain('SPECIALIZED_PREFLIGHT_0546_OK');
  expect(read('scripts/schema-v2/validate-0546-production-preflight.sh')).toContain('assert_count models 28');
  expect(read('scripts/schema-v2/validate-0546-production-postconditions.sh')).toContain('generic-category-valid');
  expect(read('scripts/staging/validate-0546-postconditions.sh')).toContain('verify-0546-staging-applicability.mjs');
 });
});

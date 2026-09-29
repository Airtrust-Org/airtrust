import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync(
  new URL('../production/recover-document-integrity-20260929.mjs', import.meta.url),
  'utf8',
);
const workflow = readFileSync(
  new URL('../../.github/workflows/production-document-integrity-recovery-20260929.yml', import.meta.url),
  'utf8',
);

test('recovery is tenant-scoped, deterministic and preserves missing R2 rows', () => {
  assert.match(script, /const EMPRESA_ID = 6;/);
  assert.match(script, /RESTORE_DOC_IDS = \[346, 347, 348, 501, 2001, 2005, 2020\]/);
  assert.match(script, /KNOWN_MISSING_R2_DOC_IDS = \[500, 1520\]/);
  assert.match(script, /RESTORE_SET_DRIFT/);
  assert.match(script, /KNOWN_MISSING_SET_DRIFT/);
  assert.match(script, /CANDIDATE_SET_CHANGED/);
});

test('cleanup targets only provably auto-generated non-current certificates', () => {
  assert.match(script, /Certificado automático gerado em/);
  assert.match(script, /d\.id<>qh\.certificado_arquivo_id/);
  assert.match(script, /PROTECTED_MANUAL_DOCUMENT_CHANGED/);
  assert.match(script, /BROKEN_CURRENT_CERTIFICATE_LINKS/);
});

test('repair never deletes R2 objects and uses only reversible D1 soft-delete/restore', () => {
  assert.doesNotMatch(script, /wrangler[^\n]*r2[^\n]*(delete|put)/i);
  assert.doesNotMatch(script, /DELETE\s+FROM\s+(?:documentos|pasta_virtual)/i);
  assert.match(script, /SET deleted_at=NULL/);
  assert.match(script, /SET deleted_at=COALESCE\(deleted_at,datetime\('now'\)\)/);
});


test('restore UPDATE declares the documentos alias used by the supporting-document filter', () => {
  assert.match(script, /UPDATE documentos AS d\s+SET deleted_at=NULL/);
  assert.match(script, /lower\(COALESCE\(d\.descricao,''\)\)/);
  assert.match(script, /process\.stderr\.write\(result\.stdout \|\| ''\)/);
});

test('success audit is written only after document postconditions and is idempotent', () => {
  const postconditionIndex = script.indexOf("POST_KNOWN_MISSING_SET_CHANGED");
  const auditIndex = script.indexOf("DOCUMENT_INTEGRITY_RESTORE_SUCCESS_20260929");
  assert.ok(postconditionIndex > -1);
  assert.ok(auditIndex > postconditionIndex);
  assert.match(script, /DOCUMENT_INTEGRITY_RETIRE_AUTO_DUPLICATE_SUCCESS_20260929/);
  assert.match(script, /NOT EXISTS \(\s*SELECT 1 FROM audit_logs al/);
  assert.match(script, /POST_RESTORE_AUDIT_COUNT_MISMATCH/);
  assert.match(script, /POST_RETIRE_AUDIT_COUNT_MISMATCH/);
  assert.doesNotMatch(script, /'DOCUMENT_INTEGRITY_RESTORE_20260929'/);
  assert.doesNotMatch(script, /'DOCUMENT_INTEGRITY_RETIRE_AUTO_DUPLICATE_20260929'/);
});

test('production workflow requires exact SHA, release gates, reviewed dry-run and recovery point', () => {
  assert.match(workflow, /EXPECTED_SHA_MISMATCH/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /REVIEWED_DRY_RUN_SHA_MISMATCH/);
  assert.match(workflow, /d1 time-travel info airtrust-db --env production/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /success_audit_records/);
});

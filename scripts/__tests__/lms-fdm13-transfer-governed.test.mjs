// source_reference: issue #1279 and production-lms-fdm13-historical-transfer.yml.
 // operational_decision: assertions verify only reviewed tenant-6 FDM historical transfer.
 // dry_run_required: tests cover workflow dry-run predecessor and reviewed candidate checks.
 // rollback_plan_required: assert Time Travel recovery gate; never perform recovery in tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src=readFileSync(new URL('../production/lms-fdm13-transfer-governed.mjs',import.meta.url),'utf8');
const yml=readFileSync(new URL('../../.github/workflows/production-lms-fdm13-historical-transfer.yml',import.meta.url),'utf8');

test('governed executor is main-SHA-pinned and defaults to dry-run with explicit tenant and recovery guards',()=>{
 for(const s of ['GITHUB_MAIN_ONLY','PINNED_SHA_INVALID','CONFIRMATION_INVALID',
  'SCHEMA_V2_DEPENDENCIES_NOT_APPLIED','TARGET_COMPANY_ID','REVIEWED_HASH_MISMATCH',
  'REVIEWED_COUNT_MISMATCH','RECOVERY_REQUIRED','FDM13_RECOVERY_READY','GOVERNED_APPLY_FAILED_REQUIRES_RECOVERY_REVIEW'])
  assert.ok(src.includes(s),s);
 assert.match(src,/const MODE=process\.env\.FDM13_TRANSFER_MODE\|\|'dry-run'/);
 assert.match(src,/source_canceled===27/);
 assert.match(src,/after\.summary\.already_transferred===21/);
 assert.match(src,/after\.summary\.candidates===0/);
});
test('administrative completion is traceable and creates no SCORM state, certificates, email or out-of-scope migration',()=>{
 assert.match(src,/FDM13_ADMIN_TRANSFER_SOURCE_/);
 assert.match(src,/Equivalencia administrativa FDM legado curso 13/);
 assert.match(src,/Nao representa conclusao do novo SCORM/);
 assert.match(src,/INSERT INTO lms_matriculas/);
 assert.match(src,/INSERT INTO qualificacoes_historico/);
 assert.match(src,/INSERT INTO lms_matricula_ciclos/);
 assert.match(src,/INSERT INTO audit_logs/);
 assert.match(src,/origem_tipo/);
 assert.match(src,/\bm\.curso_id=13 AND m\.deleted_at IS NULL/);
 assert.match(src,/m\.curso_id IN \(71,72,73\)/);
 assert.match(src,/WHERE m\.empresa_id=6/);
 assert.match(src,/qt\.codigo/);
 assert.doesNotMatch(src,/INSERT INTO lms_progresso_scorm|UPDATE lms_progresso_scorm/);
 assert.doesNotMatch(src,/INSERT INTO certificados|INSERT INTO certificado/);
 assert.doesNotMatch(src,/sendMatriculaEmail|sendEmail|sendWhatsapp/);
});
test('GitHub Actions guards production D1 write via reviewed dry-run and recovery, never push/PR',()=>{
 assert.match(yml,/workflow_dispatch:/);
 assert.match(yml,/environment: production/);
 assert.match(yml,/verify-release-gates\.mjs/);
 assert.match(yml,/REVIEWED_RUN/);
 assert.match(yml,/DRYRUN_SHA_CHANGED/);
 assert.match(yml,/DRYRUN_COHORT_CHANGED/);
 assert.match(yml,/gh run download/);
 assert.match(yml,/time-travel info airtrust-db/);
 assert.match(yml,/FDM13_RECOVERY_READY=yes/);
 assert.match(yml,/AIRTRUST_PRODUCTION_FDM13_TRANSFER_APPLY_ADMIN_EQUIVALENCE_99_NO_SCORM_NO_EMAIL/);
 assert.match(yml,/CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
 assert.match(yml,/actions\/upload-artifact@v7/);
 assert.doesNotMatch(yml,/\bpush:/);
 assert.doesNotMatch(yml,/\bpull_request:/);
});

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import test from 'node:test';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const s=readFileSync(path.join(root,'scripts/staging/cv-frms-operational-readonly-diagnostic.mjs'),'utf8');
const w=readFileSync(path.join(root,'.github/workflows/staging-cv-frms-operational-readonly-diagnostic.yml'),'utf8');
test('pins staging and refuses production',()=>{
 assert.match(s,/STAGING_D1_NAME!==DB/);assert.match(s,/STAGING_D1_ID!==DB_ID/);
 assert.match(s,/STAGING_D1_ID===PROD_ID/);assert.match(s,/WORKER_SHA_MISMATCH/);
 assert.match(w,/refs\/heads\/main/);assert.match(w,/git merge-base --is-ancestor/);
 assert.match(w,/verify-release-gates\.mjs/);assert.match(w,/STAGING_PAGES_SHA_MISMATCH/);
});
test('only SELECT and PRAGMA, no remote write or clinical values returned',()=>{
 assert.match(s,/function readOnly/);assert.match(s,/READ_ONLY_SQL_BLOCKED/);
 assert.match(s,/'--remote','--json','--command'/);assert.match(s,/PRAGMA table_info/);
 assert.match(s,/LIMIT 0/);assert.match(s,/readOnly:true,writes:0/);
 assert.doesNotMatch(s,/'--file'|d1 migrations apply|wrangler deploy/);
 assert.doesNotMatch(w,/wrangler\s+d1\s+migrations\s+apply|wrangler\s+deploy/);
});
test('probes operational schema including 0498 and counts synthetic flights only',()=>{
 for(const name of ['cv_voos','cv_voo_tripulantes','frms_acumulo_rolling','hv_ano_calendario_min','frms_fadiga_checkin','escala_alocacoes'])assert.ok(s.includes(name));
 assert.match(s,/empresa_id IN \(999006,999013\)/);
 assert.match(s,/missingColumns:missing,compileProbes:compile,qaFlights,qaCrew,fixtureState,verdict/);
});
test('credentials stay inside staging and mutex is shared with QA',()=>{
 assert.match(w,/schema_d1_readonly:/);assert.match(w,/environment: staging/);assert.match(w,/airtrust-staging-mutations-and-scorm-qa/);
 assert.match(w,/secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
 assert.match(w,/secrets\.CLOUDFLARE_ACCOUNT_ID/);
 assert.doesNotMatch(w,/secrets\.CLOUDFLARE_API_TOKEN\b|set\s+-x/);
});

test('phase-2 probes cover actual CV and FRMS activity sources without materializing rows',()=>{
 for(const table of ['cv_voo_etapas','cv_conflitos_integracao','cv_sigvoos_staging','treinamentos_dias','simulador_agendamentos','frms_recovery_activity_segment']) assert.ok(s.includes(table));
 for(const name of ['cv_jornadas_source','legacy_jornadas_source','training_activity_source','simulator_activity_source','recovery_activity_source']) assert.ok(s.includes(name));
 assert.match(s,/LIMIT 0/);
 assert.match(s,/Only schema names are emitted/);
 assert.doesNotMatch(s,/console\.log\(.*results/);
});

test('diagnoses synthetic 27 Oct crew through the exact active-tenant gate join, aggregates only',()=>{
 assert.match(s,/COUNT\(t\.id\) AS active_crew_links/);
 assert.match(s,/COUNT\(f\.id\) AS visible_crew_links/);
 assert.match(s,/t\.voo_id=v\.id AND t\.empresa_id=v\.empresa_id AND t\.deleted_at IS NULL/);
 assert.match(s,/f\.id=t\.funcionario_id AND f\.empresa_id=t\.empresa_id AND f\.deleted_at IS NULL/);
 assert.match(s,/qaCrew,fixtureState,verdict/);
 assert.match(s,/examinerCrew=qaCrew\.counts\.find\(x=>x\.tenantLabel==='qa_examiner_training'\)/);
 assert.match(s,/NO_SYNTHETIC_FLIGHTS_ON_DATE/);
 assert.match(s,/SYNTHETIC_FLIGHTS_NO_CREW_LINKS/);
 assert.match(s,/CREW_LINKS_NOT_VISIBLE_IN_GATE/);
 assert.doesNotMatch(s,/console\.log\(.*(?:crewRows|employeeRows|clinicalValues)/);
});

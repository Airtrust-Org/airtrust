// source_reference: tenant-6 production D1 read-only inventory 2026-11-12, issue #2215, SHA-specific 124 reviewed EAD organizational rules and archived qualification references.
// operational_decision: explicit one-time approval prepares durable EAD enrollment opt-in while preserving legacy NULL evidence modalities, four unpublished curriculum drafts and existing training evidence.
// dry_run_required: official production dry-run and exact pre-state SHA256/hash plus eight release gates are mandatory before any production apply.
// rollback_plan_required: official governed workflow captures D1 Time Travel recovery point immediately before mutation; existing qualification history, LMS progress and certificates are not altered.
import {readFileSync} from 'node:fs';
import * as requireTestFs from 'node:fs';
import * as requireTestOs from 'node:os';
import * as requireTestPath from 'node:path';
import * as requireTestChild from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const script=readFileSync('scripts/production/finalize-compliance-lms-2215.mjs','utf8');
const workflow=readFileSync('.github/workflows/production-compliance-lms-finalize-2215.yml','utf8');
const ids=JSON.parse(script.match(/const REVIEWED = Object\.freeze\((\[[^\n]+\])\)/)[1]);
test('exact approved 124 rule IDs, no duplicate or archived/appointment overlap',()=>{
  assert.equal(ids.length,124);
  assert.equal(new Set(ids).size,124);
  for(const id of [104,237,240,242,244,256,480,665,666,667,668,677,678,703])
    assert.equal(ids.includes(id),false);
});
test('must preserve four unpublished course drafts with exact qualifications',()=>{
  assert.match(script,/75:189,80:45,81:120,82:203/);
  assert.match(script,/Number\(row\.publicado\)!==0/);
  assert.match(script,/scorm_package_r2_prefix!=null/);
  assert.match(script,/DRAFT_CONTENT_OR_MAPPING_DRIFT/);
});
test('persist opt-in only in reviewed rules, preserve manual credential appointment',()=>{
  assert.match(script,/AND id IN \(\$\{csv\}\) AND ativo=1 AND deleted_at IS NULL/);
  assert.match(script,/AND modalidade_requerida IS NULL AND auto_matricular_ead=0/);
  assert.doesNotMatch(script,/SET modalidade_requerida='EAD'/);
  assert.match(script,/if\(solo\.escopo!=='FUNCIONARIO'\)/);
  assert.match(script,/examiner_credential_remains_manual:true/);
});
test('historical qualification evidence preserved; only archived rule references retired',()=>{
  assert.match(script,/ARCHIVED = Object\.freeze\(\[237,240,242,244,256,665,666,667\]\)/);
  assert.match(script,/SET ativo=0,updated_at=datetime\('now'\)/);
  assert.match(script,/qt\.deleted_at IS NOT NULL/);
  assert.doesNotMatch(script,/UPDATE qualificacoes_historico|DELETE FROM qualificacoes_historico/);
});
test('hash snapshot includes every field that can change population, precedence or validity',()=>{
  for(const name of ['setor_id','funcao_id','funcionario_id','aeronave_modelo',
    'vigencia_inicio','vigencia_fim','obrigatoriedade','perfil_competencia']) {
    assert.match(script,new RegExp('tr\\.'+name+'\\b'));
  }
  assert.match(script,/sha\(\{rules:before\.rules,drafts:before\.drafts\}\)/);
});
test('production plan requires exact reviewed hash and verifies postconditions',()=>{
  assert.match(script,/COMPLIANCE_2215_EXPECTED_HASH!==beforeHash/);
  assert.match(script,/verify\(after,true\)/);
  assert.match(script,/audit_records:audited\.changes/);
  assert.match(script,/certifications_created:0/);
  assert.match(script,/content_published:0/);
  assert.match(script,/created_enrollments:0/);
  assert.match(script,/emails_sent:0/);
});
test('workflow pins approved source plus eight gates, D1 recovery, reviewed dry-run',()=>{
  assert.match(workflow,/RELEASE_SHA="\$EXPECTED_SHA" node scripts\/ci\/verify-release-gates.mjs/);
  assert.match(workflow,/RELEASE_SHA="\$GITHUB_SHA" node scripts\/ci\/verify-release-gates.mjs/);
  assert.match(workflow,/reviewed_dry_run_run_id/);
  assert.match(workflow,/\.before_hash/);
  assert.match(workflow,/d1 time-travel info airtrust-db/);
  assert.match(workflow,/CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
});
test('wrong confirmation fails before any database call',()=>{
  const p=spawnSync(process.execPath,['scripts/production/finalize-compliance-lms-2215.mjs','apply'],{
    encoding:'utf8',env:{...process.env,COMPLIANCE_2215_CONFIRMATION:'INVALID'}});
  assert.notEqual(p.status,0);
  assert.match(p.stderr,/CONFIRMATION_MISMATCH/);
});

test('changed employee applicability between reviewed dry-run and apply rejects before D1 writes',()=>{
  const {mkdtempSync,mkdirSync,writeFileSync,chmodSync,existsSync}=requireTestFs;
  const {tmpdir}=requireTestOs;
  const {join}=requireTestPath;
  const {spawnSync}=requireTestChild;
  const temp=mkdtempSync(join(tmpdir(),'compliance2215-hash-'));
  const bin=join(temp,'bin');mkdirSync(bin);
  const dataPath=join(temp,'fixture.json');
  const writeLog=join(temp,'writes.log');
  const rule=(id,overrides={})=>({
    id,qualificacao_tipo_id:1000+id,escopo:'FUNCAO',setor_id:null,funcao_id:10,
    funcionario_id:null,aeronave_modelo:null,condicao_id:null,fundamento_tipo:'MATRIZ',
    vigencia_inicio:null,vigencia_fim:null,obrigatoriedade:'OBRIGATORIA',
    perfil_competencia:null,modalidade_requerida:null,auto_matricular_ead:0,
    ativo:1,deleted_at:null,codigo:'TEST_'+id,categoria:'EAD',
    qualification_deleted:null,published_courses:1,...overrides,
  });
  const rules=[
    ...ids.map(id=>rule(id)),
    ...[237,240,242,244,256,665,666,667].map(id=>
      rule(id,{qualification_deleted:'2026-10-01',categoria:'Outros',published_courses:0})),
    rule(104,{escopo:'FUNCIONARIO',qualificacao_tipo_id:45,modalidade_requerida:'EAD',published_courses:0}),
    rule(480,{escopo:'EMPRESA',qualificacao_tipo_id:120,condicao_id:12,
      fundamento_tipo:'DESIGNACAO',published_courses:0}),
    rule(668,{escopo:'EMPRESA',qualificacao_tipo_id:203,condicao_id:36,
      fundamento_tipo:'DESIGNACAO',auto_matricular_ead:1,published_courses:0}),
    rule(677,{qualificacao_tipo_id:189,modalidade_requerida:'EAD',published_courses:0}),
    rule(678,{qualificacao_tipo_id:189,modalidade_requerida:'EAD',published_courses:0}),
    rule(703,{escopo:'EMPRESA',qualificacao_tipo_id:102,auto_matricular_ead:1}),
  ].sort((a,b)=>a.id-b.id);
  const drafts=Object.entries({75:189,80:45,81:120,82:203}).map(([id,qualification])=>({
    id:Number(id),qualificacao_tipo_id:qualification,publicado:0,ativo:1,
    deleted_at:null,scorm_package_r2_prefix:null,
  }));
  const save=()=>writeFileSync(dataPath,JSON.stringify({rules,drafts}));
  save();
  const executable=join(bin,'npx');
  writeFileSync(executable,[
    '#!/usr/bin/env node',
    "const fs=require('fs');",
    "const args=process.argv;",
    "const sql=args[args.indexOf('--command')+1];",
    "const fixture=JSON.parse(fs.readFileSync(process.env.FAKE_D1_ROWS,'utf8'));",
    "const table=sql.includes('FROM treinamento_requisitos tr')?'rules':'drafts';",
    "if(!/^\\s*SELECT\\b/i.test(sql)){fs.appendFileSync(process.env.FAKE_D1_WRITES,'mutation\\n');process.exit(9)}",
    "process.stdout.write(JSON.stringify([{success:true,results:fixture[table],meta:{changes:0}}]));"
  ].join('\n')+'\n');
  chmodSync(executable,0o755);
  const run=(mode,hash)=>spawnSync(process.execPath,
    ['scripts/production/finalize-compliance-lms-2215.mjs',mode],
    {encoding:'utf8',env:{...process.env,
      PATH:bin+':'+process.env.PATH,FAKE_D1_ROWS:dataPath,FAKE_D1_WRITES:writeLog,
      COMPLIANCE_2215_CONFIRMATION:mode==='apply'
        ?'AIRTRUST_2215_PRODUCTION_FINALIZE_EXACT_REVIEWED_RULES_NO_CONTENT_NO_EMAIL'
        :'AIRTRUST_2215_DRYRUN_ONLY',
      COMPLIANCE_2215_EXPECTED_HASH:hash||'',
    }});
  const prior=run('dry-run');
  assert.equal(prior.status,0,prior.stderr);
  const hash=JSON.parse(prior.stdout).before_hash;
  assert.match(hash,/^[a-f0-9]{64}$/);
  rules.find(r=>r.id===ids[0]).funcao_id=11;
  save();
  const apply=run('apply',hash);
  assert.notEqual(apply.status,0);
  assert.match(apply.stderr,/REVIEWED_STATE_HASH_MISMATCH/);
  assert.equal(existsSync(writeLog),false,'no mutating D1 call after changed scope');
});

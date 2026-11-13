#!/usr/bin/env node
// Governed tenant-6 pre-enrollment only; no published content or certificates.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import {
  assertAllowedProductionBaseUrl, login, selectEmpresa, extractAccessToken,
  decodeJwtPayload, fetchJson,
} from '../smoke-auth-common.mjs';

const TENANT = 6;
const MODE = process.argv[2] || 'dry-run';
const SHA = process.env.COMPLIANCE_DRAFT_EXPECTED_SHA;
const API = assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL || 'https://api.airtrust.online');
const TYPES = [45, 120, 189, 203];
const CREATE = [45, 120, 203];
const RULES = [104, 480, 668, 677, 678];
const check = (ok, code) => { if (!ok) throw new Error(code); };
const hash = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');

function select(sql, label) {
  check(/^SELECT\b/i.test(sql) && !/\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b/i.test(sql), 'QUERY_NOT_READONLY');
  const r = spawnSync('npx', ['wrangler','d1','execute','airtrust-db','--env','production','--remote','--json','--command',sql], {
    cwd: new URL('../../worker-airtrust/', import.meta.url), encoding: 'utf8', timeout: 90_000, maxBuffer: 8_000_000,
  });
  let body; try { body = JSON.parse(r.stdout); } catch {}
  const result = Array.isArray(body) ? body[0] : body;
  check(r.status === 0 && result?.success && Array.isArray(result.results), 'D1_READ_FAILED_'+label);
  check(!result.meta?.changed_db && !result.meta?.rows_written, 'D1_UNEXPECTED_WRITE_'+label);
  return result.results;
}
export function snapshot() {
  const q = select(`SELECT id,nome,categoria,ativo,deleted_at,descricao,conteudo_programatico,
    observacoes,referencias,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,
    validade,area_id FROM qualificacoes_tipos
    WHERE empresa_id=6 AND id IN (45,120,189,203) ORDER BY id`, 'QUALIFICATIONS');
  check(JSON.stringify(q.map(x => Number(x.id))) === JSON.stringify(TYPES), 'QUALIFICATION_SCOPE_DRIFT');
  check(q.every(x => Number(x.ativo) === 1 && x.deleted_at === null
    && ['EAD','TREINAMENTO EAD'].includes(String(x.categoria).toUpperCase())), 'QUALIFICATION_INACTIVE');
  const courses = select(`SELECT id,qualificacao_tipo_id,ativo,publicado,deleted_at,
    tipo_conteudo,scorm_package_r2_prefix,scorm_launch_file FROM lms_cursos
    WHERE empresa_id=6 AND qualificacao_tipo_id IN (45,120,189,203)
    ORDER BY qualificacao_tipo_id,id`, 'COURSES');
  const active = courses.filter(c => Number(c.ativo) === 1 && c.deleted_at === null);
  check(active.some(x => Number(x.id) === 75 && Number(x.qualificacao_tipo_id) === 189),
    'NR12_DRAFT_MISSING');
  for (const type of TYPES) {
    const candidates = active.filter(x => Number(x.qualificacao_tipo_id) === type);
    check(candidates.length === 1 || (CREATE.includes(type) && candidates.length === 0),
      'DUPLICATE_OR_MISSING_DRAFT_'+type);
    for (const row of candidates) check(
      Number(row.publicado) === 0 && !row.scorm_package_r2_prefix && !row.scorm_launch_file,
      'DRAFT_HAS_EXECUTABLE_CONTENT_'+type,
    );
  }
  const rules = select(`SELECT id,qualificacao_tipo_id,escopo,condicao_id,
      funcao_id,funcionario_id,auto_matricular_ead,modalidade_requerida
    FROM treinamento_requisitos WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
    AND id IN (104,480,668,677,678) ORDER BY id`, 'RULES');
  check(JSON.stringify(rules.map(x => Number(x.id))) === JSON.stringify(RULES), 'RULE_SCOPE_CHANGED');
  check(Number(rules[0].funcionario_id) === 6
    && Number(rules[3].funcao_id) === 5 && Number(rules[4].funcao_id) === 38
    && Number(rules[1].condicao_id) === 12 && Number(rules[2].condicao_id) === 36,
    'RULE_APPLICABILITY_CHANGED');
  const employees = select(`SELECT f.id,f.funcao_id FROM funcionarios f
    WHERE f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
      AND UPPER(TRIM(COALESCE(f.status,'')))='ATIVO'
      AND f.funcao_id IN (5,38) ORDER BY f.id`, 'NR12_EMPLOYEES');
  check(employees.length === 26 && new Set(employees.map(x => x.id)).size === 26, 'NR12_ROSTER_CHANGED');
  const evidence = select(`SELECT funcionario_id,status,data_vencimento,deleted_at,renovada
    FROM qualificacoes_historico WHERE empresa_id=6 AND qualificacao_id=189
    ORDER BY funcionario_id,id`, 'NR12_HISTORY');
  check(evidence.length === 0, 'NR12_HISTORY_REVIEW_REQUIRED');
  const enroll = select(`SELECT id,funcionario_id,curso_id,status,deleted_at
    FROM lms_matriculas WHERE empresa_id=6 AND curso_id=75 ORDER BY id`, 'NR12_ENROLLMENTS');
  const expectedIds = new Set(employees.map(x => Number(x.id)));
  check(enroll.every(x => expectedIds.has(Number(x.funcionario_id))
    && Number(x.curso_id) === 75 && x.deleted_at === null && x.status === 'NAO_INICIADO')
    && new Set(enroll.map(x => Number(x.funcionario_id))).size === enroll.length,
    'NR12_ENROLLMENT_REVIEW_REQUIRED');
  const designations = select(`SELECT id,funcionario_id,condicao_id FROM funcionarios_compliance_condicoes
    WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND condicao_id IN (12,36)
    ORDER BY id`, 'DRAFT_DESIGNATIONS');
  check(designations.length === 0, 'DRAFT_DESIGNATIONS_REQUIRE_EVIDENCE_REVIEW');
  const examiner = select(`SELECT id,status,data_vencimento,deleted_at FROM qualificacoes_historico
    WHERE empresa_id=6 AND funcionario_id=6 AND qualificacao_id=45 ORDER BY id`, 'EXAMINER_HISTORY');
  check(examiner.some(x => x.status === 'CONCLUIDA' && x.deleted_at === null
    && x.data_vencimento >= '2026-11-12'), 'EXAMINER_HISTORY_MISSING');
  return { q, courses, rules, employees, evidence, enroll, designations, examiner };
}
async function admin() {
  check(Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD), 'ADMIN_CREDS_MISSING');
  const loginResult = await login(API, process.env.E2E_EMAIL, process.env.E2E_PASSWORD);
  let token = extractAccessToken(loginResult);
  check(typeof token === 'string' && token.length > 20, 'LOGIN_FAILED');
  if (Number(decodeJwtPayload(token)?.empresa_id) !== TENANT) {
    const change = await selectEmpresa(API,token,TENANT);
    check(change.status === 200, 'TENANT_SELECTION_DENIED');
    token = extractAccessToken(change.json);
  }
  check(Number(decodeJwtPayload(token)?.empresa_id) === TENANT, 'TENANT_MISMATCH');
  const me = await fetchJson(API+'/api/auth/me', { headers: {Authorization:'Bearer '+token}});
  check(me.status === 200 && me.json?.success === true
    && ['admin','administrador'].includes(String(me.json.data?.role || '').toLowerCase()),
    'ADMIN_ROLE_REQUIRED');
  return token;
}
async function request(token, path, body, label) {
  const result = await fetchJson(API+path, {
    method:'POST', headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body: JSON.stringify(body),
  });
  check(result.status >= 200 && result.status < 300 && result.json?.success === true,
    label+'_FAILED_HTTP_'+result.status);
  return result.json.data;
}
function publish(out) {
  const text = JSON.stringify(out,null,2)+'\n';
  if (process.env.COMPLIANCE_DRAFT_RESULT) writeFileSync(process.env.COMPLIANCE_DRAFT_RESULT,text,{mode:0o600});
  else process.stdout.write(text);
}
export async function main() {
  check(['dry-run','apply'].includes(MODE), 'INVALID_MODE');
  check(process.env.GITHUB_REF === 'refs/heads/main' && process.env.GITHUB_SHA === SHA,
    'REVIEWED_SHA_MISMATCH');
  check(process.env.COMPLIANCE_DRAFT_CONFIRMATION ===
    (MODE === 'apply' ? 'COMPLIANCE_DRAFT_3_COURSES_26_ENROLLMENTS_NO_INVITE'
      : 'COMPLIANCE_DRAFT_DRYRUN_ONLY'), 'CONFIRMATION_INVALID');
  const version = await fetchJson(API+'/api/version');
  check(version.status === 200 && version.json?.data?.sourceSha === SHA, 'PRODUCTION_SHA_MISMATCH');
  const before = snapshot();
  const digest = hash(before);
  const summary = {
    mode:MODE,sha:SHA,tenant:TENANT,original_state_hash:digest,
    existing_draft_course_id:75,proposed_course_qualifications:CREATE.filter(type=>!before.courses.some(x=>Number(x.qualificacao_tipo_id)===type && Number(x.ativo)===1 && x.deleted_at===null)),
    nr12_expected_staff:before.employees.length,examiner_preserved:true,
    pending_designations:0, published_courses_created:0, certificates_created:0,
    email_sent:false,mutated:false,
  };
  if (MODE === 'dry-run') {publish(summary);return;}
  check(process.env.COMPLIANCE_DRAFT_REVIEWED_HASH === digest, 'PREFLIGHT_DRIFT');
  const token = await admin();
  const configuredRules = [];
  for (const id of [104,677,678]) {
    const rule = before.rules.find(row => Number(row.id)===id);
    check(Number(rule.auto_matricular_ead)===0
      && [null,'EAD'].includes(rule.modalidade_requerida), 'RULE_POLICY_DRIFT_'+id);
    if (rule.modalidade_requerida !== 'EAD') {
      const response=await fetchJson(API+'/api/compliance-treinamentos/regras/'+id,{
        method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({modalidade_requerida:'EAD',auto_matricular_ead:false}),
      });
      check(response.status===200 && response.json?.success===true,
        'RULE_CONFIGURATION_FAILED_'+id);
      configuredRules.push(id);
    }
  }
  const created = [];
  for (const id of summary.proposed_course_qualifications) {
    const q = before.q.find(x => Number(x.id) === id);
    const minutes = Math.round(Number(q.carga_horaria || 0)*60);
    const course = await request(token,'/api/lms/cursos',{
      titulo:q.nome, descricao:q.descricao, categoria:'EAD',
      carga_horaria_minutos:minutes, idioma:'pt-BR', conteudo_programatico:q.conteudo_programatico,
      observacoes:q.observacoes, referencias:q.referencias,
      carga_horaria_inicial_horas:q.carga_horaria_inicial,
      carga_horaria_recorrente_horas:q.carga_horaria_recorrente,
      qualificacao_area_id:q.area_id, qualificacao_tipo_id:id,
      tipo_conteudo:'scorm', scorm_versao:'1.2', scorm_mastery_score:80,
      scorm_assessment_policy:'SCORED',gerar_qualificacao_ao_concluir:1,publicado:0,
    },'CREATE_COURSE_'+id);
    check(Number(course?.qualificacao_tipo_id) === id && Number(course?.publicado) === 0,
      'CREATED_COURSE_NOT_DRAFT_'+id);
    created.push({qualification_id:id,course_id:Number(course.id)});
  }
  const existingIds = new Set(before.enroll.map(x => Number(x.funcionario_id)));
  const missingIds = before.employees.map(x => Number(x.id)).filter(id => !existingIds.has(id));
  if (missingIds.length) {
    const nr12 = await request(token,'/api/lms/matriculas/lote',{
      funcionario_ids:missingIds,
      curso_id:75,enviar_convite_email:false,data_expiracao:null,
      observacoes:'PRE_MATRICULA_CONFORME_REGRAS_677_678 | SCORM_PENDENTE | SEM_CONVOCACAO',
    },'NR12_PRE_ENROLL');
    check(Number(nr12?.erros) === 0 && Number(nr12?.criadas) === missingIds.length,
      'NR12_PARTIAL_RESULT');
  }
  const after = select(`SELECT id,funcionario_id,curso_id,status,deleted_at FROM lms_matriculas
    WHERE empresa_id=6 AND curso_id=75 ORDER BY funcionario_id,id`, 'NR12_POST');
  check(after.length === 26 && after.every(x => x.deleted_at === null && x.status === 'NAO_INICIADO'),
    'NR12_POSTCONDITIONS_FAILED');
  const cycles = select(`SELECT COUNT(*) n FROM lms_matricula_ciclos cy JOIN lms_matriculas m
    ON m.id=cy.matricula_id AND m.empresa_id=cy.empresa_id
    WHERE m.empresa_id=6 AND m.curso_id=75 AND m.deleted_at IS NULL
      AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL AND cy.status='NAO_INICIADO'`, 'NR12_CYCLES');
  check(Number(cycles[0]?.n) === 26, 'NR12_CYCLES_MISSING');
  const postRules=select(`SELECT id,modalidade_requerida,auto_matricular_ead
    FROM treinamento_requisitos WHERE empresa_id=6 AND id IN (104,677,678)
      AND ativo=1 AND deleted_at IS NULL ORDER BY id`, 'RULES_POST');
  check(postRules.length===3 && postRules.every(r=>r.modalidade_requerida==='EAD'
    && Number(r.auto_matricular_ead)===0), 'RULE_POLICY_POSTCONDITIONS_FAILED');
  const postCourses = select(`SELECT id,qualificacao_tipo_id,ativo,publicado,deleted_at,
    scorm_package_r2_prefix,scorm_launch_file FROM lms_cursos WHERE empresa_id=6
    AND qualificacao_tipo_id IN (45,120,189,203) ORDER BY qualificacao_tipo_id,id`, 'DRAFT_COURSES_POST');
  check(TYPES.every(type=>postCourses.filter(x=>Number(x.qualificacao_tipo_id)===type
    && Number(x.ativo)===1 && x.deleted_at===null
    && Number(x.publicado)===0 && !x.scorm_package_r2_prefix
    && !x.scorm_launch_file).length===1), 'DRAFT_COURSES_POSTCONDITIONS_FAILED');
  publish({...summary,created_draft_courses:created,configured_rules:configuredRules,nr12_enrollments_verified:26,
    nr12_cycles_verified:26,postconditions_verified:true,mutated:true});
}
if (import.meta.url === 'file://'+process.argv[1])
  main().catch(e => {console.error('DRAFT_PREPARATION_ERROR:'+String(e.message || e).replace(/[^A-Z0-9_:-]/gi,'_').slice(0,140));process.exitCode=1;});

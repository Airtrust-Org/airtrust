#!/usr/bin/env node

// source_reference: tenant-6 production read-only D1 inventory 2026-10-05; global active-employee LMS enrollment reconciliation against the effective mandatory EAD matrix.
// operational_decision: first align active enrollments to the reviewed organizational company/sector/function matrix; defer designation/individual-only missing enrollments, while still cancelling globally mismatched active enrollments and preserving all historical/progress evidence.
// dry_run_required: production apply requires a successful reviewed dry-run on the exact same SHA with identical candidate counts and hashes.
// rollback_plan_required: workflow captures a D1 Time Travel recovery point immediately before apply; cancellation changes active enrollment status only and preserves progress, runtime evidence, completion evidence and qualification history.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const DB_NAME = 'airtrust-db';
const EMPRESA_ID = 6;
const API_BASE = process.env.PROD_API_BASE_URL || 'https://api.airtrust.online';
const REPAIR_MARKER = 'Matrícula criada pela reconciliação exata da matriz obrigatória EAD — lote autorizado pela Gerência de Treinamento.';
const DRY_CONFIRM = 'AIRTRUST_PRODUCTION_DRYRUN_COMPLIANCE_MATRIX_ENROLLMENT_REPAIR';
const APPLY_CONFIRM = 'AIRTRUST_PRODUCTION_APPLY_COMPLIANCE_MATRIX_ENROLLMENT_REPAIR_CANCEL_NONREQUIRED_NO_EMAIL';

const mode = process.argv[2] || process.env.TRAINING_COMPLIANCE_MATRIX_REPAIR_MODE || 'dry-run';

function fail(code) {
  console.error(`TRAINING_COMPLIANCE_MATRIX_REPAIR_ERROR:${code}`);
  process.exit(1);
}

if (!['dry-run', 'apply'].includes(mode)) fail('INVALID_MODE');
const confirmation = process.env.TRAINING_COMPLIANCE_MATRIX_REPAIR_CONFIRMATION || '';
if (mode === 'dry-run' && confirmation !== DRY_CONFIRM) fail('DRYRUN_CONFIRMATION_REQUIRED');
if (mode === 'apply' && confirmation !== APPLY_CONFIRM) fail('APPLY_CONFIRMATION_REQUIRED');
if ((process.env.TRAINING_COMPLIANCE_PRODUCTION_DB_NAME || DB_NAME) !== DB_NAME) fail('PRODUCTION_DB_TARGET_REJECTED');

function sha(values) {
  return createHash('sha256').update(values.join(',')).digest('hex');
}

function runWrangler(sql, label, { mutating = false } = {}) {
  const normalized = String(sql).trim().replace(/;+\s*$/g, '');
  if (!mutating) {
    if (!/^(SELECT|WITH)\b/i.test(normalized)) fail(`NON_SELECT_${label}`);
    if (/\b(?:INSERT\s+INTO|UPDATE\s+[A-Za-z_]|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+TABLE|VACUUM|ATTACH|DETACH|REINDEX)\b/i.test(normalized)) {
      fail(`MUTATING_PREFLIGHT_${label}`);
    }
  }
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB_NAME, '--env', 'production', '--remote', '--json', '--command', normalized],
    {
      cwd: new URL('../../worker-airtrust/', import.meta.url),
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || '');
    fail(`D1_OPERATION_FAILED_${label}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout || '[]');
  } catch {
    fail(`D1_JSON_INVALID_${label}`);
  }
  const envelope = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!envelope || !Array.isArray(envelope.results)) fail(`D1_RESULTS_MISSING_${label}`);
  return envelope.results;
}

function baseCte() {
  return `WITH eligible AS (
    SELECT f.id funcionario_id, tr.id regra_id, tr.qualificacao_tipo_id, tr.obrigatoriedade, tr.condicao_id, tr.escopo, tr.fundamento_tipo,
           (CASE tr.escopo WHEN 'FUNCIONARIO' THEN 5000 WHEN 'SETOR_FUNCAO' THEN 40 WHEN 'FUNCAO' THEN 30 WHEN 'SETOR' THEN 20 WHEN 'EMPRESA' THEN 10 ELSE 0 END
            + CASE WHEN tr.condicao_id IS NOT NULL THEN 1000 ELSE 0 END
            + CASE WHEN NULLIF(TRIM(tr.aeronave_modelo),'') IS NOT NULL THEN 100 ELSE 0 END) prioridade
      FROM funcionarios f
      JOIN treinamento_requisitos tr ON tr.empresa_id=f.empresa_id
     WHERE f.empresa_id=${EMPRESA_ID}
       AND f.deleted_at IS NULL
       AND COALESCE(f.ativo,1)=1
       AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO'
       AND tr.ativo=1 AND tr.deleted_at IS NULL
       AND (tr.vigencia_inicio IS NULL OR date(tr.vigencia_inicio)<=date('now'))
       AND (tr.vigencia_fim IS NULL OR date(tr.vigencia_fim)>=date('now'))
       AND (
         tr.escopo='EMPRESA'
         OR (tr.escopo='SETOR' AND tr.setor_id=f.setor_id)
         OR (tr.escopo='FUNCAO' AND tr.funcao_id=f.funcao_id)
         OR (tr.escopo='SETOR_FUNCAO' AND tr.setor_id=f.setor_id AND tr.funcao_id=f.funcao_id)
         OR (tr.escopo='FUNCIONARIO' AND tr.funcionario_id=f.id)
       )
       AND (
         tr.condicao_id IS NULL OR EXISTS (
           SELECT 1 FROM funcionarios_compliance_condicoes fcc
            WHERE fcc.funcionario_id=f.id
              AND fcc.empresa_id=tr.empresa_id
              AND fcc.condicao_id=tr.condicao_id
              AND fcc.ativo=1 AND fcc.deleted_at IS NULL
              AND (fcc.data_inicio IS NULL OR date(fcc.data_inicio)<=date('now'))
              AND (fcc.data_fim IS NULL OR date(fcc.data_fim)>=date('now'))
         )
       )
       AND (
         tr.aeronave_modelo IS NULL OR TRIM(tr.aeronave_modelo)=''
         OR EXISTS (
           SELECT 1
             FROM funcionarios_aeronaves fa
             JOIN aeronaves a ON a.id=fa.aeronave_id AND a.empresa_id=tr.empresa_id AND a.deleted_at IS NULL
            WHERE fa.funcionario_id=f.id
              AND fa.deleted_at IS NULL AND COALESCE(fa.ativo,1)=1
              AND (fa.data_inicio IS NULL OR date(fa.data_inicio)<=date('now'))
              AND (fa.data_fim IS NULL OR date(fa.data_fim)>=date('now'))
              AND UPPER(REPLACE(TRIM(a.modelo),' ',''))=UPPER(REPLACE(TRIM(tr.aeronave_modelo),' ',''))
         )
         OR (
           NOT EXISTS (
             SELECT 1 FROM funcionarios_aeronaves fax
              WHERE fax.funcionario_id=f.id
                AND fax.deleted_at IS NULL AND COALESCE(fax.ativo,1)=1
           )
           AND ('|' || UPPER(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(f.aeronave,''),' ',''),'/','|'),';','|'),',','|')) || '|')
               LIKE '%|' || UPPER(REPLACE(TRIM(tr.aeronave_modelo),' ','')) || '|%'
         )
       )
  ), ranked AS (
    SELECT *, ROW_NUMBER() OVER (
      PARTITION BY funcionario_id,qualificacao_tipo_id
      ORDER BY prioridade DESC,regra_id DESC
    ) rn
      FROM eligible
  ), expected AS (
    SELECT r.funcionario_id,r.qualificacao_tipo_id,qt.codigo,qt.nome,r.condicao_id,r.escopo,r.fundamento_tipo
      FROM ranked r
      JOIN qualificacoes_tipos qt ON qt.id=r.qualificacao_tipo_id AND qt.empresa_id=${EMPRESA_ID}
     WHERE r.rn=1
       AND r.obrigatoriedade='OBRIGATORIA'
       AND qt.deleted_at IS NULL AND COALESCE(qt.ativo,1)=1
       AND UPPER(TRIM(COALESCE(qt.categoria,''))) IN ('EAD','TREINAMENTO EAD')
  ), enrollment_target AS (
    SELECT *
      FROM expected
     WHERE condicao_id IS NULL
       AND escopo IN ('EMPRESA','SETOR','FUNCAO','SETOR_FUNCAO')
       AND UPPER(TRIM(COALESCE(fundamento_tipo,'')))<>'DESIGNACAO'
       AND UPPER(TRIM(COALESCE(codigo,''))) NOT IN (
         'I','L','FDM-EAD','GATEKEEPER','LOSA','PPSP_SUP','E8',
         'NR-05','BRIGADA_INCENDIO','PRIMEIROS_SOCORROS','NR-12',
         'AUDITOR_INTERNO','AUDITOR_COMPORTAMENTAL'
       )
  ), active_enroll AS (
    SELECT DISTINCT m.funcionario_id,c.qualificacao_tipo_id
      FROM lms_matriculas m
      JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=m.empresa_id
      JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id AND c.deleted_at IS NULL
     WHERE m.empresa_id=${EMPRESA_ID}
       AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1
       AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO'
       AND m.deleted_at IS NULL
       AND UPPER(COALESCE(m.status,''))!='CANCELADO'
  ), active_courses AS (
    SELECT qualificacao_tipo_id,COUNT(*) n_courses,MIN(id) course_id
      FROM lms_cursos
     WHERE empresa_id=${EMPRESA_ID}
       AND deleted_at IS NULL AND COALESCE(ativo,1)=1
       AND qualificacao_tipo_id IS NOT NULL
     GROUP BY qualificacao_tipo_id
  )`;
}

function readState() {
  const expectedSummary = runWrangler(
    `${baseCte()}
     SELECT COUNT(*) expected_pairs,
            SUM(CASE WHEN ae.funcionario_id IS NULL THEN 1 ELSE 0 END) missing_pairs
       FROM enrollment_target e
       LEFT JOIN active_enroll ae ON ae.funcionario_id=e.funcionario_id AND ae.qualificacao_tipo_id=e.qualificacao_tipo_id`,
    'expected_summary',
  )[0] || {};

  const missingRows = runWrangler(
    `${baseCte()}
     SELECT e.funcionario_id,e.qualificacao_tipo_id,e.codigo,e.nome,
            COALESCE(ac.n_courses,0) n_courses,ac.course_id
       FROM enrollment_target e
       LEFT JOIN active_enroll ae ON ae.funcionario_id=e.funcionario_id AND ae.qualificacao_tipo_id=e.qualificacao_tipo_id
       LEFT JOIN active_courses ac ON ac.qualificacao_tipo_id=e.qualificacao_tipo_id
      WHERE ae.funcionario_id IS NULL
      ORDER BY e.funcionario_id,e.qualificacao_tipo_id`,
    'missing_pairs',
  );

  const wrongRows = runWrangler(
    `${baseCte()}, active_global AS (
       SELECT m.id,m.funcionario_id,c.qualificacao_tipo_id,qt.categoria,m.status,m.progresso_pct,m.data_inicio,m.data_conclusao,m.qualificacao_historico_id,
              EXISTS(SELECT 1 FROM lms_progresso_scorm ps WHERE ps.matricula_id=m.id AND ps.empresa_id=m.empresa_id) has_scorm,
              EXISTS(SELECT 1 FROM lms_xapi_statements xs WHERE xs.matricula_id=m.id AND xs.empresa_id=m.empresa_id) has_xapi,
              EXISTS(SELECT 1 FROM lms_completion_diagnostics_snapshots ds WHERE ds.matricula_id=m.id AND ds.empresa_id=m.empresa_id) has_diag,
              EXISTS(SELECT 1 FROM qualificacoes_historico qh WHERE qh.lms_matricula_id=m.id AND qh.empresa_id=m.empresa_id AND qh.deleted_at IS NULL) has_history,
              CASE WHEN EXISTS(
                SELECT 1 FROM treinamento_matricula_reconciliacoes tmr
                 WHERE tmr.empresa_id=m.empresa_id
                   AND tmr.matricula_id=m.id
                   AND tmr.ativo=1 AND tmr.deleted_at IS NULL
                   AND UPPER(TRIM(COALESCE(tmr.decisao,'')))='MANTER_AVULSA'
              ) THEN 1 ELSE 0 END keep_standalone
         FROM lms_matriculas m
         JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=m.empresa_id
         JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id AND c.deleted_at IS NULL
         LEFT JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id AND qt.deleted_at IS NULL
        WHERE m.empresa_id=${EMPRESA_ID}
          AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO'
          AND m.deleted_at IS NULL
          AND UPPER(COALESCE(m.status,''))!='CANCELADO'
     )
     SELECT a.id,a.funcionario_id,a.qualificacao_tipo_id,a.categoria,a.status,a.progresso_pct,a.data_inicio,a.data_conclusao,a.qualificacao_historico_id,a.has_scorm,a.has_xapi,a.has_diag,a.has_history
       FROM active_global a
       LEFT JOIN expected e ON e.funcionario_id=a.funcionario_id AND e.qualificacao_tipo_id=a.qualificacao_tipo_id
      WHERE a.keep_standalone=0
        AND (
          a.qualificacao_tipo_id IS NULL
          OR UPPER(TRIM(COALESCE(a.categoria,''))) NOT IN ('EAD','TREINAMENTO EAD')
          OR e.funcionario_id IS NULL
        )
      ORDER BY a.id`,
    'wrong_global_pairs',
  );

  const unsafeWrong = wrongRows.filter((row) => {
    return !(
      String(row.status || '').toUpperCase() === 'NAO_INICIADO' &&
      Number(row.progresso_pct || 0) === 0 &&
      row.data_inicio == null &&
      row.data_conclusao == null &&
      row.qualificacao_historico_id == null &&
      Number(row.has_scorm || 0) === 0 &&
      Number(row.has_xapi || 0) === 0 &&
      Number(row.has_diag || 0) === 0 &&
      Number(row.has_history || 0) === 0
    );
  });

  const noCourseTypesMap = new Map();
  const ambiguousCourseTypesMap = new Map();
  for (const row of missingRows) {
    const typeId = Number(row.qualificacao_tipo_id);
    const nCourses = Number(row.n_courses || 0);
    if (nCourses === 0) noCourseTypesMap.set(typeId, { id: typeId, codigo: row.codigo, nome: row.nome });
    if (nCourses > 1) ambiguousCourseTypesMap.set(typeId, { id: typeId, codigo: row.codigo, nome: row.nome, n_courses: nCourses });
  }

  const missingKeys = missingRows.map((row) => `${Number(row.funcionario_id)}:${Number(row.qualificacao_tipo_id)}`).sort();
  const wrongIds = wrongRows.map((row) => Number(row.id)).sort((a, b) => a - b);
  const noCourseTypes = [...noCourseTypesMap.values()].sort((a, b) => a.id - b.id);
  const ambiguousCourseTypes = [...ambiguousCourseTypesMap.values()].sort((a, b) => a.id - b.id);

  return {
    expected_pairs: Number(expectedSummary.expected_pairs || 0),
    missing_rows: missingRows,
    missing_count: missingRows.length,
    missing_hash: sha(missingKeys),
    wrong_rows: wrongRows,
    wrong_count: wrongRows.length,
    wrong_hash: sha(wrongIds.map(String)),
    unsafe_wrong_count: unsafeWrong.length,
    no_course_types: noCourseTypes,
    no_course_count: noCourseTypes.length,
    no_course_hash: sha(noCourseTypes.map((row) => String(row.id))),
    ambiguous_course_types: ambiguousCourseTypes,
  };
}

async function login(email, password) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha: password }),
        signal: AbortSignal.timeout(20000),
      });
      const json = await response.json().catch(() => null);
      if (response.status === 429 && attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 8000)));
        continue;
      }
      const token = String(json?.data?.accessToken || '');
      if (!response.ok || json?.success !== true || token.length < 20) {
        throw new Error(`AUTH_HTTP_${response.status}:${String(json?.code || json?.error || 'LOGIN_FAILED').slice(0, 120)}`);
      }
      return token;
    } catch (error) {
      lastError = error;
      if (attempt === 5) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 8000)));
    }
  }
  throw lastError || new Error('AUTH_FAILED');
}

async function apiJson(token, path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30000),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.success === false) {
    throw new Error(`${path}_HTTP_${response.status}:${String(json?.code || json?.error || 'API_ERROR').slice(0, 160)}`);
  }
  return json;
}

async function ensureRequiredEadCourses(token, state) {
  for (const type of state.no_course_types) {
    await apiJson(token, '/api/lms/cursos', {
      method: 'POST',
      body: JSON.stringify({
        titulo: type.nome,
        descricao: 'Curso EAD placeholder criado para requisito obrigatório da matriz de Compliance. Conteúdo será carregado posteriormente.',
        categoria: 'EAD',
        qualificacao_tipo_id: type.id,
        tipo_conteudo: 'scorm',
        gerar_qualificacao_ao_concluir: 1,
        publicado: 0,
        observacoes: 'Placeholder EAD criado pela reconciliação exata da matriz obrigatória.',
      }),
    });
  }
}

function chunk(items, size = 200) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function enrollMissingPairs(token) {
  const state = readState();
  if (state.ambiguous_course_types.length > 0) fail('AMBIGUOUS_ACTIVE_COURSE_MAPPING');
  if (state.no_course_count > 0) fail('REQUIRED_EAD_COURSE_STILL_MISSING_AFTER_CREATE');

  const byCourse = new Map();
  for (const row of state.missing_rows) {
    const courseId = Number(row.course_id);
    if (!Number.isInteger(courseId) || courseId <= 0) fail('COURSE_ID_MISSING_FOR_EXPECTED_PAIR');
    const ids = byCourse.get(courseId) || [];
    ids.push(Number(row.funcionario_id));
    byCourse.set(courseId, ids);
  }

  let created = 0;
  let ignored = 0;
  let errors = 0;
  for (const [courseId, employeeIds] of byCourse.entries()) {
    for (const employeeChunk of chunk([...new Set(employeeIds)].sort((a, b) => a - b), 200)) {
      const json = await apiJson(token, '/api/lms/matriculas/lote', {
        method: 'POST',
        body: JSON.stringify({
          funcionario_ids: employeeChunk,
          curso_id: courseId,
          observacoes: REPAIR_MARKER,
          enviar_convite_email: false,
        }),
      });
      const data = json?.data || {};
      created += Number(data.criadas || 0);
      ignored += Number(data.ignoradas || 0);
      errors += Number(data.erros || 0);
    }
  }
  if (errors > 0) fail(`ENROLLMENT_API_ERRORS_${errors}`);
  return { created, ignored, errors };
}

function cancelReviewedWrongEnrollments(ids) {
  if (ids.length === 0) return 0;
  const idList = ids.join(',');
  runWrangler(
    `INSERT INTO audit_logs (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at)
     SELECT NULL,'LMS_MATRICULA_COMPLIANCE_MATRIX_REPAIR','lms_matriculas',m.id,
            json_object('status',m.status,'progresso_pct',COALESCE(m.progresso_pct,0)),
            '{"status":"CANCELADO","reason":"not_mandatory_ead_in_current_matrix"}',${EMPRESA_ID},datetime('now')
       FROM lms_matriculas m
      WHERE m.empresa_id=${EMPRESA_ID} AND m.id IN (${idList}) AND m.deleted_at IS NULL`,
    'audit_wrong_enrollments',
    { mutating: true },
  );
  runWrangler(
    `UPDATE notificacoes_inapp
        SET deleted_at=COALESCE(deleted_at,datetime('now'))
      WHERE empresa_id=${EMPRESA_ID} AND deleted_at IS NULL
        AND referencia_tipo='lms_matricula'
        AND CAST(referencia_id AS INTEGER) IN (${idList})`,
    'hide_wrong_notifications',
    { mutating: true },
  );
  runWrangler(
    `UPDATE lms_matricula_ciclos
        SET status='CANCELADO',updated_at=datetime('now')
      WHERE empresa_id=${EMPRESA_ID} AND ciclo_atual=1 AND deleted_at IS NULL
        AND matricula_id IN (${idList})`,
    'cancel_wrong_cycles',
    { mutating: true },
  );
  runWrangler(
    `UPDATE lms_matriculas
        SET status='CANCELADO',updated_at=datetime('now')
      WHERE empresa_id=${EMPRESA_ID} AND id IN (${idList}) AND deleted_at IS NULL
        AND UPPER(COALESCE(status,''))!='CANCELADO'`,
    'cancel_wrong_enrollments',
    { mutating: true },
  );
  return ids.length;
}

function verifyReviewedState(state) {
  const expectedMissingCount = Number(process.env.TRAINING_COMPLIANCE_EXPECTED_MISSING_COUNT || -1);
  const expectedMissingHash = String(process.env.TRAINING_COMPLIANCE_EXPECTED_MISSING_HASH || '').toLowerCase();
  const expectedWrongCount = Number(process.env.TRAINING_COMPLIANCE_EXPECTED_WRONG_COUNT || -1);
  const expectedWrongHash = String(process.env.TRAINING_COMPLIANCE_EXPECTED_WRONG_HASH || '').toLowerCase();
  const expectedNoCourseCount = Number(process.env.TRAINING_COMPLIANCE_EXPECTED_NO_COURSE_COUNT || -1);
  const expectedNoCourseHash = String(process.env.TRAINING_COMPLIANCE_EXPECTED_NO_COURSE_HASH || '').toLowerCase();

  if (state.missing_count !== expectedMissingCount || state.missing_hash !== expectedMissingHash) fail('MISSING_CANDIDATE_SET_CHANGED');
  if (state.wrong_count !== expectedWrongCount || state.wrong_hash !== expectedWrongHash) fail('WRONG_CANDIDATE_SET_CHANGED');
  if (state.no_course_count !== expectedNoCourseCount || state.no_course_hash !== expectedNoCourseHash) fail('NO_COURSE_SET_CHANGED');
}

function sanitizedSummary(state) {
  return {
    mode,
    source_sha: process.env.GITHUB_SHA || null,
    empresa_id: EMPRESA_ID,
    enrollment_scope: 'organizational-role-matrix-only',
    expected_pairs: state.expected_pairs,
    missing_count: state.missing_count,
    missing_hash: state.missing_hash,
    wrong_count: state.wrong_count,
    wrong_hash: state.wrong_hash,
    unsafe_wrong_count: state.unsafe_wrong_count,
    wrong_with_evidence_count: state.unsafe_wrong_count,
    historical_evidence_preserved: true,
    no_course_count: state.no_course_count,
    no_course_hash: state.no_course_hash,
    no_course_codes: state.no_course_types.map((row) => String(row.codigo || row.id)),
    ambiguous_course_count: state.ambiguous_course_types.length,
    email_disabled: true,
    invitation_endpoint_called: false,
    pii_emitted: false,
  };
}

async function main() {
  const before = readState();
  if (before.ambiguous_course_types.length > 0) fail('AMBIGUOUS_ACTIVE_COURSE_MAPPING');

  const summary = sanitizedSummary(before);
  summary.mutation_executed = false;
  summary.created_courses = 0;
  summary.created_enrollments = 0;
  summary.ignored_existing = 0;
  summary.cancelled_wrong_enrollments = 0;
  summary.cancelled_wrong_with_evidence_enrollments = 0;

  if (mode === 'dry-run') {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  verifyReviewedState(before);
  const email = process.env.E2E_EMAIL || '';
  const password = process.env.E2E_PASSWORD || '';
  if (!email || !password) fail('PRODUCTION_ADMIN_CREDENTIALS_MISSING');

  const token = await login(email, password);
  await ensureRequiredEadCourses(token, before);
  summary.created_courses = before.no_course_count;

  const enrollmentResult = await enrollMissingPairs(token);
  summary.created_enrollments = enrollmentResult.created;
  summary.ignored_existing = enrollmentResult.ignored;

  summary.cancelled_wrong_enrollments = cancelReviewedWrongEnrollments(
    before.wrong_rows.map((row) => Number(row.id)).sort((a, b) => a - b),
  );
  summary.cancelled_wrong_with_evidence_enrollments = before.unsafe_wrong_count;

  const after = readState();
  if (after.missing_count !== 0) fail(`POST_MISSING_EXPECTED_PAIRS_${after.missing_count}`);
  if (after.wrong_count !== 0) fail(`POST_WRONG_GLOBAL_PAIRS_${after.wrong_count}`);
  if (after.no_course_count !== 0) fail(`POST_REQUIRED_EAD_COURSE_MISSING_${after.no_course_count}`);
  if (after.unsafe_wrong_count !== 0) fail('POST_UNSAFE_WRONG_ENROLLMENTS');

  Object.assign(summary, {
    mutation_executed: true,
    post_expected_pairs: after.expected_pairs,
    post_missing_count: after.missing_count,
    post_wrong_count: after.wrong_count,
    post_no_course_count: after.no_course_count,
    postconditions_verified: true,
  });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  console.error(`Production matrix enrollment repair failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

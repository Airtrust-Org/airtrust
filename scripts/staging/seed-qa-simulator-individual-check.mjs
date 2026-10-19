#!/usr/bin/env node

// source_reference: Frente 7 / issue #1548 — homologação de checks individuais de Simuladores.
// operational_decision: STAGING_ONLY; atua somente no tenant sintético qa_examiner_training do D1 de staging canônico.
// dry_run_required: o modo padrão nunca escreve; --apply exige confirmação explícita de staging.
// rollback_plan_required: --rollback --apply faz soft-delete apenas dos artefatos marcados por esta execução.
//   Evidências individuais CONFIRMADAS são imutáveis e protegidas contra DELETE físico (0554/0560): elas
//   permanecem como evidência órfã e sintética por desenho; o relatório identifica-as apenas por IDs numéricos.
//
// O seed recusa executar se Schema V2 0554 e 0560 não estiverem fisicamente aplicados no ledger.
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ALLOWED_D1 = 'airtrust-db-staging-baseline-20260701';
export const CONFIRM = 'AIRTRUST_STAGING_SIMULATOR_INDIVIDUAL_CHECK_QA';
export const TENANT = 'qa_examiner_training';

const esc = (v) => `'${String(v).replace(/'/g, "''")}'`;

export function assertCode(code, marker) {
  if (!/^QA-SIM-IND-[0-9]{3,32}$/.test(code)) throw new Error('QA_SIM_IND_CODE_INVALID');
  if (!/^QA_ONLY_SIMULATOR_INDIVIDUAL_CHECK_[0-9]{3,32}$/.test(marker)) {
    throw new Error('QA_SIM_IND_MARKER_INVALID');
  }
}

function names(code) {
  return {
    instrutor: `${code}-INS`,
    a: `${code}-A`, b: `${code}-B`, c: `${code}-C`, d: `${code}-D`,
    tipo: `${code}-CHK`, simulador: `${code} Simulador`, sessao: `${code} Sessão`,
  };
}

function scope(code, qaAdminEmail) {
  const n = names(code);
  const tenantId = `(SELECT id FROM empresas WHERE codigo=${esc(TENANT)} AND deleted_at IS NULL AND COALESCE(ativo,1)=1)`;
  const emp = (matricula) =>
    `(SELECT id FROM funcionarios WHERE empresa_id=${tenantId} AND matricula=${esc(matricula)} AND deleted_at IS NULL LIMIT 1)`;
  const setorId = `(SELECT s.id FROM setores s WHERE s.empresa_id=${tenantId} AND s.deleted_at IS NULL ORDER BY s.id LIMIT 1)`;
  const categoriaId = `(SELECT qc.id FROM qualificacoes_categorias qc WHERE qc.empresa_id=${tenantId} AND qc.ativo=1 AND qc.deleted_at IS NULL ORDER BY qc.id LIMIT 1)`;
  return {
    n, tenantId, emp, setorId, categoriaId,
    qaUserId: `(SELECT u.id FROM usuarios u JOIN usuarios_empresas ue ON ue.usuario_id=u.id AND ue.empresa_id=${tenantId}
      WHERE LOWER(TRIM(u.email))=${esc(qaAdminEmail)} AND (u.deleted_at IS NULL OR u.deleted_at=0)
        AND COALESCE(u.active,1)=1 AND LOWER(TRIM(ue.role)) IN ('admin','administrador') LIMIT 1)`,
    tipoId: `(SELECT id FROM qualificacoes_tipos WHERE empresa_id=${tenantId} AND codigo=${esc(n.tipo)} AND deleted_at IS NULL LIMIT 1)`,
    simId: `(SELECT id FROM simuladores WHERE nome=${esc(n.simulador)} AND deleted_at IS NULL LIMIT 1)`,
    agId: `(SELECT id FROM simulador_agendamentos WHERE empresa_id=${tenantId} AND uuid=${esc(`${code}-AG`)} AND deleted_at IS NULL LIMIT 1)`,
  };
}

const LEDGER_OK = `(SELECT COUNT(DISTINCT change_id) FROM airtrust_schema_changes_v2
  WHERE change_id IN ('simulator-individual-check-evidence-0554','simulator-individual-check-delete-guard-0560'))=2`;

export function buildSeedSql(code, marker, qaAdminEmail) {
  assertCode(code, marker);
  const { n, tenantId, emp, setorId, categoriaId, qaUserId, tipoId, simId, agId } = scope(code, qaAdminEmail);
  const ficha = (suffix, who, status, aprovado, instrSigned) => `
INSERT INTO fichas_sessao(uuid,agendamento_slot_id,colaborador_id_aluno,instrutor_id,status,resultado_final,aprovado,observacoes,
  empresa_id,tipo_sessao,data_sessao,assinatura_aluno_timestamp,assinatura_instrutor_timestamp,created_at,updated_at,deleted_at)
VALUES (${esc(`${code}-${suffix}`)},${agId},${emp(who)},${emp(n.instrutor)},${esc(status)},${esc(aprovado ? 'APROVADO' : 'PENDENTE')},
  ${aprovado ? 1 : 0},${esc(marker)},${tenantId},'CHECK',date('now', '-1 day'),datetime('now'),
  ${instrSigned ? "datetime('now')" : 'NULL'},datetime('now'),datetime('now'),NULL);`;
  return `
SELECT CASE WHEN ${LEDGER_OK}
  AND (SELECT COUNT(*) FROM empresas WHERE codigo=${esc(TENANT)} AND deleted_at IS NULL AND COALESCE(ativo,1)=1)=1
  AND (SELECT COUNT(*) FROM usuarios u WHERE u.id=${qaUserId} AND u.funcionario_id IS NULL)=1
  AND NOT EXISTS (SELECT 1 FROM funcionarios WHERE empresa_id=${tenantId} AND matricula LIKE ${esc(`${code}-%`)} AND deleted_at IS NULL)
THEN 1 ELSE json('FAIL_PREFLIGHT_GUARD_OR_LEDGER_MISSING') END;

-- Setor padrão exigido pelo trigger trg_funcionarios_setor_required_insert no D1 de staging
INSERT INTO setores (codigo, nome, descricao, responsavel, ativo, created_at, updated_at, deleted_at, empresa_id)
SELECT ${esc(`${code}-OPS`)}, 'operacoes', 'Setor operacional padrao QA', 'QA Admin', 1, datetime('now'), datetime('now'), NULL, id
FROM empresas
WHERE id = ${tenantId}
  AND NOT EXISTS (
    SELECT 1 FROM setores WHERE empresa_id = ${tenantId} AND deleted_at IS NULL
  );

-- Categoria padrão exigida pelo trigger trg_qualification_type_category_fk_insert_0457 no D1 de staging
INSERT INTO qualificacoes_categorias (codigo, nome, descricao, ativo, created_at, updated_at, deleted_at, empresa_id)
SELECT ${esc(`${code}-CAT`)}, 'Simulador QA', 'Categoria padrao simulador QA', 1, datetime('now'), datetime('now'), NULL, id
FROM empresas
WHERE id = ${tenantId}
  AND NOT EXISTS (
    SELECT 1 FROM qualificacoes_categorias WHERE empresa_id = ${tenantId} AND ativo = 1 AND deleted_at IS NULL
  );

INSERT INTO funcionarios(nome,matricula,cargo,funcao,setor_id,status,is_instrutor,is_examinador,ativo,empresa_id,observacoes,created_at,updated_at,deleted_at)
VALUES (${esc(`${code} Instrutor`)},${esc(n.instrutor)},'QA','QA',${setorId},'ATIVO',1,1,1,${tenantId},${esc(marker)},datetime('now'),datetime('now'),NULL);
${['a', 'b', 'c', 'd'].map((k) => `INSERT INTO funcionarios(nome,matricula,cargo,funcao,setor_id,status,is_instrutor,is_examinador,ativo,empresa_id,observacoes,created_at,updated_at,deleted_at)
VALUES (${esc(`${code} Tripulante ${k.toUpperCase()}`)},${esc(n[k])},'QA','QA',${setorId},'ATIVO',0,0,1,${tenantId},${esc(marker)},datetime('now'),datetime('now'),NULL);`).join('\n')}

-- Vincula o login QA sintético (somente se estava sem vínculo, garantido pelo guard acima).
UPDATE usuarios SET funcionario_id=${emp(n.instrutor)}, updated_at=datetime('now') WHERE id=${qaUserId} AND funcionario_id IS NULL;

INSERT INTO qualificacoes_tipos(tipo,codigo,nome,descricao,categoria,categoria_id,carga_horaria,validade,vencimento_fim_mes,observacoes,ativo,empresa_id,is_check,created_at,updated_at,deleted_at)
VALUES ('CHECK',${esc(n.tipo)},${esc(`${code} Check individual`)},${esc(marker)},'QA',${categoriaId},1,12,0,${esc(marker)},1,${tenantId},1,datetime('now'),datetime('now'),NULL);

INSERT INTO simuladores(nome,modelo,tipo,status,observacoes,created_at,updated_at,deleted_at)
VALUES (${esc(n.simulador)},'QA','QA','ATIVO',${esc(marker)},datetime('now'),datetime('now'),NULL);

INSERT INTO simulador_agendamentos(uuid,simulador_id,funcionario_id,instrutor_id,examinador_id,data,hora_inicio,hora_fim,status,tipo_sessao,
  observacoes,nome,is_check,empresa_id,created_at,updated_at,deleted_at)
VALUES (${esc(`${code}-AG`)},${simId},${emp(n.a)},${emp(n.instrutor)},${emp(n.instrutor)},date('now', '-1 day'),'08:00','10:00','EM_ANDAMENTO','CHECK',
  ${esc(marker)},${esc(n.sessao)},1,${tenantId},datetime('now'),datetime('now'),NULL);

INSERT INTO sessoes_checks(sessao_id,qualificacao_tipo_id,created_at,updated_at,deleted_at)
VALUES (${agId},${tipoId},datetime('now'),datetime('now'),NULL);
${ficha('A', n.a, 'AGUARDANDO_ASSINATURA_INSTRUTOR', false, false)}
${ficha('B', n.b, 'AGUARDANDO_ASSINATURA_INSTRUTOR', false, false)}
${ficha('C', n.c, 'APROVADO', true, true)}
${ficha('D', n.d, 'APROVADO', true, true)}

-- Cenário B: FAP prematura/indevida da ficha B que a reprovação individual deve revogar com auditoria.
INSERT INTO qualificacoes_historico(funcionario_id,qualificacao_id,tipo_codigo,codigo,observacoes,data_conclusao,data_vencimento,status,empresa_id,created_at,updated_at,deleted_at)
VALUES (${emp(n.b)},${tipoId},${esc(n.tipo)},${esc(n.tipo)},
  'Gerado da ficha #'||(SELECT id FROM fichas_sessao WHERE uuid=${esc(`${code}-B`)} AND empresa_id=${tenantId}),
  date('now'),date('now','+12 months'),'CONCLUIDA',${tenantId},datetime('now'),datetime('now'),NULL);

SELECT CASE WHEN
  (SELECT COUNT(*) FROM funcionarios WHERE empresa_id=${tenantId} AND observacoes=${esc(marker)} AND deleted_at IS NULL)=5
  AND (SELECT COUNT(*) FROM fichas_sessao WHERE empresa_id=${tenantId} AND observacoes=${esc(marker)} AND deleted_at IS NULL)=4
  AND (SELECT COUNT(*) FROM sessoes_checks WHERE sessao_id=${agId} AND deleted_at IS NULL)=1
  AND (SELECT COUNT(*) FROM qualificacoes_historico WHERE empresa_id=${tenantId} AND qualificacao_id=${tipoId} AND funcionario_id=${emp(n.b)} AND deleted_at IS NULL)=1
THEN 1 ELSE json('FAIL_POST_SEED_COUNT_MISMATCH') END;
`;
}

export function buildRollbackSql(code, marker, qaAdminEmail) {
  assertCode(code, marker);
  const { n, tenantId, emp, qaUserId, tipoId, agId } = scope(code, qaAdminEmail);
  return `
UPDATE usuarios SET funcionario_id=NULL, updated_at=datetime('now')
WHERE id=${qaUserId} AND funcionario_id=${emp(n.instrutor)};
UPDATE fichas_sessao SET deleted_at=COALESCE(deleted_at,datetime('now')), updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND observacoes=${esc(marker)};
UPDATE qualificacoes_historico SET deleted_at=COALESCE(deleted_at,datetime('now')), updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND qualificacao_id=${tipoId};
UPDATE sessoes_checks SET deleted_at=COALESCE(deleted_at,datetime('now')), updated_at=datetime('now') WHERE sessao_id=${agId};
UPDATE simulador_agendamentos SET deleted_at=COALESCE(deleted_at,datetime('now')), updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND observacoes=${esc(marker)};
UPDATE simuladores SET deleted_at=COALESCE(deleted_at,datetime('now')), updated_at=datetime('now') WHERE observacoes=${esc(marker)};
UPDATE qualificacoes_tipos SET ativo=0, deleted_at=COALESCE(deleted_at,datetime('now')), updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND observacoes=${esc(marker)};
UPDATE qualificacoes_categorias SET deleted_at=COALESCE(deleted_at,datetime('now')), updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND codigo=${esc(`${code}-CAT`)};
UPDATE funcionarios SET ativo=0, status='INATIVO', deleted_at=COALESCE(deleted_at,datetime('now')), updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND observacoes=${esc(marker)};
UPDATE setores SET deleted_at=COALESCE(deleted_at,datetime('now')), updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND codigo=${esc(`${code}-OPS`)};

SELECT CASE WHEN
  (SELECT COUNT(*) FROM funcionarios WHERE empresa_id=${tenantId} AND observacoes=${esc(marker)} AND deleted_at IS NULL)
 +(SELECT COUNT(*) FROM fichas_sessao WHERE empresa_id=${tenantId} AND observacoes=${esc(marker)} AND deleted_at IS NULL)
 +(SELECT COUNT(*) FROM simulador_agendamentos WHERE empresa_id=${tenantId} AND observacoes=${esc(marker)} AND deleted_at IS NULL)
 +(SELECT COUNT(*) FROM qualificacoes_historico WHERE empresa_id=${tenantId} AND qualificacao_id=${tipoId} AND deleted_at IS NULL)=0
THEN 1 ELSE json('FAIL_CLEANUP_ACTIVE_RECORDS_REMAIN') END;
`;
}

/** SQL somente-leitura que devolve apenas IDs numéricos (sem PII) para o manifesto do Playwright. */
export function buildManifestSql(code, qaAdminEmail) {
  const { tenantId, tipoId } = scope(code, qaAdminEmail);
  return `SELECT substr(uuid, length(${esc(`${code}-`)}) + 1) AS cenario, id AS ficha_id, colaborador_id_aluno AS funcionario_id,
  (SELECT id FROM sessoes_checks WHERE sessao_id=agendamento_slot_id AND qualificacao_tipo_id=${tipoId} AND deleted_at IS NULL LIMIT 1) AS sessao_check_id
FROM fichas_sessao WHERE empresa_id=${tenantId} AND uuid IN
 (${['A', 'B', 'C', 'D'].map((k) => esc(`${code}-${k}`)).join(',')}) ORDER BY uuid`;
}

function runWrangler(db, args) {
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', db, '--env', 'staging', '--remote', '--yes', ...args], {
    cwd: join(process.cwd(), 'worker-airtrust'), encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout);
    process.exit(r.status || 1);
  }
  return r.stdout;
}

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const rollback = args.includes('--rollback');
  const manifest = args.includes('--manifest');
  const arg = (k) => (args.find((v) => v.startsWith(`--${k}=`)) || '').slice(k.length + 3);
  const code = arg('code');
  const marker = arg('marker');
  const db = String(process.env.STAGING_D1_NAME || ALLOWED_D1).trim();
  const qaAdminEmail = String(
    process.env.QA_EXAMINER_ADMIN_EMAIL || 'qa-examiner-admin@staging.airtrust.invalid',
  ).trim().toLowerCase();
  if (!/^[a-z0-9._+-]+@staging\.airtrust\.invalid$/.test(qaAdminEmail)) throw new Error('QA_ADMIN_STAGING_IDENTITY_REQUIRED');
  if (db !== ALLOWED_D1) throw new Error(`STAGING_D1_REJECTED:${db}`);
  assertCode(code, marker);

  if (manifest) {
    const out = runWrangler(db, ['--json', `--command=${buildManifestSql(code, qaAdminEmail).replace(/\s+/g, ' ')}`]);
    const rows = JSON.parse(out)?.[0]?.results ?? [];
    console.log(JSON.stringify({ code, fichas: rows }));
    return;
  }
  if (apply && process.env.CONFIRM_STAGING_SIMULATOR_INDIVIDUAL_CHECK_QA !== CONFIRM) {
    throw new Error('STAGING_CONFIRMATION_MISSING');
  }
  const sql = rollback ? buildRollbackSql(code, marker, qaAdminEmail) : buildSeedSql(code, marker, qaAdminEmail);
  if (!apply) {
    console.log(JSON.stringify({ mode: 'DRY_RUN', target: db, operation: rollback ? 'ROLLBACK' : 'SEED', code, marker }));
    return;
  }
  // Remote --file invoca o caminho de bulk-import/reset do D1 e falha com D1_RESET_DO.
  // Usa o transporte normal de queries com --command, padronizado nos demais seeders de staging.
  const cleanSql = sql.replace(/--.*$/gm, '').trim();
  runWrangler(db, ['--json', '--command', cleanSql]);
  console.log(JSON.stringify({ mode: 'APPLY', target: db, operation: rollback ? 'ROLLBACK' : 'SEED', code, marker, status: 'PASS' }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

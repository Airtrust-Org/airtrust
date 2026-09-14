#!/usr/bin/env node

// source_reference: staging-only synthetic acceptance fixture for Training Compliance 0491.
// operational_decision: STAGING_ONLY; targets only qa_examiner_training on the canonical staging D1.
// dry_run_required: default mode never writes; --apply requires AIRTRUST_STAGING_TRAINING_COMPLIANCE_QA_SEED.
// rollback_plan_required: --rollback --apply soft-deletes only this run's reserved QA code/marker artifacts.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ALLOWED_D1 = 'airtrust-db-staging-baseline-20260701';
const CONFIRM = 'AIRTRUST_STAGING_TRAINING_COMPLIANCE_QA_SEED';
const TENANT = 'qa_examiner_training';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const rollback = args.includes('--rollback');
const code = (args.find((v) => v.startsWith('--code=')) || '').slice(7);
const marker = (args.find((v) => v.startsWith('--marker=')) || '').slice(9);
const db = String(process.env.STAGING_D1_NAME || ALLOWED_D1).trim();
const esc = (v) => `'${String(v).replace(/'/g, "''")}'`;
if (db !== ALLOWED_D1) throw new Error(`STAGING_D1_REJECTED:${db}`);
if (!/^QA-COMP-[A-Z0-9-]{3,64}$/.test(code)) throw new Error('QA_COMPLIANCE_CODE_INVALID');
if (!/^QA_ONLY_TRAINING_COMPLIANCE_[A-Z0-9-]{3,64}$/.test(marker))
  throw new Error('QA_COMPLIANCE_MARKER_INVALID');
if (apply && process.env.CONFIRM_STAGING_COMPLIANCE_QA !== CONFIRM)
  throw new Error('STAGING_CONFIRMATION_MISSING');

const catCode = `${code}-CAT`;
const categoryName = 'QA Compliance de Treinamentos';
const trainingName = 'QA Compliance — Nunca realizado';
const tenantId = `(SELECT id FROM empresas WHERE codigo=${esc(TENANT)} AND deleted_at IS NULL AND COALESCE(ativo,1)=1)`;
const typeId = `(SELECT id FROM qualificacoes_tipos WHERE empresa_id=${tenantId} AND UPPER(codigo)=UPPER(${esc(code)}) AND deleted_at IS NULL LIMIT 1)`;

const seedSql = `
CREATE TABLE IF NOT EXISTS _qa_training_compliance_guard(ok INTEGER NOT NULL CHECK(ok=1));
DELETE FROM _qa_training_compliance_guard;
INSERT INTO _qa_training_compliance_guard(ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM empresas WHERE codigo=${esc(TENANT)} AND deleted_at IS NULL AND COALESCE(ativo,1)=1)=1
 AND (SELECT COUNT(*) FROM funcionarios WHERE empresa_id=${tenantId} AND deleted_at IS NULL AND COALESCE(ativo,1)=1)>=1
 AND NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id=${tenantId} AND UPPER(codigo)=UPPER(${esc(code)}))
THEN 1 ELSE 0 END;
DROP TABLE _qa_training_compliance_guard;
INSERT INTO qualificacoes_categorias(nome,codigo,descricao,cor,ativo,empresa_id,dominio_codigo,lms_integrada,created_at,updated_at,deleted_at)
SELECT ${esc(categoryName)},${esc(catCode)},${esc(marker)},'#64748b',1,id,'OPERACOES',0,datetime('now'),datetime('now'),NULL
FROM empresas WHERE id=${tenantId};
INSERT INTO qualificacoes_tipos(tipo,codigo,nome,descricao,categoria_id,categoria,carga_horaria,validade,vencimento_fim_mes,observacoes,ativo,empresa_id,created_at,updated_at,deleted_at)
SELECT 'TREINAMENTO',${esc(code)},${esc(trainingName)},${esc('Fixture sintética staging para validar obrigação nunca realizada.')},qc.id,qc.nome,1,12,0,${esc(marker)},1,qc.empresa_id,datetime('now'),datetime('now'),NULL
FROM qualificacoes_categorias qc WHERE qc.empresa_id=${tenantId} AND UPPER(qc.codigo)=UPPER(${esc(catCode)}) AND qc.deleted_at IS NULL;
INSERT INTO treinamento_requisitos(empresa_id,qualificacao_tipo_id,escopo,setor_id,funcao_id,funcionario_id,obrigatoriedade,nivel_requerido,critico_operacional,origem,referencia_normativa,observacoes,vigencia_inicio,vigencia_fim,prazo_inicial_dias,auto_matricular_ead,ativo,created_at,updated_at,deleted_at)
SELECT ${tenantId},${typeId},'EMPRESA',NULL,NULL,NULL,'OBRIGATORIA',NULL,0,'OUTRO','QA STAGING',${esc(marker)},date('now'),NULL,0,0,1,datetime('now'),datetime('now'),NULL;
CREATE TABLE IF NOT EXISTS _qa_training_compliance_post(rule_count INTEGER NOT NULL CHECK(rule_count=1), history_count INTEGER NOT NULL CHECK(history_count=0));
DELETE FROM _qa_training_compliance_post;
INSERT INTO _qa_training_compliance_post(rule_count,history_count)
SELECT (SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=${tenantId} AND qualificacao_tipo_id=${typeId} AND observacoes=${esc(marker)} AND ativo=1 AND deleted_at IS NULL),
       (SELECT COUNT(*) FROM qualificacoes_historico WHERE empresa_id=${tenantId} AND qualificacao_id=${typeId} AND deleted_at IS NULL);
DROP TABLE _qa_training_compliance_post;
`;

const rollbackSql = `
UPDATE treinamento_requisitos SET ativo=0,deleted_at=COALESCE(deleted_at,datetime('now')),updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND qualificacao_tipo_id IN (SELECT id FROM qualificacoes_tipos WHERE empresa_id=${tenantId} AND UPPER(codigo)=UPPER(${esc(code)})) AND observacoes=${esc(marker)} AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET ativo=0,deleted_at=COALESCE(deleted_at,datetime('now')),updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND UPPER(codigo)=UPPER(${esc(code)}) AND observacoes=${esc(marker)} AND deleted_at IS NULL;
UPDATE qualificacoes_categorias SET ativo=0,deleted_at=COALESCE(deleted_at,datetime('now')),updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND UPPER(codigo)=UPPER(${esc(catCode)}) AND descricao=${esc(marker)} AND deleted_at IS NULL;
`;

const sql = rollback ? rollbackSql : seedSql;
if (!apply) {
  console.log(
    JSON.stringify({
      mode: 'DRY_RUN',
      target: db,
      operation: rollback ? 'ROLLBACK' : 'SEED',
      code,
      marker,
    }),
  );
  process.exit(0);
}
const dir = mkdtempSync(join(tmpdir(), 'airtrust-training-compliance-qa-'));
const file = join(dir, 'fixture.sql');
try {
  writeFileSync(file, sql, { encoding: 'utf8', mode: 0o600 });
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', db, '--remote', `--file=${file}`], {
    cwd: join(process.cwd(), 'worker-airtrust'),
    encoding: 'utf8',
    env: process.env,
  });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout);
    process.exit(r.status || 1);
  }
  console.log(
    JSON.stringify({
      mode: 'APPLY',
      target: db,
      operation: rollback ? 'ROLLBACK' : 'SEED',
      code,
      marker,
      status: 'PASS',
    }),
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

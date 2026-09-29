#!/usr/bin/env node
// source_reference: PRG-SGI-005 Rev05; FORM-SGI-037 Rev03; PRG-OPS-003 Rev05; PRG-SSO-006 Rev01; PRG-SSO-005 Rev10; RBAC 110/120/175; NRs aplicáveis
// operational_decision: execute the reviewed regulatory reconciliation only against staging, replace the invalid PTAP sector dependency with an explicit applicability condition, preserve history, and never auto-enroll.
// dry_run_required: true
// rollback_plan_required: full staging D1 backup + D1 Time Travel bookmark before apply.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STAGING_PREREQUISITE_MODELS } from './training-regulatory-staging-prerequisites.mjs';

const STAGING_DB = 'airtrust-db-staging-baseline-20260701';
const BASE_SHA256 = '38f5912b3f4890a3c3acc956c8192d5cacfe259394fd6037571dc5889ea2bc75';
const STAGING_AUTH = 'AIRTRUST_STAGING_TRAINING_COMPLIANCE_RECONCILIATION';
const BASE_STATEMENTS = 47;
const FINAL_STATEMENTS = BASE_STATEMENTS + 1 + STAGING_PREREQUISITE_MODELS.length;
const STAGING_CATEGORY_CODE = 'TREINAMENTO_OPERACIONAL';
const BASE_MODEL_INSERTS = 5;

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const env = [...args].find((arg) => arg.startsWith('--env='))?.split('=')[1] || 'staging';
const expectedSha256 = [...args].find((arg) => arg.startsWith('--expected-sha256='))?.split('=')[1] || '';
if (env !== 'staging') throw new Error('V2_RECONCILIATION_STAGING_ONLY');

const baseScript = fileURLToPath(new URL('./reconcile-training-regulatory-matrix.mjs', import.meta.url));
const baseOutput = execFileSync(process.execPath, [baseScript, '--env=staging'], { encoding: 'utf8' });
const requiredHeaders = [
  `RECONCILIATION_SHA256=${BASE_SHA256}`,
  'ENV=staging',
  `TARGET_DATABASE=${STAGING_DB}`,
  'MODE=DRY_RUN',
  `STATEMENTS=${BASE_STATEMENTS}`,
];
for (const header of requiredHeaders) {
  if (!baseOutput.includes(`${header}\n`)) throw new Error(`BASE_RECONCILIATION_GUARD_FAILED:${header}`);
}
const marker = `STATEMENTS=${BASE_STATEMENTS}\n`;
const markerIndex = baseOutput.indexOf(marker);
if (markerIndex < 0) throw new Error('BASE_SQL_MARKER_NOT_FOUND');
const baseSql = baseOutput.slice(markerIndex + marker.length).trim();
const baseStatements = baseSql.replace(/;\s*$/, '').split(/;\n/).map((statement) => statement.trim()).filter(Boolean);
if (baseStatements.length !== BASE_STATEMENTS) throw new Error(`BASE_STATEMENT_COUNT_MISMATCH:${baseStatements.length}`);

const staleIndexes = baseStatements
  .map((statement, index) => ({ statement, index }))
  .filter(({ statement }) => statement.includes('escopo,setor_id') && statement.includes("'PTAP_TRIPULANTE_VOO'") && statement.includes("UPPER('TRI')"));
if (staleIndexes.length !== 1) throw new Error(`PTAP_STALE_SECTOR_RULE_COUNT:${staleIndexes.length}`);

const sqlQuote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const stagingCategoryId = `(SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND UPPER(codigo)=UPPER(${sqlQuote(STAGING_CATEGORY_CODE)}) AND ativo=1 AND deleted_at IS NULL LIMIT 1)`;
const qualificationInsertPrefix = 'INSERT INTO qualificacoes_tipos (empresa_id,codigo,nome,categoria,validade,carga_horaria,area_id,ativo,is_check,created_at,updated_at) SELECT 6,';
const baseModelInsertCount = baseStatements.filter((statement) => statement.startsWith(qualificationInsertPrefix)).length;
if (baseModelInsertCount !== BASE_MODEL_INSERTS) throw new Error(`BASE_MODEL_INSERT_COUNT_MISMATCH:${baseModelInsertCount}`);
const stagingBaseStatements = baseStatements.map((statement) => {
  if (!statement.startsWith(qualificationInsertPrefix)) return statement;
  const withColumn = statement.replace('updated_at) SELECT 6,', 'updated_at,categoria_id) SELECT 6,');
  const withCategory = withColumn.replace("datetime('now'),datetime('now') WHERE", `datetime('now'),datetime('now'),${stagingCategoryId} WHERE ${stagingCategoryId} IS NOT NULL AND`);
  if (withCategory === statement || !withCategory.includes('categoria_id')) throw new Error('BASE_MODEL_CATEGORY_BINDING_TRANSFORM_FAILED');
  return withCategory;
});
const prerequisiteModelStatements = STAGING_PREREQUISITE_MODELS.map(({ code, name, category, validity, hours, areaCode }) => {
  const areaId = `(SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND UPPER(codigo)=UPPER(${sqlQuote(areaCode)}) AND deleted_at IS NULL LIMIT 1)`;
  return `INSERT INTO qualificacoes_tipos (empresa_id,codigo,nome,categoria,validade,carga_horaria,area_id,ativo,is_check,created_at,updated_at,categoria_id) SELECT 6,${sqlQuote(code)},${sqlQuote(name)},${sqlQuote(category)},${Number(validity)},${Number(hours)},${areaId},1,0,datetime('now'),datetime('now'),${stagingCategoryId} WHERE ${areaId} IS NOT NULL AND ${stagingCategoryId} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)=UPPER(${sqlQuote(code)}) AND deleted_at IS NULL)`;
});

const ensureTripulanteCondition =
  "INSERT OR IGNORE INTO compliance_condicoes(empresa_id,codigo,nome,tipo,descricao,referencia_normativa) SELECT id,'PTAP_TRIPULANTE_VOO','Tripulante de voo PTAP','ATIVIDADE','Tripulante de voo abrangido pelo perfil de competência previsto no PTAP','PRG-OPS-003 Rev05; RBAC 175; IS 175-007F' FROM empresas WHERE id=6";
const tripulanteRequirement =
  "INSERT INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,perfil_competencia,modalidade_requerida,fundamento_tipo,fundamento_documento,fundamento_item,validade_fonte,auto_matricular_ead,ativo,condicao_id) SELECT 6,(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)=UPPER('D4') AND deleted_at IS NULL LIMIT 1),'EMPRESA','OBRIGATORIA',1,'REGULATORIO','PRG-OPS-003 Rev05; RBAC 175; IS 175-007F','Tripulante de voo abrangido pelo PTAP.','PTAP_TRIPULANTE_VOO',NULL,'Documento controlado','PRG-OPS-003 Rev05; RBAC 175; IS 175-007F',NULL,'EVIDENCIA',0,1,(SELECT id FROM compliance_condicoes WHERE empresa_id=6 AND UPPER(codigo)=UPPER('PTAP_TRIPULANTE_VOO') AND ativo=1 AND deleted_at IS NULL LIMIT 1) WHERE (SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)=UPPER('D4') AND deleted_at IS NULL LIMIT 1) IS NOT NULL AND (SELECT id FROM compliance_condicoes WHERE empresa_id=6 AND UPPER(codigo)=UPPER('PTAP_TRIPULANTE_VOO') AND ativo=1 AND deleted_at IS NULL LIMIT 1) IS NOT NULL";

const finalStatements = [...stagingBaseStatements];
finalStatements.splice(staleIndexes[0].index, 1, ensureTripulanteCondition, tripulanteRequirement);
finalStatements.unshift(...prerequisiteModelStatements);
if (finalStatements.length !== FINAL_STATEMENTS) throw new Error(`FINAL_STATEMENT_COUNT_MISMATCH:${finalStatements.length}`);
const finalSql = `${finalStatements.join(';\n')};\n`;
if (finalSql.includes("UPPER('TRI')")) throw new Error('INVALID_TRIPULANTE_SECTOR_RULE_REMAINS');
const qualificationModelInserts = finalStatements.filter((statement) => statement.startsWith('INSERT INTO qualificacoes_tipos ('));
if (qualificationModelInserts.length !== STAGING_PREREQUISITE_MODELS.length + BASE_MODEL_INSERTS) throw new Error(`QUALIFICATION_MODEL_INSERT_COUNT_MISMATCH:${qualificationModelInserts.length}`);
if (qualificationModelInserts.some((statement) => !statement.includes('categoria_id') || !statement.includes(STAGING_CATEGORY_CODE))) throw new Error('QUALIFICATION_MODEL_CATEGORY_BINDING_MISSING');
if (finalSql.includes('INSERT INTO lms_matriculas')) throw new Error('AUTO_ENROLL_WRITE_FORBIDDEN');
if (/auto_matricular_ead\s*=\s*1/i.test(finalSql)) throw new Error('AUTO_ENROLL_ENABLE_FORBIDDEN');

const finalSha256 = createHash('sha256').update(finalSql).digest('hex');
console.log(`BASE_RECONCILIATION_SHA256=${BASE_SHA256}`);
console.log(`RECONCILIATION_SHA256=${finalSha256}`);
console.log('ENV=staging');
console.log(`TARGET_DATABASE=${STAGING_DB}`);
console.log(`MODE=${apply ? 'APPLY' : 'DRY_RUN'}`);
console.log(`STATEMENTS=${FINAL_STATEMENTS}`);
if (!apply) {
  console.log(finalSql);
  process.exit(0);
}
if (process.env.AIRTRUST_STAGING_RECONCILIATION_AUTH !== STAGING_AUTH) {
  throw new Error('STAGING_RECONCILIATION_AUTH_REQUIRED');
}
if (!/^[0-9a-f]{64}$/i.test(expectedSha256) || expectedSha256.toLowerCase() !== finalSha256) {
  throw new Error(`EXPECTED_RECONCILIATION_SHA256_MISMATCH:${expectedSha256 || 'missing'}`);
}
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw new Error('CLOUDFLARE_STAGING_CREDENTIALS_REQUIRED');
}
const workerDir = fileURLToPath(new URL('../../worker-airtrust/', import.meta.url));
execFileSync(
  './node_modules/.bin/wrangler',
  ['d1', 'execute', STAGING_DB, '--env', 'staging', '--remote', '--command', finalSql],
  { cwd: workerDir, stdio: 'inherit', env: process.env },
);

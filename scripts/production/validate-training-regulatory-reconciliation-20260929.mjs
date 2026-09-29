#!/usr/bin/env node
// Read-only validator for the governed production Training Compliance reconciliation.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STAGING_PREREQUISITE_MODELS } from '../compliance/training-regulatory-staging-prerequisites.mjs';

const PRODUCTION_DB = 'airtrust-db';
const CONTROLLED_MODEL_CODES = [
  'NR-05',
  'NR-12',
  'BRIGADA_INCENDIO',
  'PRIMEIROS_SOCORROS',
  'COD_ETICA',
];
const args = new Set(process.argv.slice(2));
const mode = [...args].find((arg) => arg.startsWith('--mode='))?.split('=')[1] || 'dry-run';
if (!['dry-run', 'pre', 'post'].includes(mode)) throw new Error(`INVALID_MODE:${mode}`);
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw new Error('CLOUDFLARE_PRODUCTION_CREDENTIALS_REQUIRED');
}
const workerDir = fileURLToPath(new URL('../../worker-airtrust/', import.meta.url));

function queryCount(sql) {
  const raw = execFileSync(
    './node_modules/.bin/wrangler',
    ['d1', 'execute', PRODUCTION_DB, '--env', 'production', '--remote', '--json', '--command', sql],
    { cwd: workerDir, encoding: 'utf8', env: process.env },
  );
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('D1_JSON_NOT_FOUND');
  const parsed = JSON.parse(raw.slice(start, end + 1));
  const row = parsed?.[0]?.results?.[0] || {};
  const value = Number(row.count ?? row.total ?? Object.values(row)[0]);
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`INVALID_COUNT:${JSON.stringify(row)}`);
  return value;
}
function assertCount(label, expected, sql) {
  const actual = queryCount(sql);
  if (actual !== expected) throw new Error(`${label}:expected=${expected}:actual=${actual}`);
  console.log(`VALIDATION_OK=${label}:${actual}`);
}
const quoted = (values) => values.map((value) => `'${value.replaceAll("'", "''")}'`).join(',');
const conditionCodes = [
  'USO_EPI_REQUER_TREINAMENTO',
  'OPERADOR_EQUIP_MOVIMENTACAO',
  'NR20_AREA_SEM_CONTATO',
  'MANUSEIA_PRODUTO_QUIMICO',
  'TRABALHO_ALTURA_AUTORIZADO',
  'MEMBRO_CIPA',
  'OPERADOR_MAQUINA_NR12',
  'BRIGADISTA',
  'SOCORRISTA_DESIGNADO',
  'ARSO',
  'SUPERVISOR_ARSO',
  'FDM_EQUIPE',
  'EXPOSICAO_AIRSIDE',
  'LOSA_OBSERVADOR',
  'GATEKEEPER',
  'AVSEC_ATENDIMENTO_PASSAGEIRO',
  'AVSEC_OPERACOES_SOLO',
  'AVSEC_CARGA_AEREA',
  'PTAP_RAMPA_DG_DESIGNADO',
];
const modelCodes = STAGING_PREREQUISITE_MODELS.map(({ code }) => code);
const prerequisiteValues = STAGING_PREREQUISITE_MODELS.map(
  ({ code, name, validity, hours, areaCode }) =>
    `('${code.replaceAll("'", "''")}','${name.replaceAll("'", "''")}',${Number(validity)},${Number(hours)},'${areaCode.replaceAll("'", "''")}')`,
).join(',');
const prerequisiteConflictSql = `WITH expected(codigo,nome,validade,carga_horaria,area_codigo) AS (VALUES ${prerequisiteValues})
  SELECT COUNT(*) count
  FROM qualificacoes_tipos qt
  JOIN expected e ON UPPER(qt.codigo)=UPPER(e.codigo)
  LEFT JOIN qualificacoes_areas qa ON qa.id=qt.area_id AND qa.empresa_id=qt.empresa_id
  WHERE qt.empresa_id=6 AND qt.deleted_at IS NULL AND (
    qt.nome<>e.nome OR COALESCE(qt.validade,-1)<>e.validade OR
    COALESCE(qt.carga_horaria,-1)<>e.carga_horaria OR UPPER(COALESCE(qa.codigo,''))<>UPPER(e.area_codigo) OR
    COALESCE(qt.ativo,0)<>1 OR COALESCE(qt.is_check,0)<>0
  )`;

assertCount(
  'prerequisite-models-present',
  modelCodes.length,
  `SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo) IN (${quoted(modelCodes)}) AND ativo=1 AND deleted_at IS NULL`,
);
assertCount('prerequisite-model-metadata-conflicts', 0, prerequisiteConflictSql);
assertCount(
  'required-ptap-functions',
  3,
  "SELECT COUNT(*) count FROM funcoes WHERE empresa_id=6 AND UPPER(codigo) IN ('ORG_COORD_VOO','ORG_AG_ATEND','ORG_AG_RAMPA') AND ativo=1 AND deleted_at IS NULL",
);
assertCount(
  'required-qualification-areas',
  3,
  "SELECT COUNT(*) count FROM qualificacoes_areas WHERE empresa_id=6 AND UPPER(codigo) IN ('QSMS','OPERACOES','SEGURANCA_OPERACIONAL') AND ativo=1 AND deleted_at IS NULL",
);

if (mode === 'dry-run') {
  assertCount(
    'controlled-models-not-yet-created',
    0,
    `SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo) IN (${quoted(CONTROLLED_MODEL_CODES)}) AND deleted_at IS NULL`,
  );
  console.log('TRAINING_REGULATORY_PRODUCTION_DRYRUN_PREFLIGHT=PASS');
  process.exit(0);
}

assertCount(
  'required-condition-catalog',
  19,
  `SELECT COUNT(*) count FROM compliance_condicoes WHERE empresa_id=6 AND UPPER(codigo) IN (${quoted(conditionCodes)}) AND ativo=1 AND deleted_at IS NULL`,
);
if (mode === 'pre') {
  assertCount(
    'controlled-models-not-yet-created',
    0,
    `SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo) IN (${quoted(CONTROLLED_MODEL_CODES)}) AND deleted_at IS NULL`,
  );
  assertCount(
    'ptap-tripulante-condition-not-yet-created',
    0,
    "SELECT COUNT(*) count FROM compliance_condicoes WHERE empresa_id=6 AND UPPER(codigo)='PTAP_TRIPULANTE_VOO' AND ativo=1 AND deleted_at IS NULL",
  );
  console.log('TRAINING_REGULATORY_PRODUCTION_PREFLIGHT=PASS');
  process.exit(0);
}

assertCount(
  'ptap-tripulante-condition',
  1,
  "SELECT COUNT(*) count FROM compliance_condicoes WHERE empresa_id=6 AND UPPER(codigo)='PTAP_TRIPULANTE_VOO' AND ativo=1 AND deleted_at IS NULL",
);
assertCount(
  'no-inferred-ptap-employee-assignments',
  0,
  "SELECT COUNT(*) count FROM funcionarios_compliance_condicoes fcc JOIN compliance_condicoes cc ON cc.id=fcc.condicao_id WHERE fcc.empresa_id=6 AND UPPER(cc.codigo)='PTAP_TRIPULANTE_VOO' AND fcc.ativo=1 AND fcc.deleted_at IS NULL",
);
assertCount(
  'controlled-models-created',
  CONTROLLED_MODEL_CODES.length,
  `SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo) IN (${quoted(CONTROLLED_MODEL_CODES)}) AND ativo=1 AND deleted_at IS NULL`,
);
assertCount(
  'd4-function-profiles',
  3,
  "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND UPPER(qt.codigo)='D4' AND tr.escopo='FUNCAO' AND tr.perfil_competencia IN ('PTAP_COORDENADOR_VOO','PTAP_ATENDIMENTO_BALCAO','PTAP_AGENTE_RAMPA') AND tr.ativo=1 AND tr.deleted_at IS NULL",
);
assertCount(
  'd4-conditional-profiles',
  2,
  "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id WHERE tr.empresa_id=6 AND UPPER(qt.codigo)='D4' AND tr.perfil_competencia IN ('PTAP_AGENTE_RAMPA_DG','PTAP_TRIPULANTE_VOO') AND UPPER(cc.codigo) IN ('PTAP_RAMPA_DG_DESIGNADO','PTAP_TRIPULANTE_VOO') AND tr.ativo=1 AND tr.deleted_at IS NULL",
);
assertCount(
  'no-stale-tripulante-sector-rule',
  0,
  "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND UPPER(qt.codigo)='D4' AND tr.escopo='SETOR' AND tr.perfil_competencia='PTAP_TRIPULANTE_VOO' AND tr.ativo=1 AND tr.deleted_at IS NULL",
);
assertCount(
  'd1-avsec-profiles',
  3,
  "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND UPPER(qt.codigo)='D1' AND tr.perfil_competencia IN ('AVSEC_ATENDIMENTO_PASSAGEIRO','AVSEC_OPERACOES_SOLO','AVSEC_CARGA_AEREA') AND tr.ativo=1 AND tr.deleted_at IS NULL",
);
assertCount(
  'codigo-etica-corporate-rule',
  1,
  "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND UPPER(qt.codigo)='COD_ETICA' AND tr.escopo='EMPRESA' AND tr.ativo=1 AND tr.deleted_at IS NULL",
);
assertCount(
  'no-auto-enrollment-on-reconciled-profiles',
  0,
  "SELECT COUNT(*) count FROM treinamento_requisitos WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND auto_matricular_ead=1 AND perfil_competencia IN ('PTAP_COORDENADOR_VOO','PTAP_ATENDIMENTO_BALCAO','PTAP_AGENTE_RAMPA','PTAP_AGENTE_RAMPA_DG','PTAP_TRIPULANTE_VOO','AVSEC_ATENDIMENTO_PASSAGEIRO','AVSEC_OPERACOES_SOLO','AVSEC_CARGA_AEREA')",
);
console.log('TRAINING_REGULATORY_PRODUCTION_POSTCONDITIONS=PASS');

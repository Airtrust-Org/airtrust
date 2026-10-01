#!/usr/bin/env node
// source_reference: PRG-SGI-005 Rev05; FORM-SGI-037 Rev03; PRG-OPS-003 Rev05; PRG-SSO-006 Rev01; PRG-SSO-005 Rev10; RBAC 110/120/175; NRs aplicáveis
// operational_decision: substituir inferência histórica/cargo genérico por requisito vigente baseado em função documentada, exposição, atividade ou designação; preservar histórico; nunca matricular automaticamente nesta reconciliação
// dry_run_required: true
// rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-conditions-0517.md
import { createHash } from 'node:crypto';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const env = [...args].find((arg) => arg.startsWith('--env='))?.split('=')[1] || 'staging';
if (!['staging', 'production'].includes(env)) throw new Error(`env inválido: ${env}`);
if (apply) {
  throw new Error('DIRECT_APPLY_DISABLED_USE_GOVERNED_ENVIRONMENT_EXECUTOR');
}

const TARGETS = Object.freeze({
  staging: 'airtrust-db-staging-baseline-20260701',
  production: 'airtrust-db',
});
const target = TARGETS[env];
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const model = (code) =>
  `(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)=UPPER(${q(code)}) AND deleted_at IS NULL LIMIT 1)`;
const cond = (code) =>
  `(SELECT id FROM compliance_condicoes WHERE empresa_id=6 AND UPPER(codigo)=UPPER(${q(code)}) AND ativo=1 AND deleted_at IS NULL LIMIT 1)`;

const statements = [];
const deactivate = (code) =>
  statements.push(
    `UPDATE treinamento_requisitos SET ativo=0,deleted_at=datetime('now'),updated_at=datetime('now') WHERE empresa_id=6 AND qualificacao_tipo_id=${model(code)} AND ativo=1 AND deleted_at IS NULL`,
  );
const addConditional = ({
  code,
  condition,
  origin = 'REGULATORIO',
  ref,
  reason,
  modality = null,
  profile = null,
  validity = 'EVIDENCIA',
}) =>
  statements.push(
    `INSERT INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,perfil_competencia,modalidade_requerida,fundamento_tipo,fundamento_documento,fundamento_item,validade_fonte,auto_matricular_ead,ativo,condicao_id) SELECT 6,${model(code)},'EMPRESA','OBRIGATORIA',1,${q(origin)},${q(ref)},${q(reason)},${profile ? q(profile) : 'NULL'},${modality ? q(modality) : 'NULL'},'Documento controlado',${q(ref)},NULL,${q(validity)},0,1,${cond(condition)} WHERE ${model(code)} IS NOT NULL AND ${cond(condition)} IS NOT NULL`,
  );

const area = (code) =>
  `(SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND UPPER(codigo)=UPPER(${q(code)}) AND deleted_at IS NULL LIMIT 1)`;
const funcao = (code) =>
  `(SELECT id FROM funcoes WHERE empresa_id=6 AND UPPER(codigo)=UPPER(${q(code)}) AND deleted_at IS NULL LIMIT 1)`;
const setor = (code) =>
  `(SELECT id FROM setores WHERE empresa_id=6 AND UPPER(codigo)=UPPER(${q(code)}) AND deleted_at IS NULL LIMIT 1)`;
const ensureModel = ({
  code,
  name,
  areaCode = 'QSMS',
  category = 'Treinamento',
  validity = null,
  hours = null,
}) =>
  statements.push(
    `INSERT INTO qualificacoes_tipos (empresa_id,codigo,nome,categoria,validade,carga_horaria,area_id,ativo,is_check,created_at,updated_at) SELECT 6,${q(code)},${q(name)},${q(category)},${validity === null ? 'NULL' : Number(validity)},${hours === null ? 'NULL' : Number(hours)},${area(areaCode)},1,0,datetime('now'),datetime('now') WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)=UPPER(${q(code)}) AND deleted_at IS NULL)`,
  );
const addFunctionProfile = ({
  code,
  functionCode,
  profile,
  ref,
  reason,
  origin = 'REGULATORIO',
  validity = 'EVIDENCIA',
}) =>
  statements.push(
    `INSERT INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,perfil_competencia,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo) SELECT 6,${model(code)},'FUNCAO',${funcao(functionCode)},'OBRIGATORIA',1,${q(origin)},${q(ref)},${q(reason)},${q(profile)},'Documento controlado',${q(ref)},${q(validity)},0,1 WHERE ${model(code)} IS NOT NULL AND ${funcao(functionCode)} IS NOT NULL`,
  );
const addSectorProfile = ({
  code,
  sectorCode,
  profile,
  ref,
  reason,
  origin = 'REGULATORIO',
  validity = 'EVIDENCIA',
}) =>
  statements.push(
    `INSERT INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,setor_id,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,perfil_competencia,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo) SELECT 6,${model(code)},'SETOR',${setor(sectorCode)},'OBRIGATORIA',1,${q(origin)},${q(ref)},${q(reason)},${q(profile)},'Documento controlado',${q(ref)},${q(validity)},0,1 WHERE ${model(code)} IS NOT NULL AND ${setor(sectorCode)} IS NOT NULL`,
  );

// Missing controlled qualification models required by the current QSMS matrix. No employee is assigned here.
ensureModel({ code: 'NR-05', name: 'NR-05 — CIPA', areaCode: 'QSMS' });
ensureModel({
  code: 'NR-12',
  name: 'NR-12 — Segurança no Trabalho em Máquinas e Equipamentos',
  areaCode: 'QSMS',
});
ensureModel({ code: 'BRIGADA_INCENDIO', name: 'Brigada de Incêndio', areaCode: 'QSMS' });
ensureModel({ code: 'PRIMEIROS_SOCORROS', name: 'Primeiros Socorros', areaCode: 'QSMS' });
ensureModel({ code: 'COD_ETICA', name: 'Código de Ética e Conduta', areaCode: 'QSMS' });
statements.push(
  `UPDATE qualificacoes_tipos SET categoria='Presencial',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(codigo)='NR-35' AND deleted_at IS NULL`,
);

// Replace historical cargo/sector inference with current exposure/designation predicates.
for (const code of [
  'NR06',
  'NR-11',
  'NR-20',
  'NR-26',
  'NR-35',
  'PPSP',
  'PPSP_SUP',
  'FDM-EAD',
  'FOD',
  'LOSA',
  'GATEKEEPER',
])
  deactivate(code);
addConditional({
  code: 'NR06',
  condition: 'USO_EPI_REQUER_TREINAMENTO',
  ref: 'NR-06; FORM-SGI-037 Rev03',
  reason: 'Aplica-se somente quando a atividade exige EPI e treinamento específico.',
});
addConditional({
  code: 'NR-11',
  condition: 'OPERADOR_EQUIP_MOVIMENTACAO',
  ref: 'NR-11; FORM-SGI-037 Rev03',
  reason: 'Aplica-se ao operador de equipamento de transporte/movimentação abrangido.',
});
addConditional({
  code: 'NR-20',
  condition: 'NR20_AREA_SEM_CONTATO',
  ref: 'NR-20; PRG-SGI-005 Rev05; FORM-SGI-037 Rev03',
  reason: 'Modelo atual de iniciação restrito a acesso sem contato direto com o processo.',
});
addConditional({
  code: 'NR-26',
  condition: 'MANUSEIA_PRODUTO_QUIMICO',
  ref: 'NR-26; FORM-SGI-037 Rev03',
  reason: 'Aplica-se a quem manuseia/utiliza produtos químicos na atividade.',
});
addConditional({
  code: 'NR-35',
  condition: 'TRABALHO_ALTURA_AUTORIZADO',
  ref: 'NR-35; PRG-SGI-005 Rev05; FORM-SGI-037 Rev03',
  reason: 'Aplica-se somente a trabalhador autorizado para trabalho em altura.',
  modality: 'PRESENCIAL',
  validity: 'EVIDENCIA',
});
addConditional({
  code: 'NR-05',
  condition: 'MEMBRO_CIPA',
  ref: 'NR-05; PRG-SGI-005 Rev05; FORM-SGI-037 Rev03',
  reason: 'Aplica-se a membro/representante formalmente designado para a CIPA.',
});
addConditional({
  code: 'NR-12',
  condition: 'OPERADOR_MAQUINA_NR12',
  ref: 'NR-12; PRG-SGI-005 Rev05; FORM-SGI-037 Rev03',
  reason: 'Aplica-se quando a pessoa opera máquina/equipamento abrangido pela NR-12.',
});
addConditional({
  code: 'BRIGADA_INCENDIO',
  condition: 'BRIGADISTA',
  ref: 'NR-23; PRG-SGI-005 Rev05; FORM-SGI-037 Rev03',
  reason: 'Aplica-se a integrante formal da brigada de incêndio/emergência.',
});
addConditional({
  code: 'PRIMEIROS_SOCORROS',
  condition: 'SOCORRISTA_DESIGNADO',
  ref: 'FORM-SGI-037 Rev03; PAE/PCMSO aplicável',
  reason: 'Aplica-se a socorrista formalmente designado.',
});
addConditional({
  code: 'PPSP',
  condition: 'ARSO',
  origin: 'SGSO',
  ref: 'PRG-SSO-005 Rev10; RBAC 120',
  reason: 'Programa aplicável a colaborador que desempenha ARSO.',
});
addConditional({
  code: 'PPSP_SUP',
  condition: 'SUPERVISOR_ARSO',
  origin: 'SGSO',
  ref: 'PRG-SSO-005 Rev10; RBAC 120.323',
  reason: 'Treinamento específico de supervisor formal de empregado ARSO.',
});
addConditional({
  code: 'FDM-EAD',
  condition: 'FDM_EQUIPE',
  origin: 'SGSO',
  ref: 'MNL-SSO-002; PRG-SGI-005 Rev05',
  reason: 'Treinamento específico para pessoa com função formal no FDM.',
});
addConditional({
  code: 'FOD',
  condition: 'EXPOSICAO_AIRSIDE',
  origin: 'SGSO',
  ref: 'FORM-SGI-037 Rev03; SGSO',
  reason: 'Aplica-se por atuação operacional/airside, não por histórico de curso.',
});
addConditional({
  code: 'LOSA',
  condition: 'LOSA_OBSERVADOR',
  origin: 'SGSO',
  ref: 'Programa LOSA; PRG-SGI-005 Rev05',
  reason: 'Aplica-se somente a observador/equipe LOSA designado.',
});
addConditional({
  code: 'GATEKEEPER',
  condition: 'GATEKEEPER',
  origin: 'SGSO',
  ref: 'MNL-SSO-002',
  reason: 'Aplica-se somente a Gatekeeper formalmente designado.',
});

// Corporate matrix item present for all functions in FORM-SGI-037.
statements.push(
  `INSERT INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,validade_fonte,auto_matricular_ead,ativo) SELECT 6,${model('COD_ETICA')},'EMPRESA','OBRIGATORIA',0,'EMPRESA','FORM-SGI-037 Rev03','Treinamento corporativo aplicável a todas as funções conforme matriz QSMS vigente.','EVIDENCIA',0,1 WHERE ${model('COD_ETICA')} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=${model('COD_ETICA')} AND escopo='EMPRESA' AND ativo=1 AND deleted_at IS NULL)`,
);

// Preserve corporate rules explicitly supported by controlled QSMS program.
for (const code of ['D2', 'JUST_CULTURE', 'STOP_WORK', 'PRE'])
  statements.push(
    `UPDATE treinamento_requisitos SET referencia_normativa=COALESCE(NULLIF(referencia_normativa,''),'PRG-SGI-005 Rev05'), justificativa=COALESCE(NULLIF(justificativa,''),'Público corporativo definido no Programa de Treinamento de QSMS.'), updated_at=datetime('now') WHERE empresa_id=6 AND qualificacao_tipo_id=${model(code)} AND escopo='EMPRESA' AND obrigatoriedade='OBRIGATORIA' AND ativo=1 AND deleted_at IS NULL`,
  );

// Retire generic AVSEC/DGR applicability; replace it with controlled competency profiles. Never auto-enroll.
for (const code of ['D1', 'D4']) deactivate(code);
addConditional({
  code: 'D1',
  condition: 'AVSEC_ATENDIMENTO_PASSAGEIRO',
  origin: 'REGULATORIO',
  ref: 'PRG-SSO-006 Rev01; RBAC 110',
  reason: 'Executa controles AVSEC de atendimento/despacho de passageiros.',
  profile: 'AVSEC_ATENDIMENTO_PASSAGEIRO',
  validity: 'EVIDENCIA',
});
addConditional({
  code: 'D1',
  condition: 'AVSEC_OPERACOES_SOLO',
  origin: 'REGULATORIO',
  ref: 'PRG-SSO-006 Rev01; RBAC 110',
  reason: 'Executa controles AVSEC de operações de solo.',
  profile: 'AVSEC_OPERACOES_SOLO',
  validity: 'EVIDENCIA',
});
addConditional({
  code: 'D1',
  condition: 'AVSEC_CARGA_AEREA',
  origin: 'REGULATORIO',
  ref: 'PRG-SSO-006 Rev01; RBAC 110',
  reason: 'Executa controles AVSEC relacionados à carga aérea.',
  profile: 'AVSEC_CARGA_AEREA',
  validity: 'EVIDENCIA',
});
addFunctionProfile({
  code: 'D4',
  functionCode: 'ORG_COORD_VOO',
  profile: 'PTAP_COORDENADOR_VOO',
  ref: 'PRG-OPS-003 Rev05; RBAC 175; IS 175-007F',
  reason: 'Função Coordenador de Voo prevista no PTAP.',
});
addFunctionProfile({
  code: 'D4',
  functionCode: 'ORG_AG_ATEND',
  profile: 'PTAP_ATENDIMENTO_BALCAO',
  ref: 'PRG-OPS-003 Rev05; RBAC 175; IS 175-007F',
  reason: 'Função Despachante de Voo — atendimento de balcão prevista no PTAP.',
});
addFunctionProfile({
  code: 'D4',
  functionCode: 'ORG_AG_RAMPA',
  profile: 'PTAP_AGENTE_RAMPA',
  ref: 'PRG-OPS-003 Rev05; RBAC 175; IS 175-007F',
  reason: 'Função Despachante de Voo — agente de rampa prevista no PTAP.',
});
addConditional({
  code: 'D4',
  condition: 'PTAP_RAMPA_DG_DESIGNADO',
  origin: 'REGULATORIO',
  ref: 'PRG-OPS-003 Rev05; RBAC 175; IS 175-007F',
  reason: 'Designação formal para tarefas adicionais de Agente de Rampa DG.',
  profile: 'PTAP_AGENTE_RAMPA_DG',
  validity: 'EVIDENCIA',
});
addSectorProfile({
  code: 'D4',
  sectorCode: 'TRI',
  profile: 'PTAP_TRIPULANTE_VOO',
  ref: 'PRG-OPS-003 Rev05; RBAC 175; IS 175-007F',
  reason: 'Tripulantes de voo são função prevista no PTAP.',
});

const sql = statements.join(';\n') + ';\n';
const hash = createHash('sha256').update(sql).digest('hex');
console.log(`RECONCILIATION_SHA256=${hash}`);
console.log(`ENV=${env}`);
console.log(`TARGET_DATABASE=${target}`);
console.log(`MODE=${apply ? 'APPLY' : 'DRY_RUN'}`);
console.log(`STATEMENTS=${statements.length}`);
console.log(sql);

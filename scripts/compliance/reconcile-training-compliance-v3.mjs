#!/usr/bin/env node
// Training Compliance V3 — Costa do Sol / AirTrust
// source_reference: Matriz_Compliance_AirTrust_2026-09-28; PTO PRG-OPS-001 Rev.10; RBAC/IS aplicáveis; IOGP 690-2; decisões do Training Manager em 2026-09-29.
// operational_decision: matriz auditada define o público padrão; condições/designações tratam somente exceções e funções especiais; histórico nunca cria obrigação.
// dry_run_required: true
// IMPORTANT: this script never deletes qualification history or LMS completion evidence.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const env = [...args].find((arg) => arg.startsWith('--env='))?.split('=')[1] || 'staging';
const expectedSha256 =
  [...args].find((arg) => arg.startsWith('--expected-sha256='))?.split('=')[1] || '';
if (!['staging', 'production'].includes(env)) throw new Error(`env inválido: ${env}`);
if (apply && env === 'production') throw new Error('PRODUCTION_APPLY_REQUIRES_GOVERNED_PRODUCTION_WORKFLOW');

const TARGETS = Object.freeze({
  staging: 'airtrust-db-staging-baseline-20260701',
  production: 'airtrust-db',
});
const target = TARGETS[env];
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const model = (code) =>
  `(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)=UPPER(${q(code)}) AND deleted_at IS NULL LIMIT 1)`;
const fn = (name) =>
  `(SELECT id FROM funcoes WHERE empresa_id=6 AND UPPER(TRIM(nome))=UPPER(TRIM(${q(name)})) AND COALESCE(ativo,1)=1 AND deleted_at IS NULL ORDER BY id LIMIT 1)`;
const cond = (code) =>
  `(SELECT id FROM compliance_condicoes WHERE empresa_id=6 AND UPPER(codigo)=UPPER(${q(code)}) AND ativo=1 AND deleted_at IS NULL LIMIT 1)`;
const tripSector = `(SELECT id FROM setores WHERE empresa_id=6 AND (UPPER(TRIM(codigo))='TRI' OR UPPER(TRIM(nome))=UPPER('Tripulação')) AND COALESCE(ativo,1)=1 AND deleted_at IS NULL ORDER BY id LIMIT 1)`;
const statements = [];

const qualificationCategoryCode = env === 'staging' ? 'TREINAMENTO_OPERACIONAL' : 'TERICO';
const qualificationCategoryName = env === 'staging' ? 'Treinamentos Operacionais' : 'Teórico';
const qualificationCategoryId = `(SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND UPPER(codigo)=UPPER(${q(qualificationCategoryCode)}) AND ativo=1 AND deleted_at IS NULL LIMIT 1)`;
const qualificationFormatId =
  env === 'staging'
    ? 'NULL'
    : `(SELECT id FROM qualificacoes_formatos WHERE empresa_id=6 AND UPPER(codigo)=UPPER('NAO_CLASSIFICADO') AND ativo=1 AND deleted_at IS NULL LIMIT 1)`;
const qualificationAreaId = (code) =>
  `(SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND UPPER(codigo)=UPPER(${q(code)}) AND ativo=1 AND deleted_at IS NULL LIMIT 1)`;

function ensureQualificationModel({ code, name, description, areaCode = 'OPERACOES' }) {
  const areaId = qualificationAreaId(areaCode);
  statements.push(
    `INSERT INTO qualificacoes_tipos (codigo,nome,descricao,categoria,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,conteudo_programatico,validade,vencimento_fim_mes,observacoes,ativo,is_check,empresa_id,formato_id,categoria_id,classe_requisito,dominio_codigo,area_id,created_at,updated_at) SELECT ${q(code)},${q(name)},${q(description)},${q(qualificationCategoryName)},NULL,NULL,NULL,NULL,NULL,0,${q('Validade vinculada à credencial aeroportuária permanente; não usar periodicidade fixa.')},1,0,6,${qualificationFormatId},${qualificationCategoryId},'TREINAMENTO',NULL,${areaId},datetime('now'),datetime('now') WHERE ${qualificationCategoryId} IS NOT NULL AND ${areaId} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)=UPPER(${q(code)}) AND deleted_at IS NULL)`,
  );
}
const deactivate = (code) =>
  statements.push(
    `UPDATE treinamento_requisitos SET ativo=0,deleted_at=datetime('now'),updated_at=datetime('now') WHERE empresa_id=6 AND qualificacao_tipo_id=${model(code)} AND ativo=1 AND deleted_at IS NULL`,
  );
const setModelActive = (code, active) =>
  statements.push(
    `UPDATE qualificacoes_tipos SET ativo=${active ? 1 : 0},updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(codigo)=UPPER(${q(code)}) AND deleted_at IS NULL`,
  );

function addCompanyRule({
  code,
  obligation = 'OBRIGATORIA',
  origin = 'EMPRESA',
  foundation = 'POLITICA_INTERNA',
  document = 'Matriz auditada de treinamentos Costa do Sol — 2026-09-28',
  item = null,
  reason = null,
  critical = 0,
  modality = null,
  profile = null,
}) {
  statements.push(
    `INSERT OR IGNORE INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,perfil_competencia,modalidade_requerida,fundamento_tipo,fundamento_documento,fundamento_item,validade_fonte,auto_matricular_ead,ativo) SELECT 6,${model(code)},'EMPRESA',${q(obligation)},${critical},${q(origin)},${q(document)},${reason ? q(reason) : 'NULL'},${profile ? q(profile) : 'NULL'},${modality ? q(modality) : 'NULL'},${q(foundation)},${q(document)},${item ? q(item) : 'NULL'},'EVIDENCIA',0,1 WHERE ${model(code)} IS NOT NULL`,
  );
}
function addFunctionRule({
  code,
  functionName,
  origin = 'EMPRESA',
  foundation = 'POLITICA_INTERNA',
  document = 'Matriz auditada de treinamentos Costa do Sol — 2026-09-28',
  item = null,
  reason = null,
  critical = 0,
  modality = null,
  profile = null,
  aircraft = null,
  obligation = 'OBRIGATORIA',
}) {
  statements.push(
    `INSERT OR IGNORE INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,perfil_competencia,modalidade_requerida,fundamento_tipo,fundamento_documento,fundamento_item,validade_fonte,auto_matricular_ead,ativo,aeronave_modelo) SELECT 6,${model(code)},'FUNCAO',${fn(functionName)},${q(obligation)},${critical},${q(origin)},${q(document)},${reason ? q(reason) : 'NULL'},${profile ? q(profile) : 'NULL'},${modality ? q(modality) : 'NULL'},${q(foundation)},${q(document)},${item ? q(item) : 'NULL'},'EVIDENCIA',0,1,${aircraft ? q(aircraft) : 'NULL'} WHERE ${model(code)} IS NOT NULL AND ${fn(functionName)} IS NOT NULL`,
  );
}
function addConditionalRule({
  code,
  condition,
  origin = 'EMPRESA',
  foundation = 'DESIGNACAO',
  document,
  item = null,
  reason,
  critical = 0,
  modality = null,
  profile = null,
}) {
  statements.push(
    `INSERT OR IGNORE INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,perfil_competencia,modalidade_requerida,fundamento_tipo,fundamento_documento,fundamento_item,validade_fonte,auto_matricular_ead,ativo,condicao_id) SELECT 6,${model(code)},'EMPRESA','OBRIGATORIA',${critical},${q(origin)},${q(document)},${q(reason)},${profile ? q(profile) : 'NULL'},${modality ? q(modality) : 'NULL'},${q(foundation)},${q(document)},${item ? q(item) : 'NULL'},'EVIDENCIA',0,1,${cond(condition)} WHERE ${model(code)} IS NOT NULL AND ${cond(condition)} IS NOT NULL`,
  );
}
// Ausência de regra já significa ausência de obrigação. NAO_APLICA é reservado a overrides específicos.
// 1) PTO: substituir o escopo genérico Tripulação por cargos Comandante e Copiloto.
// Excluem-se daqui os modelos tratados explicitamente abaixo.
const explicitCodes = [
  'D1',
  'AVSEC_CONSC',
  'D4',
  'CA-EBS',
  'LOFT',
  'EN-ASSES',
  'SOP_AW139',
  'SOP_S76',
  'FDM-EAD',
  'FOD',
  'PPSP',
  'PPSP_SUP',
  'GATEKEEPER',
  'LOSA',
];
const explicitList = explicitCodes.map(q).join(',');
for (const pilotName of ['Comandante', 'Copiloto']) {
  statements.push(
    `INSERT OR IGNORE INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,setor_id,funcao_id,funcionario_id,obrigatoriedade,nivel_requerido,critico_operacional,origem,referencia_normativa,observacoes,vigencia_inicio,vigencia_fim,prazo_inicial_dias,auto_matricular_ead,ativo,aeronave_modelo,condicao_id,justificativa,perfil_competencia,modalidade_requerida,fundamento_tipo,fundamento_documento,fundamento_item,validade_fonte) SELECT r.empresa_id,r.qualificacao_tipo_id,'FUNCAO',NULL,${fn(pilotName)},NULL,r.obrigatoriedade,r.nivel_requerido,r.critico_operacional,r.origem,r.referencia_normativa,r.observacoes,r.vigencia_inicio,r.vigencia_fim,r.prazo_inicial_dias,0,1,r.aeronave_modelo,r.condicao_id,COALESCE(NULLIF(r.justificativa,''),'Aplicabilidade do PTO por cargo: ${pilotName}.'),r.perfil_competencia,r.modalidade_requerida,COALESCE(NULLIF(r.fundamento_tipo,''),CASE r.origem WHEN 'PTO' THEN 'PROGRAMA_APROVADO' WHEN 'REGULATORIO' THEN 'REGULATORIO_DIRETO' WHEN 'CLIENTE' THEN 'CONTRATUAL_CLIENTE' WHEN 'SGSO' THEN 'PROGRAMA_APROVADO' ELSE 'POLITICA_INTERNA' END),COALESCE(NULLIF(r.fundamento_documento,''),NULLIF(r.referencia_normativa,''),'PTO PRG-OPS-001 Rev.10'),r.fundamento_item,COALESCE(r.validade_fonte,'EVIDENCIA') FROM treinamento_requisitos r JOIN qualificacoes_tipos qt ON qt.id=r.qualificacao_tipo_id AND qt.empresa_id=6 WHERE r.empresa_id=6 AND r.escopo='SETOR' AND r.setor_id=${tripSector} AND r.ativo=1 AND r.deleted_at IS NULL AND UPPER(qt.codigo) NOT IN (${explicitList}) AND ${fn(pilotName)} IS NOT NULL`,
  );
}
// Regras antigas SETOR_FUNCAO da Tripulação também são normalizadas para FUNCAO pura.
statements.push(
  `INSERT OR IGNORE INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,setor_id,funcao_id,funcionario_id,obrigatoriedade,nivel_requerido,critico_operacional,origem,referencia_normativa,observacoes,vigencia_inicio,vigencia_fim,prazo_inicial_dias,auto_matricular_ead,ativo,aeronave_modelo,condicao_id,justificativa,perfil_competencia,modalidade_requerida,fundamento_tipo,fundamento_documento,fundamento_item,validade_fonte) SELECT r.empresa_id,r.qualificacao_tipo_id,'FUNCAO',NULL,r.funcao_id,NULL,r.obrigatoriedade,r.nivel_requerido,r.critico_operacional,r.origem,r.referencia_normativa,r.observacoes,r.vigencia_inicio,r.vigencia_fim,r.prazo_inicial_dias,0,1,r.aeronave_modelo,r.condicao_id,COALESCE(NULLIF(r.justificativa,''),'Aplicabilidade do PTO por cargo: Comandante/Copiloto.'),r.perfil_competencia,r.modalidade_requerida,COALESCE(NULLIF(r.fundamento_tipo,''),CASE r.origem WHEN 'PTO' THEN 'PROGRAMA_APROVADO' WHEN 'REGULATORIO' THEN 'REGULATORIO_DIRETO' WHEN 'CLIENTE' THEN 'CONTRATUAL_CLIENTE' WHEN 'SGSO' THEN 'PROGRAMA_APROVADO' ELSE 'POLITICA_INTERNA' END),COALESCE(NULLIF(r.fundamento_documento,''),NULLIF(r.referencia_normativa,''),'PTO PRG-OPS-001 Rev.10'),r.fundamento_item,COALESCE(r.validade_fonte,'EVIDENCIA') FROM treinamento_requisitos r JOIN qualificacoes_tipos qt ON qt.id=r.qualificacao_tipo_id AND qt.empresa_id=6 WHERE r.empresa_id=6 AND r.escopo='SETOR_FUNCAO' AND r.setor_id=${tripSector} AND r.ativo=1 AND r.deleted_at IS NULL AND UPPER(qt.codigo) NOT IN (${explicitList}) AND r.funcao_id IN (${fn('Comandante')},${fn('Copiloto')})`,
);
statements.push(
  `UPDATE treinamento_requisitos SET ativo=0,deleted_at=datetime('now'),updated_at=datetime('now') WHERE empresa_id=6 AND escopo IN ('SETOR','SETOR_FUNCAO') AND setor_id=${tripSector} AND ativo=1 AND deleted_at IS NULL AND qualificacao_tipo_id IN (SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo) NOT IN (${explicitList}) AND deleted_at IS NULL)`,
);

// 2) Matriz auditada — NRs e populações estáveis.
deactivate('NR06');
addCompanyRule({
  code: 'NR06',
  foundation: 'POLITICA_INTERNA',
  document: 'Matriz auditada Costa do Sol; NR-06',
  reason:
    'A Costa do Sol adota o treinamento NR-06 para toda a empresa como padrão interno mais abrangente que o mínimo normativo.',
});

deactivate('NR-11');
for (const name of ['Mecânico', 'Aux Manutenção', 'Auxiliar de Manutenção'])
  addFunctionRule({
    code: 'NR-11',
    functionName: name,
    origin: 'REGULATORIO',
    foundation: 'REGULATORIO_DIRETO',
    document: 'NR-11; Matriz auditada Costa do Sol',
    reason:
      'Todos os ocupantes deste cargo operam os equipamentos motorizados abrangidos na rotina atual.',
  });

statements.push(
  `UPDATE qualificacoes_tipos SET validade=24,carga_horaria_inicial=16,carga_horaria_recorrente=4,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(codigo)=UPPER('NR-20') AND deleted_at IS NULL`,
);
deactivate('NR-20');
for (const name of [
  'Mecânico',
  'Aux Manutenção',
  'Auxiliar de Manutenção',
  'Aux Suprimentos',
  'Auxiliar de Suprimentos',
  'Supervisor Suprimentos',
  'Supervisor de Suprimentos',
])
  addFunctionRule({
    code: 'NR-20',
    functionName: name,
    origin: 'REGULATORIO',
    foundation: 'REGULATORIO_DIRETO',
    document: 'NR-20; FORM-SGI-037 Rev.03; LO INEA IN001890',
    reason:
      'Trilha NR-20 Intermediário adotada para a população da matriz exposta a inflamáveis, combustíveis e óleos no hangar; inicial 16 h e atualização 4 h/24 meses com evidência da parte prática aplicável.',
    modality: 'HIBRIDO',
  });

deactivate('NR-26');
for (const name of [
  'Agente Atendimento','Agente de Atendimento','Agente Rampa','Agente de Rampa',
  'Analista CTM','Analista de CTM','Assistente Operações','Assistente de Operações',
  'Assistente Segurança Operacional','Assistente de Segurança Operacional',
  'Aux CTM','Auxiliar de CTM','Aux Coordenação Voo','Auxiliar de Coordenação de Voo',
  'Aux Manutenção','Auxiliar de Manutenção','Aux QSMS','Auxiliar de QSMS',
  'Aux Suprimentos','Auxiliar de Suprimentos','Comandante','Copiloto',
  'Coordenador Base','Coordenador de Base','Coordenador Engenharia','Coordenador de Engenharia',
  'Coordenador Voo','Coordenador de Voo','Gerente Bases','Gerente de Bases',
  'Gerente Manutenção','Gerente de Manutenção','Gerente Operações','Gerente de Operações',
  'Gerente QSMS','Gerente de QSMS','Gerente Segurança Operacional','Gerente de Segurança Operacional',
  'Mecânico','Motorista','Supervisor Engenharia','Supervisor de Engenharia',
  'Supervisor Suprimentos','Supervisor de Suprimentos','TST','Técnico de Segurança do Trabalho',
])
  addFunctionRule({
    code: 'NR-26',
    functionName: name,
    origin: 'EMPRESA',
    foundation: 'POLITICA_INTERNA',
    document: 'NR-26; FORM-SGI-037 Rev.03; decisão gerencial 2026-10-02',
    reason: 'A Costa do Sol mantém produtos químicos/FDS para o pessoal operacional como critério corporativo mais abrangente.',
  });

deactivate('NR-35');
statements.push(
  `UPDATE qualificacoes_tipos SET validade=24,carga_horaria_inicial=8,categoria='Presencial',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(codigo)=UPPER('NR-35') AND deleted_at IS NULL`,
);
for (const name of ['Mecânico', 'Aux Manutenção', 'Auxiliar de Manutenção'])
  addFunctionRule({
    code: 'NR-35',
    functionName: name,
    origin: 'REGULATORIO',
    foundation: 'REGULATORIO_DIRETO',
    document: 'NR-35; Matriz auditada Costa do Sol',
    reason: 'Todos os ocupantes destes cargos executam trabalho em altura na rotina atual.',
    modality: 'PRESENCIAL',
  });

// 3) FOD e PPSP: retornar à população auditada por função; somente a exceção parcial permanece individual.
const fodFunctions = [
  'Agente de Atendimento',
  'Agente de Rampa',
  'Analista de CTM',
  'Assistente de Operações',
  'Assistente de Segurança Operacional',
  'Auxiliar de CTM',
  'Auxiliar de Coordenação de Voo',
  'Auxiliar de Manutenção',
  'Auxiliar de QSMS',
  'Auxiliar de Suprimentos',
  'Comandante',
  'Coordenador de Engenharia',
  'Coordenador de Voo',
  'Copiloto',
  'Gerente de Bases',
  'Gerente de Operações',
  'Mecânico',
  'Motorista',
  'Supervisor de Suprimentos',
  'Técnico de Segurança do Trabalho',
];
deactivate('FOD');
for (const name of fodFunctions)
  addFunctionRule({
    code: 'FOD',
    functionName: name,
    origin: 'SGSO',
    foundation: 'PROGRAMA_APROVADO',
    document: 'Matriz auditada Costa do Sol; SGSO/procedimento operacional',
    reason: 'Aplicabilidade operacional/airside consolidada na matriz auditada.',
  });
statements.push(
  `UPDATE treinamento_requisitos SET ativo=1,deleted_at=NULL,updated_at=datetime('now'),fundamento_tipo='PROGRAMA_APROVADO',fundamento_documento='Matriz auditada Costa do Sol; SGSO/procedimento operacional',justificativa='Exceção individual auditada para Auxiliar de Serviços Gerais com atuação airside.' WHERE id=(SELECT MAX(r.id) FROM treinamento_requisitos r JOIN funcionarios f ON f.id=r.funcionario_id AND f.empresa_id=6 LEFT JOIN funcoes ff ON ff.id=f.funcao_id AND ff.empresa_id=6 WHERE r.empresa_id=6 AND r.qualificacao_tipo_id=${model('FOD')} AND r.escopo='FUNCIONARIO' AND UPPER(TRIM(COALESCE(ff.nome,f.cargo,'')))=UPPER('Auxiliar de Serviços Gerais') AND r.deleted_at IS NOT NULL)`,
);

const ppspFunctions = [
  'Agente de Atendimento',
  'Agente de Rampa',
  'Analista de CTM',
  'Assistente de Operações',
  'Assistente de Segurança Operacional',
  'Auxiliar de CTM',
  'Auxiliar de Coordenação de Voo',
  'Auxiliar de Manutenção',
  'Auxiliar de QSMS',
  'Auxiliar de Suprimentos',
  'Comandante',
  'Coordenador de Engenharia',
  'Coordenador de Voo',
  'Copiloto',
  'Gerente de Bases',
  'Gerente de Operações',
  'Mecânico',
  'Motorista',
  'Supervisor de Suprimentos',
  'Técnico de Segurança do Trabalho',
];
deactivate('PPSP');
for (const name of ppspFunctions)
  addFunctionRule({
    code: 'PPSP',
    functionName: name,
    origin: 'SGSO',
    foundation: 'REGULATORIO_DIRETO',
    document: 'RBAC 120; PRG-SSO-005',
    reason: 'População ARSO consolidada na matriz/PPSP da empresa.',
  });
statements.push(
  `UPDATE treinamento_requisitos SET ativo=1,deleted_at=NULL,updated_at=datetime('now'),fundamento_tipo='REGULATORIO_DIRETO',fundamento_documento='RBAC 120; PRG-SSO-005',justificativa='Exceção individual auditada da população ARSO.' WHERE id=(SELECT MAX(r.id) FROM treinamento_requisitos r JOIN funcionarios f ON f.id=r.funcionario_id AND f.empresa_id=6 LEFT JOIN funcoes ff ON ff.id=f.funcao_id AND ff.empresa_id=6 WHERE r.empresa_id=6 AND r.qualificacao_tipo_id=${model('PPSP')} AND r.escopo='FUNCIONARIO' AND UPPER(TRIM(COALESCE(ff.nome,f.cargo,'')))=UPPER('Auxiliar de Serviços Gerais') AND r.deleted_at IS NOT NULL)`,
);

// 4) FDM-EAD: somente integrante formalmente designado da equipe FDM/HFDM.
// Decisão da Gerência de Treinamento confirmada em 2026-10-05: FDM, LOSA, eDB e
// treinamentos equivalentes de programa específico não são atribuídos por cargo amplo.
deactivate('FDM-EAD');
addConditionalRule({
  code: 'FDM-EAD',
  condition: 'FDM_EQUIPE',
  origin: 'SGSO',
  foundation: 'DESIGNACAO',
  document: 'MNL-SSO-002',
  reason: 'Aplicável somente a integrante formalmente designado para a equipe FDM/HFDM.',
});

// Funções/designações especiais.
deactivate('GATEKEEPER');
addConditionalRule({
  code: 'GATEKEEPER',
  condition: 'GATEKEEPER',
  origin: 'SGSO',
  foundation: 'DESIGNACAO',
  document: 'IOGP 690-2 §8C.2; MNL-SSO-002',
  reason: 'Aplicável somente ao Gatekeeper formalmente designado.',
});
deactivate('LOSA');
addConditionalRule({
  code: 'LOSA',
  condition: 'LOSA_OBSERVADOR',
  origin: 'SGSO',
  foundation: 'DESIGNACAO',
  document: 'Programa LOSA Costa do Sol',
  reason: 'Aplicável somente a observador/equipe LOSA formalmente designado.',
});
deactivate('PPSP_SUP');
addConditionalRule({
  code: 'PPSP_SUP',
  condition: 'SUPERVISOR_ARSO',
  origin: 'SGSO',
  foundation: 'DESIGNACAO',
  document: 'RBAC 120; PRG-SSO-005',
  reason: 'Aplicável somente à função especial de supervisão prevista no PPSP.',
});

// 5) AVSEC: conscientização corporativa para acesso à base aeroportuária; certificações por atividade permanecem adicionais.
ensureQualificationModel({
  code: 'AVSEC_CONSC',
  name: 'AVSEC — Conscientização Corporativa',
  description:
    'Conscientização AVSEC corporativa para funcionários que precisam acessar a base da Costa do Sol em ambiente aeroportuário.',
  areaCode: 'OPERACOES',
});
deactivate('AVSEC_CONSC');
addCompanyRule({
  code: 'AVSEC_CONSC',
  origin: 'EMPRESA',
  foundation: 'POLITICA_INTERNA',
  document: 'Requisito operacional de acesso à base aeroportuária Costa do Sol; decisão gerencial 2026-10-02',
  reason:
    'Todos os funcionários precisam poder acessar a base localizada dentro do ambiente aeroportuário; certificações AVSEC específicas permanecem adicionais.',
});

// Certificações AVSEC: uma qualificação D1, com perfil por atividade; não substituem a regra de conscientização/credencial.
deactivate('D1');
for (const name of ['Comandante', 'Copiloto'])
  addFunctionRule({
    code: 'D1',
    functionName: name,
    origin: 'REGULATORIO',
    foundation: 'REGULATORIO_DIRETO',
    document: 'RBAC 110; IS 110-001; PTO PRG-OPS-001 Rev.10',
    reason: 'Piloto de transporte aéreo público: certificação AVSEC para Tripulantes.',
    profile: 'AVSEC_TRIPULANTE',
  });
addConditionalRule({
  code: 'D1',
  condition: 'AVSEC_ATENDIMENTO_PASSAGEIRO',
  origin: 'REGULATORIO',
  foundation: 'REGULATORIO_DIRETO',
  document: 'RBAC 110; PRG-SSO-006',
  reason: 'Executa atividade AVSEC de atendimento ao passageiro.',
  profile: 'AVSEC_ATENDIMENTO_PASSAGEIRO',
});
addConditionalRule({
  code: 'D1',
  condition: 'AVSEC_OPERACOES_SOLO',
  origin: 'REGULATORIO',
  foundation: 'REGULATORIO_DIRETO',
  document: 'RBAC 110; PRG-SSO-006',
  reason: 'Executa atividade AVSEC de operações de solo.',
  profile: 'AVSEC_OPERACOES_SOLO',
});
addConditionalRule({
  code: 'D1',
  condition: 'AVSEC_CARGA_AEREA',
  origin: 'REGULATORIO',
  foundation: 'REGULATORIO_DIRETO',
  document: 'RBAC 110; PRG-SSO-006',
  reason: 'Executa atividade AVSEC de carga aérea.',
  profile: 'AVSEC_CARGA_AEREA',
});

// 6) DGR: uma única qualificação D4; requisito varia por perfil funcional, não por curso duplicado.
deactivate('D4');
for (const [name, profile] of [
  ['Coordenador de Voo', 'PTAP_COORDENADOR_VOO'],
  ['Agente de Atendimento', 'PTAP_ATENDIMENTO_BALCAO'],
  ['Agente de Rampa', 'PTAP_AGENTE_RAMPA'],
  ['Comandante', 'PTAP_TRIPULANTE_VOO'],
  ['Copiloto', 'PTAP_TRIPULANTE_VOO'],
])
  addFunctionRule({
    code: 'D4',
    functionName: name,
    origin: 'REGULATORIO',
    foundation: 'REGULATORIO_DIRETO',
    document: 'RBAC 175; IS 175-007F; PRG-OPS-003 Rev.05',
    reason: 'Treinamento baseado nas funções/tarefas previstas no PTAP.',
    profile,
  });
addConditionalRule({
  code: 'D4',
  condition: 'PTAP_RAMPA_DG_DESIGNADO',
  origin: 'REGULATORIO',
  foundation: 'DESIGNACAO',
  document: 'RBAC 175; IS 175-007F; PRG-OPS-003 Rev.05',
  reason: 'Designação adicional para tarefas de Agente de Rampa DG.',
  profile: 'PTAP_AGENTE_RAMPA_DG',
});

// 7) CA-EBS permanece separado de HUET porque há certificados HUET antigos ainda válidos sem CA-EBS.
deactivate('CA-EBS');
for (const name of ['Comandante', 'Copiloto'])
  addFunctionRule({
    code: 'CA-EBS',
    functionName: name,
    origin: 'CLIENTE',
    foundation: 'PETROBRAS_IOGP',
    document: 'IOGP 690-2 §49; OPITO; requisitos offshore aplicáveis',
    reason:
      'Qualificação separada para cobrir HUETs legados que não incluíram CA-EBS; evidência HUET só satisfaz CA-EBS quando o certificado o declarar explicitamente.',
    modality: 'PRATICO',
  });

// 8) SOP é aprimoramento interno: obrigatório pela política da empresa para o público definido, não um curso nominal exigido pela norma.
for (const [code, aircraft] of [
  ['SOP_AW139', 'AW139'],
  ['SOP_S76', 'SK76'],
]) {
  deactivate(code);
  for (const name of ['Comandante', 'Copiloto'])
    addFunctionRule({
      code,
      functionName: name,
      origin: 'EMPRESA',
      foundation: 'APRIMORAMENTO_INTERNO',
      document: 'SOP Costa do Sol; decisão da Gerência de Treinamento',
      reason:
        'Curso EAD adicional de padronização e aprimoramento interno. Não há requisito externo para um curso separado com este nome.',
      aircraft,
    });
}

// 9) LOFT permanece como controle separado da tripulação; English Assessment continua retirado.
deactivate('LOFT');
setModelActive('LOFT', true);
for (const name of ['Comandante', 'Copiloto'])
  addFunctionRule({
    code: 'LOFT',
    functionName: name,
    origin: 'PTO',
    foundation: 'PROGRAMA_APROVADO',
    document: 'PTO vigente Costa do Sol; decisão da Gerência de Treinamento 2026-10-02',
    reason: 'LOFT permanece como controle separado aplicável à tripulação técnica.',
    critical: 1,
  });
deactivate('EN-ASSES');
setModelActive('EN-ASSES', false);

// 10) Metadados de fundamento: nunca deixar um requisito vigente sem explicar por que existe.
statements.push(
  `UPDATE treinamento_requisitos SET fundamento_tipo=CASE WHEN condicao_id IS NOT NULL THEN 'DESIGNACAO' WHEN origem='REGULATORIO' THEN 'REGULATORIO_DIRETO' WHEN origem='PTO' THEN 'PROGRAMA_APROVADO' WHEN origem='CLIENTE' THEN 'CONTRATUAL_CLIENTE' WHEN origem='SGSO' THEN 'PROGRAMA_APROVADO' WHEN origem='EMPRESA' THEN 'POLITICA_INTERNA' ELSE 'OUTRO' END, fundamento_documento=COALESCE(NULLIF(fundamento_documento,''),NULLIF(referencia_normativa,''),CASE WHEN origem='PTO' THEN 'PTO PRG-OPS-001 Rev.10' WHEN origem='EMPRESA' THEN 'Política interna / matriz auditada Costa do Sol' ELSE 'Revisão documental requerida' END), justificativa=COALESCE(NULLIF(justificativa,''),'Requisito vigente conforme escopo e fundamento registrados no Compliance.'), updated_at=datetime('now') WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND (fundamento_tipo IS NULL OR TRIM(fundamento_tipo)='' OR fundamento_tipo='Documento controlado')`,
);
// Overrides que precisam ficar semanticamente explícitos.
statements.push(
  `UPDATE treinamento_requisitos SET fundamento_tipo='CONTRATUAL_CLIENTE',fundamento_documento='Petrobras — Regras de Ouro / requisito contratual',updated_at=datetime('now') WHERE empresa_id=6 AND qualificacao_tipo_id=${model('PETRO-OURO')} AND ativo=1 AND deleted_at IS NULL`,
);
statements.push(
  `UPDATE treinamento_requisitos SET fundamento_tipo='APRIMORAMENTO_INTERNO',fundamento_documento='SOP Costa do Sol; decisão da Gerência de Treinamento',updated_at=datetime('now') WHERE empresa_id=6 AND qualificacao_tipo_id IN (${model('SOP_AW139')},${model('SOP_S76')}) AND ativo=1 AND deleted_at IS NULL AND obrigatoriedade<>'NAO_APLICA'`,
);

const sql = `${statements.join(';\n')};\n`;
if (sql.includes('INSERT INTO lms_matriculas')) throw new Error('AUTO_ENROLL_WRITE_FORBIDDEN');
if (/auto_matricular_ead\s*=\s*1/i.test(sql)) throw new Error('AUTO_ENROLL_ENABLE_FORBIDDEN');
for (const needle of [
  "UPPER('LOFT')",
  "UPPER('EN-ASSES')",
  "'AVSEC_TRIPULANTE'",
  "'PTAP_TRIPULANTE_VOO'",
  "'FDM_EQUIPE'",
  "'APRIMORAMENTO_INTERNO'",
  "'PETROBRAS_IOGP'",
])
  if (!sql.includes(needle)) throw new Error(`REQUIRED_GUARD_MISSING:${needle}`);
if (!sql.includes('functionName')) {
  /* source-level helper is already expanded; no-op guard anchor */
}

const hash = createHash('sha256').update(sql).digest('hex');
console.log(`RECONCILIATION_SHA256=${hash}`);
console.log(`ENV=${env}`);
console.log(`TARGET_DATABASE=${target}`);
console.log(`MODE=${apply ? 'APPLY' : 'DRY_RUN'}`);
console.log(`STATEMENTS=${statements.length}`);
if (!apply) {
  console.log(sql);
} else {
  const expectedAuth =
    env === 'production'
      ? 'AIRTRUST_PRODUCTION_APPLY_TRAINING_COMPLIANCE_V3'
      : 'AIRTRUST_STAGING_APPLY_TRAINING_COMPLIANCE_V3';
  const authVar =
    env === 'production'
      ? 'AIRTRUST_PRODUCTION_RECONCILIATION_AUTH'
      : 'AIRTRUST_STAGING_RECONCILIATION_AUTH';
  if (process.env[authVar] !== expectedAuth)
    throw new Error(`${env.toUpperCase()}_RECONCILIATION_AUTH_REQUIRED`);
  if (!/^[0-9a-f]{64}$/i.test(expectedSha256) || expectedSha256.toLowerCase() !== hash)
    throw new Error(`EXPECTED_RECONCILIATION_SHA256_MISMATCH:${expectedSha256 || 'missing'}`);
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)
    throw new Error('CLOUDFLARE_CREDENTIALS_REQUIRED');
  const workerDir = fileURLToPath(new URL('../../worker-airtrust/', import.meta.url));
  execFileSync(
    './node_modules/.bin/wrangler',
    ['d1', 'execute', target, '--env', env, '--remote', '--command', sql],
    { cwd: workerDir, stdio: 'inherit', env: process.env },
  );
}

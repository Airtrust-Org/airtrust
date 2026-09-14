#!/usr/bin/env node
// source_reference: issue #648 / staging simulator planning persistence QA
// operational_decision: read-only semantic ownership/precondition gate before synthetic D1 mutation
// dry_run_required: always read-only
// rollback_plan_required: not applicable; SELECT/WITH only
import { spawnSync } from 'node:child_process';

const DB = 'airtrust-db-staging-baseline-20260701';
const requested = String(process.env.STAGING_D1_NAME || DB).trim();
if (requested !== DB || /prod/i.test(requested)) throw new Error(`STAGING_TARGET_REFUSED:${requested}`);

function d1(sql) {
  if (!/^\s*(SELECT|WITH)\b/i.test(sql)) throw new Error('READ_ONLY_SQL_REQUIRED');
  const result = spawnSync('npx', ['wrangler','d1','execute',requested,'--remote','--json','--command',sql], {
    cwd: 'worker-airtrust', encoding: 'utf8', env: process.env,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'D1_QUERY_FAILED');
  const start = result.stdout.indexOf('['), end = result.stdout.lastIndexOf(']');
  const payload = JSON.parse(start >= 0 && end > start ? result.stdout.slice(start, end + 1) : result.stdout);
  return payload[0]?.results || [];
}

const checks = d1(`WITH qa AS (
  SELECT id FROM empresas WHERE codigo='qa_examiner_training' AND deleted_at IS NULL
), target AS (
  SELECT date('now', '+90 days') AS d
)
SELECT
  (SELECT COUNT(*) FROM empresas WHERE codigo='qa_examiner_training' AND deleted_at IS NULL AND COALESCE(ativo,1)=1) AS tenant_active,
  (SELECT COUNT(*) FROM funcionarios f JOIN qa ON qa.id=f.empresa_id
    WHERE f.matricula IN ('QA-PARTICIPANTE-ALFA','QA-PARTICIPANTE-BRAVO') AND f.deleted_at IS NULL) AS alfa_bravo_active,
  (SELECT COUNT(*) FROM funcionarios f JOIN qa ON qa.id=f.empresa_id
    WHERE f.matricula='QA-PARTICIPANTE-CHARLIE') AS charlie_rows,
  (SELECT COUNT(*) FROM funcionarios f JOIN qa ON qa.id=f.empresa_id
    JOIN funcionarios alfa ON alfa.empresa_id=f.empresa_id AND alfa.matricula='QA-PARTICIPANTE-ALFA' AND alfa.deleted_at IS NULL
    WHERE f.matricula='QA-PARTICIPANTE-CHARLIE'
      AND NOT (
        COALESCE(f.nome,'')='QA Participante Charlie'
        AND COALESCE(f.cargo,'')='Participante QA'
        AND COALESCE(f.status,'')='ATIVO'
        AND COALESCE(f.ativo,1)=1
        AND COALESCE(f.is_instrutor,0)=0
        AND COALESCE(f.is_checador,0)=0
        AND COALESCE(f.is_examinador,0)=0
        AND f.setor IS alfa.setor
        AND f.setor_id IS alfa.setor_id
      )) AS charlie_divergent,
  (SELECT COUNT(*) FROM empresas_config ec JOIN qa ON qa.id=ec.empresa_id
    WHERE ec.planejamento_simulador_antecedencia_dias=120
      AND ec.planejamento_simulador_regra_quinzena='AMBAS'
      AND ec.planejamento_simulador_permitir_sessao_compartilhada=1
      AND ec.planejamento_simulador_preferir_mesmo_treinamento=1
      AND ec.planejamento_simulador_preferir_mesma_sessao=1
      AND ec.planejamento_simulador_aprovacao_obrigatoria=1) AS config_exact,
  (SELECT COUNT(*) FROM escalas_mensais em JOIN qa ON qa.id=em.empresa_id, target
    WHERE em.id<>'QA-SIM-PLN-ROSTER'
      AND em.mes=CAST(strftime('%m',target.d) AS INTEGER)
      AND em.ano=CAST(strftime('%Y',target.d) AS INTEGER)
      AND em.deleted_at IS NULL) AS conflicting_rosters,
  (SELECT COUNT(*) FROM qualificacoes_categorias qc JOIN qa ON qa.id=qc.empresa_id
    WHERE UPPER(qc.codigo)=UPPER('QA-SIM-PLN-CAT')
      AND NOT (
        COALESCE(qc.nome,'')='QA Simulador — Planejamento Persistente'
        AND COALESCE(qc.descricao,'')='Categoria sintética de staging para o aceite do Planejamento de Simulador V3.'
        AND COALESCE(qc.cor,'')='#64748b'
        AND COALESCE(qc.dominio_codigo,'')='OPERACOES'
        AND COALESCE(qc.lms_integrada,0)=0
      )) AS category_divergent,
  (SELECT COUNT(*) FROM qualificacoes_tipos qt JOIN qa ON qa.id=qt.empresa_id
    WHERE UPPER(qt.codigo)=UPPER('QA-SIM-PLN-AW139')
      AND NOT (
        COALESCE(qt.nome,'')='QA Simulador AW139 — Planejamento Persistente'
        AND COALESCE(qt.tipo,'')='TREINAMENTO'
        AND COALESCE(qt.descricao,'')='Fixture sintética de staging para QA do Planejamento de Simulador V3.'
        AND COALESCE(qt.observacoes,'')='QA_ONLY_SIMULATOR_PLANNING'
      )) AS qtype_divergent,
  (SELECT COUNT(*) FROM modelos_sessao ms
    WHERE ms.codigo='QA-SIM-PLN-S01'
      AND NOT (
        ms.empresa_id=(SELECT id FROM qa)
        AND COALESCE(ms.nome,'')='QA Planejamento Persistente — Sessão 1'
        AND COALESCE(ms.tipo,'')='RECORRENTE'
        AND COALESCE(ms.descricao,'')='Fixture sintética de staging para proposta V3.'
        AND COALESCE(ms.duracao_estimada,-1)=120
        AND COALESCE(ms.ordem_no_treinamento,-1)=1
        AND COALESCE(ms.modelo_aeronave,'')='AW139'
      )) AS model_divergent,
  (SELECT COUNT(*) FROM modelos_sessao_versionamento msv
    LEFT JOIN modelos_sessao ms ON ms.id=msv.modelo_id AND ms.empresa_id=msv.empresa_id
    WHERE (msv.codigo_canonico='QA-SIM-PLN-S01' OR ms.codigo='QA-SIM-PLN-S01')
      AND NOT (
        msv.empresa_id=(SELECT id FROM qa)
        AND COALESCE(ms.empresa_id,-1)=(SELECT id FROM qa)
        AND COALESCE(ms.codigo,'')='QA-SIM-PLN-S01'
        AND msv.codigo_canonico='QA-SIM-PLN-S01'
        AND msv.versao_numero=1
        AND msv.versao_matriz='QA_SIMULATOR_PLANNING'
        AND msv.is_current=1
        AND msv.modelo_anterior_id IS NULL
        AND msv.efetivo_ate IS NULL
      )) AS version_divergent,
  (SELECT COUNT(*) FROM escalas_mensais em
    WHERE em.id='QA-SIM-PLN-ROSTER'
      AND NOT (
        em.empresa_id=(SELECT id FROM qa)
        AND COALESCE(em.titulo,'')='QA Simulator Planning Roster'
        AND COALESCE(em.observacoes,'')='QA_ONLY_SIMULATOR_PLANNING'
        AND COALESCE(em.created_by,'')='qa-simulator-planning'
      )) AS roster_divergent,
  (SELECT COUNT(*) FROM escala_alocacoes ea
    WHERE ea.id IN ('QA-SIM-PLN-ALFA-FOLGA','QA-SIM-PLN-BRAVO-FOLGA','QA-SIM-PLN-CHARLIE-FOLGA')
      AND NOT (
        COALESCE(ea.escala_id,'')='QA-SIM-PLN-ROSTER'
        AND COALESCE(ea.observacoes,'')='QA_ONLY_SIMULATOR_PLANNING'
        AND COALESCE(ea.created_by,'')='qa-simulator-planning'
      )) AS allocation_divergent,
  (SELECT COUNT(*) FROM qualificacoes_historico qh
    LEFT JOIN funcionarios f ON f.id=qh.funcionario_id AND f.empresa_id=qh.empresa_id
    LEFT JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id AND qt.empresa_id=qh.empresa_id
    WHERE qh.empresa_id=(SELECT id FROM qa)
      AND qh.observacoes='QA_ONLY_SIMULATOR_PLANNING'
      AND NOT (
        f.matricula IN ('QA-PARTICIPANTE-ALFA','QA-PARTICIPANTE-BRAVO','QA-PARTICIPANTE-CHARLIE')
        AND UPPER(COALESCE(qt.codigo,''))=UPPER('QA-SIM-PLN-AW139')
        AND UPPER(COALESCE(qh.qualificacao_codigo,''))=UPPER('QA-SIM-PLN-AW139')
        AND COALESCE(qh.categoria,'')='TREINAMENTO'
        AND COALESCE(qh.carga_horaria,-1)=2
      )) AS history_divergent;`)[0] || {};

const numeric = Object.fromEntries(Object.entries(checks).map(([key, value]) => [key, Number(value || 0)]));
const compatible = numeric.tenant_active === 1
  && numeric.alfa_bravo_active === 2
  && numeric.charlie_rows <= 1
  && numeric.charlie_divergent === 0
  && numeric.config_exact === 1
  && numeric.conflicting_rosters === 0
  && numeric.category_divergent === 0
  && numeric.qtype_divergent === 0
  && numeric.model_divergent === 0
  && numeric.version_divergent === 0
  && numeric.roster_divergent === 0
  && numeric.allocation_divergent === 0
  && numeric.history_divergent === 0;

console.log(JSON.stringify({
  target: requested,
  mode: 'READ_ONLY_FIXTURE_PREFLIGHT',
  fixture_preconditions_compatible: compatible,
  checks: numeric,
}, null, 2));
if (!compatible) process.exitCode = 5;

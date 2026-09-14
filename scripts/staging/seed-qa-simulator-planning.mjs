#!/usr/bin/env node

// source_reference: staging-only synthetic acceptance fixture for simulator
// planning persistence (#275). Requires the canonical qa_examiner_training
// tenant from seed-qa-examiner-training.mjs, but deliberately remains separate
// so the historical examiner seed does not depend on planning schema 0466+.
// operational_decision: STAGING_ONLY; no production host/database accepted.
// dry_run_required: default mode does not write. --apply requires the explicit
// confirmation phrase below.
// rollback_plan_required: --rollback --apply soft-deletes only QA planning
// artifacts identified by reserved natural codes/markers. The synthetic QA
// tenant configuration is a precondition only; this fixture never mutates it.

import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ALLOWED_D1_NAME = 'airtrust-db-staging-baseline-20260701';
const BLOCKED_D1_NAMES = ['airtrust-db', 'airtrust-db-dev', 'airtrust-db-production'];
const CONFIRMATION_PHRASE = 'AIRTRUST_STAGING_SIMULATOR_PLANNING_QA_SEED';

const EMPRESA_CODIGO = 'qa_examiner_training';
const PARTICIPANTE1_CODIGO = 'QA-PARTICIPANTE-ALFA';
const PARTICIPANTE2_CODIGO = 'QA-PARTICIPANTE-BRAVO';
const PARTICIPANTE3_CODIGO = 'QA-PARTICIPANTE-CHARLIE';
const PLANNING_CATEGORY_CODE = 'QA-SIM-PLN-CAT';
const PLANNING_QUAL_CODE = 'QA-SIM-PLN-AW139';
const PLANNING_MODEL_CODE = 'QA-SIM-PLN-S01';
const PLANNING_MARKER = 'QA_ONLY_SIMULATOR_PLANNING';
const DRAFT_MARKER = 'QA_SIMULATOR_PLANNING_SMOKE';
const QA_ROSTER_ID = 'QA-SIM-PLN-ROSTER';
const QA_ALLOCATION_IDS = ['QA-SIM-PLN-ALFA-FOLGA', 'QA-SIM-PLN-BRAVO-FOLGA', 'QA-SIM-PLN-CHARLIE-FOLGA'];

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function validateD1Target(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('STAGING_D1_NAME vazio — seed bloqueado.');
  if (BLOCKED_D1_NAMES.includes(trimmed.toLowerCase()) || /prod/i.test(trimmed)) {
    throw new Error(`D1 alvo "${trimmed}" bloqueado; produção não é permitida.`);
  }
  if (trimmed !== ALLOWED_D1_NAME) {
    throw new Error(`D1 alvo "${trimmed}" não é o staging canônico.`);
  }
  return trimmed;
}

function buildSeedSql() {
  const e = sqlString;
  const allocationIds = QA_ALLOCATION_IDS.map(e).join(', ');
  return `
-- Guard fail-closed: o tenant QA canônico deve existir antes deste seed.
CREATE TABLE IF NOT EXISTS _qa_sim_planning_requires_tenant (
  ok INTEGER NOT NULL CHECK (ok = 1)
);
DELETE FROM _qa_sim_planning_requires_tenant;
INSERT INTO _qa_sim_planning_requires_tenant(ok)
SELECT CASE
  WHEN EXISTS (
    SELECT 1 FROM empresas
    WHERE codigo = ${e(EMPRESA_CODIGO)}
      AND deleted_at IS NULL
      AND COALESCE(ativo, 1) = 1
  )
  AND (
    SELECT COUNT(*)
    FROM funcionarios f
    JOIN empresas emp ON emp.id = f.empresa_id
    WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
      AND emp.deleted_at IS NULL
      AND f.matricula IN (${e(PARTICIPANTE1_CODIGO)}, ${e(PARTICIPANTE2_CODIGO)})
      AND f.deleted_at IS NULL
  ) = 2 THEN 1 ELSE 0
END;
DROP TABLE _qa_sim_planning_requires_tenant;

-- Charlie pertence exclusivamente a este fixture descartável. Se uma linha ativa
-- com a matrícula reservada já existir após o pre-clean, falhar fechado em vez
-- de reutilizar/normalizar um participante que possa pertencer a outro QA.
CREATE TABLE IF NOT EXISTS _qa_sim_planning_requires_charlie_absent (
  ok INTEGER NOT NULL CHECK (ok = 1)
);
DELETE FROM _qa_sim_planning_requires_charlie_absent;
INSERT INTO _qa_sim_planning_requires_charlie_absent(ok)
SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM funcionarios f
  JOIN empresas emp ON emp.id = f.empresa_id
  WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
    AND emp.deleted_at IS NULL
    AND f.matricula = ${e(PARTICIPANTE3_CODIGO)}
    AND f.deleted_at IS NULL
) THEN 1 ELSE 0 END;
DROP TABLE _qa_sim_planning_requires_charlie_absent;

-- Todas as demais identidades reservadas podem ser reativadas somente quando
-- pertencem inequivocamente a este fixture. Qualquer colisão de código/ID com
-- assinatura divergente falha fechado antes de qualquer normalização.
CREATE TABLE IF NOT EXISTS _qa_sim_planning_requires_reserved_signatures (
  ok INTEGER NOT NULL CHECK (ok = 1)
);
DELETE FROM _qa_sim_planning_requires_reserved_signatures;
INSERT INTO _qa_sim_planning_requires_reserved_signatures(ok)
SELECT CASE WHEN
  NOT EXISTS (
    SELECT 1 FROM qualificacoes_categorias qc
    WHERE qc.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
      AND UPPER(qc.codigo) = UPPER(${e(PLANNING_CATEGORY_CODE)})
      AND NOT (
        COALESCE(qc.nome, '') = 'QA Simulador — Planejamento Persistente'
        AND COALESCE(qc.descricao, '') = 'Categoria sintética de staging para o aceite do Planejamento de Simulador V3.'
        AND COALESCE(qc.cor, '') = '#64748b'
        AND COALESCE(qc.dominio_codigo, '') = 'OPERACOES'
        AND COALESCE(qc.lms_integrada, 0) = 0
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM qualificacoes_tipos qt
    WHERE qt.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
      AND UPPER(qt.codigo) = UPPER(${e(PLANNING_QUAL_CODE)})
      AND NOT (
        COALESCE(qt.nome, '') = 'QA Simulador AW139 — Planejamento Persistente'
        AND COALESCE(qt.tipo, '') = 'TREINAMENTO'
        AND COALESCE(qt.descricao, '') = 'Fixture sintética de staging para QA do Planejamento de Simulador V3.'
        AND COALESCE(qt.observacoes, '') = ${e(PLANNING_MARKER)}
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM modelos_sessao ms
    WHERE ms.codigo = ${e(PLANNING_MODEL_CODE)}
      AND NOT (
        ms.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
        AND COALESCE(ms.nome, '') = 'QA Planejamento Persistente — Sessão 1'
        AND COALESCE(ms.tipo, '') = 'RECORRENTE'
        AND COALESCE(ms.descricao, '') = 'Fixture sintética de staging para proposta V3.'
        AND COALESCE(ms.duracao_estimada, -1) = 120
        AND COALESCE(ms.ordem_no_treinamento, -1) = 1
        AND COALESCE(ms.modelo_aeronave, '') = 'AW139'
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM modelos_sessao_versionamento msv
    LEFT JOIN modelos_sessao ms
      ON ms.id = msv.modelo_id
     AND ms.empresa_id = msv.empresa_id
    WHERE (
      msv.codigo_canonico = ${e(PLANNING_MODEL_CODE)}
      OR ms.codigo = ${e(PLANNING_MODEL_CODE)}
    )
      AND NOT (
        msv.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
        AND COALESCE(ms.empresa_id, -1) = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
        AND COALESCE(ms.codigo, '') = ${e(PLANNING_MODEL_CODE)}
        AND msv.codigo_canonico = ${e(PLANNING_MODEL_CODE)}
        AND msv.versao_numero = 1
        AND msv.versao_matriz = 'QA_SIMULATOR_PLANNING'
        AND msv.is_current = 1
        AND msv.modelo_anterior_id IS NULL
        AND msv.efetivo_ate IS NULL
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM escalas_mensais em
    WHERE em.id = ${e(QA_ROSTER_ID)}
      AND NOT (
        em.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
        AND COALESCE(em.titulo, '') = 'QA Simulator Planning Roster'
        AND COALESCE(em.observacoes, '') = ${e(PLANNING_MARKER)}
        AND COALESCE(em.created_by, '') = 'qa-simulator-planning'
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM escala_alocacoes ea
    WHERE ea.id IN (${allocationIds})
      AND NOT (
        COALESCE(ea.escala_id, '') = ${e(QA_ROSTER_ID)}
        AND COALESCE(ea.observacoes, '') = ${e(PLANNING_MARKER)}
        AND COALESCE(ea.created_by, '') = 'qa-simulator-planning'
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM qualificacoes_historico qh
    LEFT JOIN funcionarios f
      ON f.id = qh.funcionario_id AND f.empresa_id = qh.empresa_id
    LEFT JOIN qualificacoes_tipos qt
      ON qt.id = qh.qualificacao_id AND qt.empresa_id = qh.empresa_id
    WHERE qh.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
      AND qh.observacoes = ${e(PLANNING_MARKER)}
      -- Inclui linhas ativas e soft-deletadas: o seed reativa históricos reservados,
      -- então uma colisão divergente deve falhar antes de qualquer normalização.
      AND NOT (
        f.matricula IN (${e(PARTICIPANTE1_CODIGO)}, ${e(PARTICIPANTE2_CODIGO)}, ${e(PARTICIPANTE3_CODIGO)})
        AND f.deleted_at IS NULL
        AND UPPER(COALESCE(qt.codigo, '')) = UPPER(${e(PLANNING_QUAL_CODE)})
        AND qt.deleted_at IS NULL
        AND UPPER(COALESCE(qh.qualificacao_codigo, '')) = UPPER(${e(PLANNING_QUAL_CODE)})
        AND COALESCE(qh.categoria, '') = 'TREINAMENTO'
        AND COALESCE(qh.carga_horaria, -1) = 2
      )
  )
THEN 1 ELSE 0 END;
DROP TABLE _qa_sim_planning_requires_reserved_signatures;

-- A política de planejamento do tenant QA é baseline canônico, não fixture descartável.
-- Falhar fechado se ela divergir; nunca sobrescrevê-la para fazer o smoke passar.
CREATE TABLE IF NOT EXISTS _qa_sim_planning_requires_config (
  ok INTEGER NOT NULL CHECK (ok = 1)
);
DELETE FROM _qa_sim_planning_requires_config;
INSERT INTO _qa_sim_planning_requires_config(ok)
SELECT CASE WHEN EXISTS (
  SELECT 1
  FROM empresas_config ec
  JOIN empresas emp ON emp.id = ec.empresa_id
  WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
    AND emp.deleted_at IS NULL
    AND ec.planejamento_simulador_antecedencia_dias = 120
    AND ec.planejamento_simulador_regra_quinzena = 'AMBAS'
    AND ec.planejamento_simulador_permitir_sessao_compartilhada = 1
    AND ec.planejamento_simulador_preferir_mesmo_treinamento = 1
    AND ec.planejamento_simulador_preferir_mesma_sessao = 1
    AND ec.planejamento_simulador_aprovacao_obrigatoria = 1
) THEN 1 ELSE 0 END;
DROP TABLE _qa_sim_planning_requires_config;

-- Limpa apenas drafts anteriores deste smoke no tenant sintético.
UPDATE treinamentos_planejados
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND planejamento_origem = 'SIMULADOR_V3_PERSISTED'
  AND planejamento_snapshot_json LIKE '%${DRAFT_MARKER}%'
  AND deleted_at IS NULL;

-- Categoria canônica QA exigida pelo contrato 0457.
-- A identidade é tenant-scoped, ativa e separada de qualquer catálogo real.
INSERT INTO qualificacoes_categorias (
  nome, codigo, descricao, cor, ativo, empresa_id,
  dominio_codigo, lms_integrada, created_at, updated_at, deleted_at
)
SELECT
  'QA Simulador — Planejamento Persistente',
  ${e(PLANNING_CATEGORY_CODE)},
  'Categoria sintética de staging para o aceite do Planejamento de Simulador V3.',
  '#64748b',
  1,
  emp.id,
  'OPERACOES',
  0,
  datetime('now'),
  datetime('now'),
  NULL
FROM empresas emp
WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND emp.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM qualificacoes_categorias qc
    WHERE qc.empresa_id = emp.id
      AND UPPER(qc.codigo) = UPPER(${e(PLANNING_CATEGORY_CODE)})
  );

UPDATE qualificacoes_categorias
SET nome = 'QA Simulador — Planejamento Persistente',
    descricao = 'Categoria sintética de staging para o aceite do Planejamento de Simulador V3.',
    cor = '#64748b',
    ativo = 1,
    dominio_codigo = 'OPERACOES',
    lms_integrada = 0,
    deleted_at = NULL,
    updated_at = datetime('now')
WHERE id = (
  SELECT qc.id
  FROM qualificacoes_categorias qc
  WHERE qc.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
    AND UPPER(qc.codigo) = UPPER(${e(PLANNING_CATEGORY_CODE)})
  ORDER BY CASE WHEN qc.deleted_at IS NULL THEN 0 ELSE 1 END, qc.id DESC
  LIMIT 1
);

-- Tipo de qualificação QA. Reusa/reactiva a mesma identidade natural.
INSERT INTO qualificacoes_tipos (
  tipo, codigo, nome, descricao, categoria_id, categoria, carga_horaria, validade,
  vencimento_fim_mes, observacoes, ativo, empresa_id, created_at, updated_at, deleted_at
)
SELECT
  'TREINAMENTO', ${e(PLANNING_QUAL_CODE)},
  'QA Simulador AW139 — Planejamento Persistente',
  'Fixture sintética de staging para QA do Planejamento de Simulador V3.',
  qc.id, qc.nome, 2, 12, 0, ${e(PLANNING_MARKER)}, 1, emp.id,
  datetime('now'), datetime('now'), NULL
FROM empresas emp
JOIN qualificacoes_categorias qc
  ON qc.empresa_id = emp.id
 AND UPPER(qc.codigo) = UPPER(${e(PLANNING_CATEGORY_CODE)})
 AND qc.ativo = 1
 AND qc.deleted_at IS NULL
WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND emp.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM qualificacoes_tipos qt
    WHERE qt.empresa_id = emp.id
      AND UPPER(qt.codigo) = UPPER(${e(PLANNING_QUAL_CODE)})
  );

UPDATE qualificacoes_tipos
SET nome = 'QA Simulador AW139 — Planejamento Persistente',
    tipo = 'TREINAMENTO',
    descricao = 'Fixture sintética de staging para QA do Planejamento de Simulador V3.',
    categoria_id = (
      SELECT qc.id
      FROM qualificacoes_categorias qc
      WHERE qc.empresa_id = qualificacoes_tipos.empresa_id
        AND UPPER(qc.codigo) = UPPER(${e(PLANNING_CATEGORY_CODE)})
        AND qc.ativo = 1
        AND qc.deleted_at IS NULL
      LIMIT 1
    ),
    categoria = 'QA Simulador — Planejamento Persistente',
    carga_horaria = 2,
    validade = 12,
    observacoes = ${e(PLANNING_MARKER)},
    ativo = 1,
    deleted_at = NULL,
    updated_at = datetime('now')
WHERE id = (
  SELECT qt.id
  FROM qualificacoes_tipos qt
  WHERE qt.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
    AND UPPER(qt.codigo) = UPPER(${e(PLANNING_QUAL_CODE)})
  ORDER BY CASE WHEN qt.deleted_at IS NULL THEN 0 ELSE 1 END, qt.id DESC
  LIMIT 1
);

-- Modelo único ligado ao tipo QA. codigo é globalmente único em schemas legados,
-- por isso INSERT OR IGNORE + reativação é o caminho idempotente.
INSERT OR IGNORE INTO modelos_sessao (
  codigo, nome, tipo, descricao, duracao_estimada, ordem_no_treinamento,
  ativo, empresa_id, modelo_aeronave, qualificacao_tipo_id,
  created_at, updated_at, deleted_at
)
SELECT
  ${e(PLANNING_MODEL_CODE)}, 'QA Planejamento Persistente — Sessão 1',
  'RECORRENTE', 'Fixture sintética de staging para proposta V3.',
  120, 1, 1, emp.id, 'AW139', qt.id, datetime('now'), datetime('now'), NULL
FROM empresas emp
JOIN qualificacoes_tipos qt
  ON qt.empresa_id = emp.id
 AND UPPER(qt.codigo) = UPPER(${e(PLANNING_QUAL_CODE)})
 AND qt.deleted_at IS NULL
WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND emp.deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'QA Planejamento Persistente — Sessão 1',
    tipo = 'RECORRENTE',
    descricao = 'Fixture sintética de staging para proposta V3.',
    duracao_estimada = 120,
    ordem_no_treinamento = 1,
    ativo = 1,
    modelo_aeronave = 'AW139',
    qualificacao_tipo_id = (
      SELECT qt.id
      FROM qualificacoes_tipos qt
      WHERE qt.empresa_id = modelos_sessao.empresa_id
        AND UPPER(qt.codigo) = UPPER(${e(PLANNING_QUAL_CODE)})
        AND qt.deleted_at IS NULL
      LIMIT 1
    ),
    deleted_at = NULL,
    updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND codigo = ${e(PLANNING_MODEL_CODE)};

-- Contrato 0440: quando o versionamento existe, as APIs de modelos e o
-- planejador só enxergam versões correntes. O modelo físico isolado não basta.
INSERT OR IGNORE INTO modelos_sessao_versionamento (
  modelo_id, empresa_id, codigo_canonico, versao_numero,
  versao_matriz, is_current, modelo_anterior_id, efetivo_em, efetivo_ate,
  created_at, updated_at
)
SELECT
  ms.id,
  ms.empresa_id,
  ${e(PLANNING_MODEL_CODE)},
  1,
  'QA_SIMULATOR_PLANNING',
  1,
  NULL,
  datetime('now'),
  NULL,
  datetime('now'),
  datetime('now')
FROM modelos_sessao ms
WHERE ms.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND ms.codigo = ${e(PLANNING_MODEL_CODE)}
  AND ms.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM modelos_sessao_versionamento msv
    WHERE msv.modelo_id = ms.id
  );

-- Terceiro participante existe apenas para provar que a comparação CAE não repara singles silenciosamente.
INSERT INTO funcionarios (
  nome, matricula, cargo, setor, setor_id, status, instrutor_simulador, checador_simulador, ativo, empresa_id,
  created_at, updated_at, deleted_at
)
SELECT
  'QA Participante Charlie', ${e(PARTICIPANTE3_CODIGO)}, 'Participante QA', alfa.setor, alfa.setor_id,
  'ATIVO', 0, 0, 1, emp.id, datetime('now'), datetime('now'), NULL
FROM empresas emp
JOIN funcionarios alfa
  ON alfa.empresa_id = emp.id
 AND alfa.matricula = ${e(PARTICIPANTE1_CODIGO)}
 AND alfa.deleted_at IS NULL
WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND emp.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM funcionarios
    WHERE empresa_id = emp.id
      AND matricula = ${e(PARTICIPANTE3_CODIGO)}
      AND deleted_at IS NULL
  );

-- Três históricos QA com o mesmo vencimento: dois formam uma dupla bloqueada e o terceiro permanece singleton.
INSERT INTO qualificacoes_historico (
  funcionario_id, qualificacao_id, qualificacao_codigo,
  data_conclusao, data_vencimento, validade_meses,
  codigo, categoria, observacoes, carga_horaria, status,
  empresa_id, created_at, updated_at, deleted_at
)
SELECT
  f.id, qt.id, qt.codigo,
  date('now', '-275 days'), date('now', '+90 days'), 12,
  'QA-SIM-PLN-' || f.matricula, 'TREINAMENTO', ${e(PLANNING_MARKER)},
  2, 'VALIDA', emp.id, datetime('now'), datetime('now'), NULL
FROM empresas emp
JOIN funcionarios f
  ON f.empresa_id = emp.id
 AND f.matricula IN (${e(PARTICIPANTE1_CODIGO)}, ${e(PARTICIPANTE2_CODIGO)}, ${e(PARTICIPANTE3_CODIGO)})
 AND f.deleted_at IS NULL
JOIN qualificacoes_tipos qt
  ON qt.empresa_id = emp.id
 AND UPPER(qt.codigo) = UPPER(${e(PLANNING_QUAL_CODE)})
 AND qt.deleted_at IS NULL
WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND emp.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM qualificacoes_historico qh
    WHERE qh.empresa_id = emp.id
      AND qh.funcionario_id = f.id
      AND qh.qualificacao_id = qt.id
      AND qh.observacoes = ${e(PLANNING_MARKER)}
  );

UPDATE qualificacoes_historico
SET data_conclusao = date('now', '-275 days'),
    data_vencimento = date('now', '+90 days'),
    validade_meses = 12,
    qualificacao_codigo = ${e(PLANNING_QUAL_CODE)},
    categoria = 'TREINAMENTO',
    observacoes = ${e(PLANNING_MARKER)},
    carga_horaria = 2,
    status = 'VALIDA',
    deleted_at = NULL,
    updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND observacoes = ${e(PLANNING_MARKER)}
  AND qualificacao_id = (
    SELECT id FROM qualificacoes_tipos
    WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
      AND UPPER(codigo) = UPPER(${e(PLANNING_QUAL_CODE)})
    LIMIT 1
  )
  AND funcionario_id IN (
    SELECT id FROM funcionarios
    WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
      AND matricula IN (${e(PARTICIPANTE1_CODIGO)}, ${e(PARTICIPANTE2_CODIGO)}, ${e(PARTICIPANTE3_CODIGO)})
  );

-- Escala publicada sintética: sem ela, o planner deve e continuará falhando
-- fechado como DESCONHECIDO. Não tocar escalas pré-existentes do mesmo mês.
CREATE TABLE IF NOT EXISTS _qa_sim_planning_requires_isolated_roster (
  ok INTEGER NOT NULL CHECK (ok = 1)
);
DELETE FROM _qa_sim_planning_requires_isolated_roster;
INSERT INTO _qa_sim_planning_requires_isolated_roster(ok)
SELECT CASE WHEN NOT EXISTS (
  SELECT 1
  FROM escalas_mensais
  WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
    AND id <> ${e(QA_ROSTER_ID)}
    AND mes = CAST(strftime('%m', date('now', '+90 days')) AS INTEGER)
    AND ano = CAST(strftime('%Y', date('now', '+90 days')) AS INTEGER)
    AND deleted_at IS NULL
) THEN 1 ELSE 0 END;
DROP TABLE _qa_sim_planning_requires_isolated_roster;

-- Os três participantes ficam em FOLGA exclusivamente nesta escala reservada.
INSERT OR IGNORE INTO escalas_mensais (
  id, mes, ano, titulo, status, observacoes, empresa_id,
  created_by, created_at, updated_at, deleted_at
)
SELECT
  ${e(QA_ROSTER_ID)},
  CAST(strftime('%m', date('now', '+90 days')) AS INTEGER),
  CAST(strftime('%Y', date('now', '+90 days')) AS INTEGER),
  'QA Simulator Planning Roster', 'publicada', ${e(PLANNING_MARKER)},
  emp.id, 'qa-simulator-planning', datetime('now'), datetime('now'), NULL
FROM empresas emp
WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND emp.deleted_at IS NULL;

UPDATE escalas_mensais
SET mes = CAST(strftime('%m', date('now', '+90 days')) AS INTEGER),
    ano = CAST(strftime('%Y', date('now', '+90 days')) AS INTEGER),
    titulo = 'QA Simulator Planning Roster',
    status = 'publicada',
    observacoes = ${e(PLANNING_MARKER)},
    deleted_at = NULL,
    updated_at = datetime('now')
WHERE id = ${e(QA_ROSTER_ID)}
  AND empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND NOT EXISTS (
    SELECT 1
    FROM escalas_mensais other
    WHERE other.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
      AND other.id <> ${e(QA_ROSTER_ID)}
      AND other.mes = CAST(strftime('%m', date('now', '+90 days')) AS INTEGER)
      AND other.ano = CAST(strftime('%Y', date('now', '+90 days')) AS INTEGER)
      AND other.deleted_at IS NULL
  );

INSERT OR IGNORE INTO escala_alocacoes (
  id, escala_id, funcionario_id, aeronave_id, funcao,
  situacao_tipo, situacao_cor, quinzena_id, data_inicio, data_fim,
  status, observacoes, created_by, created_at, updated_at, deleted_at
)
SELECT
  CASE f.matricula
    WHEN ${e(PARTICIPANTE1_CODIGO)} THEN ${e(QA_ALLOCATION_IDS[0])}
    WHEN ${e(PARTICIPANTE2_CODIGO)} THEN ${e(QA_ALLOCATION_IDS[1])}
    ELSE ${e(QA_ALLOCATION_IDS[2])}
  END,
  em.id, CAST(f.id AS TEXT), NULL, NULL, 'FOLGA', '#64748b', NULL,
  date('now'), date('now', '+120 days'), 'confirmado',
  ${e(PLANNING_MARKER)}, 'qa-simulator-planning',
  datetime('now'), datetime('now'), NULL
FROM empresas emp
JOIN funcionarios f
  ON f.empresa_id = emp.id
 AND f.matricula IN (${e(PARTICIPANTE1_CODIGO)}, ${e(PARTICIPANTE2_CODIGO)}, ${e(PARTICIPANTE3_CODIGO)})
 AND f.deleted_at IS NULL
JOIN escalas_mensais em
  ON em.empresa_id = emp.id
 AND em.id = ${e(QA_ROSTER_ID)}
 AND em.status = 'publicada'
 AND em.observacoes = ${e(PLANNING_MARKER)}
 AND em.deleted_at IS NULL
WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND emp.deleted_at IS NULL;

UPDATE escala_alocacoes
SET escala_id = (
      SELECT em.id
      FROM escalas_mensais em
      WHERE em.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
        AND em.id = ${e(QA_ROSTER_ID)}
        AND em.status = 'publicada'
        AND em.observacoes = ${e(PLANNING_MARKER)}
        AND em.deleted_at IS NULL
      LIMIT 1
    ),
    funcionario_id = CASE id
      WHEN ${e(QA_ALLOCATION_IDS[0])} THEN CAST((
        SELECT f.id FROM funcionarios f
        WHERE f.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
          AND f.matricula = ${e(PARTICIPANTE1_CODIGO)}
          AND f.deleted_at IS NULL
        LIMIT 1
      ) AS TEXT)
      WHEN ${e(QA_ALLOCATION_IDS[1])} THEN CAST((
        SELECT f.id FROM funcionarios f
        WHERE f.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
          AND f.matricula = ${e(PARTICIPANTE2_CODIGO)}
          AND f.deleted_at IS NULL
        LIMIT 1
      ) AS TEXT)
      ELSE CAST((
        SELECT f.id FROM funcionarios f
        WHERE f.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
          AND f.matricula = ${e(PARTICIPANTE3_CODIGO)}
          AND f.deleted_at IS NULL
        LIMIT 1
      ) AS TEXT)
    END,
    aeronave_id = NULL,
    funcao = NULL,
    situacao_tipo = 'FOLGA',
    situacao_cor = '#64748b',
    quinzena_id = NULL,
    data_inicio = date('now'),
    data_fim = date('now', '+120 days'),
    status = 'confirmado',
    observacoes = ${e(PLANNING_MARKER)},
    created_by = 'qa-simulator-planning',
    deleted_at = NULL,
    updated_at = datetime('now')
WHERE id IN (${allocationIds})
  AND escala_id IN (
    SELECT id FROM escalas_mensais
    WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  );

-- Pós-condições atômicas. Qualquer divergência aborta o batch inteiro.
CREATE TABLE IF NOT EXISTS _qa_sim_planning_post_guard (
  tenant_count INTEGER NOT NULL CHECK (tenant_count = 1),
  category_count INTEGER NOT NULL CHECK (category_count = 1),
  qualification_count INTEGER NOT NULL CHECK (qualification_count = 1),
  model_count INTEGER NOT NULL CHECK (model_count = 1),
  model_version_count INTEGER NOT NULL CHECK (model_version_count = 1),
  participant_count INTEGER NOT NULL CHECK (participant_count = 3),
  history_count INTEGER NOT NULL CHECK (history_count = 3),
  allocation_count INTEGER NOT NULL CHECK (allocation_count = 3),
  config_count INTEGER NOT NULL CHECK (config_count = 1)
);
DELETE FROM _qa_sim_planning_post_guard;
INSERT INTO _qa_sim_planning_post_guard (
  tenant_count, category_count, qualification_count, model_count,
  model_version_count, participant_count, history_count, allocation_count, config_count
)
SELECT
  (SELECT COUNT(*) FROM empresas
    WHERE codigo = ${e(EMPRESA_CODIGO)} AND deleted_at IS NULL),
  (SELECT COUNT(*) FROM qualificacoes_categorias
    WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
      AND UPPER(codigo) = UPPER(${e(PLANNING_CATEGORY_CODE)})
      AND ativo = 1
      AND deleted_at IS NULL),
  (SELECT COUNT(*) FROM qualificacoes_tipos
    WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
      AND UPPER(codigo) = UPPER(${e(PLANNING_QUAL_CODE)})
      AND deleted_at IS NULL),
  (SELECT COUNT(*) FROM modelos_sessao
    WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
      AND codigo = ${e(PLANNING_MODEL_CODE)}
      AND qualificacao_tipo_id = (
        SELECT id FROM qualificacoes_tipos
        WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
          AND UPPER(codigo) = UPPER(${e(PLANNING_QUAL_CODE)})
          AND deleted_at IS NULL
        LIMIT 1
      )
      AND deleted_at IS NULL),
  (SELECT COUNT(*)
   FROM modelos_sessao_versionamento msv
   JOIN modelos_sessao ms
     ON ms.id = msv.modelo_id
    AND ms.empresa_id = msv.empresa_id
   WHERE ms.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
     AND ms.codigo = ${e(PLANNING_MODEL_CODE)}
     AND ms.deleted_at IS NULL
     AND msv.codigo_canonico = ${e(PLANNING_MODEL_CODE)}
     AND msv.versao_matriz = 'QA_SIMULATOR_PLANNING'
     AND msv.is_current = 1
     AND msv.efetivo_ate IS NULL),
  (SELECT COUNT(*) FROM funcionarios
    WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
      AND matricula IN (${e(PARTICIPANTE1_CODIGO)}, ${e(PARTICIPANTE2_CODIGO)}, ${e(PARTICIPANTE3_CODIGO)})
      AND deleted_at IS NULL),
  (SELECT COUNT(*) FROM qualificacoes_historico
    WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
      AND observacoes = ${e(PLANNING_MARKER)}
      AND deleted_at IS NULL),
  (SELECT COUNT(*) FROM escala_alocacoes
    WHERE id IN (${allocationIds})
      AND deleted_at IS NULL
      AND data_inicio <= date('now')
      AND data_fim >= date('now', '+90 days')),
  (SELECT COUNT(*) FROM empresas_config
    WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
      AND planejamento_simulador_antecedencia_dias >= 90
      AND planejamento_simulador_regra_quinzena = 'AMBAS')
;
DROP TABLE _qa_sim_planning_post_guard;
`;
}

function buildRollbackSql() {
  const e = sqlString;
  const allocationIds = QA_ALLOCATION_IDS.map(e).join(', ');
  return `
-- Antes de qualquer cleanup, provar que o marcador de histórico reservado não
-- foi reutilizado por outra fixture/dado. O pre-clean também passa por aqui.
CREATE TABLE IF NOT EXISTS _qa_sim_planning_requires_history_signatures (
  ok INTEGER NOT NULL CHECK (ok = 1)
);
DELETE FROM _qa_sim_planning_requires_history_signatures;
INSERT INTO _qa_sim_planning_requires_history_signatures(ok)
SELECT CASE WHEN NOT EXISTS (
  SELECT 1
  FROM qualificacoes_historico qh
  LEFT JOIN funcionarios f
    ON f.id = qh.funcionario_id AND f.empresa_id = qh.empresa_id
  LEFT JOIN qualificacoes_tipos qt
    ON qt.id = qh.qualificacao_id AND qt.empresa_id = qh.empresa_id
  WHERE qh.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
    AND qh.observacoes = ${e(PLANNING_MARKER)}
    AND qh.deleted_at IS NULL
    AND NOT (
      f.matricula IN (${e(PARTICIPANTE1_CODIGO)}, ${e(PARTICIPANTE2_CODIGO)}, ${e(PARTICIPANTE3_CODIGO)})
      AND f.deleted_at IS NULL
      AND UPPER(COALESCE(qt.codigo, '')) = UPPER(${e(PLANNING_QUAL_CODE)})
      AND qt.deleted_at IS NULL
      AND UPPER(COALESCE(qh.qualificacao_codigo, '')) = UPPER(${e(PLANNING_QUAL_CODE)})
      AND COALESCE(qh.categoria, '') = 'TREINAMENTO'
      AND COALESCE(qh.carga_horaria, -1) = 2
    )
) THEN 1 ELSE 0 END;
DROP TABLE _qa_sim_planning_requires_history_signatures;

UPDATE treinamentos_planejados
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND planejamento_origem = 'SIMULADOR_V3_PERSISTED'
  AND planejamento_snapshot_json LIKE '%${DRAFT_MARKER}%'
  AND deleted_at IS NULL;

UPDATE escala_alocacoes
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE id IN (${allocationIds})
  AND escala_id = ${e(QA_ROSTER_ID)}
  AND observacoes = ${e(PLANNING_MARKER)}
  AND created_by = 'qa-simulator-planning'
  AND deleted_at IS NULL;

UPDATE escalas_mensais
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE id = ${e(QA_ROSTER_ID)}
  AND empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND titulo = 'QA Simulator Planning Roster'
  AND observacoes = ${e(PLANNING_MARKER)}
  AND created_by = 'qa-simulator-planning'
  AND deleted_at IS NULL;

UPDATE qualificacoes_historico
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND observacoes = ${e(PLANNING_MARKER)}
  AND qualificacao_id = (
    SELECT id FROM qualificacoes_tipos
    WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
      AND UPPER(codigo) = UPPER(${e(PLANNING_QUAL_CODE)})
    LIMIT 1
  )
  AND funcionario_id IN (
    SELECT id FROM funcionarios
    WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
      AND matricula IN (${e(PARTICIPANTE1_CODIGO)}, ${e(PARTICIPANTE2_CODIGO)}, ${e(PARTICIPANTE3_CODIGO)})
  )
  AND deleted_at IS NULL;

UPDATE funcionarios
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND matricula = ${e(PARTICIPANTE3_CODIGO)}
  AND nome = 'QA Participante Charlie'
  AND cargo = 'Participante QA'
  AND status = 'ATIVO'
  AND COALESCE(ativo, 1) = 1
  AND COALESCE(instrutor_simulador, 0) = 0
  AND COALESCE(checador_simulador, 0) = 0
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM funcionarios alfa
    WHERE alfa.empresa_id = funcionarios.empresa_id
      AND alfa.matricula = ${e(PARTICIPANTE1_CODIGO)}
      AND alfa.deleted_at IS NULL
      AND alfa.setor IS funcionarios.setor
      AND alfa.setor_id IS funcionarios.setor_id
  );

DELETE FROM modelos_sessao_versionamento
WHERE modelo_id IN (
  SELECT id
  FROM modelos_sessao
  WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
    AND codigo = ${e(PLANNING_MODEL_CODE)}
    AND nome = 'QA Planejamento Persistente — Sessão 1'
    AND tipo = 'RECORRENTE'
    AND descricao = 'Fixture sintética de staging para proposta V3.'
    AND duracao_estimada = 120
    AND ordem_no_treinamento = 1
    AND modelo_aeronave = 'AW139'
)
  AND empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND codigo_canonico = ${e(PLANNING_MODEL_CODE)}
  AND versao_matriz = 'QA_SIMULATOR_PLANNING';

UPDATE modelos_sessao
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND codigo = ${e(PLANNING_MODEL_CODE)}
  AND nome = 'QA Planejamento Persistente — Sessão 1'
  AND tipo = 'RECORRENTE'
  AND descricao = 'Fixture sintética de staging para proposta V3.'
  AND duracao_estimada = 120
  AND ordem_no_treinamento = 1
  AND modelo_aeronave = 'AW139'
  AND deleted_at IS NULL;

UPDATE qualificacoes_tipos
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND UPPER(codigo) = UPPER(${e(PLANNING_QUAL_CODE)})
  AND nome = 'QA Simulador AW139 — Planejamento Persistente'
  AND tipo = 'TREINAMENTO'
  AND descricao = 'Fixture sintética de staging para QA do Planejamento de Simulador V3.'
  AND observacoes = ${e(PLANNING_MARKER)}
  AND deleted_at IS NULL;

UPDATE qualificacoes_categorias
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND UPPER(codigo) = UPPER(${e(PLANNING_CATEGORY_CODE)})
  AND nome = 'QA Simulador — Planejamento Persistente'
  AND descricao = 'Categoria sintética de staging para o aceite do Planejamento de Simulador V3.'
  AND cor = '#64748b'
  AND dominio_codigo = 'OPERACOES'
  AND COALESCE(lms_integrada, 0) = 0
  AND deleted_at IS NULL;

-- Pós-condição fail-closed do rollback: nenhum artefato descartável pode ficar ativo.
CREATE TABLE IF NOT EXISTS _qa_sim_planning_rollback_guard (
  draft_count INTEGER NOT NULL CHECK (draft_count = 0),
  allocation_count INTEGER NOT NULL CHECK (allocation_count = 0),
  roster_count INTEGER NOT NULL CHECK (roster_count = 0),
  history_count INTEGER NOT NULL CHECK (history_count = 0),
  charlie_count INTEGER NOT NULL CHECK (charlie_count = 0),
  model_version_count INTEGER NOT NULL CHECK (model_version_count = 0),
  model_count INTEGER NOT NULL CHECK (model_count = 0),
  qualification_count INTEGER NOT NULL CHECK (qualification_count = 0),
  category_count INTEGER NOT NULL CHECK (category_count = 0)
);
DELETE FROM _qa_sim_planning_rollback_guard;
INSERT INTO _qa_sim_planning_rollback_guard (
  draft_count, allocation_count, roster_count, history_count, charlie_count,
  model_version_count, model_count, qualification_count, category_count
)
SELECT
  (SELECT COUNT(*) FROM treinamentos_planejados
    WHERE empresa_id=(SELECT id FROM empresas WHERE codigo=${e(EMPRESA_CODIGO)})
      AND planejamento_origem='SIMULADOR_V3_PERSISTED'
      AND planejamento_snapshot_json LIKE '%${DRAFT_MARKER}%'
      AND deleted_at IS NULL),
  (SELECT COUNT(*) FROM escala_alocacoes WHERE id IN (${allocationIds}) AND deleted_at IS NULL),
  (SELECT COUNT(*) FROM escalas_mensais
    WHERE empresa_id=(SELECT id FROM empresas WHERE codigo=${e(EMPRESA_CODIGO)})
      AND id=${e(QA_ROSTER_ID)} AND deleted_at IS NULL),
  (SELECT COUNT(*) FROM qualificacoes_historico
    WHERE empresa_id=(SELECT id FROM empresas WHERE codigo=${e(EMPRESA_CODIGO)})
      AND observacoes=${e(PLANNING_MARKER)} AND deleted_at IS NULL),
  (SELECT COUNT(*) FROM funcionarios
    WHERE empresa_id=(SELECT id FROM empresas WHERE codigo=${e(EMPRESA_CODIGO)})
      AND matricula=${e(PARTICIPANTE3_CODIGO)} AND deleted_at IS NULL),
  (SELECT COUNT(*) FROM modelos_sessao_versionamento
    WHERE empresa_id=(SELECT id FROM empresas WHERE codigo=${e(EMPRESA_CODIGO)})
      AND codigo_canonico=${e(PLANNING_MODEL_CODE)} AND versao_matriz='QA_SIMULATOR_PLANNING'),
  (SELECT COUNT(*) FROM modelos_sessao
    WHERE empresa_id=(SELECT id FROM empresas WHERE codigo=${e(EMPRESA_CODIGO)})
      AND codigo=${e(PLANNING_MODEL_CODE)} AND deleted_at IS NULL),
  (SELECT COUNT(*) FROM qualificacoes_tipos
    WHERE empresa_id=(SELECT id FROM empresas WHERE codigo=${e(EMPRESA_CODIGO)})
      AND UPPER(codigo)=UPPER(${e(PLANNING_QUAL_CODE)}) AND deleted_at IS NULL),
  (SELECT COUNT(*) FROM qualificacoes_categorias
    WHERE empresa_id=(SELECT id FROM empresas WHERE codigo=${e(EMPRESA_CODIGO)})
      AND UPPER(codigo)=UPPER(${e(PLANNING_CATEGORY_CODE)}) AND deleted_at IS NULL);
DROP TABLE _qa_sim_planning_rollback_guard;
`;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const rollback = args.has('--rollback');
  const dbName = validateD1Target(process.env.STAGING_D1_NAME || ALLOWED_D1_NAME);

  console.log(`TARGET_DB=${dbName}`);
  console.log(`MODE=${rollback ? 'rollback' : apply ? 'apply' : 'dry-run'}`);
  console.log(`FIXTURE_TENANT=${EMPRESA_CODIGO}`);

  const sql = rollback ? buildRollbackSql() : buildSeedSql();

  if (!apply) {
    console.log('DRY_RUN: nenhuma escrita realizada; SQL construído e alvo validado.');
    return;
  }
  if (process.env.CONFIRM_STAGING_SIMULATOR_PLANNING_QA_SEED !== CONFIRMATION_PHRASE) {
    throw new Error(
      `--apply requer CONFIRM_STAGING_SIMULATOR_PLANNING_QA_SEED=${CONFIRMATION_PHRASE}.`,
    );
  }

  // Use --command instead of --file for this small governed fixture. Remote
  // --file enters D1's bulk-import/reset path, which can fail with D1_RESET_DO
  // before executing otherwise valid SQL. --command executes the same bounded
  // statement batch through D1's normal query API and remains fail-closed.
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', dbName, '--remote', '--command', sql, '--json'],
    {
      cwd: join(process.cwd(), 'worker-airtrust'),
      encoding: 'utf8',
      env: process.env,
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'wrangler d1 execute falhou');
  }
  console.log(rollback ? 'SIMULATOR_PLANNING_QA_ROLLBACK_APPLIED' : 'SIMULATOR_PLANNING_QA_SEED_APPLIED');
}

try {
  main();
} catch (error) {
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
}

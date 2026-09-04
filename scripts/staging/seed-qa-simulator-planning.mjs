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
// tenant configuration row is left in its deterministic QA defaults.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ALLOWED_D1_NAME = 'airtrust-db-staging-baseline-20260701';
const BLOCKED_D1_NAMES = ['airtrust-db', 'airtrust-db-dev', 'airtrust-db-production'];
const CONFIRMATION_PHRASE = 'AIRTRUST_STAGING_SIMULATOR_PLANNING_QA_SEED';

const EMPRESA_CODIGO = 'qa_examiner_training';
const PARTICIPANTE1_CODIGO = 'QA-PARTICIPANTE-ALFA';
const PARTICIPANTE2_CODIGO = 'QA-PARTICIPANTE-BRAVO';
const PLANNING_CATEGORY_CODE = 'QA-SIM-PLN-CAT';
const PLANNING_QUAL_CODE = 'QA-SIM-PLN-AW139';
const PLANNING_MODEL_CODE = 'QA-SIM-PLN-S01';
const PLANNING_MARKER = 'QA_ONLY_SIMULATOR_PLANNING';
const DRAFT_MARKER = 'QA_SIMULATOR_PLANNING_SMOKE';
const QA_ROSTER_ID = 'QA-SIM-PLN-ROSTER';
const QA_ALLOCATION_IDS = ['QA-SIM-PLN-ALFA-FOLGA', 'QA-SIM-PLN-BRAVO-FOLGA'];

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
  ) THEN 1 ELSE 0
END;
DROP TABLE _qa_sim_planning_requires_tenant;

-- Configuração determinística somente do tenant sintético.
INSERT INTO empresas_config (
  empresa_id,
  planejamento_simulador_antecedencia_dias,
  planejamento_simulador_regra_quinzena,
  planejamento_simulador_permitir_sessao_compartilhada,
  planejamento_simulador_preferir_mesmo_treinamento,
  planejamento_simulador_preferir_mesma_sessao,
  planejamento_simulador_aprovacao_obrigatoria,
  updated_at
)
SELECT emp.id, 120, 'AMBAS', 1, 1, 1, 1, datetime('now')
FROM empresas emp
WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND emp.deleted_at IS NULL
ON CONFLICT(empresa_id) DO UPDATE SET
  planejamento_simulador_antecedencia_dias = excluded.planejamento_simulador_antecedencia_dias,
  planejamento_simulador_regra_quinzena = excluded.planejamento_simulador_regra_quinzena,
  planejamento_simulador_permitir_sessao_compartilhada = excluded.planejamento_simulador_permitir_sessao_compartilhada,
  planejamento_simulador_preferir_mesmo_treinamento = excluded.planejamento_simulador_preferir_mesmo_treinamento,
  planejamento_simulador_preferir_mesma_sessao = excluded.planejamento_simulador_preferir_mesma_sessao,
  planejamento_simulador_aprovacao_obrigatoria = excluded.planejamento_simulador_aprovacao_obrigatoria,
  updated_at = datetime('now');

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

-- Dois históricos QA com o mesmo vencimento para formar uma dupla real.
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
 AND f.matricula IN (${e(PARTICIPANTE1_CODIGO)}, ${e(PARTICIPANTE2_CODIGO)})
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
  AND observacoes = ${e(PLANNING_MARKER)};

-- Escala publicada sintética: sem ela, o planner deve e continuará falhando
-- fechado como DESCONHECIDO. Os dois participantes ficam em FOLGA no período.
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

UPDATE escalas_mensais
SET status = 'publicada', updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND mes = CAST(strftime('%m', date('now', '+90 days')) AS INTEGER)
  AND ano = CAST(strftime('%Y', date('now', '+90 days')) AS INTEGER)
  AND deleted_at IS NULL;

INSERT OR IGNORE INTO escala_alocacoes (
  id, escala_id, funcionario_id, aeronave_id, funcao,
  situacao_tipo, situacao_cor, quinzena_id, data_inicio, data_fim,
  status, observacoes, created_by, created_at, updated_at, deleted_at
)
SELECT
  CASE f.matricula
    WHEN ${e(PARTICIPANTE1_CODIGO)} THEN ${e(QA_ALLOCATION_IDS[0])}
    ELSE ${e(QA_ALLOCATION_IDS[1])}
  END,
  em.id, CAST(f.id AS TEXT), NULL, NULL, 'FOLGA', '#64748b', NULL,
  date('now'), date('now', '+120 days'), 'confirmado',
  ${e(PLANNING_MARKER)}, 'qa-simulator-planning',
  datetime('now'), datetime('now'), NULL
FROM empresas emp
JOIN funcionarios f
  ON f.empresa_id = emp.id
 AND f.matricula IN (${e(PARTICIPANTE1_CODIGO)}, ${e(PARTICIPANTE2_CODIGO)})
 AND f.deleted_at IS NULL
JOIN escalas_mensais em
  ON em.empresa_id = emp.id
 AND em.mes = CAST(strftime('%m', date('now', '+90 days')) AS INTEGER)
 AND em.ano = CAST(strftime('%Y', date('now', '+90 days')) AS INTEGER)
 AND em.status = 'publicada'
 AND em.deleted_at IS NULL
WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND emp.deleted_at IS NULL;

UPDATE escala_alocacoes
SET escala_id = (
      SELECT em.id
      FROM escalas_mensais em
      WHERE em.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
        AND em.mes = CAST(strftime('%m', date('now', '+90 days')) AS INTEGER)
        AND em.ano = CAST(strftime('%Y', date('now', '+90 days')) AS INTEGER)
        AND em.status = 'publicada'
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
      ELSE CAST((
        SELECT f.id FROM funcionarios f
        WHERE f.empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
          AND f.matricula = ${e(PARTICIPANTE2_CODIGO)}
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
  history_count INTEGER NOT NULL CHECK (history_count = 2),
  allocation_count INTEGER NOT NULL CHECK (allocation_count = 2),
  config_count INTEGER NOT NULL CHECK (config_count = 1)
);
DELETE FROM _qa_sim_planning_post_guard;
INSERT INTO _qa_sim_planning_post_guard (
  tenant_count, category_count, qualification_count, model_count,
  history_count, allocation_count, config_count
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
UPDATE treinamentos_planejados
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND planejamento_origem = 'SIMULADOR_V3_PERSISTED'
  AND planejamento_snapshot_json LIKE '%${DRAFT_MARKER}%'
  AND deleted_at IS NULL;

UPDATE escala_alocacoes
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE id IN (${allocationIds})
  AND escala_id IN (
    SELECT id FROM escalas_mensais
    WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  )
  AND deleted_at IS NULL;

UPDATE escalas_mensais
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE id = ${e(QA_ROSTER_ID)}
  AND empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND observacoes = ${e(PLANNING_MARKER)}
  AND deleted_at IS NULL;

UPDATE qualificacoes_historico
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND observacoes = ${e(PLANNING_MARKER)}
  AND deleted_at IS NULL;

UPDATE modelos_sessao
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND codigo = ${e(PLANNING_MODEL_CODE)}
  AND deleted_at IS NULL;

UPDATE qualificacoes_tipos
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND UPPER(codigo) = UPPER(${e(PLANNING_QUAL_CODE)})
  AND observacoes = ${e(PLANNING_MARKER)}
  AND deleted_at IS NULL;

UPDATE qualificacoes_categorias
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND UPPER(codigo) = UPPER(${e(PLANNING_CATEGORY_CODE)})
  AND deleted_at IS NULL;
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

  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-staging-sim-planning-'));
  const sqlFile = join(tempDir, rollback ? 'rollback.sql' : 'seed.sql');
  writeFileSync(sqlFile, sql, 'utf8');
  try {
    const result = spawnSync(
      'npx',
      ['wrangler', 'd1', 'execute', dbName, '--remote', '--file', sqlFile, '--json'],
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
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
}

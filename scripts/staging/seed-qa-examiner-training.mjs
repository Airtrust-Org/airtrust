#!/usr/bin/env node

// source_reference: synthetic, tenant-safe fixture required to exercise
// migration 0424 (EXA-V01..V04) and the examiner-training smoke (section 11 of
// docs/ops/staging-release-runbook.md) without ever touching Costa do Sol or
// any real tenant. Modeled closely on scripts/seed-staging-smoke-user.mjs
// (same D1 allowlist, same idempotent upsert-by-natural-code pattern, same
// "wrangler batches the whole file atomically" assumption).
// operational_decision: STAGING_ONLY; every INSERT is guarded by NOT EXISTS
// keyed on a natural code (never a raw numeric ID); every fixture name/code
// contains "qa" so it can never collide with or be mistaken for real data;
// no CPF/RG/telefone/e-mail real is ever written (funcionarios.email/cpf left
// NULL); the QA admin password hash is derived from an env var, never printed.
// dry_run_required: default mode is dry-run; --apply requires
// CONFIRM_STAGING_QA_SEED=AIRTRUST_STAGING_QA_SEED.
// rollback_plan_required: scripts/staging/seed-qa-examiner-training.mjs --rollback
// soft-deletes (deleted_at) only the rows whose natural codes match the
// QA_* prefixes defined below — never touches unrelated or pre-existing rows.

import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(new URL('../../worker-airtrust/package.json', import.meta.url));
const bcrypt = require('bcryptjs');

const ALLOWED_D1_NAME = 'airtrust-db-staging-baseline-20260701';
const ALLOWED_D1_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
const BLOCKED_D1_NAMES = ['airtrust-db', 'airtrust-db-dev', 'airtrust-db-production'];

const CONFIRMATION_PHRASE = 'AIRTRUST_STAGING_QA_SEED';

// Fictional fixture identities — never real people, never Costa do Sol.
const EMPRESA_CODIGO = 'qa_examiner_training';
const EMPRESA_NOME = 'AirTrust Staging Examiner QA';
const ADMIN_EMAIL_DEFAULT = 'qa-examiner-admin@staging.airtrust.invalid';
const ADMIN_NOME = 'QA Administrador Examinador';
const INSTRUTOR_CODIGO = 'QA-INSTRUTOR-EXAMINADOR';
const INSTRUTOR_NOME = 'QA Instrutor Examinador';
const PARTICIPANTE1_CODIGO = 'QA-PARTICIPANTE-ALFA';
const PARTICIPANTE1_NOME = 'QA Participante Alfa';
const PARTICIPANTE2_CODIGO = 'QA-PARTICIPANTE-BRAVO';
const PARTICIPANTE2_NOME = 'QA Participante Bravo';
const AERONAVE_CODIGO = 'QA-AC-01';
const SIMULADOR_CODIGO = 'QA-SIM-01';
const CRED_EXA_CODIGO = 'CRED-EXA';
const SETOR_CODIGO = 'QA-SETOR-EXA';
const SETOR_NOME = 'Setor QA Examinador';
const PLANNING_QUAL_CODE = 'QA-SIM-PLN-AW139';
const PLANNING_MODEL_CODE = 'QA-SIM-PLN-S01';

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function validateD1Target(name) {
  const trimmed = String(name).trim();
  if (!trimmed) throw new Error('STAGING_D1_NAME vazio — seed bloqueado.');
  if (BLOCKED_D1_NAMES.includes(trimmed.toLowerCase()) || /prod/i.test(trimmed)) {
    throw new Error(`D1 alvo "${trimmed}" está bloqueado (produção). Seed permitido apenas em "${ALLOWED_D1_NAME}".`);
  }
  if (trimmed !== ALLOWED_D1_NAME) {
    throw new Error(`D1 alvo "${trimmed}" não é o staging esperado. Permitido apenas "${ALLOWED_D1_NAME}".`);
  }
  return trimmed;
}

function buildSeedSql({ adminEmail, adminPasswordHash }) {
  const e = sqlString;
  return `
-- EMPRESA QA (fixture sintética, nunca o tenant real de produção) — upsert idempotente por codigo.
INSERT INTO empresas (nome, razao_social, ativo, created_at, updated_at, deleted_at, codigo, plano, max_funcionarios, max_storage_mb)
SELECT ${e(EMPRESA_NOME)}, ${e(EMPRESA_NOME)}, 1, datetime('now'), datetime('now'), NULL, ${e(EMPRESA_CODIGO)}, 'basic', 25, 256
WHERE NOT EXISTS (SELECT 1 FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)} AND deleted_at IS NULL);

UPDATE empresas SET nome = ${e(EMPRESA_NOME)}, ativo = 1, deleted_at = NULL, updated_at = datetime('now')
WHERE codigo = ${e(EMPRESA_CODIGO)};

-- SETOR QA sintético para satisfazer o trigger trg_funcionarios_setor_required_insert.
INSERT INTO setores (codigo, nome, descricao, responsavel, ativo, created_at, updated_at, deleted_at, empresa_id)
SELECT ${e(SETOR_CODIGO)}, ${e(SETOR_NOME)}, 'Setor sintético para fixture QA de staging.', ${e(ADMIN_NOME)}, 1, datetime('now'), datetime('now'), NULL, emp.id
FROM empresas emp
WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND NOT EXISTS (
    SELECT 1
    FROM setores s
    WHERE s.codigo = ${e(SETOR_CODIGO)}
      AND s.empresa_id = emp.id
      AND s.deleted_at IS NULL
  );

UPDATE setores
SET nome = ${e(SETOR_NOME)}, descricao = 'Setor sintético para fixture QA de staging.', responsavel = ${e(ADMIN_NOME)}, ativo = 1, deleted_at = NULL, updated_at = datetime('now')
WHERE codigo = ${e(SETOR_CODIGO)}
  AND empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)});

-- ADMIN QA
INSERT INTO usuarios (email, password_hash, nome, perfil, funcionario_id, deleted_at, created_at, updated_at, active)
SELECT ${e(adminEmail)}, ${e(adminPasswordHash)}, ${e(ADMIN_NOME)}, 'ADMINISTRADOR', NULL, NULL, datetime('now'), datetime('now'), 1
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = ${e(adminEmail)});

UPDATE usuarios SET password_hash = ${e(adminPasswordHash)}, nome = ${e(ADMIN_NOME)}, perfil = 'ADMINISTRADOR', deleted_at = NULL, active = 1, updated_at = datetime('now')
WHERE email = ${e(adminEmail)};

INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, created_at)
SELECT u.id, emp.id, 'admin', 1, datetime('now')
FROM usuarios u JOIN empresas emp ON emp.codigo = ${e(EMPRESA_CODIGO)}
WHERE u.email = ${e(adminEmail)}
  AND NOT EXISTS (SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id = u.id AND ue.empresa_id = emp.id);

-- INSTRUTOR QA (funcionário, sem CPF/e-mail real)
INSERT INTO funcionarios (nome, matricula, cargo, setor, setor_id, status, is_instrutor, is_examinador, ativo, empresa_id, created_at, updated_at, deleted_at)
SELECT ${e(INSTRUTOR_NOME)}, ${e(INSTRUTOR_CODIGO)}, 'Instrutor Examinador QA', ${e(SETOR_NOME)}, s.id, 'ATIVO', 1, 1, 1, emp.id, datetime('now'), datetime('now'), NULL
FROM empresas emp
JOIN setores s ON s.empresa_id = emp.id AND s.codigo = ${e(SETOR_CODIGO)} AND s.deleted_at IS NULL
WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND NOT EXISTS (SELECT 1 FROM funcionarios WHERE matricula = ${e(INSTRUTOR_CODIGO)} AND deleted_at IS NULL);

UPDATE funcionarios
SET nome = ${e(INSTRUTOR_NOME)}, cargo = 'Instrutor Examinador QA', setor = ${e(SETOR_NOME)}, setor_id = (
  SELECT s.id FROM setores s
  JOIN empresas emp ON emp.id = s.empresa_id
  WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
    AND s.codigo = ${e(SETOR_CODIGO)}
    AND s.deleted_at IS NULL
), status = 'ATIVO', is_instrutor = 1, is_examinador = 1, ativo = 1, deleted_at = NULL, updated_at = datetime('now')
WHERE matricula = ${e(INSTRUTOR_CODIGO)};

-- PARTICIPANTE QA 1
INSERT INTO funcionarios (nome, matricula, cargo, setor, setor_id, status, is_instrutor, is_examinador, ativo, empresa_id, created_at, updated_at, deleted_at)
SELECT ${e(PARTICIPANTE1_NOME)}, ${e(PARTICIPANTE1_CODIGO)}, 'Participante QA', ${e(SETOR_NOME)}, s.id, 'ATIVO', 0, 0, 1, emp.id, datetime('now'), datetime('now'), NULL
FROM empresas emp
JOIN setores s ON s.empresa_id = emp.id AND s.codigo = ${e(SETOR_CODIGO)} AND s.deleted_at IS NULL
WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND NOT EXISTS (SELECT 1 FROM funcionarios WHERE matricula = ${e(PARTICIPANTE1_CODIGO)} AND deleted_at IS NULL);

UPDATE funcionarios
SET nome = ${e(PARTICIPANTE1_NOME)}, cargo = 'Participante QA', setor = ${e(SETOR_NOME)}, setor_id = (
  SELECT s.id FROM setores s
  JOIN empresas emp ON emp.id = s.empresa_id
  WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
    AND s.codigo = ${e(SETOR_CODIGO)}
    AND s.deleted_at IS NULL
), status = 'ATIVO', is_instrutor = 0, is_examinador = 0, ativo = 1, deleted_at = NULL, updated_at = datetime('now')
WHERE matricula = ${e(PARTICIPANTE1_CODIGO)};

-- PARTICIPANTE QA 2
INSERT INTO funcionarios (nome, matricula, cargo, setor, setor_id, status, is_instrutor, is_examinador, ativo, empresa_id, created_at, updated_at, deleted_at)
SELECT ${e(PARTICIPANTE2_NOME)}, ${e(PARTICIPANTE2_CODIGO)}, 'Participante QA', ${e(SETOR_NOME)}, s.id, 'ATIVO', 0, 0, 1, emp.id, datetime('now'), datetime('now'), NULL
FROM empresas emp
JOIN setores s ON s.empresa_id = emp.id AND s.codigo = ${e(SETOR_CODIGO)} AND s.deleted_at IS NULL
WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND NOT EXISTS (SELECT 1 FROM funcionarios WHERE matricula = ${e(PARTICIPANTE2_CODIGO)} AND deleted_at IS NULL);

UPDATE funcionarios
SET nome = ${e(PARTICIPANTE2_NOME)}, cargo = 'Participante QA', setor = ${e(SETOR_NOME)}, setor_id = (
  SELECT s.id FROM setores s
  JOIN empresas emp ON emp.id = s.empresa_id
  WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
    AND s.codigo = ${e(SETOR_CODIGO)}
    AND s.deleted_at IS NULL
), status = 'ATIVO', is_instrutor = 0, is_examinador = 0, ativo = 1, deleted_at = NULL, updated_at = datetime('now')
WHERE matricula = ${e(PARTICIPANTE2_CODIGO)};

-- AERONAVE/EQUIPAMENTO QA
INSERT INTO aeronaves (codigo, modelo, fabricante, status, empresa_id, created_at, updated_at, deleted_at)
SELECT ${e(AERONAVE_CODIGO)}, 'QA Modelo Fictício', 'QA Fabricante Fictício', 'ATIVO', emp.id, datetime('now'), datetime('now'), NULL
FROM empresas emp WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND NOT EXISTS (SELECT 1 FROM aeronaves WHERE codigo = ${e(AERONAVE_CODIGO)} AND deleted_at IS NULL);

-- SIMULADOR QA
INSERT INTO simuladores (nome, modelo, tipo, fabricante, status, created_at, updated_at, deleted_at)
SELECT ${e(SIMULADOR_CODIGO)}, 'QA Modelo Fictício', 'FFS', 'QA Fabricante Fictício', 'ATIVO', datetime('now'), datetime('now'), NULL
WHERE NOT EXISTS (SELECT 1 FROM simuladores WHERE nome = ${e(SIMULADOR_CODIGO)} AND deleted_at IS NULL);

-- CRED-EXA sintético — âncora de tenant exigida pela migration 0424 (Seção 0 do guard).
-- Este é o ÚNICO propósito desta linha: sem ela, 0424 falha explicitamente por design.
INSERT INTO modelos_sessao (codigo, nome, tipo, descricao, ativo, empresa_id, tipo_aeronave, created_at, updated_at)
SELECT ${e(CRED_EXA_CODIGO)}, 'CREDENCIAMENTO DE EXAMINADOR (QA SINTÉTICO)', 'RECORRENTE', 'Âncora de tenant sintética para QA de staging — nunca dado real.', 1, emp.id, NULL, datetime('now'), datetime('now')
FROM empresas emp WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND NOT EXISTS (SELECT 1 FROM modelos_sessao ms JOIN empresas e2 ON e2.id = ms.empresa_id WHERE ms.codigo = ${e(CRED_EXA_CODIGO)} AND e2.codigo = ${e(EMPRESA_CODIGO)} AND ms.deleted_at IS NULL);


-- Remove da listagem somente drafts de smoke anteriores do próprio tenant QA.
-- É soft-delete, escopado por empresa + origem + marcador do snapshot.
UPDATE treinamentos_planejados
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND planejamento_origem = 'SIMULADOR_V3_PERSISTED'
  AND planejamento_snapshot_json LIKE '%QA_SIMULATOR_PLANNING_SMOKE%'
  AND deleted_at IS NULL;

-- PLANEJAMENTO DE SIMULADOR QA — tipo/modelo/histórico estritamente sintéticos.
-- Necessários para gerar uma proposta V3 real no tenant QA e validar a
-- persistência #275 sem tocar dados Costa do Sol.
INSERT INTO qualificacoes_tipos (
  tipo, codigo, nome, descricao, categoria, carga_horaria, validade,
  vencimento_fim_mes, observacoes, ativo, empresa_id, created_at, updated_at, deleted_at
)
SELECT
  'TREINAMENTO', ${e(PLANNING_QUAL_CODE)}, 'QA Simulador AW139 — Planejamento Persistente',
  'Fixture sintética de staging para QA do Planejamento de Simulador V3.',
  'TREINAMENTO', 2, 12, 0, 'QA_ONLY_SIMULATOR_PLANNING', 1, emp.id,
  datetime('now'), datetime('now'), NULL
FROM empresas emp
WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND NOT EXISTS (
    SELECT 1 FROM qualificacoes_tipos qt
    WHERE qt.empresa_id = emp.id
      AND UPPER(qt.codigo) = UPPER(${e(PLANNING_QUAL_CODE)})
      AND qt.deleted_at IS NULL
  );

UPDATE qualificacoes_tipos
SET nome = 'QA Simulador AW139 — Planejamento Persistente',
    tipo = 'TREINAMENTO',
    descricao = 'Fixture sintética de staging para QA do Planejamento de Simulador V3.',
    categoria = 'TREINAMENTO',
    carga_horaria = 2,
    validade = 12,
    ativo = 1,
    deleted_at = NULL,
    updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND UPPER(codigo) = UPPER(${e(PLANNING_QUAL_CODE)});

INSERT INTO modelos_sessao (
  codigo, nome, tipo, descricao, duracao_estimada, ordem_no_treinamento,
  ativo, empresa_id, modelo_aeronave, qualificacao_tipo_id, created_at, updated_at, deleted_at
)
SELECT
  ${e(PLANNING_MODEL_CODE)}, 'QA Planejamento Persistente — Sessão 1',
  'RECORRENTE', 'Fixture sintética de staging para proposta V3.', 120, 1,
  1, emp.id, 'AW139', qt.id, datetime('now'), datetime('now'), NULL
FROM empresas emp
JOIN qualificacoes_tipos qt
  ON qt.empresa_id = emp.id
 AND UPPER(qt.codigo) = UPPER(${e(PLANNING_QUAL_CODE)})
 AND qt.deleted_at IS NULL
WHERE emp.codigo = ${e(EMPRESA_CODIGO)}
  AND NOT EXISTS (
    SELECT 1 FROM modelos_sessao ms
    WHERE ms.empresa_id = emp.id
      AND ms.codigo = ${e(PLANNING_MODEL_CODE)}
      AND ms.deleted_at IS NULL
  );

UPDATE modelos_sessao
SET nome = 'QA Planejamento Persistente — Sessão 1',
    tipo = 'RECORRENTE',
    descricao = 'Fixture sintética de staging para proposta V3.',
    duracao_estimada = 120,
    ordem_no_treinamento = 1,
    ativo = 1,
    modelo_aeronave = 'AW139',
    qualificacao_tipo_id = (
      SELECT qt.id FROM qualificacoes_tipos qt
      WHERE qt.empresa_id = modelos_sessao.empresa_id
        AND UPPER(qt.codigo) = UPPER(${e(PLANNING_QUAL_CODE)})
        AND qt.deleted_at IS NULL
      LIMIT 1
    ),
    deleted_at = NULL,
    updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND codigo = ${e(PLANNING_MODEL_CODE)};

INSERT INTO qualificacoes_historico (
  funcionario_id, qualificacao_id, qualificacao_codigo,
  data_conclusao, data_vencimento, validade_meses,
  codigo, categoria, observacoes, carga_horaria, status,
  empresa_id, created_at, updated_at, deleted_at
)
SELECT
  f.id, qt.id, qt.codigo,
  date('now', '-275 days'), date('now', '+90 days'), 12,
  'QA-SIM-PLN-' || f.matricula, 'TREINAMENTO',
  'QA_ONLY_SIMULATOR_PLANNING', 2, 'VALIDA',
  emp.id, datetime('now'), datetime('now'), NULL
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
  AND NOT EXISTS (
    SELECT 1 FROM qualificacoes_historico qh
    WHERE qh.empresa_id = emp.id
      AND qh.funcionario_id = f.id
      AND qh.qualificacao_id = qt.id
      AND qh.observacoes = 'QA_ONLY_SIMULATOR_PLANNING'
      AND qh.deleted_at IS NULL
  );

UPDATE qualificacoes_historico
SET data_conclusao = date('now', '-275 days'),
    data_vencimento = date('now', '+90 days'),
    validade_meses = 12,
    qualificacao_codigo = ${e(PLANNING_QUAL_CODE)},
    categoria = 'TREINAMENTO',
    observacoes = 'QA_ONLY_SIMULATOR_PLANNING',
    carga_horaria = 2,
    status = 'VALIDA',
    deleted_at = NULL,
    updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND observacoes = 'QA_ONLY_SIMULATOR_PLANNING';
`;
}

function buildRollbackSql() {
  const e = sqlString;
  return `
UPDATE funcionarios SET deleted_at = datetime('now')
WHERE matricula IN (${e(INSTRUTOR_CODIGO)}, ${e(PARTICIPANTE1_CODIGO)}, ${e(PARTICIPANTE2_CODIGO)}) AND deleted_at IS NULL;

UPDATE aeronaves SET deleted_at = datetime('now') WHERE codigo = ${e(AERONAVE_CODIGO)} AND deleted_at IS NULL;

UPDATE simuladores SET deleted_at = datetime('now') WHERE nome = ${e(SIMULADOR_CODIGO)} AND deleted_at IS NULL;

UPDATE qualificacoes_historico
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = ${e(EMPRESA_CODIGO)})
  AND observacoes = 'QA_ONLY_SIMULATOR_PLANNING'
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
  AND deleted_at IS NULL;

-- CRED-EXA e a empresa QA NÃO são removidos automaticamente: 0424 pode já ter
-- criado EXA-V01..V04 apontando para essa empresa. Remover manualmente apenas
-- após confirmar (via preflight) que nenhuma ficha real depende dessas linhas.
`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const rollback = args.has('--rollback');

  const dbName = validateD1Target(process.env.STAGING_D1_NAME || ALLOWED_D1_NAME);
  const adminEmail = String(process.env.QA_EXAMINER_ADMIN_EMAIL || ADMIN_EMAIL_DEFAULT).trim().toLowerCase();
  const adminPassword = String(process.env.QA_EXAMINER_ADMIN_PASSWORD || '');

  console.log(`TARGET_DB=${dbName}`);
  console.log(`MODE=${rollback ? 'rollback' : apply ? 'apply' : 'dry-run'}`);
  console.log(`FIXTURE_EMPRESA=${EMPRESA_CODIGO} (${EMPRESA_NOME})`);

  let sql;
  if (rollback) {
    sql = buildRollbackSql();
  } else {
    if (apply && !adminPassword) {
      throw new Error('QA_EXAMINER_ADMIN_PASSWORD ausente — obrigatório para --apply.');
    }
    const passwordHash = adminPassword ? bcrypt.hashSync(adminPassword, bcrypt.genSaltSync(10)) : '<dry-run-placeholder>';
    sql = buildSeedSql({ adminEmail, adminPasswordHash: passwordHash });
  }

  if (!apply) {
    console.log('DRY_RUN: nenhuma escrita realizada. SQL validado, pronto para --apply.');
    return;
  }

  if (process.env.CONFIRM_STAGING_QA_SEED !== CONFIRMATION_PHRASE) {
    throw new Error(`--apply requer CONFIRM_STAGING_QA_SEED=${CONFIRMATION_PHRASE}.`);
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-staging-qa-seed-'));
  const sqlFile = join(tempDir, 'seed.sql');
  writeFileSync(sqlFile, sql, 'utf8');

  try {
    const result = spawnSync(
      'npx',
      ['wrangler', 'd1', 'execute', dbName, '--remote', '--file', sqlFile, '--json'],
      { cwd: join(process.cwd(), 'worker-airtrust'), encoding: 'utf8' },
    );
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'wrangler d1 execute falhou');
    }
    console.log(rollback ? 'ROLLBACK_APPLIED' : 'SEED_APPLIED');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exitCode = 1;
});

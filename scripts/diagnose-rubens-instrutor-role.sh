#!/usr/bin/env bash
set -euo pipefail

EMAIL="${1:-rubens.silva@voecostadosol.com.br}"
DB_NAME="${DB_NAME:-airtrust-db}"
ENV_NAME="${ENV_NAME:-production}"
REMOTE_FLAG="${REMOTE_FLAG:---remote}"

cd "$(dirname "$0")/../worker-airtrust"

run_sql() {
  local title="$1"
  local sql="$2"
  echo
  echo "=== ${title} ==="
  npx wrangler d1 execute "$DB_NAME" --env "$ENV_NAME" "$REMOTE_FLAG" --command "$sql"
}

echo "Diagnóstico read-only de perfil/papel Rubens"
echo "- email: $EMAIL"
echo "- db: $DB_NAME"
echo "- env: $ENV_NAME"
echo "- remote_flag: $REMOTE_FLAG"
echo "- timestamp_utc: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

run_sql "Usuário e vínculos por empresa" "
SELECT
  u.id AS usuario_id,
  u.email,
  u.nome,
  u.perfil AS perfil_usuarios,
  u.funcionario_id,
  ue.empresa_id,
  e.nome AS empresa_nome,
  e.codigo AS empresa_codigo,
  ue.role AS role_usuarios_empresas,
  ue.is_primary
FROM usuarios u
LEFT JOIN usuarios_empresas ue ON ue.usuario_id = u.id
LEFT JOIN empresas e ON e.id = ue.empresa_id
WHERE lower(u.email) = lower('${EMAIL}')
  AND u.deleted_at IS NULL
ORDER BY
  CASE WHEN ue.is_primary = 1 THEN 0 ELSE 1 END,
  ue.empresa_id ASC;
"

run_sql "Simulação do papel no auth atual vs vínculo ativo" "
WITH rubens AS (
  SELECT u.id, u.email, u.nome, u.perfil, u.funcionario_id
  FROM usuarios u
  WHERE lower(u.email) = lower('${EMAIL}')
    AND u.deleted_at IS NULL
  LIMIT 1
), vinculo_ativo AS (
  SELECT ue.usuario_id, ue.empresa_id, ue.role, ue.is_primary
  FROM usuarios_empresas ue
  INNER JOIN empresas e ON e.id = ue.empresa_id
  INNER JOIN rubens r ON r.id = ue.usuario_id
  WHERE e.deleted_at IS NULL
    AND e.ativo = 1
  ORDER BY CASE WHEN ue.is_primary = 1 THEN 0 ELSE 1 END, ue.empresa_id ASC
  LIMIT 1
)
SELECT
  r.id AS usuario_id,
  r.email,
  r.perfil AS role_auth_atual_baseado_em_usuarios_perfil,
  v.empresa_id AS empresa_ativa,
  v.role AS role_vinculo_ativo,
  v.is_primary
FROM rubens r
LEFT JOIN vinculo_ativo v ON v.usuario_id = r.id;
"

run_sql "Relação com funcionário e empresa" "
WITH rubens AS (
  SELECT u.id AS usuario_id, u.email, u.nome, u.perfil, u.funcionario_id
  FROM usuarios u
  WHERE lower(u.email) = lower('${EMAIL}')
    AND u.deleted_at IS NULL
  LIMIT 1
), empresa_ativa AS (
  SELECT ue.usuario_id, ue.empresa_id
  FROM usuarios_empresas ue
  INNER JOIN empresas e ON e.id = ue.empresa_id
  INNER JOIN rubens r ON r.usuario_id = ue.usuario_id
  WHERE e.deleted_at IS NULL
    AND e.ativo = 1
  ORDER BY CASE WHEN ue.is_primary = 1 THEN 0 ELSE 1 END, ue.empresa_id ASC
  LIMIT 1
)
SELECT
  r.usuario_id,
  r.email,
  r.nome,
  r.perfil,
  r.funcionario_id AS tripulante_id,
  f.nome AS funcionario_nome,
  f.empresa_id AS funcionario_empresa_id,
  ea.empresa_id AS empresa_ativa_id
FROM rubens r
LEFT JOIN funcionarios f ON f.id = r.funcionario_id
LEFT JOIN empresa_ativa ea ON ea.usuario_id = r.usuario_id;
"

run_sql "Contagem de fichas (instrutor vs aluno) no tenant ativo" "
WITH rubens AS (
  SELECT u.id AS usuario_id, u.funcionario_id
  FROM usuarios u
  WHERE lower(u.email) = lower('${EMAIL}')
    AND u.deleted_at IS NULL
  LIMIT 1
), empresa_ativa AS (
  SELECT ue.usuario_id, ue.empresa_id
  FROM usuarios_empresas ue
  INNER JOIN empresas e ON e.id = ue.empresa_id
  INNER JOIN rubens r ON r.usuario_id = ue.usuario_id
  WHERE e.deleted_at IS NULL
    AND e.ativo = 1
  ORDER BY CASE WHEN ue.is_primary = 1 THEN 0 ELSE 1 END, ue.empresa_id ASC
  LIMIT 1
)
SELECT
  r.usuario_id,
  r.funcionario_id AS tripulante_id,
  ea.empresa_id,
  (
    SELECT COUNT(*)
    FROM fichas_sessao fs
    INNER JOIN funcionarios aluno ON aluno.id = fs.colaborador_id_aluno
    WHERE fs.deleted_at IS NULL
      AND aluno.deleted_at IS NULL
      AND aluno.empresa_id = ea.empresa_id
      AND fs.instrutor_id = r.funcionario_id
  ) AS fichas_como_instrutor,
  (
    SELECT COUNT(*)
    FROM fichas_sessao fs
    INNER JOIN funcionarios aluno ON aluno.id = fs.colaborador_id_aluno
    WHERE fs.deleted_at IS NULL
      AND aluno.deleted_at IS NULL
      AND aluno.empresa_id = ea.empresa_id
      AND fs.colaborador_id_aluno = r.funcionario_id
  ) AS fichas_como_aluno
FROM rubens r
LEFT JOIN empresa_ativa ea ON ea.usuario_id = r.usuario_id;
"

run_sql "Amostra de fichas onde Rubens é instrutor" "
WITH rubens AS (
  SELECT u.id AS usuario_id, u.funcionario_id
  FROM usuarios u
  WHERE lower(u.email) = lower('${EMAIL}')
    AND u.deleted_at IS NULL
  LIMIT 1
), empresa_ativa AS (
  SELECT ue.usuario_id, ue.empresa_id
  FROM usuarios_empresas ue
  INNER JOIN empresas e ON e.id = ue.empresa_id
  INNER JOIN rubens r ON r.usuario_id = ue.usuario_id
  WHERE e.deleted_at IS NULL
    AND e.ativo = 1
  ORDER BY CASE WHEN ue.is_primary = 1 THEN 0 ELSE 1 END, ue.empresa_id ASC
  LIMIT 1
)
SELECT
  fs.id,
  COALESCE(sa.data, fs.data_sessao) AS data_referencia,
  fs.status,
  fs.tipo_sessao,
  aluno.nome AS aluno_nome,
  instrutor.nome AS instrutor_nome
FROM fichas_sessao fs
LEFT JOIN simulador_agendamentos sa ON sa.id = fs.agendamento_slot_id
LEFT JOIN funcionarios aluno ON aluno.id = fs.colaborador_id_aluno
LEFT JOIN funcionarios instrutor ON instrutor.id = fs.instrutor_id
INNER JOIN rubens r ON 1 = 1
INNER JOIN empresa_ativa ea ON ea.usuario_id = r.usuario_id
WHERE fs.deleted_at IS NULL
  AND aluno.deleted_at IS NULL
  AND aluno.empresa_id = ea.empresa_id
  AND fs.instrutor_id = r.funcionario_id
ORDER BY fs.created_at DESC
LIMIT 10;
"

echo
echo "Diagnóstico concluído (read-only)."

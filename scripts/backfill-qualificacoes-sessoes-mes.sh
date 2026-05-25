#!/usr/bin/env bash
set -euo pipefail

MONTH=""
MODE="dry-run"
DB_NAME="airtrust-db"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --month)
      MONTH="${2:-}"
      shift 2
      ;;
    --dry-run)
      MODE="dry-run"
      shift
      ;;
    --apply)
      MODE="apply"
      shift
      ;;
    --db)
      DB_NAME="${2:-airtrust-db}"
      shift 2
      ;;
    *)
      echo "Parâmetro inválido: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$MONTH" ]]; then
  echo "Uso: $0 --month YYYY-MM [--dry-run|--apply] [--db airtrust-db]" >&2
  exit 1
fi

if ! [[ "$MONTH" =~ ^[0-9]{4}-[0-9]{2}$ ]]; then
  echo "Formato inválido para --month. Use YYYY-MM." >&2
  exit 1
fi

DT_INI="${MONTH}-01"
DT_FIM=$(date -j -v+1m -f "%Y-%m" "$MONTH" "+%Y-%m-01" 2>/dev/null || python3 - <<PY
from datetime import datetime
m = datetime.strptime("$MONTH", "%Y-%m")
if m.month == 12:
    print(f"{m.year+1}-01-01")
else:
    print(f"{m.year}-{m.month+1:02d}-01")
PY
)

read -r -d '' CTE_BASE <<SQL || true
WITH params AS (SELECT '$DT_INI' dt_ini, '$DT_FIM' dt_fim),
sessoes_mes AS (
  SELECT sa.id sessao_id, sa.data, sa.tipo_sessao, sa.template_id, sa.empresa_id,
         CASE
           WHEN UPPER(REPLACE(REPLACE(COALESCE(s.aeronave_codigo,s.codigo_aeronave,s.tipo,s.modelo,''),'-',''),' ','')) LIKE '%SK76%'
             OR UPPER(REPLACE(REPLACE(COALESCE(s.aeronave_codigo,s.codigo_aeronave,s.tipo,s.modelo,''),'-',''),' ','')) LIKE '%S76%'
             OR UPPER(REPLACE(REPLACE(COALESCE(s.aeronave_codigo,s.codigo_aeronave,s.tipo,s.modelo,''),'-',''),' ',''))='76' THEN 'SK76'
           WHEN UPPER(COALESCE(s.aeronave_codigo,s.codigo_aeronave,s.tipo,s.modelo,'')) LIKE '%AW139%' THEN 'AW139'
           ELSE UPPER(TRIM(COALESCE(s.aeronave_codigo,s.codigo_aeronave,s.tipo,s.modelo,''))) END AS modelo_norm
  FROM simulador_agendamentos sa
  LEFT JOIN simuladores s ON s.id=sa.simulador_id AND s.deleted_at IS NULL
  JOIN params p ON sa.data>=p.dt_ini AND sa.data<p.dt_fim
  WHERE sa.deleted_at IS NULL
),
modelo AS (
  SELECT sm.*,
         COALESCE(sm.template_id,
           (SELECT ms.id FROM modelos_sessao ms INNER JOIN tipos_sessao ts ON ts.id=ms.tipo_sessao_id
             WHERE ts.codigo=sm.tipo_sessao AND UPPER(COALESCE(ms.modelo_aeronave,''))=sm.modelo_norm
               AND ms.deleted_at IS NULL AND ms.gera_qualificacao=1 ORDER BY ms.id DESC LIMIT 1),
           (SELECT ms.id FROM modelos_sessao ms INNER JOIN tipos_sessao ts ON ts.id=ms.tipo_sessao_id
             WHERE ts.codigo=sm.tipo_sessao AND UPPER(COALESCE(ms.modelo_aeronave,''))=sm.modelo_norm
               AND ms.deleted_at IS NULL ORDER BY ms.id DESC LIMIT 1)
         ) AS modelo_id_resolvido
  FROM sessoes_mes sm
),
mx AS (
  SELECT m.*, ms.gera_qualificacao, ms.qualificacao_tipo_id, ms.duracao_estimada,
         qt.codigo qual_codigo, qt.categoria qual_categoria, qt.validade qual_validade
  FROM modelo m
  LEFT JOIN modelos_sessao ms ON ms.id=m.modelo_id_resolvido AND ms.deleted_at IS NULL
  LEFT JOIN qualificacoes_tipos qt ON qt.id=ms.qualificacao_tipo_id AND qt.deleted_at IS NULL
),
participantes AS (
  SELECT DISTINCT sp.sessao_id, sp.funcionario_id FROM sessoes_participantes sp INNER JOIN mx ON mx.sessao_id=sp.sessao_id WHERE sp.deleted_at IS NULL
  UNION
  SELECT DISTINCT fs.agendamento_slot_id, fs.colaborador_id_aluno FROM fichas_sessao fs INNER JOIN mx ON mx.sessao_id=fs.agendamento_slot_id
  WHERE fs.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM sessoes_participantes sp WHERE sp.sessao_id=fs.agendamento_slot_id AND sp.deleted_at IS NULL)
),
candidatas AS (
  SELECT mx.sessao_id,mx.data,p.funcionario_id,mx.qualificacao_tipo_id,mx.qual_codigo,mx.qual_categoria,mx.qual_validade,mx.duracao_estimada,
         CASE
           WHEN UPPER(COALESCE(mx.tipo_sessao,''))='INI' THEN 'INICIAL'
           WHEN UPPER(COALESCE(mx.tipo_sessao,''))='PER' THEN 'RECORRENTE'
           WHEN UPPER(COALESCE(mx.tipo_sessao,''))='SEM' THEN 'SEMESTRAL'
           ELSE mx.tipo_sessao
         END tipo_treinamento,
         COALESCE(mx.empresa_id,1) empresa_id
  FROM mx
  INNER JOIN participantes p ON p.sessao_id=mx.sessao_id
  WHERE COALESCE(mx.gera_qualificacao,0)=1
    AND mx.qualificacao_tipo_id IS NOT NULL
    AND mx.qual_codigo IS NOT NULL
),
faltantes AS (
  SELECT c.*
  FROM candidatas c
  WHERE NOT EXISTS (
    SELECT 1 FROM qualificacoes_historico qh
    WHERE qh.sessao_id=c.sessao_id
      AND qh.funcionario_id=c.funcionario_id
      AND qh.deleted_at IS NULL
      AND COALESCE(qh.status,'')<>'CANCELADA'
  )
  AND NOT EXISTS (
    SELECT 1 FROM qualificacoes_historico qh
    WHERE qh.funcionario_id=c.funcionario_id
      AND qh.qualificacao_codigo=c.qual_codigo
      AND qh.data_conclusao=c.data
      AND qh.deleted_at IS NULL
  )
),
bloqueadas_passado AS (
  SELECT *
  FROM faltantes
  WHERE date(data) < date('now')
),
faltantes_apply AS (
  SELECT *
  FROM faltantes
  WHERE date(data) >= date('now')
)
SQL

DRY_SQL="$CTE_BASE
SELECT sessao_id,data,funcionario_id,qualificacao_tipo_id,qual_codigo,tipo_treinamento,empresa_id,'CRIAR_PLANEJADA' AS acao
FROM faltantes_apply
UNION ALL
SELECT sessao_id,data,funcionario_id,qualificacao_tipo_id,qual_codigo,tipo_treinamento,empresa_id,'PAST_DATE_NOT_PLANEJADA' AS acao
FROM bloqueadas_passado
ORDER BY data,sessao_id,funcionario_id;"

COUNT_SQL="$CTE_BASE
SELECT
  (SELECT COUNT(*) FROM faltantes_apply) AS total_faltantes_apply,
  (SELECT COUNT(*) FROM bloqueadas_passado) AS total_bloqueadas_data_passada;"

echo "[backfill] month=$MONTH mode=$MODE db=$DB_NAME"

echo "[backfill] total faltantes"
npx wrangler d1 execute "$DB_NAME" --remote --command "$COUNT_SQL" --json

echo "[backfill] preview"
npx wrangler d1 execute "$DB_NAME" --remote --command "$DRY_SQL" --json

if [[ "$MODE" == "apply" ]]; then
  APPLY_SQL="$CTE_BASE
INSERT INTO qualificacoes_historico (
  funcionario_id, qualificacao_id, qualificacao_codigo, categoria,
  data_conclusao, validade_meses, status, renovada,
  carga_horaria, tipo_treinamento, empresa_id, sessao_id,
  created_at, updated_at
)
SELECT
  funcionario_id, qualificacao_tipo_id, qual_codigo, qual_categoria,
  data, qual_validade, 'PLANEJADA', 0,
  duracao_estimada, tipo_treinamento, empresa_id, sessao_id,
  datetime('now'), datetime('now')
FROM faltantes_apply;"

  echo "[backfill] APPLY iniciado"
  npx wrangler d1 execute "$DB_NAME" --remote --command "$APPLY_SQL" --json
fi

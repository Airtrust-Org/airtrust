#!/usr/bin/env bash
set -euo pipefail

# enrich_qualificacoes_historico_from_backup.sh
# Uso: ./worker-airtrust/scripts/enrich_qualificacoes_historico_from_backup.sh backup_pre_0068_20251121_232020.sql > enrichment.sql
# Gera SQL para enriquecer dados da tabela qualificacoes_historico com novas colunas
# Lógica:
#  - Detecta linhas INSERT antigas
#  - Se 'validade' for número -> calcula data_vencimento = created_at + meses
#  - data_conclusao = created_at quando ausente
#  - Preenche validade_meses
#  - Mantém numero_certificado (se existir)
#  - Produz UPDATE por id apenas se enriquecer algo

BACKUP_FILE=${1:-"backup_pre_0068_20251121_232020.sql"}
if [ ! -f "$BACKUP_FILE" ]; then
  echo "-- Arquivo de backup não encontrado: $BACKUP_FILE" >&2
  exit 1
fi

echo "-- Início enriquecimento baseado em $BACKUP_FILE"
echo "BEGIN TRANSACTION;"

# Extrai inserts de qualificacoes_historico
grep -E '^INSERT INTO "qualificacoes_historico"' "$BACKUP_FILE" | while read -r line; do
  # Formato: INSERT INTO "qualificacoes_historico" VALUES(13,9,NULL,NULL,NULL,'TREINAMENTO','12',NULL,NULL,NULL,NULL,'2025-10-22 16:47:40','2025-11-11 20:20:59',NULL);
  # Campos (posição):
  # 1:id 2:funcionario_id 3:qualificacao_id 4:tipo_codigo 5:codigo 6:categoria 7:validade 8:numero_certificado 9:orgao_emissor 10:observacoes 11:arquivo_url 12:created_at 13:updated_at 14:deleted_at
  raw=${line#*VALUES(}
  raw=${raw%);}
  IFS=',' read -r id funcionario_id qualificacao_id tipo_codigo codigo categoria validade numero_certificado orgao_emissor observacoes arquivo_url created_at updated_at deleted_at <<<"$raw"
  # Normaliza aspas simples -> remove envoltório
  validade_clean=$(echo "$validade" | sed "s/^'//; s/'$//")
  created_clean=$(echo "$created_at" | sed "s/^'//; s/'$//")

  data_vencimento="NULL"
  validade_meses="NULL"
  if [[ $validade_clean =~ ^[0-9]+$ ]] && (( validade_clean > 0 && validade_clean <= 60 )); then
    validade_meses=$validade_clean
    # Usa sqlite date função simulada: date(created_at,'+X months') — aqui geramos literal
    # converter created_at para apenas data
    base_date=${created_clean%% *}
    data_vencimento_calc=$(date -u -j -f "%Y-%m-%d" "$base_date" +%Y-%m-%d 2>/dev/null || echo "$base_date")
    # Add months via python se disponível
    if command -v python3 >/dev/null 2>&1; then
      data_vencimento_calc=$(python3 - <<PY
import datetime
base='${base_date}'
months=${validade_clean}
dt=datetime.datetime.strptime(base,'%Y-%m-%d')
year=dt.year + (dt.month+months-1)//12
month=(dt.month+months-1)%12+1
day=min(dt.day, [31,29 if year%4==0 and (year%100!=0 or year%400==0) else 28,31,30,31,30,31,31,30,31,30,31][month-1])
print(f"{year:04d}-{month:02d}-{day:02d}")
PY
      )
    fi
    data_vencimento="'$data_vencimento_calc'"
  elif [[ $validade_clean =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2} ]]; then
    data_vencimento="'$validade_clean'"
  fi

  # data_conclusao = created_at
  data_conclusao="'$created_clean'"

  # Só gera UPDATE se ao menos um campo enriquecido
  if [ "$data_vencimento" != "NULL" ] || [ "$validade_meses" != "NULL" ]; then
    echo "UPDATE qualificacoes_historico SET data_conclusao=$data_conclusao, data_vencimento=$data_vencimento, validade_meses=$validade_meses WHERE id=$id AND deleted_at IS NULL;"
  fi
done

echo "COMMIT;"
echo "-- Fim enriquecimento"

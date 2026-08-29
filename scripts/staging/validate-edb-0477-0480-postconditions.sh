#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
target="$ALLOWED_DB_NAME"
migration=""

for arg in "$@"; do
  case "$arg" in
    --target=*) target="${arg#*=}" ;;
    --migration=*) migration="${arg#*=}" ;;
    *) echo "ERROR: argumento desconhecido: $arg" >&2; exit 1 ;;
  esac
done

if [[ "$target" != "$ALLOWED_DB_NAME" ]]; then
  echo "ERROR: validator eDB recusou alvo diferente de staging: $target" >&2
  exit 1
fi

case "$migration" in
  0477_edb_operational_core.sql) change_id="edb-operational-core-0477" ;;
  0478_edb_anac_receipt_integrity.sql) change_id="edb-anac-receipt-integrity-0478" ;;
  0479_edb_relational_integrity.sql) change_id="edb-relational-integrity-0479" ;;
  0480_edb_diary_lifecycle_integrity.sql) change_id="edb-diary-lifecycle-integrity-0480" ;;
  *) echo "ERROR: --migration deve ser uma migration eDB 0477-0480 conhecida." >&2; exit 1 ;;
esac

query_count() {
  local sql="$1"
  local out
  out="$(mktemp -t edb-postcondition.XXXXXXXX.json)"
  (
    cd worker-airtrust
    npx wrangler d1 execute "$target" --remote --json --command "$sql" > "$out"
  )
  node - "$out" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
const total = Number(parsed?.[0]?.results?.[0]?.total);
fs.rmSync(file, { force: true });
if (!Number.isInteger(total) || total < 0) throw new Error('POSTCONDITION_COUNT_INVALID');
process.stdout.write(String(total));
NODE
}

assert_one() {
  local label="$1"
  local sql="$2"
  local total
  total="$(query_count "$sql")"
  if [[ "$total" != "1" ]]; then
    echo "ERROR: $label esperado=1 encontrado=$total" >&2
    exit 1
  fi
  echo "POSTCONDITION_OK=$label"
}

assert_one "d1_migrations:$migration" \
  "SELECT COUNT(*) AS total FROM d1_migrations WHERE name = '$migration';"
assert_one "schema_v2:$change_id" \
  "SELECT COUNT(*) AS total FROM airtrust_schema_changes_v2 WHERE change_id = '$change_id';"

if [[ "$migration" == 0477_* ]]; then
  for column in \
    tempo_voo_diurno_minutos tempo_voo_noturno_minutos tempo_voo_total_minutos \
    tempo_ifr_real_minutos tempo_ifr_simulado_minutos tempo_ifr_nao_classificado_minutos \
    pousos_total ciclos combustivel_antes_partida_motor pessoas_a_bordo_total \
    carga_regulatoria_kg ocorrencias_json; do
    assert_one "cv_voo_etapas.$column" \
      "SELECT COUNT(*) AS total FROM pragma_table_info('cv_voo_etapas') WHERE name = '$column';"
  done
  assert_one "cv_voo_tripulantes.codigo_funcao_anac" \
    "SELECT COUNT(*) AS total FROM pragma_table_info('cv_voo_tripulantes') WHERE name = 'codigo_funcao_anac';"
  for table in edb_diarios edb_volumes edb_situacoes_tecnicas edb_ciencias_tecnicas_pic \
    edb_registro_revisoes edb_registro_estado edb_assinaturas edb_discrepancias_tecnicas \
    edb_acoes_manutencao edb_auditoria_eventos edb_anac_outbox edb_anac_recibos edb_incidentes_integridade; do
    assert_one "table:$table" \
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name='$table';"
  done
  for trigger in trg_edb_ciencia_require_snapshot_binding trg_edb_revisao_require_scope_and_chain \
    trg_edb_assinatura_require_lifecycle trg_edb_estado_transition_guard \
    trg_edb_anac_outbox_require_operator_signed; do
    assert_one "trigger:$trigger" \
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='trigger' AND name='$trigger';"
  done
fi

if [[ "$migration" == 0478_* ]]; then
  for trigger in trg_edb_anac_outbox_identity_immutable trg_edb_anac_outbox_no_delete \
    trg_edb_anac_recibo_require_outbox_scope trg_edb_anac_recibo_no_update trg_edb_anac_recibo_no_delete; do
    assert_one "trigger:$trigger" \
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='trigger' AND name='$trigger';"
  done
fi

if [[ "$migration" == 0479_* ]]; then
  for column in voo_id situacao_tecnica_id actor_json; do
    assert_one "edb_auditoria_eventos.$column" \
      "SELECT COUNT(*) AS total FROM pragma_table_info('edb_auditoria_eventos') WHERE name = '$column';"
  done
  for trigger in trg_edb_volume_require_diary_scope trg_edb_discrepancia_require_revision_scope \
    trg_edb_acao_manutencao_require_discrepancy_scope trg_edb_auditoria_require_scope_and_chain \
    trg_edb_incidente_require_diary_scope; do
    assert_one "trigger:$trigger" \
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='trigger' AND name='$trigger';"
  done
fi

if [[ "$migration" == 0480_* ]]; then
  for trigger in trg_edb_diario_identity_immutable trg_edb_diario_status_transition_guard \
    trg_edb_diario_no_delete trg_edb_volume_status_transition_guard \
    trg_edb_volume_closing_evidence_immutable trg_edb_volume_no_delete \
    trg_edb_incidente_evidence_write_once trg_edb_incidente_status_transition_guard \
    trg_edb_incidente_no_delete; do
    assert_one "trigger:$trigger" \
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='trigger' AND name='$trigger';"
  done
fi

echo "EDB_STAGING_POSTCONDITIONS=PASS"

#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0535 preflight refused target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env staging --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count dependency-0534-ledger 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0534_training_compliance_final_matrix.sql';"
assert_count unapplied-0535 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0535_training_compliance_integra_bootstrap.sql';"
assert_count canonical-ead-category 1 "SELECT COUNT(*) count FROM qualificacoes_categorias WHERE empresa_id=6 AND UPPER(TRIM(codigo))='EAD' AND ativo=1 AND deleted_at IS NULL;"
integra_count="$(query_count "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='INTEGRA' AND ativo=1 AND deleted_at IS NULL;")"
[[ "$integra_count" == "0" || "$integra_count" == "1" ]] || { echo "ERROR: INTEGRA active identities must be 0 or 1; found=$integra_count" >&2; exit 1; }
echo "PREFLIGHT_OK=integra-active-identities-$integra_count"
assert_count nr05-0534-health 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='NR-05' AND categoria='EAD' AND validade IS NULL AND ativo=1 AND deleted_at IS NULL;"
assert_count fdm-mecanico-0534-health 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='FDM-MECANICO' AND categoria='EAD' AND validade IS NULL AND carga_horaria=1 AND ativo=1 AND deleted_at IS NULL;"
assert_count bowtiexp-0534-health 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='BOWTIEXP' AND categoria='EAD' AND validade=24 AND carga_horaria=4 AND ativo=1 AND deleted_at IS NULL;"
echo TRAINING_COMPLIANCE_INTEGRA_BOOTSTRAP_0535_STAGING_PREFLIGHT=PASS

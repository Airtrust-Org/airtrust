#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: production 0538 preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count dependency-0537 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-catalog-source-backed-metadata-0537' AND baseline_id='production-d1-baseline-v2-20260714';"
assert_count unapplied-0538 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-compliance-manager-designation-nr05-0538';"
assert_count ppsp-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='PPSP_SUP' AND ativo=1 AND deleted_at IS NULL;"
assert_count bowtie-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='BOWTIEXP' AND ativo=1 AND deleted_at IS NULL;"
assert_count nr05-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='NR-05' AND ativo=1 AND deleted_at IS NULL;"
echo TRAINING_COMPLIANCE_MANAGER_DESIGNATION_NR05_0538_PRODUCTION_PREFLIGHT=PASS

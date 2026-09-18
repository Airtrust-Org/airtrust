#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="controle-voos-navigation-points-0500"; SOURCE="FLIGHT_PREVIEW_PDF_2026-09-17"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0500 production postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count schema-v2-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count nav-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='cv_pontos_navegacao';"
assert_count nav-source-cardinality 3714 "SELECT COUNT(*) count FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte='$SOURCE' AND deleted_at IS NULL;"
assert_count nav-source-unique-codes 3714 "SELECT COUNT(DISTINCT codigo) count FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte='$SOURCE' AND deleted_at IS NULL;"
assert_count nav-invalid-coordinates 30 "SELECT COUNT(*) count FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte='$SOURCE' AND coordenada_valida=0 AND deleted_at IS NULL;"
assert_count nav-missing-elevation 166 "SELECT COUNT(*) count FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte='$SOURCE' AND elevacao_ft IS NULL AND deleted_at IS NULL;"
assert_count nav-9p-platforms 345 "SELECT COUNT(*) count FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte='$SOURCE' AND codigo_icao LIKE '9P%' AND tipo='plataforma' AND deleted_at IS NULL;"
assert_count nav-9p-unique 320 "SELECT COUNT(DISTINCT codigo_icao) count FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte='$SOURCE' AND codigo_icao LIKE '9P%' AND deleted_at IS NULL;"
assert_count nav-9p-non-platforms 0 "SELECT COUNT(*) count FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte='$SOURCE' AND codigo_icao LIKE '9P%' AND tipo<>'plataforma' AND deleted_at IS NULL;"
assert_count nav-icao-name-leak 0 "SELECT COUNT(*) count FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte='$SOURCE' AND codigo_icao LIKE '9P%' AND instr(UPPER(nome),UPPER(codigo_icao))>0 AND deleted_at IS NULL;"
assert_count nav-operational-links 3412 "SELECT COUNT(*) count FROM cv_aeroportos a JOIN cv_pontos_navegacao p ON p.id=a.ponto_navegacao_id AND p.empresa_id=a.empresa_id WHERE p.empresa_id=6 AND p.fonte='$SOURCE' AND p.permite_origem_destino=1 AND p.deleted_at IS NULL AND a.deleted_at IS NULL;"
assert_count nav-link-drift 0 "SELECT COUNT(*) count FROM cv_pontos_navegacao p WHERE p.empresa_id=6 AND p.fonte='$SOURCE' AND p.permite_origem_destino=1 AND p.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM cv_aeroportos a WHERE a.empresa_id=p.empresa_id AND a.ponto_navegacao_id=p.id AND a.deleted_at IS NULL);"
assert_count fpag-source 1 "SELECT COUNT(*) count FROM cv_pontos_navegacao WHERE empresa_id=6 AND codigo='FPAG' AND codigo_icao='9PLG' AND nome='ANITA GARIBALDI' AND tipo='plataforma' AND deleted_at IS NULL;"
assert_count fpag-operational 1 "SELECT COUNT(*) count FROM cv_aeroportos a JOIN cv_pontos_navegacao p ON p.id=a.ponto_navegacao_id AND p.empresa_id=a.empresa_id WHERE a.empresa_id=6 AND a.codigo='FPAG' AND a.codigo_icao='9PLG' AND a.nome='ANITA GARIBALDI' AND a.deleted_at IS NULL;"
assert_count sbme-linked 1 "SELECT COUNT(*) count FROM cv_aeroportos a JOIN cv_pontos_navegacao p ON p.id=a.ponto_navegacao_id AND p.empresa_id=a.empresa_id WHERE a.empresa_id=6 AND a.codigo='SBME' AND a.deleted_at IS NULL AND p.codigo='SBME' AND p.fonte='$SOURCE';"
assert_count nav-icao-index 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_cv_pontos_navegacao_empresa_icao';"
assert_count aeroportos-icao-index 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_cv_aeroportos_empresa_icao_0500';"
echo CONTROLE_VOOS_NAVIGATION_POINTS_0500_PRODUCTION_POSTCONDITIONS=PASS

#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; BLOCKED_PRODUCTION_DB_NAME="airtrust-db"; MIGRATION_BASENAME="0500_controle_voos_navigation_points.sql"
target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" && "$target" != "$BLOCKED_PRODUCTION_DB_NAME" ]] || { echo "ERROR: staging 0500 validator refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; node - "$target" "$sql" <<'NODE'
const {spawnSync}=require('node:child_process'),path=require('node:path');const[,,db,sql]=process.argv;const r=spawnSync('npx',['wrangler','d1','execute',db,'--remote','--json','--command',sql],{cwd:path.join(process.cwd(),'worker-airtrust'),encoding:'utf8',env:process.env});if(r.status!==0){process.stderr.write(r.stderr||r.stdout);process.exit(1)}const s=r.stdout.indexOf('['),e=r.stdout.lastIndexOf(']'),p=JSON.parse(s>=0&&e>s?r.stdout.slice(s,e+1):r.stdout),row=(Array.isArray(p)?p[0]?.results:p?.results)?.[0],n=Number(row?.count??row?.total??row?.['COUNT(*)']??(row?Object.values(row)[0]:NaN));if(!Number.isInteger(n)||n<0)throw new Error('INVALID_COUNT');process.stdout.write(String(n));
NODE
}
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count migration-ledger 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='$MIGRATION_BASENAME';"
assert_count nav-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='cv_pontos_navegacao';"
assert_count nav-source-cardinality 3714 "SELECT COUNT(*) count FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte='FLIGHT_PREVIEW_PDF_2026-09-17';"
assert_count nav-source-unique-codes 3714 "SELECT COUNT(DISTINCT codigo) count FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte='FLIGHT_PREVIEW_PDF_2026-09-17';"
assert_count nav-invalid-coordinates 30 "SELECT COUNT(*) count FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte='FLIGHT_PREVIEW_PDF_2026-09-17' AND coordenada_valida=0;"
assert_count nav-missing-elevation 166 "SELECT COUNT(*) count FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte='FLIGHT_PREVIEW_PDF_2026-09-17' AND elevacao_ft IS NULL;"
assert_count nav-9p-platforms 345 "SELECT COUNT(*) count FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte='FLIGHT_PREVIEW_PDF_2026-09-17' AND codigo_icao LIKE '9P%' AND tipo='plataforma';"
assert_count nav-9p-non-platforms 0 "SELECT COUNT(*) count FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte='FLIGHT_PREVIEW_PDF_2026-09-17' AND codigo_icao LIKE '9P%' AND tipo<>'plataforma';"
assert_count nav-operational-links 3412 "SELECT COUNT(*) count FROM cv_aeroportos a JOIN cv_pontos_navegacao p ON p.id=a.ponto_navegacao_id AND p.empresa_id=a.empresa_id WHERE p.empresa_id=6 AND p.fonte='FLIGHT_PREVIEW_PDF_2026-09-17' AND p.permite_origem_destino=1 AND a.deleted_at IS NULL;"
assert_count nav-link-drift 0 "SELECT COUNT(*) count FROM cv_pontos_navegacao p WHERE p.empresa_id=6 AND p.fonte='FLIGHT_PREVIEW_PDF_2026-09-17' AND p.permite_origem_destino=1 AND NOT EXISTS (SELECT 1 FROM cv_aeroportos a WHERE a.empresa_id=p.empresa_id AND a.ponto_navegacao_id=p.id AND a.deleted_at IS NULL);"
echo CONTROLE_VOOS_NAVIGATION_POINTS_0500_STAGING_POSTCONDITIONS=PASS

#!/usr/bin/env bash
# Read-only fail-closed production preflight for Schema V2 change 0490.
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"
BASELINE_ID="production-d1-baseline-v2-20260714"
CHANGE_ID="simulator-planning-curriculum-metadata-0490"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0490 production preflight refused target: $target" >&2; exit 1; }
query_count() {
  local sql="$1"
  node - "$target" "$sql" <<'NODE'
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const [,, dbName, sql] = process.argv;
const res = spawnSync('npx',['wrangler','d1','execute',dbName,'--env','production','--remote','--json','--command',sql],{cwd:path.join(process.cwd(),'worker-airtrust'),encoding:'utf8',env:process.env});
if (res.status !== 0) { process.stderr.write(res.stderr || res.stdout); process.exit(1); }
let parsed; try { parsed=JSON.parse(res.stdout); } catch { const s=res.stdout.indexOf('['), e=res.stdout.lastIndexOf(']'); if(s<0||e<=s) throw new Error('D1_JSON_NOT_FOUND'); parsed=JSON.parse(res.stdout.slice(s,e+1)); }
const row=(Array.isArray(parsed)?parsed[0]?.results:parsed?.results)?.[0];
const value=row?.count ?? row?.total ?? row?.['COUNT(*)'] ?? (row?Object.values(row)[0]:NaN);
const count=Number(value); if(!Number.isInteger(count)||count<0) throw new Error(`INVALID_COUNT:${JSON.stringify(parsed)}`); process.stdout.write(String(count));
NODE
}
assert_count(){ local label="$1" expected="$2" sql="$3"; local count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count "active-baseline" 1 "SELECT COUNT(*) AS count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count "unapplied-change" 0 "SELECT COUNT(*) AS count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count "qualification-types" 3 "SELECT COUNT(*) AS count FROM qualificacoes_tipos WHERE empresa_id=6 AND deleted_at IS NULL AND codigo IN ('G1','G1-SEM','G2');"
assert_count "aw139-current-recurrent" 18 "SELECT COUNT(*) AS count FROM modelos_sessao_versionamento WHERE empresa_id=6 AND is_current=1 AND codigo_canonico IN ('A139-P-01/04-C1','A139-P-01/04-C2','A139-P-01/04-C3','A139-P-02/04-C1-OFFSHORE','A139-P-02/04-C2-OFFSHORE','A139-P-02/04-C3-OFFSHORE','A139-P-03/04-C1-IFR-LOFT','A139-P-03/04-C2-IFR-LOFT','A139-P-03/04-C3-IFR-LOFT','A139-P-04/04-C1-CHECK','A139-P-04/04-C2-CHECK','A139-P-04/04-C3-CHECK','A139-S-01/02-C1','A139-S-01/02-C2','A139-S-01/02-C3','A139-S-02/02-C1','A139-S-02/02-C2','A139-S-02/02-C3');"
old_s76="$(query_count "SELECT COUNT(*) AS count FROM modelos_sessao_versionamento WHERE empresa_id=6 AND is_current=1 AND codigo_canonico IN ('S76-P-01/04-C1','S76-P-01/04-C2','S76-P-01/04-C3','S76-P-02/04-C1','S76-P-02/04-C2','S76-P-02/04-C3');")"
new_s76="$(query_count "SELECT COUNT(*) AS count FROM modelos_sessao_versionamento WHERE empresa_id=6 AND is_current=1 AND codigo_canonico IN ('S76-P-01/03-C1','S76-P-01/03-C2','S76-P-01/03-C3','S76-P-02/03-C1','S76-P-02/03-C2','S76-P-02/03-C3');")"
[[ ( "$old_s76" == 6 && "$new_s76" == 0 ) || ( "$old_s76" == 0 && "$new_s76" == 6 ) ]] || { echo "ERROR: S-76 /04-/03 state mixed old=$old_s76 new=$new_s76" >&2; exit 1; }
echo "PREFLIGHT_OK=s76-code-state:$old_s76/$new_s76"
assert_count "sk76-check" 1 "SELECT COUNT(*) AS count FROM modelos_sessao_versionamento WHERE empresa_id=6 AND is_current=1 AND codigo_canonico='SK76-P-CHECK';"
assert_count "duration-conflicts" 0 "SELECT COUNT(*) AS count FROM modelos_sessao_versionamento v JOIN modelos_sessao ms ON ms.id=v.modelo_id AND ms.empresa_id=v.empresa_id WHERE v.empresa_id=6 AND v.is_current=1 AND (v.codigo_canonico LIKE 'A139-P-%' OR v.codigo_canonico LIKE 'A139-S-%' OR v.codigo_canonico LIKE 'S76-P-%' OR v.codigo_canonico='SK76-P-CHECK') AND ms.duracao_estimada IS NOT NULL AND ms.duracao_estimada<>120;"
assert_count "ordered-outside-approved-c2" 0 "SELECT COUNT(*) AS count FROM modelos_sessao_versionamento v JOIN modelos_sessao ms ON ms.id=v.modelo_id AND ms.empresa_id=v.empresa_id JOIN qualificacoes_tipos qt ON qt.id=ms.qualificacao_tipo_id AND qt.empresa_id=ms.empresa_id WHERE v.empresa_id=6 AND v.is_current=1 AND qt.codigo IN ('G1','G1-SEM','G2') AND ms.ordem_no_treinamento IS NOT NULL AND v.codigo_canonico NOT IN ('A139-P-01/04-C2','A139-P-02/04-C2-OFFSHORE','A139-P-03/04-C2-IFR-LOFT','A139-P-04/04-C2-CHECK','A139-S-01/02-C2','A139-S-02/02-C2','S76-P-01/04-C2','S76-P-02/04-C2','S76-P-01/03-C2','S76-P-02/03-C2','SK76-P-CHECK');"
echo "SIMULATOR_PLANNING_CURRICULUM_0490_PRODUCTION_PREFLIGHT=PASS"

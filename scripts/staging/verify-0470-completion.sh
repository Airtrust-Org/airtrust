#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"
BLOCKED_PRODUCTION_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
ALLOWED_HOST="airtrust-api-staging.airtrust.workers.dev"
API_BASE="https://${ALLOWED_HOST}"
QA_FIXTURE_EMPRESA_ID=999006
QA_FIXTURE_MARKER="QA_CERT_DOMAIN_E2E_999006"

db_name="${STAGING_D1_NAME:-$ALLOWED_DB_NAME}"
db_id="${STAGING_D1_ID:-$ALLOWED_DB_ID}"
if [[ "$db_name" != "$ALLOWED_DB_NAME" || "$db_id" != "$ALLOWED_DB_ID" || "$db_id" == "$BLOCKED_PRODUCTION_DB_ID" ]]; then
  echo "ERROR: alvo D1 não corresponde ao staging permitido." >&2
  exit 1
fi

host="$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$API_BASE")"
[[ "$host" == "$ALLOWED_HOST" ]] || { echo "ERROR: host não é o Worker oficial de staging." >&2; exit 1; }

bash scripts/staging/validate-0470-postconditions.sh --target="$db_name"

run_query() {
  (cd worker-airtrust && npx wrangler d1 execute "$db_name" --remote --json --command "$1")
}

completion_json="$(run_query "SELECT
  COUNT(*) AS eligible,
  SUM(CASE WHEN h.validacao_hash IS NULL THEN 1 ELSE 0 END) AS missing_hash,
  COUNT(DISTINCT CASE WHEN h.validacao_hash IS NOT NULL THEN h.validacao_hash END) AS distinct_hashes,
  SUM(CASE WHEN h.validacao_hash IS NOT NULL THEN 1 ELSE 0 END) AS hashed_rows
FROM qualificacoes_historico h
WHERE h.deleted_at IS NULL
  AND h.certificado_arquivo_id IS NOT NULL
  AND h.numero_certificado IS NOT NULL
  AND NOT (h.empresa_id = ${QA_FIXTURE_EMPRESA_ID} AND h.observacoes = '${QA_FIXTURE_MARKER}');")"
printf '%s' "$completion_json" | node -e '
let d=""; process.stdin.on("data",c=>d+=c).on("end",()=>{
  const raw=JSON.parse(d); const r=raw?.[0]?.results?.[0];
  if(!r) throw new Error("COMPLETION_ROW_MISSING");
  const eligible=Number(r.eligible||0), missing=Number(r.missing_hash||0), distinct=Number(r.distinct_hashes||0), hashed=Number(r.hashed_rows||0);
  if(eligible < 1) throw new Error("NO_OPERATIONAL_CERTIFICATES");
  if(missing !== 0) throw new Error(`MISSING_HASHES:${missing}`);
  if(hashed !== eligible) throw new Error(`HASHED_ELIGIBLE_MISMATCH:${hashed}/${eligible}`);
  if(distinct !== hashed) throw new Error(`HASH_COLLISION_OR_DUPLICATE:${distinct}/${hashed}`);
  console.log(JSON.stringify({completion:true,eligible,hashed,missingHash:missing,collisions:0}));
});'

valid_hash_json="$(run_query "SELECT h.validacao_hash AS validacao_hash
FROM qualificacoes_historico h
INNER JOIN funcionarios f ON f.id = h.funcionario_id AND f.deleted_at IS NULL
INNER JOIN documentos d ON d.id = h.certificado_arquivo_id AND d.deleted_at IS NULL
WHERE h.deleted_at IS NULL
  AND h.validacao_hash IS NOT NULL
  AND h.certificado_arquivo_id IS NOT NULL
  AND h.numero_certificado IS NOT NULL
  AND f.cpf IS NOT NULL AND TRIM(f.cpf) <> ''
  AND h.qualificacao_codigo IS NOT NULL AND TRIM(h.qualificacao_codigo) <> ''
  AND h.data_conclusao IS NOT NULL AND TRIM(h.data_conclusao) <> ''
  AND NOT (h.empresa_id = ${QA_FIXTURE_EMPRESA_ID} AND h.observacoes = '${QA_FIXTURE_MARKER}')
ORDER BY h.id ASC
LIMIT 1;")"
valid_hash="$(printf '%s' "$valid_hash_json" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const r=JSON.parse(d)?.[0]?.results?.[0]?.validacao_hash||"";if(!/^[A-F0-9]{16}$/.test(r)) process.exit(1);process.stdout.write(r);})')"
[[ -n "$valid_hash" ]] || { echo "ERROR: nenhum hash operacional válido disponível." >&2; exit 1; }
echo "::add-mask::$valid_hash"

valid_body="$(mktemp -t airtrust-0470-valid.XXXXXXXX.json)"
invalid_body="$(mktemp -t airtrust-0470-invalid.XXXXXXXX.json)"
trap 'rm -f "$valid_body" "$invalid_body"' EXIT

valid_code="$(curl --silent --show-error --output "$valid_body" --write-out '%{http_code}' --max-time 20 "${API_BASE}/api/certificados/validar/${valid_hash}")"
[[ "$valid_code" == "200" ]] || { echo "ERROR: lookup válido retornou HTTP $valid_code." >&2; exit 1; }
VALID_BODY="$valid_body" node -e '
const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.env.VALID_BODY,"utf8"));
if(body?.success!==true || body?.valido!==true || body?.documento_autentico!==true) process.exit(1);
const cpf=String(body?.certificado?.funcionario_cpf||"");
if(cpf && !cpf.includes("***")) throw new Error("CPF_NOT_MASKED");
console.log(JSON.stringify({validLookup:true,http:200,cpfMasked:!cpf||cpf.includes("***")}));'

invalid_code="$(curl --silent --show-error --output "$invalid_body" --write-out '%{http_code}' --max-time 20 "${API_BASE}/api/certificados/validar/NOT-A-HASH")"
[[ "$invalid_code" == "400" ]] || { echo "ERROR: lookup inválido retornou HTTP $invalid_code." >&2; exit 1; }
INVALID_BODY="$invalid_body" node -e '
const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.env.INVALID_BODY,"utf8"));
if(body?.success!==false || body?.valido!==false) process.exit(1);
if(Object.prototype.hasOwnProperty.call(body,"certificado")) throw new Error("INVALID_LOOKUP_EXPOSED_CERTIFICATE");
const text=JSON.stringify(body);
if(/funcionario_nome|funcionario_cpf|numero_certificado/i.test(text)) throw new Error("INVALID_LOOKUP_EXPOSED_PII_FIELDS");
console.log(JSON.stringify({invalidLookupSafe:true,http:400,piiExposed:false}));'

echo "STAGING_0470_VERIFICATION_OK"

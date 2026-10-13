#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
target=airtrust-db
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "UNSUPPORTED_ARG" >&2; exit 1 ;; esac; done
[[ "$target" == airtrust-db ]] || { echo "WRONG_D1_TARGET" >&2; exit 1; }
query_count(){
  local sql="$1"
  (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") |
  node -e "let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{let a=JSON.parse(s);let n=Number(a[0]?.results?.[0]?.count);if(!Number.isSafeInteger(n)||n<0)process.exit(1);console.log(n)})"
}
assert_count(){
  local name="$1" expected="$2" sql="$3" n
  n="$(query_count "$sql")"
  [[ "$n" == "$expected" ]] || { echo "0550_CHECK_FAILED:$name expected=$expected actual=$n" >&2; exit 1; }
  echo "PASS:$name"
}
assert_count ledger-0551 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='coordenacao-role-user-restore-0551' AND baseline_id='production-d1-baseline-v2-20260714'"
assert_count coordination-restored-user 1 "SELECT COUNT(*) count FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id WHERE ue.empresa_id=6 AND u.deleted_at IS NULL AND UPPER(TRIM(u.perfil))='USUARIO' AND LOWER(TRIM(COALESCE(u.nome,''))) LIKE '%coordena%' AND EXISTS (SELECT 1 FROM usuarios_empresas_perfis p WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=6 AND p.ativo=1 AND UPPER(TRIM(p.perfil))='COORDENACAO_VOO') AND LOWER(TRIM(ue.role))='user'"
assert_count no-viewer 0 "SELECT COUNT(*) count FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id WHERE ue.empresa_id=6 AND u.deleted_at IS NULL AND LOWER(TRIM(ue.role))='viewer'"
assert_count one-user 1 "SELECT COUNT(*) count FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id WHERE ue.empresa_id=6 AND u.deleted_at IS NULL AND LOWER(TRIM(ue.role))='user'"
assert_count preserved-26-students 26 "SELECT COUNT(*) count FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id WHERE ue.empresa_id=6 AND u.deleted_at IS NULL AND UPPER(TRIM(u.perfil))='ALUNO' AND LOWER(TRIM(ue.role))='student' AND EXISTS (SELECT 1 FROM usuarios_empresas_perfis p WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=6 AND p.ativo=0 AND UPPER(TRIM(p.perfil)) IN ('VIEWER','VISUALIZADOR'))"
assert_count coordination-viewer-profile-disabled 0 "SELECT COUNT(*) count FROM usuarios_empresas_perfis p JOIN usuarios_empresas ue ON ue.usuario_id=p.usuario_id AND ue.empresa_id=p.empresa_id JOIN usuarios u ON u.id=ue.usuario_id WHERE p.empresa_id=6 AND p.ativo=1 AND UPPER(TRIM(p.perfil))='VIEWER' AND LOWER(TRIM(ue.role))='user' AND u.deleted_at IS NULL AND UPPER(TRIM(u.perfil))='USUARIO' AND LOWER(TRIM(COALESCE(u.nome,''))) LIKE '%coordena%'"
assert_count coordination-user-profile-active 1 "SELECT COUNT(*) count FROM usuarios_empresas_perfis p JOIN usuarios_empresas ue ON ue.usuario_id=p.usuario_id AND ue.empresa_id=p.empresa_id JOIN usuarios u ON u.id=ue.usuario_id WHERE p.empresa_id=6 AND p.ativo=1 AND UPPER(TRIM(p.perfil))='USER' AND LOWER(TRIM(ue.role))='user' AND u.deleted_at IS NULL AND UPPER(TRIM(u.perfil))='USUARIO' AND LOWER(TRIM(COALESCE(u.nome,''))) LIKE '%coordena%'"
echo 'COORDENACAO_0551_POSTCONDITIONS_PASS'

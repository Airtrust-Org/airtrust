#!/usr/bin/env bash

# source_reference: Canonical local LMS smoke for SCORM completion persistence.
# operational_decision: Exercise only the disposable local D1/Worker; never target remote D1/R2.
# dry_run_required: YES — CI/local disposable state only.
# rollback_plan_required: YES — scripts/setup-local-lms-smoke-db.sh --reset recreates the fixture.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE="${AIRTRUST_LOCAL_API_BASE:-http://localhost:8787/api}"
LOGIN_EMAIL="${AIRTRUST_LOCAL_LMS_EMAIL:-admin@airtrust.com}"
LOGIN_PASSWORD="${AIRTRUST_LOCAL_LMS_PASSWORD:-Admin@123}"
EMPRESA_ID="${AIRTRUST_LMS_EMPRESA_ID:-6}"
FUNCIONARIO_ID="${AIRTRUST_LMS_FUNCIONARIO_ID:-5}"
QUALIFICACAO_ID="${AIRTRUST_LMS_QUALIFICACAO_ID:-26}"
DB_PATH="${AIRTRUST_LOCAL_DB_PATH:-}"

if [[ -z "$DB_PATH" ]]; then
  DB_PATH="$(find "$ROOT_DIR/worker-airtrust/.wrangler/state" -path '*miniflare-D1DatabaseObject/*.sqlite' | head -n 1)"
fi
[[ -n "$DB_PATH" && -f "$DB_PATH" ]] || { echo "Local D1 database not found." >&2; exit 1; }

sql() { sqlite3 "$DB_PATH" "$1"; }

json_get() {
  local path="$1"
  node -e '
    const path = process.argv[1].split(".");
    let raw = "";
    process.stdin.on("data", (chunk) => (raw += chunk));
    process.stdin.on("end", () => {
      const parsed = JSON.parse(raw);
      let cursor = parsed;
      for (const key of path) cursor = cursor?.[key];
      if (cursor === undefined || cursor === null) process.exit(1);
      process.stdout.write(String(cursor));
    });
  ' "$path"
}

echo "[smoke:lms:scorm] Authenticating"
LOGIN_RESPONSE="$(curl -fsS -X POST "$API_BASE/auth/login"   -H 'Content-Type: application/json'   -d "{\"email\":\"$LOGIN_EMAIL\",\"senha\":\"$LOGIN_PASSWORD\"}")"
TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | json_get data.accessToken)"

echo "[smoke:lms:scorm] Creating synthetic SCORM course"
COURSE_PAYLOAD="$(node -e '
  const qualificationId = Number(process.argv[1]);
  process.stdout.write(JSON.stringify({
    titulo: "LMS Smoke SCORM Completion",
    descricao: "Synthetic local-only SCORM completion fixture.",
    categoria: "EAD",
    carga_horaria_minutos: 10,
    conteudo_programatico: "Synthetic SCORM progress, resume and terminal completion.",
    observacoes: "Disposable CI smoke fixture.",
    qualificacao_tipo_id: qualificationId,
    gerar_qualificacao_ao_concluir: 1,
    scorm_versao: "1.2",
    scorm_mastery_score: 70,
    tipo_conteudo: "scorm",
    publicado: 1
  }));
' "$QUALIFICACAO_ID")"
COURSE_RESPONSE="$(curl -fsS -X POST "$API_BASE/lms/cursos"   -H "Authorization: Bearer $TOKEN"   -H 'Content-Type: application/json'   -d "$COURSE_PAYLOAD")"
CURSO_ID="$(printf '%s' "$COURSE_RESPONSE" | json_get data.id)"

# Completion integrity requires a package binding. This is a disposable local
# fixture: no R2 object is fetched or written by this smoke.
sql "UPDATE lms_cursos
        SET scorm_package_r2_prefix = 'local-smoke/scorm/$CURSO_ID',
            scorm_launch_file = 'index.html',
            ativo = 1,
            publicado = 1,
            updated_at = datetime('now')
      WHERE id = $CURSO_ID AND empresa_id = $EMPRESA_ID;"

echo "[smoke:lms:scorm] Creating synthetic enrollment"
MATRICULA_RESPONSE="$(curl -fsS -X POST "$API_BASE/lms/matriculas"   -H "Authorization: Bearer $TOKEN"   -H 'Content-Type: application/json'   -d "{\"curso_id\":$CURSO_ID,\"funcionario_id\":$FUNCIONARIO_ID,\"observacoes\":\"SCORM completion smoke\"}")"
MATRICULA_ID="$(printf '%s' "$MATRICULA_RESPONSE" | json_get data.id)"

echo "[smoke:lms:scorm] Persisting non-terminal progress first"
PARTIAL_CMI='{"cmi.core.lesson_location":"1/3","cmi.core.lesson_status":"incomplete"}'
curl -fsS -X POST "$API_BASE/lms/matriculas/scorm/commit"   -H "Authorization: Bearer $TOKEN"   -H 'Content-Type: application/json'   -d "$(node -e '
    const id=Number(process.argv[1]);
    const cmi=process.argv[2];
    process.stdout.write(JSON.stringify({
      matricula_id:id,
      lesson_status:"incomplete",
      score_raw:30,
      score_max:100,
      session_time:"00:01:00",
      suspend_data:JSON.stringify({schema:"airtrust-scorm12-state",slideAtual:1,totalSlides:3,progresso:33}),
      cmi_json:cmi,
      commit_event:"smoke-progress"
    }));
  ' "$MATRICULA_ID" "$PARTIAL_CMI")" >/dev/null

PARTIAL_ROW="$(sql "SELECT status || '|' || CAST(progresso_pct AS TEXT)
  FROM lms_matriculas WHERE id=$MATRICULA_ID AND empresa_id=$EMPRESA_ID;")"
PARTIAL_STATUS="${PARTIAL_ROW%%|*}"
PARTIAL_PROGRESS="${PARTIAL_ROW#*|}"
[[ "$PARTIAL_STATUS" != "CONCLUIDO" ]] || { echo "Partial SCORM commit concluded enrollment prematurely." >&2; exit 1; }
node -e 'const n=Number(process.argv[1]); if(!(n>0 && n<100)) process.exit(1)' "$PARTIAL_PROGRESS"   || { echo "Partial SCORM progress was not persisted monotonically: $PARTIAL_PROGRESS" >&2; exit 1; }

echo "[smoke:lms:scorm] Establishing enrollment-bound asset session"
COOKIE_JAR="$(mktemp)"
BODY_FILE="$(mktemp)"
cleanup() { rm -f "$COOKIE_JAR" "$BODY_FILE"; }
trap cleanup EXIT
curl -fsS -c "$COOKIE_JAR" -X POST "$API_BASE/lms/assets/session"   -H "Authorization: Bearer $TOKEN"   -H 'Content-Type: application/json'   -d "{\"matricula_id\":$MATRICULA_ID}" >/dev/null

echo "[smoke:lms:scorm] Committing terminal passed/completed state"
FINAL_CMI='{"cmi.core.lesson_location":"3/3","cmi.core.lesson_status":"passed","cmi.core.score.raw":"90","cmi.core.score.max":"100"}'
HTTP_CODE="$(curl -sS -o "$BODY_FILE" -w '%{http_code}' -b "$COOKIE_JAR"   -X POST "$API_BASE/lms/matriculas/scorm/commit"   -H "Authorization: Bearer $TOKEN"   -H 'Content-Type: application/json'   -d "$(node -e '
    const id=Number(process.argv[1]);
    const cmi=process.argv[2];
    process.stdout.write(JSON.stringify({
      matricula_id:id,
      lesson_status:"passed",
      completion_status:"completed",
      success_status:"passed",
      score_raw:90,
      score_max:100,
      score_min:0,
      score_scaled:0.9,
      session_time:"00:02:00",
      total_time:"00:03:00",
      suspend_data:JSON.stringify({schema:"airtrust-scorm12-state",slideAtual:3,totalSlides:3,progresso:100}),
      cmi_json:cmi,
      commit_event:"smoke-terminal",
      completion_candidate:true
    }));
  ' "$MATRICULA_ID" "$FINAL_CMI")")"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "Terminal SCORM commit failed with HTTP $HTTP_CODE" >&2
  cat "$BODY_FILE" >&2
  exit 1
fi

FINAL_STATUS="$(json_get data.novo_status < "$BODY_FILE")"
FINAL_PROGRESS="$(json_get data.progresso_efetivo < "$BODY_FILE")"
HISTORICO_ID="$(json_get data.qualificacao_gerada.qualificacao_historico_id < "$BODY_FILE")"

[[ "$FINAL_STATUS" == "CONCLUIDO" ]] || { echo "Unexpected terminal status: $FINAL_STATUS" >&2; exit 1; }
[[ "$FINAL_PROGRESS" == "100" ]] || { echo "Unexpected effective progress: $FINAL_PROGRESS" >&2; exit 1; }
[[ "$HISTORICO_ID" =~ ^[1-9][0-9]*$ ]] || { echo "Qualification history link missing." >&2; exit 1; }

echo "[smoke:lms:scorm] Verifying persisted completion, qualification and SCORM state"
MATRICULA_ROW="$(sql "SELECT status || '|' || CAST(progresso_pct AS TEXT) || '|' ||
  COALESCE(CAST(qualificacao_historico_id AS TEXT),'') || '|' || COALESCE(data_conclusao,'')
  FROM lms_matriculas WHERE id=$MATRICULA_ID AND empresa_id=$EMPRESA_ID;")"
IFS='|' read -r DB_STATUS DB_PROGRESS DB_HISTORICO DB_DATA_CONCLUSAO <<< "$MATRICULA_ROW"
[[ "$DB_STATUS" == "CONCLUIDO" ]] || { echo "DB enrollment status is $DB_STATUS" >&2; exit 1; }
[[ "$DB_PROGRESS" == "100" || "$DB_PROGRESS" == "100.0" ]] || { echo "DB progress is $DB_PROGRESS" >&2; exit 1; }
[[ "$DB_HISTORICO" == "$HISTORICO_ID" ]] || { echo "DB qualification link mismatch." >&2; exit 1; }
[[ -n "$DB_DATA_CONCLUSAO" ]] || { echo "Completion date missing." >&2; exit 1; }

QUAL_ROW="$(sql "SELECT status || '|' || COALESCE(qualificacao_codigo,'') || '|' ||
  COALESCE(CAST(lms_matricula_id AS TEXT),'')
  FROM qualificacoes_historico
  WHERE id=$HISTORICO_ID AND empresa_id=$EMPRESA_ID AND deleted_at IS NULL;")"
IFS='|' read -r QUAL_STATUS QUAL_CODE QUAL_MATRICULA <<< "$QUAL_ROW"
[[ "$QUAL_STATUS" == "CONCLUIDA" ]] || { echo "Qualification status is $QUAL_STATUS" >&2; exit 1; }
[[ "$QUAL_CODE" == "LMS-SMOKE-EAD" ]] || { echo "Qualification code is $QUAL_CODE" >&2; exit 1; }
[[ "$QUAL_MATRICULA" == "$MATRICULA_ID" ]] || { echo "Qualification enrollment backlink mismatch." >&2; exit 1; }

SCORM_ROW="$(sql "SELECT COALESCE(lesson_status,'') || '|' || COALESCE(completion_status,'') || '|' ||
  COALESCE(success_status,'') || '|' || COALESCE(CAST(score_raw AS TEXT),'')
  FROM lms_progresso_scorm
  WHERE matricula_id=$MATRICULA_ID AND empresa_id=$EMPRESA_ID;")"
IFS='|' read -r LESSON_STATUS COMPLETION_STATUS SUCCESS_STATUS SCORE_RAW <<< "$SCORM_ROW"
[[ "$LESSON_STATUS" == "passed" ]] || { echo "Stored lesson_status is $LESSON_STATUS" >&2; exit 1; }
[[ "$COMPLETION_STATUS" == "completed" ]] || { echo "Stored completion_status is $COMPLETION_STATUS" >&2; exit 1; }
[[ "$SUCCESS_STATUS" == "passed" ]] || { echo "Stored success_status is $SUCCESS_STATUS" >&2; exit 1; }
[[ "$SCORE_RAW" == "90" || "$SCORE_RAW" == "90.0" ]] || { echo "Stored score_raw is $SCORE_RAW" >&2; exit 1; }

echo "[smoke:lms:scorm] Replaying incomplete commit to prove completed enrollment cannot downgrade"
curl -fsS -b "$COOKIE_JAR" -X POST "$API_BASE/lms/matriculas/scorm/commit"   -H "Authorization: Bearer $TOKEN"   -H 'Content-Type: application/json'   -d "{\"matricula_id\":$MATRICULA_ID,\"lesson_status\":\"incomplete\",\"cmi_json\":\"{\\\"cmi.core.lesson_location\\\":\\\"1/3\\\"}\"}" >/dev/null

POST_REPLAY_ROW="$(sql "SELECT status || '|' || CAST(progresso_pct AS TEXT) || '|' ||
  COALESCE(CAST(qualificacao_historico_id AS TEXT),'')
  FROM lms_matriculas WHERE id=$MATRICULA_ID AND empresa_id=$EMPRESA_ID;")"
IFS='|' read -r REPLAY_STATUS REPLAY_PROGRESS REPLAY_HISTORICO <<< "$POST_REPLAY_ROW"
[[ "$REPLAY_STATUS" == "CONCLUIDO" ]] || { echo "Completed enrollment downgraded to $REPLAY_STATUS" >&2; exit 1; }
[[ "$REPLAY_PROGRESS" == "100" || "$REPLAY_PROGRESS" == "100.0" ]] || { echo "Completed progress regressed to $REPLAY_PROGRESS" >&2; exit 1; }
[[ "$REPLAY_HISTORICO" == "$HISTORICO_ID" ]] || { echo "Qualification link changed after replay." >&2; exit 1; }

DUP_COUNT="$(sql "SELECT COUNT(*) FROM qualificacoes_historico
  WHERE empresa_id=$EMPRESA_ID AND funcionario_id=$FUNCIONARIO_ID
    AND qualificacao_codigo='LMS-SMOKE-EAD' AND deleted_at IS NULL;")"
[[ "$DUP_COUNT" == "1" ]] || { echo "SCORM replay created duplicate qualification history: $DUP_COUNT" >&2; exit 1; }

echo "[smoke:lms:scorm] PASS — terminal SCORM completion persisted at 100%, qualification linked, replay did not downgrade"
echo "SCORM_CURSO_ID=$CURSO_ID"
echo "SCORM_MATRICULA_ID=$MATRICULA_ID"
echo "SCORM_QUALIFICACAO_HISTORICO_ID=$HISTORICO_ID"

#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${AIRTRUST_LOCAL_DB_PATH:-}"
API_BASE="${AIRTRUST_LOCAL_API_BASE:-http://localhost:8787/api}"
LOGIN_EMAIL="${AIRTRUST_LOCAL_LMS_EMAIL:-admin@airtrust.com}"
LOGIN_PASSWORD="${AIRTRUST_LOCAL_LMS_PASSWORD:-Admin@123}"
EMPRESA_ID="${AIRTRUST_LMS_EMPRESA_ID:-6}"
PREFERRED_FUNCIONARIO_ID="${AIRTRUST_LMS_FUNCIONARIO_ID:-5}"
PREFERRED_QUALIFICACAO_ID="${AIRTRUST_LMS_QUALIFICACAO_ID:-26}"
PDF_FILE="${1:-$ROOT_DIR/fixtures/lms/offshore-demo.pdf}"

if [[ -z "$DB_PATH" ]]; then
  DB_PATH="$(find "$ROOT_DIR/worker-airtrust/.wrangler/state" -path '*miniflare-D1DatabaseObject/*.sqlite' | head -n 1)"
fi

if [[ -z "$DB_PATH" || ! -f "$DB_PATH" ]]; then
  echo "Local D1 database not found." >&2
  exit 1
fi

if [[ ! -f "$PDF_FILE" ]]; then
  echo "PDF fixture not found: $PDF_FILE" >&2
  exit 1
fi

sql() {
  sqlite3 "$DB_PATH" "$1"
}

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

ensure_local_lms_schema() {
  if sql "PRAGMA table_info(lms_cursos);" | grep -q '|pdf_r2_key|'; then
    return
  fi

  sqlite3 "$DB_PATH" <<'SQL'
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS lms_cursos_bootstrap_v341;

CREATE TABLE lms_cursos_bootstrap_v341 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  carga_horaria_minutos INTEGER DEFAULT 0,
  idioma TEXT DEFAULT 'pt-BR',
  thumbnail_r2_key TEXT,
  scorm_versao TEXT CHECK (scorm_versao IN ('1.2', '2004', NULL)),
  scorm_package_r2_prefix TEXT,
  scorm_launch_file TEXT,
  scorm_mastery_score INTEGER DEFAULT 70,
  qualificacao_tipo_id INTEGER,
  gerar_qualificacao_ao_concluir INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  publicado INTEGER NOT NULL DEFAULT 0,
  version_tag TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  tipo_conteudo TEXT NOT NULL DEFAULT 'scorm'
    CHECK (tipo_conteudo IN ('scorm', 'h5p', 'video', 'pdf', 'pptx')),
  conteudo_programatico TEXT,
  observacoes TEXT,
  carga_horaria_inicial_horas REAL,
  carga_horaria_recorrente_horas REAL,
  pdf_r2_key TEXT,
  pptx_r2_key TEXT,
  pptx_slide_count INTEGER DEFAULT 0,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (qualificacao_tipo_id) REFERENCES qualificacoes_tipos(id)
);

INSERT INTO lms_cursos_bootstrap_v341 (
  id,
  empresa_id,
  titulo,
  descricao,
  categoria,
  carga_horaria_minutos,
  idioma,
  thumbnail_r2_key,
  scorm_versao,
  scorm_package_r2_prefix,
  scorm_launch_file,
  scorm_mastery_score,
  qualificacao_tipo_id,
  gerar_qualificacao_ao_concluir,
  ativo,
  publicado,
  version_tag,
  created_at,
  updated_at,
  deleted_at,
  tipo_conteudo,
  conteudo_programatico,
  observacoes,
  carga_horaria_inicial_horas,
  carga_horaria_recorrente_horas,
  pdf_r2_key,
  pptx_r2_key,
  pptx_slide_count
)
SELECT
  id,
  empresa_id,
  titulo,
  descricao,
  categoria,
  carga_horaria_minutos,
  idioma,
  thumbnail_r2_key,
  scorm_versao,
  scorm_package_r2_prefix,
  scorm_launch_file,
  scorm_mastery_score,
  qualificacao_tipo_id,
  gerar_qualificacao_ao_concluir,
  ativo,
  publicado,
  version_tag,
  created_at,
  updated_at,
  deleted_at,
  tipo_conteudo,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  0
FROM lms_cursos;

DROP TABLE lms_cursos;
ALTER TABLE lms_cursos_bootstrap_v341 RENAME TO lms_cursos;

DROP TRIGGER IF EXISTS trg_lms_cursos_updated_at;
CREATE TRIGGER trg_lms_cursos_updated_at
AFTER UPDATE ON lms_cursos
FOR EACH ROW
BEGIN
  UPDATE lms_cursos SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE INDEX IF NOT EXISTS idx_lms_cursos_empresa_publicado
  ON lms_cursos (empresa_id, publicado, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lms_cursos_empresa_categoria
  ON lms_cursos (empresa_id, categoria)
  WHERE deleted_at IS NULL AND ativo = 1;

CREATE INDEX IF NOT EXISTS idx_lms_cursos_qualificacao_tipo
  ON lms_cursos (qualificacao_tipo_id)
  WHERE deleted_at IS NULL;

PRAGMA foreign_keys = ON;
SQL
}

ensure_local_admin_mapping() {
  sql "INSERT OR IGNORE INTO usuarios (email, password_hash, nome, perfil, active, created_at, updated_at) VALUES ('$LOGIN_EMAIL', 'dev-local-bypass', 'Admin DEV Local', 'ADMIN', 1, datetime('now'), datetime('now'));"

  local user_id
  user_id="$(sql "SELECT id FROM usuarios WHERE email = '$LOGIN_EMAIL' LIMIT 1;")"
  if [[ -z "$user_id" ]]; then
    echo "Failed to create or locate local admin user." >&2
    exit 1
  fi

  sql "UPDATE usuarios SET active = 1, perfil = 'ADMIN', updated_at = datetime('now') WHERE id = $user_id;"
  sql "INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, is_primary, role) VALUES ($user_id, $EMPRESA_ID, 1, 'admin');"
  sql "UPDATE usuarios_empresas SET is_primary = CASE WHEN empresa_id = $EMPRESA_ID THEN 1 ELSE 0 END WHERE usuario_id = $user_id;"
}

ensure_local_lms_schema
ensure_local_admin_mapping

curl -fsS "$API_BASE/health" >/dev/null

QUALIFICACAO_ID="$(sql "SELECT COALESCE((SELECT id FROM qualificacoes_tipos WHERE empresa_id = $EMPRESA_ID AND id = $PREFERRED_QUALIFICACAO_ID AND deleted_at IS NULL), (SELECT id FROM qualificacoes_tipos WHERE empresa_id = $EMPRESA_ID AND deleted_at IS NULL AND UPPER(TRIM(COALESCE(categoria, ''))) IN ('EAD', 'TREINAMENTO EAD') ORDER BY id LIMIT 1));")"
FUNCIONARIO_ID="$(sql "SELECT COALESCE((SELECT id FROM funcionarios WHERE empresa_id = $EMPRESA_ID AND deleted_at IS NULL AND ativo = 1 AND id = $PREFERRED_FUNCIONARIO_ID), (SELECT id FROM funcionarios WHERE empresa_id = $EMPRESA_ID AND deleted_at IS NULL AND ativo = 1 ORDER BY id LIMIT 1));")"
CURSO_ID="$(sql "SELECT id FROM lms_cursos WHERE empresa_id = $EMPRESA_ID AND deleted_at IS NULL AND qualificacao_tipo_id = $QUALIFICACAO_ID AND tipo_conteudo = 'pdf' ORDER BY id LIMIT 1;")"

if [[ -z "$QUALIFICACAO_ID" || -z "$FUNCIONARIO_ID" ]]; then
  echo "Required local LMS seed dependencies not found (qualification or employee)." >&2
  exit 1
fi

QUALIFICACAO_NOME="$(sql "SELECT REPLACE(nome, '''', '') FROM qualificacoes_tipos WHERE id = $QUALIFICACAO_ID;")"
CURSO_TITULO="${AIRTRUST_LMS_CURSO_TITULO:-$QUALIFICACAO_NOME · PDF}"

LOGIN_RESPONSE="$(curl -fsS -X POST "$API_BASE/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$LOGIN_EMAIL\",\"senha\":\"$LOGIN_PASSWORD\"}")"
TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | json_get data.accessToken)"

COURSE_PAYLOAD="$(node -e '
  const title = process.argv[1];
  const qualificationId = Number(process.argv[2]);
  process.stdout.write(JSON.stringify({
    titulo: title,
    descricao: "Seed local para validar o player PDF do LMS ponta a ponta.",
    categoria: "EAD",
    carga_horaria_minutos: 45,
    conteudo_programatico: "Leitura guiada do fluxo operacional e validacao do player PDF.",
    observacoes: "Curso seed gerado automaticamente para validacao local.",
    carga_horaria_inicial_horas: 1,
    carga_horaria_recorrente_horas: 0.75,
    qualificacao_tipo_id: qualificationId,
    gerar_qualificacao_ao_concluir: 1,
    scorm_mastery_score: 70,
    tipo_conteudo: "pdf",
    publicado: 1,
    ativo: 1
  }));
' "$CURSO_TITULO" "$QUALIFICACAO_ID")"

if [[ -n "$CURSO_ID" ]]; then
  curl -fsS -X PUT "$API_BASE/lms/cursos/$CURSO_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$COURSE_PAYLOAD" >/dev/null
else
  COURSE_RESPONSE="$(curl -fsS -X POST "$API_BASE/lms/cursos" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$COURSE_PAYLOAD")"
  CURSO_ID="$(printf '%s' "$COURSE_RESPONSE" | json_get data.id)"
fi

curl -fsS -X POST "$API_BASE/lms/cursos/$CURSO_ID/upload/pdf" \
  -H "Authorization: Bearer $TOKEN" \
  -F "arquivo=@$PDF_FILE;type=application/pdf" >/dev/null

MATRICULA_ID="$(sql "SELECT id FROM lms_matriculas WHERE empresa_id = $EMPRESA_ID AND curso_id = $CURSO_ID AND funcionario_id = $FUNCIONARIO_ID AND deleted_at IS NULL AND status != 'CANCELADO' ORDER BY id DESC LIMIT 1;")"

if [[ -z "$MATRICULA_ID" ]]; then
  MATRICULA_RESPONSE="$(curl -fsS -X POST "$API_BASE/lms/matriculas" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"curso_id\":$CURSO_ID,\"funcionario_id\":$FUNCIONARIO_ID,\"observacoes\":\"Seed local LMS PDF\"}")"
  MATRICULA_ID="$(printf '%s' "$MATRICULA_RESPONSE" | json_get data.id)"
fi

echo "DB_PATH=$DB_PATH"
echo "EMPRESA_ID=$EMPRESA_ID"
echo "QUALIFICACAO_ID=$QUALIFICACAO_ID"
echo "FUNCIONARIO_ID=$FUNCIONARIO_ID"
echo "CURSO_ID=$CURSO_ID"
echo "MATRICULA_ID=$MATRICULA_ID"
echo "PLAYER_URL=http://localhost:3000/lms/player/pdf/$MATRICULA_ID"
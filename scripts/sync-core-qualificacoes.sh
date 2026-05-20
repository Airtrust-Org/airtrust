#!/usr/bin/env bash
set -euo pipefail

# Sincroniza subconjunto essencial de tabelas para tela de qualificações
# Tabelas: funcionarios, qualificacoes_tipos, qualificacoes_historico, certificados, qualificacoes_categorias

REMOTE_DB="airtrust-db"
LOCAL_DB="DB"
WORKER_DIR="$(cd "$(dirname "$0")/.." && pwd)/worker-airtrust"
STATE_ROOT="$WORKER_DIR/.wrangler/state/v3/d1"
TARGET_DIR="$STATE_ROOT/airtrust-local-fixed.sqlite"
mkdir -p "$TARGET_DIR"

TABLES=("certificados" "qualificacoes_categorias")

cd "$WORKER_DIR"

echo "🚀 Sync core qualificações"

echo "🧱 Garantindo schemas mínimos locais"
npx wrangler d1 execute "$LOCAL_DB" --local --command "CREATE TABLE IF NOT EXISTS funcionarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, matricula TEXT UNIQUE, deleted_at TEXT)" >/dev/null
npx wrangler d1 execute "$LOCAL_DB" --local --command "CREATE TABLE IF NOT EXISTS qualificacoes_tipos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, codigo TEXT UNIQUE, categoria TEXT, deleted_at TEXT)" >/dev/null
npx wrangler d1 execute "$LOCAL_DB" --local --command "CREATE TABLE IF NOT EXISTS qualificacoes_historico (id INTEGER PRIMARY KEY AUTOINCREMENT, funcionario_id INTEGER, qualificacao_id INTEGER, categoria TEXT, validade TEXT, codigo TEXT, numero_certificado TEXT, created_at TEXT DEFAULT (datetime('now')), deleted_at TEXT)" >/dev/null
npx wrangler d1 execute "$LOCAL_DB" --local --command "CREATE TABLE IF NOT EXISTS certificados (id INTEGER PRIMARY KEY AUTOINCREMENT, habilitacao_id INTEGER, funcionario_id INTEGER, qualificacao_id INTEGER, arquivo_url TEXT, arquivo_nome TEXT, arquivo_tamanho INTEGER, arquivo_hash TEXT, numero_certificado TEXT UNIQUE, tipo TEXT, data_emissao TEXT, data_vencimento TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT)" >/dev/null
npx wrangler d1 execute "$LOCAL_DB" --local --command "CREATE TABLE IF NOT EXISTS qualificacoes_categorias (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, codigo TEXT NOT NULL UNIQUE, descricao TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT, cor TEXT DEFAULT '#6B7280', ativo INTEGER DEFAULT 1)" >/dev/null

# Seed mínimo se vazio
COUNT_FUNC=$(npx wrangler d1 execute "$LOCAL_DB" --local --json --command "SELECT COUNT(*) as c FROM funcionarios" 2>/dev/null | python3 -c 'import json,sys; j=json.load(sys.stdin); print(j[0]["results"][0]["c"])' || echo 0)
if [ "${COUNT_FUNC}" = "0" ]; then
  echo "🌱 Seed funcionarios mínimo"
  npx wrangler d1 execute "$LOCAL_DB" --local --command "INSERT INTO funcionarios (nome, matricula) VALUES ('Dev Usuário','DEV001'),('Piloto Exemplo','PIL001')" >/dev/null
fi

# Importar dados (apenas tabelas remotas existentes, outras ficam com seed mínimo)
for T in "${TABLES[@]}"; do
  echo "📥 Dados $T"
  DATA_RAW=$(npx wrangler d1 execute "$REMOTE_DB" --remote --json --command "SELECT * FROM $T WHERE deleted_at IS NULL LIMIT 2000" 2>/dev/null || true)
  if [ -z "$DATA_RAW" ]; then
  echo "⚠️ Remoto sem resposta para $T (pular)"
  continue
  fi
    TMP_SQL=$(mktemp)
  echo "$DATA_RAW" | TABLE_NAME="$T" python3 - <<'PY' > "$TMP_SQL"
import json,sys,os
try:
    payload=json.load(sys.stdin)
except Exception:
    sys.exit(0)
if not isinstance(payload,list) or not payload:
    sys.exit(0)
results=payload[0].get('results',[])
if not results:
    sys.exit(0)
cols=list(results[0].keys())
T=os.environ.get('TABLE_NAME')
print('BEGIN TRANSACTION;')
for r in results:
    vals=[]
    for c in cols:
        v=r[c]
        if v is None:
            vals.append('NULL')
        elif isinstance(v,(int,float)):
            vals.append(str(v))
        else:
            vals.append("'"+str(v).replace("'","''")+"'")
    print(f"INSERT OR IGNORE INTO {T} ({','.join(cols)}) VALUES ({','.join(vals)});")
print('COMMIT;')
PY
    if [ -s "$TMP_SQL" ]; then
    npx wrangler d1 execute "$LOCAL_DB" --local --file "$TMP_SQL" >/dev/null || true
    npx wrangler d1 execute "$LOCAL_DB" --local --command "SELECT COUNT(*) AS total FROM $T" || true
    else
    echo "-- Sem dados para $T"
    fi
    rm -f "$TMP_SQL"
  echo "----"
done

echo "🔁 Reiniciando worker (persistência)"
 pkill -f "wrangler dev" || true
 sleep 2
 nohup npx wrangler dev --port 8787 --persist-to "$TARGET_DIR" </dev/null >/tmp/wrangler-core-sync.log 2>&1 &
 sleep 6
 if lsof -nP -iTCP:8787 | grep LISTEN >/dev/null; then echo "✅ Worker ativo"; else echo "❌ Worker falhou"; tail -n 40 /tmp/wrangler-core-sync.log; fi

echo "🧪 Teste rápido historico qualificacoes"
curl -s "http://localhost:8787/api/qualificacoes/historico?limit=5&minimal=true" | head -c 800

echo "🎉 Sync core concluído"

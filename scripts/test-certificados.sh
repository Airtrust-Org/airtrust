#!/usr/bin/env bash
set -euo pipefail

API_BASE="http://localhost:8787/api"
FUNC_HIST_ID="1" # assumindo seed criada
LOGIN_EMAIL="admin@airtrust.com"
LOGIN_SENHA="Admin@123"

echo "🔐 Obtendo token de desenvolvimento..."
RAW_LOGIN=$(curl -s -X POST "$API_BASE/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$LOGIN_EMAIL\",\"senha\":\"$LOGIN_SENHA\"}") || { echo "❌ Falha login"; exit 1; }
TOKEN=$(printf '%s' "$RAW_LOGIN" | python3 -c 'import sys,json; j=json.load(sys.stdin); print(j.get("data",{}).get("accessToken",""))')
if [ -z "$TOKEN" ]; then
	echo "❌ Token vazio"
	echo "$RAW_LOGIN" | python3 -m json.tool || true
	exit 1
fi
echo "✅ Token obtido (${#TOKEN} chars)"

echo "🧾 Gerando certificado (PDF) e persistindo..."
curl -s -H "Authorization: Bearer $TOKEN" -X POST "$API_BASE/qualificacoes/historico/$FUNC_HIST_ID/gerar-certificado" -o generated.pdf -D headers.txt || { echo "❌ Falha gerar"; exit 1; }
CERT_ID=$(grep -i 'X-Certificado-Id:' headers.txt | awk '{print $2}' | tr -d '\r')
echo "✅ Certificado gerado (ID: ${CERT_ID:-desconhecido}) tamanho $(wc -c < generated.pdf) bytes"

echo "📄 Listando certificados após geração..."
curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/qualificacoes/historico/$FUNC_HIST_ID/certificados" > list.json
COUNT_LIST=$(python3 - <<'PY'
import json; import sys
data=json.load(open('list.json'))
print(len(data.get('data',[])))
PY
)
echo "📦 Total certificados: $COUNT_LIST"

echo "🛠 Criando PDF dummy para upload..."
python3 - <<'PY'
with open('dummy.pdf','wb') as f:
		f.write(b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')
PY
echo "✅ dummy.pdf criado tamanho $(wc -c < dummy.pdf) bytes"

echo "⬆️ Upload de certificado dummy..."
curl -s -H "Authorization: Bearer $TOKEN" -F file=@dummy.pdf -F descricao='Dummy Upload' "$API_BASE/qualificacoes/historico/$FUNC_HIST_ID/upload-certificado" > upload.json || { echo "❌ Falha upload"; exit 1; }
echo "Upload response:"; python3 -m json.tool upload.json || true

echo "📄 Listando novamente certificados..."
curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/qualificacoes/historico/$FUNC_HIST_ID/certificados" > list2.json
COUNT_LIST2=$(python3 - <<'PY'
import json; data=json.load(open('list2.json'))
print(len(data.get('data',[])))
PY
)
echo "📦 Total após upload: $COUNT_LIST2"

echo "📥 Preparando download do primeiro certificado..."
DL_INFO=$(python3 - <<'PY'
import json; import sys
data=json.load(open('list2.json'))
first=(data.get('data') or [{}])[0]
print(first.get('url',''), first.get('nome_arquivo','download.pdf'))
PY
)
R2_PATH=$(echo "$DL_INFO" | awk '{print $1}')
R2_NAME=$(echo "$DL_INFO" | awk '{print $2}')
if [ -n "$R2_PATH" ]; then
	echo "🔽 Baixando $R2_PATH ..."
	curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/r2/$R2_PATH" -o downloaded.pdf || echo "⚠️ Falha download"
	echo "✅ Download concluído tamanho $(wc -c < downloaded.pdf 2>/dev/null || echo 0) bytes"
else
	echo "⚠️ Nenhum certificado para download"
fi

echo "🎯 RESUMO"
echo " Token chars: ${#TOKEN}"
echo " Gerado ID: ${CERT_ID:-n/a}"
echo " Lista inicial: $COUNT_LIST"
echo " Lista final: $COUNT_LIST2"
echo " Arquivo gerado: generated.pdf ($(wc -c < generated.pdf) bytes)"
if [ -f downloaded.pdf ]; then echo " Arquivo baixado: downloaded.pdf ($(wc -c < downloaded.pdf) bytes)"; fi
echo "✅ Fluxo completo finalizado"
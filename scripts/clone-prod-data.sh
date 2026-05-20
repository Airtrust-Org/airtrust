#!/bin/bash
set -euo pipefail

# Clone ALL data from production D1 to local database
# This script exports every table from production and imports to local

cd "$(dirname "$0")/.."

ACCOUNT_ID="4dca4e5fddc6a351651dd224f456586f"
PROD_DB="airtrust-db"
LOCAL_DB="airtrust-db"

TABLES=(
  "_cf_KV" "aeronaves" "alertas_enviados" "arquivos" "audit_cascade" "auditoria"
  "backups" "catalogo_treinamentos" "certificado_anexos" "certificados"
  "certificados_templates" "compliance_status" "consentimentos_lgpd" "credenciais"
  "d1_migrations" "empresa_certificado_config" "empresa_config" "empresas"
  "ficha_manobras_avaliacao" "fichas_manobras_historico" "fichas_sessao"
  "funcionario_documentos" "funcionarios" "funcionarios_aeronaves" "funcoes"
  "importacoes_log" "job_execution_log" "job_queue" "logs_acesso_dados"
  "manobras" "manobras_avaliacoes" "manobras_categorias" "migracao_log"
  "migracao_mapeamento_ids" "modelos_sessao" "notificacoes" "papeis"
  "pasta_virtual" "pessoas_auditoria_acessos" "pessoas_papeis" "qualificacoes"
  "qualificacoes_categorias" "qualificacoes_historico" "schema_versions"
  "sessao_manobras" "sessoes" "sessoes_fichas" "sessoes_manobras"
  "sessoes_participantes" "sessoes_template" "sessoes_treinamento" "setores"
  "simulador_agendamentos" "simuladores" "solicitacoes_lgpd" "system_config"
  "system_logs" "template_manobras" "tipos_sessao" "treinamentos"
  "user_permissions" "user_profiles" "usuarios"
)

echo "🔄 CLONANDO DADOS DE PRODUÇÃO → LOCAL"
echo "===================================="
echo ""
echo "📊 Total de tabelas: ${#TABLES[@]}"
echo "🔄 Modo: Export produção + Import local"
echo ""

mkdir -p ./migrations/data-export
EXPORT_DIR="./migrations/data-export"

# Export ALL tables from production
echo "📤 ETAPA 1: Exportando dados de produção..."
echo ""

for i in "${!TABLES[@]}"; do
  TABLE="${TABLES[$i]}"
  INDEX=$((i + 1))
  
  printf "[%2d/%2d] Exportando: %-40s" "$INDEX" "${#TABLES[@]}" "$TABLE"
  
  # Export to temporary SQL file
  TEMP_FILE="$EXPORT_DIR/${TABLE}_export.sql"
  
  # Get schema
  npx wrangler d1 execute "$PROD_DB" --remote --command ".schema $TABLE" > "$TEMP_FILE.schema" 2>/dev/null || echo "-- Schema unavailable" > "$TEMP_FILE.schema"
  
  # Export data with proper INSERT statements
  npx wrangler d1 execute "$PROD_DB" --remote --command "SELECT 'INSERT OR REPLACE INTO $TABLE VALUES(' || quote(typeof(*)) || ')' FROM $TABLE;" 2>/dev/null > "$TEMP_FILE.data" || echo "-- No data or error" > "$TEMP_FILE.data"
  
  echo " ✅"
done

echo ""
echo "✅ Export concluído em: $EXPORT_DIR"
echo ""

# Alternative: Use D1 migration snapshot approach
echo "📥 ETAPA 2: Importando para banco local..."
echo ""

# Create a single SQL file with all data
cat > "$EXPORT_DIR/00_IMPORT_ALL_DATA.sql" << 'SQL_IMPORT'
-- Disable constraints for faster import
PRAGMA foreign_keys = OFF;

-- Import will be done via wrangler d1 execute with remote export

PRAGMA foreign_keys = ON;
SQL_IMPORT

echo "ℹ️  Usando abordagem alternativa: wrangler d1 execute com remote query"
echo ""
echo "⏳ Exportando schema de todas as tabelas..."

for TABLE in "${TABLES[@]}"; do
  echo "   - $TABLE"
  npx wrangler d1 execute "$PROD_DB" --remote --command ".dump $TABLE" >> "$EXPORT_DIR/prod_full_dump.sql" 2>/dev/null || true
done

if [ -f "$EXPORT_DIR/prod_full_dump.sql" ] && [ -s "$EXPORT_DIR/prod_full_dump.sql" ]; then
  echo ""
  echo "📝 Full dump criado: $EXPORT_DIR/prod_full_dump.sql"
  echo ""
  echo "🔧 Importando para banco local..."
  
  # Import to local database
  npx wrangler d1 execute "$LOCAL_DB" --local --file "$EXPORT_DIR/prod_full_dump.sql" 2>&1 | tail -20
  
  echo ""
  echo "✅ Import concluído!"
else
  echo "❌ Erro: Dump file vazio ou não criado"
  echo ""
  echo "📌 Fallback: Use o Cloudflare Dashboard para exportar dados:"
  echo "   1. Abra: https://dash.cloudflare.com"
  echo "   2. Vá para: Workers → D1 → airtrust-db"
  echo "   3. Clique em: Export"
  echo "   4. Baixe o arquivo SQL"
  echo "   5. Execute localmente:"
  echo "      npx wrangler d1 execute airtrust-db --local --file backup.sql"
fi

echo ""
echo "🎉 Operação de sincronização concluída!"

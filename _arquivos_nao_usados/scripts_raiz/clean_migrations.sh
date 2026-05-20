#!/bin/bash

# Script para limpar migrations obsoletas
# Mantém apenas as essenciais e funcionais

echo "🧹 LIMPEZA DE MIGRATIONS"
echo "========================"
echo ""

cd migrations

# Criar pasta de backup
mkdir -p ../migrations_backup
echo "📦 Criando backup em migrations_backup/"

# Contador
REMOVED=0
KEPT=0

# MANTER: Migrations essenciais
KEEP=(
    "2000_fix_usuarios_production.sql"
    "2001_create_missing_tables.sql"
    "1010_qualificacoes_schema_fix.sql"
    "1011_importacoes_log.sql"
    "1012_add_codigo_qualificacoes.sql"
    "1013_funcionarios_schema_definitivo.sql"
    "1015_cascade_delete.sql"
    "1016_lgpd_compliance.sql"
    "1020_unificar_qualificacoes.sql"
    "1021_unificar_qualificacoes_fixed.sql"
    "1022_unificar_qualificacoes_final.sql"
    "1023_add_superseded_field.sql"
    "1024_prevent_duplicates.sql"
    "1025_tipos_qualificacoes.sql"
    "1027_atualizar_nomes_existentes.sql"
    "1028_atualizar_nomes_tipos.sql"
    "1029_create_certificados.sql"
    "1030_add_compression_fields.sql"
)

# Função para verificar se deve manter
should_keep() {
    local file="$1"
    
    # Já está desabilitada
    if [[ "$file" == *.disabled ]]; then
        return 1
    fi
    
    # Está na lista de manter
    for keep in "${KEEP[@]}"; do
        if [ "$file" == "$keep" ]; then
            return 0
        fi
    done
    
    return 1
}

# Processar todos os arquivos
for file in *.sql *.disabled; do
    if [ -f "$file" ]; then
        if should_keep "$file"; then
            echo "✅ MANTER: $file"
            ((KEPT++))
        else
            echo "❌ REMOVER: $file"
            mv "$file" "../migrations_backup/"
            ((REMOVED++))
        fi
    fi
done

echo ""
echo "📊 RESULTADO:"
echo "  ✅ Mantidas: $KEPT migrations"
echo "  ❌ Removidas: $REMOVED migrations"
echo "  📦 Backup em: migrations_backup/"
echo ""
echo "✅ LIMPEZA CONCLUÍDA!"

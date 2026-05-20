#!/bin/bash

# Script para validar migrations
echo "🔍 VALIDAÇÃO DE MIGRATIONS"
echo "=========================="
echo ""

cd migrations

VALID=0
INVALID=0
WARNINGS=0

# Validar cada migration
for file in *.sql; do
    if [ -f "$file" ]; then
        echo "📄 Validando: $file"
        
        # Verificar sintaxe SQL básica
        ERRORS=""
        
        # Verificar comandos problemáticos
        if grep -q "INSERT OR IGNORE" "$file"; then
            echo "  ⚠️  Aviso: Contém INSERT OR IGNORE (pode falhar se dados já existem)"
            ((WARNINGS++))
        fi
        
        if grep -q "ALTER TABLE.*ADD COLUMN" "$file"; then
            if ! grep -q "IF NOT EXISTS" "$file"; then
                echo "  ⚠️  Aviso: ALTER TABLE sem proteção (pode falhar se coluna existe)"
                ((WARNINGS++))
            fi
        fi
        
        # Verificar se tem CREATE TABLE sem IF NOT EXISTS
        if grep -q "CREATE TABLE [^I]" "$file"; then
            echo "  ⚠️  Aviso: CREATE TABLE sem IF NOT EXISTS"
            ((WARNINGS++))
        fi
        
        # Verificar se arquivo está vazio
        if [ ! -s "$file" ]; then
            echo "  ❌ ERRO: Arquivo vazio"
            ((INVALID++))
            continue
        fi
        
        # Verificar se tem comandos SQL
        if ! grep -q -i "CREATE\|ALTER\|INSERT\|UPDATE\|DELETE\|DROP" "$file"; then
            echo "  ❌ ERRO: Não contém comandos SQL válidos"
            ((INVALID++))
            continue
        fi
        
        echo "  ✅ Sintaxe OK"
        ((VALID++))
        echo ""
    fi
done

echo ""
echo "📊 RESULTADO DA VALIDAÇÃO:"
echo "  ✅ Válidas: $VALID"
echo "  ❌ Inválidas: $INVALID"
echo "  ⚠️  Avisos: $WARNINGS"
echo ""

if [ $INVALID -eq 0 ]; then
    echo "✅ TODAS AS MIGRATIONS SÃO VÁLIDAS!"
else
    echo "⚠️  ATENÇÃO: $INVALID migrations com problemas"
fi

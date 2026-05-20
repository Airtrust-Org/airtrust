#!/bin/bash

# Script para auditar schema de todas as tabelas

echo "=== AUDITORIA DE SCHEMA - TODAS AS TABELAS ==="
echo ""

# Tabelas principais do sistema
TABLES=(
  "funcionarios"
  "qualificacoes"
  "tipos_qualificacao"
  "checks"
  "exames"
  "treinamentos"
  "historico_certificacoes_v2"
  "sessoes_simulador"
  "sessoes_participantes"
  "sessoes_manobras"
  "avaliacoes_manobras"
  "agendamentos_simulador"
  "simuladores"
  "manobras"
  "categorias_manobras"
  "modelos_sessao"
  "modelos_sessao_manobras"
  "aeronaves"
  "empresas"
  "catalogo_treinamentos"
)

echo "Tabelas a auditar: ${#TABLES[@]}"
echo ""

for table in "${TABLES[@]}"; do
  echo "### TABELA: $table"
  grep -r "CREATE TABLE.*$table" migrations/ 2>/dev/null | head -1
  echo ""
done

echo ""
echo "=== BUSCAR COLUNAS PROBLEMÁTICAS ==="
echo ""

echo "Arquivos com data_realizacao:"
grep -r "data_realizacao" src/ --include="*.ts" --include="*.tsx" | wc -l

echo "Arquivos com data_validade:"
grep -r "data_validade" src/ --include="*.ts" --include="*.tsx" | wc -l

echo "Arquivos com data_conclusao:"
grep -r "data_conclusao" src/ --include="*.ts" --include="*.tsx" | wc -l

echo "Arquivos com data_vencimento:"
grep -r "data_vencimento" src/ --include="*.ts" --include="*.tsx" | wc -l

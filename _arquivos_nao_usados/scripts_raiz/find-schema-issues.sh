#!/bin/bash

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  🔍 AUDITORIA PROFUNDA: Buscando divergências no schema   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Lista de tabelas REAIS no banco
TABELAS=(
    "agendamentos_simulador"
    "fichas_sessao"
    "fichas"
    "funcionarios"
    "simuladores"
    "manobras"
    "categoriasmanobras"
    "sessoes_template"
    "qualificacoes"
    "habilitacoes"
    "certificados"
    "aeronaves"
    "funcionarios_aeronaves"
    "checks"
    "ficha_manobras_avaliacao"
    "avaliacoes_manobras"
)

echo "🔎 PROCURANDO DIVERGÊNCIAS - Estou verificando cada tabela..."
echo ""

# Procurar por variações incorretas de nomes de tabelas
echo "PADRÕES INCORRETOS PROCURADOS:"
echo "─────────────────────────────────────────"

# agendamentos_simulador vs simuladores_agendamento
echo "❓ 'agendamentos_simulador' vs 'simuladores_agendamento':"
grep -rn "simuladores_agendamento\|simulador_agendamento" src/worker/api/v2/ 2>/dev/null | head -5

# fichas vs fichas_sessao
echo "❓ 'fichas' vs 'fichas_sessao':"
grep -rn "fichas_sessao" src/worker/api/v2/ 2>/dev/null | head -5

# manobras vs manobra
echo "❓ 'manobras' vs 'manobra' (singular):"
grep -rn "FROM manobra[^s]" src/worker/api/v2/ 2>/dev/null | head -5

# Procurar por nomes com underscores errados
echo ""
echo "PADRÕES DE COLUNAS INCORRETAS:"
echo "─────────────────────────────────────────"

echo "❓ 'e_instrutor' vs 'is_instrutor':"
grep -rn "e_instrutor" src/worker/api/v2/ 2>/dev/null | head -5

echo "❓ 'categoria_id' vs 'categoriaid':"
grep -rn "categoria_id" src/worker/api/v2/ 2>/dev/null | head -5

echo "❓ 'data_agendamento' vs 'data':"
grep -rn "data_agendamento\|data_inicio\|data_fim" src/worker/api/v2/ 2>/dev/null | head -5


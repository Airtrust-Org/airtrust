#!/bin/bash
# ============================================
# INSPEÇÃO DETALHADA SSOT - Diagnóstico Completo
# ============================================
set -e

DB_NAME="airtrust-db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="inspecao_ssot_${TIMESTAMP}.md"

echo "# Inspeção SSOT AirTrust - ${TIMESTAMP}" > "$REPORT_FILE"
echo "=========================================" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

append_query() {
  local title="$1"; shift
  echo "## ${title}" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  wrangler d1 execute "$DB_NAME" --remote --command "$*" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
}

# 1. Estado da Tabela
append_query "1. Estado da Tabela qualificacoes_historico" "SELECT 'Total Registros' as metrica, COUNT(*) as valor FROM qualificacoes_historico WHERE deleted_at IS NULL UNION ALL SELECT 'Com funcionario_id', COUNT(*) FROM qualificacoes_historico WHERE funcionario_id IS NOT NULL AND deleted_at IS NULL UNION ALL SELECT 'Com qualificacao_id', COUNT(*) FROM qualificacoes_historico WHERE qualificacao_id IS NOT NULL AND deleted_at IS NULL UNION ALL SELECT 'Com tipo_codigo', COUNT(*) FROM qualificacoes_historico WHERE tipo_codigo IS NOT NULL AND deleted_at IS NULL UNION ALL SELECT 'Com codigo', COUNT(*) FROM qualificacoes_historico WHERE codigo IS NOT NULL AND deleted_at IS NULL UNION ALL SELECT 'Com categoria', COUNT(*) FROM qualificacoes_historico WHERE categoria IS NOT NULL AND deleted_at IS NULL UNION ALL SELECT 'Com numero_certificado', COUNT(*) FROM qualificacoes_historico WHERE numero_certificado IS NOT NULL AND deleted_at IS NULL UNION ALL SELECT 'Com data_vencimento', COUNT(*) FROM qualificacoes_historico WHERE data_vencimento IS NOT NULL AND deleted_at IS NULL;"

# 2. Amostra
append_query "2. Amostra de Dados (Primeiros 10 Registros)" "SELECT id, funcionario_id, qualificacao_id, tipo_codigo, codigo, categoria, numero_certificado, data_vencimento, SUBSTR(created_at,1,10) as data_criacao FROM qualificacoes_historico WHERE deleted_at IS NULL ORDER BY id LIMIT 10;"

# 3. Distribuição de Tipos
append_query "3. Distribuição de Tipos de Qualificação" "SELECT qt.id as tipo_id, qt.codigo, qt.nome, qt.categoria, COUNT(qh.id) as total_registros, (qt.deleted_at IS NOT NULL) as tipo_deletado FROM qualificacoes_historico qh LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id WHERE qh.deleted_at IS NULL GROUP BY qt.id, qt.codigo, qt.nome, qt.categoria ORDER BY total_registros DESC LIMIT 20;"

# 4. Funcionários
append_query "4. Funcionários com Qualificações" "SELECT f.id, f.nome, f.matricula, COUNT(qh.id) as total_qualificacoes FROM qualificacoes_historico qh JOIN funcionarios f ON qh.funcionario_id = f.id WHERE qh.deleted_at IS NULL AND f.deleted_at IS NULL GROUP BY f.id, f.nome, f.matricula ORDER BY total_qualificacoes DESC LIMIT 10;"

# 5. Órfãos
append_query "5. Registros Órfãos (Sem FK Válida)" "SELECT 'Órfãos Funcionários' as tipo, COUNT(*) as total FROM qualificacoes_historico qh WHERE qh.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM funcionarios f WHERE f.id = qh.funcionario_id AND f.deleted_at IS NULL) UNION ALL SELECT 'Órfãos Tipos', COUNT(*) FROM qualificacoes_historico qh WHERE qh.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM qualificacoes_tipos qt WHERE qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL);"

# 6. View
append_query "6. Dados na View (qualificacoes_historico_v)" "SELECT id, funcionario_nome, qualificacao_codigo, qualificacao_nome, qualificacao_categoria, numero_certificado, data_vencimento, status_qualificacao FROM qualificacoes_historico_v LIMIT 5;"

# 7. Backups
append_query "7. Tabelas de Backup Disponíveis" "SELECT name, type FROM sqlite_master WHERE type='table' AND name LIKE '%backup%' ORDER BY name;"

# 8. Auditoria (tolerar ausência)
echo "## 8. Últimas Operações (Auditoria)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
if wrangler d1 execute "$DB_NAME" --remote --command "SELECT tabela, acao, COUNT(*) as total, MAX(timestamp) as ultima_ocorrencia FROM auditoria_avancada_v2 WHERE timestamp > datetime('now','-7 days') AND tabela IN ('qualificacoes_historico','qualificacoes_tipos','system_enrichment','system_migration') GROUP BY tabela, acao ORDER BY ultima_ocorrencia DESC;" >> "$REPORT_FILE" 2>/dev/null; then
  echo "" >> "$REPORT_FILE"
else
  echo "(View auditoria_avancada_v2 não encontrada)" >> "$REPORT_FILE"
fi

# 9. Schema
append_query "9. Schema Atual da Tabela" "PRAGMA table_info(qualificacoes_historico);"

# 10. Conclusão
cat >> "$REPORT_FILE" <<'EOT'
## 10. Diagnóstico e Recomendações

### Problemas Potenciais:
- Dados genéricos (tipo_codigo/codigo convergindo para GEN_*)
- Possíveis FKs nulas ou tipo_id único dominante
- View pode estar exibindo fallback genérico

### Próximos Passos Sugeridos:
1. Validar diversidade de tipo_codigo/codigo; se baixa, procurar backup.
2. Restaurar dados ricos de backup se disponível.
3. Reaplicar view garantindo priorização de histórico.
4. Testar modal de edição após enriquecimento.

### Query Crítica Recomendada (já executar separadamente):
```sql
SELECT 'Total histórico', COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL;
```
EOT

echo "=========================================" >> "$REPORT_FILE"
echo "✅ Inspeção concluída!" >> "$REPORT_FILE"
echo "📄 Relatório salvo em: $REPORT_FILE" >> "$REPORT_FILE"

echo "✅ Relatório gerado: $REPORT_FILE"
echo "Para visualizar: cat $REPORT_FILE"

## Recuperação de Diversidade das Qualificações (Estado 2025-11-22)

### 1. Situação Inicial

- `qualificacoes_historico`: 522 registros colapsados em códigos genéricos (`GEN_TREINAMENTO` / `GEN_DESCONHECIDO`).
- `qualificacoes_tipos`: diversidade preservada (89 códigos distintos / 4 categorias).
- Backups `_backup_qualificacoes_historico` e `_backup_qualificacoes_tipos` não trazem mapeamento direto de IDs (nenhum overlap em `qualificacao_id`).
- Impossível reconstruir automaticamente cada linha histórica para seu tipo original por ausência total de chave de correlação.

### 2. Decisão de Arquitetura

Em vez de tentar heurísticas frágeis, adotou-se um fluxo explícito de reclassificação manual controlada:

1. Criar fila de reclassificação (`qualificacoes_historico_reclass_queue`).
2. Popular com todos os históricos genéricos.
3. Fornecer mecanismo atômico de aplicação via trigger (`trg_apply_reclassification`).
4. Registrar auditoria de cada aplicação em `_data_recovery_log`.

### 3. Migration Implementada

Arquivo: `worker-airtrust/migrations/0090_reclass_queue.sql`
Conteúdo principal:

```sql
CREATE TABLE IF NOT EXISTS qualificacoes_historico_reclass_queue (...);
CREATE TRIGGER IF NOT EXISTS trg_apply_reclassification ...;
INSERT INTO qualificacoes_historico_reclass_queue SELECT ... (522 linhas);
```

Todos os 522 registros genéricos enfileirados com `status='PENDING'`.

### 4. Fluxo de Reclassificação (Operacional)

1. Operador escolhe um histórico (linha na view ou UI de administração).
2. Seleciona o `target_tipo_id` apropriado (proveniente de `qualificacoes_tipos`).
3. Atualiza a fila:
   ```sql
   UPDATE qualificacoes_historico_reclass_queue
   SET target_tipo_id = '<ID_DO_TIPO>', status='APPLIED', reason='Fonte: documento X'
   WHERE historico_id = <ID_HISTORICO>;
   ```
4. Trigger aplica atualização na linha de `qualificacoes_historico` (codigo, tipo_codigo, categoria, qualificacao_id) e grava log.

### 5. Consultas Úteis

Listar pendentes:

```sql
SELECT qhrq.historico_id, qhrq.current_codigo, qh.funcionario_id, qh.data_conclusao
FROM qualificacoes_historico_reclass_queue qhrq
JOIN qualificacoes_historico qh ON qh.id = qhrq.historico_id
WHERE qhrq.status='PENDING'
ORDER BY qh.data_conclusao DESC;
```

Auditoria aplicada:

```sql
SELECT * FROM _data_recovery_log WHERE etapa='APPLY_RECLASS' ORDER BY executed_at DESC;
```

Progresso:

```sql
SELECT
  COUNT(*) total,
  SUM(CASE WHEN status='PENDING' THEN 1 END) pendentes,
  SUM(CASE WHEN status='APPLIED' THEN 1 END) aplicadas
FROM qualificacoes_historico_reclass_queue;
```

### 6. Próximos Passos Recomendados

- Criar UI interna para reclassificação assistida (autocomplete dos tipos + filtros).
- Implementar sugestão heurística opcional futura (ex.: comparação por `observacoes`, `numero_certificado`, datas de conclusão agrupadas). Apenas como apoio, não automática.
- Exportar planilha de apoio para classificação off-line se necessário.
- Após cobertura >80%, rodar validação cruzada (consistência de validade_meses vs. tipo selecionado).

### 7. Limitações

- Sem fonte externa, a atribuição original por registro é irrecuperável automaticamente.
- A fila garante rastreabilidade e evita sobrescritas silenciosas.
- Processo exige curadoria humana ou dataset externo confiável.

### 8. Indicadores de Qualidade Pós-Reclassificação

- % de registros não genéricos.
- Distribuição por categoria real vs. esperada.
- Número médio de dias até vencimento por categoria (sanidade).
- Taxa de divergência entre `validade_meses` do tipo e a diferença real entre conclusão e vencimento armazenados.

### 9. Execução Confirmada

- Migration aplicada remotamente (wrangler) sem transação explícita (requisito D1).
- Fila populada: 522 pendentes.
- View `qualificacoes_historico_v` permanece válida (usa COALESCE sobre campos). Nenhuma alteração necessária imediata.

### 10. Ação Imediata Sugerida

Iniciar reclassificação dos 20 registros mais recentes para validar fluxo e ajustar UI antes de escala total.

---

`success: true`
`data: { queue_size: 522, diversidade_tipos: 89 }`
`code: RECUPERACAO_DIVERSIDADE_QUALIFICACOES_V1`

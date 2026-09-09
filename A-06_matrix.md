# A-06 Matrix: Índices Redundantes

## Categoria A (Exatamente Equivalentes no Schema Final Atual)

Comprovado por `scripts/schema-local.sql` (oficial de desenvolvimento/D1).

| Tabela | Índice a ser removido | Índice que permanecerá | UNIQUE | Sequência de Colunas | ASC/DESC | COLLATE | Expressão | WHERE | Evidência de Coexistência | Migration Origem (Sobrevivente) | Query Preflight |
|--------|-----------------------|------------------------|--------|----------------------|----------|---------|-----------|-------|---------------------------|--------------------------------|-----------------|
| `fichas_sessao` | `idx_fichas_instrutor` | `idx_fichas_sessao_instrutor` | NÃO | `instrutor_id` | ASC | - | - | - | Presentes no final schema | 0424 | `preflight_0490.sql` |
| `fichas_sessao` | `idx_fichas_sessao_empresa_id` | `idx_fichas_sessao_empresa` | NÃO | `empresa_id` | ASC | - | - | - | Presentes no final schema | 0424 | `preflight_0490.sql` |
| `modelos_sessao` | `idx_modelos_codigo` | `idx_modelos_sessao_codigo` | NÃO | `codigo` | ASC | - | - | - | Presentes no final schema | 0396 | `preflight_0490.sql` |
| `modelos_sessao` | `idx_modelos_deleted` | `idx_modelos_sessao_deleted` | NÃO | `deleted_at` | ASC | - | - | - | Presentes no final schema | 0396 | `preflight_0490.sql` |

**Nota**: Análises anteriores listavam dezenas de índices lendo o histórico bruto, mas quase todos já haviam sido destruídos por processos de `DROP TABLE` em recriações do banco. Esta matriz lista somente as coexistências reais confirmadas no banco descartável/snapshot final.

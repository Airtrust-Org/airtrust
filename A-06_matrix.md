# A-06 Matrix: Índices Redundantes

## Classificação final: ACCEPTED-DEBT

A auditoria histórica sugeriu vários índices redundantes. A reconciliação contra o bootstrap local canônico `scripts/schema-local.sql` reduziu o conjunto a quatro pares candidatos:

| Tabela | Candidato redundante | Índice equivalente no bootstrap local |
|---|---|---|
| `fichas_sessao` | `idx_fichas_instrutor` | `idx_fichas_sessao_instrutor` |
| `fichas_sessao` | `idx_fichas_sessao_empresa_id` | `idx_fichas_sessao_empresa` |
| `modelos_sessao` | `idx_modelos_codigo` | `idx_modelos_sessao_codigo` |
| `modelos_sessao` | `idx_modelos_deleted` | `idx_modelos_sessao_deleted` |

Isso é evidência do schema/bootstrap **local**, não prova suficiente de coexistência no schema remoto atual. Como A-06 é uma otimização P3 e não há defeito operacional demonstrado, a migration destrutiva 0490 foi retirada desta frente.

Qualquer cleanup futuro exige inventário read-only de `sqlite_master` no ambiente alvo e prova, para cada par, de mesma tabela, colunas/ordem, collation, expressão, filtro parcial e unicidade. Até lá, manter os índices é a opção de menor risco.

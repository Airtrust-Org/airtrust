
# Status 0487: qualificacoes_renovacoes

| Item | Status | Detalhes |
|------|--------|----------|
| **Estado Atual (Repositório)** | PRONTO | O arquivo `0487_qualificacoes_renovacoes.sql` está presente e com schema válido. |
| **Preflight** | INEXISTENTE | A migration cria tabela nova (CREATE TABLE IF NOT EXISTS), não exigindo preflight de dados existentes. É puramente aditiva. |
| **Ledger / Governança** | NÃO REGISTRADA | A migration 0487 não consta em `docs/migration-governance/all-migrations.txt`. |
| **Migration Preparada** | SIM | Migration `0487` está completa e idempotente. |
| **Testes** | APROVADO | Os testes em `qualificacoes-renovacoes-schema.test.ts` validam o contrato da tabela. |
| **Staging Recebeu?** | NÃO | Ausente em `d1-staging-migrations-before.txt` e `migrations-all.txt`. |
| **Produção Recebeu?** | NÃO | Ausente na governança principal. |
| **Pós-condições** | A DEFINIR | Confirmar que a tabela `qualificacoes_renovacoes` e índices (`idx_qualificacoes_renovacoes_historico`, `idx_qualificacoes_renovacoes_status_data`) foram criados nos respectivos ambientes após aplicação. |

**Conclusão**: O estado atual é **REMOTE_APPLY_PENDING**. Não há falsificação de fechamento. Permanece aguardando processo de governança para aplicação em Staging e Produção.

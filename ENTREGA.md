# Relatório de Execução - Residuais de Auditoria Schema (A-02, A-06, 0487)

O trabalho foi conduzido em uma branch isolada da `main` (\`chore/audit-schema-residuals-a02-a06-0487\`), com o rebase da branch mantendo a pureza canônica. A branch `/pilot` (migration 0488) não foi alterada.

## 0487 — `qualificacoes_renovacoes` (REMOTE_APPLY_PENDING)
- **Estado Atual**: A migration continua como **REMOTE_APPLY_PENDING**. Não foi aplicada no DB staging ou produção.
- **Pós-condições**: Script de leitura estrutural (\`scripts/validation/0487_qualificacoes_renovacoes_postconditions.sql\`) foi gerado fora da pasta de migrations canônica, seguindo as regras da governança, para verificação futura.
- **Testes**: A migration passa nos testes de contrato de schema (\`qualificacoes-renovacoes-schema.test.ts\`).

## A-02 — Natural Keys Tenant-Scoped
- **Status**: Preparada a migration **0489** (idempotente) aguardando liberação.
- **Preflight de Segurança**: Mapeados explicitamente no \`scripts/validation/0489_a02_natural_keys_tenant_scoped_preflight.sql\` (ausência de duplicatas em CPF, Matricula e Email, mantendo o COLLATE NOCASE).
- **Justificativa**: A tabela `funcionarios` perdeu seus índices globais UNIQUE para chaves naturais (`cpf`, `matricula`, `email`) na refatoração 0396 e nunca recuperou os índices `tenant-scoped` correspondentes. O hardening de `ux_qualificacoes_tipos_codigo` serve apenas para defesa perimetral caso existam bancos locais ou esquecidos com lixo, uma vez que o schema final descarta tal índice desde a 0402.
- **Testes Reais**: Escritos em DB descartável (`a02-a06-schema-residuals-db.test.ts`) ratificando que o constraint garante isolamento sem comprometer cross-tenant data e lida corretamente com NULLs/soft-deletes.

## A-06 — Índices Redundantes
- **Status**: Preparada a migration **0490** aguardando liberação.
- **Metodologia Exata**: Substituímos a análise de diretório histórico pela análise estática comprovada no \`scripts/schema-local.sql\` e reconstrução real (`a02-a06-schema-residuals-db.test.ts`). Isso evitou DROPs perigosos ou fantasma.
- **Achados**: Apenas 4 agrupamentos reais em categoria A (equivalência exata e ativa) coexistem atualmente. Exemplos: `idx_fichas_instrutor` e `idx_modelos_codigo`. O preflight (\`0490_a06_redundant_indexes_cleanup_preflight.sql\`) varre e exige a detecção de coexistência baseada no `sqlite_master`.
- **Testes Reais**: Executados localmente, garantindo idempotência e integridade, garantindo que o SQLite não rejeite foreign keys nem acuse degradação do schema.

## Qualidade e Governança
- `migration-governance.test.ts`: PASSED (ratchet ajustado).
- `guard-migrations-dir-purity`: PASSED.
- Nenhum script "preflight" foi mantido dentro de `worker-airtrust/migrations`. Eles se encontram em `scripts/validation/`.
- Testes Vitest adicionados garantindo o comportamento lógico de SQL real do D1/SQLite localmente.

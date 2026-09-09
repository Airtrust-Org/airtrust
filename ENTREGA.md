# Relatório de Execução - Residuais de Auditoria Schema (A-02, A-06, 0487)

O trabalho foi conduzido em uma branch isolada da `main` (\`chore/audit-schema-residuals-a02-a06-0487\`), sem interferir com a frente \`/pilot\` (migration 0488) ou reutilizar números de migrations.

## 0487 — \`qualificacoes_renovacoes\` (REMOTE_APPLY_PENDING)
O arquivo \`0487_qualificacoes_renovacoes.sql\` encontra-se no repositório criando a tabela e seus índices.
**Preflight**: Inexistente. A migration não altera dados, apenas cria uma nova tabela aditiva.
**Governança / Ledger**: Ausente nas listas oficiais do D1 staging/produção (\`docs/migration-governance\` e \`docs/staging-validation/\`). 
**Testes**: Garantidos por \`qualificacoes-renovacoes-schema.test.ts\` no repositório.
**Fechamento Seguro**: A migration continua como **REMOTE_APPLY_PENDING**. Foi gerado o artefato local de análise (\`0487_status.md\`) sem forçar aplicação ou falsificar o estado de entrega.

## A-02 — Natural Keys Tenant-Scoped
Realizado um inventário minucioso. 
**Achados**: 
- O indício de \`ux_qualificacoes_tipos_codigo\` (0116) conviver com a restrição correta da 0462 pode ser real caso o D1 não execute o cascateamento de \`DROP TABLE\` que ocorreu na wave 4. Como segurança, a remoção explícita foi definida.
- A tabela \`funcionarios\` perdeu seus índices UNIQUE globais legados (\`cpf\`, \`matricula\`, \`email\`) durante as refatorações da wave 1 (0396). Contudo, **as proteções tenant-scoped equivalentes nunca foram recriadas**, deixando chaves naturais desprotegidas contra duplicação acidental intracliente.

**Ação / Entrega**: 
- Gerada matriz A-02 em artefato (\`A-02_matrix.md\`).
- Preparada a migration **0489** (\`0489_a02_natural_keys_tenant_scoped.sql\`) com \`DROP INDEX\` explícitos legados e recriações rigorosas \`tenant-scoped\` ativas.
- Preparado preflight script (\`preflight_0489.sql\`) exigindo prova em produção (read-only) da ausência de colisões intra-tenant nas chaves.

## A-06 — Índices Redundantes
Gerado script para comparar as exatas definições de todos os índices a partir do histórico de schemas.
**Achados**: Várias tabelas como \`aeronaves\`, \`fichas_sessao\`, \`modelos_sessao\`, \`qualificacoes_historico\` possuem 2 ou mais índices criados ao longo dos meses que mapeiam as mesmíssimas colunas e condições. (Categoria A completa detectada).
**Ação / Entrega**: 
- Gerada matriz A-06 detalhada no artefato (\`A-06_matrix.md\`).
- Preparada a migration **0490** (\`0490_a06_redundant_indexes_cleanup.sql\`) que dá DROP na redundância sem remover a integridade (preservando o índice mais antigo/canônico).
- Preparado preflight script (\`preflight_0490.sql\`) comprovando equivalência.

## Validação e Git
As implementações das migrations 0489 e 0490 ganharam testes unitários \`worker-airtrust/src/__tests__/migrations/a02-a06-schema-residuals.test.ts\` os quais passaram com sucesso (\`PASS\`). 
As migrações seguem o critério Fail Closed/Idempotente.

A frente fica documentada no repositório no branch \`chore/audit-schema-residuals-a02-a06-0487\`. Elas aguardam PR e aprovação formal de Governança para execução em \`staging\`, e não foram aplicadas remotamente para não ferir a cláusula contratual e manter isolamento sem bypass de gates.

**Os residuais A-02 e A-06 evoluíram para o status de MIGRATION-PREPARED / GOVERNED-MIGRATION-PENDING.**

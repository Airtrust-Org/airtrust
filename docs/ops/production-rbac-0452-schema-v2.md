# Plano de Execução: Schema V2 (0452 Operational Domain RBAC) em Produção

## Objetivo
Aplicar de forma controlada a fundação do RBAC de Domínio Operacional (migration 0452) no ambiente de produção usando o mecanismo `schema-v2`. A mudança é estritamente aditiva: introduz a tabela canônica `dominios_operacionais`, colunas descritivas em tabelas existentes (`setores`, `qualificacoes_categorias`, `lms_cursos`) e a flag `operational_domain_rbac_enabled` (com default `0`) para habilitar o RBAC por empresa. Nenhum tenant real será ativado nesta execução e nenhuma qualificação ou curso sofrerá reclassificação automática.

## SHA da Aplicação
`229dfe08fabb65719fd1461cfa58dccc8d5ec32c` (SHA_INICIAL capturado do branch `main` após merge do PR #516).
O SHA final será o `FINAL_MAIN_SHA` após o merge deste próprio PR de preparação na `main`.

## Baseline Ativo
`production-d1-baseline-v2-20260714`

## SQL Exato
O arquivo SQL a ser executado será: `worker-airtrust/schema-v2/changes/0452_operational_domain_rbac.sql`
Este arquivo é uma cópia idêntica do schema aditivo introduzido na migration original e não realiza backfill.

## Pré-Condições
- O banco de produção `airtrust-db` (`7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`) está operando normalmente.
- O baseline `production-d1-baseline-v2-20260714` está `ACTIVE`.
- Não há registro de `0452-operational-domain-rbac-production` na tabela `airtrust_schema_changes_v2`.
- A tabela `dominios_operacionais` **NÃO EXISTE** em produção.
- Backup recém-realizado confirmado por hash SHA-256 e tamanho.

## Pós-Condições
- O ledger `airtrust_schema_changes_v2` contém exatamente a entrada `0452-operational-domain-rbac-production`.
- A tabela `dominios_operacionais` existe e possui exatamente os 5 registros canônicos (`OPERACOES`, `MANUTENCAO`, `SGSO`, `FRMS`, `CORPORATIVO`).
- As colunas `dominio_codigo` existem nas tabelas `setores`, `qualificacoes_categorias` e `lms_cursos`.
- A coluna `operational_domain_rbac_enabled` existe na tabela `empresas`.
- Os índices relacionados a `dominio_codigo` (`idx_setores_dominio_codigo`, `idx_qualificacoes_categorias_dominio_codigo`, `idx_lms_cursos_dominio_codigo`) foram criados.
- **EVIDÊNCIA DE FLAGS = 0**: A soma total (`sum(operational_domain_rbac_enabled)`) em `empresas` é exatamente igual a 0. Nenhuma empresa sofreu alteração no comportamento legado.
- O contrato de schema (`production-d1-baseline-v2.json`) está perfeitamente aderente.

## Backup
Um backup completo (D1 export) será disparado logo antes do deploy, com verificação do tamanho do artefato e cálculo de SHA-256. Caso a extração seja corrompida ou gere um banco vazio, o deploy será abortado por NO-GO (`NO_GO_PRODUCTION_0452_BACKUP`).

## Rollback de Aplicação (Worker/Pages)
Se a publicação do Worker ou do Pages falhar ou apresentar defeito no smoke pós-deploy:
- A mudança de schema (aditiva, default 0) será mantida em produção.
- O deploy do Worker será revertido via Rollback pelo painel do Cloudflare (ou Wrangler CLI) apontando para a Version ID imediatamente anterior (capturada na Pré-Condição).
- O Pages, se necessário, será revertido restaurando o deployment anterior.

## Tratamento de Falha Parcial no Schema
Ocorrendo falha durante a execução do `apply-schema-change-v2.yml`:
- Avaliar se a tabela ou colunas foram criadas parcialmente.
- O deploy de Worker/Pages será abortado.
- Se possível, aplicar os comandos DROPs (`0452_operational_domain_rbac_rollback.sql`) manualmente e remover o ledger; ou
- Usar o backup do D1 (`airtrust-db`) para restauração integral de estado caso o DB tenha ficado corrompido, e escalar imediatamente.

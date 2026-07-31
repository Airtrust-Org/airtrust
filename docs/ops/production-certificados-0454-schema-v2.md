# Plano de Execução: Schema V2 (0454 — Override de Domínio por Tipo) em Produção

## Objetivo
Aplicar de forma controlada, em produção, a coluna aditiva e opcional
`qualificacoes_tipos.dominio_codigo` (migration 0454) usando o mecanismo
`schema-v2`. A mudança é estritamente aditiva: adiciona uma coluna `TEXT`
anulável (default `NULL`) e um índice. **Nenhum tipo é classificado por
esta mudança** — toda linha permanece com `dominio_codigo = NULL`
imediatamente após a aplicação. A classificação de um tipo específico é uma
ação **separada, explicitamente autorizada**, executada depois, através do
endpoint administrativo `POST /api/admin/operational-domain-rbac/classify`
(`resource_type: 'qualificacao_tipo'`) — nunca por este schema change, nunca
por edição direta de banco.

## Por que este caminho (e não `scripts/apply-migration-production.sh`)
Produção usa exclusivamente o mecanismo `schema-v2` +
`.github/workflows/apply-schema-change-v2.yml` (`baseline_id` +
`change_id` + `file_hash` + `plan_hash`, contrato de schema validado antes
e depois). O wrapper `scripts/apply-migration-production.sh` mencionado no
cabeçalho original de `CLAUDE.md`/da migration não é o caminho real para
produção neste momento — isto foi corrigido no comentário da migration
0454 e neste documento aponta explicitamente para o caminho correto,
seguindo o mesmo precedente já usado por 0452 e 0453 (ver
`docs/ops/production-rbac-0452-schema-v2.md` e
`docs/database/schema-v2-ead-category-reconciliation-executor-0453.md`).

## change_id
`qualificacoes-tipos-dominio-override-0454`

## SHA da Aplicação
`expected_sha` = o SHA exato de `main` no momento em que este workflow for
efetivamente disparado (capturado no ato, nunca fixado antecipadamente
neste documento — este arquivo é preparado antes do merge desta PR, então
não há SHA de `main` ainda válido para citar aqui).

## Baseline Ativo
`production-d1-baseline-v2-20260714` (o mesmo baseline usado por 0452/0453
— este contrato de schema tem `scoped_tables` limitado às tabelas de
simuladores; `qualificacoes_tipos` está fora do escopo validado por esse
contrato, então nenhuma atualização do contrato é necessária para esta
mudança — confirmado lendo `docs/database/schema-contracts/production-d1-baseline-v2.json`).

## SQL Exato
`worker-airtrust/schema-v2/changes/0454_qualificacoes_tipos_dominio_override.sql`
— cópia idêntica (byte a byte, sem comentários divergentes de DDL) da
migration `worker-airtrust/migrations/0454_qualificacoes_tipos_dominio_override.sql`.
Nenhum DML.

## Pré-Condições
- O banco de produção `airtrust-db` (`7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`) está operando normalmente.
- O baseline `production-d1-baseline-v2-20260714` está `ACTIVE`.
- Não há registro de `qualificacoes-tipos-dominio-override-0454` na tabela `airtrust_schema_changes_v2`.
- A coluna `qualificacoes_tipos.dominio_codigo` **NÃO EXISTE** em produção (confirmado via `PRAGMA table_info(qualificacoes_tipos)` antes da aplicação).
- Backup recém-realizado confirmado por hash SHA-256 e tamanho (etapa padrão do workflow).

## Pós-Condições (validadas por `scripts/schema-v2/validate-qualificacoes-tipos-dominio-override-0454.sh --target=airtrust-db`, read-only)
- A coluna `qualificacoes_tipos.dominio_codigo` existe, tipo `TEXT`, anulável.
- O índice `idx_qualificacoes_tipos_dominio_codigo` existe.
- **EVIDÊNCIA DE NENHUMA CLASSIFICAÇÃO**: `SELECT COUNT(*) FROM qualificacoes_tipos WHERE dominio_codigo IS NOT NULL` é exatamente `0` — nenhuma linha foi classificada por esta mudança.
- A tabela `dominios_operacionais` (0452) permanece intacta.
- O contrato de schema (`production-d1-baseline-v2.json`) permanece `PASS` (fora de escopo para esta tabela, mas a checagem genérica do workflow roda mesmo assim).
- O ledger `airtrust_schema_changes_v2` contém exatamente a entrada `qualificacoes-tipos-dominio-override-0454`.

## Backup
Padrão do workflow `apply-schema-change-v2.yml`: snapshot de
`airtrust_schema_baselines_v2` e `airtrust_schema_changes_v2` antes da
aplicação (etapa "Backup current governance snapshot").

## Rollback
Ver `worker-airtrust/migrations/0454_qualificacoes_tipos_dominio_override_rollback.sql`
— **NEUTRALIZA, NÃO REMOVE** a coluna (mesmo precedente de 0452: SQLite
`ALTER TABLE ... DROP COLUMN` falha neste banco por um trigger legado não
relacionado — `trg_matriz_manobra_resolution_mesmo_tenant` — que invalida
`DROP COLUMN` em qualquer tabela). O rollback limpa qualquer valor não-NULL
(não deveria haver nenhum, a menos que uma classificação humana já tenha
sido feita separadamente após esta aplicação) e remove o índice. A coluna
inerte permanece, sem efeito, pois nenhum código lê `qualificacoes_tipos.dominio_codigo`
sem primeiro confirmar sua existência via `tableHasColumn` — reverter o
código de resolução (remover o passo 2 da precedência em
`resolveResourceDomain`) é o que efetivamente desativa a leitura da coluna.

## Tratamento de Falha Parcial
Ocorrendo falha durante a execução do `apply-schema-change-v2.yml`:
- Avaliar se a coluna/índice foram criados parcialmente.
- Se possível, aplicar o rollback acima manualmente e remover a entrada do ledger.
- Escalar imediatamente se o estado ficar ambíguo — nunca prosseguir para
  classificar qualquer tipo enquanto o schema não estiver confirmado
  consistente.

## Ação SEPARADA e NÃO incluída neste plano: classificação de tipos reais
Este documento cobre **apenas** a mudança de schema (coluna aditiva). A
classificação de tipos específicos (por exemplo, o tipo por trás do
incidente original de geração de certificado) é tratada por um plano
distinto e explicitamente separado — ver
`docs/ops/certificados-tipo-dominio-classification-plan.md` — que requer
sua própria autorização humana e não é executado por este workflow nem por
este PR.

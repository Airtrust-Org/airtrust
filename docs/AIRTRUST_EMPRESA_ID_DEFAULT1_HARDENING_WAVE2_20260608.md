# AIRTRUST — Hardening empresa_id DEFAULT 1 — Wave 2

**Data**: 2026-06-08  
**Modelo**: GPT-5.4 no Cursor  
**Status**: CONCLUÍDA EM PRODUÇÃO

---

## 1. Sumário executivo

A Wave 2 endureceu `empresa_id` em produção nas tabelas `qualificacoes_historico`,
`fichas_sessao` e `certificados`, eliminando `DEFAULT 1`, impondo `NOT NULL` e
completando o runtime para gravar e filtrar por tenant em todos os caminhos
relevantes de `fichas_sessao`.

O lote foi concluído com sucesso em produção, com preservação de contagens,
índices, views e triggers esperados. Houve dois desvios operacionais relevantes,
ambos registrados e corrigidos no mesmo lote:

1. a migration `0397` inicialmente não recriava objetos dependentes reais do
   schema de produção (`vw_tripulante_operacional`, `fichas_simulador`,
   `trg_apply_reclassification`);
2. o `wrangler d1 migrations apply` falhou ao tentar reexecutar `0396/0397`
   sob `FOREIGN KEY` efetivamente ativa no wrapper remoto, apesar de o schema da
   Wave 1 já existir em produção.

O caminho final seguro foi:

1. validar a sequência `0395 -> 0396 -> 0397` em snapshot real da produção;
2. aplicar `0397` por arquivo SQL direto em produção;
3. reconciliar o ledger remoto com `0398`;
4. deployar apenas o worker/API com version stamp atualizado;
5. validar schema, contagens, índices, views, triggers e saúde da API.

---

## 2. HEAD inicial e final

### 2.1 Estado inicial do repositório

```
HEAD inicial:      601f721ff0fdaa152daf4c1e684b9168b4bbaf36
origin/main:       601f721ff0fdaa152daf4c1e684b9168b4bbaf36
Branch:            main
HEAD == origin/main antes do commit: sim
```

### 2.2 Commits gerados neste lote

1. `08f3894a` — `fix(schema): harden empresa id wave 2`
2. `ba1f1883` — `fix(migrations): reconcile wave hardening ledger`
3. `d47738b4` — `fix(migrations): finalize wave ledger reconcile`

### 2.3 Estado final

```
HEAD final:        d47738b429056cae6473ad152779e0284197f1f4
origin/main final: d47738b429056cae6473ad152779e0284197f1f4
HEAD == origin/main ao final: sim
```

---

## 3. Escopo

### 3.1 Tabelas Wave 2

1. `qualificacoes_historico`
2. `fichas_sessao`
3. `certificados`

### 3.2 Runtime alterado

1. `worker-airtrust/src/routes/simuladores-sessoes.ts`
2. `worker-airtrust/src/routes/simuladores-sessoes-update.ts`
3. `worker-airtrust/src/routes/simuladores-fichas.ts`

### 3.3 Testes adicionados/alterados

1. `worker-airtrust/src/__tests__/migrations/empresa-id-wave2-hardening.test.ts`
2. `worker-airtrust/src/__tests__/routes/simuladores-fichas-tenant-write.test.ts`
3. `worker-airtrust/src/__tests__/migrations/migration-governance.test.ts`
4. `worker-airtrust/src/__tests__/security/tenant-write-paths.test.ts`
5. `worker-airtrust/src/__tests__/migrations/empresa-id-wave-ledger-reconcile.test.ts`

### 3.4 Migrations envolvidas

1. `0395_f7_platform_admin_backfill.sql`
2. `0396_harden_empresa_id_wave1.sql`
3. `0397_harden_empresa_id_wave2.sql`
4. `0398_reconcile_wave1_wave2_d1_ledger.sql`

---

## 4. Revisão integral do patch

### 4.1 Arquivos de código versionados para a Wave 2

```
A  worker-airtrust/migrations/0397_harden_empresa_id_wave2.sql
A  worker-airtrust/src/__tests__/migrations/empresa-id-wave2-hardening.test.ts
M  worker-airtrust/src/__tests__/migrations/migration-governance.test.ts
A  worker-airtrust/src/__tests__/routes/simuladores-fichas-tenant-write.test.ts
M  worker-airtrust/src/__tests__/security/tenant-write-paths.test.ts
M  worker-airtrust/src/routes/simuladores-fichas.ts
M  worker-airtrust/src/routes/simuladores-sessoes-update.ts
M  worker-airtrust/src/routes/simuladores-sessoes.ts
```

### 4.2 Arquivos adicionais gerados para fechar o lote

```
A  worker-airtrust/migrations/0398_reconcile_wave1_wave2_d1_ledger.sql
A  worker-airtrust/src/__tests__/migrations/empresa-id-wave-ledger-reconcile.test.ts
```

### 4.3 Arquivos fora do lote mantidos fora do staging

Untracked antigos em `docs/` e `artifacts/validation/` foram preservados e
não entraram em nenhum commit deste lote.

---

## 5. Por que a migration é 0397 e qual é a 0396

### 5.1 0396

`0396_harden_empresa_id_wave1.sql`

Wave 1 endureceu:

1. `aeronaves`
2. `modelos_sessao`
3. `funcionarios`

### 5.2 0397

`0397_harden_empresa_id_wave2.sql`

Wave 2 endureceu:

1. `qualificacoes_historico`
2. `fichas_sessao`
3. `certificados`

### 5.3 Situação encontrada em produção

O ledger remoto (`d1_migrations`) estava em `0394`, mas o schema da Wave 1 já
estava presente em produção:

1. `aeronaves.empresa_id` já era `NOT NULL` sem `DEFAULT`
2. `modelos_sessao.empresa_id` já era `NOT NULL` sem `DEFAULT`
3. `funcionarios.empresa_id` já era `NOT NULL` sem `DEFAULT`

Conclusão: não havia lacuna de schema entre `0396` e `0397`, mas havia lacuna
de ledger. Isso motivou a migration `0398` para reconciliar `d1_migrations`.

---

## 6. Dry-run read-only em produção antes da migration

### 6.1 Schema pré-migration

Pré-Wave 2 em produção:

```
qualificacoes_historico.empresa_id: INTEGER, notnull=0, dflt_value='1'
fichas_sessao.empresa_id:           INTEGER, notnull=0, dflt_value=NULL
certificados.empresa_id:            coluna ausente
```

### 6.2 Contagens pré-migration

```
qualificacoes_historico: 975
fichas_sessao:           192
certificados:             44
```

### 6.3 Distribuição pré-migration

```
qualificacoes_historico:
  empresa_id=1  -> 38
  empresa_id=6  -> 922
  empresa_id=7  -> 15

fichas_sessao:
  empresa_id=NULL -> 125
  empresa_id=6    -> 67

certificados:
  sem coluna empresa_id
```

### 6.4 Backfill determinístico comprovado

#### `qualificacoes_historico`

Resultado do dry-run:

```
resolved_empresa_id=6 -> 960 linhas
resolved_empresa_id=7 ->  15 linhas
unresolved_rows       ->   0
mismatched_with_funcionario -> 0
```

As 38 linhas com `empresa_id=1` foram listadas nominalmente. Todas resolviam
deterministicamente para empresa 6 via:

1. `funcionarios.empresa_id`, ou
2. `qualificacoes_tipos.empresa_id`, ou
3. `simulador_agendamentos.empresa_id` para o caso `id=4517`.

Também foi confirmado:

```
órfãos funcionario:        0
órfãos sessao:             0
órfãos qualificacao_tipo:  1
```

O órfão em `qualificacao_id` não bloqueava a migration, porque a regra de
backfill prioriza `funcionario_id` e `sessao_id`, e havia `unresolved_rows = 0`.

#### `fichas_sessao`

Resultado do dry-run:

```
resolved_empresa_id=6 -> 192 linhas
unresolved_rows       ->   0
divergence_rows       ->   0
```

Também foi confirmado:

```
órfãos agendamento: 0
órfãos aluno:      0
órfãos instrutor:  0
```

#### `certificados`

Resultado do dry-run:

```
resolved_empresa_id=6                 -> 44 linhas
certificados_sem_funcionario_resolvivel -> 0
```

Também foi identificado:

```
certificados_sem_historico_match -> 37
órfãos_habilitacao              -> 14
órfãos_qualificacao             -> 11
```

Esses desvios não bloqueavam a Wave 2 porque o backfill de `certificados` foi
definido explicitamente por `funcionarios.empresa_id`, não por
`habilitacao_id/qualificacao_id/historico`.

### 6.5 Objetos dependentes reais encontrados

O dry-run revelou dependências reais que precisavam ser preservadas:

1. views:
   - `qualificacoes_historico_v`
   - `vw_tripulante_operacional`
   - `fichas_simulador`
2. trigger externo:
   - `trg_apply_reclassification` em `qualificacoes_historico_reclass_queue`

Esses objetos foram adicionados à `0397` antes da aplicação em produção.

### 6.6 Migrations remotas pendentes antes do apply

Antes de qualquer apply, o remoto mostrava:

1. `0395_f7_platform_admin_backfill.sql`
2. `0396_harden_empresa_id_wave1.sql`
3. `0397_harden_empresa_id_wave2.sql`

O `migrations list` também listava arquivos legados históricos fora da cadeia
canônica (`132_add_funcionario_ativo.sql`, `9999_add_modelo_sessao_id_to_agendamentos.sql`,
`purge-soft-deleted-qualificacoes.sql`), mas o `migrations apply` efetivo
para a produção naquele momento mostrou apenas `0395/0396/0397`.

---

## 7. Regras de backfill

### 7.1 `qualificacoes_historico`

Ordem:

1. `funcionarios.empresa_id`
2. `simulador_agendamentos.empresa_id`
3. `qualificacoes_tipos.empresa_id`
4. `qh.empresa_id` apenas se já explícito e diferente de 1

Se nada resolvesse, a linha cairia em `NULL` e falharia por `NOT NULL`.

### 7.2 `fichas_sessao`

Ordem:

1. `simulador_agendamentos.empresa_id`
2. `funcionarios` do aluno
3. `funcionarios` do instrutor
4. `fs.empresa_id` existente

### 7.3 `certificados`

Fonte única e determinística:

1. `funcionarios.empresa_id`

Não houve fallback para empresa 1.

---

## 8. Backup

### 8.1 Comando executado

```bash
env -u CLOUDFLARE_API_TOKEN npx wrangler d1 export airtrust-db \
  --env production \
  --remote \
  --output artifacts/db-backups/airtrust-db-pre-default1-wave2-20260608.sql
```

### 8.2 Resultado

1. export concluído com sucesso;
2. arquivo confirmado em:
   `artifacts/db-backups/airtrust-db-pre-default1-wave2-20260608.sql`
3. tamanho confirmado:
   `100M`
4. diretório `artifacts/db-backups/` confirmado no `.gitignore`

---

## 9. Alterações de runtime

### 9.1 `simuladores-fichas.ts`

Confirmações:

1. `empresa_id` é derivado do contexto autenticado via `getEmpresaId(c)`;
2. `POST /fichas` valida que aluno/instrutor pertencem ao tenant;
3. `POST /fichas` grava `empresa_id` explicitamente;
4. `GET /fichas/:id` filtra por `fs.empresa_id = ?`;
5. `POST /fichas/:id/pdf` filtra por `fs.empresa_id = ?`;
6. `PUT /fichas/:id` filtra por `empresa_id` no `SELECT` e no `UPDATE`;
7. `DELETE /fichas/:id` filtra por `empresa_id`;
8. não há fallback para empresa 1.

### 9.2 `simuladores-sessoes.ts`

As duas inserções em `fichas_sessao` passaram a incluir `empresa_id`
explicitamente no `INSERT` e no `bind`.

### 9.3 `simuladores-sessoes-update.ts`

As duas inserções em `fichas_sessao` passaram a incluir `empresa_id`
explicitamente no `INSERT` e no `bind`.

### 9.4 `qualificacoes_historico`

`qualificacoes/historico-write.ts` continuou tenant-safe:

1. `INSERT` já gravava `empresa_id`;
2. reads/writes por ID usam `empresa_id = ?`;
3. não foi necessário novo patch funcional nesta rota.

### 9.5 `certificados`

Rotas relevantes revisadas:

1. `qualificacoes-certificados.ts`
2. `qualificacoes-certificados-write.ts`

Conclusão:

1. a listagem/deleção continua tenant-scoped por `documentos.empresa_id`,
   `funcionarios.empresa_id` e/ou `qualificacoes_historico`;
2. a geração/upload continua derivando `empresaId` do contexto autenticado
   e usando `func_empresa_id` como fonte autoritativa para os registros
   auxiliares (`documentos`, `pasta_virtual`);
3. após a Wave 2, a tabela `certificados` também passou a ter `empresa_id NOT NULL`.

---

## 10. Testes e validações locais

### 10.1 Comandos obrigatórios

Todos executados com exit code `0` no estado final do patch:

```bash
npx tsc --noEmit
npm run lint
npm run test:run
npm run test:worker
npm run build
```

### 10.2 Resultados

1. `npx tsc --noEmit` -> `0`
2. `npm run lint` -> `0`
3. `npm run test:run` -> `0`
   - `72 passed | 3 skipped`
   - `719 passed`
4. `npm run test:worker` -> `0`
   - `160 passed`
   - `1089 passed`
5. `npm run build` -> `0`

### 10.3 Testes focados relevantes

Passaram:

1. `empresa-id-wave2-hardening.test.ts`
2. `migration-governance.test.ts`
3. `tenant-write-paths.test.ts`
4. `simuladores-fichas-tenant-write.test.ts`
5. `simuladores-sessoes-guards.test.ts`
6. `architecture-performance-guard.test.ts`
7. `empresa-id-wave-ledger-reconcile.test.ts`

Nenhum cap arquitetural foi inflado para fazer passar esta Wave.

---

## 11. Validação em banco temporário

### 11.1 Snapshot real usado

Foi exportado um snapshot temporário real da produção para:

1. `/tmp/airtrust-wave2-precheck-20260608.sql`
2. `/tmp/airtrust-wave2-precheck-20260608.sqlite`

### 11.2 Aplicação validada

Sequência validada com dados reais:

1. `0395_f7_platform_admin_backfill.sql`
2. `0396_harden_empresa_id_wave1.sql`
3. `0397_harden_empresa_id_wave2.sql`

### 11.3 Resultado do snapshot após correções

```
qualificacoes_historico: count=975, null=0, empresa_id_1=0
fichas_sessao:           count=192, null=0, empresa_id_1=0
certificados:            count=44,  null=0, empresa_id_1=0
integrity_check:         ok
views preserved:         qualificacoes_historico_v, vw_tripulante_operacional, fichas_simulador
external trigger:        trg_apply_reclassification preservado
```

### 11.4 Integridade e FK no snapshot

O snapshot já possuía `foreign_key_check` preexistente em `_backup_qh_tmp`
referenciando `funcionarios_backup`. Essa violação:

1. já existia antes da Wave 2;
2. permaneceu com mesma cardinalidade depois;
3. não foi criada por `0397`.

---

## 12. Problemas encontrados e correções

### 12.1 Problema 1 — views dependentes ausentes na `0397`

**Sintoma**: o dry-run mostrou que a `0397` não recriava:

1. `vw_tripulante_operacional`
2. `fichas_simulador`

**Correção**: a `0397` passou a:

1. dropar essas views antes dos rebuilds;
2. recriá-las ao final com o SQL real de produção.

### 12.2 Problema 2 — trigger externo dependente não preservado

**Sintoma**: a validação em snapshot falhou com:

```
error in trigger trg_apply_reclassification: no such table: main.qualificacoes_historico
```

**Causa**: o trigger externo `trg_apply_reclassification` dependia de
`qualificacoes_historico`, mas não pertencia à própria tabela.

**Correção**: a `0397` passou a:

1. dropar `trg_apply_reclassification` antes do rebuild;
2. recriá-lo ao final.

### 12.3 Problema 3 — falha do `wrangler d1 migrations apply` em `0396`

**Sintoma**:

```
FOREIGN KEY constraint failed: SQLITE_CONSTRAINT_FOREIGNKEY
```

**Ponto exato reproduzido**:

1. `0396` falhava em `DROP TABLE aeronaves;`
2. `0397` falharia em `DROP TABLE qualificacoes_historico;`

**Causa**: no wrapper remoto do `wrangler d1 migrations apply`, os rebuilds
com `DROP TABLE` ocorreram sob enforcement efetivo de foreign key, apesar de o
arquivo conter `PRAGMA foreign_keys = OFF`.

**Conseqüência operacional real**:

1. `0395` foi aplicada;
2. `0396/0397` falharam no primeiro `apply`;
3. não houve deploy do worker nessa tentativa;
4. o evento foi mantido neste relatório.

### 12.4 Problema 4 — ledger remoto divergente do schema real

**Sintoma**: o remoto estava em `0394` no `d1_migrations`, mas o schema da
Wave 1 já existia em produção.

**Correção**:

1. aplicação direta da `0397` por arquivo SQL;
2. criação da `0398_reconcile_wave1_wave2_d1_ledger.sql` para reconciliar
   `0396/0397` no ledger;
3. duas iterações de `0398` até remover auto-inserção conflitante com o
   registro automático do `wrangler`.

### 12.5 Problema 5 — erro final inicial da `0398`

**Sintoma**:

```
UNIQUE constraint failed: d1_migrations.name
```

**Causa**: a `0398` tentava registrar a si mesma, mas o `wrangler` já faz esse
registro automaticamente ao final do apply.

**Correção**:

1. removida a auto-inserção de `0398`;
2. criado commit corretivo final;
3. aplicada novamente somente a `0398`.

---

## 13. Commit e push

### 13.1 Commit de código principal

```
08f3894a fix(schema): harden empresa id wave 2
```

### 13.2 Commit de reconciliação

```
ba1f1883 fix(migrations): reconcile wave hardening ledger
```

### 13.3 Commit final de ajuste

```
d47738b4 fix(migrations): finalize wave ledger reconcile
```

Todos os commits foram enviados para `origin/main`.

---

## 14. Aplicação em produção

### 14.1 Sequência real executada

1. `0395` entrou no primeiro `wrangler d1 migrations apply`
2. `0396` falhou no primeiro `apply` por `FOREIGN KEY`
3. `0397` foi aplicada diretamente por arquivo:

```bash
env -u CLOUDFLARE_API_TOKEN npx wrangler d1 execute airtrust-db \
  --env production \
  --remote \
  --file="worker-airtrust/migrations/0397_harden_empresa_id_wave2.sql"
```

4. `0396` e `0397` foram reconciliadas no ledger por `0398`
5. `0398` foi aplicada com sucesso em nova tentativa final

### 14.2 Resultado da aplicação direta da `0397`

```
66 queries
369,659 rows read
15,059 rows written
sql_duration_ms: 524.937
bookmark final: 000048a3-00000017-00005085-f31050ad30d77551546c475bfc576aa9
```

### 14.3 Ledger remoto final

```
395  0398_reconcile_wave1_wave2_d1_ledger.sql
394  0397_harden_empresa_id_wave2.sql
393  0396_harden_empresa_id_wave1.sql
392  0395_f7_platform_admin_backfill.sql
```

---

## 15. Schema final das tabelas alvo

### 15.1 `qualificacoes_historico`

```
empresa_id: type=INTEGER, notnull=1, dflt_value=NULL
```

### 15.2 `fichas_sessao`

```
empresa_id: type=INTEGER, notnull=1, dflt_value=NULL
```

### 15.3 `certificados`

```
empresa_id: type=INTEGER, notnull=1, dflt_value=NULL
```

---

## 16. Contagens antes/depois

| Tabela | Antes | Depois | NULL antes | NULL depois | emp=1 antes | emp=1 depois |
|---|---:|---:|---:|---:|---:|---:|
| `qualificacoes_historico` | 975 | 975 | 0 | 0 | 38 | 0 |
| `fichas_sessao` | 192 | 192 | 125 | 0 | 0 | 0 |
| `certificados` | 44 | 44 | n/a | 0 | n/a | 0 |

---

## 17. Índices, FKs, views e triggers

### 17.1 Índices finais confirmados

#### `qualificacoes_historico`

13 índices:

1. `idx_qh_renovacao_de`
2. `idx_qual_historico_lms_matricula`
3. `idx_qual_historico_lms_matricula_ciclo`
4. `idx_qual_historico_origem_tipo`
5. `idx_qualificacoes_hist_data_conclusao`
6. `idx_qualificacoes_hist_data_vencimento`
7. `idx_qualificacoes_historico_empresa_deleted`
8. `idx_qualificacoes_historico_empresa_funcionario`
9. `idx_qualificacoes_historico_empresa_id`
10. `idx_qualificacoes_historico_sessao`
11. `idx_qualificacoes_historico_status`
12. `idx_qualificacoes_historico_tipo`
13. `idx_qualificacoes_historico_unique_active`

#### `fichas_sessao`

17 índices confirmados, incluindo:

1. `idx_fichas_sessao_empresa`
2. `idx_fichas_sessao_empresa_id`
3. `idx_fichas_sessao_status`
4. `idx_fichas_sessao_tipo`
5. `idx_fichas_sessao_resultado`

#### `certificados`

10 índices confirmados, incluindo:

1. `idx_certificados_empresa_id`
2. `idx_certificados_funcionario_id`
3. `idx_certificados_habilitacao_id`
4. `idx_certificados_qualificacao`
5. `idx_certificados_qualificacao_id`

### 17.2 Triggers finais

Confirmados:

1. `trg_calc_vencimento_insert`
2. `trg_qualificacoes_historico_set_tipo`
3. `trg_qualificacoes_historico_update_tipo`
4. trigger externo preservado:
   `trg_apply_reclassification`

### 17.3 Views finais

Confirmadas:

1. `qualificacoes_historico_v`
2. `vw_tripulante_operacional`
3. `fichas_simulador`

### 17.4 FKs finais

FKs inline esperadas preservadas em `qualificacoes_historico`:

1. `lms_matricula_id -> lms_matriculas(id)`
2. `lms_matricula_ciclo_id -> lms_matricula_ciclos(id)`

`fichas_sessao` e `certificados` permaneceram sem novas FKs inline no schema,
como já era o padrão existente.

---

## 18. Integridade e violações de FK

### 18.1 `integrity_check`

No snapshot validado antes da aplicação:

```
integrity_check = ok
```

### 18.2 `foreign_key_check`

Em produção após a Wave 2, a amostra do `foreign_key_check` continua apontando
apenas para:

```
table:  _backup_qh_tmp
parent: funcionarios_backup
```

Classificação:

1. **tipo**: legado / backup
2. **escopo**: fora das três tabelas alvo endurecidas
3. **status**: preexistente
4. **causada pela Wave 2**: não

No snapshot real:

```
before_fk_count = 525
after_fk_count  = 525
```

Portanto, a Wave 2 não introduziu novas violações de FK detectáveis; preservou
o estado legado já existente.

---

## 19. Deploy do worker e API version/health

### 19.1 Deploy executado

```bash
npm run deploy:worker:safe
```

Resultado:

1. nenhum deploy de Pages;
2. apenas worker/API;
3. version stamp novo:
   `2026-06-09T02:25:48Z-d47738b4`
4. `Current Version ID`:
   `17fb8a57-f902-45ff-bd29-1948a2117bbb`

### 19.2 `/api/version`

```json
{
  "success": true,
  "data": {
    "version": "2026-06-09T02:25:48Z-d47738b4",
    "environment": "production",
    "builtAt": "2026-06-09T02:25:48Z",
    "deploymentId": "2026-06-09T02:25:48Z-d47738b4"
  }
}
```

### 19.3 `/api/health`

```json
{
  "success": true,
  "status": "healthy",
  "checks": {
    "database": { "status": "ok", "latency": 146 },
    "storage":  { "status": "ok", "latency": 152 }
  },
  "stats": {
    "version": "2026-06-09T02:25:48Z-d47738b4",
    "environment": "production",
    "region": "BR"
  }
}
```

---

## 20. Smoke funcional

### 20.1 Evidência automatizada/local

Coberto pelos testes:

1. criação de ficha grava `empresa_id`;
2. tentativa cross-tenant é bloqueada;
3. GET/PUT/DELETE/PDF de ficha respeitam `empresa_id`;
4. `qualificacoes_historico` continua tenant-safe;
5. `certificados` continuam tenant-scoped nos caminhos relevantes;
6. guardas estáticas de write-paths seguem verdes.

### 20.2 Evidência em produção sem criação manual de dados

Consultas read-only confirmaram:

1. `fichas_sessao` total com `empresa_id IS NOT NULL` = `192`
2. `qualificacoes_historico` total com `empresa_id IS NOT NULL` = `975`
3. `certificados` total com `empresa_id IS NOT NULL` = `44`

Nenhum dado real adicional foi criado manualmente em produção fora das migrations.

---

## 21. Arquivos alterados neste lote

### 21.1 Commits de código/migration

1. `worker-airtrust/migrations/0397_harden_empresa_id_wave2.sql`
2. `worker-airtrust/migrations/0398_reconcile_wave1_wave2_d1_ledger.sql`
3. `worker-airtrust/src/routes/simuladores-sessoes.ts`
4. `worker-airtrust/src/routes/simuladores-sessoes-update.ts`
5. `worker-airtrust/src/routes/simuladores-fichas.ts`
6. `worker-airtrust/src/__tests__/migrations/empresa-id-wave2-hardening.test.ts`
7. `worker-airtrust/src/__tests__/migrations/empresa-id-wave-ledger-reconcile.test.ts`
8. `worker-airtrust/src/__tests__/migrations/migration-governance.test.ts`
9. `worker-airtrust/src/__tests__/routes/simuladores-fichas-tenant-write.test.ts`
10. `worker-airtrust/src/__tests__/security/tenant-write-paths.test.ts`

### 21.2 Backup não versionado

1. `artifacts/db-backups/airtrust-db-pre-default1-wave2-20260608.sql`

---

## 22. Riscos residuais

1. `foreign_key_check` global continua reportando resíduos preexistentes em
   `_backup_qh_tmp -> funcionarios_backup`; a Wave 2 não os criou, mas eles
   ainda existem no banco.
2. O uso de `wrangler d1 migrations apply` para rebuilds com `DROP TABLE`
   mostrou comportamento incompatível com essas migrations no remoto; o padrão
   seguro para futuras waves com rebuild deve considerar aplicação por arquivo
   ou estratégia específica para o D1 remoto.
3. `certificados` ainda possui referências legadas imperfeitas em
   `habilitacao_id` e `qualificacao_id` (14 e 11 órfãos, respectivamente), mas
   a fonte de tenant ficou determinística via `funcionario_id`.

---

## 23. Pendências para Wave 3

1. sanear resíduos globais/legados em tabelas auxiliares com `empresa_id = 1`
2. revisar tabela `_backup_qh_tmp` e `funcionarios_backup`
3. definir estratégia operacional padrão para rebuild migrations no D1 remoto
4. expandir smoke funcional tenant-aware para rotas reais autenticadas de
   produção/development controlado
5. continuar o lote de endurecimento nos alvos remanescentes do inventário

---

## 24. Conclusão

A Wave 2 foi concluída em produção.

Critérios finais atendidos:

1. três tabelas alvo ficaram tenant-safe;
2. schema endurecido:
   - `qualificacoes_historico.empresa_id` -> `NOT NULL`, sem `DEFAULT`
   - `fichas_sessao.empresa_id` -> `NOT NULL`, sem `DEFAULT`
   - `certificados.empresa_id` -> nova coluna `NOT NULL`, sem `DEFAULT`
3. runtime de `fichas_sessao` passou a gravar e filtrar `empresa_id` em todos
   os caminhos relevantes;
4. worker atualizado sem deploy de Pages;
5. contagens preservadas;
6. índices, views e triggers esperados preservados;
7. relatório versionado;
8. erros intermediários e desvios operacionais ficaram registrados, não ocultados.

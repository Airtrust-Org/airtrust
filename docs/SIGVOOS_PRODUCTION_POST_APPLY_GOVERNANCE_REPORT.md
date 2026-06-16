# SIGVOOS — Governança Pós-Aplicação em Produção (0410/0411)

**Veredito:** `PRODUCAO SCHEMA APLICADO — GOVERNANCA REGISTRADA`

Data de emissão: 2026-06-16  
Branch de governança: `codex/sigvoos-production-post-apply-governance`  
Referência de produção: `main` @ `9953f4374a336a5b1f191a35b0d8ba0d0a184985`

---

## 1. Resumo executivo

As migrations `0410_controle_voos_n1_schema.sql` e `0411_controle_voos_sigvoos_integration_schema.sql`
foram aplicadas com sucesso no banco de produção `airtrust-db` via `wrangler d1 execute --file`,
em janela controlada registrada no PR #43.

Este documento não executa migrations, não chama a API real SIGVOOS, não faz deploy,
não altera código runtime, não modifica FRMS e não altera `frms-source-policy.ts`.

O objetivo deste relatório é:

- consolidar o estado real pós-PR #43;
- documentar a divergência do ledger `d1_migrations`;
- proibir formalmente a reexecução de 0410/0411 via `migrations apply`;
- registrar rollback realista por snapshot;
- definir critérios de GO/NO-GO para validação funcional futura.

---

## 2. Estado pós-PR #43 confirmado

### 2.1 Git e CI

| Item | Estado |
|---|---|
| Branch de aplicação | `codex/sigvoos-production-0410-0411-execution` |
| Merge commit | `9953f4374a336a5b1f191a35b0d8ba0d0a184985` |
| PR | #43 — "Execução produção 0410/0411 SIGVOOS" — MERGED |
| Data do merge | 2026-06-16T00:01:59Z |
| `main` alinhada com `origin/main` | SIM |
| Working tree | LIMPA |

### 2.2 Checks pós-merge do PR #43

| Workflow | Evento | Resultado |
|---|---|---|
| CI | push | success |
| Tests | push | success |
| Lint and Prettier Check | push | success |
| Demo Data Prevention Check | push | success |
| Deploy to GitHub Pages | push | failure — **pré-existente** |

Confirmação: nenhum Cloudflare Deploy foi acionado. Nenhum `workflow_dispatch` foi acionado.
A falha de GitHub Pages é padrão pré-existente e está fora do escopo desta cadeia.

### 2.3 Estado do schema de produção pós-apply

Evidências registradas em `docs/SIGVOOS_PRODUCTION_0410_0411_EXECUTION_REPORT.md`:

```text
CV_TABLES_POST_0411         = 8 tabelas N1 (de 0410) + 3 tabelas SIGVOOS (de 0411) = 11 total
CV_INDEXES_TOTAL_POST_0411  = 49
CV_0411_INDEXES_POST        = 20
CV_TRIGGERS_POST_0411       = 18  (trg_cv_*)
CV_VOOS_SIGVOOS_COLUMNS     = 10
CV_TRIP_SIGVOOS_COLUMNS     = 6
D1_MIGRATIONS_TOTAL         = 404 (inalterado — ledger não registrou 0410/0411)
D1_MIGRATIONS_0410_POST     = 0
D1_MIGRATIONS_0411_POST     = 0
FRMS_JORNADA_COUNT          = 5262 (inalterado)
FRMS_ALERTA_COUNT           = 4899 (inalterado)
CV_VOOS_COUNT               = 0 (sem payload funcional)
CV_VOO_ETAPAS_COUNT         = 0
CV_SIGVOOS_STAGING_COUNT    = 0
CV_CONFLITOS_INTEGRACAO_COUNT = 0
CV_VOO_TRIPULANTES_COUNT    = 0
```

Objetos confirmados em produção:

- `cv_aeroportos` ✓
- `cv_tipos_voo` ✓
- `cv_naturezas_voo` ✓
- `cv_motivos_operacionais` ✓
- `cv_aeronaves` ✓
- `cv_voos` ✓ (com 10 colunas SIGVOOS adicionadas por 0411)
- `cv_voo_tripulantes` ✓ (com 6 colunas SIGVOOS adicionadas por 0411)
- `cv_trip_qualificacoes` ✓
- `cv_voo_etapas` ✓ (criada por 0411)
- `cv_sigvoos_staging` ✓ (criada por 0411)
- `cv_conflitos_integracao` ✓ (criada por 0411)
- 18 triggers `trg_cv_*` ✓

---

## 3. Guardrails de estado — confirmações absolutas

| Guardrail | Estado |
|---|---|
| 0410 aplicada em produção | **SIM** — `success: true`, 37 queries, bookmark registrado |
| 0411 aplicada em produção | **SIM** — `success: true`, 57 queries, bookmark registrado |
| Produção recebeu payload funcional | **NÃO** — todas as tabelas `cv_*` com contagem zero |
| API real SIGVOOS chamada | **NÃO** |
| Credenciais SIGVOOS usadas | **NÃO** |
| Deploy do Worker executado | **NÃO** |
| FRMS alterado | **NÃO** — `frms_jornada=5262`, `frms_alerta=4899` inalterados |
| `frms-source-policy.ts` alterado | **NÃO** |
| E-mails enviados | **NÃO** |
| Dados reais não sanitizados importados | **NÃO** |
| Cloudflare Deploy acionado | **NÃO** |
| `workflow_dispatch` acionado | **NÃO** |
| Snapshot pré-migration criado | **SIM** — `airtrust-production-pre-0410-0411-20260615T235234Z.sql` (112 MB) |

---

## 4. Divergência de premissa — a produção já recebeu o schema

**Atenção operacional:** este documento existe porque a premissa de ciclos futuros deve ser corrigida.

A produção **já recebeu** as migrations 0410/0411. Não estamos em fase de decisão sobre aplicar ou não.
Qualquer documentação, script ou instrução que indique "ainda falta aplicar 0410/0411 em produção"
está desatualizada e deve ser tratada como incorreta.

### 4.1 Linha do tempo resumida

1. Staging recebeu 0410/0411 via `execute --file` — PR #41 mergeado.
2. Validação funcional de staging executada com fixtures sintéticas — PR #42 mergeado.
3. Produção recebeu 0410/0411 via `execute --file` — PR #43 mergeado em 2026-06-16T00:01:59Z.

---

## 5. Seção crítica: ledger `d1_migrations` desalinhado

### 5.1 Estado do ledger

```text
Antes da aplicação: d1_migrations total = 404
Após a aplicação:   d1_migrations total = 404 (inalterado)
Entradas 0410 no ledger: 0
Entradas 0411 no ledger: 0
```

### 5.2 Causa

A execução usou `wrangler d1 execute --file` em vez de `wrangler d1 migrations apply`.
Isso foi intencional e necessário porque o ledger de produção estava em estado desalinhado
(migrations manuais anteriores não registradas), tornando `migrations apply` inapropriado
para esta cadeia sem rebaseline formal.

O schema foi aplicado corretamente no banco físico. O ledger não acompanhou automaticamente.
Esse é o comportamento esperado e documentado do comando `execute --file` do Cloudflare D1.

### 5.3 Implicação operacional

O ledger registra 404 entradas, mas o banco físico contém os objetos de 0410 e 0411.
Qualquer operação que tente derivar o estado do banco a partir do ledger estará errada.

---

## 6. PROIBIÇÃO ABSOLUTA — não reexecutar 0410/0411

### 6.1 Regra

**É PROIBIDO:**

- reexecutar `wrangler d1 execute --file migrations/0410_controle_voos_n1_schema.sql --env production --remote`
- reexecutar `wrangler d1 execute --file migrations/0411_controle_voos_sigvoos_integration_schema.sql --env production --remote`
- executar `wrangler d1 migrations apply airtrust-db --env production --remote` nessa cadeia

### 6.2 Consequência da reexecução

A migration 0411 usa `ALTER TABLE ... ADD COLUMN`. Em SQLite/D1, se a coluna já existe,
o comando falha com:

```
SqliteError: duplicate column name: <nome_da_coluna>
```

A migration 0410 usa `CREATE TABLE IF NOT EXISTS`, o que é idempotente, mas `CREATE INDEX IF NOT EXISTS`
em índices com `WHERE deleted_at IS NULL` pode se comportar de forma inesperada em D1
dependendo da versão do runtime.

O risco principal é a **0411**: reexecução causa erro imediato e interrompe a cadeia de apply.

### 6.3 Condição de desbloqueio

Reexecução de 0410/0411 em produção só pode ser considerada após:

1. Restauração a partir do snapshot pré-migration (rollback completo).
2. Confirmação formal de que os objetos `cv_*` foram removidos do banco físico.
3. Aprovação explícita de fase separada com novo runbook.

`wrangler d1 migrations apply` em produção para esta cadeia só pode ser usado após
rebaseline formal do ledger, com reconciliação documentada de todas as migrations manuais.

---

## 7. Rollback realista

### 7.1 Disponibilidade

Snapshot pré-migration disponível localmente (não versionado):

```text
/tmp/airtrust-d1-production-backups/airtrust-production-pre-0410-0411-20260615T235234Z.sql
Tamanho: 112.752.075 bytes (~112 MB)
```

### 7.2 Procedimento de rollback (controlado, não automático)

1. Confirmar disponibilidade e integridade do snapshot.
2. Criar novo snapshot do estado atual antes de restaurar.
3. Aprovar janela de manutenção com impacto zero em dados reais.
4. Reimportar snapshot via Cloudflare D1 import (ou API de restore disponível).
5. Validar ausência dos objetos `cv_*` após restore.
6. Registrar resultado em documento de rollback.

### 7.3 Limitações conhecidas

- `ALTER TABLE ADD COLUMN` em SQLite/D1 não pode ser desfeito por DDL reverso.
  Desfazer as colunas adicionadas pela 0411 exige recriação da tabela ou restore do snapshot.
- `git revert` do PR #43 remove os arquivos de migração do repositório, mas **não desfaz o banco remoto**.
  Revert Git ≠ rollback de banco.
- O snapshot está em `/tmp` (local efêmero). Deve ser movido para armazenamento persistente
  antes do próximo reinício da máquina.

---

## 8. Guardrails permanentes

Os seguintes guardrails devem ser mantidos em toda operação futura que envolva a cadeia SIGVOOS:

| Guardrail | Descrição |
|---|---|
| `execute --file` obrigatório | Qualquer nova migration nesta cadeia deve usar `execute --file` até que o ledger seja reconciliado |
| `migrations apply` proibido | `wrangler d1 migrations apply` não deve ser executado em produção para esta cadeia sem rebaseline formal do ledger |
| Reexecução bloqueada | 0410 e 0411 não devem ser reaplicadas em produção |
| API SIGVOOS bloqueada | Nenhuma chamada à API real SIGVOOS enquanto não houver deploy do runtime e aprovação de integração |
| Deploy separado | Deploy do Worker deve ser fase separada com PR próprio, aprovação e runbook |
| FRMS inalterado | `frms-source-policy.ts` não deve ser alterado fora de fase canônica de FRMS |
| Payload funcional bloqueado | Nenhum INSERT de dados reais ou sintéticos em produção sem aprovação e tenant sintético definido |

---

## 9. Validação funcional em produção — critérios de GO/NO-GO

### 9.1 O que foi validado até aqui

A validação funcional do fluxo de importação SIGVOOS foi executada em staging com fixtures sintéticas,
conforme registrado em `docs/SIGVOOS_STAGING_FUNCTIONAL_VALIDATION_REPORT.md`:

- 7 cenários exercitados
- 2 conflitos esperados e confirmados
- Segunda execução idempotente (0 criações, 8 reúsos)
- FRMS inalterado em staging

A produção recebeu o schema mas **não recebeu payload funcional**.

### 9.2 Critérios de GO para validação funcional em produção

Todos os itens abaixo devem estar satisfeitos:

- [ ] Tenant sintético aprovado em produção (empresa_id isolado, não-operacional)
- [ ] Fixtures sintéticas revisadas e aprovadas para produção
- [ ] Runner remoto governado para produção (derivado de `sigvoos-staging-remote-validation.ts` ou equivalente)
- [ ] Janela operacional definida (horário de baixo tráfego)
- [ ] Snapshot pré-validação criado e armazenado em local persistente
- [ ] Aprovação explícita de fase separada

### 9.3 Critérios de NO-GO / abortar validação

Abortar imediatamente se qualquer dos seguintes ocorrer:

- Tentativa de INSERT em tabela de tenant real (empresa_id ≠ tenant sintético aprovado)
- Chamada à API real SIGVOOS sem credenciais autorizadas e aprovação de integração
- Acesso a dados reais de voo, tripulação ou FRMS operacional
- Falha no guardrail de tenant isolation (trigger `trg_cv_*` bloqueando ou produzindo resultado inesperado)
- Qualquer escrita em `frms_jornada` ou `frms_alerta` de produção

---

## 10. Recomendação objetiva da próxima fase

**Estado atual:** schema aplicado, nenhum payload funcional, nenhum runtime exposto.

**Próxima fase recomendada:** Deploy controlado do Worker

1. Criar PR separado com deploy do Worker SIGVOOS (sem migration nova).
2. Confirmar que as rotas de importação SIGVOOS estão protegidas por `requireRole('admin')`.
3. Confirmar que nenhuma rota SIGVOOS é pública ou acessível sem autenticação.
4. Testar localmente com `npm start` e worker local antes de deployar.
5. Deploy via `npm run deploy:worker:safe` ou equivalente aprovado.
6. Pós-deploy: verificar health check sem payload real.

**Após o deploy do runtime:**

- Fase de validação funcional em produção com tenant sintético aprovado (conforme seção 9).
- Fase de integração com API real SIGVOOS em janela separada com aprovação específica.

---

## 11. Validações locais executadas nesta fase

```text
git diff --check                              PASS
bash scripts/check-tracked-secrets.sh        PASS ([tracked-secrets] OK)
bash scripts/validation/audit-deploy-scripts.sh  PASS (inventário; deploy-worker-safe sem proibidos)
bash scripts/audit-dangerous-ops.sh          PASS (1 warning inventarial pré-existente)
npx tsc --noEmit --pretty false              PASS (sem erros de tipo)
```

---

## 12. Resumo final estruturado

```text
VEREDITO                         = PRODUCAO SCHEMA APLICADO — GOVERNANCA REGISTRADA
SELECT_REMOTO_EXECUTADO          = NAO (estado derivado de docs/SIGVOOS_PRODUCTION_0410_0411_EXECUTION_REPORT.md)
MIGRATION_0410_EM_PRODUCAO       = APLICADA
MIGRATION_0411_EM_PRODUCAO       = APLICADA
PAYLOAD_FUNCIONAL_EM_PRODUCAO    = NAO
API_REAL_SIGVOOS_CHAMADA         = NAO
DEPLOY_EXECUTADO                 = NAO
FRMS_INTOCADO                    = SIM
FRMS_SOURCE_POLICY_INTOCADO      = SIM
LEDGER_D1_MIGRATIONS             = DESALINHADO (404, sem entrada 0410/0411)
REEXECUCAO_0410_0411_PROIBIDA    = SIM
MIGRATIONS_APPLY_PROIBIDO        = SIM (sem rebaseline formal)
SNAPSHOT_PRE_MIGRATION           = DISPONIVEL (/tmp — mover para armazenamento persistente)
ROLLBACK_DISPONIVEL              = SIM (por snapshot/restore, NAO por git revert)
PROXIMA_FASE                     = Deploy controlado do Worker (fase separada, PR próprio)
```

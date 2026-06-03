# AirTrust — DDL M1 Schema Probe Evidence

## 1. Objetivo

Executar um probe estrutural read-only para decidir qual caminho seguir para a futura M1 de `solicitacoes_treinamento`, sem alterar schema, dados, runtime ou ambiente remoto.

## 2. Motivo da parada anterior

A Sprint X foi interrompida porque `ensureSolicitacoesTreinamentoLinkSchema()` pode ter criado `treinamento_planejado_id`, `status_pre_agendamento` e `idx_solicitacoes_treinamento_planejado` em alguns ambientes via runtime, enquanto a migration proposta continuaria usando `ALTER TABLE ... ADD COLUMN` simples. Em SQLite/D1, isso pode falhar com `duplicate column name`.

## 3. Ambiente consultado

- Repositório: `/Users/filipedaumas/SAAS/Airtrust`
- Branch: `main`
- HEAD consultado: `cf5866907d820fb085472f748243968c6d03510d`
- Probe local: snapshot D1 em `worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`
- Probe de staging/produção: não executado

## 4. Autorização

- `AIRTRUST_ALLOW_SCHEMA_PROBE=UNSET`
- `AIRTRUST_SCHEMA_PROBE_TARGET=UNSET`
- `AIRTRUST_CONFIRM_READ_ONLY_SCHEMA_PROBE=UNSET`
- `AIRTRUST_CONFIRM_PRODUCTION_READ_ONLY=UNSET`

Conclusão: probe de staging/produção não estava autorizado. Para o alvo local, a execução foi feita explicitamente com env transitória e somente sobre snapshot local.

## 5. Resultado estrutural

| Target | Table exists | treinamento_planejado_id | status_pre_agendamento | idx_solicitacoes_treinamento_planejado | Status |
|---|---|---|---|---|---|
| `local` | yes | no | no | no | `PASS` |
| `staging/production` | unknown | unknown | unknown | unknown | `SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED` |

## 6. Interpretação

O snapshot local confirma apenas o caminho de ambiente limpo: a tabela `solicitacoes_treinamento` existe e não contém ainda as 2 colunas de link nem o índice parcial. Isso é compatível com uma M1 simples em ambiente local limpo.

Esse resultado não é suficiente para decidir a M1 do ambiente aprovado. O runtime DDL pode já ter criado essas estruturas em staging ou produção, e esse é exatamente o cenário que faria a migration simples falhar.

## 7. Decisão para M1

Decisão atual: **não criar a migration M1 ainda**.

Classificação aplicada ao R03: `BLOCKED_SCHEMA_PROBE_REQUIRED`.

Motivo: falta probe read-only autorizado em ambiente aprovado para confirmar se:

- as 2 colunas estão ausentes;
- as colunas já existem e só falta o índice;
- tudo já existe e a migration deve ser evitada.

## 8. Próxima ação

Autorizar probe read-only em ambiente aprovado com:

```bash
export AIRTRUST_ALLOW_SCHEMA_PROBE=YES
export AIRTRUST_SCHEMA_PROBE_TARGET=staging
export AIRTRUST_CONFIRM_READ_ONLY_SCHEMA_PROBE=YES
```

Ou, se o operador aprovar explicitamente produção read-only:

```bash
export AIRTRUST_ALLOW_SCHEMA_PROBE=YES
export AIRTRUST_SCHEMA_PROBE_TARGET=production
export AIRTRUST_CONFIRM_READ_ONLY_SCHEMA_PROBE=YES
export AIRTRUST_CONFIRM_PRODUCTION_READ_ONLY=YES
```

Depois disso, reexecutar `scripts/validation/probe-solicitacoes-treinamento-schema-readonly.sh` e só então decidir entre:

- `READY_FOR_SIMPLE_M1`
- `READY_FOR_INDEX_ONLY_M1`
- `READY_TO_REMOVE_RUNTIME_FALLBACK_NO_MIGRATION`
- `ENVIRONMENT_DRIFT_REQUIRES_PLAN`

## 9. Confirmações de segurança (Sprint X.0)

- Nenhuma migration foi criada.
- Nenhum schema foi alterado.
- Nenhum `ALTER/CREATE/DROP/INSERT/UPDATE/DELETE` foi executado.
- Nenhum `wrangler d1 execute --remote` foi usado.
- Nenhum dado real foi alterado.
- Nenhum deploy foi executado.
- Nenhum secret foi versionado.
- Nenhuma PII foi registrada.

---

## 10. Sprint X.1 — Tentativa de probe autorizado (2026-06-03)

### 10.1 Estado inicial

- Branch: `main`
- HEAD: `c09c0cbf4eef01cf93943592761952df3af2c201`
- origin/main: `c09c0cbf4eef01cf93943592761952df3af2c201`
- Divergência: 0 left, 0 right
- preflight: PASS
- ops:guard: PASS (2 warnings, não bloqueantes)
- Tracked pendentes: nenhum

### 10.2 Script de probe

- Script: `scripts/validation/probe-solicitacoes-treinamento-schema-readonly.sh`
- Sintaxe bash: OK (`bash -n` sem erros)
- Operações: somente PRAGMA table_info, PRAGMA index_list, PRAGMA index_info
- Bloqueio de produção sem confirmação: presente
- Impressão de dados de linha: ausente
- DML/DDL: ausente
- Cópia de segurança: snapshot temporário via `cp` antes de qualquer query

### 10.3 Autorização (Part C)

| Variável | Valor |
|---|---|
| `AIRTRUST_ALLOW_SCHEMA_PROBE` | UNSET |
| `AIRTRUST_SCHEMA_PROBE_TARGET` | UNSET |
| `AIRTRUST_CONFIRM_READ_ONLY_SCHEMA_PROBE` | UNSET |
| `AIRTRUST_CONFIRM_PRODUCTION_READ_ONLY` | UNSET |

Todas as 4 variáveis de autorização estão UNSET. Nenhum target foi especificado.

### 10.4 Resultado do probe

```
STATUS=SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED
REASON=AIRTRUST_ALLOW_SCHEMA_PROBE_not_set
```

- target: nenhum (não autorizado)
- table exists: não consultado
- treinamento_planejado_id exists: não consultado
- status_pre_agendamento exists: não consultado
- idx_solicitacoes_treinamento_planejado exists: não consultado
- run status: SKIPPED
- produção tocada: não
- dados de linha consultados: não
- PII: não

### 10.5 Interpretação

A Sprint X.1 não conseguiu avançar além do SKIPPED porque o operador ainda não definiu as 4 variáveis de autorização. O script de probe está correto, seguro e pronto — a barreira é exclusivamente de autorização humana.

O cenário permanece idêntico ao da Sprint X.0: o snapshot local confirma tabela limpa (sem colunas de link, sem índice), mas o estado real de staging/produção é desconhecido. O runtime DDL (`ensureSolicitacoesTreinamentoLinkSchema()`) pode já ter criado as estruturas em staging ou produção, e a M1 simples falharia com `duplicate column name` nesse caso.

### 10.6 Decisão para M1 (atualizada)

Decisão atual: **não criar a migration M1 ainda**.

Classificação aplicada ao R03: `BLOCKED_SCHEMA_PROBE_REQUIRED`.

A decisão real da M1 segue bloqueada porque o ambiente aprovado ainda não foi verificado. Os possíveis caminhos continuam sendo:

| Cenário | Classificação |
|---|---|
| Colunas e índice ausentes | `READY_FOR_SIMPLE_M1` |
| Colunas presentes, índice ausente | `READY_FOR_INDEX_ONLY_M1` |
| Colunas e índice presentes | `READY_TO_REMOVE_RUNTIME_FALLBACK_NO_MIGRATION` |
| Ambientes divergentes | `ENVIRONMENT_DRIFT_REQUIRES_PLAN` |
| Probe não autorizado (atual) | `BLOCKED_SCHEMA_PROBE_REQUIRED` |

### 10.7 Próxima ação (Sprint X.2)

Operador deve executar no terminal:

```bash
export AIRTRUST_ALLOW_SCHEMA_PROBE=YES
export AIRTRUST_SCHEMA_PROBE_TARGET=staging
export AIRTRUST_CONFIRM_READ_ONLY_SCHEMA_PROBE=YES
```

Ou, para produção read-only:

```bash
export AIRTRUST_ALLOW_SCHEMA_PROBE=YES
export AIRTRUST_SCHEMA_PROBE_TARGET=production
export AIRTRUST_CONFIRM_READ_ONLY_SCHEMA_PROBE=YES
export AIRTRUST_CONFIRM_PRODUCTION_READ_ONLY=YES
```

Depois reexecutar a Sprint X.1 com as variáveis presentes.

**Nota técnica:** O script atual só implementa o runner local. Para staging/production, o `case` do script cai em:
```
SKIPPED_NO_APPROVED_SCHEMA_PROBE_RUNNER
remote_probe_requires_non_remote_approved_runner
```
Será necessário ou (a) estender o script com um runner remoto read-only via `wrangler d1 execute --remote` com PRAGMA, ou (b) o operador executar o PRAGMA manualmente no dashboard e reportar o resultado. A Sprint X.2 deve decidir qual caminho.

### 10.8 Confirmações de segurança (Sprint X.1)

- Nenhuma migration foi criada.
- Nenhum schema foi alterado.
- Nenhum `ALTER/CREATE/DROP/INSERT/UPDATE/DELETE` foi executado.
- Nenhum `wrangler d1 execute --remote` foi usado.
- Nenhum dado real foi consultado ou alterado.
- Nenhum deploy foi executado.
- Nenhum secret foi versionado.
- Nenhuma PII foi registrada.
- Nenhum `git add .` foi usado.
- Apenas arquivos `docs/` do escopo foram alterados.

---

## 11. Sprint X.2 — Runner remoto read-only (2026-06-03)

### 11.1 Estado inicial

- Branch: `main`
- HEAD: `d775bea23bbd45d2c819d4f2ae1ed165a25fe490`
- origin/main: `d775bea23bbd45d2c819d4f2ae1ed165a25fe490`
- Divergência: 0 left, 0 right
- preflight: PASS
- ops:guard: PASS (2 warnings, não bloqueantes)
- Tracked pendentes: nenhum

### 11.2 Runner remoto read-only

O script `scripts/validation/probe-solicitacoes-treinamento-schema-readonly.sh` foi estendido com suporte a execução remota.

**Capacidades adicionadas:**

| Funcionalidade | Detalhes |
|---|---|
| `run_remote_probe()` | Executa PRAGMA via `wrangler d1 execute --remote --json --command="..."` |
| Target staging | `airtrust-db-staging` (ID: `b7f50907-...`) |
| Target production | `airtrust-db` (ID: `7c8a788e-...`) |
| SQL validado | Cada PRAGMA passa por `validate_readonly_sql` antes da execução |
| Parse seguro | `grep -q` no JSON output do wrangler — busca apenas nomes de colunas e índices |
| Output sanitizado | Apenas yes/no estruturais; nenhum dado de linha, nenhum valor de coluna, nenhum PII |
| Fail-closed | Se wrangler falhar → FAIL com classificação (auth, network, other); erro bruto não é impresso |
| Classificação de erro | `not_authenticated`, `network_error`, ou `generic` — para diagnóstico sem expor output |

**SQL permitido (validado antes de execução):**
- `PRAGMA table_info(solicitacoes_treinamento);`
- `PRAGMA index_list(solicitacoes_treinamento);`
- `PRAGMA index_info(idx_solicitacoes_treinamento_planejado);`

**Guardas de validação testadas:**

| Entrada | Resultado |
|---|---|
| `PRAGMA table_info(...)` | OK |
| `PRAGMA index_list(...)` | OK |
| `ALTER TABLE ... ADD COLUMN` | REJECT (non_readonly) |
| `INSERT INTO ... VALUES` | REJECT (non_readonly) |
| `SELECT * FROM ...` | REJECT (select_star) |
| `UPDATE ... SET ...` | REJECT (non_readonly) |
| `DELETE FROM ...` | REJECT (non_readonly) |
| `DROP TABLE ...` | REJECT (non_readonly) |
| `CREATE INDEX ...` | REJECT (non_readonly) |
| `SELECT name FROM sqlite_master` | OK (structural only) |

### 11.3 Autorização (Parte D)

| Variável | Valor |
|---|---|
| `AIRTRUST_ALLOW_SCHEMA_PROBE` | UNSET |
| `AIRTRUST_SCHEMA_PROBE_TARGET` | UNSET |
| `AIRTRUST_CONFIRM_READ_ONLY_SCHEMA_PROBE` | UNSET |
| `AIRTRUST_CONFIRM_PRODUCTION_READ_ONLY` | UNSET |

### 11.4 Resultado do probe (Parte E)

```
STATUS=SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED
REASON=AIRTRUST_ALLOW_SCHEMA_PROBE_not_set
```

- target: nenhum (não autorizado)
- table exists: não consultado
- treinamento_planejado_id exists: não consultado
- status_pre_agendamento exists: não consultado
- idx_solicitacoes_treinamento_planejado exists: não consultado
- run status: SKIPPED
- DML/DDL executed: no
- row data queried: no
- PII: no
- remote runner used: no (authorization blocked before runner selection)

### 11.5 Testes de autorização (cenários adicionais)

| Cenário | Env vars | Resultado |
|---|---|---|
| Sem autorização | Nenhuma definida | `SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED` |
| Staging sem `CONFIRM_READ_ONLY` | `ALLOW=YES`, `TARGET=staging` | `SKIPPED` |
| Production sem `PRODUCTION_READ_ONLY` | `ALLOW=YES`, `TARGET=production`, `CONFIRM_READ_ONLY=YES` | `SKIPPED` |
| Local autorizado | Todas staging vars + `TARGET=local` | `PASS` (table: yes, cols: no, idx: no) |
| Staging autorizado (sem wrangler auth) | Todas staging vars | `FAIL: remote_wrangler_error` (esperado — sem token Cloudflare) |

### 11.6 Interpretação

A Sprint X.2 atingiu seu objetivo principal: **o runner remoto read-only está implementado, testado e fail-closed.** O script agora suporta 3 targets:

1. **local** — continua funcionando via sqlite3 + snapshot (comprovado: `PASS`)
2. **staging** — pronto, aguardando `wrangler login` + env vars
3. **production** — pronto, aguardando `wrangler login` + todas as 4 env vars

A barreira agora é dupla:
- **Autorização de ambiente:** env vars ainda não definidas pelo operador.
- **Autenticação Cloudflare:** `wrangler login` necessário para `d1 execute --remote`.

Ambas são barreiras humanas/operacionais, não técnicas. O script está completo.

### 11.7 Decisão para M1 (atualizada)

Decisão atual: **não criar a migration M1 ainda.**

Classificação aplicada ao R03: `BLOCKED_SCHEMA_PROBE_REQUIRED`.

O estado do ambiente aprovado permanece desconhecido. O runner está pronto — assim que o operador definir as env vars e tiver `wrangler login` ativo, o probe remoto poderá ser executado em segundos.

### 11.8 Próxima ação (Sprint X.3)

Operador deve:

```bash
# 1. Autenticar na Cloudflare (se ainda não feito)
npx wrangler login

# 2. Definir variáveis de autorização
export AIRTRUST_ALLOW_SCHEMA_PROBE=YES
export AIRTRUST_SCHEMA_PROBE_TARGET=staging   # ou production
export AIRTRUST_CONFIRM_READ_ONLY_SCHEMA_PROBE=YES
# Se production, também:
export AIRTRUST_CONFIRM_PRODUCTION_READ_ONLY=YES

# 3. Executar o probe
bash scripts/validation/probe-solicitacoes-treinamento-schema-readonly.sh
```

Após a execução, a decisão da M1 será reclassificada automaticamente conforme o resultado estrutural.

### 11.9 Confirmações de segurança (Sprint X.2)

- Nenhuma migration foi criada.
- Nenhum schema foi alterado.
- Nenhum `ALTER/CREATE/DROP/INSERT/UPDATE/DELETE` foi executado.
- Nenhum `wrangler d1 execute --remote` foi executado com sucesso contra staging ou produção (tentativa bloqueada por falta de autenticação Cloudflare).
- Nenhum dado real foi consultado ou alterado.
- Nenhum deploy foi executado.
- Nenhum secret foi versionado.
- Nenhuma PII foi registrada.
- Nenhum `git add .` foi usado.
- Apenas arquivos `scripts/validation/` e `docs/` do escopo foram alterados.

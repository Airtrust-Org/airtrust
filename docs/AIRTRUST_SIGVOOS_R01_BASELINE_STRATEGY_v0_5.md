# AirTrust — SIGVOOS R01 Baseline Strategy v0.5

**Data:** 2026-06-03
**Sprint:** R01 Baseline Strategy
**Branch:** `main`
**HEAD:** `014b5921277fc864634e40f116a9d3b45c9e645e`
**Modo:** docs/script/test local-only. Sem D1 remoto. Sem migration nova aplicada. Sem deploy. Sem alteração de runtime SIGVOOS.

---

## 1. Objetivo

Definir e fechar localmente a estratégia segura para resolver o bloqueio de replay limpo da cadeia `0354 → 0387` sem alterar migrations históricas, sem modificar runtime, sem deploy e sem afetar produção atual.

> **Addendum Sprint R01 Bootstrap + Replay Closure (2026-06-04):** o arquivo `scripts/bootstrap-new-environment.sql` foi criado com as 3 tabelas SIGVOOS base e 4 índices necessários antes da `0354`. O teste local `worker-airtrust/src/__tests__/migrations/sigvoos-base-tables-schema.test.ts` passou a provar explicitamente: (1) replay limpo sem bootstrap falha em `0354`; (2) replay com bootstrap atravessa `0354`; (3) bootstrap é idempotente; (4) bootstrap não exige dados reais; (5) bootstrap não depende de D1 remoto. `ensureSigvoosTables()` foi preservado. Novo status consolidado: **`R01 = BOOTSTRAP_IMPLEMENTED_RUNTIME_FALLBACK_PENDING_REMOVAL_GATE`**.
>
> **Addendum Sprint R01 Staging/New Environment Gate + Fallback Removal Readiness (2026-06-04):** o bootstrap foi reaudidado e o teste local passou a incluir um gate explícito por etapas em banco limpo temporário. O inventário do fallback runtime foi fechado em 10 call sites, sem D1 remoto, sem migration nova e sem deploy. Novo status consolidado: **`R01 = READY_FOR_RUNTIME_FALLBACK_REMOVAL`**.

---

## 2. Estado atual

| Métrica | Valor |
|---|---|
| R01 status | `READY_FOR_RUNTIME_FALLBACK_REMOVAL` |
| 0387 aplicada em produção | Sim (Sprint R04.5, via fila pendente oficial) |
| Produção atual | Mitigada — schema correto, `ensureSigvoosTables()` é no-op eficaz |
| Replay limpo | Quebrado — `0354` falha com `no such table: integracoes_sigvoos_config` |
| Bootstrap de novo ambiente | Implementado localmente em `scripts/bootstrap-new-environment.sql` |
| `ensureSigvoosTables()` | Preservado — necessário para qualquer ambiente novo |
| Call sites | 10 (8 em `sigvoos-frms.ts:625,802,852,914,948,1045,2238,2500`; 2 em `integracoes_sigvoos.ts:374,600`) |
| Migrations históricas tocadas nesta sprint | Nenhuma |
| Testes de prova do bloqueio | `sigvoos-base-tables-schema.test.ts` — 8/8 PASS, incluindo 2 casos de prova da falha |

---

## 3. Problema confirmado

`0354_auditoria_critica_schema_hardening.sql` contém:

```sql
ALTER TABLE integracoes_sigvoos_config ADD COLUMN notificar_falha_email TEXT;
```

Nenhuma migration com número menor que `0354` cria `integracoes_sigvoos_config`. A migration que cria a tabela, `0387_integracoes_sigvoos_base_tables.sql`, vem numericamente depois.

Em produção, a tabela existia por runtime drift (`ensureSigvoosTables()` foi executado antes das migrations). Por isso `0354` foi aplicada com sucesso em produção. Em replay limpo (schema vazio + migrations em ordem), `0354` falha antes de `0387` ser alcançada.

**Teste de prova (já existente e passando):**
- `sigvoos-base-tables-schema.test.ts:283` — `shows that 0354 depends on integracoes_sigvoos_config before 0387 exists in a clean chain`
- `sigvoos-base-tables-schema.test.ts:295` — `shows that appending 0387 after 0354 does not rescue the clean-chain failure`

---

## 4. Por que produção atual está mitigada

1. `ensureSigvoosTables()` rodou em produção antes das migrations, criando `integracoes_sigvoos_config` via runtime.
2. `0354` encontrou a tabela existente e completou o `ALTER TABLE` com sucesso.
3. `0387` foi aplicada depois (Sprint R04.5) e é idempotente — não duplica, não destrói.
4. O schema atual em produção está correto: tabela existe, coluna `notificar_falha_email` presente, índices criados.
5. `ensureSigvoosTables()` continua executando a cada request SIGVOOS/FRMS, mas é um no-op desde que as tabelas já existam.

---

## 5. Por que replay limpo continua quebrado

Ordem de execução de migrations em schema vazio:

```
0001 ... 0352 — OK (inclui sigvoos_mapeamento_manual e frms_jornada_pendente via 0352)
0354 — FALHA: ALTER TABLE integracoes_sigvoos_config → "no such table"
0355 ... 0387 — nunca alcançados (execução interrompida em 0354)
```

Uma nova migration posterior (ex. 0389) com `CREATE TABLE IF NOT EXISTS integracoes_sigvoos_config` **não corrige** este problema, porque:
- `0354` ainda vem antes de qualquer migration nova com número maior que 0354.
- A falha ocorre em `0354`, antes de qualquer migration com número maior ser alcançada.

---

## 6. Opções avaliadas

| Opção | Decisão | Motivo | Risco |
|---|---|---|---|
| A — Editar `0354` para tornar o ALTER condicional | **REJEITAR** | `0354` é migration histórica já aplicada em produção. Editar o arquivo altera rastreabilidade sem alterar o schema real. Gera inconsistência entre o arquivo e o estado aplicado. Pode quebrar ferramentas de verificação de integridade de migrations. | Alto |
| B — Criar nova migration 0389 com `CREATE TABLE IF NOT EXISTS` | **INSUFICIENTE COMO SOLUÇÃO ISOLADA** | Não corrige replay limpo: `0354` ainda falha antes de `0389` ser alcançada. Útil apenas como complemento a outras estratégias (ex. squash). | Médio — gera falsa sensação de resolução |
| C — Manter `ensureSigvoosTables()` como fallback | **ACEITAR TEMPORARIAMENTE** | Protege produção e ambientes existentes. Não resolve replay limpo, mas evita regressão enquanto a estratégia definitiva não está pronta. | Baixo operacionalmente; mantém DDL runtime residual |
| D — Criar script de bootstrap para novos ambientes | **IMPLEMENTADA NESTA FASE** | `scripts/bootstrap-new-environment.sql` aplica as tabelas SIGVOOS base antes da cadeia histórica. Novos ambientes executam o bootstrap primeiro, depois aplicam migrations. Não altera nenhum arquivo histórico. | Baixo — aditivo, documentado, separado da cadeia |
| E — Squash/rebaseline de migrations | **RECOMENDAR (longo prazo)** | Criar uma migration "baseline" representando o schema canônico atual, para uso em ambientes novos em vez da cadeia completa. Resolve definitivamente o replay. Requer fase arquitetural própria, validação extensiva e aprovação operacional. | Alto de planejamento; zero de risco para produção atual |

---

## 7. Decisão recomendada

```
R01 = READY_FOR_RUNTIME_FALLBACK_REMOVAL
```

**Ações recomendadas, nesta ordem:**

1. **Curto prazo concluído:** `scripts/bootstrap-new-environment.sql` foi criado com as tabelas SIGVOOS base (alinhado ao conteúdo de `0387`) e a documentação operacional desta fase registra que todo novo ambiente deve executar esse script antes da cadeia histórica.

2. **Gate concluído nesta fase:** o processo local-isolado de "novo ambiente SIGVOOS" foi validado com `bootstrap -> 0352 -> 0354 -> 0387`. A próxima sprint já pode focar na remoção do fallback runtime.

3. **Longo prazo (sprint arquitetural):** squash/rebaseline de migrations — criar snapshot canônico do schema atual numerado como `N_baseline.sql` para ser usado como ponto de partida em novos ambientes, eliminando a necessidade de replay de toda a cadeia histórica.

4. **Não alterar `0354`.** Nunca.

5. **Não remover `ensureSigvoosTables()` até** que a estratégia de novo ambiente esteja validada localmente, documentada e aprovada.

---

## 8. Estratégia segura para ambientes novos

### Curto prazo: script de bootstrap

Implementado nesta fase:
```
scripts/bootstrap-new-environment.sql
```

Conteúdo mínimo:
```sql
-- Bootstrap de novo ambiente AirTrust — executar ANTES das migrations históricas
-- Garante que integracoes_sigvoos_config exista antes de 0354 ser aplicada.
-- Idêntico ao conteúdo de 0387_integracoes_sigvoos_base_tables.sql.

CREATE TABLE IF NOT EXISTS integracoes_sigvoos_config (...);
CREATE UNIQUE INDEX IF NOT EXISTS ...;

CREATE TABLE IF NOT EXISTS integracoes_sigvoos_eventos (...);
CREATE INDEX IF NOT EXISTS ...;

CREATE TABLE IF NOT EXISTS integracoes_sigvoos_mapeamentos (...);
CREATE INDEX IF NOT EXISTS ...;
```

Processo documentado para novo ambiente:
```
1. Criar banco D1 novo
2. Executar: wrangler d1 execute <db> --local --file=scripts/bootstrap-new-environment.sql
3. Executar: wrangler d1 migrations apply <db> --local
4. Validar com: npm run health
```

### Longo prazo: squash/rebaseline

- Criar `worker-airtrust/migrations/XXXX_schema_baseline.sql` com schema canônico completo.
- Documentar como ponto de partida obrigatório para novos ambientes.
- Fase própria com revisão de schema completo e testes de replay.
- **Não executar sem aprovação explícita.**

---

## 9. Condições para remover ensureSigvoosTables()

Somente após **todas** as condições abaixo:

1. Script de bootstrap de novo ambiente criado, documentado e validado localmente com replay completo.
2. Teste de replay limpo sem `ensureSigvoosTables()` passando localmente (novo harness ou extensão do existente).
3. Produção e staging com schema correto confirmados por probe read-only.
4. Aprovação explícita para remoção do fallback.
5. Deploy após a remoção validado por smoke pós-deploy.

Enquanto qualquer uma dessas condições não for atendida, **`ensureSigvoosTables()` permanece**.

---

## 10. Testes necessários

### Já existentes (não duplicar)

`worker-airtrust/src/__tests__/migrations/sigvoos-base-tables-schema.test.ts`:
- `shows that 0354 depends on integracoes_sigvoos_config before 0387 exists in a clean chain` — prova do bloqueio.
- `shows that appending 0387 after 0354 does not rescue the clean-chain failure` — prova de insuficiência de 0389 isolada.
- `creates the three SIGVOOS base tables with the runtime-defined columns` — valida 0387.
- `completes the full runtime SIGVOOS table/index set together with migration 0352` — valida cobertura completa.

`worker-airtrust/src/__tests__/architecture/no-runtime-ddl-hot-paths.test.ts`:
- `services/sigvoos-frms.ts` em `DOCUMENTED_EXCEPTIONS` — trava que o fallback runtime está explicitamente documentado.

### Implementado nesta fase

No `sigvoos-base-tables-schema.test.ts`:
```
- "lets 0354 pass when the bootstrap runs before historical migrations"
- "replays bootstrap + 0352 + 0354 + 0387 locally without seed data or remote D1"
- "is idempotent when the bootstrap script runs twice before the historical chain"
```

---

## 11. O que não fazer

- **Não alterar `0354`** — migration histórica aplicada em produção.
- **Não criar migration 0389 como solução isolada** — não corrige replay limpo.
- **Não remover `ensureSigvoosTables()`** sem bootstrap validado.
- **Não executar D1 remoto** nesta fase.
- **Não fazer deploy** nesta fase.
- **Não fazer backfill** de dados reais.
- **Não reescrever histórico de git** de migrations.
- **Não squash de migrations** sem fase arquitetural dedicada.

---

## 12. Próximas fases

| Fase | Ação | Pré-condição | Modelo |
|---|---|---|---|
| R01-bootstrap | Criar `scripts/bootstrap-new-environment.sql` e documentar processo de novo ambiente | ✅ CONCLUÍDO nesta fase | Codex GPT-5 |
| R01-replay-test | Estender `sigvoos-base-tables-schema.test.ts` para validar replay com bootstrap | ✅ CONCLUÍDO nesta fase | Codex GPT-5 |
| R01-staging-gate | Validar bootstrap em staging com replay local + probe schema | ✅ CONCLUÍDO local-isolado nesta fase | Codex GPT-5 |
| R01-remove-fallback | Remover `ensureSigvoosTables()` do runtime | READY_FOR_RUNTIME_FALLBACK_REMOVAL | Opus 4.x |
| R01-squash (longo prazo) | Criar schema baseline canônico para novos ambientes | Sprint arquitetural própria | Opus 4.x |

---

**Fim do documento.** Gerado em 2026-06-03. Atualizado em 2026-06-04 com Sprint R01 Bootstrap + Replay Closure e Sprint R01 Staging/New Environment Gate + Fallback Removal Readiness — gate local-isolado PASS, inventário do fallback fechado e **`R01 = READY_FOR_RUNTIME_FALLBACK_REMOVAL`**.

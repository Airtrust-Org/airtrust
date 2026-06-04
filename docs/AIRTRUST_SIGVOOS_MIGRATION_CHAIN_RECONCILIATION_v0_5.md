# AirTrust — SIGVOOS Migration Chain Reconciliation v0.5

**Data:** 2026-06-03
**Sprint:** R01 — SIGVOOS Chain Reconciliation
**Branch:** `main`
**HEAD:** `94879b88e9a7845a523efc59700230af0556dea2`
**Modo:** docs/readiness/test-only. Sem D1 remoto. Sem migration nova. Sem deploy. Sem alteração de runtime SIGVOOS.

---

## 1. Objetivo

Auditar a cadeia `0354 → 0387`, formalizar o achado de bloqueio de replay limpo, e definir a decisão conservadora sobre o fallback `ensureSigvoosTables()` nesta sprint.

O resultado desta sprint é um documento de decisão que:
- confirma o achado técnico com prova por teste local;
- explica o impacto diferenciado em produção atual vs. ambiente limpo;
- recomenda manter o fallback até que um plano de baseline/cadeia seja definido;
- não executa migrations remotas, não altera produção, não remove o fallback.

---

## 2. Estado atual

| Métrica | Valor |
|---|---|
| 0387 aplicada em produção | Sim (Sprint R04.5, via fila pendente) |
| Status R01 | `READY_FOR_RUNTIME_FALLBACK_REMOVAL` |
| Fallback runtime | `ensureSigvoosTables()` preservado |
| Teste de prova local | 8/8 PASS (`sigvoos-base-tables-schema.test.ts`) |
| Migration nova criada nesta sprint | Não |
| D1 remoto tocado nesta sprint | Não |
| Deploy executado nesta sprint | Não |
| Runtime SIGVOOS alterado nesta sprint | Não |

---

## 3. Achado central

`0354_auditoria_critica_schema_hardening.sql` contém:

```sql
ALTER TABLE integracoes_sigvoos_config ADD COLUMN notificar_falha_email TEXT;
```

Esta operação assume que `integracoes_sigvoos_config` já existe. Porém:

- Nenhuma migration com número menor que `0354` cria `integracoes_sigvoos_config`.
- `0387_integracoes_sigvoos_base_tables.sql` cria a tabela, mas vem numericamente **depois** da `0354`.
- Em produção atual, a tabela existia por drift de runtime (`ensureSigvoosTables()` criou-a antes das migrations serem aplicadas); por isso `0354` foi aplicada com sucesso.
- Em ambiente novo que aplique migrations em ordem numérica estrita, `0354` falha antes de `0387` ser alcançada.

---

## 4. Linha do tempo 0354 → 0387

| Migration | Operação | Objeto | Seguro em produção atual | Seguro em replay limpo | Observação |
|---|---|---|---|---|---|
| `0352_sigvoos_frms_pendencias_e_enriquecimento.sql` | `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE` | `sigvoos_mapeamento_manual`, `frms_jornada_pendente`, `frms_jornada` | Sim | Parcial | Cobre 2 das 5 tabelas runtime SIGVOOS; exige `frms_jornada` existente |
| `0354_auditoria_critica_schema_hardening.sql` | `ALTER TABLE integracoes_sigvoos_config ADD COLUMN notificar_falha_email TEXT` | `integracoes_sigvoos_config` | Sim (tabela já existia via runtime drift) | **Não** — falha com `no such table: integracoes_sigvoos_config` | Depende de tabela não criada por nenhuma migration anterior |
| `0387_integracoes_sigvoos_base_tables.sql` | `CREATE TABLE IF NOT EXISTS` × 3, `CREATE INDEX IF NOT EXISTS` × 4 | `integracoes_sigvoos_config`, `integracoes_sigvoos_eventos`, `integracoes_sigvoos_mapeamentos` | Sim (idempotente) | Não resolve — `0354` falha antes de `0387` ser alcançada | Versiona corretamente o schema runtime, mas número é maior que `0354` |

---

## 5. Impacto em produção atual

Produção está **não afetada**:
- `integracoes_sigvoos_config` existia por runtime drift antes da aplicação de `0354`.
- `0354` foi aplicada com sucesso historicamente.
- `0387` foi aplicada em Sprint R04.5 (via fila pendente oficial); resultado idempotente.
- SIGVOOS funciona em produção com o schema correto.
- `ensureSigvoosTables()` continua sendo executado a cada request SIGVOOS/FRMS, mas é um no-op eficaz desde que as tabelas já existam.

---

## 6. Impacto em ambiente novo / replay limpo

Em ambiente que aplique migrations em ordem numérica:
1. Migrations `0001` … `0352` aplicadas sem erro.
2. `0354` é alcançada; tenta `ALTER TABLE integracoes_sigvoos_config …`.
3. Falha: `no such table: integracoes_sigvoos_config`.
4. `0387` nunca é executada — o bloqueio ocorre antes.

Resultado: **ambiente novo não pode ser provisionado apenas por migrations em ordem.**

Prova local (dois testes em `sigvoos-base-tables-schema.test.ts`):
- `shows that 0354 depends on integracoes_sigvoos_config before 0387 exists in a clean chain` — PASS.
- `shows that appending 0387 after 0354 does not rescue the clean-chain failure` — PASS.

---

## 7. Papel atual do ensureSigvoosTables()

`ensureSigvoosTables()` em `worker-airtrust/src/services/sigvoos-frms.ts` (linhas 690–794):
- Cria as 5 tabelas SIGVOOS + 8 índices com `IF NOT EXISTS`.
- É chamado em 10 call sites antes de toda operação de leitura/escrita SIGVOOS/FRMS.
- Em produção atual: execução é majoritariamente no-op (tabelas já existem).
- Em ambiente novo sem cadeia de migrations reconciliada: é o único mecanismo que garante a criação das tabelas base.

**Conclusão:** o fallback permanece necessário enquanto a cadeia limpa não estiver reconciliada.

> **Addendum Sprint R01 Bootstrap + Replay Closure (2026-06-04):** a reconciliação local da cadeia ganhou um bootstrap operacional explícito para ambiente novo: `scripts/bootstrap-new-environment.sql`. O replay sem bootstrap continua falhando em `0354`, mas o replay com bootstrap agora atravessa `0354` localmente e mantém `0387` idempotente depois. `ensureSigvoosTables()` continua preservado. Novo status consolidado: **`R01 = BOOTSTRAP_IMPLEMENTED_RUNTIME_FALLBACK_PENDING_REMOVAL_GATE`**.
>
> **Addendum Sprint R01 Staging/New Environment Gate + Fallback Removal Readiness (2026-06-04):** o pacote de bootstrap foi reaudidado e o teste local passou a incluir um gate explícito por etapas em banco limpo temporário. O inventário do fallback runtime foi fechado em 10 call sites e 2 arquivos. `ensureSigvoosTables()` continua preservado nesta etapa. Novo status consolidado: **`R01 = READY_FOR_RUNTIME_FALLBACK_REMOVAL`**.

---

## 8. Opções consideradas

### Opção A — Remover fallback agora
**Descartada.** Ambiente novo ficaria sem as tabelas base SIGVOOS se provisionado apenas por migrations. O bloqueio em `0354` impediria até chegar em `0387`.

### Opção B — Manter fallback até baseline/replay plan
**Escolhida.** Preserva funcionamento em todos os ambientes existentes e futuros enquanto a cadeia histórica está inválida para replay limpo.

### Opção C — Alterar migration histórica 0354
**Descartada para esta fase.** `0354` é parte da história aplicada em produção. Reescrevê-la agora quebraria a auditabilidade da cadeia e não garantiria replay retroativo.

### Opção D — Criar baseline migration futura
**Viável como próxima fase.** Criar uma migration de bootstrap (ex. `039x_sigvoos_baseline.sql`) que crie `integracoes_sigvoos_config` de forma idempotente *antes* do bloco legado ou em uma cadeia nova separada para ambientes novos. Requer decisão arquitetural própria.

---

## 9. Decisão recomendada

```
R01 = READY_FOR_RUNTIME_FALLBACK_REMOVAL
```

**Classificação consolidada:**
- `0387` aplicada em produção: **Sim** (Sprint R04.5).
- Produção atual mitigada: **Sim** (schema correto; fallback no-op eficaz).
- Replay limpo reconciliado: **Não** (`0354` bloqueia a cadeia antes de `0387`).
- `ensureSigvoosTables()` preservado: **Sim** (necessário para ambientes novos).
- R01 resolvido nesta sprint: **Não** — formalizado e documentado; decisão conservadora tomada.

---

## 10. Próximos passos

1. Usar o gate local-isolado já validado (`scripts/bootstrap-new-environment.sql` + teste de migrations) como base da remoção do fallback.
2. Planejar a remoção de `ensureSigvoosTables()` em sprint separada.
4. Não editar `0354` sem análise de impacto operacional e validação em staging.
5. Não remover `ensureSigvoosTables()` sem cadeia reconciliada.

---

## 11. Fora do escopo

- Aplicar migrations remotas.
- Executar `wrangler d1 execute --remote`.
- Alterar schema remoto ou banco real.
- Backfill de dados.
- Remover `ensureSigvoosTables()`.
- Editar `0354` ou `0387` sem plano validado.
- Deploy do Worker/API.
- Alteração em auth, RBAC ou tenant.
- Tocar R2 real.
- Commitar secrets ou PII.

---

**Fim do documento.** Gerado em 2026-06-03. Atualizado em 2026-06-04 com Sprint R01 Bootstrap + Replay Closure e Sprint R01 Staging/New Environment Gate + Fallback Removal Readiness — bootstrap local revalidado e status avançado para **`READY_FOR_RUNTIME_FALLBACK_REMOVAL`**.

# AirTrust — SIGVOOS R01 Runtime Fallback Removal And Audit Closure v0.5

**Data:** 2026-06-04
**Sprint:** R01.4 Runtime Fallback Removal + Final Audit Closure
**Branch:** `main`
**Modo:** local/docs+test-only. Sem D1 remoto. Sem migration nova. Sem deploy. Sem dados reais.

---

## 1. Objetivo

Fechar R01 removendo o fallback runtime `ensureSigvoosTables()` e consolidando a evidência final de que:
- o replay/bootstrap continua coberto localmente;
- não resta DDL SIGVOOS em runtime;
- o bootstrap segue como caminho oficial para ambiente novo;
- a cadeia histórica não foi reescrita.

---

## 2. Estado de entrada

Estado confirmado antes da etapa:
- `main`
- `HEAD == origin/main == 9942d44`
- `R01 = READY_FOR_RUNTIME_FALLBACK_REMOVAL`
- `scripts/bootstrap-new-environment.sql` preservado
- gate local-isolado `bootstrap -> 0352 -> 0354 -> 0387` já PASS
- inventário do fallback fechado em 10 call sites e 2 arquivos

---

## 3. Remoção executada

Arquivos de runtime alterados:
- `worker-airtrust/src/services/sigvoos-frms.ts`
- `worker-airtrust/src/routes/integracoes_sigvoos.ts`

Arquivos de teste alterados/criados:
- `worker-airtrust/src/__tests__/architecture/no-runtime-ddl-hot-paths.test.ts`
- `worker-airtrust/src/__tests__/architecture/sigvoos-no-runtime-ddl.test.ts`

Remoções aplicadas:
- função `ensureSigvoosTables()` removida de `sigvoos-frms.ts`;
- 10 call sites removidos;
- import residual removido de `integracoes_sigvoos.ts`;
- nenhum `CREATE TABLE`, `CREATE INDEX` ou `ALTER TABLE` SIGVOOS permaneceu em runtime.

Call sites removidos:
- `worker-airtrust/src/routes/integracoes_sigvoos.ts:374`
- `worker-airtrust/src/routes/integracoes_sigvoos.ts:600`
- `worker-airtrust/src/services/sigvoos-frms.ts:625`
- `worker-airtrust/src/services/sigvoos-frms.ts:802`
- `worker-airtrust/src/services/sigvoos-frms.ts:852`
- `worker-airtrust/src/services/sigvoos-frms.ts:914`
- `worker-airtrust/src/services/sigvoos-frms.ts:948`
- `worker-airtrust/src/services/sigvoos-frms.ts:1045`
- `worker-airtrust/src/services/sigvoos-frms.ts:2238`
- `worker-airtrust/src/services/sigvoos-frms.ts:2500`

---

## 4. O que foi preservado

Permanece preservado:
- `scripts/bootstrap-new-environment.sql`
- `0387_integracoes_sigvoos_base_tables.sql`
- `worker-airtrust/src/__tests__/migrations/sigvoos-base-tables-schema.test.ts`

Permanece verdadeiro:
- replay limpo sem bootstrap falha em `0354`;
- replay com bootstrap atravessa `0354`;
- bootstrap é idempotente;
- bootstrap não depende de D1 remoto;
- nenhuma migration histórica foi editada;
- nenhuma migration nova foi criada.

---

## 5. Evidência de testes

Resultados esperados e confirmados:
- prova negativa sem bootstrap: PASS
- replay com bootstrap: PASS
- gate local-isolado: PASS
- guard arquitetural de hot paths: PASS
- teste dedicado de ausência de DDL/runtime SIGVOOS: PASS
- suíte `test:worker`: PASS

---

## 6. Evidência de auditoria por busca

Separação final esperada:

1. Runtime `worker-airtrust/src`
- nenhuma ocorrência de `ensureSigvoosTables(`
- nenhuma ocorrência de `CREATE TABLE IF NOT EXISTS integracoes_sigvoos`
- nenhuma ocorrência de `CREATE TABLE IF NOT EXISTS sigvoos`
- nenhuma ocorrência de `ALTER TABLE integracoes_sigvoos`
- nenhuma ocorrência de `ALTER TABLE sigvoos`

2. Migrations
- ocorrências permanecem apenas como histórico versionado em `0352`, `0354` e `0387`

3. Bootstrap
- ocorrências permanecem apenas em `scripts/bootstrap-new-environment.sql`

4. Tests/docs
- referências permanecem somente como evidência e trilha de auditoria

---

## 7. Decisão final

```text
R01 = RESOLVED
AUDIT_CURRENT_CLOSURE = CLOSED
```

Escopo exato desta decisão:
- R01 está resolvido no repositório;
- o fallback runtime foi removido;
- o caminho de novo ambiente permanece explicitamente documentado via bootstrap;
- a trilha de replay e reconciliação histórica permanece auditável;
- esta decisão não fecha RBAC/Audit v2/Data Quality, que continuam em seus próprios trilhos.

---

## 8. Risco residual

Risco residual remanescente:
- novos ambientes continuam exigindo a ordem `bootstrap -> migrations históricas`;
- o bootstrap continua sendo um artefato operacional separado da cadeia histórica;
- um squash/rebaseline futuro ainda pode simplificar a história, mas deixou de ser bloqueador para runtime.

---

## 9. Próxima etapa recomendada

Executar uma reauditoria independente, preferencialmente com Opus, focada em:
- confirmar que não restou DDL runtime SIGVOOS fora das áreas auditadas;
- revisar se a documentação final de R01 está consistente com matriz/plano/resumo;
- encerrar o stream DDL residual e realocar foco para Audit v2, RBAC/Suporte v2 e Data Quality.

---

**Fim do documento.** Gerado em 2026-06-04. Resultado final: fallback runtime SIGVOOS removido, bootstrap preservado, testes locais PASS e **`R01 = RESOLVED`**.

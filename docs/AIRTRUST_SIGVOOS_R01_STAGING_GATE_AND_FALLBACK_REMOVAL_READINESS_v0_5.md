# AirTrust — SIGVOOS R01 Staging Gate And Fallback Removal Readiness v0.5

**Data:** 2026-06-04
**Sprint:** R01 Staging/New Environment Gate + Runtime Fallback Removal Readiness
**Branch:** `main`
**Modo:** local-isolated / docs+test-only. Sem D1 remoto. Sem migration nova. Sem deploy. Sem remoção de runtime nesta etapa.

---

## 1. Estado antes da etapa

Estado de entrada confirmado:
- `main`
- `HEAD == origin/main == 73acf6f`
- `origin/main...HEAD = 0 0`
- `R01 = BOOTSTRAP_IMPLEMENTED_RUNTIME_FALLBACK_PENDING_REMOVAL_GATE`
- `scripts/bootstrap-new-environment.sql` já existia
- `ensureSigvoosTables()` seguia preservado em runtime

Restrições preservadas nesta etapa:
- nenhuma migration histórica editada;
- nenhuma migration nova criada;
- nenhum D1 remoto executado;
- nenhum deploy executado;
- nenhum dado real ou backfill usado.

---

## 2. Auditoria do bootstrap

Arquivos auditados:
- `scripts/bootstrap-new-environment.sql`
- `docs/AIRTRUST_SIGVOOS_R01_NEW_ENVIRONMENT_BOOTSTRAP_AND_REPLAY_CLOSURE_v0_5.md`
- `docs/AIRTRUST_SIGVOOS_R01_BASELINE_STRATEGY_v0_5.md`
- `docs/AIRTRUST_SIGVOOS_MIGRATION_CHAIN_RECONCILIATION_v0_5.md`
- `worker-airtrust/src/__tests__/migrations/sigvoos-base-tables-schema.test.ts`

Resultado da auditoria:
- o bootstrap contém apenas DDL;
- o bootstrap não contém `INSERT`, `UPDATE`, `DELETE`, `DROP`, `REPLACE` ou `UPSERT`;
- o bootstrap não contém dados reais, seed data, tenant real ou secret material;
- o bootstrap não substitui migrations históricas de `0352`;
- o bootstrap prepara explicitamente `integracoes_sigvoos_config` antes da `0354`;
- o bootstrap permanece alinhado ao DDL versionado em `0387`.

Escopo real do bootstrap:
- `integracoes_sigvoos_config`
- `integracoes_sigvoos_eventos`
- `integracoes_sigvoos_mapeamentos`
- 4 índices base dessas tabelas

Escopo explicitamente fora do bootstrap:
- `sigvoos_mapeamento_manual`
- `frms_jornada_pendente`
- qualquer backfill
- qualquer dado de configuração

---

## 3. Evidência de replay sem bootstrap

Prova negativa preservada:
- teste: `shows that 0354 depends on integracoes_sigvoos_config before 0387 exists in a clean chain`
- resultado: **PASS**

Significado:
- o harness confirma a falha esperada da cadeia limpa em `0354`;
- `0387` posterior não corrige esse replay limpo por ordem numérica.

Conclusão:
- replay limpo puro continua inválido;
- remover o fallback sem uma via válida de provisionamento continuaria sendo inseguro.

---

## 4. Evidência de replay com bootstrap

Provas positivas:
- `lets 0354 pass when the bootstrap runs before historical migrations`
- `replays bootstrap + 0352 + 0354 + 0387 locally without seed data or remote D1`
- `is idempotent when the bootstrap script runs twice before the historical chain`

Resultado:
- **PASS**

Significado:
- `0354` atravessa corretamente quando o bootstrap roda antes;
- `0387` continua idempotente depois do bootstrap;
- não há dependência de D1 remoto;
- não há dependência de dados reais;
- o bootstrap pode rodar mais de uma vez sem drift.

---

## 5. Evidência do gate local-isolado de novo ambiente

Gate validado nesta etapa:
- teste: `passes the local-isolated new-environment gate when bootstrap runs before the historical chain`
- resultado: **PASS**

Fluxo simulado:
1. criar banco SQLite temporário limpo;
2. aplicar pré-requisitos mínimos locais;
3. aplicar `scripts/bootstrap-new-environment.sql`;
4. confirmar tabelas base SIGVOOS criadas e vazias;
5. aplicar `0352`;
6. aplicar `0354`;
7. aplicar `0387`;
8. confirmar schema final esperado e idempotência pós-bootstrap.

Evidência produzida pelo gate:
- a cadeia relevante atravessa `0354`;
- o schema final contém as 5 tabelas SIGVOOS esperadas no conjunto `bootstrap + 0352 + 0354 + 0387`;
- `integracoes_sigvoos_config` termina com `notificar_falha_email`;
- o fluxo usa apenas `sqlite3` local.

Conclusão:
- o pacote de bootstrap agora tem uma validação local-isolada realista para novo ambiente;
- a próxima etapa já pode focar na remoção do fallback runtime, não em provar novamente o bootstrap.

---

## 6. Inventário do fallback runtime

Função central:
- `worker-airtrust/src/services/sigvoos-frms.ts:690` — `ensureSigvoosTables()`

DDL runtime ainda presente dentro da função:
- `integracoes_sigvoos_config`
- `integracoes_sigvoos_eventos`
- `integracoes_sigvoos_mapeamentos`
- `sigvoos_mapeamento_manual`
- `frms_jornada_pendente`

Tipos de DDL runtime encontrados:
- `CREATE TABLE IF NOT EXISTS`: 5
- `CREATE INDEX IF NOT EXISTS`: 8
- `ALTER TABLE`: 0 em runtime SIGVOOS

Call sites atuais de `ensureSigvoosTables()`:
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

Total:
- 10 call sites
- 2 em rotas
- 8 em serviços

Conclusão:
- o fallback está concentrado em dois arquivos;
- não há espalhamento adicional de DDL runtime SIGVOOS fora desse conjunto.

---

## 7. Decisão

```text
R01 = READY_FOR_RUNTIME_FALLBACK_REMOVAL
```

Decisão objetiva:
- o bootstrap foi auditado e validado;
- a prova negativa sem bootstrap continua preservada;
- a prova positiva com bootstrap passou;
- o gate local-isolado de novo ambiente passou;
- o inventário exato de remoção ficou fechado;
- nenhum risco adicional de migration histórica ou D1 remoto foi introduzido.

Esta decisão **não** remove o fallback nesta etapa.

Ela apenas conclui:
- a etapa final pode focar na remoção de `ensureSigvoosTables()`;
- a remoção já não depende de mais trabalho de bootstrap/replay local.

---

## 8. Riscos remanescentes

Riscos ainda existentes:
- a validação desta etapa é local-isolada, não staging remoto;
- o fallback ainda protege ambientes existentes até a etapa final;
- a etapa final ainda precisará ajustar o guard arquitetural e rerodar a suíte completa.

Riscos que deixaram de bloquear a próxima etapa:
- necessidade de provar que `0354` atravessa com bootstrap;
- necessidade de provar que `0387` permanece idempotente depois do bootstrap;
- necessidade de provar que o fluxo não depende de dados reais ou D1 remoto.

---

## 9. Critérios objetivos para a etapa final

A etapa `Runtime Fallback Removal + Final Audit Closure` poderá avançar se mantiver todos os pontos abaixo:

1. não editar migrations históricas;
2. não criar migration nova;
3. não executar D1 remoto;
4. remover `ensureSigvoosTables()` e seus call sites sem alterar auth/RBAC/tenant;
5. atualizar o guard arquitetural que hoje documenta SIGVOOS como exceção;
6. rerodar a suíte completa;
7. validar que SIGVOOS continua funcional com schema provido apenas por migrations + bootstrap.

---

## 10. Lista exata de arquivos e call sites para a etapa final

Arquivos de código que a etapa final poderá alterar:
- `worker-airtrust/src/services/sigvoos-frms.ts`
- `worker-airtrust/src/routes/integracoes_sigvoos.ts`
- `worker-airtrust/src/__tests__/architecture/no-runtime-ddl-hot-paths.test.ts`
- `worker-airtrust/src/__tests__/migrations/sigvoos-base-tables-schema.test.ts`

Call sites exatos candidatos à remoção:
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

Escopo da remoção final:
- remover a função `ensureSigvoosTables()`;
- remover os 10 call sites;
- remover a exceção arquitetural correspondente;
- preservar comportamento funcional SIGVOOS sem reintroduzir DDL runtime.

---

## 11. O que continua proibido

- editar `0354`;
- criar migration nova;
- executar `wrangler d1 migrations apply --remote`;
- executar `wrangler d1 execute --remote`;
- consultar schema remoto;
- tocar banco real;
- usar dados reais;
- fazer backfill;
- fazer deploy nesta etapa;
- alterar auth/RBAC/tenant;
- alterar R2;
- expor secrets.

---

**Fim do documento.** Gerado em 2026-06-04. Decisão desta etapa: **`R01 = READY_FOR_RUNTIME_FALLBACK_REMOVAL`**, com fallback ainda preservado até a etapa final.

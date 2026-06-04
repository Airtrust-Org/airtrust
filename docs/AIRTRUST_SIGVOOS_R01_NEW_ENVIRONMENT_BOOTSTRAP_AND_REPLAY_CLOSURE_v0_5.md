# AirTrust — SIGVOOS R01 New Environment Bootstrap And Replay Closure v0.5

**Data:** 2026-06-04
**Sprint:** R01 Bootstrap + Replay Closure
**Branch:** `main`
**Modo:** local-only / docs+test+script. Sem D1 remoto. Sem migration nova. Sem deploy. Sem alteração de runtime SIGVOOS.

---

## 1. Objetivo

Fechar a fase de **bootstrap de novo ambiente + replay local** para R01, sem editar migrations históricas e sem remover o fallback runtime.

Entregas desta fase:
- `scripts/bootstrap-new-environment.sql`;
- prova local de replay sem bootstrap vs. com bootstrap;
- runbook operacional para ambiente novo;
- atualização do status conservador de R01;
- preservação explícita de `ensureSigvoosTables()`.

---

## 2. Problema original

O bloqueio histórico permanece o mesmo:

```sql
-- 0354_auditoria_critica_schema_hardening.sql
ALTER TABLE integracoes_sigvoos_config ADD COLUMN notificar_falha_email TEXT;
```

Nenhuma migration com número menor que `0354` cria `integracoes_sigvoos_config`.

Consequência:
- em produção, `0354` conseguiu rodar porque a tabela já existia por drift de runtime;
- em replay limpo, `0354` falha antes de alcançar `0387_integracoes_sigvoos_base_tables.sql`.

---

## 3. Por que produção está mitigada

- `ensureSigvoosTables()` criou as tabelas base antes da aplicação histórica de `0354`.
- `0387` já foi aplicada em produção na Sprint R04.5.
- O schema atual de produção está mitigado.
- O problema remanescente não é produção atual; é **provisionamento de ambiente novo**.

Isso significa:
- produção atual: mitigada;
- replay limpo sem bootstrap: quebrado;
- fallback runtime: ainda necessário.

---

## 4. O que esta fase implementa

Arquivo criado:

```text
scripts/bootstrap-new-environment.sql
```

Escopo do bootstrap:
- criar `integracoes_sigvoos_config`;
- criar `integracoes_sigvoos_eventos`;
- criar `integracoes_sigvoos_mapeamentos`;
- criar os 4 índices base associados;
- não inserir dados;
- não executar backfill;
- não depender de tenant real;
- não depender de D1 remoto.

O script é deliberadamente aditivo e alinhado ao schema runtime que já foi versionado em `0387`.

---

## 5. Ordem correta para ambiente novo

Sequência correta para ambiente novo:

1. criar o banco vazio;
2. aplicar `scripts/bootstrap-new-environment.sql`;
3. executar a cadeia histórica normal de migrations;
4. validar que `0354` atravessou com sucesso;
5. manter `ensureSigvoosTables()` até o gate de remoção do fallback.

Resumo operacional:

```text
bootstrap primeiro
migrations depois
fallback runtime preservado até gate posterior
```

---

## 6. Evidência local desta fase

Teste local estendido:

```text
worker-airtrust/src/__tests__/migrations/sigvoos-base-tables-schema.test.ts
```

O teste agora prova explicitamente:

1. replay limpo sem bootstrap falha em `0354`;
2. replay com bootstrap atravessa `0354`;
3. o bootstrap é idempotente localmente;
4. o bootstrap não exige dados reais;
5. o bootstrap roda apenas com `sqlite3` local, sem D1 remoto.

---

## 7. Resultado esperado do replay

### Sem bootstrap

Resultado esperado:

```text
FAIL
0354 -> no such table: integracoes_sigvoos_config
```

### Com bootstrap

Resultado esperado:

```text
PASS
0354 executa ALTER TABLE com sucesso
0387 continua idempotente depois
```

---

## 8. Riscos e limites

Riscos aceitos:
- o bootstrap adiciona um passo operacional fora da cadeia histórica;
- esquecer o bootstrap ainda quebra ambiente novo;
- o fallback runtime continua ativo até fase posterior.

Limites desta fase:
- não resolve a auditabilidade histórica da cadeia legada;
- não substitui um squash/rebaseline de longo prazo;
- não autoriza remover `ensureSigvoosTables()` agora;
- não valida staging nem produção;
- não executa deploy.

---

## 9. O que não fazer

- não editar `0354`;
- não criar migration nova para “corrigir” a ordem histórica;
- não aplicar D1 remoto nesta fase;
- não usar SQL manual em produção;
- não remover `ensureSigvoosTables()`;
- não alterar os 10 call sites SIGVOOS;
- não fazer backfill;
- não usar dados reais;
- não misturar esta fase com deploy.

---

## 10. Critérios futuros para remover ensureSigvoosTables()

`ensureSigvoosTables()` só pode sair quando todas as condições abaixo forem verdadeiras:

1. bootstrap de novo ambiente implementado e documentado;
2. replay local com bootstrap comprovado por teste PASS;
3. validação adicional em ambiente aprovado concluída;
4. runbook operacional aprovado para novos ambientes;
5. remoção do fallback planejada em sprint separada;
6. deploy e smoke pós-remoção aprovados.

Até lá:

```text
ensureSigvoosTables() permanece preservado
```

---

## 11. Status final desta fase

Status recomendado após esta entrega:

```text
R01 = BOOTSTRAP_IMPLEMENTED_RUNTIME_FALLBACK_PENDING_REMOVAL_GATE
```

Motivo:
- `0387` já está aplicada em produção;
- a cadeia histórica continua inválida em replay limpo puro;
- o bootstrap para novo ambiente agora existe;
- a prova local de replay com bootstrap foi adicionada;
- o fallback runtime ainda precisa permanecer até gate posterior.

---

## 12. Próxima etapa recomendada

Próxima etapa:

```text
R01 staging/new-environment gate
```

Escopo recomendado:
- validar o procedimento de bootstrap em ambiente aprovado;
- confirmar replay operacional completo;
- só depois discutir remoção do fallback runtime.

---

**Fim do documento.** Gerado em 2026-06-04. Fase R01 Bootstrap + Replay Closure concluída localmente, sem D1 remoto e sem deploy.

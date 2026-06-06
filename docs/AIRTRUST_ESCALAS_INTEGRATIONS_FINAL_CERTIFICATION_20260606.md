# AIRTRUST - Certificacao Final (Escalas + Treinamentos + Integracoes)
Data: 2026-06-06  
Commit de codigo publicado: `23f893e684f80f29a2789dd41542e36aa5964203`

## Classificacao

PUBLICADO COM LIMITAÇÃO DE SMOKE AUTENTICADO.

## Criterios

- 21 achados originais reavaliados.
- Gates locais verdes.
- Sem migration/backfill.
- Deploy Worker publicado com `APP_VERSION=2026-06-06T20:51:38Z-23f893e`.
- Deploy Pages publicado em `https://d4e548cc.airtrust.pages.dev` e servido em `https://airtrust.online/`.
- Smokes publicos/read-only passaram.
- Smoke autenticado operacional ficou limitado por ausencia de `AIRTRUST_AUTH_TOKEN` ou `AIRTRUST_COOKIE`.

## Resultado final

- Altos: 5/5 fechados.
- Medios: 11/12 fechados ou resolvidos por politica; M12 mitigado com residuo baixo.
- Baixos: 4/4 fechados.
- Novos achados altos/medios: nenhum.

## Evidencias de producao

| Evidencia | Resultado |
|---|---|
| Worker deploy | Version ID `f2b9288d-8d13-4306-8cfb-89b60f8cd3a5`; routes `https://airtrust-api-production.airtrust.workers.dev` e `api.airtrust.online/*`. |
| Pages deploy | `https://d4e548cc.airtrust.pages.dev`; custom domain `https://airtrust.online/` HTTP 200. |
| API health | HTTP 200, `healthy`, DB/R2 OK, versao `2026-06-06T20:51:38Z-23f893e`. |
| Read-only smoke | PASS. |
| General API smoke | 5/5 passed, 0 failed. |
| Authenticated operational smoke | PASS=3, FAIL=0, SKIPPED=1 por falta de token/cookie. |

## Residuos documentados

- M12/R1: criacao de turma tem dedupe por janela curta e rollback de estado parcial, mas nao tem idempotency key persistida nem constraint unica. Classificado como residuo baixo porque o duplo-submit/retry comum foi mitigado; concorrencia simultanea estrita exige DDL futura.
- Smoke autenticado: nao validado por falta de credenciais/tokens no ambiente local. Os endpoints protegidos responderam 401 em smoke publico, comportamento esperado.

## Veredito

Publicado e reauditorado, sem rollback. A classificacao final nao e `VALIDADO, PUBLICADO E REAUDITADO` apenas porque o smoke autenticado ponta-a-ponta nao foi executado.

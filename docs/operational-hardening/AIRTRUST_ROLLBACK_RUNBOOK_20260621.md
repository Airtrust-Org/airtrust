# AirTrust Rollback Runbook

Data: 2026-06-21
Escopo: Worker, Pages e fallback operacional de modulos read-only
Fora de escopo: rollback de banco em producao, migration rollback remota, restore real.

## Objetivo

Definir a sequencia minima para voltar rapidamente a um estado anterior de aplicacao quando uma release quebrar comportamento publico ou tenant-scoped.

## Pre-checks

1. Identificar incidente, horario e impacto.
2. Coletar `requestId` quando houver.
3. Coletar `correlation_id` quando o fluxo ou a auditoria controlada o disponibilizar.
4. Confirmar versao atual em `/api/version` e estado em `/api/health`.
5. Confirmar se o incidente e:
   - Worker only
   - Pages only
   - ambos
   - dado/tenant dependent
6. Se houver suspeita de schema/dados, parar e abrir macroetapa propria; este runbook nao autoriza banco.
7. SIGVOOS permanece NO-GO neste runbook; nao abrir excecao operacional aqui.

## Worker rollback

1. Confirmar ultimo commit estavel conhecido.
2. Validar se a release atual teve migration; se sim, este runbook para aqui.
3. Preparar rollback apenas de codigo do Worker com a mesma disciplina de gate descrita em [DEPLOYMENT_AND_DEVOPS.md](/tmp/airtrust-observability-dr-readiness/DEPLOYMENT_AND_DEVOPS.md:1).
4. Revalidar `/api/version`, `/api/health` e smoke publico read-only.

## Pages rollback

1. Confirmar se o problema e frontend only.
2. Comparar hash/build esperado com o commit estavel anterior.
3. Republicar a versao estavel de Pages em janela controlada.
4. Revalidar rota raiz, dashboard e assets criticos.

## Fallback operacional Central / FRMS

1. Se a Central quebrar, validar primeiro se `/api/health` e `/api/version` continuam saudaveis.
2. Isolar se a falha esta em agregacao backend, consumo frontend ou fonte parcial.
3. Se a falha for apenas da Central, manter o resto da plataforma e tratar o modulo como incidente localizado.
4. Se a falha envolver FRMS ou tenant data inconsistente, nao improvisar restore; abrir trilha separada com checklist de DR.

## Pos-checks obrigatorios

1. `/api/version` reflete a versao esperada.
2. `/api/health` volta a `healthy`.
3. Smoke publico read-only passa.
4. Logs novos podem ser correlacionados por `requestId`.
5. Nao houve migration, SQL remoto de escrita ou alteracao de D1/R2.

## GO / NO-GO

### GO

- incidente de aplicacao sem dependencia de banco;
- commit estavel conhecido;
- health/version validaveis;
- rollback testavel por smoke publico.

### NO-GO

- schema mudou;
- ha suspeita de perda/corrupcao de dados;
- nao existe commit estavel conhecido;
- o incidente depende de restore real;
- o problema exige alterar D1/R2.
- o incidente toca SIGVOOS ou exigiria alterar a integracao SIGVOOS.

## Comunicacao minima

- versao quebrada;
- versao alvo do rollback;
- escopo afetado;
- resultado dos checks publicos;
- riscos remanescentes.

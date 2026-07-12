# Smoke autenticado — treinamento de examinador (staging)

Escopo: staging apenas, usando exclusivamente a fixture QA criada por
`scripts/staging/seed-qa-examiner-training.mjs`. Nenhum dado real. Nenhuma
homologação/aceitação ANAC — este smoke valida comportamento de código, não
conformidade regulatória.

## Pré-requisitos

1. Migration 0424 aplicada (via `scripts/staging/apply-approved-migrations.sh`)
   com o `CRED-EXA` sintético do seed QA como âncora.
2. Seed QA aplicado (`scripts/staging/seed-qa-examiner-training.mjs --apply`).
3. Variáveis: `STAGING_API_BASE_URL`, `QA_EXAMINER_ADMIN_EMAIL`,
   `QA_EXAMINER_ADMIN_PASSWORD`. Opcional: `STAGING_SMOKE_EMAIL` /
   `STAGING_SMOKE_PASSWORD` (fixture smoke pré-existente, usada apenas no
   cenário H de cross-tenant).

```bash
node scripts/staging/smoke-examiner-training.mjs
```

## Cenários cobertos

| Cenário | O que valida |
|---|---|
| A. Capability | `/api/capabilities` reporta `simulador_shared_sessions=true` em staging. |
| B. Sessão simples | Criar, editar; sem efeito residual além do que os cenários seguintes reaproveitam. |
| C. Conversão | Simples → compartilhada com 2 segmentos EXA-V01/V02, 60 min cada, sem duplicação. |
| D. Reconversão idempotente | Reenviar a mesma conversão não duplica segmentos (o bloqueio específico por ficha assinada/concluída é coberto pela suíte automatizada `simuladores-shared-session-conversion.test.ts`, não recriado aqui contra dado real). |
| E. Programa genérico | Listagem padrão de modelos não expõe `EXA-V01..04`. |
| F. Programa examinador | Evento 2 cria sessão compartilhada direta com EXA-V03+V04, 60 min cada, sem FAP. |
| G. Histórico | Sessão convertida (C) reabre com os mesmos 2 segmentos, sem duplicar. |
| H. Tenant | Acesso cross-tenant (usando a fixture smoke pré-existente, nunca um segundo tenant QA criado só para isto) retorna 404 genérico. |
| I. PDF | Ficha da sessão do cenário F gera PDF não vazio (conteúdo detalhado — 33 itens, 18+15, ECL, sem QRH/FAP — já coberto pela suíte automatizada local). |

## Saída

JSON sanitizado no stdout — nunca imprime token, senha ou dado pessoal (apenas
e-mail mascarado via `maskEmail()`). Código de saída não-zero se qualquer
cenário retornar `ok: false`.

## Limitação conhecida

Os contratos de request/response usados neste script foram derivados da
leitura de `simuladores-shared-session-logic.ts` e `simuladores-fichas*.ts`,
não de uma execução real contra staging (fora do escopo autorizado nesta
entrega). Antes da primeira execução real, confirmar os nomes de campo de
`GET /api/funcionarios`, `GET /api/simuladores`,
`GET /api/simuladores/modelos-sessao`, `GET /api/simuladores/fichas` e
`POST /api/simuladores/fichas/:id/pdf` contra os validadores zod atuais.

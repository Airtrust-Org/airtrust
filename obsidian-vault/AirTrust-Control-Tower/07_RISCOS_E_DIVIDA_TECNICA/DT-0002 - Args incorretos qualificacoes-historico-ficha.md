---
status: aberto
tipo: divida-tecnica
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: critico
severidade: "🔴 CRÍTICO"
modulo_afetado: "Qualificações"
data_identificacao: "2026-06-12"
data_resolucao: ""
tags:
  - divida-tecnica
  - qualificacoes
  - risco/critico
---

# DT-0002: Chamada com argumentos incorretos em qualificacoes-historico-ficha.ts:416

## Descrição
Chamada de função com 5 argumentos onde a assinatura espera 6. O argumento faltante pode causar comportamento incorreto ou erro em runtime.

## Localização
| Arquivo | Linha(s) | Erro |
|---|---|---|
| `routes/qualificacoes-historico-ficha.ts` | 416 | 5 args passados, 6 esperados |

## Causa raiz
Assinatura da função foi alterada sem atualizar todos os call sites.

## Impacto
### Runtime
🔴 CRÍTICO — Argumento faltante pode causar comportamento incorreto ou quebrar em produção.

## Solução proposta
Identificar a função chamada, entender o 6º parâmetro e passar o valor correto.

## Estimativa de esforço
Médio (1-2d) — requer entendimento do contexto da chamada

## PR de resolução
- 

## Notas
- Prioridade máxima para correção

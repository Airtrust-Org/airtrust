---
status: aberto
tipo: divida-tecnica
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: medio
severidade: "🟡 MÉDIO"
modulo_afetado: "LMS"
data_identificacao: "2026-06-12"
data_resolucao: ""
tags:
  - divida-tecnica
  - lms
---

# DT-0001: 6 erros TS2552 em lms-matriculas.ts (dataExpiracao vs data_expiracao)

## Descrição
Zod destructuring produz `data_expiracao` (snake_case), mas o código referencia `dataExpiracao` (camelCase) em 6 pontos da função `sendMatriculaEmail`.

## Localização
| Arquivo | Linha(s) | Erro |
|---|---|---|
| `routes/lms-matriculas.ts` | 765 | TS2552: Cannot find name 'dataExpiracao' |
| `routes/lms-matriculas.ts` | 824 | TS2552: Cannot find name 'dataExpiracao' |
| `routes/lms-matriculas.ts` | 890 | TS2552: Cannot find name 'dataExpiracao' |
| `routes/lms-matriculas.ts` | 1005 | TS2552: Cannot find name 'dataExpiracao' |
| `routes/lms-matriculas.ts` | 1061 | TS2552: Cannot find name 'dataExpiracao' |
| `routes/lms-matriculas.ts` | 1139 | TS2552: Cannot find name 'dataExpiracao' |

## Causa raiz
Zod schema usa snake_case, código usa camelCase. `dataExpiracao` é `undefined` → emails de matrícula podem ser enviados sem data de expiração correta.

## Impacto
### Runtime
Emails de matrícula enviados sem data de expiração correta (campo undefined).

### Manutenibilidade
6 erros TypeScript que impedem build limpo.

## Solução proposta
Renomear variável no destructuring Zod para camelCase, ou usar `data_expiracao` nas chamadas.

## Estimativa de esforço
Pequeno (1-2h)

## PR de resolução
- 

## Notas
- Afeta 6 contextos diferentes: ciclo reset, new matricula, existing matricula, batch existing, batch new, batch concurrent

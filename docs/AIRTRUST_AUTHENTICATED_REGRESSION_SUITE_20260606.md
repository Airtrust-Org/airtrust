# AIRTRUST Authenticated Regression Suite — 2026-06-06

## Objetivo
Registrar o que foi coberto localmente e o que ainda depende de validação autenticada real.

## Cobertura automatizada executada
- Worker:
  - `system-routes.test.ts`
  - `simuladores-sessoes-schema-compat.test.ts`
  - `simuladores-planejadas-edit-session.test.ts`
  - `treinamentos-planejados.test.ts`
- Frontend:
  - `deployment.test.ts`
  - `TabGestaoWrapper.test.tsx`
  - `hardRefresh.test.ts`

## Jornadas cobertas por teste nesta sessão
| Jornada | Cobertura | Status |
| --- | --- | --- |
| Versão canônica do worker | contrato `/api/version`/`/api/health` | Coberta |
| Fallback de build-version do frontend | helper que lê `index.html` servido | Coberta |
| Gestão sem zero falso | componente React com falha parcial | Coberta |
| Detalhe de sessão em schema antigo | worker `/simuladores/sessoes/:id` | Coberta |
| Consolidação de planejados | worker `treinamentos-planejados` | Coberta |

## Jornadas autenticadas pendentes
1. Histórico de qualificações com filtros reais.
2. Planejados Lista e Calendário com tenant real.
3. Agenda de simuladores com junho/julho reais.
4. Modal de edição real preenchido por sessão existente.
5. Gestão de simuladores com API real autenticada.
6. Escala Mensal e Visão Integrada após deploy.
7. EVD autenticada.

## Evidência de ausência
- Não havia credenciais/sessão autenticada disponíveis nesta execução.
- Nenhum screenshot novo autenticado foi capturado nesta sessão.
- Não foi executado Playwright autenticado contra produção.

## Critério para fechar este documento como produção-ready
Executar browser autenticado nas jornadas acima, capturar screenshots sanitizados e reconciliar:
`banco = API = UI`.

# AIRTRUST v0.5-H35-E — Home Dashboard Data and Layout Audit

## 1. HEAD inicial
- Branch: `main`
- HEAD inicial: `df3d2a7dbf476c1507b01f5d12a66da0a3029d56`
- `origin/main`: `df3d2a7dbf476c1507b01f5d12a66da0a3029d56`

Observação de version stamp anterior:
- O deploy funcional da Home ocorreu com stamp `2026-05-26T22:33:13Z-f60fe98`.
- O commit `df3d2a7` é documental pós-deploy (não funcional). Portanto, não há inconsistência operacional: o stamp aponta para o último commit funcional publicado na fase H35-D.

## 2. Arquivos lidos
Frontend Home:
- `src/react-app/pages/DashboardPrincipal.tsx`
- `src/react-app/pages/dashboard/queries.ts`
- `src/react-app/pages/dashboard/types.ts`

Backend Dashboard/Qualificações:
- `worker-airtrust/src/routes/dashboard.ts`
- `worker-airtrust/src/services/dashboardService.ts`
- `worker-airtrust/src/routes/qualificacoes/historico.ts`
- `worker-airtrust/src/utils/qualificacoes-alerta-config.ts`

Referência visual/padrão:
- `src/react-app/pages/HomePerfil.tsx`
- `src/react-app/pages/frms/FrmsDashboard.tsx`
- `src/react-app/pages/qualificacoes/Alertas.tsx`

## 3. Origem de cada métrica da Home
Home (`DashboardPrincipal`) usa:
- `useMetricsQuery` → `GET /api/dashboard/metrics`
  - `tripulantesAtivos`
  - `tripulantesComQualificacoesVencidas`
  - `qualificacoesVencidas`
  - `qualificacoesAVencer`
- `useAlertasQuery` → `GET /api/dashboard/alertas-criticos`
  - alertas de `qualificacao_vencendo`
  - alertas de `lms_curso_pendente`
- `useFrmsAlertasQuery` → `GET /api/frms/alertas`
- `useEscalasQuery` → `GET /api/escalas`
- `useSessoesSimuladorQuery` → `GET /api/simuladores/sessoes`

Mapeamento do bloco Qualificações:
- `Vencidas`: agora usa `metrics.qualificacoesVencidas` (fonte confiável)
- `Vencendo`: agora usa `metrics.qualificacoesAVencer`
- Lista textual: agora filtra apenas alertas `tipo=qualificacao_vencendo`

## 4. Diagnóstico do número “8 qualificações vencidas”
Resultado da auditoria read-only em produção:
- `dashboard/metrics.qualificacoesVencidas = 2`
- `dashboard/metrics.qualificacoesAVencer = 8`
- `dashboard/alertas-criticos`: 16 alertas
  - 10 de qualificação
  - 6 de LMS (`lms_curso_pendente`)

Causa raiz encontrada:
- A regra antiga da Home contava vencidas por `alertas.filter(diasRestantes <= 0)`.
- Em alertas LMS, `diasRestantes` vem ausente/nulo; no mapeamento isso virava `0`.
- Resultado: 6 alertas LMS eram contados indevidamente como qualificações vencidas.
- Cálculo antigo ficava `2 vencidas reais + 6 LMS = 8`.

## 5. Lista dos registros contados ou motivo de correção
Registros canônicos vencidos (produção, filtro `historico?statuses=VENCIDA`):
1. Antonio Luiz Simões Ramos — `OPC - FAP 05.02 - SK76` — status `VENCIDA`.
2. Antonio Luiz Simões Ramos — `CRM — Gerenciamento de Recursos da Tripulação` — status `VENCIDA`.

Registros indevidos que entravam no “8” antigo:
- IDs `100000..100005` (`tipo=lms_curso_pendente`, curso obrigatório não matriculado).
- Motivo da exclusão: não são qualificações vencidas; pertencem a alerta LMS e não podem compor o card de Qualificações.

Evidência bruta salva em:
- `docs/AIRTRUST_HOME_DASHBOARD_DATA_AUDIT_H35E_output.json`

## 6. Alterações feitas
### Correção funcional (dados)
Arquivo alterado:
- `src/react-app/pages/DashboardPrincipal.tsx`

Ajustes:
- Adicionado filtro explícito para alertas de qualificação (`tipo=qualificacao_vencendo`).
- `Vencidas` deixou de usar contagem derivada de alertas mistos e passou a usar `metrics.qualificacoesVencidas`.
- `Vencendo` passou a usar `metrics.qualificacoesAVencer`.
- Lista da seção Qualificações mostra apenas alertas de qualificação.
- Label de pendências críticas ficou explícita: `FRMS + vencidas`.

### Auditoria read-only
Arquivo criado:
- `scripts/validation/audit-home-qualificacoes.mjs`

Função:
- Compara `dashboard/metrics`, `dashboard/alertas-criticos` e `qualificacoes/historico`.
- Replica regra legada da Home para provar divergência.
- Lista entradas incorretas e registros canônicos.

## 7. Layout — descrição objetiva do ajuste
A Home foi reaproximada do padrão AirTrust sem voltar ao excesso:
- Hero do topo reforçado (gradiente, profundidade e foco de status).
- Densidade e hierarquia mais fortes (cards com ícones, superfícies e sombras consistentes).
- Blocos principais mantidos (5 estratégicos), porém com leitura mais executiva.
- Sem gráficos decorativos extras.
- Sem novos fetches/polling.

## 8. Validações executadas e resultados
Typecheck/build/lint/test:
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit` ✅
- `npx tsc --noEmit` ✅
- `npm run build` ✅
- `npm run lint` ✅
- `npm run test:worker` ✅ (495/495)

Auditoria read-only de dados da Home:
- `AIRTRUST_EMAIL=... AIRTRUST_PASSWORD=... node scripts/validation/audit-home-qualificacoes.mjs` ✅
- Divergência comprovada e causa raiz identificada ✅

Anti-polling preservado (Home):
- sem `refetchInterval` ✅
- sem `setInterval`/`setTimeout` no `DashboardPrincipal` ✅
- botão manual `Atualizar dados` mantido ✅

## 9. Pendências
- Revisão humana visual final em produção para ajuste fino de copy/tonalidade (se necessário).
- Opcional H35-C2 apenas para polimento visual, sem alterar dados/chamadas.

## 10. Confirmação explícita
- sem migration ✅
- sem banco manual ✅
- sem deploy ✅
- sem sync ✅
- sem deduplicate ✅
- sem importação ✅
- sem `git add .` ✅
- sem commit ✅


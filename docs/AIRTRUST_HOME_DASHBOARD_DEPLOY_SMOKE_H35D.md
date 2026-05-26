# AIRTRUST v0.5-H35-D — Deploy/Smoke da Home/Painel Principal

## 1. HEAD deployado
- Branch: `main`
- HEAD deployado: `f60fe9866e4c5af3671e02f3d1730e6f56856f83`
- Commit principal da fase funcional: `f60fe98 feat(dashboard): redesign home executive panel`

## 2. Commits incluídos
- `f60fe98 feat(dashboard): redesign home executive panel`
- `a81ebfa fix(dashboard): improve home data reliability`

Observação:
- O deploy de frontend publicou os artefatos do HEAD `f60fe98`.
- O deploy de worker foi executado de forma segura para consolidar a versão em produção com os ajustes de confiabilidade da Home.

## 3. Validações locais
Executado em worktree limpo:
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit` ✅
- `npx tsc --noEmit` ✅
- `npm run build` ✅
- `npm run lint` ✅
- `npm run test:worker` ✅ (495/495 testes passando)

## 4. Verificação anti-polling
Comandos:
- `grep -R "refetchInterval" -n src/react-app/pages/dashboard src/react-app/pages/DashboardPrincipal.tsx || true`
- `grep -R "refetchOnWindowFocus" -n src/react-app/pages/dashboard src/react-app/pages/DashboardPrincipal.tsx || true`
- `grep -R "setInterval\|setTimeout" -n src/react-app/pages/dashboard src/react-app/pages/DashboardPrincipal.tsx || true`

Resultado:
- `refetchInterval`: nenhum encontrado ✅
- `refetchOnWindowFocus`: `false` em `src/react-app/pages/dashboard/queries.ts` ✅
- `setInterval`/`setTimeout` no dashboard: nenhum encontrado ✅

## 5. Guardrail de deploy
Comandos:
- `bash scripts/validation/audit-deploy-scripts.sh` ✅
- `bash -n scripts/deploy-worker-safe.sh` ✅

Resultado:
- `deploy-worker-safe.sh` validado sem comandos proibidos (`migrations apply`, `wrangler d1`, `seed`, `deduplicate`, `sync`).
- Scripts antigos com comandos restritos seguem auditáveis/identificados, sem uso nesta fase.

## 6. Deploy frontend
Comando:
- `npm run deploy:pages`

Resultado:
- Deploy concluído com sucesso ✅
- URL de deploy retornada: `https://eac16968.airtrust.pages.dev`

## 7. Deploy worker
Decisão:
- Executado ✅

Justificativa:
- Há alterações de `worker-airtrust` no pacote de commits da Home (H35-B).
- Foi adotado deploy seguro para consolidar version stamp e evitar drift entre frontend e API.

Comando:
- `npm run deploy:worker:safe`

Resultado:
- Worker: `airtrust-api-production`
- `APP_VERSION`: `2026-05-26T22:33:13Z-f60fe98`
- `APP_BUILD_TIME`: `2026-05-26T22:33:13Z`
- Current Version ID: `85881cbb-97ea-49c1-a8dc-be59cbbe5f1e`
- Nenhuma migration aplicada ✅

## 8. Smoke pós-deploy
Comandos:
- `bash scripts/smoke-production-readonly.sh` ✅
- `BASE=https://api.airtrust.online bash scripts/smoke-test-core.sh` ✅
- `bash scripts/smoke-tests.sh https://api.airtrust.online` ✅

Checks adicionais:
- `curl -fsSL https://api.airtrust.online/api/health` ✅
- `curl -fsSL https://api.airtrust.online/api/version` ✅
- `curl -fsSL https://api.airtrust.online/api/public/locale` ✅

Respostas-chave:
- `/api/health`: `healthy`, com versão `2026-05-26T22:33:13Z-f60fe98`
- `/api/version`: sucesso com `deploymentId` `2026-05-26T22:33:13Z-f60fe98`
- `/api/public/locale`: sucesso (`country: BR`, `language: pt-BR`)

## 9. Checklist específico da Home
Status:
- Home publicada e alcançável (rota web respondeu 200 no smoke read-only) ✅
- Estrutura de 5 blocos estratégicos confirmada em código (`DashboardPrincipal.tsx`) ✅
- Grid antigo de atalhos/micro-KPIs removido do `DashboardPrincipal` ✅
- Donut FRMS decorativo removido no painel executivo ✅
- Botão manual `Atualizar dados` presente ✅
- Sem polling automático agressivo (grep anti-polling) ✅

Limitação desta fase:
- Validação manual via DevTools/Network em sessão autenticada de navegador não foi executada neste ambiente.
- Itens visuais/interativos em runtime autenticado devem ser confirmados na revisão humana pós-publicação.

## 10. Confirmações de segurança da fase
- Sem migration ✅
- Sem escrita manual em banco ✅
- Sem seed ✅
- Sem sync SIGVOOS ✅
- Sem deduplicate ✅
- Sem importação ✅
- Sem alteração funcional nesta fase (apenas execução de deploy/smoke e documentação) ✅

## 11. Pendências
- Se revisão humana identificar ajuste fino de copy/visual: abrir `H35-C2` (somente UI).
- Se telemetria de chamadas indicar necessidade futura: avaliar endpoint consolidado para Home em fase própria.

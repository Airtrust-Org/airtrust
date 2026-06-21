# AIRTRUST_PR117_MANAGER_ALERT_CENTER_V2_DEPLOY_VALIDATION_20260621

## Veredito

Em execução controlada. Este relatório será fechado após CI no HEAD final, merge, deploy Worker/Pages e validações públicas.

## PR

- PR: #117 — Central de Alertas V2 com SGSO e simuladores/fichas.
- Branch: `codex/manager-alert-center-sgso-simulators`.
- Base: `main`.
- HEAD inicial revisado: `1f3620b819c63707d2511ac5563216768eb23a23`.

## Revisão de segurança

- Sem migration.
- Sem SQL remoto de escrita.
- Sem alteração manual de banco.
- Sem SIGVOOS.
- Sem exposição de CPF, email, token, cookie, senha ou secret.
- Endpoint novo é read-only e tenant-scoped.
- Agregados de simuladores/fichas foram restringidos por escopo de participante/ficha.
- SGSO foi restringido por módulo ativo e permissão `sgso.view` no consumo da Central.

## Correções aplicadas antes do merge

- Ajuste do path SGSO para `/api/sgso/next/compliance/rbac121/checklist`.
- Respeito a `DENY:sgso.view` antes de consultar/renderizar SGSO na Central.
- Saneamento e limite de `janela_horas` em `GET /api/dashboard/simuladores-alertas`.
- Filtro de fichas/participantes por escopo operacional nos agregados de simuladores.
- Exclusão de sessões canceladas das pendências de avaliação/assinatura.
- Sanitização de links internos contra escape cross-origin por barra invertida.

## Validações locais

- `npm run test:run -- src/react-app/pages/funcionarios/__tests__/ManagerAlertCenter.test.tsx` — PASS, 14 testes.
- `npm run test:run -- src/react-app/pages/funcionarios/__tests__/managerAlertCenter.utils.test.ts` — PASS, 4 testes.
- `npm run test:worker -- --run dashboard-metrics-integrity` — PASS, 11 testes.
- `npm run test:run -- --run alert` — PASS, 20 testes.
- `npm run test:run -- --run sgso simulador ficha dashboard frms` — PASS, 218 testes.
- `npm run lint` — PASS.
- `npm run build` — PASS.

## CI

- CI do HEAD inicial `1f3620b8`: PASS para build, check-demo-data, lint, test, lms-smoke e Check PR.
- CI do HEAD final: pendente até push das correções.

## Deploy

- Worker: pendente.
- Pages: pendente.
- Migrations: não executar.
- SQL remoto: não executar.
- Seed/sync/backfill: não executar.

## Validação pública pós-deploy

- `/api/version`: pendente.
- `/api/health`: pendente.
- `scripts/smoke-tests.sh https://api.airtrust.online`: pendente.
- `scripts/smoke-production-readonly.sh`: pendente.
- `curl -I https://airtrust.online`: pendente.

## Validação autenticada

AUTHENTICATED_SESSION_UNAVAILABLE até existir sessão/fixture autorizada nesta execução.

## Riscos remanescentes

- Agregador backend único futuro para a Central.
- Fixture cross-tenant autenticada para validação negativa ponta a ponta.
- Override visual.
- Parametrização futura de limites por tenant.

## SIGVOOS NO-GO

Nenhuma leitura, escrita ou integração SIGVOOS foi executada ou adicionada.

## Próxima macroetapa única

Validação autenticada quando fixture existir.

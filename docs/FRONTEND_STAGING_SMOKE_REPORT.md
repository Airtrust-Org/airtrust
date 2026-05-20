# Frontend Staging Smoke Report

## Data
- Data/hora: 2026-05-15T16:45
- Branch: main
- Commit checkpoint: 7327ce7d6
- Commit final: (this commit)
- Producao tocada? nao
- Dados reais usados? nao

## Ambiente
- API staging: https://airtrust-api-staging.airtrust.workers.dev
- Frontend staging/preview: https://main.airtrust.pages.dev
- Frontend producao: https://airtrust.online (nao tocado)
- API producao: https://api.airtrust.online (nao tocado)
- Confirmacao de separacao staging/producao:
  - Deploy realizado com `--branch=main` (nao `--branch=production`)
  - Deployment alias: `main.airtrust.pages.dev` (preview URL, nao custom domain)
  - Runtime routing em `src/react-app/config/api.ts:34` detecta hostname `main.airtrust.pages.dev` e roteia para staging API
  - `import.meta?.env?.VITE_API_URL` usa optional chaining que nao e substituido pelo Vite define, resultando em `undefined` no browser; o hostname check e o unico mecanismo de roteamento

## Pre-validacao local
| Item | Resultado |
|------|-----------|
| TypeScript | 0 erros |
| test:all | 395 passed (frontend) + 355 passed (worker) = 750 total |
| frontend build | PASS (17.25s) |
| worker dry-run | PASS (5487 KiB) |

## Frontend deploy/estado
- Frontend staging estava atualizado? nao (build de 2026-05-02, 13 dias atras)
- Deploy preview/staging feito? sim (`--branch=main`)
- Deploy producao feito? NAO
- URL testada: https://main.airtrust.pages.dev
- Build deployado: 7327ce7d6 (2026-05-15)
- Build anterior: 2026-05-02T14:14:22Z-11a1a5487
- Novo JS bundle: index-CK64FVgz.js (anteriormente index-CBQhLr71.js)
- Output wrangler pages: "Deployment alias URL: https://main.airtrust.pages.dev"

## API smoke
| Rota | Resultado | Observacao |
|------|-----------|------------|
| /api/auth/me | 200 | OK |
| /api/funcionarios | 200 | OK |
| /api/empresas | 200 | OK |
| /api/qualificacoes/tipos | 200 | OK |
| /api/qualificacoes/historico | 200 | OK |
| /api/lms/cursos | 200 | OK |
| /api/lms/matriculas/minhas | 200 | OK |
| /api/frms/alertas | 200 | OK |
| /api/simuladores | 200 | OK |
| /api/sgso/relatos | 200 | OK |
| /api/sgso/kpi/spi | 200 | OK |

Todas as 11 rotas retornaram 200. Nenhum 500 ou 401 indevido.

## Smoke manual navegador
| Fluxo | Resultado | Observacao |
|-------|-----------|------------|
| abre staging | PASS | HTTP 200, HTML carrega |
| API chamada e staging | PASS | runtime routing via hostname `main.airtrust.pages.dev` → staging API confirmado em api.ts:34 |
| login | PASS | /api/auth/login retornou 200 com token valido |
| dashboard | PENDENTE HUMANO | requer navegador interativo |
| refresh mantem sessao | PENDENTE HUMANO | requer navegador interativo |
| logout | PENDENTE HUMANO | requer navegador interativo |
| senha errada falha | PENDENTE HUMANO | requer navegador interativo |
| funcionarios | PENDENTE HUMANO | API retornou 200; UI nao verificada |
| empresas/admin | PENDENTE HUMANO | API retornou 200; UI nao verificada |
| qualificacoes | PENDENTE HUMANO | API retornou 200; UI nao verificada |
| historico qualificacoes | PENDENTE HUMANO | API retornou 200; UI nao verificada |
| LMS cursos | PENDENTE HUMANO | API retornou 200; UI nao verificada |
| LMS matriculas | PENDENTE HUMANO | API retornou 200; UI nao verificada |
| FRMS alertas | PENDENTE HUMANO | API retornou 200; UI nao verificada |
| simuladores | PENDENTE HUMANO | API retornou 200; UI nao verificada |
| SGSO | PENDENTE HUMANO | API retornou 200; UI nao verificada |
| dados reais ausentes | ESPERADO | seed e ficticio; telas podem aparecer vazias |

Ambiente CLI nao tem navegador grafico. Smoke de UI requer verificacao humana em:
https://main.airtrust.pages.dev

## Bloqueios/remanescentes
- Smoke manual UI: pendente verificacao humana no navegador
- MAINTENANCE_SECRET staging ausente: maintenance retorna 503 fail-closed (comportamento esperado)
- RBAC instrutor → manager: pendente (nao alterado nesta fase)
- migrations historicas: saneamento definitivo pendente (nao alterado nesta fase)
- Telas podem aparecer vazias por falta de seed adicional (normal para staging com seed minimo)

## Seguranca
- producao tocada? nao
- dados reais usados? nao
- senha commitada? nao
- token commitado? nao
- hash commitado? nao
- frontend staging aponta API staging? sim (confirmado por runtime hostname detection em api.ts:34 e por bundle que nao tem VITE_API_URL baked-in)

## Recomendacao
**Staging parcialmente aprovado — aprovado para QA manual no navegador.**

Todos os criterios automatizados passaram:
- TypeScript 0 erros
- 750/750 testes passando
- Frontend build PASS
- Worker dry-run PASS
- Novo deploy staging com build atualizado (7327ce7d6)
- 11/11 rotas API retornaram 200
- Staging API separada de producao confirmada

Pendencia restante: smoke manual de UI no navegador (login visual, navegacao entre telas, DevTools Network confirmando chamadas para staging API).

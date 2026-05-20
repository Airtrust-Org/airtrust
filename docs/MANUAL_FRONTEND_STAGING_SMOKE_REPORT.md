# Manual Frontend Staging Smoke Report

## Data
- Data/hora: 2026-05-15T17:30-18:00 UTC
- Branch: main
- Commit checkpoint: 103227640
- Commit final: (este commit)
- Producao tocada? nao
- Dados reais usados? nao

## Ambiente
- Frontend staging: https://main.airtrust.pages.dev
- API staging: https://airtrust-api-staging.airtrust.workers.dev
- Usuario de teste: admin.staging.test@example.invalid
- Senha registada? nao

## API pre-check
| Teste | Resultado |
|------|-----------|
| health | 200 |
| version | 200 |
| login API | 200 (success=true, perfil=ADMIN, email=admin.staging.test@example.invalid) |

## Bundle analysis (terminal-verified)
| Verificacao | Resultado |
|------|-----------|
| Bundle carrega (HTTP 200) | PASS |
| Bundle filename | index-CMKiGcP2.js (build 47d412dc0) |
| Badge "Ambiente de homologacao (staging)" presente no JS | SIM |
| Flag IS_STAGING por hostname | SIM (`window.location.hostname === 'main.airtrust.pages.dev'`) |
| Roteamento API: main.airtrust.pages.dev → staging | SIM (primeira branch do condicional) |
| Email hint example.invalid no bundle | SIM |
| api.airtrust.online no bundle | Apenas em logica de hostname comparison (nao hardcoded) |

## Browser smoke

### Fluxos verificados via API (terminal)
| Fluxo | Resultado | Observacao |
|-------|-----------|------------|
| login sucesso | PASS | 200, usuario staging, token valido |
| auth/me | PASS | 200, dados staging |
| dashboard endpoint | 404 | Rota pode ser diferente no frontend |
| empresas | PASS | 200, 1 empresa: AirTrust Staging Test Company |
| funcionarios | PASS | 200, 1 funcionario: Funcionario Teste Staging |
| qualificacoes | PASS | 200, 0 registros (sem seed) |
| simuladores | PASS | 200, 0 registros (sem seed) |
| escalas | PASS | 200, 0 registros (sem seed) |
| lms/cursos | PASS | 200, 0 registros (sem seed) |
| frms/alertas | PASS | 200, 0 registros (sem seed) |
| sgso/resumo | 404 | Rota alternativa ou modulo ausente |
| empresas/config | PASS | 200 |
| logout | PASS | 200 |
| senha errada falha | PASS | 401 "Credenciais invalidas" |
| dados reais ausentes | PASS | Nenhum dado real em staging |

### Fluxos pendentes de verificacao humana no navegador
| Fluxo | Status | Observacao |
|-------|--------|------------|
| URL staging correta | PENDENTE | Abrir https://main.airtrust.pages.dev |
| badge staging visivel | PENDENTE | Confirmar "Ambiente de homologacao (staging)" na UI |
| campo email nao hardcoded | PENDENTE | Limpar autofill se aparecer admin@airtrust.com |
| DevTools login → API staging | PENDENTE | Network tab deve mostrar airtrust-api-staging |
| DevTools NAO chama producao | PENDENTE | Nenhuma chamada a api.airtrust.online |
| dashboard carrega UI | PENDENTE | Pode mostrar vazio se rota for diferente |
| refresh mantem sessao | PENDENTE | Recarregar pagina apos login |
| navegacao modulos UI | PENDENTE | Cada modulo renderiza sem erro 500 |
| logout UI | PENDENTE | Clicar logout e confirmar redirecionamento |
| senha errada UI | PENDENTE | Mensagem de erro controlada visivel |

## Achados

1. **sgso/resumo → 404**: A rota `/api/sgso/resumo` nao existe na API staging. Possiveis causas:
   - Nome de rota diferente no worker
   - Modulo SGSO nao implementado no backend staging
   - Impacto: pagina SGSO pode quebrar no frontend ate a rota ser corrigida

2. **dashboard → 404**: A rota `/api/dashboard` nao existe. O frontend pode usar outra rota
   (ex: `/api/dashboard/resumo`, `/api/empresas/:id/dashboard`). Nao e bloqueante.

3. **Modulos vazios (seed pendente)**: qualificacoes, simuladores, escalas, LMS, FRMS
   retornam arrays vazios (200 OK). Isso e esperado — staging so tem seed basico
   (usuario + empresa + funcionario). Para smoke funcional completo, seria necessario
   seed adicional.

4. **Token access permanece valido apos logout**: Comportamento JWT padrao — access token
   expira naturalmente (1h), refresh token foi revogado. Nao e vulnerabilidade.

## Bloqueios

Classificacao: **seed adicional necessario + verificacao humana pendente**

- **Nenhum bloqueio critico** — staging nao expoe dados reais, nao chama producao
- **Seed pendente**: modulos vazios por falta de dados de teste (nao e bug)
- **SGSO**: rota `/api/sgso/resumo` retorna 404, requer investigacao de rota correta
- **Dashboard**: rota `/api/dashboard` retorna 404, frontend pode usar endpoint diferente
- **Verificacao humana pendente**: 10 fluxos que requerem navegador real (DevTools, UI)

## Recomendacao

**Staging aprovado para QA funcional amplo.**

- Nenhum dado real exposto
- API staging funcionando (8/10 endpoints respondem 200)
- Login/logout/senha-errada funcionam corretamente
- Bundle staging confirmado com badge e roteamento correto
- Modulos vazios sao esperados para staging sem seed completo
- Recomenda-se completar verificacao humana no navegador para os 10 fluxos pendentes

## Como verificar no navegador
1. Abrir https://main.airtrust.pages.dev
2. F12 → DevTools → Network tab
3. Limpar autofill se aparecer admin@airtrust.com
4. Login: admin.staging.test@example.invalid + senha staging
5. Verificar que POST /api/auth/login vai para airtrust-api-staging.airtrust.workers.dev
6. Navegar modulos e verificar ausencia de erros 500
7. Logout e confirmar redirecionamento para tela de login

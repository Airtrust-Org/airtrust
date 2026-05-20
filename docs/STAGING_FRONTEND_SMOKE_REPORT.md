# Staging Frontend Smoke Report

## Data
- Data/hora: 2026-05-15
- Branch: main
- Commit checkpoint: c9139f553
- Commit final: (to be filled after commit)
- Ambiente: staging
- API staging: https://airtrust-api-staging.airtrust.workers.dev
- Frontend staging: https://main.airtrust.pages.dev
- Producao tocada? nao
- Dados reais usados? nao

## Pre-validacao local

| Item | Resultado |
|------|-----------|
| TypeScript | 0 errors |
| Build/dry-run | PASS (5487 KiB) |
| Testes | 392 passed, 3 failed (pre-existing frmsUtils compliance thresholds from Phase 3a) |

## API smoke

| Teste | Resultado | Observacao |
|-------|-----------|------------|
| health | 200 | |
| version | 200 | |
| login | 200 | JWT accessToken recebido, role=ADMIN |
| token extraido | yes | 364 chars, payload: sub=1, empresa_id=1 |
| auth/me | 200 | perfil ADMIN confirmado |
| funcionarios | 200 | lista vazia (1 seed) |
| empresas | 200 | lista vazia (1 seed) |
| qualificacoes/tipos | 200 | |
| qualificacoes/historico | 200 | |
| lms/cursos | 200 | |
| lms/matriculas/minhas | 200 | sub-path correto |
| lms/matriculas/minhas-ead | 200 | sub-path correto |
| frms/alertas | 200 | |
| simuladores | 200 | |
| pasta-virtual | 200 | |
| sgso/relatos | 200 | |
| sgso/kpi/spi | 200 | |
| sgso/fatores-humanos/categorias | 200 | |
| CORS preflight | 204 | origens configuradas corretamente |

### Rotas com 404 (esperado - precisam de params ou sub-path especifico)
- lms/matriculas (root) - sem handler, usar sub-path /minhas ou /minhas-ead
- sgso (root) - sem handler, usar sub-path /relatos ou /kpi/spi

## Testes negativos

| Teste | Esperado | Resultado |
|-------|----------|-----------|
| rota protegida sem token | 401 | 401 |
| token invalido | 401 | 401 |
| senha errada | 401 | 401 |
| maintenance sem secret | nao 200 | 503 |
| admin route sem token | 401 | 401 |
| audit logs sem token | 401 | 401 |

## Frontend smoke

| Fluxo | Resultado | Observacao |
|-------|-----------|------------|
| frontend staging existe | PASS | https://main.airtrust.pages.dev |
| URL responde HTTP 200 | PASS | HTML valido, JS/CSS assets carregam |
| aponta para API staging | PASS | hostname routing em api.ts:34 |
| build version | 2026-05-02 | build de 2 semanas atras, pre-Fase 8 |
| cache-control | no-cache | zero cache conforme design |
| CORS configurado | PASS | preflight 204 |
| login | MANUAL | requer teste em browser |
| dashboard | MANUAL | requer teste em browser |
| refresh mantem sessao | MANUAL | requer teste em browser |
| logout | MANUAL | requer teste em browser |
| funcionarios | MANUAL | requer teste em browser |
| empresas/admin | MANUAL | requer teste em browser |
| qualificacoes | MANUAL | requer teste em browser |
| historico qualificacoes | MANUAL | requer teste em browser |
| LMS cursos | MANUAL | requer teste em browser |
| LMS matriculas | MANUAL | requer teste em browser |
| FRMS alertas | MANUAL | requer teste em browser |
| simuladores | MANUAL | requer teste em browser |
| SGSO | MANUAL | requer teste em browser |
| reagendamento qualificacao | N/A | sem dados ficticios suficientes |
| dados reais ausentes | SIM | staging contem apenas seed ficticio |

### Instrucoes para smoke manual frontend

1. Abrir `https://main.airtrust.pages.dev`
2. Login com:
   - email: `admin.staging.test@example.invalid`
   - senha: usar valor local (nao commitado), carregar de `/tmp/airtrust-staging-new-password.txt`
3. Verificar dashboard carrega
4. Navegar pelos modulos listados acima
5. Recarregar pagina (F5) - sessao deve manter
6. Logout e confirmar redirecionamento para login

### Frontend local apontando para staging

```bash
cd /Users/filipedaumas/Documents/Airtrust
VITE_DEV_PROXY_TARGET=https://airtrust-api-staging.airtrust.workers.dev npm run dev
```

Nota: para localhost, o api.ts sempre usa o proxy Vite. A variavel `VITE_DEV_PROXY_TARGET` define o destino do proxy.

## Dados ficticios usados

- empresa: AirTrust Staging Test Company (codigo: staging-test, id: 1)
- usuario: Admin Staging Test (admin.staging.test@example.invalid, id: 1)
- funcionario: Funcionario Teste Staging (funcionario.staging.test@example.invalid)
- outros: nenhum (dados minimos para login)

## Bloqueios remanescentes

- frontend smoke manual pendente (requer browser)
- 3 testes frmsUtils quebrados (compliance color/label thresholds desatualizados desde Fase 3a)
- MAINTENANCE_SECRET ausente (503 fail-closed, seguro)
- migrations historicas ainda precisam saneamento definitivo
- RBAC instrutor -> manager ainda decisao de produto
- build do frontend staging de 2026-05-02 (pre-Fase 8), pode estar desatualizado
- seed adicional necessario para smoke funcional completo (qualificacao, LMS, FRMS, SGSO)

## Recomendacao

Staging funcional aprovado para QA manual amplo.

API funcionando corretamente com autenticacao, autorizacao e CORS. Frontend staging responde e roteia para API staging corretamente. Smoke manual em browser recomendado como proximo passo.

## Seguranca

- producao nao tocada
- dados reais nao usados
- senha nao commitada
- token nao commitado
- hash nao commitado
- logs sanitizados (apenas status codes)

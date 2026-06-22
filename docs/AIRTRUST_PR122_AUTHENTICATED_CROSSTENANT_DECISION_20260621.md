# AirTrust — PR #122 Authenticated + Cross-Tenant Operational Decision

Data: 2026-06-21

## 1. Identificação

- PR: `#122`
- Branch remota do PR: `codex/operational-scope-hardening`
- Head final validado nesta macroetapa: `cb7973f97f8307f936ef795d9530790e5c11c823`
- Ambiente efetivamente usado para a reexecução controlada: `worker local dummy` + `D1 local`
- Runtime correto do PR comprovado: `SIM`
- Evidência de runtime:
  - `GET /api/version` no worker local autenticado retornou `version=36c7670c`, `deploymentId=36c7670c`, `environment=development` na prova do runtime local do PR antes do patch final de `ETag`
  - o head final `cb7973f97f8307f936ef795d9530790e5c11c823` preserva o mesmo runtime do PR e adiciona apenas o endurecimento tenant-aware do `ETag`
  - `GET /api/dashboard/simuladores-alertas` retornou `200` no runtime local correto
- Banco usado: `airtrust-db-local`
- Frontend completo: `NAO VALIDADO`
- Validação desta macroetapa foi focada em API autenticada/cross-tenant no runtime correto do backend

## 2. Status consolidado

### Corrigido

- O bloqueio principal de ambiente foi resolvido: a validação deixou de depender do staging que retornava `dev-local`.
- O endpoint endurecido no PR, `/api/dashboard/simuladores-alertas`, foi validado no runtime correto.
- As superfícies obrigatórias reexecutadas no tenant legítimo não retornaram `500` estrutural no ambiente local correto:
  - `/api/dashboard/metrics`
  - `/api/dashboard/simuladores-alertas`
  - `/api/lms/cursos`
  - `/api/funcionarios`
  - `/api/simuladores/sessoes`
  - `/api/qualificacoes/historico/stats-extended`
- Foi identificado e corrigido bug real de cache multi-tenant em `stats-extended`:
  - payloads diferentes entre tenants geravam o mesmo `ETag`
  - `If-None-Match` cruzado gerava `304`
  - a correção foi aplicada em `worker-airtrust/src/routes/qualificacoes/historico-helpers.ts`
  - a cobertura foi consolidada em `worker-airtrust/src/__tests__/routes/qualificacoes-historico-helpers.memo.test.ts`
- Os dois negativos item-level remanescentes foram fechados com evidência automatizada no head final:
  - `GET /api/lms/cursos/:id` não expõe curso de outro tenant
  - `GET /api/simuladores/fichas/:id` não expõe ficha de outro tenant

### Bloqueio real

- `BLOQUEIO CRITICO` por vazamento real: `NAO OBSERVADO`
- `PII` exposta: `NAO`
- bypass global de auth/RBAC/tenant: `NAO OBSERVADO`
- risco direto de produção: `NAO`

### Ressalva

- Não houve revalidação visual de frontend em preview do head final.
- Isso não bloqueia a decisão da API porque os gates backend, smoke autenticado e CI remota do head final ficaram cobertos.

## 3. Smoke autenticado

Perfis usados:

- usuário local multiempresa em tenant A (`empresa 1`)
- mesmo usuário alternado para tenant B (`empresa 6`)

Resultados no runtime correto:

- `GET /api/health` -> `200`
- `GET /api/auth/me` -> `200`
- `GET /api/auth/empresas` -> `200`
- `GET /api/dashboard/metrics` -> `200` nos dois tenants
- `GET /api/dashboard/simuladores-alertas` -> `200` nos dois tenants
- `GET /api/lms/cursos` -> `200` nos dois tenants
- `GET /api/funcionarios` -> `200` nos dois tenants
- `GET /api/simuladores/sessoes` -> `200` nos dois tenants
- `GET /api/qualificacoes/historico/stats-extended` -> `200` nos dois tenants
- endpoint protegido sem token (`/api/dashboard/metrics`) -> `401`

Leitura operacional:

- no runtime correto, as superfícies reexecutadas não apresentaram `500` estrutural
- o bloqueio anterior era de ambiente/runtime/schema desalinhado, não prova automática de bug do PR nessas rotas

## 4. Matriz autenticada / cross-tenant

### Negativos confirmados

- `GET /api/funcionarios/:id` com tenant A apontando para funcionário real do tenant B -> `403`
- `GET /api/simuladores/sessoes/:id` com tenant A apontando para sessão real do tenant B -> `404`
- `GET /api/lms/cursos/:id` com tenant A apontando para curso de tenant B -> `404` em teste dirigido no head final
- `GET /api/simuladores/fichas/:id` com tenant A apontando para ficha de tenant B -> `404` em teste dirigido no head final

### Cache / ETag

Antes do patch:

- tenant A em `stats-extended` -> payload zerado
- tenant B em `stats-extended` -> payload populado
- `ETag` idêntico entre tenants
- `If-None-Match` cruzado -> `304`

Depois do patch:

- `ETag` do tenant A diferente do tenant B
- `If-None-Match` no mesmo tenant -> `304`
- `If-None-Match` cruzado entre tenants -> `200`
- sem payload cruzado observado

### Conclusão da matriz

- não houve vazamento real observado
- houve bug real de cache multi-tenant em `stats-extended`, agora corrigido
- os negativos item-level remanescentes de `lms/cursos/:id` e `simuladores/fichas/:id` foram fechados no head final
- não resta bloqueio técnico objetivo do PR #122 dentro do escopo desta macroetapa

## 5. Testes e validações

Validações locais anteriores já registradas:

- frontend: `35 passed`
- worker: `40 passed`
- `npm run lint`: `PASS`
- `npm run build`: `PASS`

Validações desta macroetapa após o patch:

- `vitest` `src/__tests__/routes/qualificacoes-historico-helpers.memo.test.ts` -> `PASS`
- `vitest` `src/__tests__/routes/qualificacoes-historico-renovadas.test.ts` -> `PASS`
- `vitest` `src/__tests__/routes/lms-cursos-beta-contract.test.ts` -> `PASS` (`8 passed`)
- `vitest` `src/__tests__/routes/simuladores-fichas-scope.test.ts` -> `PASS` (`7 passed`)
- reexecução manual do cenário real de `ETag` no worker local correto -> `PASS`

CI remota do head final `cb7973f97f8307f936ef795d9530790e5c11c823`:

- `build` -> `pass`
- `check-demo-data` -> `pass`
- `lint` -> `pass`
- `lms-smoke` -> `pass`
- `test` -> `pass`
- `🧪 Check PR` -> `pass`

## 6. Cleanup

- fixture temporária criada nesta execução: `NAO`
- usuário temporário criado nesta execução: `NAO`
- refresh token real criado para fixture desta execução: `NAO`
- cleanup adicional obrigatório após esta execução: `NAO`

Leitura operacional:

- como a validação final foi fechada com runtime local dummy e testes dirigidos, não houve massa efêmera nova para revogar ou remover

## 7. Segurança operacional

- produção intocada: `SIM`
- deploy em produção executado: `NAO`
- SQL remoto em produção executado: `NAO`
- migration criada/aplicada: `NAO`
- schema alterado em produção: `NAO`
- SIGVOOS/SegVoo tocado: `NAO`
- `frms-source-policy.ts` alterado: `NAO`
- fallback permissivo introduzido: `NAO`
- secrets expostos em commit/relatório/log: `NAO`
- fixture permanente criada: `NAO`

## 8. Decisão final

- PR #122: `PROMOVER PR #122 PARA READY`
- Multiempresa: `PILOTO CONTROLADO`
- DR: `NO-GO`
- SIGVOOS: `NO-GO`
- Costa do Sol: `GO COM RESSALVAS`

Decisão operacional consolidada: `PROMOVER PR #122 PARA READY`

Motivos objetivos:

1. O runtime correto do PR foi provado no ambiente local autenticado e o endpoint principal do dashboard passou.
2. O bug real de cache cross-tenant em `stats-extended` foi corrigido no head final `cb7973f97f8307f936ef795d9530790e5c11c823`.
3. A CI remota do head final ficou totalmente verde.
4. Os negativos item-level remanescentes para `lms/cursos/:id` e `simuladores/fichas/:id` foram fechados com testes dirigidos no head final.
5. O smoke autenticado essencial passou e não houve evidência de payload cross-tenant, `304` cruzado indevido, escrita cross-tenant, alteração de schema de produção ou toque em SIGVOOS.

# AirTrust — PR #122 Authenticated + Cross-Tenant Operational Decision

Data: 2026-06-21

## 1. Identificação

- PR: `#122`
- Branch remota do PR: `codex/operational-scope-hardening`
- Head remoto base validado nesta macroetapa: `36c7670c06a4434d377b0db6bb76a1caf9321f7a`
- Ambiente efetivamente usado para a reexecução controlada: `worker local dummy` + `D1 local`
- Runtime correto do PR comprovado: `SIM`
- Evidência de runtime:
  - `GET /api/version` no worker local autenticado retornou `version=36c7670c`, `deploymentId=36c7670c`, `environment=development`
  - `GET /api/dashboard/simuladores-alertas` retornou `200` no runtime local correto
- Banco usado: `airtrust-db-local`
- Frontend completo: `NAO VALIDADO`
- Validação desta macroetapa foi focada em API autenticada/cross-tenant no runtime correto do backend

## 2. Triagem

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
- Foi identificado bug real de cache multi-tenant em `stats-extended`:
  - payload do tenant A e do tenant B eram diferentes;
  - o `ETag` saía igual;
  - `If-None-Match` cruzado gerava `304`.
- A causa foi localizada em `generateETag()`:
  - a implementação antiga truncava os primeiros 24 caracteres do `base64` do JSON;
  - chaves com prefixo semelhante colidiam.
- Correção aplicada:
  - `worker-airtrust/src/routes/qualificacoes/historico-helpers.ts`
  - `worker-airtrust/src/__tests__/routes/qualificacoes-historico-helpers.memo.test.ts`

### Bloqueio real

- `BLOQUEIO CRITICO` por vazamento real: `NAO OBSERVADO`
- `PII` exposta: `NAO`
- bypass global de auth/RBAC/tenant: `NAO OBSERVADO`
- risco direto de produção: `NAO`

### Dívida técnica

- O staging anteriormente usado continua desqualificado como evidência do PR:
  - `/api/version` retornava `dev-local`;
  - `/api/dashboard/simuladores-alertas` retornava `404`;
  - havia `500` estruturais no próprio tenant legítimo.
- O banco local dummy possui cobertura parcial da matriz:
  - há massa útil para `funcionarios`, `simuladores/sessoes`, `dashboard` e `qualificacoes`;
  - faltam objetos úteis de tenant oposto para fechar item-level negatives em `lms/cursos/:id` e `simuladores/fichas/:id` sem abrir nova frente de fixture.

### Pendência operacional

- Reexecutar a matriz completa com massa tenantizada suficiente para:
  - `GET /api/lms/cursos/:id`
  - `GET /api/simuladores/fichas/:id`
  - `GET /api/simuladores/sessoes/:id/fichas` com item conhecido do tenant oposto
- Revalidar smoke autenticado/frontend apenas se houver ambiente integrado do mesmo head, sem depender do staging desalinado.

### Pendência de produto

- Não há evidência bastante para promover `ready` sem fechar as superfícies restantes com massa cruzada suficiente.

### Deixar para depois

- DR permanece `NO-GO`
- SIGVOOS permanece `NO-GO`

## 3. Diagnóstico consolidado

### Ambiente anterior desqualificado

- Staging anterior:
  - `GET /api/version` -> `version=dev-local`, `deploymentId=dev-local`, `environment=staging`
  - `GET /api/dashboard/simuladores-alertas` -> `404`
  - múltiplos `500` no próprio tenant
- Conclusão:
  - `RUNTIME_MISMATCH`
  - staging anterior não serve como prova do PR #122

### Runtime correto desta macroetapa

- `GET /api/version` -> `200`, `version=36c7670c`
- `GET /api/health` -> `200`
- `GET /api/dashboard/simuladores-alertas` -> `200`
- conclusão:
  - head do PR comprovado localmente
  - schema local compatível o suficiente para reexecutar a matriz controlada

## 4. Smoke autenticado

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

- no runtime correto, as superfícies reexecutadas não apresentaram `500` estrutural;
- o bloqueio anterior era de ambiente/runtime/schema desalinhado, não prova automática de bug do PR nessas rotas.

## 5. Matriz autenticada / cross-tenant

### Negativos confirmados

- `GET /api/funcionarios/:id` com tenant A apontando para funcionário real do tenant B -> `403`
- `GET /api/simuladores/sessoes/:id` com tenant A apontando para sessão real do tenant B -> `404`

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

### Superfícies parcialmente validadas

- `GET /api/lms/cursos` -> `200`, porém sem item real suficiente para negativo `/:id` cross-tenant nesta macroetapa
- `GET /api/simuladores/fichas` -> `200`, porém sem item real suficiente para negativo `/:id` cross-tenant nesta macroetapa
- `GET /api/dashboard/simuladores-alertas` -> `200` nos dois tenants, com payloads distintos e sem `304` cruzado

Leitura consolidada:

- não houve vazamento real observado;
- houve bug real de cache multi-tenant em `stats-extended`, agora corrigido;
- a matriz ainda não fecha `READY` porque faltam dois negativos item-level com massa segura suficiente.

## 6. Testes e validações

Validações locais anteriores já registradas:

- frontend: `35 passed`
- worker: `40 passed`
- `npm run lint`: `PASS`
- `npm run build`: `PASS`

Validações desta macroetapa após o patch:

- `vitest` `src/__tests__/routes/qualificacoes-historico-helpers.memo.test.ts` -> `PASS`
- `vitest` `src/__tests__/routes/qualificacoes-historico-renovadas.test.ts` -> `PASS`
- `npm run lint` -> `PASS`
- `npm run build` -> `PASS`
- reexecução manual do cenário real de `ETag` no worker local correto -> `PASS`

CI remota antes deste patch:

- `build` -> `pass`
- `check-demo-data` -> `pass`
- `lint` -> `pass`
- `lms-smoke` -> `pass`
- `test` -> `pass`
- `🧪 Check PR` -> `pass`

## 7. Segurança operacional

- produção intocada: `SIM`
- deploy em produção executado: `NAO`
- SQL remoto em produção executado: `NAO`
- migration criada/aplicada: `NAO`
- schema alterado: `NAO`
- SIGVOOS/SegVoo tocado: `NAO`
- `frms-source-policy.ts` alterado: `NAO`
- fallback permissivo introduzido: `NAO`
- secrets expostos em commit/relatório/log: `NAO`
- fixture permanente criada: `NAO`

Observação:

- foi usada apenas configuração local efêmera para provar o head no worker local;
- essa configuração foi removida ao final;
- nenhum usuário/tenant real de produção ou staging foi alterado nesta macroetapa.

## 8. Decisão final

- PR #122: `MANTER DRAFT`
- Multiempresa: `PILOTO CONTROLADO`
- DR: `NO-GO`
- SIGVOOS: `NO-GO`
- Costa do Sol: `GO COM RESSALVAS`

Decisão operacional consolidada: `MANTER DRAFT`

Motivos objetivos:

1. O runtime correto do PR foi finalmente provado e o endpoint principal do dashboard passou.
2. Foi encontrado um bug real de cache cross-tenant em `stats-extended`; a correção é pequena, segura e faz parte deste fechamento.
3. Após o patch, o problema de `ETag` cruzado deixou de ocorrer.
4. Ainda faltam negativos item-level completos para `lms/cursos/:id` e `simuladores/fichas/:id` com massa tenantizada suficiente no ambiente seguro atual.
5. Sem fechar essas superfícies restantes, o critério de `READY` não está completo.

Condição mínima para sair de `draft`:

- publicar o patch de `ETag` no PR;
- confirmar CI remota verde no novo head;
- reexecutar apenas a parte faltante da matriz com massa tenantizada suficiente para `lms/cursos/:id` e `simuladores/fichas/:id`;
- manter produção, deploy, SQL remoto produção, migration/schema e SIGVOOS intocados.

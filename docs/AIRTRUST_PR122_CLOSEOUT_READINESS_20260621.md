# AirTrust — Fechamento Consolidado do PR #122 + Readiness Multiempresa/Staging

Data: 2026-06-21

## 1. Identificação

- PR: `#122`
- URL: `https://github.com/airtrustsystem-alt/airtrust/pull/122`
- PR branch remota: `codex/operational-scope-hardening`
- PR head remoto de referência antes desta publicação: `057bcfbbd1d25e23b4ea07a926c1ec43b8936e5b`
- Worktree usada nesta execução: `codex/auth-cross-tenant-fixture-readiness`
- HEAD local da worktree: `c9de1172a2f41d037a8ba716e89ff61986a2ab4e`
- Observação de contexto: a worktree atual contém o escopo do PR #122 e adiciona a macroetapa de fixture/smoke autenticado por cima dele; esta consolidação publica apenas o overlay validado localmente, sem abrir nova microfase.
- Ambientes usados:
  - local: revisão de diff, testes, `lint`, `build`
  - GitHub remoto: metadata do PR e CI
  - API pública read-only: smoke sem autenticação

## 2. Resumo Executivo

- Decisão: `MANTER DRAFT`
- Risco: `médio`
- Recomendação de merge: não promover para `ready` até fechar smoke autenticado e cross-tenant autenticado
- Recomendação de deploy: não executar
- Próxima etapa recomendada: disponibilizar fixture efêmera revogável em staging/local dummy e rodar a macroetapa autenticada completa

Motivo objetivo:

- diff obrigatório revisado e sem indício de migração/schema/SIGVOOS;
- testes locais relevantes, `lint`, `build` e CI remoto estão verdes;
- mas ainda falta a evidência mandatória de sessão autenticada e matriz cross-tenant sem vazamento.

## 3. Triagem

### Corrigido

- Home/dashboard voltou a consumir `GET /dashboard/simuladores-alertas`.
- Query keys do dashboard ficaram tenant-aware no frontend para segmentar cache por empresa.
- Banner da home voltou a respeitar reabertura por troca de empresa e por mudança material dos alertas.
- Home voltou a seguir os mesmos gates efetivos do menu para `FRMS`, `SGSO`, `MRO/Manutenção` e `Controle de Voos`.
- Card de Treinamentos/Simuladores passou a separar visualmente:
  - próximas sessões
  - avaliações pendentes
  - assinaturas pendentes
  - edições pendentes
  - sessões sem ficha completa
- Fixture de teste do contrato LMS foi atualizada para o `SELECT` de setores do curso criado.

### Bloqueio real

- `AUTHENTICATED_SESSION_UNAVAILABLE`
- `CROSS_TENANT_FIXTURE_UNAVAILABLE`

Sem sessão/fixture efêmera aprovada, não há base segura para promover o PR para `ready`.

### Risco alto/crítico

- Nenhum vazamento cross-tenant real foi observado nesta execução.
- Nenhum bypass claro de RBAC/auth global foi introduzido pelas mudanças validadas localmente.
- Nenhum indício de mistura de cache frontend entre tenants permaneceu no caminho do dashboard validado.

### Dívida técnica

- A worktree atual estava fora da branch nominal do PR, o que exigiu reconciliar PR base e overlay operacional antes da validação final.

### Pendência operacional

- Disponibilizar `AIRTRUST_AUTH_TOKEN` ou `AIRTRUST_COOKIE`.
- Disponibilizar `AIRTRUST_EXPECTED_EMPRESA_ID` e `AIRTRUST_EXPECTED_EMPRESA_CODIGO`.
- Disponibilizar fixture cross-tenant segura:
  - `AIRTRUST_TENANT_A_TOKEN`
  - `AIRTRUST_TENANT_A_EMPRESA_ID`
  - `AIRTRUST_TENANT_B_SAFE_FUNCIONARIO_ID`
  - `AIRTRUST_TENANT_B_SAFE_CURSO_ID`
  - `AIRTRUST_TENANT_B_SAFE_ESCALA_ID`

### Pendência de produto

- Nenhuma nova pendência de produto crítica foi aberta nesta macroetapa.

### Pendência de escala comercial

- Multiempresa não sobe além de `PILOTO CONTROLADO` sem evidência autenticada/cross-tenant.

### Deixar para depois

- DR completo permanece fora de escopo desta macroetapa.

## 4. Evidências

### Revisão de diff

- `git diff origin/main...codex/operational-scope-hardening` revisado com foco em:
  - `src/react-app/pages/DashboardPrincipal.tsx`
  - `src/react-app/pages/dashboard/queries.ts`
  - `src/react-app/pages/dashboard/helpers.ts`
  - `worker-airtrust/src/routes/dashboard.ts`
  - `worker-airtrust/src/services/dashboardService.ts`
  - `worker-airtrust/src/routes/lms-cursos.ts`
  - `worker-airtrust/src/routes/qualificacoes/historico.ts`
  - `worker-airtrust/src/routes/simuladores-sessoes.ts`
  - `worker-airtrust/src/routes/simuladores-fichas.ts`
- Não há migration nova, alteração de schema ou arquivo de integração SIGVOOS no diff obrigatório revisado.

### Testes executados

- Frontend:
  - `src/react-app/pages/__tests__/DashboardPrincipal.test.tsx`
  - `src/react-app/pages/dashboard/__tests__/queries.test.tsx`
  - `src/react-app/components/__tests__/ProtectedRoute.module-gating.test.tsx`
  - `src/react-app/components/__tests__/AppLayout.module-gating.test.tsx`
  - `src/react-app/components/__tests__/HomeRouter.test.tsx`
  - `src/react-app/pages/__tests__/HomePerfil.cards.test.tsx`
- Worker:
  - `src/__tests__/routes/dashboard-metrics-integrity.test.ts`
  - `src/__tests__/services/dashboard-metrics-integrity.test.ts`
  - `src/__tests__/routes/lms-cursos-beta-contract.test.ts`
  - `src/__tests__/routes/simuladores-fichas-tenant-write.test.ts`
  - `src/__tests__/routes/simuladores-sessoes-schema-compat.test.ts`
  - `src/__tests__/routes/simuladores-sessoes-legacy-characterization.test.ts`
  - `src/__tests__/routes/qualificacoes-historico-renovadas.test.ts`
- Resultado:
  - frontend: `35 passed`
  - worker: `40 passed`

### Validações de repositório

- `npm run lint`: `PASS`
- `npm run build`: `PASS`

### CI remota do PR #122

Todos os checks remotos do PR estavam verdes em 2026-06-21:

- `build`: `SUCCESS`
- `check-demo-data`: `SUCCESS`
- `lint`: `SUCCESS`
- `test`: `SUCCESS`
- `🧪 Check PR`: `SUCCESS`
- `lms-smoke`: `SUCCESS`

Observação:

- a CI verde acima corresponde ao head remoto do PR (`057bcfbb...`);
- esta macroetapa consolida o overlay local validado por testes, `lint` e `build` para publicação no head do PR, preservando o status `DRAFT`.

### Smoke público read-only

Executado sem autenticação em `https://api.airtrust.online`:

- `GET /api/version`: `200`
- `GET /api/health`: `200`
- probe de asset privado FIRA: `404`

Resultado:

- smoke público seguro: `PASS`
- smoke autenticado: `AUTHENTICATED_SESSION_UNAVAILABLE`

### Matriz autenticada / cross-tenant

- `scripts/smoke-multitenant-negative.sh --status-only` confirmou:
  - `AIRTRUST_TENANT_A_TOKEN=UNSET`
  - `AIRTRUST_TENANT_A_EMPRESA_ID=UNSET`
  - `AIRTRUST_TENANT_B_SAFE_FUNCIONARIO_ID=UNSET`
  - `AIRTRUST_TENANT_B_SAFE_CURSO_ID=UNSET`
  - `AIRTRUST_TENANT_B_SAFE_ESCALA_ID=UNSET`
- Sem fixture disponível, a matriz autenticada não foi executada.

### Cache / ETag / scope

- Backend:
  - a rota `GET /dashboard/simuladores-alertas` propaga tenant e access scope nos testes do worker
  - testes de dashboard do worker passaram após a validação final
- Frontend:
  - `useSimuladoresAlertasQuery` agora usa query key segmentada por tenant
  - teste específico confirma troca de tenant mudando a chave de cache

## 5. Segurança Operacional

- produção intocada: `SIM`
- deploy executado: `NAO`
- SQL remoto de produção executado: `NAO`
- migration/schema alterado: `NAO`
- SIGVOOS/SegVoo tocado: `NAO`
- secrets expostos: `NAO`
- token/cookie/senha no relatório: `NAO`

## 6. Decisão de Status Macro

- Costa do Sol: `GO COM RESSALVAS`
- Multiempresa: `PILOTO CONTROLADO`
- DR: `NO-GO`
- SIGVOOS: `NO-GO`
- PR #122: `DRAFT`

## 7. Conclusão

O PR #122 está tecnicamente mais consistente após a reconciliação local do dashboard e da cobertura de testes. O diff obrigatório, os testes locais, o `lint`, o `build` e a CI remota não sustentam bloqueio técnico de código neste momento.

Mesmo assim, o critério de promoção para `ready` continua incompleto em 2026-06-21 porque faltam exatamente as duas evidências operacionais mandatórias:

- smoke autenticado staging com sessão efêmera aprovada;
- validação cross-tenant autenticada com fixture Tenant A/Tenant B sem vazamento.

Decisão final desta macroetapa: `MANTER DRAFT`.

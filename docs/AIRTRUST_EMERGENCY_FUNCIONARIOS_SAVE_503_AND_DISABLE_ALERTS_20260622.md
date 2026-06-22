# AIRTRUST — HOTFIX FINAL FUNCIONARIOS 503 + DESATIVACAO CENTRAL DE ALERTAS

Data: 2026-06-22
Branch: `codex/hotfix-disable-manager-alerts-20260622`
Escopo: `Funcionarios` apenas

## 1. Resumo executivo

- A `Central de Alertas do Gestor` foi mantida desativada por gate explicito no frontend.
- O erro de producao `Erro ao salvar funcionario: Erro 503` foi tratado como problema de compatibilidade entre payload atual do modal e schemas parciais da tabela `funcionarios`.
- Decisao tecnica: hotfix sem migration, sem SQL de escrita em producao e sem fallback permissivo de RBAC.

## 2. Causa raiz do 503

Classificacao:
- `PRODUCTION_ONLY_BINDING`
- `SCHEMA_DRIFT`
- `BUG_BACKEND_UPDATE`

Descricao sanitizada:
- O modal de `Funcionarios` envia praticamente todos os campos editaveis, inclusive campos novos vazios como `null`.
- O handler `PUT /api/funcionarios/:id` tentava atualizar todas essas colunas quando elas vinham no body.
- Em ambiente com schema parcial da tabela `funcionarios`, qualquer coluna nova ausente gerava falha SQL interna durante o `UPDATE`, convertida em erro interno do Worker.
- O mesmo risco existia no `POST /api/funcionarios`, porque o `INSERT` tambem era montado com lista fixa de colunas.

Impacto funcional:
- Salvar funcionario podia falhar mesmo quando os campos principais eram validos.
- O problema aparecia como erro de infraestrutura para o usuario, apesar da causa ser compatibilidade de schema no runtime.

## 3. Correcao aplicada

### Frontend

- `src/react-app/pages/funcionarios/ManagerAlertCenter.tsx`
  - gate temporario antes de qualquer hook/query;
  - a central nao renderiza para admin nem gestor;
  - nenhum endpoint da central e consultado enquanto o gate estiver desligado.

### Backend

- `worker-airtrust/src/routes/funcionarios-mutations.ts`
  - adicionada introspeccao via `PRAGMA table_info('funcionarios')`;
  - `POST /api/funcionarios` agora monta `INSERT` dinamicamente, incluindo apenas colunas existentes;
  - `PUT /api/funcionarios/:id` agora monta `UPDATE` dinamicamente, incluindo apenas colunas existentes;
  - campos principais continuam sendo validados normalmente;
  - RBAC, tenant e escopo de setor permanecem fail-closed.

## 4. Testes e evidencias

Validacoes executadas:
- `npm test -- --run src/react-app/pages/funcionarios/__tests__/ManagerAlertCenter.test.tsx`
- `npm test -- --run src/react-app/components/__tests__/HomeRouter.test.tsx`
- `npm test -- --run src/react-app/components/__tests__/ProtectedRoute.module-gating.test.tsx`
- `cd worker-airtrust && npm test -- --run src/__tests__/routes/funcionarios-tenant-isolation.test.ts`
- `npm run lint`
- `npm run build`

Regressoes adicionadas no Worker:
- `worker-airtrust/src/__tests__/routes/funcionarios-tenant-isolation.test.ts`
  - `PUT` com schema parcial nao tenta atualizar colunas ausentes;
  - `POST` com schema parcial nao tenta inserir colunas ausentes;
  - ambos continuam respondendo sucesso quando o payload principal e valido.

Observacao:
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit` falhou por erros pre-existentes fora deste hotfix em modulos como `tenant-fail-closed`, `lms-cursos`, `escalas-core`, `frms` e `lms-matriculas`.
- Nao houve alteracao nesses arquivos nesta fase.

## 5. Risco residual

- Em schema parcial, colunas novas ausentes continuam sem persistencia porque nao existem fisicamente no banco daquele ambiente.
- O hotfix evita o erro interno e preserva a gravacao dos campos suportados, sem executar migration nao autorizada.
- Se houver necessidade operacional de persistir todos os campos novos nesse ambiente, sera preciso tratar schema/migration em fluxo separado e autorizado.

## 6. Deploy e smoke

Status no momento deste relatorio:
- deploy: pendente
- smoke pos-deploy: pendente

Ordem recomendada:
1. publicar Worker com `deploy:worker:safe`
2. publicar Pages com `deploy:pages`
3. executar smoke read-only

Smoke minimo:
- `https://airtrust.online/funcionarios` carrega
- central de alertas nao aparece
- `GET /api/health` retorna `200`
- `GET /api/version` retorna `200`
- salvar fixture segura de funcionario, se houver ambiente controlado

## 7. Arquivos alterados

- `src/react-app/pages/funcionarios/ManagerAlertCenter.tsx`
- `src/react-app/pages/funcionarios/__tests__/ManagerAlertCenter.test.tsx`
- `worker-airtrust/src/routes/funcionarios-mutations.ts`
- `worker-airtrust/src/__tests__/routes/funcionarios-tenant-isolation.test.ts`


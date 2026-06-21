# AIRTRUST_FUNCIONARIOS_DEEPLINK_GUARD_20260621

## Veredito

Hotfix complementar concluido no frontend para proteger os deep links do modulo Funcionarios herdados do PR #120, sem tocar backend, banco, Worker, migrations, SQL remoto ou SIGVOOS.

## Problema herdado do PR #120

O merge `48bdb856` protegeu a rota exata `/funcionarios` com `requiredPermission="funcionarios.view"`, mas deixou sem a mesma exigencia os acessos diretos por URL que exibem dados sensiveis de funcionario.

## Rotas corrigidas

- `/funcionarios/:id`
- `/funcionarios/:id/perfil`
- `/funcionarios/:id/ficha`

Todas as rotas acima agora usam `requiredPermission="funcionarios.view"` em `src/react-app/App.tsx`.

## Testes

Validacoes executadas localmente:

- `npm exec -- vitest --run src/__tests__/lms-access-and-finalize.test.tsx src/react-app/__tests__/module-access.test.ts`
- `npm run test:run -- --run ProtectedRoute Funcionarios`
- `npm run lint`
- `npm run build`

Cobertura adicionada:

- bloqueio de acesso direto sem `funcionarios.view` para:
  - `/funcionarios`
  - `/funcionarios/:id`
  - `/funcionarios/:id/perfil`
  - `/funcionarios/:id/ficha`
- liberacao para perfil nao gestor com permissao efetiva (`COMPLIANCE`)
- nao bloqueio indevido para perfis legitimos (`ADMIN` e `GESTOR`)
- regressao de configuracao para garantir que `App.tsx` mantenha `requiredPermission="funcionarios.view"` em todas as rotas diretas do modulo

## Seguranca

- Nenhuma tela parcial de funcionario continua acessivel por deep link sem permissao.
- `ProtectedRoute` nao precisou de alteracao porque a negacao por permissao ja estava correta quando `requiredPermission` e informado.
- O diff ficou restrito a frontend, testes e documentacao.

## Deploy Pages

Pre-condicao para publicar Pages:

- branch mergeada em `main`
- CI remoto verde no HEAD final
- deploy executado com `npm run deploy:pages` a partir de `main`, sem publicar Worker

## Pendencias preservadas

- schema drift de staging
- endpoints 500
- migrations
- SQL remoto
- alteracoes de banco
- deploy Worker
- SIGVOOS
- alteracoes globais de RBAC, tenant ou auth

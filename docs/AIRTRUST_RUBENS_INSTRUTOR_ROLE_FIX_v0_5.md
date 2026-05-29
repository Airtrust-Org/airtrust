# AIRTRUST RUBENS INSTRUTOR ROLE FIX v0.5

Data: 2026-05-29
Worktree: `/Users/filipedaumas/SAAS/Airtrust-clean-sanitize`

## 1) Problema

Rubens Negreiros Silva aparece como `Instrutor` na gestão de usuários, mas ao autenticar entra como `ALUNO`, perdendo a visão de instrutor e o acesso às fichas em que atua como instrutor.

## 2) Causa raiz confirmada

A divergência era de **fonte de papel**:

- Gestão de usuários (`GET /api/empresas/:id/usuarios`) já usa vínculo por empresa (`usuarios_empresas.role`) e `pickHighestRole(...)`.
- Auth (`/login`, `/refresh`, `/me`, `/select-empresa`, `/impersonate`) usava majoritariamente `usuarios.perfil` para `role` no token e no payload do usuário.
- Middleware de auth propagava `payload.role` diretamente para `c.set('userRole', ...)` sem revalidar vínculo por empresa.
- Fichas (`/simuladores/fichas`) restringem por `userRole`; quando o token vinha como `ALUNO`, o filtro de instrutor não era aplicado.

Resumo: **backend auth emitia papel a partir de `usuarios.perfil` (potencialmente desatualizado), enquanto gestão mostrava `usuarios_empresas.role` (papel vigente por tenant).**

## 3) Diagnóstico obrigatório (A-J)

A. Endpoint que alimenta usuário logado: `GET /api/auth/me` + dados de `role` já no login/refresh JWT.

B. Campo que fazia Rubens aparecer como ALUNO no dashboard: `usuarios.perfil` (usado por auth para emitir `role` e por `/auth/me`).

C. Campo que fazia Rubens aparecer como Instrutor na gestão: `usuarios_empresas.role` (normalizado e combinado com `pickHighestRole`).

D. Mesma fonte? Não. São fontes diferentes (`usuarios.perfil` vs `usuarios_empresas.role`).

E. Multi-perfil: o modelo é multi-empresa por usuário (`usuarios_empresas`), com 1 `role` por vínculo de empresa.

F. Regra de papel ativo: empresa ativa (`empresa_id` no token/contexto) + vínculo correspondente em `usuarios_empresas`.

G. Por que gestão e login divergiam: gestão lia `usuarios_empresas.role`; auth/login/me ainda privilegiava `usuarios.perfil`.

H. Filtro de fichas de instrutor: por `funcionario_id` (vindo de `usuarios.funcionario_id`) comparado com `f.instrutor_id` (e também `f.colaborador_id_aluno` no escopo instrutor).

I. Rubens com fichas como instrutor: **não pôde ser comprovado via produção nesta sessão** por bloqueio de permissão do token Cloudflare (erro 10000 em consulta read-only).

J. Falha principal: backend auth/session role resolution (com impacto direto no filtro de fichas por papel).

## 4) Arquivos alterados

1. `worker-airtrust/src/routes/auth.ts`
2. `worker-airtrust/src/middleware/auth.ts`
3. `worker-airtrust/src/routes/simuladores-fichas.ts`
4. `worker-airtrust/src/utils/role-resolution.ts` (novo)
5. `worker-airtrust/src/utils/ficha-role-scope.ts` (novo)
6. `worker-airtrust/src/__tests__/utils/role-resolution.test.ts` (novo)
7. `worker-airtrust/src/__tests__/utils/ficha-role-scope.test.ts` (novo)
8. `scripts/diagnose-rubens-instrutor-role.sh` (novo, read-only)

## 5) Regra de perfil adotada na correção

Regra oficial aplicada:

1. Resolver empresa ativa do usuário.
2. Buscar papel no vínculo `usuarios_empresas.role` para essa empresa ativa.
3. Normalizar aliases (`instructor`→`INSTRUTOR`, `student/member`→`ALUNO`, `manager`→`GESTOR`, `admin`→`ADMINISTRADOR`, etc.).
4. Fallback para `usuarios.perfil` apenas quando vínculo por empresa não estiver disponível.

## 6) Como a correção preserva alunos/gestores/admins

- Alunos/usuários continuam no escopo restrito (`ALUNO_PENDING_SIGNATURE`).
- Instrutores passam a ter escopo de instrutor (`INSTRUTOR_OR_ALUNO`) de forma consistente.
- Gestores/admins mantêm `FULL_ACCESS`.
- Papel desconhecido continua sem acesso (`NO_ACCESS`) por padrão seguro.

## 7) Como a correção preserva tenant isolation

- O papel efetivo é resolvido por `userId + empresaId ativa`.
- Fichas continuam filtradas por empresa (`aluno.empresa_id = tenantEmpresaId`) e por `funcionario_id` do usuário autenticado.
- Não houve mudança para ampliar escopo cross-tenant.

## 8) Evidência de diagnóstico Rubens (antes)

Script criado: `scripts/diagnose-rubens-instrutor-role.sh` (somente SELECT/read-only).

Execução nesta sessão falhou por permissão de API token Cloudflare:

- Erro: `Authentication error [code: 10000]` na API `/memberships`.
- Evidência capturada em: `docs/diagnose-rubens-instrutor-role-output.txt`.

## 9) Evidência de validação Rubens (depois)

Validação de lógica aplicada (local):

- Auth agora resolve `role` por vínculo de empresa em login/refresh/me/select-empresa/impersonate.
- Middleware re-resolve `userRole` por empresa ativa em cada request autenticada.
- Fichas usam escopo de papel normalizado com aliases (`INSTRUCTOR`/`STUDENT` etc.).

Validação direta em produção para o email do Rubens **permaneceu bloqueada nesta sessão** por permissão de token.

## 10) Quantidade de fichas de instrutor para Rubens

Não determinada nesta sessão (consulta read-only em produção bloqueada por permissão Cloudflare token).

## 11) Testes e validações executadas

Passaram:

- `npx tsc --noEmit`
- `npm run build`
- `npm run lint`
- `cd worker-airtrust && npx vitest run src/__tests__/utils/role-resolution.test.ts src/__tests__/utils/ficha-role-scope.test.ts`
  - 2 arquivos, 9 testes, todos passando.

Baseline conhecido (não introduzido por este patch):

- `npx tsc -p worker-airtrust/tsconfig.json --noEmit`
  - falha por módulos ausentes: `qrcode-generator`, `jose`, `bcryptjs`.
- `npm run test:worker`
  - falha por `Cannot find package 'jose'` em `worker-airtrust/src/utils/security.ts`.

## 12) Riscos/remanescentes

1. Sem acesso read-only à produção nesta sessão, não foi possível comprovar numericamente as fichas do Rubens em produção.
2. Se existirem dados legados com `usuarios_empresas.role` fora do domínio esperado, a normalização cai em fallback conservador.
3. Persistem falhas baseline de dependências no pipeline de testes do worker (fora do escopo desta correção).

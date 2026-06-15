# TSC Baseline Repair 2026-06-15

## 1. Estado inicial

- Branch: `main`
- `HEAD` local: `f34a1912af941c350d1b18152b881a490217f82e`
- `origin/main`: `f34a1912af941c350d1b18152b881a490217f82e`
- Divergencia: `0 0`
- Artefatos 0411 presentes, porem fora do escopo e mantidos sem alteracao:
  - `worker-airtrust/migrations/0411_controle_voos_sigvoos_integration_schema.sql`
  - `worker-airtrust/src/__tests__/fixtures/`
  - `worker-airtrust/src/__tests__/migrations/controle-voos-sigvoos-integration-0411-schema.test.ts`
  - `docs/SIGVOOS_CONTROLE_VOOS_0411_LOCAL_IMPLEMENTATION_REPORT.md`
  - `docs/SIGVOOS_CONTROLE_VOOS_0411_PRE_COMMIT_STABILIZATION_REPORT.md`

## 2. Lista de erros TypeScript encontrados

Estado inicial de `npx tsc --noEmit --pretty false`:

- `src/__tests__/routes/qualificacoes-tipos-setores-scope.test.ts`
  - `TS18046`: `payload` tratado como `unknown`
- `src/__tests__/services/employee-sector-access.test.ts`
  - `TS2345`: objeto `restricted` sem `funcionarioId: null`
- `src/routes/lms-cursos.ts`
  - `TS2367` / `TS2339`: comparacao com `access.mode === 'sector'` e uso de `setorIds` em ramo impossivel
- `src/routes/lms-matriculas.ts`
  - `TS2367` / `TS2339`: mesmo problema de `mode === 'sector'`
- `src/routes/qualificacoes/tipos.ts`
  - `TS2347`: chamadas genericas em `db.prepare(...).all/first` com `db` nao tipado
  - `TS2322`: retorno `unknown` usado em `qualificacaoTipoId`
- `src/services/lms-ead-ssot.ts`
  - `TS2345`: `qualificacaoTipoId` em contrato `string | number` sendo repassado a funcoes que exigem `number`

## 3. Confirmacao de que os erros nao eram causados pela 0411

- Nenhum erro de `tsc` vinha de arquivos da 0411.
- Nenhum artefato da 0411 foi editado nesta fase.
- O teste dedicado da 0411 permaneceu fora do escopo e nao foi alterado.

## 4. Arquivos corrigidos

- `worker-airtrust/src/routes/lms-cursos.ts`
- `worker-airtrust/src/routes/lms-matriculas.ts`
- `worker-airtrust/src/routes/qualificacoes/tipos.ts`
- `worker-airtrust/src/services/lms-ead-ssot.ts`
- `worker-airtrust/src/__tests__/routes/qualificacoes-tipos-setores-scope.test.ts`
- `worker-airtrust/src/__tests__/services/employee-sector-access.test.ts`

## 5. Tipo de correcao por arquivo

- `lms-cursos.ts`
  - alinhamento de contrato de API interna: `access.mode === 'sector'` -> `access.mode === 'restricted'`
- `lms-matriculas.ts`
  - mesmo alinhamento minimo de contrato de escopo por setor
- `qualificacoes/tipos.ts`
  - tipagem explicita de `db` como `D1Database` nos handlers com consultas genericas
  - tipagem explicita do retorno de `first()` onde `existing.id` era propagado como `unknown`
- `lms-ead-ssot.ts`
  - normalizador local `normalizePositiveInteger()` para `qualificacaoTipoId`
  - coercao minima antes de chamar funcoes/querys que exigem `number`
- `qualificacoes-tipos-setores-scope.test.ts`
  - atualizacao de mock/assercoes para `Response.json()` tipado por payload real de cada endpoint
- `employee-sector-access.test.ts`
  - ajuste do mock para refletir o contrato atual de `EmployeeSectorAccess`

## 6. Validacoes executadas

- `npx tsc --noEmit --pretty false`
- `npm run test:run -- src/react-app/lib/__tests__/home-profile.test.ts src/react-app/components/__tests__/HomeRouter.test.tsx src/react-app/__tests__/navigation-module-gating.test.ts src/react-app/components/__tests__/AppLayout.module-gating.test.tsx src/react-app/components/__tests__/ProtectedRoute.module-gating.test.tsx`
- `cd worker-airtrust && npx vitest run src/__tests__/routes/qualificacoes-tipos-setores-scope.test.ts src/__tests__/services/employee-sector-access.test.ts`
- `git diff --check`
- `bash scripts/check-tracked-secrets.sh`
- `git diff | grep -Ei "cpf|senha|password|token|secret|jwt|api[_-]?key|\\.env|dev\\.vars" || true`
- `npm run build`

Resultado da sanitizacao textual:

- houve match apenas em referencias seguras a `c.env.DB` dentro do diff;
- nenhum segredo material, credencial, token, `.env` real ou dado sensivel foi introduzido.

## 7. Resultado de `tsc`

- `PASS`

## 8. Resultado de testes

- Front obrigatório no root:
  - `5` arquivos, `38` testes
  - `PASS`
- Testes focados de worker:
  - `2` arquivos, `10` testes
  - `PASS`

## 9. Riscos residuais

- A fase restaurou o baseline de TypeScript do `main`, mas nao revalida toda a superficie de LMS/Qualificacoes alem dos testes focados executados.
- A 0411 continua nao commitada e ainda deve seguir em commit separado.
- O build gerou artefatos locais de `dist/`, mas eles nao entraram no escopo de commit desta fase.

## 10. Confirmacoes

- sem deploy
- sem banco
- sem migration
- sem D1 remoto
- sem producao
- sem staging
- sem criacao de usuarios
- sem alteracao da 0411

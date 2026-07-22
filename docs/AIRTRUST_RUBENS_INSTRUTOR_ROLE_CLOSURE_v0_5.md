# AIRTRUST RUBENS INSTRUTOR ROLE CLOSURE v0.5

Data: 2026-05-29
Status: **ENCERRADO**

## 1) Branch de trabalho

- `codex/rubens-instrutor-role-fix` (base: `codex/airtrust-clean-sanitize` → `origin/main`)
- Worktree limpa: `<AIRTRUST_ROOT>-clean-sanitize`

## 2) Commits

| Hash | Mensagem | Tipo |
|---|---|---|
| `202e4f24fe4c8e882316f395eb4872438e2d706f` | `fix(auth): resolve instructor role access for flight records` | Patch funcional |
| `53fd1da2c3005760bb070d2193aea5ae6f53dc7e` | `docs(auth): record Rubens production validation` | Documentação pós-deploy |
| `3855f1c` | `docs(ops): document clean sanitization baseline` | Baseline sanitização (commit base) |

**Integração em main**: Fast-forward de `origin/main` (`84e3353`) → `53fd1da`, sem merge commit adicional.
`origin/main` e `codex/rubens-instrutor-role-fix` apontam para o mesmo commit (`53fd1da`).

## 3) Causa raiz

- Gestão de usuários usa `usuarios_empresas.role` (vínculo por tenant).
- Auth/login/refresh/me/select-empresa/impersonate usavam `usuarios.perfil`.
- Rubens tinha `usuarios.perfil=ALUNO`, mas `usuarios_empresas.role=instructor`.
- Por isso aparecia como Instrutor na gestão, mas recebia sessão/token como ALUNO e caía no escopo de fichas de aluno.

## 4) Arquivos alterados

1. `worker-airtrust/src/routes/auth.ts` — role resolution no login/refresh/me/select-empresa/impersonate
2. `worker-airtrust/src/middleware/auth.ts` — re-resolve `userRole` por empresa ativa
3. `worker-airtrust/src/routes/simuladores-fichas.ts` — escopo de fichas por papel normalizado
4. `worker-airtrust/src/utils/role-resolution.ts` — novo utilitário de resolução de role
5. `worker-airtrust/src/utils/ficha-role-scope.ts` — novo utilitário de escopo de fichas
6. `worker-airtrust/src/__tests__/utils/role-resolution.test.ts` — 5 testes
7. `worker-airtrust/src/__tests__/utils/ficha-role-scope.test.ts` — 4 testes
8. `scripts/diagnose-rubens-instrutor-role.sh` — script diagnóstico read-only
9. `docs/AIRTRUST_RUBENS_INSTRUTOR_ROLE_FIX_v0_5.md` — documentação do fix
10. `docs/AIRTRUST_SANITIZATION_BASELINE_v0_5.md` — baseline de sanitização

## 5) Validações locais (executadas em 2026-05-29)

| Validação | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ passou |
| `npm run build` | ✅ passou |
| `npm run lint` | ✅ passou |
| `npx vitest run role-resolution.test.ts ficha-role-scope.test.ts` | ✅ 2 files, 9 tests |
| `npx tsc -p worker-airtrust/tsconfig.json --noEmit` | ✅ limpo (sem erros) |
| `npm run test:worker` | ✅ 70 files, 546 tests |

## 6) Validação em produção

- Evidência Rubens coletada via D1 read-only (produção):
  - `usuario_id`: **45**
  - `empresa_id`: **6** (Costa do Sol)
  - `usuarios.perfil`: **ALUNO**
  - `usuarios_empresas.role`: **instructor**
  - `fichas_como_instrutor`: **3**
  - `fichas_como_aluno`: **3**
  - Amostra fichas como instrutor: **128, 127, 126**
  - Tenant correto confirmado.

## 7) Deploy worker

| Campo | Valor |
|---|---|
| Commit deployado | `202e4f24fe4c8e882316f395eb4872438e2d706f` |
| Data/hora deploy (UTC) | 2026-05-29T15:35Z |
| Cloudflare Version ID | `1da30201-2159-4793-b91c-f5985d529c03` |
| Worker | `api.airtrust.online/*` |
| Smoke HTTP | `https://airtrust.online` → 200 |
| Novo deploy pós-merge | **Não necessário** — deploy anterior já corresponde ao código em `origin/main` |

## 8) Confirmações

- [x] Sem migration aplicada.
- [x] Sem alteração manual de banco.
- [x] Sem uso do snapshot sujo (`<AIRTRUST_ROOT>`).
- [x] Nenhum arquivo de FRMS, Escala ou UI genérica foi alterado.
- [x] Diff restrito a auth/perfil, escopo de fichas, utilitários role/scope, testes, script diagnóstico e docs.

## 9) Decisão

- **Caso Rubens**: ENCERRADO.
- **Próxima fase FRMS**: deve ocorrer em branch separada (`codex/frms-next-fix`), sem misturar com Rubens, Escala ou UI genérica.

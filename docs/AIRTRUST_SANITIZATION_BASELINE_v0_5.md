# AIRTRUST SANITIZATION BASELINE v0.5

Data: 2026-05-29

## 1) Situação inicial do diretório principal sujo

Diretório principal auditado: `/Users/filipedaumas/SAAS/Airtrust`

- HEAD local: `586988c7c23a4b4607098dc4ae04e8d9fb568dec`
- `origin/main`: `84e3353164ab7b8dd007225773faf3202daccb8d`
- Ahead/behind (`origin/main...HEAD`): `17 ahead / 0 behind`
- Arquivos tracked modificados: **22**

Blocos identificados no snapshot sujo:
- Auth/Rubens: `worker-airtrust/src/middleware/auth.ts`, `worker-airtrust/src/routes/auth.ts`, `worker-airtrust/src/routes/empresas-usuarios.ts`, `worker-airtrust/src/routes/simuladores-fichas.ts`, `src/react-app/pages/Configuracoes/Usuarios.tsx`
- FRMS: `worker-airtrust/src/routes/frms-fadiga-checkin.ts`, `src/react-app/pages/frms/FrmsFadigaHistorico.tsx`
- UI/acessibilidade: múltiplos componentes com troca para `focus-visible`
- Simuladores/Escala: `worker-airtrust/src/routes/simuladores-sessoes-update.ts`

## 2) Decisão operacional

- O diretório principal sujo foi preservado intacto como snapshot em progresso.
- Foi criada worktree limpa baseada em `origin/main` para baseline seguro:
  - caminho: `/Users/filipedaumas/SAAS/Airtrust-clean-sanitize`
  - branch: `codex/airtrust-clean-sanitize`
  - HEAD: `84e3353164ab7b8dd007225773faf3202daccb8d`
  - relação com `origin/main`: `0 ahead / 0 behind`
- Correções futuras devem ocorrer na worktree limpa (ou em branches derivados dela), não no snapshot sujo.

## 3) Ambiente

- No diretório principal sujo, `node_modules` estava ausente.
- Na worktree limpa, `package-lock.json` está presente e foi executado `npm ci` com sucesso.
- Resultado do `npm ci`: dependências instaladas; sem alterações tracked no Git após instalação.

## 4) Validações de baseline (worktree limpa)

Comandos executados:

1. `npx tsc -p worker-airtrust/tsconfig.json --noEmit`
- **Falhou** com erros de módulos ausentes no worker:
  - `qrcode-generator`
  - `jose`
  - `bcryptjs`

2. `npx tsc --noEmit`
- **Passou**.

3. `npm run build`
- **Passou** (build Vite concluído com sucesso).

4. `npm run lint`
- **Passou** (`lint:api-base`, `guard:tracked-secrets`, `guard:auth-boundaries`).

5. `npm run test:worker`
- **Falhou** com múltiplas suites bloqueadas pela ausência de `jose` importado por `worker-airtrust/src/utils/security.ts`.

Conclusão técnica de baseline:
- O estado de `origin/main` nesta worktree limpa apresenta falha específica no pipeline do worker (resolução de dependências/imports), independentemente do snapshot sujo do diretório principal.

## 5) Sequência segura recomendada

A. Corrigir Rubens/perfil instrutor em branch própria derivada desta worktree limpa.  
B. Depois tratar FRMS em branch própria.  
C. Depois tratar Escala em branch própria.  
D. Só ao final decidir estratégia para o snapshot sujo original (cherry-pick/manual split por bloco).

## 6) Proibição temporária

- Não usar o diretório principal sujo para deploy.
- Não misturar patches do snapshot sujo com correções novas.
- Não commitar os 22 arquivos tracked sem triagem/revisão por bloco funcional.

## 7) Evidências capturadas no diretório principal

Arquivos de auditoria gerados em:
- `/Users/filipedaumas/SAAS/Airtrust/docs/sanificacao-airtrust/status-before-sanitize.txt`
- `/Users/filipedaumas/SAAS/Airtrust/docs/sanificacao-airtrust/diff-stat-before-sanitize.txt`
- `/Users/filipedaumas/SAAS/Airtrust/docs/sanificacao-airtrust/diff-name-status-before-sanitize.txt`
- `/Users/filipedaumas/SAAS/Airtrust/docs/sanificacao-airtrust/git-log-before-sanitize.txt`
- `/Users/filipedaumas/SAAS/Airtrust/docs/sanificacao-airtrust/ahead-behind-before-sanitize.txt`
- `/Users/filipedaumas/SAAS/Airtrust/docs/sanificacao-airtrust/untracked-before-sanitize.txt`

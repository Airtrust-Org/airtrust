# AirTrust — Fluxo de execução rápida com ChatGPT

**Objetivo:** reduzir latência, redescoberta de contexto, repetição de testes e conflitos entre frentes sem alterar o contrato de segurança de `AGENTS.md` e dos workflows governados.

## 1. Modelo canônico

- **Executor principal:** ChatGPT em conversa normal. No macOS, o app Desktop é preferível quando o acesso a Terminal/IDE pelo recurso de trabalho com apps estiver disponível.
- **Não depender de Codex ou Work:** Codex/Work só entram por escolha explícita ou limitação técnica objetiva; não são requisito do fluxo normal.
- **Autoridade técnica:** GitHub `Airtrust-Org/airtrust`, com `main` como integração canônica.
- **Estado mestre das frentes:** issue GitHub #776, sempre apontando para PR/branch/SHA e evidência real.
- **UI manual:** Brave/Chrome quando necessária. Regressões repetíveis devem virar teste automatizado/Playwright.
- **Conversas não são estado técnico.** Branch, PR, SHA, CI, staging e release são a evidência durável.

## 2. Bootstrap de uma sessão

Antes de editar código local:

```bash
git fetch origin main --prune
npm run agent:context
npm run agent:test-plan
```

Em trabalho feito diretamente pela integração GitHub, obter o equivalente pela API: `main` atual, branch/PR/HEAD, arquivos alterados, checks e issue #776.

Depois consultar somente o necessário:

1. issue #776 para localizar a frente;
2. PR/branch/HEAD da frente;
3. `AGENTS.md`, `CLAUDE.md` e o runbook aplicável;
4. arquivos que possuem o comportamento e testes próximos;
5. ambiente remoto apenas se o caso exigir staging/produção.

Não reconstruir estado atual reproduzindo conversas antigas.

## 3. Separar diagnóstico de execução

### Diagnóstico

Objetivo: chegar à **causa suficiente**, não auditar o sistema inteiro.

```text
caso real/erro
→ localizar owner frontend/backend
→ reproduzir ou encontrar evidência equivalente
→ identificar causa suficiente
→ congelar escopo
```

Ao encontrar a causa, registrar no PR/handoff e parar de ampliar a investigação salvo blocker inseparável.

### Execução

```text
correção mínima
→ mesmo teste que prova a falha
→ suíte afetada
→ CI oficial
→ staging quando necessário
→ validação real
→ produção somente com autorização SHA/escopo específica
```

Depois de duas falhas substancialmente iguais, mudar o método.

## 4. Uma frente, uma branch/PR

Use branch independente:

```text
fix/<modulo>-<problema>
feat/<modulo>-<mudanca>
chore/<tema>
```

Frentes paralelas coordenam por GitHub. Não compartilhar estado implícito de terminal, não resetar/limpar/stash de trabalho desconhecido e não sobrescrever mudança nova de outra frente.

## 5. Estado mestre e handoff

O índice vivo é o issue **#776 — AirTrust — Estado operacional mestre das frentes**.

Cada frente deve apontar para evidência canônica e manter:

```text
FRONT:
SCOPE:
BRANCH:
HEAD_SHA:
BASE_MAIN_SHA:
OWNER_MODULES:
ROOT_CAUSE:
CHANGES:
TESTS_PASS:
TESTS_PENDING:
STAGING:
PRODUCTION_AUTH:
DEPLOY_RUN:
POSTDEPLOY:
BLOCKERS:
NEXT_ACTION:
```

Use `docs/ops/WORK_FRONT_TEMPLATE.md` no PR/issue quando necessário. O issue mestre não substitui SHA/checks; apenas indexa as frentes.

## 6. Seleção automática de testes

`npm run agent:test-plan` lê o delta contra `origin/main` e sugere o menor conjunto seguro de testes existentes.

```bash
npm run agent:test-plan
npm run agent:test-plan -- --run
```

`--run` executa o plano local recomendado. CI oficial continua obrigatória antes de integração; o script não substitui nenhum gate.

Regras:

- primeiro teste focado;
- depois suíte afetada;
- não repetir evidência PASS para o mesmo SHA sem delta invalidante;
- browser manual somente quando o comportamento não for comprovável por teste automatizado;
- quando o mesmo bug exigir cliques repetidos em mais de uma correção, criar/estender Playwright.

Ver `docs/ops/TEST_FAST_PATH.md`.

## 7. Runbooks

Comece por `docs/ops/RUNBOOK_INDEX.md`. Ele aponta para as fontes canônicas e evita usar documento histórico por engano.

Produção continua governada por `docs/PRODUCTION_DEPLOY_RUNBOOK.md`; staging e schema usam os workflows/runbooks atuais. Esta otimização não reduz gates, branch protection, tenant/RBAC, backup/recovery ou autorização.

## 8. Papel de cada superfície

| Necessidade | Superfície preferida |
|---|---|
| Conversar, investigar e coordenar | ChatGPT normal |
| Código/PR/SHA/CI | GitHub |
| Arquivos/terminal local quando necessário | ChatGPT Desktop + app/Terminal/IDE conectado |
| Validação visual manual | Brave/Chrome |
| Regressão repetível | Vitest/Node tests/Playwright |
| Staging | workflow GitHub governado |
| Produção | workflow GitHub governado |
| Navegação web longa/delegada | Work somente quando justificar |
| Codex | opcional, não requisito |

A meta é reduzir troca de ferramentas e reconstrução de contexto.

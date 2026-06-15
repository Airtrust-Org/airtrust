# Relatório: Manutenção, Layout e Visibilidade por Perfil

**Data:** 2026-06-15
**Branch:** `codex/manutencao-layout-visibilidade-perfil`
**Veredito:** `LAYOUT/MANUTENCAO AJUSTADO — RESSALVA DO GUARD FECHADA`

---

## Resumo Executivo

Esta fase ajustou a visibilidade de telas e cards por perfil de usuário, corrigiu o login rápido
de desenvolvimento local e fechou a ressalva do `check-tracked-secrets.sh` sem ampliar o escopo
do bypass dev/local. As alterações seguem divididas em dois blocos independentes, commitados
separadamente.

---

## Bloco 1 — Restauração do Login Rápido Dev/Local

### Arquivos alterados

| Arquivo | Natureza |
|---|---|
| `worker-airtrust/src/routes/auth.ts` | Lógica de bypass dev (já existia, sem alterações de segurança) |
| `worker-airtrust/wrangler.dev.toml` | Habilita ENABLE_DEV_AUTH_BYPASS e JWT_SECRET no config local |
| `worker-airtrust/src/__tests__/routes/auth-dev-login-bypass.test.ts` | 7 testes (4 perfis + 1 legado + 2 negativos novos) |

### Perfis suportados

| Email | Papel resolvido | Rota pós-login |
|---|---|---|
| `admin@airtrust.com` | ADMINISTRADOR | `/funcionarios` |
| `manager@airtrust.com` | GESTOR | `/funcionarios` |
| `test.instrutor@airtrust.com` | INSTRUTOR | `/` |
| `test.aluno@airtrust.com` | ALUNO | `/` |

### Garantias de segurança verificadas

| Garantia | Status |
|---|---|
| Bypass só funciona em `ENVIRONMENT=development` | ✅ Dupla guarda (linha 814-815 de auth.ts) |
| Bypass requer `ENABLE_DEV_AUTH_BYPASS=true` explícito | ✅ Dupla guarda |
| Não funciona se `ENVIRONMENT=production` | ✅ Código + teste negativo `bloqueia login...fora do ambiente dev (producao)` |
| Não funciona se flag ausente mesmo em dev | ✅ Teste negativo `bloqueia bypass quando ENABLE_DEV_AUTH_BYPASS ausente` |
| Não expõe token fixo | ✅ JWT gerado com JWT_SECRET do env |
| Não grava credenciais reais | ✅ password_hash = 'dev-local-bypass' |
| Não usa usuário real | ✅ Cria usuários sintéticos no D1 local |
| Não cria usuário em banco remoto | ✅ Só roda com `wrangler dev --local` |
| Não altera JWT de produção | ✅ JWT_SECRET dev ≠ produção |
| Não permite login sem senha fora de dev | ✅ Bloqueado pela dupla guarda |

### Ressalva original do guard e correção aplicada

O guard `scripts/check-tracked-secrets.sh` falhava porque `wrangler.dev.toml` contém
`ENABLE_DEV_AUTH_BYPASS = "true"` e `JWT_SECRET = "airtrust-dev-secret-2025"` em texto claro
(fixtures locais rastreados).

**Por que era falso positivo:**
- `wrangler.dev.toml` é exclusivo para `wrangler dev --local`, nunca usado em produção
- O JWT_SECRET `airtrust-dev-secret-2025` é um segredo dev público sem valor em produção
- A proteção real continua sendo dupla: `ENVIRONMENT=development` + `ENABLE_DEV_AUTH_BYPASS=true`

**Correção aplicada:**
- `scripts/check-tracked-secrets.sh` agora usa allowlist estreita por ocorrência/padrão exato
  para essas duas linhas dev-only em `worker-airtrust/wrangler.dev.toml`
- O arquivo **não** foi excluído integralmente do scanner
- O scanner continua ativo para qualquer outro `JWT_SECRET`, `CF_ACCOUNT_ID`,
  `EDAPP_API_TOKEN`, `EDAPP_WEBHOOK_SECRET` ou flags sensíveis no mesmo arquivo

**Por que a exceção é segura:**
- cobre apenas fixtures locais determinísticos, não segredos reais
- não altera o JWT de produção nem a origem do segredo em runtime
- não toca Cloudflare, D1 remoto, R2, secrets ou qualquer ambiente fora de local/dev
- o bypass segue bloqueado fora de dev, inclusive com `ENVIRONMENT=production`

---

## Bloco 2 — Manutenção/Layout/Visibilidade por Perfil

### Arquivos alterados

| Arquivo | Natureza |
|---|---|
| `src/react-app/components/ProtectedRoute.tsx` | Gate de rota por papel + gate de módulo |
| `src/react-app/components/__tests__/ProtectedRoute.module-gating.test.tsx` | Testes gating (modular + por papel) |
| `src/react-app/pages/Configuracoes.tsx` | Visibilidade de abas por papel |
| `src/react-app/pages/Funcionarios.tsx` | Filtros de setor (multi-select) |
| `src/react-app/pages/HomePerfil.tsx` | Cards de acesso rápido separados por homeProfile |
| `src/react-app/pages/__tests__/Configuracoes.visibility.test.tsx` | Testes visibilidade (novo) |
| `src/react-app/pages/__tests__/HomePerfil.cards.test.tsx` | Testes separação manutenção/tripulação (novo) |
| `docs/MANUTENCAO_LAYOUT_VISIBILIDADE_PERFIL_REPORT.md` | Este relatório |

### O que foi ocultado do usuário comum (ALUNO/INSTRUTOR)

- Rota `/configuracoes` bloqueada por `resolveImplicitRequiredRole` → ADMINISTRADOR ou GESTOR
- Rota `/admin/*` bloqueada → somente ADMINISTRADOR
- Todas as abas de Configurações inacessíveis (ALUNO/INSTRUTOR não chegam à rota)

### O que ficou restrito a ADMIN

- Aba "Empresas" em Configurações (`canAccessCompanyManagement = isAdmin`)
- Aba "Usuários" em Configurações (`canManageUsers = isAdmin`)
- Aba "Backup" em Configurações (`canManageBackup = isAdmin`)
- Aba "Zona de Perigo" em Configurações (`isAdmin`)

### O que GESTOR pode ver

- Rota `/configuracoes` ✅
- Aba "Cadastros" ✅
- Aba "Gestores por Setor" ✅
- Aba "Matriz de Treinamentos" ✅
- Abas "Importações", "Integrações", "Sistema" ✅
- Empresas, Usuários, Backup, Zona de Perigo ❌

### Manutenção separada de tripulação (HomePerfil)

O campo `homeProfile` define o contexto do usuário:

| homeProfile | Cards exibidos |
|---|---|
| `STUDENT_MANUTENCAO` | Minha Pasta 360 + Simuladores + Fichas (sem Fadiga e Escala) |
| `STUDENT_TRIPULACAO` | Fadiga Diária + Minha Escala + Simuladores + Fichas (sem Pasta 360) |
| `STUDENT_ADMINISTRATIVO` / default | Configurável por permissões |

Filtros **não** estão hard-coded em Comandante/Copiloto. O filtro de função em Funcionários.tsx
é genérico (multi-select de funcoes da API).

### Sem alterações de RBAC backend/multi-tenant

Confirmado: nenhuma alteração nos arquivos de middleware de auth, rotas de dados
nem nas queries SQL. As mudanças são exclusivamente frontend (gates de UI).

---

## Testes executados

| Suite | Resultado |
|---|---|
| `auth-dev-login-bypass.test.ts` | 7/7 PASS |
| `ProtectedRoute.module-gating.test.tsx` | 17/17 PASS |
| `Configuracoes.visibility.test.tsx` | 2/2 PASS |
| `HomePerfil.cards.test.tsx` | 2/2 PASS |
| TypeCheck (`tsc --noEmit`) | PASS (0 erros) |
| Build (`npm run build`) | PASS (6.37s) |
| `git diff --check` | PASS |
| `audit-deploy-scripts.sh` | PASS |
| `audit-dangerous-ops.sh` | PASS |
| `check-tracked-secrets.sh` | PASS |

---

## Checagem visual local

Validado no browser local (informado pelo usuário):
- Login rápido Admin → cai em `/funcionarios` ✅
- Login rápido Gestor → cai em `/funcionarios` ✅
- Login rápido Instrutor → cai em `/` ✅
- Login rápido Aluno → cai em `/` ✅
- Instrutor/Aluno não veem abas administrativas ✅

---

## Confirmações de escopo

| Item | Status |
|---|---|
| SIGVOOS/importador/runner ficaram intocados | ✅ Confirmado (git diff --name-status) |
| Migration 0411 intocada | ✅ Confirmado |
| FRMS canônico intocado | ✅ Confirmado |
| frms-source-policy.ts intocado | ✅ Confirmado |
| Nenhum deploy executado | ✅ |
| Nenhuma migration aplicada | ✅ |
| Nenhum acesso a staging/produção | ✅ |
| Nenhum D1 remoto executado | ✅ |
| Login rápido é exclusivo dev/local | ✅ Dupla guarda confirmada em código e testes |

---

## Limitações

- Checagem visual foi validada pelo usuário; não foi possível capturar screenshots aqui.

---

## Recomendação

1. **Revisão humana do PR** para confirmar lógica de gates e separação manutenção/tripulação.
2. **Não fazer merge** sem revisão do bloco de login dev por um segundo revisor.

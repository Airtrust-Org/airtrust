# AirTrust — PR #122 Merge Control

Data: 2026-06-21

## 1. Head final e PR

- PR: `#122`
- URL: `https://github.com/airtrustsystem-alt/airtrust/pull/122`
- Branch: `codex/operational-scope-hardening`
- Head final revisado para merge: `7c83973d844d32a57e60af48d92520db8b1efd52`

## 2. CI final

- `build`: `pass`
- `check-demo-data`: `pass`
- `lint`: `pass`
- `lms-smoke`: `pass`
- `test`: `pass`
- `🧪 Check PR`: `pass`

## 3. Rastreabilidade

- O relatório autenticado/cross-tenant foi alinhado para o head final real `7c83973d844d32a57e60af48d92520db8b1efd52`.
- O SHA anterior `cb7973f97f8307f936ef795d9530790e5c11c823` permanece apenas como head intermediário da correção de `ETag`.

## 4. Revisão de diff

- Rotas e testes revisados com foco em:
  - `qualificacoes/historico-helpers`
  - `qualificacoes/historico`
  - `lms-cursos`
  - `simuladores-sessoes`
  - `simuladores-fichas`
  - `dashboard`
  - `dashboardService`
  - `DashboardPrincipal`
  - `dashboard/queries`
- Resultado:
  - `ETag` tenant-aware preservado
  - `If-None-Match` cruzado fail-closed
  - `dashboard/simuladores-alertas` no runtime correto
  - `lms/cursos/:id` e `simuladores/fichas/:id` sem exposição cross-tenant
  - LMS, fichas e simuladores mantidos fail-closed
  - home/dashboard usando `AppLayout` e query keys tenant-aware
- Confirmado ausente no diff final:
  - migrations
  - schema
  - SIGVOOS
  - secrets
  - fallback permissivo

## 5. Risco de deploy automático

- `deploy.yml` de produção: `NAO` dispara em merge para `main`
  - aciona apenas por `workflow_dispatch`
  - deploy de Worker produção, Cloudflare Pages produção e migrations produção exigem gate manual e confirmação explícita
- `deploy-pages.yml`: `SIM`, roda em `push` para `main`
  - destino: `github-pages`
  - não usa `wrangler`
  - não executa deploy de Worker produção
  - não executa Cloudflare Pages produção
  - não executa migrations produção
- Decisão:
  - risco de deploy automático de produção operacional: `NAO OBSERVADO`
  - merge técnico permitido

## 6. Merge

- Status: `PENDENTE NESTE RELATORIO`
- Condição de execução:
  - merge commit sem deploy produção
  - sem SQL produção
  - sem migrations
  - sem toque em SIGVOOS

## 7. Segurança operacional

- produção intocada: `SIM`
- deploy produção executado: `NAO`
- SQL produção executado: `NAO`
- migration/schema produção alterado: `NAO`
- SIGVOOS intocado: `SIM`
- secrets expostos: `NAO`

## 8. Status macro

- PR #122: `READY PARA MERGE CONTROLADO`
- Multiempresa: `PILOTO CONTROLADO`
- DR: `NO-GO`
- SIGVOOS: `NO-GO`
- Costa do Sol: `GO COM RESSALVAS`

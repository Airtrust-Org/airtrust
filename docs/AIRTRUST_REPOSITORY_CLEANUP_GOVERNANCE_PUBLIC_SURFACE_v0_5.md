# AirTrust — Repository Cleanup + Governance + Public Surface Hygiene v0.5

**Data:** 2026-06-04
**Branch:** `main`
**HEAD base:** `059c9c491044d6e962fba4665202b7f7cc0f04b4`
**Modo:** local-only. Sem D1 remoto. Sem deploy. Sem migration nova. Sem backfill. Sem alteração de dados reais.

## 1. Resumo executivo

Esta etapa tratou apenas higiene residual, governança e superfície pública remanescente do ciclo principal.

Resultado:

- rotas debug/purge legadas foram removidas do runtime, e os debug endpoints residuais de certificados ficaram fail-closed por flag explícita;
- rotas históricas de migration que precisam existir continuam apenas atrás de `ENABLE_MANUAL_MIGRATIONS`, fail-closed;
- scripts operacionais mais perigosos agora exigem gate explícito ou ficaram bloqueados;
- `.gitignore` passou a cobrir os artefatos locais que reapareceram no inventário desta sprint;
- a governança documental foi consolidada com índice canônico e addenda mínimos nos docs-base.

## 2. Matriz dos achados residuais

| ID | Severidade | Área | Evidência | Arquivos | Ação proposta | Teste/guard necessário | Status |
|---|---|---|---|---|---|---|---|
| `CLN-01` | Medium | runtime/admin migration dead code | rotas `admin-apply-migration.ts`, `admin-migrate.ts`, `admin-migration.ts` eram arquivos tracked, com DDL/manual migration, sem montagem em `index.ts` | `worker-airtrust/src/routes/admin-apply-migration.ts`, `worker-airtrust/src/routes/admin-migrate.ts`, `worker-airtrust/src/routes/admin-migration.ts` | remover arquivos mortos e limpar testes/allowlists | `no-temporary-production-endpoints`, `no-runtime-ddl-hot-paths` | `RESOLVED` |
| `SEC-04` | Medium | public surface | `index.ts` montava `/api/debug/*` e `/api/debug/purge-qualificacoes`; `qualificacoes-certificados-admin.ts` mantinha endpoints `debug-*` de inspeção | `worker-airtrust/src/index.ts`, `worker-airtrust/src/routes/debug.ts`, `worker-airtrust/src/routes/debug-purge.ts`, `worker-airtrust/src/routes/qualificacoes-certificados-admin.ts` | remover rotas debug legadas e exigir flag explícita nos debug endpoints residuais de certificados | `no-temporary-production-endpoints`, `qualificacoes-certificados-admin-debug-guards.test.ts` | `MITIGATED_BY_FLAG` |
| `CLN-02` | Low | repo root hygiene | raiz segue com arquivos grandes/locais, backups, screenshots, traineddata, reports e testes soltos; parte é tracked histórica e parte é local | raiz do repo | inventariar e impedir retorno de lixo novo sem apagar histórico no escuro | `.gitignore` + inventário documental | `MITIGATED_BY_GITIGNORE_AND_INVENTORY` |
| `DOC-01` | Low | docs governance | múltiplos docs de ciclo, readiness, Opus e históricos sem um índice canônico único | `docs/` | criar índice de documentos e marcar fonte canônica atual | `docs/AIRTRUST_AUDIT_DOCS_INDEX_v0_5.md` | `MITIGATED_WITH_DOC_INDEX` |
| `MNT-01` | Low | maintenance secret governance | `MAINTENANCE_SECRET` já aparece como configurado/validado negativamente em produção e staging, mas a rotação continua sendo requisito operacional | `worker-airtrust/src/types/index.ts`, `worker-airtrust/src/routes/frms.ts`, `worker-airtrust/src/routes/integracoes_sigvoos.ts`, docs `MAINTENANCE_SECRET_*` | preservar fail-closed e registrar rotação como pendência operacional, não de código | documentação consolidada | `DOCUMENTED_ROTATION_REQUIRED` |
| `CLN-03` | Low | local seeds/knowledge/envs | untracked detectados em `knowledge/airtrust/`, seeds locais e matriz auxiliar de validação | `.gitignore`, `knowledge/airtrust/`, `scripts/seed-*.sql`, `scripts/validation/audit-endpoint-matrix.mjs` | adicionar ignores específicos sem esconder artefatos canônicos | `.gitignore` | `MITIGATED_BY_GITIGNORE` |
| `OPS-01` | Medium | ops/dev/deploy | `deploy-worker-only.sh` aplicava `wrangler d1 migrations apply --remote` implicitamente; `deploy-production.sh` era um caminho legado destrutivo; `ops:guard` não congelava esse padrão | `scripts/deploy-worker-only.sh`, `scripts/deploy-production.sh`, `scripts/audit-dangerous-ops.sh` | exigir gate explícito por env/confirm text e bloquear caminho legado | `npm run ops:guard` | `MITIGATED_WITH_GUARDS` |
| `RES-01` | Low | dead imports | imports de debug no `index.ts` permaneceram mesmo sendo superfície residual | `worker-airtrust/src/index.ts` | remover imports e mounts mortos | `no-temporary-production-endpoints` | `RESOLVED` |
| `RES-02` | Low | defensive fallbacks | nenhum novo vetor público foi encontrado; os fallbacks defensivos de `LEFT JOIN` já classificados como baixo risco permanecem fora do escopo operacional desta sprint | docs de fechamento/matriz | manter classificado como dívida baixa sem refatoração cega | documentação | `ACCEPTED_LOW_RISK` |
| `RES-03` | Low | script warnings | ainda existem utilitários antigos com `git add -A` e outros atalhos fora do fluxo operacional principal | `scripts/remove-confirm-dialogs.sh`, `scripts/fix-all-select-star.sh`, `scripts/fix-urls.sh`, `scripts/fix-auditoria-columns.sh`, `scripts/00-checkpoint-inicial.sh` | manter inventário explícito; não promover esses scripts a caminhos operacionais | `ops:guard` + relatório | `ACCEPTED_LOW_RISK_DOCUMENTED` |
| `RES-04` | Low | stale doc headers/status | docs-base do ciclo não apontavam explicitamente para a limpeza residual pós-fechamento | docs canônicos do ciclo | adicionar addenda curtos e criar índice canônico | índice + addenda | `RESOLVED` |

## 3. Superfície pública/debug/admin tratada

### Removido do runtime

- `/api/debug/historico/:id`
- `/api/debug/purge-qualificacoes`
- arquivos mortos `admin-apply-migration.ts`, `admin-migrate.ts`, `admin-migration.ts`

### Preservado com gate explícito

- `/api/migrations/*`
- `/api/admin/apply-migration-0133|0134|0135|0136`
- `/api/certificados/debug/template/:id`
- `/api/certificados/admin/inspecionar/:historicoId`
- `/api/certificados/admin/verificar-cf`
- `/api/certificados/admin/preview-html/:historicoId`
- `/api/certificados/admin/debug-certificado-data/:historicoId`
- `/api/certificados/admin/debug-template/:historicoId`
- `/api/certificados/admin/debug-query/:historicoId`

Justificativa: esses endpoints históricos continuam acessíveis apenas com `auth()`, `requireRole('admin')` e flag explícita (`ENABLE_MANUAL_MIGRATIONS` ou `ENABLE_ADMIN_DEBUG_ROUTES`), ambas fail-closed por padrão.

## 4. Inventário de cleanup da raiz

Achados relevantes desta sprint:

- diretórios locais/untracked: `knowledge/airtrust/`, `perplexity_airtrust_sources/`, `playwright-report/`
- artefatos locais: `debug-login-failed.png`, `A4R202-OPUS-3.md`
- seeds locais/untracked: `scripts/seed-12-sessoes-aw139-COMPLETO.sql`, `scripts/seed-data-complete.sql`, `scripts/seed-dev-full-20251119.sql`, `scripts/seed-local.sql`, `scripts/seed-sgso-demo-full.sql`
- matriz auxiliar local: `scripts/validation/audit-endpoint-matrix.mjs`

Decisão:

- não apagar tracked históricos no escuro;
- não adicionar untracked automaticamente;
- reduzir reincidência via `.gitignore`;
- manter inventário explícito neste relatório.

## 5. Hardening de scripts ops/dev/sync

Mudanças aplicadas:

- `scripts/deploy-worker-only.sh`
  - agora falha fechado por padrão para `wrangler d1 migrations apply --remote`;
  - exige `AIRTRUST_ALLOW_PROD_MIGRATIONS_APPLY=YES`;
  - exige `AIRTRUST_CONFIRM_PROD_MIGRATIONS_APPLY` com texto exato.
- `scripts/deploy-production.sh`
  - convertido em caminho legado bloqueado;
  - aponta para fluxos revisados.
- `scripts/audit-dangerous-ops.sh`
  - passou a falhar se detectar `d1 migrations apply --remote` sem gate explícito;
  - continua auditando `--commit-dirty=true`, `git add -A`, `wrangler d1 execute --remote` e scripts legados.

Pendência preservada:

- utilitários antigos com `git add -A` permanecem apenas documentados; não foram promovidos a fluxos aprovados.

## 6. Arquivos removidos/mantidos

### Removidos

- `worker-airtrust/src/routes/debug.ts`
- `worker-airtrust/src/routes/debug-purge.ts`
- `worker-airtrust/src/routes/admin-apply-migration.ts`
- `worker-airtrust/src/routes/admin-migrate.ts`
- `worker-airtrust/src/routes/admin-migration.ts`
- `worker-airtrust/src/__tests__/routes/admin-apply-migration-guards.test.ts`

### Mantidos com justificativa

- `worker-airtrust/src/routes/admin-manual-migrations.ts`
- `worker-airtrust/src/routes/migrations.ts`

Motivo: continuam sob guard explícito `ENABLE_MANUAL_MIGRATIONS`, `auth()` e `requireRole('admin')`.

## 7. Guards/testes alterados

- `worker-airtrust/src/__tests__/architecture/no-runtime-ddl-hot-paths.test.ts`
- `worker-airtrust/src/__tests__/architecture/no-temporary-production-endpoints.test.ts`
- `worker-airtrust/src/__tests__/architecture/no-internal-error-details.test.ts`
- `scripts/audit-dangerous-ops.sh`

## 8. Riscos residuais

- ainda existe raiz tracked historicamente poluída; esta sprint não fez arquivo-por-arquivo sem evidência;
- utilitários antigos com `git add -A` seguem como risco baixo/documentado;
- `ops:guard` permanece `PASS`, com esses warnings inventariados e fora do fluxo operacional aprovado;
- `MAINTENANCE_SECRET` continua exigindo rotação operacional controlada, mas o código já permanece fail-closed.

## 9. Próximos blocos grandes recomendados

1. executar `DQ-01` em ambiente controlado real;
2. executar `MIG-01` em janela controlada após `DQ-01`;
3. reduzir poluição tracked da raiz em sprint separada de archive/movimentação com revisão humana.

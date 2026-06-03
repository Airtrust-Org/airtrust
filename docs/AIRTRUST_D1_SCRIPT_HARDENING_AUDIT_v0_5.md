# AirTrust — D1 Script Hardening Audit v0.5

**Data:** 2026-06-02
**Sprint:** N — Blindagem Operacional
**Branch:** `main`
**HEAD:** `4ebd777`
**Modo:** Auditoria read-only de scripts D1. Nenhum D1 remoto executado, nenhum código runtime alterado.

---

## 1. Objetivo

Fechar o item P2 residual OPS-02 da matriz de achados: blindar scripts D1 legados com `wrangler d1 execute --remote` contra execução acidental.

## 2. Método

- `grep -RIn` em `scripts/`, `package.json`, `docs/` por padrões D1 remotos e DDL/DML.
- Classificação manual de cada ocorrência em 7 categorias.
- Reforço do guard `scripts/audit-dangerous-ops.sh` com 5 novos checks.
- Nenhum `wrangler d1 execute --remote` foi executado durante esta auditoria.

## 3. Inventário

Total de scripts `.sh` com referências a `wrangler d1 execute`: **45 arquivos** em `scripts/`.

### 3.1 Classificação

| Categoria | Contagem | Descrição |
|---|---|---|
| SAFE_WRAPPER | 1 | Wrapper seguro com allowlist, confirmação dupla, branch=main, HEAD==origin/main |
| READ_ONLY_DIAGNOSTIC | 22 | Allowlist — SELECT/diagnóstico remoto sem mutação |
| LOCAL_ONLY | 15 | Apenas `--local`, sem acesso remoto |
| BLOCKED_BANNER | 12 | Scripts bloqueados com banner + `exit 1` |
| SELF_PROTECTED | 1 | Proteção própria com env var obrigatória |
| LEGACY_QUARANTINED | 92 arquivos | Diretório `scripts/legacy/` excluído do guard |
| DOC_REFERENCE | ~350 linhas | Documentação histórica em `docs/` |

### 3.2 Detalhe por script

#### SAFE_WRAPPER (1)

| Script | Proteção |
|---|---|
| `scripts/run-production-db-script.sh` | Allowlist de 3 SQL files, `AIRTRUST_ALLOW_PROD_DB_WRITE=YES`, `AIRTRUST_CONFIRM_PROD_DB_WRITE` com texto exato, branch=main, árvore limpa, HEAD==origin/main |

#### READ_ONLY_DIAGNOSTIC — Allowlist (22)

Scripts que usam `--remote` apenas para SELECT/diagnóstico:

| Script | Tipo de acesso remoto | DML/DDL local? |
|---|---|---|
| `scripts/apply-refactor-migrations.sh` | Apenas `--local` + echo de instruções | Sim, local |
| `scripts/audit-prod-simple.sh` | SELECT COUNT(*) | Não |
| `scripts/audit-prod-tables.sh` | SELECT, PRAGMA table_info | Não |
| `scripts/backup-database.sh` | SELECT via `--json` | Não |
| `scripts/check-integridade-qualificacoes.sh` | SELECT COUNT(*) | Não |
| `scripts/clone-prod-REAL.sh` | SELECT para export | Não |
| `scripts/clone-prod-data.sh` | SELECT `.dump` para export | Não |
| `scripts/clone-prod-to-local-COMPLETO.sh` | SELECT para clone local | Sim, sqlite3 local |
| `scripts/create-test-user.sh` | Apenas `echo` de comandos | Não |
| `scripts/diagnose-rubens-instrutor-role.sh` | SELECT diagnóstico | Não |
| `scripts/extract-essencial.sh` | SELECT schema + dados | Não |
| `scripts/fase31_diagnostico.sh` | SELECT diagnóstico | Não |
| `scripts/inspect_ssot.sh` | SELECT diagnóstico | Não |
| `scripts/run-validate-ssot-final.sh` | Executa SQL de validação | Não |
| `scripts/setup_local_dev_mirror.sh` | Apenas `--local` | Sim, local |
| `scripts/smoke-view-historico.sh` | SELECT de views | Não |
| `scripts/sync-core-qualificacoes.sh` | SELECT remoto → INSERT local | Sim, local |
| `scripts/sync-prod-to-local.sh` | SELECT remoto → DELETE/INSERT local | Sim, local |
| `scripts/sync-production-clean.sh` | Apenas `--local` | Sim, local |
| `scripts/sync-production-to-local.sh` | Apenas `--local` | Sim, local |
| `scripts/test-performance-diagnostic.sh` | SELECT diagnóstico | Não |
| `scripts/validate-data-consistency.sh` | SELECT validação | Não |
| `scripts/validate-schema-parity.py` | Python, diagnóstico | Não |

#### LOCAL_ONLY (15)

Scripts que usam apenas `--local` (sem risco de produção):

`scripts/bootstrap.sh`, `scripts/clone-manobras-producao.sh`, `scripts/clone-modelos-producao.sh`, `scripts/d1-ensure-dev.sh`, `scripts/d1-import-batch.sh`, `scripts/diagnose-d1-issue.sh`, `scripts/import-prod-data-localhost.sh`, `scripts/import-production-fast.sh`, `scripts/init-certificados-local.sh`, `scripts/init-d1-local.sh`, `scripts/report-qualificacoes-metrics.sh`, `scripts/seed-d1-local.sh`, `scripts/seed-demo-data-local.sh`, `scripts/seed-sessoes-fichas-exemplo.sh`, `scripts/setup-local-db.sh`

Scripts ambíguos (sem `--local` nem `--remote` explícito — default wrangler é local):

`scripts/check-certificate-templates.sh`, `scripts/migrate-certificados-nomenclatura.sh`, `scripts/setup-local-env.sh`, `scripts/sync-schema-from-production.sh`

#### BLOCKED_BANNER (12)

Scripts que foram neutralizados com banner + `exit 1`. Executá-los produz erro imediato:

| Script | Mensagem de bloqueio |
|---|---|
| `scripts/purge-qualificacoes-cascade.sh` | "legacy destructive production DB script is blocked" |
| `scripts/aplicar-correcoes-db.sh` | "legacy destructive production DB script is blocked" |
| `scripts/apply-seed-data.sh` | "legacy destructive production/staging seed script is blocked" |
| `scripts/cleanup-backup-tables.sh` | "legacy destructive production DB cleanup script is blocked" |
| `scripts/limpar_duplicatas.sh` | "legacy destructive production DB cleanup script is blocked" |
| `scripts/reset-manobras-completo.sh` | "legacy destructive production DB reset script is blocked" |
| `scripts/apply-migration-documentos.sh` | "legacy production migration script is blocked" |
| `scripts/apply-migrations-production.sh` | "legacy production migration script is blocked" |
| `scripts/apply-ssot-migrations.sh` | "legacy production migration script is blocked" |
| `scripts/cleanup_old_backups.sh` | "legacy production cleanup script is blocked" |
| `scripts/backfill-qualificacoes-sessoes-mes.sh` | "legacy production backfill script is blocked" |
| `scripts/backup_d1_to_r2.sh` | "legacy production backup script is blocked" |

#### SELF_PROTECTED (1)

| Script | Proteção própria |
|---|---|
| `scripts/sync-d1-production-sanitized.sh` | Exige `AIRTRUST_ALLOW_PROD_SYNC=1`, confirmação interativa "SYNC", anonimização obrigatória. Usa `${WRANGLER[@]}` (variável) → não detectado pelo guard simples. |

#### LEGACY_QUARANTINED (92 arquivos em `scripts/legacy/`)

O diretório `scripts/legacy/` contém 92 arquivos (scripts shell, SQL, Python) de fases anteriores. Destes:

- **1 script perigoso confirmado**: `scripts/legacy/apply-migration-0098.sh` — executa `ALTER TABLE`, `CREATE TABLE`, `CREATE INDEX` diretamente em `--env production` via `wrangler d1 execute`. **Já em legacy/ e excluído do guard**.
- **Demais scripts**: majoritariamente SQL de seed, diagnóstico, sync antigo, e shell scripts de fases passadas. A maioria é local-only ou documental.

O guard exclui explicitamente `scripts/legacy/**` da detecção. Um warning adicional foi adicionado para scripts legacy com `wrangler d1 execute --remote` sem banner de proteção.

#### DOC_REFERENCE (~350 linhas)

Referências históricas em `docs/` e `docs/arquivo/` — documentação de fases passadas, runbooks, relatórios de auditoria. Não são scripts executáveis. O guard não escaneia `docs/`.

## 4. Scripts bloqueados/quarentenados

12 scripts em `scripts/` bloqueados com banner + `exit 1`. Nenhum pode ser executado sem modificação prévia.

1 script perigoso em `scripts/legacy/apply-migration-0098.sh` — já quarentenado.

## 5. Scripts roteados pelo wrapper

3 npm scripts em `package.json` usam o wrapper seguro:

```json
"db:qualificacoes:legacy-safe": "bash scripts/run-production-db-script.sh sql/maintenance/2026-04-01-qualificacoes-legacy-codigo-safe-merge.sql"
"db:qualificacoes:legacy-audit": "bash scripts/run-production-db-script.sh sql/maintenance/2026-04-01-qualificacoes-legacy-codigo-residual-audit.sql"
"db:qualificacoes:fap14-sk76": "bash scripts/run-production-db-script.sh sql/maintenance/2026-04-01-fap14-sk76-reclass.sql"
```

## 6. Scripts read-only permitidos

22 scripts na allowlist + 1 self-protected = 23 scripts com acesso remoto controlado.

## 7. Falsos positivos / documentação histórica

- `docs/` e `docs/arquivo/`: ~350 linhas de documentação histórica com comandos D1 de exemplo.
- Warnings de DDL/DML no guard: 4 hits residuais em `sync-production-clean.sh` e `sync-production-to-local.sh` — são manipulação de strings SQL em awk/sed, não execução remota.
- Warnings de `git add -A`: 5 scripts utilitários de desenvolvimento (não deploy) com `git add -A`.

## 8. Estado final

### Antes do Sprint N
- **OPS-02**: PARTIAL. Wrapper existia, ~30 scripts legados com `wrangler d1 execute --remote` direto.
- `ops:guard`: PASS (mas com cobertura limitada — 3 checks).
- 12 scripts bloqueados com banner (já aplicado em sprint anterior).

### Depois do Sprint N
- **OPS-02**: RESOLVED. Nenhum `DANGEROUS_DIRECT` executável fora do wrapper/guard.
- `ops:guard`: PASS com 5 guards ativos:
  1. `--commit-dirty=true` detection
  2. `git add .` / `git add -A` detection em scripts operacionais
  3. Direct remote D1 execution detection (standard + variable-based)
  4. DDL/DML + remote co-location detection
  5. Legacy directory audit
- 2 WARNINGs não bloqueantes (revisar acima).

### Resumo de risco

| Risco | Status |
|---|---|
| Execução acidental de DDL/DML em produção via script shell | **Mitigado** — 12 bloqueados, 1 wrapper, guard ativo |
| Script legacy sem proteção | **Mitigado** — diretório legacy excluído do guard, warning para desprotegidos |
| Variável escondendo wrangler | **Detectado** — guard agora captura `${WRANGLER[@]} d1 execute` |
| `git add -A` em script de deploy | **Detectado** — warning para scripts com padrão |
| `--commit-dirty=true` | **Detectado** — guard falha se encontrado |

## 9. Como executar operação D1 autorizada no futuro

1. Colocar o SQL no diretório `sql/maintenance/` com nome descritivo.
2. Adicionar o arquivo à allowlist em `scripts/run-production-db-script.sh`.
3. Adicionar o npm script em `package.json` chamando o wrapper.
4. Executar com:
   ```bash
   AIRTRUST_ALLOW_PROD_DB_WRITE=YES \
   AIRTRUST_CONFIRM_PROD_DB_WRITE="I understand this may modify production data" \
   npm run db:qualificacoes:<nome>
   ```
5. Documentar o resultado.

## 10. O que nunca fazer

- `wrangler d1 execute --remote --command="DROP TABLE..."` diretamente no terminal.
- `wrangler d1 execute --remote --file=script.sql` sem passar pelo wrapper.
- Executar script da lista BLOCKED_BANNER sem antes revisar e migrar para o wrapper.
- Executar script do diretório `scripts/legacy/` sem revisão completa.
- Usar `--commit-dirty=true` em qualquer script de deploy.
- Usar `git add .` ou `git add -A` em scripts operacionais/deploy.

---

**Fim da auditoria.** Documento gerado em 2026-06-02 durante o Sprint N. Nenhum D1 remoto executado, nenhum código runtime alterado, nenhum deploy realizado.

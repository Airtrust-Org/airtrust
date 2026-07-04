# Matriz V6.1 Costa do Sol — Apply em Produção (2026-07-04)

## Resumo

Aplicação controlada da Matriz V6.1 Costa do Sol (simuladores/fichas técnicas) em produção,
precedida de preflight read-only, backup escopado verificável e resolução de um bloqueio de
schema (catálogo NOTECHS ausente). GO final: produção atualizada, validações nominais verdes,
rollback documentado.

## Metadados da execução

| Campo | Valor |
|---|---|
| Data/hora (UTC) | 2026-07-04, backup em 13:47:05Z |
| SHA congelado | `a9cbb1528ca16567659b6bf6dd82b29f587418d0` (`a9cbb15`) |
| PRs envolvidos | #243 (safety pack), #247 (S76-REQ-01 endings), #248 (SK76 semestral endings) — todos confirmados em `origin/main` |
| Banco D1 produção | `airtrust-db` (`7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`), acessado via `--env production --remote` |
| Empresa alvo | 6 |

## Migrations auditadas (0408–0414)

| Migration | Decisão | Motivo |
|---|---|---|
| 0408 (lms_cursos_setores) | Não aplicada | Fora de escopo (LMS), sem relação com a Matriz |
| 0409 (backfill setores) | Não aplicada | Fora de escopo (LMS) |
| 0410 (Controle de Voos schema) | Não aplicada | Fora de escopo (CV) |
| 0411 (SIGVOOS integration) | Não aplicada | Fora de escopo (CV/SIGVOOS) |
| **0412 (Qualificações classificação)** | **Bloqueada — não aplicada** | Toca Qualificações diretamente, UPDATE em massa sem filtro de empresa, o próprio arquivo exige autorização explícita separada (viola regra absoluta "não tocar Qualificações") |
| **0413 (NOTECHS catálogo)** | **Aplicada** | Pré-requisito real para "15 NOTECHS globais"; DML aditivo/idempotente (`INSERT OR IGNORE`), tenant-scoped, pré-condições verificadas (0394 já aplicada, índices únicos existentes) |
| **0414 (referencias_json)** | **Aplicada** | Pré-requisito direto do apply (coluna `manobras.referencias_json` ausente, confirmada por `PRAGMA table_info`) |

0408–0411 permanecem como backlog separado. 0412 permanece bloqueada — não pertence a este escopo (é da frente de Qualificações, PR #216, exige autorização própria).

## Comando de apply

O script oficial `scripts/maintenance/apply-simuladores-matriz-v6-costa-do-sol.mjs` é **local-only
por design** (grava apenas em arquivo `.sqlite` local via `sqlite3` CLI; status final
`APPLY_OK_LOCAL_ONLY`; sem flag `--remote`). Para produção, foi necessário:

1. Extrair o SQL puro gerado pela função interna `buildApplySql()` (instrumentação temporária e
   reversível do script — `export` + guard no `main()` — revertida via `git checkout --`
   imediatamente após a extração).
2. Confirmar equivalência tupla-a-tupla com o preview do dry-run local (2994/2994, 0 diferenças).
3. Remover `BEGIN TRANSACTION;`/`COMMIT;` explícitos — D1 (Durable Objects) rejeita SQL de
   transação explícito; cada arquivo `--file` já é atômico por padrão no wrangler.
4. Reparticionar em 36 statements menores (máx. ~18,7KB cada) após erro `SQLITE_TOOBIG` nos
   statements originais (~146KB, por causa das 882 linhas técnicas embutidas em `VALUES`).
   O particionamento agrupou por **modelos completos** (18 linhas cada, nunca fracionado), para
   preservar a lógica de soft-delete de vínculos obsoletos (que compara contra o conjunto completo
   de manobras-alvo por modelo).

Comando final:
```bash
npx wrangler d1 execute airtrust-db --env production --remote --file=matriz_v6_apply_chunked.sql
```
Resultado: 36 queries, 2674 changes, sucesso.

Detalhes completos, incluindo as 2 tentativas que falharam sem side-effects, em
`artifacts/db-backups/matriz-v6-costa-do-sol-20260704T134705Z-a9cbb15/COMMANDS_USED.md`.

## Validações pós-apply (todas verdes)

- 49 modelos-alvo × 18 linhas técnicas distintas = **882**
- **15 NOTECHS** globais por empresa (empresas 1, 6, 7, 8), `ordem` 1001–1015
- `S76-REQ-01` → `S76-EST-01`
- `SK76-S-01/02` → `S76-EST-01`
- `SK76-S-02/02` → `S76-EST-01`
- `A139-S-01/02` → `A139-EST-01`
- `S76-REQ-01`: 18 técnicas revisadas manualmente, nenhuma genérica CRM/COM/ATC
- `TRE-INST` e `CRED-EXA`: 22 manobras cada, intocados (`updated_at` inalterado desde 2026-06-09)
- Empresas 1, 7, 8: apenas os 15 NOTECHS, nada mais tocado
- Zero duplicações de relações modelo-manobra (`GROUP BY modelo_id, manobra_id HAVING COUNT(*) > 1` → vazio)
- `referencias_json` preenchido onde há fonte documental confirmada no catálogo (35 de 473 manobras
  técnicas da empresa 6 — comportamento esperado dos dados-fonte, não é lacuna desta execução)

## Riscos residuais

1. **Ledger `d1_migrations` desalinhado** — 0413 e 0414 foram aplicadas mas não constam no ledger
   (aplicadas via `d1 execute --file`, não via `wrangler d1 migrations apply`). Ver
   `docs/migration-governance/d1-ledger-reconciliation-after-matriz-v6-20260704.md`.
2. **Script de apply é local-only** — reaplicações futuras da Matriz (ou de scripts semelhantes)
   exigirão o mesmo processo manual de extração/chunking até que o hardening seja implementado.
3. 0408–0412 continuam pendentes/bloqueadas, fora deste escopo.

## Confirmações finais

- ✅ Sem escrita em Qualificações (0412 bloqueada)
- ✅ Sem RBAC/auth/multi-tenant tocado
- ✅ Sem Pack 3
- ✅ Sem deploy Worker/Pages
- ✅ TRE-INST/CRED-EXA intocados
- ✅ Nenhuma alteração fora do escopo (empresas 1/7/8 só receberam os 15 NOTECHS previstos pela 0413)

## Rollback

Documentado em `artifacts/db-backups/matriz-v6-costa-do-sol-20260704T134705Z-a9cbb15/MANIFEST.md`:
reversão de 0413 (DELETE aditivo seguro), reversão de 0414 (`ALTER TABLE DROP COLUMN`), e reversão
do apply da Matriz (restaurar `modelos_sessao_manobras` a partir do snapshot pré-apply).

## Backup

Local persistente: `artifacts/db-backups/matriz-v6-costa-do-sol-20260704T134705Z-a9cbb15/`
(git-ignored, fora do repo versionado, checksums verificados, sem PII/credenciais).

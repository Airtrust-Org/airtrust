# AirTrust — DQ01 Rollback Plan 2026-06-04

**Data:** 2026-06-04  
**Branch:** `main`  
**HEAD base:** `c3f11d5`
**Approval id:** `DQ01-LOCALCOPY-20260604-FILIPE`

## 1. Escopo

Plano de rollback testável para uma futura janela `DQ-01` em `local-copy`, sem tocar `staging` ou `production`.

## 2. Artefatos

- **DB alvo:** `worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite`
- **Snapshot pré-janela:** `worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/dq01-local-copy-pre-window-20260604T172927Z.sqlite`
- **Hash SHA-256 do snapshot:** `51ed357a365c420ff05e18a5bb37c4cde7a96a86c5c9376ff9dc923557b67a3d`

## 3. Como restaurar o snapshot

1. Garantir que nenhum processo local esteja escrevendo no arquivo alvo.
2. Copiar o snapshot pré-janela sobre o DB alvo:
   `cp worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/dq01-local-copy-pre-window-20260604T172927Z.sqlite worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite`
3. Verificar integridade estrutural:
   `sqlite3 worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite "PRAGMA integrity_check;"`
4. Rerodar validações mínimas:
   `bash scripts/audit-data-quality-readiness.sh`
   `bash scripts/run-dq01-local-copy-backfill-readonly.sh`

## 4. Critérios de rollback

- gate ou comando efetivo divergirem do plano aprovado;
- qualquer mutação sair do domínio aprovado;
- validações pós-execução falharem;
- aparecer risco de target incorreto;
- a contagem agregada pré/pós divergir do lote aprovado.

## 5. Aprovação do rollback

- **Quem aprova rollback:** mesmo aprovador da janela `DQ01-LOCALCOPY-20260604-FILIPE` ou operador explicitamente delegado na mesma cadeia de aprovação
- **Registro esperado:** atualização do resultado da janela com hora do abort/restore e evidência pós-restauração

## 6. Validação pós-rollback

- `PRAGMA integrity_check = ok`
- gates/readiness continuam em `PASS`
- nenhuma evidência de PII ou secrets em logs
- status final da janela marcado como `ABORTED_AND_RESTORED` se houver execução real futura
- teste desta janela: cópia separada do snapshot retornou `PRAGMA integrity_check = ok` e preservou `17` candidatos pré-backfill para `soft_delete_status_alignment`

## 7. Higiene de dados

Este plano não contém dumps, payloads de linha, PII nem secrets. Os artefatos binários continuam fora do versionamento.

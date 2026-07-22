# AirTrust - MIG01 Staging Target Evidence 2026-06-04

**Data:** 2026-06-04
**Branch:** `main`
**HEAD base:** `ff27b29`
**Modo:** `staging`, usando snapshot SQLite local ja capturado da janela DQ-01 como insumo de rebaseline. Sem D1 remoto novo. Sem deploy. Sem apply da `0389`. Sem producao.

## 1. Target escolhido

- **Nome do target:** `staging`
- **Ambiente Cloudflare Worker:** `airtrust-api-staging`
- **Binding D1:** `DB`
- **Database name:** `airtrust-db-staging`
- **Database id:** `b7f50907-c110-45f5-ad17-e97ea47f2826`
- **Origem da evidencia:** `worker-airtrust/wrangler.toml` no bloco `[env.staging]`
- **Finalidade:** janela controlada de `MIG-01 staging controlled rebaseline`

## 2. Snapshot usado

O ponto de entrada da janela MIG e o snapshot pos-DQ de staging:

```text
<AIRTRUST_ROOT>/worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/staging/dq01-staging-post-window-20260604T191117Z.sqlite
```

Evidencias do snapshot:

- `PRAGMA integrity_check = ok`
- `226` tabelas visiveis, incluindo o ledger `d1_migrations`
- objetos da `0389` ausentes (`user_platform_roles`, `support_access_sessions`)
- DQ-01 ja formalizado em `ff27b29`

## 3. Confirmacao anti-producao

- o target desta janela e `staging`;
- o snapshot usado foi capturado de `airtrust-db-staging`;
- nenhuma referencia desta janela aponta para `production`, `prod` ou `live`;
- o comando seguro nao contem `wrangler`, `--remote`, `d1 execute`, `migrations apply` ou `deploy`;
- `0389` permanece fora do escopo e sera tratada apenas no Bloco 3.

## 4. Approval e responsavel

- **Approval id:** `MIG01-STAGING-20260604-FILIPE`
- **Responsavel pela janela:** `Filipe / workspace owner`
- **Responsavel tecnico pela execucao nesta etapa:** `Codex GPT-5`

## 5. Comando seguro desta janela

```bash
bash scripts/run-mig01-staging-rebaseline.sh
```

O comando gera um artefato SQL de baseline a partir do snapshot SQLite local de staging. Ele nao aplica schema em D1, nao executa deploy, nao edita migrations historicas e bloqueia se detectar objetos da `0389` no snapshot de entrada.

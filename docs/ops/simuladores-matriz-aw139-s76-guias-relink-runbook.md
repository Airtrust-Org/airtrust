# Runbook — Matriz AW139/S-76: aplicação da matriz + relink dos 51 guias

Status: **RECONCILIAÇÃO DE LEDGER PENDENTE DE GO EXPLÍCITO.** A migration 0440
foi aplicada fisicamente em produção sem registro no ledger `d1_migrations`
(ver seção "Incidente" abaixo). 0441/0442 NÃO foram aplicadas. Nenhum deploy do
Worker e nenhum executor de domínio (matriz/guias) foram executados. A janela só
pode prosseguir após reconciliar o ledger da 0440 pelo fluxo novo da seção 3.

## Incidente — 0440 aplicada sem ledger

- **O que aconteceu:** `0440_simuladores_matriz_versionada_metadata.sql` foi
  executada em produção via `scripts/apply-migration-production.sh`, que usa
  `wrangler d1 execute --remote --file`. Esse comando executa SQL cru e **não**
  atualiza a tabela de ledger `d1_migrations` (só `wrangler d1 migrations apply`
  faz isso). Resultado: o schema da 0440 está aplicado, mas o ledger não tem a
  entrada correspondente.
- **Causa raiz (estrutural, não erro do operador):** o runbook mandava usar o
  caminho per-file para produção, e o script com ledger correto
  (`apply-simuladores-matriz-isolated-migrations.sh`) recusava `--remote`. Havia
  um buraco entre as duas ferramentas.
- **Contenção:** a janela foi interrompida corretamente **antes** de 0441/0442.
  0441 e 0442 seguem ausentes do ledger e não aplicadas. Nenhum deploy do Worker
  e nenhum executor de matriz/guias foram chamados. Baseline de
  `foreign_key_check` e os 51 vínculos de guias permaneceram inalterados.
- **Correção entregue:** um reconciliador dedicado registra **somente** a
  entrada 0440 no ledger (idempotente, com auditoria estrutural integral como
  pré-condição) e um runner remoto ledger-aware aplica 0441/0442. O caminho de
  SQL cru (`apply-migration-production.sh`) agora **recusa** explicitamente
  0440/0441/0442. Não existe nenhum caminho de INSERT manual solto no ledger.

Status anterior: **PRONTO PARA REVISÃO — NÃO EXECUTADO EM PRODUÇÃO.**

Este runbook cobre a janela operacional completa para produção: migrations
0440/0441/0442, aplicação da matriz (executor já mergeado em `main`,
`worker-airtrust/src/routes/admin-simuladores-matriz-executor.ts`) e o relink
separado dos 51 vínculos de guias de instrutor (executor novo,
`worker-airtrust/src/routes/admin-simuladores-guias-relink-executor.ts`, PR
[#439](https://github.com/airtrustsystem-alt/airtrust/pull/439), mergeado em
`main` no commit `0b949e07`).

Decisão arquitetural (não revisitar): matriz e guias permanecem em dois
`D1Database.batch()` atômicos **separados**. Não existe uma transação única
cobrindo os dois.

## 0. Pré-condições

- [ ] `main` local == `origin/main` == commit que contém este runbook.
- [ ] Autorização explícita e por escrito para esta janela específica (este
      runbook não autoriza nada por si só).
- [ ] Backup oficial de produção recente (< 24h) confirmado e íntegro.
- [ ] Ninguém com sessão de simulador ativa/checkin em andamento para
      empresa_id=6 nas próximas ~30min (ver passo 1).

## 1. Janela operacional curta (sem mecanismo de manutenção dedicado)

Não existe hoje um modo de manutenção específico para o módulo de
simuladores/guias no repositório (`scripts/guard-local-maintenance-runtime.mjs`
é um guard de config local↔produção, não um toggle de manutenção). Por
instrução explícita: **não criar um sistema novo** para isso.

Em vez disso:

1. Confirmar em `#ops` (ou canal equivalente) que a janela está em andamento e
   que ninguém deve iniciar novas sessões/fichas de simulador para
   empresa_id=6 durante a janela (poucos minutos — os batches são pequenos e
   atômicos).
2. Não desabilitar nenhum outro módulo. O escopo é apenas
   simuladores/guias da empresa_id=6.
3. Ambos os executores ficam desabilitados (`ENABLE_SIMULADORES_MATRIZ_EXECUTOR`
   / `ENABLE_SIMULADORES_GUIA_RELINK_EXECUTOR` ausentes ou `false`) fora da
   janela — isso já é, por construção, o principal controle de acesso.

## 2. Backup oficial read-only

O caminho legado `scripts/backup_d1_to_r2.sh` está bloqueado e **não** é mais
referência operacional. O backup oficial desta janela deve ser criado pelo
comando read-only abaixo, que trava `database_name`/`database_id`, exige
`main` limpa, grava **fora do Git**, gera bytes + SHA-256, restaura o dump em
SQLite descartável e executa `PRAGMA integrity_check` + `PRAGMA foreign_key_check`
antes de qualquer escrita posterior:

```bash
node scripts/production/backup-production-d1-readonly.mjs \
  --config worker-airtrust/wrangler.toml \
  --env production \
  --out-file /caminho/absoluto/fora-do-git/airtrust-db-preflight-<UTC>.sql
```

Use no gate seguinte:

- `backup.path`
- `backup.bytes`
- `backup.sha256`
- `restored_sqlite.integrity_check`
- `restored_sqlite.foreign_key_check_count`

Este comando **não** envia artefatos ao Git nem ao R2.

## 2.1 Pré-flight read-only obrigatório

Antes de qualquer GO de produção, materializar o `tenant-state` e o `plan.json`
novos com o comando oficial abaixo. Ele usa somente `SELECT/PRAGMA` contra D1,
valida um Bearer token administrativo já emitido (`empresa_id=6`, `role=admin`)
sem imprimir o segredo, exige zero sessão/check ativo e zero edição concorrente
de ficha, grava `/tmp/airtrust-tenant-state.json`, confirma as 61 fontes
privadas e gera `plan.json` novo.

```bash
AIRTRUST_PREFLIGHT_AUTH_TOKEN='<bearer-token-admin-empresa-6-ja-emitido>' \
node scripts/production/preflight-simuladores-matriz-readonly.mjs \
  --config worker-airtrust/wrangler.toml \
  --env production \
  --fk-baseline 525 \
  --sources-path-file /tmp/airtrust-simuladores-path \
  --tenant-state-out /tmp/airtrust-tenant-state.json \
  --plan-out-dir /tmp/airtrust-simuladores-plan \
  --report-out /tmp/airtrust-simuladores-preflight-report.json
```

Artefatos obrigatórios do pré-flight:

- `/tmp/airtrust-tenant-state.json`
- `/tmp/airtrust-simuladores-plan/plan.json`
- `/tmp/airtrust-simuladores-preflight-report.json`

## 3. Ledger da 0440 + migrations 0441/0442 (fluxo obrigatório)

> **Substitui os comandos antigos desta seção.** O caminho de SQL cru
> (`scripts/apply-migration-production.sh`) agora **recusa** 0440/0441/0442 —
> por construção não é mais possível reaplicar essas migrations por ele.
> O script local `apply-simuladores-matriz-isolated-migrations.sh` continua
> `--local`-only para rehearsals.

Ordem obrigatória:

**3.1 — Auditor estrutural da 0440 (dry-run, read-only)**

O auditor puro `worker-airtrust/scripts/lib/simuladores-matriz-0440-audit.mjs`
classifica o estado da 0440 em `AUSENTE`, `INTEGRALMENTE_APLICADA`,
`PARCIALMENTE_APLICADA` ou `CONFLITANTE`, comparando o schema real
(sqlite_master + PRAGMA) contra o contrato derivado da própria migration e
conferindo invariantes (contagens, versão corrente única por tenant, zero
cross-tenant, baseline de `foreign_key_check`). Ele é executado
automaticamente pelo reconciliador do passo 3.2; a simples existência de
`modelos_sessao_versionamento` nunca basta para `INTEGRALMENTE_APLICADA`.

**3.2 — Reconciliador do ledger da 0440 (dry-run, depois `--apply`)**

```bash
# DRY-RUN (nenhuma escrita; imprime plannedWrites e o estado da auditoria):
node scripts/production/reconcile-simuladores-0440-ledger.mjs \
  --config worker-airtrust/wrangler.toml --env production \
  --backup /caminho/absoluto/backup.sql \
  --backup-bytes <bytes> --backup-sha256 <sha256> \
  --fk-baseline 525

# APPLY (registra SOMENTE a entrada 0440 no ledger, idempotente):
node scripts/production/reconcile-simuladores-0440-ledger.mjs \
  --config worker-airtrust/wrangler.toml --env production \
  --backup /caminho/absoluto/backup.sql \
  --backup-bytes <bytes> --backup-sha256 <sha256> \
  --fk-baseline 525 \
  --apply --confirm "I understand this reconciles only the 0440 ledger entry"
```

O reconciliador: trava o alvo em `airtrust-db` /
`7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae` (lido do wrangler.toml, não de input
livre); exige `main` limpa == `origin/main`; valida tamanho **e** SHA-256 do
backup oficial (fora do Git); valida o SHA-256 da própria 0440 no repo;
descobre o shape real de `d1_migrations` via `PRAGMA table_info`; confirma que a
entrada 0440 está ausente; roda o auditor integral e **só prossegue se
`INTEGRALMENTE_APLICADA`**; escreve exatamente uma linha
(`INSERT ... WHERE NOT EXISTS`) e revalida ledger + auditoria + FK-check. É o
**único** caminho autorizado a escrever no ledger para esta reconciliação.

**3.3 — 0441 pelo runner remoto ledger-aware**

```bash
AIRTRUST_ALLOW_PROD_DB_WRITE=YES \
AIRTRUST_CONFIRM_PROD_DB_WRITE="I understand this may modify production data" \
AIRTRUST_BACKUP_PATH=/caminho/absoluto/backup.sql \
AIRTRUST_BACKUP_BYTES=<bytes> AIRTRUST_BACKUP_SHA256=<sha256> \
bash scripts/production/apply-simuladores-matriz-remote-migration.sh \
  0441_simuladores_matriz_manobra_resolution.sql
```

**3.4 — 0442 pelo mesmo runner**

```bash
AIRTRUST_ALLOW_PROD_DB_WRITE=YES \
AIRTRUST_CONFIRM_PROD_DB_WRITE="I understand this may modify production data" \
AIRTRUST_BACKUP_PATH=/caminho/absoluto/backup.sql \
AIRTRUST_BACKUP_BYTES=<bytes> AIRTRUST_BACKUP_SHA256=<sha256> \
bash scripts/production/apply-simuladores-matriz-remote-migration.sh \
  0442_simuladores_matriz_guia_relink.sql
```

O runner aceita **exclusivamente** 0441 ou 0442 (bloqueia 0440 e qualquer outro
nome), trava o alvo de produção, exige `main` limpa e backup validado, copia só
o único arquivo autorizado para um diretório isolado e usa
`wrangler d1 migrations apply --remote` (que atualiza o ledger) — nunca aponta
`migrations_dir` para o diretório real com 400+ migrations, e nunca insere no
ledger manualmente. Reexecução é idempotente (wrangler pula o que já está no
ledger). Conferir o ledger entre 0441 e 0442.

### Sequência completa da janela (12 passos)

1. Backup oficial (seção 2).
2. Auditor dry-run da 0440 (3.1, embutido no reconciliador).
3. Reconciliador do ledger da 0440 — dry-run, depois `--apply` (3.2).
4. Auditoria pós-reconciliação (seção 4).
5. 0441 via runner oficial (3.3).
6. Auditoria (seção 4).
7. 0442 via runner oficial (3.4).
8. Auditoria (seção 4).
9. Geração do plano final da matriz (seção 5).
10. Deploy seguro do Worker (seção 6).
11. Executor da matriz (seção 7).
12. Executor de relink dos guias (seção 8).

O script local `apply-simuladores-matriz-isolated-migrations.sh` permanece
disponível **apenas** para rehearsals `--local` contra cópias descartáveis.

## 4. Auditoria pós-migration (read-only)

Confirmar antes de prosseguir:

- `modelos_sessao_versionamento` e `simuladores_matriz_manobra_resolution`
  existem (migration 0440/0441).
- `simuladores_matriz_guia_relink` e `simuladores_matriz_guia_relink_changes`
  existem (migration 0442).
- Nenhuma versão corrente pré-existente foi alterada (contagem de
  `is_current=1` por `codigo_canonico` continua 1:1, igual a antes).
- Nenhum vínculo ativo de guia foi alterado.

## 5. Geração do plano final da matriz

Seguir o procedimento já existente (`worker-airtrust/scripts/apply-simuladores-matriz-import.mjs`
e `scripts/lib/matriz-import-plan.mjs`): recarregar as 61 fontes privadas já
validadas, conferir os 61 hashes, montar o plano com `plan_sha256`,
`base_fingerprint` do tenant real (empresa_id=6), gerar um novo `import_uuid`.

## 6. Deploy seguro

Deploy do Worker (contém as duas rotas: matriz + guias, ambas desabilitadas
por padrão) seguindo o processo padrão de deploy já documentado
(`docs/AIRTRUST_WORKER_SAFE_DEPLOY_H22.md`).

## 7. Executor da matriz (já mergeado, sem alteração de lógica)

```bash
# habilitar temporariamente
ENABLE_SIMULADORES_MATRIZ_EXECUTOR=true

POST /api/admin/simuladores-matriz-import/dry-run   { plan, import_uuid }
POST /api/admin/simuladores-matriz-import/apply     { plan, import_uuid }
```

Validar após o apply: 51 modelos, 918 vínculos, 22 LOFT, 301 resoluções (o
próprio executor já assevera isso internamente; conferir a resposta e, se
necessário, uma auditoria read-only adicional).

## 8. Executor de relink dos guias (novo, PR #439)

```bash
# habilitar temporariamente (independente do flag da matriz)
ENABLE_SIMULADORES_GUIA_RELINK_EXECUTOR=true

POST /api/admin/simuladores-matriz-import/guias/dry-run   { versao_matriz }
# guardar o "hash" retornado

POST /api/admin/simuladores-matriz-import/guias/apply {
  import_uuid, versao_matriz, expected_hash: <hash do dry-run>
}
```

Validar após o apply:

- 51 vínculos ativos, 30 AW139 + 21 S-76;
- zero vínculo ativo para versão histórica;
- zero guia com mais de um vínculo ativo;
- zero modelo corrente com mais de um guia principal.

(As mesmas asserções já rodam dentro do próprio `D1Database.batch()`, via
trigger da migration 0442 — isso é confirmação adicional, não a única
garantia.)

## 9. Desabilitar os executores

```bash
ENABLE_SIMULADORES_MATRIZ_EXECUTOR=false
ENABLE_SIMULADORES_GUIA_RELINK_EXECUTOR=false
```

Fazer isso imediatamente após o apply bem-sucedido dos dois, antes do smoke.

## 10. Smoke autenticado

Login real + navegação pelas telas de Simuladores/Guias de instrutor para o
tenant 6, conferindo que os 51 guias apontam para os modelos corretos e que
fichas/sessões existentes não foram afetadas.

## 11. Remover a janela operacional

Comunicar em `#ops` que a janela terminou; nenhuma configuração adicional a
reverter (nenhum modo de manutenção foi ligado — ver passo 1).

---

## Rollback (se necessário)

Ordem obrigatória — guias primeiro, depois matriz:

1. **Rollback dos guias**:
   ```bash
   POST /api/admin/simuladores-matriz-import/guias/rollback { import_uuid }
   ```
   Validar que os vínculos anteriores (pré-relink) foram restaurados
   exatamente, e que os vínculos novos foram desativados (soft delete).
2. **Rollback da matriz**:
   ```bash
   POST /api/admin/simuladores-matriz-import/rollback { import_uuid }
   ```
   Validar que as versões anteriores voltaram a `is_current=1`.
3. Manter os dois executores desabilitados durante e depois do rollback.
4. Manter a janela operacional (passo 1) até o smoke pós-rollback ficar
   verde.

Nenhum rollback apaga manobras, modelos preparados, vínculos de manobras,
resoluções ou auditoria — esses registros ficam inativos e rastreáveis
(comportamento já garantido pelos dois executores e suas migrations).

---

## O que este runbook assume que já foi feito antes de GO

- Pré-flight pós-merge executado pelo comando de 2.1, com fontes privadas
  revalidadas, 61 hashes confirmados, auditoria read-only do tenant 6,
  `plan_sha256` gerado e `tenant-state` materializado fora do Git.
- Um rehearsal completo contra uma **cópia descartável real do backup de
  produção** (não apenas a fixture sintética usada para validar o mecanismo
  de isolamento de migrations nesta sessão) — isso requer puxar um backup de
  produção autorizado, fora do escopo de ferramentas desta sessão. É o
  primeiro passo a fazer antes de qualquer GO real.

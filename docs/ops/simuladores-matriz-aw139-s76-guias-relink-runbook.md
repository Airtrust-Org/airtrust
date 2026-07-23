# Runbook — Matriz AW139/S-76: aplicação da matriz + relink dos 51 guias

Status: **PRONTO PARA REVISÃO — NÃO EXECUTADO EM PRODUÇÃO.**

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

## 2. Backup oficial

Seguir o procedimento já documentado em
`docs/PRODUCTION_BACKUP_AND_ROLLBACK_PLAN.md` /
`scripts/backup_d1_to_r2.sh`. Confirmar o backup **antes** de qualquer
migration.

## 3. Migrations isoladas 0440/0441/0442 com ledger

Usar exclusivamente:

```bash
bash scripts/apply-simuladores-matriz-isolated-migrations.sh <wrangler-config> <d1-binding> --local
```

Este script:

- copia **apenas** `0440_simuladores_matriz_versionada_metadata.sql`,
  `0441_simuladores_matriz_manobra_resolution.sql` e
  `0442_simuladores_matriz_guia_relink.sql` — byte-idênticas — para um
  diretório temporário isolado;
- gera uma config Wrangler temporária apontando `migrations_dir` para esse
  diretório, mantendo `database_name`/`database_id` do config original (ou
  seja, o mesmo D1 de destino);
- roda `wrangler d1 migrations list` e `wrangler d1 migrations apply` através
  do mecanismo oficial do ledger (`d1_migrations`) — nunca INSERT manual no
  ledger;
- imprime o ledger completo (`SELECT id, name, applied_at FROM d1_migrations`)
  ao final, para conferência visual de que só essas 3 entradas foram
  adicionadas.

Validado localmente contra uma cópia descartável (schema pré-0440 sintético +
bootstrap com 1 migration) nesta sessão: ledger final = bootstrap + 0440 +
0441 + 0442, reexecução idempotente (nenhuma entrada duplicada), nenhuma
migration histórica tocada. **Este script só suporta `--local`** — aplicação
remota continua sendo o procedimento revisado e NO_GO-gated em
`scripts/apply-migration-production.sh`, um arquivo por vez, com
`AIRTRUST_ALLOW_PROD_DB_WRITE` explícito por arquivo.

Para produção real:

```bash
AIRTRUST_ALLOW_PROD_DB_WRITE=YES \
AIRTRUST_CONFIRM_PROD_DB_WRITE="I understand this may modify production data" \
bash scripts/apply-migration-production.sh worker-airtrust/migrations/0440_simuladores_matriz_versionada_metadata.sql
# repetir para 0441 e depois 0442, na ordem, confirmando o ledger entre cada uma
```

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

- Pré-flight pós-merge (fontes privadas revalidadas, 61 hashes, auditoria
  read-only do tenant 6, `plan_sha256`/`import_uuid` gerados) — ver seção
  "Pré-flight pós-merge" no resumo final da sessão que produziu este runbook.
- Um rehearsal completo contra uma **cópia descartável real do backup de
  produção** (não apenas a fixture sintética usada para validar o mecanismo
  de isolamento de migrations nesta sessão) — isso requer puxar um backup de
  produção autorizado, fora do escopo de ferramentas desta sessão. É o
  primeiro passo a fazer antes de qualquer GO real.

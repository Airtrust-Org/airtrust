# Prova de compatibilidade D1 remoto — migration 0424 (banco descartável)

Escopo: **exclusivamente um banco D1 remoto descartável, criado e destruído nesta
execução**. Nenhuma ação em staging ou produção. Nenhum dado real (nome fictício,
CNPJ/CPF nenhum, tenant sintético apenas).

## Identificação do banco descartável

| Item | Valor |
|---|---|
| Nome | `airtrust-disposable-migration-0424-20260711225144` |
| Database ID | `17d64728-8e0d-4cc2-9730-0d0e1a00be83` |
| Conta Cloudflare | `Filipe.daumas@icloud.com's Account` (`4dca4e5fddc6a351651dd224f456586f`) |
| Timestamp de criação (UTC) | `2026-07-11T22:52:01Z` |
| SHA testado | `a3cc0dd220d6b775a4ff1476919bf8647d6d0baa` (main pós-merge PR #280) |
| Status final | **Deletado** (`wrangler d1 delete --skip-confirmation`), confirmado ausente em `wrangler d1 list` |

## Schema de fundação

O schema base (`empresas`, `tipos_sessao`, `modelos_sessao`, `manobras`,
`modelos_sessao_manobras`, `fichas_sessao`, `simulador_agendamentos`,
`sessoes_participantes`, `treinamentos_planejados`) foi derivado das mesmas
definições usadas em
`worker-airtrust/src/__tests__/migrations/examiner-universal-training-fichas.test.ts`
(`setupDb()`), incluindo a constraint real `codigo TEXT NOT NULL UNIQUE` em
`modelos_sessao` (idêntica a 0040/0396). Esse schema já havia sido cross-checado
contra o staging real em PR #280. Réplica integral da cadeia 0001→0423 não foi
usada: a cadeia local tem quebras históricas documentadas e não republica
localmente (ver memória `migration-chain-dr-strategy`); em vez disso as migrations
reais **0405, 0421, 0422, 0423, 0424** foram aplicadas sem modificação, via
`wrangler d1 execute --remote --file=`, sobre a fundação.

Tenant sintético único usado: `empresa_id = 990001`, nome
`"AirTrust Disposable Migration Proof Tenant"` — não é Costa do Sol, não reutiliza
nenhum ID real.

## Comandos executados (resumo)

```
wrangler d1 create airtrust-disposable-migration-0424-20260711225144
wrangler d1 execute <db> --remote --file=<fundação>
wrangler d1 execute <db> --remote --file=migrations/0405_add_shared_session_backend.sql
wrangler d1 execute <db> --remote --file=migrations/0421_shared_session_segment_curricula.sql
wrangler d1 execute <db> --remote --file=migrations/0422_modelos_sessao_requisitos.sql
wrangler d1 execute <db> --remote --file=migrations/0423_shared_session_multi_curricula_per_participant.sql
wrangler d1 execute <db> --remote --file=migrations/0424_examiner_universal_training_fichas.sql   # Caso A
wrangler d1 execute <db> --remote --command="INSERT INTO modelos_sessao (codigo, ...) VALUES ('CRED-EXA', ...)"  # tenant sintético
wrangler d1 execute <db> --remote --file=migrations/0424_examiner_universal_training_fichas.sql   # Caso B
wrangler d1 execute <db> --remote --file=migrations/0424_examiner_universal_training_fichas.sql   # Caso C (reexecução)
wrangler d1 delete airtrust-disposable-migration-0424-20260711225144 --skip-confirmation
```

## Caso A — sem CRED-EXA

| Verificação | Resultado |
|---|---|
| Erro retornado | `CHECK constraint failed: cred_exa_tenant_anchor_present = 1: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_CHECK)` |
| `SQLITE_AUTH`? | **Não** — confirma que o fix (`CREATE TABLE` em vez de `CREATE TEMP TABLE`) elimina o bug original |
| Exit code | `1` (diferente de zero) |
| `modelos_sessao` (EXA-V0%) | `0` |
| `manobras` (EXA-V0%-%) | `0` |
| `modelos_sessao_requisitos` | `0` |
| `_migration_0424_requires_existing_cred_exa_tenant_anchor` em `sqlite_master` | **Ausente** — confirma rollback atômico do arquivo inteiro pelo D1, incluindo o `CREATE TABLE` que precedeu o `INSERT` que falhou |
| `PRAGMA foreign_key_check` | Vazio (0 violações) |
| `PRAGMA integrity_check` | Rejeitado pelo D1 remoto (`not authorized: SQLITE_AUTH`) — limitação conhecida da plataforma (mesma já documentada em PR #280 para staging real), não um defeito desta migration |

**Conclusão do Caso A: GO.** A dúvida de atomicidade registrada na revisão anterior
do PR #280 está **resolvida**: o D1 trata o arquivo de migration como uma
transação implícita — a falha no `INSERT` de guarda reverte também o `CREATE
TABLE` que o precedeu. Nenhum lixo estrutural permanece.

## Caso B — com exatamente um CRED-EXA sintético

Tenant sintético `empresa_id = 990001`; `CRED-EXA` inserido manualmente com
dados fictícios (`'CREDENCIAMENTO DE EXAMINADOR (SINTETICO)'`).

| Verificação | Resultado |
|---|---|
| `modelos_sessao` criados | `EXA-V01`, `EXA-V02`, `EXA-V03`, `EXA-V04` — todos com `empresa_id = 990001`, `tipo_aeronave = NULL`, `duracao_estimada = 60` |
| Técnicos por modelo | `18` cada (72 total) |
| Requisitos | `EXA-V02→EXA-V01`, `EXA-V03→EXA-V02`, `EXA-V04→EXA-V03`, todos `ETAPA_ANTERIOR` |
| FAP / QRH / FAP13-CRED-* | `0` ocorrências |
| Tabela auxiliar após sucesso | **Ausente** |
| Erro | Nenhum |

## Caso C — reexecução (idempotência)

| Verificação | Resultado |
|---|---|
| `modelos_sessao` (EXA-V0%) | `4` (inalterado) |
| `manobras` (EXA-V0%-%) | `72` (inalterado) |
| `modelos_sessao_manobras` vinculados | `72` (inalterado) |
| `modelos_sessao_requisitos` | `3` (inalterado) |
| `CRED-EXA` original | Intacto — `nome` e `empresa_id` inalterados |
| Tabela auxiliar após reexecução | **Ausente** |

## Destruição do banco

Confirmada via `wrangler d1 delete --skip-confirmation` e verificação subsequente
com `wrangler d1 list` (nenhuma entrada `disposable` remanescente).

## Conclusão geral

Gate obrigatório da seção 3 **satisfeito**: migration 0424 (pós-PR #280) é
compatível com o autorizador do D1 remoto, falha explicitamente e sem resíduo
quando `CRED-EXA` está ausente, sucede corretamente e sem resíduo quando
`CRED-EXA` existe, e é idempotente em reexecução — tudo verificado contra um D1
remoto real e descartável, nunca staging ou produção.

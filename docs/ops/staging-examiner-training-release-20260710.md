# Release em staging — PR #278 + #279 (examiner training universal fichas)

Escopo: **exclusivamente staging**. Nenhuma ação de produção foi executada.
Nenhuma migration foi aplicada em produção. Nenhum deploy de produção
ocorreu. Esta funcionalidade **não é homologada/aprovada pela ANAC** —
nada aqui constitui tal declaração.

## SHA e proveniência

| Item | Valor |
|---|---|
| SHA implantado | `4c33d590` (merge de PR #278 `37612c0f` + PR #279 `4c33d590`) |
| Worker deployment ID (staging) | `605e794f-e82e-4449-8a01-6fb65a4fa7ca` |
| Worker version anterior (baseline) | `75dcd2ca-56cf-4203-91fb-74a5d2181c01` (2026-07-08T21:49:52Z) |
| `/api/version` pós-deploy | `{"version":"2026-07-11T03:03:40Z-4c33d590","environment":"staging","deploymentId":"2026-07-11T03:03:40Z-4c33d590"}` |
| Pages deployment ID | Não aplicável — ver "Frontend" abaixo |
| D1 database (staging) | `airtrust-db-staging-baseline-20260701` / `bf9963f4-eb12-439b-a830-20bbf577ac22` |
| Método de deploy | Comandos `wrangler` manuais (não há workflow "Deploy Staging" no GitHub Actions — apenas "Deploy AirTrust", travado para produção). Ver decisão registrada na sessão. |

## Backup

| Item | Valor |
|---|---|
| Arquivo | `staging-backup-schema-and-data-20260711T025619Z.sql` (não versionado, armazenado em scratchpad local da sessão) |
| SHA-256 | `4360fe2ac0e89974e4c98db0ca3fb75633cfbdf6292fc84ddba7700316ddc1a4` |
| Tamanho | 262.415 bytes / 6.203 linhas / 230 `CREATE TABLE` |
| Timestamp UTC | 2026-07-11T02:56:19Z |
| Mecanismo | `wrangler d1 export --env staging --remote` (oficial) |

## Migrations aplicadas

| Migration | Resultado | Observação |
|---|---|---|
| 0421_shared_session_segment_curricula.sql | ✅ Aplicada (`wrangler d1 execute --file=`) | schema puro, sem dependência de tenant |
| 0422_modelos_sessao_requisitos.sql | ✅ Aplicada | idem |
| 0423_shared_session_multi_curricula_per_participant.sql | ✅ Aplicada | idem |
| 0424_examiner_universal_training_fichas.sql | ⛔ Falha **esperada e correta** — `CHECK constraint failed: cred_exa_tenant_anchor_present = 1` | Tenant Costa do Sol / `CRED-EXA` ausente em staging (ver achado crítico abaixo) |

**Correção crítica encontrada e aplicada durante esta execução**: a primeira
tentativa de aplicar 0424 falhou com `not authorized: SQLITE_AUTH`, não com
a mensagem esperada do guard. Causa raiz: `CREATE TEMP TABLE` é rejeitado
pelo autorizador remoto do D1 (confirmado com uma prova isolada). Corrigido
trocando por uma tabela real (criada e removida no mesmo arquivo) — ver
[PR #280](https://github.com/airtrustsystem-alt/airtrust/pull/280) (draft,
não mesclado). Após a correção, 0424 falha com a mensagem correta e
esperada. Esta correção ainda **não está em `main`** — 0424 no branch
mesclado (`4c33d590`) continua com o bug de `SQLITE_AUTH` até o PR #280 ser
revisado e mesclado.

## Contagens antes/depois

| Tabela | Antes | Depois |
|---|---|---|
| `modelos_sessao` | 0 | 0 (0424 não criou nada — esperado) |
| `manobras` | 0 | 0 |
| `modelos_sessao_manobras` | 0 | 0 |
| `modelos_sessao_requisitos` | tabela não existia | 0 (tabela criada por 0422) |
| `simulador_atribuicoes_curriculares` | 0 | 0 |
| `simulador_agendamento_segmentos` | 0 | 0 |
| `simulador_segmento_atribuicoes` | tabela não existia | 0 (tabela criada por 0421) |
| `fichas_sessao` | 0 | 0 |
| `fichas_sessao_manobras` | 0 | 0 |

`fichas_sessao.segmento_atribuicao_id` confirmada presente após 0423.

## integrity_check / foreign_key_check

- `PRAGMA foreign_key_check` no staging real: **limpo** (`results: []`).
- `PRAGMA integrity_check` **não é suportado pelo D1 remoto** (`not
  authorized: SQLITE_AUTH` — mesma classe de restrição do autorizador que
  afetou o guard da 0424). Verificado como proxy válido: `integrity_check =
  ok` numa cópia local descartável restaurada a partir do backup real de
  staging, com a mesma cadeia de migrations aplicada (0421→0422→0423).

## Achado crítico: tenant Costa do Sol ausente em staging

`airtrust-db-staging-baseline-20260701` contém apenas tenants sintéticos de
smoke (`empresa_id` 999002-999005, ex. "AirTrust Smoke Tenant"). **Não há
tenant Costa do Sol, nenhuma linha em `modelos_sessao` (incluindo
`CRED-EXA`), nenhum funcionário/usuário vinculado**. Esta é uma condição de
parada explícita da instrução original ("se CRED-EXA estiver ausente...
parar; não aplicar 0424; emitir NO-GO") — tratada exatamente assim.

Consequência: o cenário operacional completo (2×120min / 4×60min, EXA-V01..04,
quatro fichas) **não pôde ser executado neste ambiente**, não por defeito de
código, mas por ausência de dado de tenant. Confirmado com o mecanismo
oficial de seed (`scripts/seed-staging-smoke-user.mjs`) — este script cria
apenas o tenant sintético "AirTrust Smoke Tenant" (999002), não Costa do Sol;
não foi executado nesta sessão (decisão de escopo: não criar dado adicional
de tenant sem autorização explícita separada).

## Cenário 2×120 / 4×60

**Não executável em staging nesta execução** — ver achado acima. Como
evidência substituta (reaproveitando a suíte já existente e comprovada
localmente, sem re-executar contra dados reais de staging):
- Migration 0424 (mecanismo): 6 testes automatizados confirmam, contra uma
  âncora `CRED-EXA` sintética, exatamente 4 modelos criados, 18 técnicos +
  15 NOTECHS cada, requisitos sequenciais corretos, idempotência, e que
  `CRED-EXA` real nunca é alterado.
- Fluxo compartilhado 2×120/4×60 com códigos EXA-V01..04 literais: coberto
  por `simuladores-shared-session-routes.test.ts` (harness de mock do PR
  #278, reaproveitado, não staging real) — 2 reservas, 4 segmentos, 4
  atribuições, 4 fichas, 60 min cada, sem duplicação.
- Autoavaliação/autoassinatura: coberto por testes dedicados
  (`simuladores-instrutor-self-evaluation-guard.test.ts`,
  `simuladores-fichas-self-evaluation.test.ts`,
  `simuladores-shared-session-validation-examiner.test.ts`) — aluno não
  pode ser instrutor, instrutor distinto permitido, cross-tenant mapeado
  para 404 genérico.
- PDFs: 4 previews gerados e inspecionados visualmente na sessão anterior
  (mesmo código, conteúdo inalterado nesta execução) — 33 itens, uma
  página, sem corte, ECL presente, sem QRH/FAP, assinaturas só internas.

## Frontend em staging

Não existe projeto Pages oficialmente designado "staging" (apenas `airtrust`
= produção, com domínio `airtrust.online`; candidatos `airtrust-app` e
`airtrust-frontend` têm apenas deployments "Preview" avulsos, sem convenção
documentada). Validação feita via dev-proxy local (`VITE_DEV_PROXY_TARGET`
apontando para `https://airtrust-api-staging.airtrust.workers.dev`,
`.env.local` não versionado, removido ao final): frontend do SHA `4c33d590`
carregado localmente, `fetch('/api/version')` confirmado retornando
`environment: "staging"` e o SHA correto — prova que o binding aponta para
staging, nunca produção. Nenhum artefato novo publicado em Pages.

## Limpeza / retenção de dados de QA

Nenhum dado de QA foi criado nesta execução (nenhum smoke autenticado com
usuário real foi rodado, por ausência do tenant necessário). Nada a
limpar.

## Falhas e desvios do plano original

1. Não existe workflow "Deploy Staging" — usado procedimento manual via
   `wrangler` com `--var` para injeção de `APP_VERSION`/`APP_BUILD_TIME`
   (documentado, sem alterar `wrangler.toml`).
2. Ledger `d1_migrations` de staging está vazio (0 linhas) apesar de 232
   tabelas reais — banco foi restaurado por dump de schema, não por
   `migrations apply`. Migrations aplicadas manualmente arquivo a arquivo
   (`wrangler d1 execute --file=`), conforme convenção documentada em
   CLAUDE.md, evitando a cadeia quebrada do ledger.
3. **Bug crítico real encontrado e corrigido**: guard da 0424 usava `CREATE
   TEMP TABLE`, incompatível com D1 remoto (`SQLITE_AUTH`). Corrigido em
   PR #280 (draft). Confirmado против staging real, pós-correção.
4. Tenant Costa do Sol ausente em staging — bloqueia validação do cenário
   operacional completo; não é um defeito desta entrega.
5. Nenhum projeto Pages oficial de staging — frontend validado via
   dev-proxy em vez de deploy Pages.

## Rollback

Ver `docs/ops/staging-examiner-training-release-rollback-20260710.md`.
Nenhum rollback foi necessário nesta execução — nenhum critério de abort
disparou para 0421-0423 (integrity/FK limpos, sem duplicação). 0424 não
alterou nada (falhou antes de qualquer INSERT).

## Confirmações finais

- Nenhuma migration remota em **produção**.
- Nenhum deploy de **produção** (Worker ou Pages).
- Nenhuma alteração de DNS, bindings, secrets.
- Nenhum uso de credenciais/banco de produção para testes.
- Nenhuma declaração de homologação/aprovação ANAC.

## Critério final

### GO/NO-GO de staging

**GO PARCIAL.** Infraestrutura (Worker deploy, migrations 0421-0423,
provenance, integrity/FK) — **GO**. Cenário operacional EXA-V01..04
completo — **NO-GO neste ambiente**, por ausência do tenant Costa do Sol
em staging, não por defeito de código. Migration 0424 comportou-se
corretamente (falha explícita) uma vez corrigido o bug de compatibilidade
com D1 remoto.

### GO/NO-GO para preparar runbook de produção

**GO condicional**, sujeito a:
1. PR #280 (fix do `CREATE TEMP TABLE`) revisado e mesclado antes de
   qualquer tentativa de aplicar 0424 em qualquer ambiente D1 real
   (staging ou produção) — sem isso, 0424 falhará com `SQLITE_AUTH` em vez
   da mensagem de guard pretendida.
2. Confirmação separada, antes de produção, de que `CRED-EXA`/tenant Costa
   do Sol existe exatamente uma vez em produção (isto foi verificado por
   linhagem de migration versionada — `0165_migrate_to_costa_do_sol.sql` —
   mas não foi reconfirmado ao vivo contra o banco de produção nesta
   sessão, pois isso exigiria acesso/consulta a produção, fora de escopo
   aqui).
3. Validação do cenário operacional completo (2×120/4×60) em um ambiente
   com tenant real antes do runbook de produção ser executado — não
   comprovado em staging nesta execução.

### NO-GO explícito para produção

Nenhuma migration de produção, nenhum deploy de produção, nenhuma alteração
de produção foi realizada ou está autorizada por este relatório.

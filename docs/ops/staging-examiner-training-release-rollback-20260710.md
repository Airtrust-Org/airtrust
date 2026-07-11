# Rollback — release em staging (PR #278 + #279, SHA 4c33d590)

Escopo: exclusivamente staging. Nada aqui autoriza rollback ou ação em produção.

## Estado pré-release (registrado antes de qualquer mudança)

| Item | Valor |
|---|---|
| Worker | `airtrust-api-staging` |
| Version ID ativa antes do release | `75dcd2ca-56cf-4203-91fb-74a5d2181c01` (deploy de 2026-07-08T21:49:52Z) |
| Worker URL | `https://airtrust-api-staging.airtrust.workers.dev` |
| `/api/version` antes do release | `{"version":"dev-local","environment":"staging","deploymentId":"dev-local"}` |
| D1 database (binding `DB`, env staging) | `airtrust-db-staging-baseline-20260701` / `bf9963f4-eb12-439b-a830-20bbf577ac22` |
| R2 bucket (binding `BUCKET`, env staging) | `airtrust-storage-staging` |
| Ledger `d1_migrations` antes do release | 0 linhas (base restaurada por dump de schema, não por `migrations apply` — ledger não reflete o schema real) |
| Tabelas reais existentes antes do release | 232, incluindo já `simulador_atribuicoes_curriculares`, `simulador_agendamento_segmentos`, `simulador_segmento_participantes` (migration 0405, já presente) |
| Tabelas/coluna ausentes antes do release | `simulador_segmento_atribuicoes` (0421), `modelos_sessao_requisitos` (0422), `fichas_sessao.segmento_atribuicao_id` (0423) |
| Tenant Costa do Sol | **Ausente.** Único conteúdo de `empresas`: tenants sintéticos de smoke (999002-999005) |
| `CRED-EXA` | **Ausente** — nenhuma linha `modelos_sessao` existe (tabela vazia, 0 linhas) |
| Backup completo (schema+dados) | `staging-backup-schema-and-data-20260711T025619Z.sql`, sha256 `4360fe2ac0e89974e4c98db0ca3fb75633cfbdf6292fc84ddba7700316ddc1a4`, armazenado fora do Git (scratchpad local da sessão, não versionado) |

## Consequência para este release

Como não existe tenant Costa do Sol/`CRED-EXA` em staging, a migration 0424
**não pode** criar os modelos EXA-V01..V04 neste ambiente — o guard
introduzido em `0424_examiner_universal_training_fichas.sql` (Seção 0)
vai abortar explicitamente com `CHECK constraint failed:
cred_exa_tenant_anchor_present = 1`, exatamente como projetado. Isto NÃO é
uma falha a ser contornada: é o comportamento correto e intencional do guard.

Escopo revisado para staging nesta execução:
- Migrations **0421, 0422 e 0423** (puramente schema, sem dependência de
  dado de tenant) — aplicáveis com segurança.
- Migration **0424** — tentativa registrada, falha esperada documentada
  como evidência do guard funcionando; NÃO conta como falha bloqueante do
  release de infraestrutura.
- Cenário operacional EXA-V01..04 (2×120/4×60) — **não executável em
  staging nesta execução** por ausência de dado de tenant, não por defeito
  de código. Ver relatório final para NO-GO específico desse item.

## Rollback de aplicação

### Worker
- Rollback = reativar a versão anterior via
  `wrangler rollback --env staging --message "revert to 75dcd2ca"` ou
  `wrangler deployments list --name airtrust-api-staging` seguido de
  `wrangler rollback <version-id>` apontando para `75dcd2ca-56cf-4203-91fb-74a5d2181c01`.
- Responsável: quem executa o release (esta sessão) ou operador humano com
  acesso ao mesmo token Cloudflare.
- Critério de acionamento: qualquer falha de smoke pós-deploy, erro 5xx
  sistemático, ou regressão em `/api/health`/`/api/version`.

### Pages / frontend
- Não existe projeto Pages oficialmente designado como "staging" (apenas
  `airtrust` = produção, e projetos `airtrust-app`/`airtrust-frontend` com
  deployments "Preview" avulsos e sem convenção documentada). Por isso,
  nesta execução, a validação de frontend contra staging usa o dev-proxy
  local (`VITE_DEV_PROXY_TARGET` apontando para a URL do Worker de
  staging), não um deploy Pages. Rollback: nenhum (nenhum artefato novo
  publicado em Pages).

## Rollback de dados (staging)

Migrations são forward-only. Não usar `DROP` manual como estratégia.

### Compensação para 0421/0422/0423 (se necessário reverter)
```sql
-- Reverter 0423 (na ordem inversa)
DROP TRIGGER IF EXISTS trg_fichas_sessao_segmento_atribuicao_tenant_guard_update;
DROP TRIGGER IF EXISTS trg_fichas_sessao_segmento_atribuicao_tenant_guard_insert;
DROP TRIGGER IF EXISTS trg_sim_atribuicoes_curriculares_tenant_guard_update;
DROP TRIGGER IF EXISTS trg_sim_atribuicoes_curriculares_tenant_guard_insert;
DROP INDEX IF EXISTS idx_fichas_sessao_segmento_atribuicao_ativa;
DROP INDEX IF EXISTS idx_fichas_sessao_segmento_atribuicao;
-- fichas_sessao.segmento_atribuicao_id: SQLite não remove coluna sem rebuild de tabela;
-- se necessário, deixar a coluna (NULL, sem uso) em vez de reconstruir fichas_sessao.
DROP INDEX IF EXISTS idx_sim_atribuicoes_ativas_por_participante_modelo;
-- simulador_segmento_atribuicoes.gera_ficha: mesma lógica, deixar a coluna sem uso se não for possível remover.

-- Reverter 0422
DROP TABLE IF EXISTS modelos_sessao_requisitos;
DROP INDEX IF EXISTS uq_modelos_sessao_id_empresa;

-- Reverter 0421
DROP TABLE IF EXISTS simulador_segmento_atribuicoes;
ALTER TABLE simulador_agendamento_segmentos DROP COLUMN finalidade_titulo; -- se suportado
ALTER TABLE simulador_agendamento_segmentos DROP COLUMN finalidade_codigo; -- se suportado
```
Estas ações só devem ser executadas em staging, e apenas se o smoke pós-deploy
revelar regressão real. Não remover `simulador_atribuicoes_curriculares`,
`simulador_agendamento_segmentos` nem `simulador_segmento_participantes`
(migration 0405, pré-existente, não faz parte deste release).

### Compensação para 0424
Não aplicável nesta execução — 0424 não será aplicada em staging (ausência
de `CRED-EXA`). Se em execução futura os 4 modelos forem criados e precisarem
ser desfeitos:
```sql
DELETE FROM modelos_sessao_requisitos WHERE modelo_sessao_id IN (SELECT id FROM modelos_sessao WHERE codigo IN ('EXA-V01','EXA-V02','EXA-V03','EXA-V04'));
DELETE FROM modelos_sessao_manobras WHERE modelo_id IN (SELECT id FROM modelos_sessao WHERE codigo IN ('EXA-V01','EXA-V02','EXA-V03','EXA-V04'));
DELETE FROM manobras WHERE codigo LIKE 'EXA-V01-%' OR codigo LIKE 'EXA-V02-%' OR codigo LIKE 'EXA-V03-%' OR codigo LIKE 'EXA-V04-%';
DELETE FROM modelos_sessao WHERE codigo IN ('EXA-V01','EXA-V02','EXA-V03','EXA-V04');
```
Só executar se não houver ficha real vinculada a esses modelos (preservar
qualquer ficha/histórico criado por QA). Restauração do backup completo
(`staging-backup-schema-and-data-20260711T025619Z.sql`) é reservada a
incidente grave, com autorização explícita — nunca como primeira opção.

## Critérios de abort (interrompem o release imediatamente)

- Erro em qualquer migration aplicada;
- `foreign_key_check` != 0 após qualquer migration;
- Menos ou mais que os modelos esperados criados (quando 0424 puder rodar);
- Contagem de itens por modelo diferente de 18 técnicos + 15 NOTECHS;
- Qualquer indício de vazamento cross-tenant;
- Ficha ou minutos duplicados;
- Autoassinatura possível em qualquer teste;
- Worker ou frontend sem provenance verificável do SHA;
- Erro de autenticação no smoke;
- Regressão em leitura de sessão histórica.

Se qualquer critério de abort disparar após a aplicação de 0421-0423: parar
imediatamente, não prosseguir para Pages/smoke, aplicar a compensação acima
para as migrations já aplicadas, e registrar o incidente no relatório final.

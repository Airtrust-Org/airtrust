# AIRTRUST_STAGING_OPERATIONAL_STABILIZATION_20260621

## Veredito

PILOTO CONTROLADO com bloqueios objetivos remanescentes.

## Modelo usado

Codex 5.4 alto

## Ambiente

- staging/local/dummy
- producao nao alterada

## Matriz de endpoints

| endpoint | status inicial | causa | correcao | status final |
| --- | --- | --- | --- | --- |
| `/api/funcionarios?limit=1` | `500` documentado | drift de schema em `funcionarios.setor_id` | fallback por `PRAGMA` para scope fail-closed e `SELECT/JOIN` compativeis sem `setor_id` | corrigido em codigo; revalidacao live pendente |
| `/api/funcionarios/:id` | `500` documentado | drift de schema em `funcionarios.setor_id` | fallback por `PRAGMA` para `setor_id` opcional e escopo compativel | corrigido em codigo; revalidacao live pendente |
| `/api/lms/cursos/:id` | `500` documentado | drift de schema em `lms_cursos_setores` e/ou `qualificacoes_tipos_setores` | fallback por existencia de tabela; `setores_json` nulo seguro e scope setorial fail-closed para usuarios restritos | corrigido em codigo; revalidacao live pendente |
| `/api/simuladores/sessoes?limit=1` | `500` documentado | drift de schema em `simulador_agendamentos.modo_compartilhado` | fallback por `PRAGMA` para projetar `NULL AS modo_compartilhado` | corrigido em codigo; revalidacao live pendente |
| `/api/qualificacoes/historico?limit=1` | `500` documentado | drift de schema em `qualificacoes_categorias.empresa_id` e `funcionarios.setor_id` | join de categoria compativel sem `empresa_id` e scope setorial fail-closed quando `setor_id` nao existir | corrigido em codigo; revalidacao live pendente |

## Cross-tenant

- controle positivo Tenant B: nao executado nesta sessao
- negativo Tenant A: nao executado nesta sessao
- resultado: BLOQUEADO por ausencia de sessao dummy aprovada (`AIRTRUST_AUTH_TOKEN`, `AIRTRUST_COOKIE`, `AIRTRUST_EXPECTED_EMPRESA_*` estavam `UNSET`)

## Validacao visual

- admin/gestor: expectativa mantida para `/funcionarios`, deep links e Central de Alertas; validacao live nao executada
- usuario comum: expectativa mantida de bloqueio em `/funcionarios` e deep links; validacao live nao executada
- resultado: PARCIAL, dependente de sessao autenticada aprovada

## DR drill

- remoto D1 descartavel: BLOQUEADO
- local: restore local segue com evidencia historica de sucesso
- resultado: DR continua `NO-GO`

## PR consolidado

- link: nao aberto nesta sessao
- status: nao aberto
- CI: nao aplicavel

## Testes

- `./scripts/audit-observability-dr-readiness.sh`
  - passou
- `npm ci` em `/worker-airtrust`
  - passou
- `npm ci` na raiz
  - passou
- `npx vitest run src/__tests__/services/employee-sector-access.test.ts src/__tests__/routes/funcionarios-tenant-isolation.test.ts src/__tests__/routes/simuladores-sessoes-schema-compat.test.ts src/__tests__/routes/qualificacoes-historico-certificados-fallback.test.ts`
  - passou
- `npx vitest run src/__tests__/services/backup-restore-drill.test.ts`
  - nao concluido antes da instalacao das dependencias; sem nova execucao nesta sessao
- `npx vitest run src/__tests__/routes/lms-cursos-beta-contract.test.ts`
  - nao usado como criterio final; o arquivo tem mocks incompletos para queries auxiliares locais e nao cobre o caminho de compatibilidade de staging de forma confiavel

## Deploy

- staging: nao
- producao: nao
- migrations: nao

## Seguranca

- sem producao
- sem migration
- sem PII/secrets no relatorio
- SIGVOOS NO-GO

## Decisao multiempresa

PILOTO CONTROLADO

Motivo:
- houve correcao versionada segura para compatibilidade de leitura com schema drift de staging
- nao foi possivel revalidar smoke autenticado nem matriz cross-tenant por ausencia de fixture/sessao aprovada
- nao foi possivel confirmar schema de staging via D1 remoto porque o token atual falha em `/memberships` para `wrangler d1 execute --remote`

## Decisao DR

NO-GO

Motivo:
- `wrangler d1 execute --remote` segue bloqueado por permissao
- import remoto em D1 descartavel nao foi reexecutado
- o repo continua sem evidencia aprovada de restore remoto controlado completo com validacao pos-restore

## Bloqueios remanescentes

- sessao dummy aprovada ausente para smoke autenticado e cross-tenant
- permissao insuficiente do token atual para `wrangler d1 execute --remote`
- DR remoto em D1 descartavel sem revalidacao executavel nesta sessao

## Proxima macroetapa unica

solicitar credencial efemera aprovada de staging + permissao de D1 remoto read-only para revalidar smoke autenticado, cross-tenant e o eixo DR remoto sobre D1 descartavel

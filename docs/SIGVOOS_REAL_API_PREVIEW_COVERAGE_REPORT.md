# SIGVOOS Real API Preview Coverage Report

## Veredito

`BLOQUEADO`

O PR #50 foi revisado, validado e mergeado, e o Worker de producao foi publicado com o endpoint read-only e a flag backend de preview real ativa. A validacao completa da API real SIGVOOS nao foi concluida porque esta sessao nao tinha token/credencial AirTrust autenticada para acionar o endpoint protegido como gestor/admin. O frontend com `VITE_SIGVOOS_REAL_API_PREVIEW_ENABLED=true` foi buildado, mas o deploy Cloudflare Pages falhou por permissao do token Cloudflare; o deploy automatico GitHub Pages disparado pelo merge tambem falhou por configuracao do GitHub Pages.

Nao houve sync real, escrita SIGVOOS, migration, alteracao FRMS ou exposicao de payload real.

## PR #50

- Status: `MERGED`.
- URL: `https://github.com/airtrustsystem-alt/airtrust/pull/50`.
- Merge commit: `9c06d4f77cce183b3c465ce33a2fdd9b0e0fbc7d`.
- Commit do PR: `749aae4c929db9081f6944e22f5a3ea4f86aa378`.
- Checks antes do merge: verdes.
- Diff auditado: endpoint real-preview, servico SIGVOOS read-only, flags, testes e relatorio do PR.

## Escopo Revisado

- Endpoint: `POST /api/controle-voos/sigvoos/real-preview`.
- Backend flag: `CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED`.
- Frontend flag: `VITE_SIGVOOS_REAL_API_PREVIEW_ENABLED`.
- Servico: `worker-airtrust/src/services/controle-voos/sigvoos-real-preview.ts`.
- Testes: Worker e frontend.

Confirmacoes:

- Sem import ou alteracao de FRMS.
- Sem import ou alteracao de `frms-source-policy.ts`.
- Sem migrations no PR.
- Sem hardcode de credenciais.
- Sem persistencia de payload real bruto.
- Sem DML novo no servico read-only.
- Usuario comum bloqueado por RBAC.
- Tenant arbitrario no body bloqueado.
- Janela de chamada limitada a 7 dias.
- `pageSize` e `maxPages` limitados.
- Timeout externo configurado.

## Deploy

### GitHub Pages automatico

- Disparado pelo merge em `main`: sim.
- Resultado: `failure`.
- Build do workflow: `success`.
- Falha: `actions/deploy-pages@v4` retornou HTTP 404 ao criar deployment.
- Diagnostico do log: GitHub Pages nao parece habilitado/configurado para esse fluxo.
- Migrations: nao executadas.
- Worker deploy nesse workflow: nao executado.

### Worker producao

- Deploy controlado realizado: sim.
- Comando operacional: `wrangler deploy --env production --config <temp> --keep-vars`.
- Migration executada: nao.
- `wrangler d1 migrations apply`: nao executado.
- `wrangler d1 execute` com escrita: nao executado.
- Version publicada: `2026-06-16T03:10:11Z-9c06d4f7`.
- Worker health: `success=true`, `status=healthy`, `environment=production`.
- Endpoint protegido verificado sem auth: `POST /api/controle-voos/sigvoos/real-preview` retornou `401 MISSING_TOKEN`, sem chamada SIGVOOS real.

### Cloudflare Pages manual

- Build com `VITE_SIGVOOS_REAL_API_PREVIEW_ENABLED=true`: `PASS`.
- Deploy Cloudflare Pages: `BLOCKED`.
- Falha: token Cloudflare retornou `Authentication error [code: 10000]` para `/pages/projects/airtrust`.
- Migrations: nao executadas.

## Flags

- Backend `CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED=true`: ativada no Worker publicado.
- Frontend `VITE_SIGVOOS_REAL_API_PREVIEW_ENABLED=true`: build validado, deploy nao publicado por permissao Cloudflare Pages.
- Nenhuma flag de sync real com escrita foi ativada.

## Credenciais SIGVOOS

Presenca confirmada sem revelar valores:

- Secret Worker `SIGVOOS_CONFIG_ENCRYPTION_KEY`: presente.
- Configuracao por tenant em `integracoes_sigvoos_config`: chaves `base_url`, `username`, `password`, `password_encrypted` e `system` presentes.

Nenhuma credencial SIGVOOS foi impressa, commitada ou armazenada em arquivo.

## Janela de Chamada

- Janela planejada para chamada unica: `2026-06-16` a `2026-06-16`.
- Limite planejado: `pageSize=1`, `maxPages=1`.
- Resultado: chamada real SIGVOOS nao executada.
- Motivo: ausencia de `AIRTRUST_AUTH_TOKEN` ou credenciais AirTrust efemeras nesta sessao para acionar o endpoint autenticado como gestor/admin.

## Cobertura Dos Dados Reais

Nao medida nesta etapa, porque a API real SIGVOOS nao foi chamada.

Campos planejados para cobertura no proximo bloco:

- `flight_report.id`.
- `report_number`.
- `flight_number`.
- aeronave/prefixo.
- origem/destino.
- horarios.
- legs/etapas.
- tripulantes.
- `staff.id`.
- `staff.inscription`.
- CANAC, se retornado.
- campos ausentes.
- campos extras relevantes.
- erros/avisos.

Dados proibidos continuam fora do relatorio: nome completo real, CPF, e-mail, token, payload bruto e segredos.

## Contagens Read-Only

Antes da tentativa operacional e depois do deploy Worker, as contagens permaneceram:

| Tabela | Antes | Depois |
| --- | ---: | ---: |
| `cv_voos` | 0 | 0 |
| `cv_voo_etapas` | 0 | 0 |
| `cv_sigvoos_staging` | 0 | 0 |
| `cv_conflitos_integracao` | 0 | 0 |
| `cv_voo_tripulantes` | 0 | 0 |
| `frms_jornada` | 5262 | 5262 |
| `frms_alerta` | 4899 | 4899 |

Metadados D1 nas leituras:

- `changed_db=false`.
- `rows_written=0`.

## Confirmacoes Negativas

- Escrita em `cv_voos`: nao.
- Escrita em `cv_voo_etapas`: nao.
- Escrita em `cv_voo_tripulantes`: nao.
- Escrita em `cv_sigvoos_staging`: nao.
- Escrita em `cv_conflitos_integracao`: nao.
- Escrita em `frms_jornada`: nao.
- Escrita em `frms_alerta`: nao.
- `INSERT/UPDATE/DELETE` em producao: nao.
- Migration aplicada: nao.
- `wrangler d1 migrations apply`: nao.
- Reexecucao 0410/0411: nao.
- Alteracao FRMS: nao.
- Alteracao `frms-source-policy.ts`: nao.
- E-mail enviado: nao.
- RBAC backend/multi-tenant real alterado: nao.
- Payload real bruto armazenado: nao.
- Payload real completo registrado: nao.

## Lacunas De Contrato

A compatibilidade com Controle de Voos segue pendente de payload real. Nao foi possivel confirmar empiricamente:

- disponibilidade de `flight_report.id`;
- estabilidade de `report_number` e `flight_number`;
- granularidade real das etapas;
- relacao real entre tripulante, `staff.id`, `staff.inscription` e CANAC;
- campos obrigatorios ausentes;
- campos sensiveis retornados pela API;
- comportamento de paginacao real;
- taxa de registros conflitantes.

## Recomendacao

Proximo bloco deve ser apenas uma janela operacional curta para chamada real read-only, depois de fornecer token AirTrust efemero de gestor/admin ou executar a acao por uma sessao autenticada controlada. Manter proibido qualquer sync com escrita ate a cobertura real de campos ser medida e aprovada.

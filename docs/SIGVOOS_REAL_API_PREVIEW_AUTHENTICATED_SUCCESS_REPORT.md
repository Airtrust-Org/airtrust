# SIGVOOS Real API Preview Authenticated Success Report

## Veredito

`BLOQUEADO`

`BLOQUEADO — PREVIEW REAL SIGVOOS AINDA NAO VALIDADO`

A validacao autenticada read-only da API real SIGVOOS nao foi executada porque `AIRTRUST_AUTH_TOKEN` nao estava presente no ambiente local. O criterio de parada foi acionado antes de qualquer chamada autenticada ao endpoint `real-preview`.

## Estado Local

- Branch base: `main`.
- HEAD local: `065dcdf0136ab980324b114f5167b611e81caa2a`.
- `origin/main`: `065dcdf0136ab980324b114f5167b611e81caa2a`.
- Historico confirmado com PR #50, #51 e #52.
- Working tree inicial: limpa.

## Backend Publicado

Health de producao:

- `success=true`.
- `status=healthy`.
- `environment=production`.
- `version=2026-06-16T03:10:11Z-9c06d4f7`.

Version endpoint:

- `version=2026-06-16T03:10:11Z-9c06d4f7`.
- `environment=production`.
- `builtAt=2026-06-16T03:10:11Z`.
- `deploymentId=2026-06-16T03:10:11Z-9c06d4f7`.

## Autenticacao

Metodo pretendido: token AirTrust efemero via env local.

Resultado:

- `AIRTRUST_AUTH_TOKEN`: ausente.
- Valor do token: nao impresso, nao conhecido e nao persistido.
- Validacao de identidade/permissao: nao executada, pois nao havia token.
- Metodo de sessao autenticada controlada: nao utilizado nesta execucao.

## Chamada Anonima

Endpoint:

- `POST https://api.airtrust.online/api/controle-voos/sigvoos/real-preview`

Payload anonimo usado apenas para confirmar o bloqueio:

- `{"window":{"days":1},"limit":10}`

Resultado:

- HTTP status: `401`.
- Codigo retornado: `MISSING_TOKEN`.
- Conclusao: o endpoint continua bloqueado para chamada anonima.

## Chamada Real SIGVOOS

- API real SIGVOOS chamada: `NAO`.
- Endpoint autenticado `real-preview` chamado: `NAO`.
- Credenciais SIGVOOS usadas: `NAO`.
- Janela usada: `NAO APLICAVEL`.
- Status HTTP da chamada autenticada: `NAO APLICAVEL`.
- Payload real recebido: `NAO`.
- Payload bruto armazenado: `NAO`.
- Payload completo registrado em relatorio: `NAO`.

## Cobertura De Campos

Nao medida nesta etapa porque a execucao parou antes da chamada autenticada.

Campos que seguem pendentes para a primeira chamada real read-only:

- `flight_report.id`.
- `report_number`.
- `flight_number`.
- aeronave/prefixo.
- origem/destino.
- horarios.
- legs/etapas.
- `staff.id`.
- `staff.inscription`.
- CANAC, se retornado.
- campos ausentes.
- campos extras relevantes.
- erros de contrato.

## Contagens Read-Only

Contagens coletadas em producao apos o bloqueio, sem chamada SIGVOOS real:

| Tabela | Contagem |
| --- | ---: |
| `cv_voos` | 0 |
| `cv_voo_etapas` | 0 |
| `cv_sigvoos_staging` | 0 |
| `cv_conflitos_integracao` | 0 |
| `cv_voo_tripulantes` | 0 |
| `frms_jornada` | 5262 |
| `frms_alerta` | 4899 |

Metadados da leitura D1:

- `changed_db=false`.
- `rows_written=0`.
- `rows_read=10161`.

## Confirmacoes De Seguranca

- Sync real executado: `NAO`.
- Escrita em `cv_voos`: `NAO`.
- Escrita em `cv_voo_etapas`: `NAO`.
- Escrita em `cv_voo_tripulantes`: `NAO`.
- Escrita em `cv_sigvoos_staging`: `NAO`.
- Escrita em `cv_conflitos_integracao`: `NAO`.
- `INSERT/UPDATE/DELETE` em producao: `NAO`.
- Migration aplicada: `NAO`.
- `wrangler d1 migrations apply`: `NAO`.
- Reexecucao 0410/0411: `NAO`.
- FRMS alterado: `NAO`.
- `frms-source-policy.ts` alterado: `NAO`.
- E-mail enviado: `NAO`.
- RBAC backend/multi-tenant real alterado: `NAO`.
- Token AirTrust impresso: `NAO`.
- Credenciais SIGVOOS impressas: `NAO`.
- Credenciais commitadas: `NAO`.

## Compatibilidade Com Controle De Voos

A compatibilidade empirica com Controle de Voos segue pendente de payload real. A implementacao permanece publicada e protegida, mas ainda falta executar uma unica chamada autenticada read-only com janela curta e limite baixo.

## Recomendacao

Reexecutar esta etapa somente depois de exportar localmente um token efemero de Admin/Gestor:

```bash
export AIRTRUST_AUTH_TOKEN='TOKEN_EFEMERO_ADMIN_OU_GESTOR'
```

Nao imprimir o valor do token. Com o token presente, validar `/api/auth/me` ou equivalente, executar uma unica chamada read-only com janela de 1 dia, coletar somente metadados sanitizados e repetir as contagens D1 antes/depois.

Manter sync real com escrita bloqueado ate a cobertura real dos campos SIGVOOS ser medida e documentada.

# SIGVOOS Real API Preview Authenticated Run Report

## Veredito

`BLOQUEADO`

`BLOQUEADO — PREVIEW REAL SIGVOOS AINDA NAO VALIDADO`

A execucao autenticada do preview real SIGVOOS nao foi realizada porque esta sessao nao recebeu `AIRTRUST_AUTH_TOKEN` efemero e nao havia ferramenta de navegador autenticado controlado disponivel para usar o Caminho B. O endpoint segue protegido contra chamada anonima e nenhuma chamada real SIGVOOS foi feita.

## Contexto

- PR #50 mergeado em `9c06d4f77cce183b3c465ce33a2fdd9b0e0fbc7d`.
- PR #51 mergeado em `d519e18d024fde06f1705fa8f2fdc7ec872ddd4f`.
- Worker de producao publicado com `CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED=true`.
- Frontend com flag real segue com ressalva operacional: build local ja passou anteriormente, mas deploy Pages ficou bloqueado por permissao/configuracao.
- Relatorio anterior: `docs/SIGVOOS_REAL_API_PREVIEW_COVERAGE_REPORT.md`.

## Estado Local

- Branch base: `main`.
- HEAD local: `d519e18d024fde06f1705fa8f2fdc7ec872ddd4f`.
- `origin/main`: `d519e18d024fde06f1705fa8f2fdc7ec872ddd4f`.
- Working tree antes do relatorio: limpa.

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

## Autenticacao

Metodo pretendido: Caminho A, token efemero via env local.

Resultado:

- `AIRTRUST_AUTH_TOKEN`: ausente.
- Valor do token: nao impresso, nao conhecido, nao persistido.
- Caminho B: nao utilizado porque nao havia ferramenta de navegador autenticado controlado disponivel nesta sessao.

## Chamada Anonima

Endpoint:

- `POST https://api.airtrust.online/api/controle-voos/sigvoos/real-preview`

Payload anonimo usado apenas para confirmar bloqueio:

- `{"window":{"days":1}}`

Resultado:

- HTTP status: `401`.
- Codigo: `MISSING_TOKEN`.
- Conclusao: endpoint continua bloqueado para chamada anonima.

## Chamada Real SIGVOOS

- API real SIGVOOS chamada: `NAO`.
- Credenciais SIGVOOS usadas: `NAO`.
- Janela real usada: `NAO APLICAVEL`.
- Status HTTP da chamada real: `NAO APLICAVEL`.
- Payload real recebido: `NAO`.
- Payload bruto armazenado: `NAO`.
- Payload completo registrado em relatorio: `NAO`.

## Cobertura De Campos

Nao medida nesta etapa porque a chamada autenticada foi bloqueada antes de acionar o endpoint.

Campos que seguem pendentes para a primeira execucao real read-only:

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

Contagens coletadas apos o bloqueio, sem chamada SIGVOOS real:

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

## Ressalva Sobre Pages

Pages segue como ressalva operacional separada:

- O backend esta publicado e protegido.
- A chamada backend autenticada nao depende da publicacao do frontend com flag real.
- A correcao de permissao/configuracao Pages deve permanecer em etapa separada.

## Compatibilidade Com Controle De Voos

A compatibilidade empirica com Controle de Voos segue nao validada contra payload real nesta etapa. A implementacao continua pronta para retornar apenas resumo sanitizado, mas ainda falta executar uma chamada autenticada read-only com janela curta para medir cobertura real de campos.

## Recomendacao

Antes de repetir esta etapa, fornecer um dos dois caminhos:

1. `AIRTRUST_AUTH_TOKEN` efemero de usuario Admin/Gestor exportado localmente na sessao, sem imprimir o valor.
2. Ferramenta/sessao de navegador ja autenticada como Admin/Gestor, com captura apenas de metadados sanitizados.

Depois disso, executar uma unica chamada read-only com janela de 1 dia e limite baixo. Manter sync real com escrita bloqueado ate a cobertura real de campos ser medida e documentada.

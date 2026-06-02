# AirTrust Final Launch Gate - Segunda Empresa Real - 2026-06-02

## Resumo

Decisao final: **CONDITIONAL GO**.

Este gate autoriza, no maximo, piloto interno/controlado. Nao autoriza liberacao direta ao cliente enquanto empresa esperada, data quality operacional e aceite legal/compliance minimo continuarem pendentes.

## Estado do Repositorio

| Item | Resultado |
| --- | --- |
| Branch | `main` |
| HEAD | `f9adfa2c8fcd4041ca86c82414b114e5b2e1bbe0` |
| `origin/main` | `f9adfa2c8fcd4041ca86c82414b114e5b2e1bbe0` |
| Ahead/behind | `0 0` |
| Tracked changes iniciais | nenhum |
| Untracked historicos | presentes e intocados |

## Producao

| Item | Resultado |
| --- | --- |
| Base URL | `https://api.airtrust.online` |
| APP_VERSION | `2026-06-02T17:36:07Z-a543132` |
| Health | `healthy` |
| Deploy Pages | nao executado |
| Deploy Worker | nao executado |

## Smokes

| Smoke | Resultado |
| --- | --- |
| Public-only | PASS, `PASS=3 FAIL=0 SKIPPED=0` |
| Assets private FIRA probe | PASS, HTTP `404`, `application/json` |
| Autenticado manual operador | PASS, `PASS=11 FAIL=0 SKIPPED=2` |
| Writes | NO |

## Empresa Esperada

Status: **nao validada por variavel explicita**.

Nao havia `AIRTRUST_EXPECTED_EMPRESA_ID` nem `AIRTRUST_EXPECTED_EMPRESA_CODIGO` no ambiente Codex. Nenhum payload bruto de `/api/auth/me` ou `/api/auth/empresas` foi consultado, impresso ou versionado.

Impacto: bloqueia GO pleno. Mantem decisao maxima como `CONDITIONAL GO`.

## Module Gating

| Comando | Resultado |
| --- | --- |
| `npm run test -- module-access` | PASS, 6 testes |
| `npm run test -- navigation-module-gating` | PASS, 5 testes |
| `npm run test:worker -- --run src/__tests__/routes/auth-empresas-modulos-ativos.test.ts` | PASS, 4 testes |

Cobertura validada:

- modo legacy preservado quando `modulos_ativos` nao existe;
- `modulos_ativos` explicito restringe acesso;
- modulos beta ficam ocultos quando inativos;
- SIGVOOS permanece bloqueado sem ativacao explicita;
- `/api/auth/empresas` expoe configuracao normalizada.

## Data Quality

| Item | Resultado |
| --- | --- |
| Guia revisado | PASS |
| Catalogo revisado | PASS |
| SQL read-only revisado | PASS |
| `bash scripts/validation/validate-data-quality-sql.sh` | PASS |
| `npm run validate:data-quality-sql` | PASS |
| Execucao em producao | nao executada |
| Execucao em local/staging aprovado | SKIPPED_DATA_QUALITY_RUN |

Motivo do skip: nenhum ambiente local/staging aprovado foi disponibilizado nesta sessao. Execucao em producao por Codex permanece proibida.

## Validacoes Globais

| Comando | Resultado |
| --- | --- |
| `bash scripts/preflight-clean-deploy.sh` | PASS |
| `npm run ops:guard` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `npm run test` | PASS |
| `npm run test:worker` | PASS |
| `AIRTRUST_PUBLIC_ONLY=YES bash scripts/smoke-authenticated-operational.sh` | PASS |

## Legal/Compliance

| Item | Status |
| --- | --- |
| DPA/contrato | pendente/controle operacional |
| ToS/Politica de Privacidade | pendente/controle operacional |
| Base legal | pendente/controle operacional |
| Retencao | pendente/controle operacional |
| FRMS/LGPD | uso piloto exige minimo necessario e acompanhamento |

## Decisao

**CONDITIONAL GO**.

Justificativa objetiva:

- smoke autenticado manual informado como PASS;
- smoke publico e assets privados passaram;
- module gating passou por testes frontend/worker;
- SQL de data quality passou validacao estatica read-only;
- validacoes globais passaram;
- empresa esperada nao foi validada por variavel explicita;
- data quality operacional nao foi executado em ambiente aprovado;
- pendencias legais/compliance seguem em controle operacional.

## Condicoes Para Segunda Empresa

Antes de criar ou liberar acesso ao cliente:

- validar empresa atual com `AIRTRUST_EXPECTED_EMPRESA_ID` ou `AIRTRUST_EXPECTED_EMPRESA_CODIGO`, ou registrar aprovacao formal da excecao;
- executar data quality em ambiente aprovado por operador autorizado;
- registrar resultado sem PII;
- confirmar DPA/contrato, politica/base legal e retencao, ou aprovar pendencia controlada por responsavel;
- configurar `modulos_ativos` explicito para o novo tenant;
- manter inativos SIGVOOS, Hospedagem, LMS/EAD, SGSO, Treinamentos Planejados e configuracoes avancadas/beta;
- executar smoke autenticado do novo tenant depois de criado;
- checar isolamento bidirecional entre empresa atual e novo tenant.

## Proibido

- criar usuario real sem aprovacao;
- rodar seed/importacao;
- executar migration;
- criar schema;
- tocar DB remoto;
- executar `wrangler d1 execute --remote`;
- executar data quality em producao por Codex;
- versionar senha/token/cookie/PII;
- fazer deploy Pages/Worker neste gate.

## Proximo Passo

Responsavel operacional decide se aceita `CONDITIONAL GO` para piloto interno. Se aceitar, preparar criacao do tenant com `modulos_ativos` explicito e checklist legal/data quality como bloqueio antes de acesso de cliente.

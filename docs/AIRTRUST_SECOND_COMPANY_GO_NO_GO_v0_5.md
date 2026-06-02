# AirTrust Second Company GO/NO-GO v0.5

Data: 2026-06-02

## Decisao

Status: **CONDITIONAL GO para piloto interno/controlado da segunda empresa**.

Nao e GO pleno para liberacao ao cliente. A segunda empresa so pode seguir sob controle operacional interno, sem acesso de cliente, ate fechar as pendencias de empresa esperada, data quality operacional e aceite legal/compliance minimo.

## Evidencia Principal

- Branch: `main`
- HEAD: `f9adfa2c8fcd4041ca86c82414b114e5b2e1bbe0`
- `origin/main`: `f9adfa2c8fcd4041ca86c82414b114e5b2e1bbe0`
- APP_VERSION em producao: `2026-06-02T17:36:07Z-a543132`
- Deploy neste gate: nao executado
- Dossie final: `docs/AIRTRUST_SECOND_COMPANY_FINAL_LAUNCH_GATE_20260602.md`
- Smoke autenticado: `docs/AIRTRUST_AUTHENTICATED_SMOKE_EVIDENCE_20260602.md`

## Gate Tecnico

| Item | Status | Evidencia |
| --- | --- | --- |
| Branch `main` alinhada com `origin/main` | PASS | ahead/behind `0 0` |
| Preflight limpo | PASS | `bash scripts/preflight-clean-deploy.sh` |
| Ops guard | PASS | `npm run ops:guard` |
| TypeScript | PASS | `npx tsc --noEmit` |
| Build | PASS | `npm run build` |
| Testes frontend | PASS | `npm run test` |
| Testes worker | PASS | `npm run test:worker` |
| Deploy | Nao executado | docs/evidencia apenas |

## Gate de Smoke

| Item | Status | Evidencia |
| --- | --- | --- |
| Smoke public-only | PASS | `PASS=3 FAIL=0 SKIPPED=0` |
| Assets private FIRA probe | PASS | HTTP `404`, `application/json` |
| Smoke autenticado manual operador | PASS | `PASS=11 FAIL=0 SKIPPED=2`, writes `NO` |
| Empresa esperada | PENDENTE | sem `AIRTRUST_EXPECTED_EMPRESA_ID/CODIGO` explicito |

## Gate de Modulos

| Item | Status | Evidencia |
| --- | --- | --- |
| Empresa sem `modulos_ativos` preserva modo legacy | PASS | testes de module access/navigation |
| Empresa com `modulos_ativos` restringe acesso | PASS | testes de module access/navigation |
| Modulos beta ocultam quando inativos | PASS | testes de module access/navigation |
| SIGVOOS bloqueado sem ativacao explicita | PASS | testes de module access/navigation |
| `/api/auth/empresas` retorna `modulos_ativos` normalizado | PASS | worker test `auth-empresas-modulos-ativos` |

## Gate de Data Quality

| Item | Status | Evidencia |
| --- | --- | --- |
| SQL read-only validado estaticamente | PASS | `bash scripts/validation/validate-data-quality-sql.sh` e `npm run validate:data-quality-sql` |
| Execucao em producao por Codex | NAO EXECUTADA | proibida |
| Execucao em local/staging aprovado | SKIPPED_DATA_QUALITY_RUN | ambiente aprovado indisponivel nesta sessao |

## Gate Legal/Compliance

| Item | Status |
| --- | --- |
| DPA/contrato | PENDENTE/controle operacional |
| ToS/Politica de Privacidade | PENDENTE/controle operacional |
| Base legal e retencao | PENDENTE/controle operacional |
| LGPD para FRMS | exige acompanhamento e minimo necessario |

## Justificativa da Decisao

O gate tecnico principal passou: assets privados continuam bloqueados, module gating esta validado por testes, smoke autenticado manual foi informado como PASS e validacoes globais passaram.

O GO pleno permanece bloqueado porque a empresa esperada nao foi validada por variavel explicita, o data quality nao foi executado em ambiente aprovado e as pendencias legais/compliance ainda precisam aceite formal antes de liberar cliente.

## Condicoes Para Criar a Segunda Empresa

- Manter criacao apenas como piloto interno/controlado.
- Nao liberar acesso ao cliente antes de validar empresa esperada por `AIRTRUST_EXPECTED_EMPRESA_ID` ou `AIRTRUST_EXPECTED_EMPRESA_CODIGO`, ou registrar aprovacao formal da excecao.
- Executar data quality em ambiente aprovado por operador autorizado, sem Codex e sem producao remota.
- Registrar resultado de data quality sem PII.
- Confirmar DPA/contrato, politica/base legal e retencao ou registrar aceite formal de pendencia controlada.
- Configurar `modulos_ativos` explicito antes do primeiro acesso do novo tenant.
- Manter SIGVOOS, Hospedagem, LMS/EAD, SGSO e configuracoes beta inativos/ocultos.

## Proibido

- Criar usuario real sem aprovacao operacional.
- Rodar seed/importacao.
- Executar migration ou criar schema.
- Usar `wrangler d1 execute --remote`.
- Executar data quality em producao por Codex.
- Expor token, cookie, senha, payload bruto ou PII em docs/logs/commits.
- Fazer deploy Pages/Worker neste gate documental.

## Proximo Passo

Executar a criacao da segunda empresa somente se o responsavel operacional aceitar `CONDITIONAL GO` para piloto interno. Antes de liberar cliente, fechar empresa esperada, data quality operacional e aceite legal/compliance minimo.

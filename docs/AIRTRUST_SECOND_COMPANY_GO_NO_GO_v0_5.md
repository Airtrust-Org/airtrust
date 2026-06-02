# AirTrust Second Company GO/NO-GO v0.5

Data: 2026-06-02

## Decisao

Status: **NO-GO parcial para criar/liberar a segunda empresa real hoje**.

O repositorio esta preparado com matriz, guias e guards adicionais, mas ainda faltam evidencias operacionais obrigatorias: smoke autenticado da empresa atual, execucao segura de data quality e gating comprovado de modulos beta.

## Gate de Codigo

| Item | Status | Evidencia |
| --- | --- | --- |
| Branch `main` alinhada a `origin/main` no inicio | GO | `8f4c4b6bac7b958e1930fcece12c5757f8d4f43e`, ahead/behind `0 0` |
| Guards iniciais | GO | `bash scripts/preflight-clean-deploy.sh`, `npm run ops:guard` |
| Mudanca de frontend | Nao executada | gating ficou em plano |
| Mudanca de worker | Nao executada | nenhum endpoint alterado |
| Deploy | Nao aplicavel | docs/scripts/package apenas |

## Gate de Modulos

| Item | Status | Decisao |
| --- | --- | --- |
| Modulos liberados para piloto | GO condicionado | Funcionarios, Qualificacoes, Simuladores, Dashboard, Escalas/EVD, FRMS e PDFs/certificados com acompanhamento |
| LMS/EAD | NO-GO para venda/liberacao geral | manter beta/oculto |
| SGSO | NO-GO para venda/liberacao geral | manter beta/oculto |
| Hospedagem | NO-GO | manter oculto |
| SIGVOOS | NO-GO bloqueado | nao ativar |
| Configuracoes "em breve" | NO-GO para demo | revisar visualmente/ocultar |
| Gating por `modulos_ativos` | NO-GO parcial | mecanismo nao conectado end-to-end |

## Gate de Data Quality

Status: **PENDENTE operacional**.

Artefatos prontos:

- `docs/AIRTRUST_DATA_QUALITY_CHECKS_v0_5.md`
- `scripts/validation/data-quality-checks-readonly.sql`
- `docs/AIRTRUST_DATA_QUALITY_EXECUTION_GUIDE_v0_5.md`
- `scripts/validation/validate-data-quality-sql.sh`

Aceite para mudar para GO:

- validador local passa;
- checks bloqueantes executados por operador autorizado retornam zero ou mitigacao formal;
- nenhum resultado com PII e versionado.

## Gate de Smoke

Status: **PENDENTE autenticado**.

Ja e esperado:

- public-only deve passar;
- sem credencial deve retornar `SKIPPED_AUTH_REQUIRED`;
- autenticado read-only precisa de `AIRTRUST_AUTH_TOKEN` ou `AIRTRUST_COOKIE` e empresa esperada.

## Bloqueadores Para GO

1. Smoke autenticado read-only da empresa atual ainda nao executado neste ambiente por falta de credencial.
2. Data quality ainda nao executado por operador autorizado.
3. Gating de modulos beta nao existe end-to-end; ocultacao depende de controle operacional/manual.
4. Configuracoes visuais "em breve" precisam revisao antes de demo externa.

## Condicoes Para GO Controlado

Pode virar GO para onboarding controlado quando todos forem verdadeiros:

- `main` alinhada com `origin/main`;
- guards, TypeScript, build, testes frontend/worker e smokes public-only/sem credencial passam;
- smoke autenticado read-only valida empresa esperada;
- data quality bloqueante esta zerado ou mitigado;
- modulos beta estao ocultos por gating testado ou por roteiro operacional aprovado;
- nenhuma migration, seed, import ou escrita em producao e necessaria para o primeiro acesso.

## Proximo Passo Objetivo

Executar smoke autenticado read-only com empresa esperada e, em seguida, executar data quality em ambiente seguro por operador autorizado. Se ambos passarem, abrir sprint especifico para gating end-to-end antes da liberacao visual da segunda empresa.

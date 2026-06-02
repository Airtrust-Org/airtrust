# AirTrust Customer Launch Hardening v0.5

Data: 2026-06-02

## Branch e HEAD

- Branch: `main`
- HEAD inicial: `4344e936ec5bb173c6d643465b414f10a5f3cf10`
- Base URL de smoke: `https://api.airtrust.online`

## Objetivo do Sprint

Preparar a entrada da segunda empresa real sem tocar dados reais, cobrindo respostas de erro seguras, inventario LGPD, data quality, audit trail e modulos beta/ocultos.

## Respostas de Erro Corrigidas

Foram corrigidos retornos client-facing que expunham `error.message`, `String(e)`, `details` com erro interno ou stack em payloads de rotas operacionais. Logs server-side continuam podendo registrar erro real.

Categorias corrigidas:

- Exportacao/importacao.
- Simuladores, sessoes, fichas e modelos.
- Qualificacoes/certificados.
- Alertas, pasta virtual, habilitacoes, auditoria e FRMS snapshot.
- Funcionarios dashboard stats.
- Escalas e rotas operacionais com 500 baseado em `String(e)`.

## Respostas Mantidas e Motivo

- Validacoes 400 com erros de schema/domino, quando nao expunham stack nem SQL.
- Rotas admin/debug/migration internas documentadas como fora de cliente final e bloqueadas por controle operacional.
- Logs server-side com erro real, desde que nao sejam payload client-facing.

## Inventario LGPD Criado

Criado `docs/AIRTRUST_LGPD_DATA_INVENTORY_v0_5.md` cobrindo dados pessoais, operacionais sensiveis, FRMS, documentos, assets, logs, tenant e lacunas.

## Data Quality Checks Criados

Criado `docs/AIRTRUST_DATA_QUALITY_CHECKS_v0_5.md` e SQL read-only em `scripts/validation/data-quality-checks-readonly.sql`.

Sprint 5 adicionou `docs/AIRTRUST_DATA_QUALITY_EXECUTION_GUIDE_v0_5.md` e o validador local `scripts/validation/validate-data-quality-sql.sh`, tambem exposto por `npm run validate:data-quality-sql`.

## Plano de Audit Trail Criado

Criado `docs/AIRTRUST_AUDIT_TRAIL_LGPD_HARDENING_PLAN_v0_5.md`, sem migration/schema.

## Matriz de Modulos Atualizada

`docs/AIRTRUST_MODULE_RELEASE_MATRIX_v0_5.md` foi revisada para explicitar pre-condicoes de liberacao, status e demo.

## Implementado em Runtime

- Helper `jsonInternalError`.
- Sanitizacao de respostas client-facing em rotas do worker.
- Teste arquitetural e funcional para impedir retorno de stack/erro bruto em payload 500.

## Ficou em Plano/Documentacao

- Feature gating por `modulos_ativos` no frontend.
- Audit trail padronizado com migration futura.
- Automacao de data quality.
- Contratos juridicos, DPA, ToS, politica de privacidade e retencao.

Sprint 5 formalizou o NO-GO parcial de gating em `docs/AIRTRUST_MODULE_GATING_PLAN_v0_5.md`, porque o contrato atual nao leva `modulos_ativos` de `/api/auth/empresas` ate menu e rotas diretas.

## Riscos Remanescentes Antes da Segunda Empresa

- Smoke autenticado da empresa atual ainda pendente por falta de credencial.
- Modulos beta aparecem na navegacao atual e devem ser controlados operacionalmente ou por feature gating antes de liberar cliente.
- Data quality precisa ser executado em ambiente seguro por operador autorizado.
- GO/NO-GO vigente: `docs/AIRTRUST_SECOND_COMPANY_GO_NO_GO_v0_5.md` permanece NO-GO parcial ate smoke autenticado, data quality e gating/ocultacao aprovados.

## Riscos Remanescentes Antes da Quinta Empresa

- Suporte interno precisa de trilha dedicada.
- Audit trail precisa ser uniforme para downloads/exports/admin.
- Feature gating por tenant precisa de testes end-to-end.
- Retencao/exclusao precisa estar operacionalizada.

## Proxima Fase Recomendada

1. Executar smoke autenticado read-only com empresa esperada.
2. Implementar feature gating por tenant em sprint proprio, com cuidado para nao ocultar modulo usado pela empresa atual.
3. Criar migration de audit trail padronizada.
4. Executar data quality read-only antes do onboarding.

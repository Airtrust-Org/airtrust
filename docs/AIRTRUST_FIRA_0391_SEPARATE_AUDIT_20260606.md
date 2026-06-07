# AIRTRUST FIRA 0391 Separate Audit — 2026-06-06

## Escopo
Prompt desta sessão determinou explicitamente:
- não alterar novamente a migration `0391`
- não misturar FIRA/FRMS com correções de escala/treinamento

## O que foi feito nesta sessão
- Nenhuma migration executada
- Nenhum backfill executado
- Nenhuma alteração manual de dados em produção
- Nenhum deploy

## Evidências disponíveis no workspace
- backups e artefatos já existentes em `artifacts/frms-sigvoos-global-rebuild-20260605/`
- relatórios prévios em:
  - `docs/FRMS_FULL_CALCULATION_AUDIT_OPUS_20260605.md`
  - `docs/FRMS_SIGVOOS_FIRA_SOURCE_QUALITY_AND_REMAINING_FIRA_AUDIT_20260606.md`
  - `docs/FRMS_SIGVOOS_POST_PRODUCTION_VERIFICATION_20260605.md`

## Classificação desta sessão para 0391/FIRA
`REQUER_REVISÃO`

## Motivo
O tema foi mantido fora de escopo operacionalmente, como exigido. Isso evita regressão cruzada, mas também significa que a migration 0391 não foi reauditada do zero aqui.

## Próximo passo recomendado
Executar uma auditoria dedicada e isolada para 0391/FIRA usando somente:
- SQL aplicado
- contagem/shape das 544 linhas esperadas
- impacto em jornada FRMS
- backup associado
- comparação antes/depois em ambiente seguro

# Schema V2 0552 — oportunidade de sono distinta do sono efetivo (FRMS)

## Objetivo e fundamentação
O RBAC 117 distingue repouso, oportunidade de sono e sono efetivamente obtido; a IS 117-001C descreve débito de sono, ritmo circadiano e carga de trabalho como fatores da fadiga. A IOGP 690-2 §17C.1 recomenda restrições adicionais para múltiplas etapas offshore curtas e temperaturas extremas. Não interpretar recomendações da IOGP como pesos prescritos por lei.

## Contrato
- `horas_sono` é **sono efetivo autodeclarado** para score diário, efetividade e sinais fisiológicos.
- `oportunidade_sono_horas_24h` é **oportunidade de sono (repouso absoluto)** autodeclarada, separada, nullable, em horas/24h.
- Linhas históricas permanecem `NULL`: nunca copiar `horas_sono` para o campo novo nem inventar que repouso = sono.
- Novos clientes informam ambos separadamente; valor de oportunidade inferior ao sono informado é rejeitado pela validação. Clientes históricos continuam aceitos no esquema, mas sem crédito presumido para oportunidade ausente.
- `frms_recovery_assessment.absolute_rest_hours` recebe somente a oportunidade declarada; `sleep_hours_24h` continua recebendo o sono efetivo. PVT diário permanece obrigatório.
- Dados de jornada, pousos, temperatura, IMC e limites legais mantêm suas fontes e revisões; esta migration **não** altera políticas, coeficientes, thresholds nem registros existentes.

## Migração aditiva
`worker-airtrust/schema-v2/changes/0552_frms_sleep_opportunity.sql` adiciona somente a coluna nullable de 0–24h, sem escrita retrospectiva e sem alteração de tenant/RBAC.

## Aplicação governada
Usar apenas workflow Schema V2 oficial com `changeId=frms-sleep-opportunity-0552`, manifest e hashes revisados, baseline `production-d1-baseline-v2-20260714`, pré-validação de tabela/colunas e ledger, backup/recovery point e autorização específica quando exigida. Jamais aplicar SQL D1 remoto improvisado.

Ordem: (1) CI/revisão da PR, (2) aplicação governada da migration em staging, (3) Worker + Pages no mesmo SHA, (4) smoke autenticado e check-in/PVT com fixture sintética, (5) análise de divergência e proveniência, (6) produção somente com autorização de SHA/artefatos/escopo.

## Testes e pós-condições
- Confirmar coluna nullable, CHECK de 0–24h, e nenhuma mutação histórica.
- Criar check-in sintético com 8h de oportunidade e 5h de sono: persistir dois números distintos, score diário calculado com 5h, crédito de recuperação apenas com 8h.
- Verificar rejeição quando oportunidade for menor do que o sono, PVT obrigatório e `NULL` conservador para registros antigos.
- Confirmar tenant isolation, revisão de política e idempotência governada via ledger.

## Recuperação
Snapshot D1/Time Travel obtido no fluxo oficial antes do apply. Reversão de dados/coluna por mudança compensatória governada após análise de impacto; não executar `DROP COLUMN` remotamente como atalho.

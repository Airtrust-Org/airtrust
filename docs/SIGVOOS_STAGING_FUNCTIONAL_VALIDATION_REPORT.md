# AirTrust - Validacao Funcional Remota em Staging SIGVOOS com Fixtures Sinteticas

Data da execucao: 2026-06-15
Branch: `codex/sigvoos-staging-functional-validation`
Ambiente aprovado: `staging`
Banco remoto aprovado: `airtrust-db-staging` (`b7f50907-c110-45f5-ad17-e97ea47f2826`)

## Veredito

`STAGING FUNCIONAL VALIDADO`

O fluxo de importacao SIGVOOS foi exercitado remotamente em staging com fixtures sinteticas controladas, sem uso de API real SIGVOOS, sem alteracao de producao, sem migration nova, sem deploy e sem impacto em tabelas FRMS.

## Guardrails cumpridos

- Nenhuma operacao foi executada contra `airtrust-db` producao.
- Nenhum comando usou `--env production`.
- Nenhum deploy foi executado.
- Nenhuma credencial SIGVOOS real foi utilizada.
- Nenhuma alteracao foi feita em `frms-source-policy.ts` ou no contrato canonico FRMS.
- Nenhuma migration nova foi criada ou aplicada.
- O alvo remoto foi confirmado por evidencias de `wrangler d1 list` antes da escrita controlada.

## Escopo funcional validado

Fixtures exercitadas:

- `sigvoos-com-flight-report-id.json`
- `sigvoos-sem-flight-report-id.json`
- `sigvoos-multileg-flight-report-id.json`
- `sigvoos-staff-id-inscription-conflict.json`
- `sigvoos-sem-canac.json`
- `sigvoos-optional-missing-extra-sensitive.json`
- `sigvoos-com-flight-report-id.json` em tenant isolado secundario

Tenants sinteticos usados:

- `empresa_id=906`
- `empresa_id=907`

## Baseline remoto antes do seed sintetico

Contagens globais:

- `cv_voos=0`
- `cv_voo_etapas=0`
- `cv_sigvoos_staging=0`
- `cv_conflitos_integracao=0`
- `cv_voo_tripulantes=0`
- `frms_jornada=0`
- `frms_alerta=0`
- `trg_cv_* = 18`
- colunas SIGVOOS em `cv_voos = 10`
- colunas SIGVOOS em `cv_voo_tripulantes = 6`

## Seed sintetico de suporte aplicado em staging

Antes da importacao funcional, foi inserido um seed sintetico controlado para habilitar catalogos minimos, funcionarios sinteticos e um voo preexistente usado para forcar um conflito esperado de conciliacao `staff.id` vs `staff.inscription`.

Contagens sinteticas apos seed:

- `cv_aeroportos=8`
- `cv_tipos_voo=2`
- `cv_naturezas_voo=2`
- `cv_motivos_operacionais=2`
- `funcionarios=5`
- `cv_voos=1`
- `cv_voo_etapas=1`
- `cv_voo_tripulantes=1`

Observacao: esse voo pre-semeado explica a diferenca entre o baseline absoluto e os totais finais apos a primeira importacao.

## Resultado da primeira execucao funcional

Resumo do batch:

- `totalPayloads=7`
- `processedPayloads=7`
- `failedPayloads=0`
- `processedRecords=6`
- `conflictRecords=2`
- `reusedRecords=0`
- `createdFlights=7`
- `updatedFlights=1`
- `createdEtapas=8`
- `updatedEtapas=0`
- `createdTripulantes=6`
- `updatedTripulantes=0`
- `resolvedTripulantes=6`
- `createdConflicts=2`

Conflitos esperados e confirmados:

- `staff-conflict`: `staff.id` e `staff.inscription` resolveram para funcionarios diferentes
- `missing-canac`: funcionario nao resolvido por `staff.id` nem por `staff.inscription`

## Resultado da segunda execucao funcional

Resumo do replay:

- `totalPayloads=7`
- `processedPayloads=7`
- `reusedPayloads=7`
- `failedPayloads=0`
- `processedRecords=0`
- `reusedRecords=8`
- `reusedStages=8`
- `createdFlights=0`
- `updatedFlights=0`
- `createdEtapas=0`
- `updatedEtapas=0`
- `createdTripulantes=0`
- `updatedTripulantes=0`
- `createdConflicts=0`

Conclusao: a segunda passagem foi idempotente e reutilizou integralmente os payloads e registros previamente materializados.

## Estado remoto apos validacao

Contagens globais finais:

- `cv_voos=8`
- `cv_voo_etapas=9`
- `cv_sigvoos_staging=8`
- `cv_conflitos_integracao=2`
- `cv_voo_tripulantes=7`
- `frms_jornada=0`
- `frms_alerta=0`
- `trg_cv_* = 18`
- colunas SIGVOOS em `cv_voos = 10`
- colunas SIGVOOS em `cv_voo_tripulantes = 6`

Leitura operacional:

- os 7 cenarios foram aceitos no staging remoto;
- houve persistencia controlada em `cv_sigvoos_staging`, `cv_voos`, `cv_voo_etapas` e `cv_voo_tripulantes`;
- os 2 conflitos esperados foram materializados em `cv_conflitos_integracao`;
- nenhum sinal de regressao estrutural apareceu em triggers ou colunas dedicadas;
- FRMS permaneceu integralmente inalterado.

## Evidencias de validacao local/repositorio

Checks executados nesta fase:

- `cd worker-airtrust && npx vitest run src/__tests__/services/controle-voos-sigvoos-staging-remote-validation.test.ts`
- `cd worker-airtrust && npx vite-node --script scripts/run-sigvoos-staging-functional-validation.ts --target staging --mode preview`
- `cd worker-airtrust && npx vite-node --script scripts/run-sigvoos-staging-functional-validation.ts --target staging --mode apply`

Checks de fechamento do repositorio executados e aprovados:

- `cd worker-airtrust && npx tsc --noEmit --pretty false`
- `npm run build`
- `git diff --check`
- `bash scripts/check-tracked-secrets.sh`
- `bash scripts/validation/audit-deploy-scripts.sh`
- `bash scripts/audit-dangerous-ops.sh`

## Riscos e limitacoes remanescentes

- Esta validacao comprova o fluxo remoto com fixtures sinteticas aprovadas, nao a integracao com a API real SIGVOOS.
- O staging agora contem registros sinteticos dos tenants `906` e `907`; eles sao apropriados para auditoria e repeticao controlada deste fluxo, mas nao representam carga operacional real.
- O conflito `staff.id` vs `staff.inscription` foi induzido de forma proposital por seed sintetico controlado; ele valida a deteccao do conflito, nao um incidente espontaneo de producao.

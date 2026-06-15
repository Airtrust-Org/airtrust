# SIGVOOS -> Controle de Voos Importer Local Runner Report

## Veredito

`RUNNER LOCAL OK`

## Base validada

- Branch de trabalho: `codex/controle-voos-sigvoos-importer-runner`
- Baseline remoto confirmado em `origin/main`: `0591589ccbc2692e179325418345521523eb8536`
- Working tree inicial estava limpa.
- Stage inicial estava vazio.
- Nenhum deploy foi executado.
- Nenhuma migration foi aplicada fora do SQLite/D1 local descartavel dos testes.
- Nenhuma chamada a API real SIGVOOS foi feita.
- Nenhuma credencial SIGVOOS foi usada.
- Nenhuma acao ocorreu em staging, producao, D1 remoto, Cloudflare, R2 ou secrets.
- FRMS canonico e `worker-airtrust/src/lib/frms/frms-source-policy.ts` permaneceram intocados.

## Arquivos alterados

- `worker-airtrust/src/services/controle-voos/sigvoos-importer-runner.ts`
- `worker-airtrust/src/__tests__/services/controle-voos-sigvoos-importer-runner.test.ts`
- `docs/SIGVOOS_CONTROLE_VOOS_IMPORTER_LOCAL_RUNNER_REPORT.md`

## Formato do runner

Arquivo:
- `worker-airtrust/src/services/controle-voos/sigvoos-importer-runner.ts`

Entrada local:
- lista de payloads locais com `payload`, `label` opcional, `empresaId` opcional e janelas `sourceWindowStart/sourceWindowEnd`;
- `defaultEmpresaId` para o lote;
- `actorUserId` e `continueOnError` opcionais.

Saida agregada:
- `totalPayloads`
- `processedPayloads`
- `reusedPayloads`
- `failedPayloads`
- `processedRecords`
- `conflictRecords`
- `reusedRecords`
- `reusedStages`
- `createdFlights`
- `updatedFlights`
- `createdEtapas`
- `updatedEtapas`
- `createdTripulantes`
- `updatedTripulantes`
- `resolvedTripulantes`
- `createdConflicts`
- `conflicts[]`
- `warnings[]`
- `byPayload[]`

Saida por payload:
- `label`, `empresaId`, `status`
- contadores de voos/etapas/tripulantes/conflitos
- `payloadHashes[]`
- `stageIds[]`
- `conflicts[]`
- `warnings[]`
- `rawSummary`

## Fixtures e cenarios usados

- `sigvoos-multileg-flight-report-id.json`
- `sigvoos-staff-id-inscription-conflict.json`
- `sigvoos-com-flight-report-id.json`

Cenarios cobertos:
- execucao em lote com multiplas fixtures locais;
- idempotencia ao executar o mesmo lote duas vezes;
- relatorio de conflitos com justificativa e severidade;
- relatorio de payloads reutilizados e stages reutilizados;
- contagem agregada de voos, etapas e tripulantes;
- isolamento por `empresa_id`;
- ausencia de escrita em FRMS;
- ausencia de chamada de API real;
- ausencia de dependencia em `frms-source-policy.ts`.

## Metricas geradas

Lote principal validado na suite do runner:
- `totalPayloads = 3`
- `processedPayloads = 3`
- `reusedPayloads = 0`
- `failedPayloads = 0`
- `processedRecords = 3`
- `conflictRecords = 1`
- `reusedStages = 0`
- `createdFlights = 3`
- `updatedFlights = 1`
- `createdEtapas = 4`
- `updatedEtapas = 0`
- `createdTripulantes = 3`
- `updatedTripulantes = 0`
- `resolvedTripulantes = 3`
- `createdConflicts = 1`

Lote repetido para validar shadow/idempotencia:
- `processedPayloads = 2`
- `reusedPayloads = 2`
- `processedRecords = 0`
- `reusedRecords = 3`
- `reusedStages = 3`
- `createdFlights = 0`
- `createdEtapas = 0`
- `createdTripulantes = 0`

Conflito observado:
- `justificativa = staff.id e staff.inscription resolvidos para funcionarios diferentes`
- `campo = funcionario_id`
- `severidade = MEDIA`
- `status = ABERTO`

## Validacoes executadas

- `cd worker-airtrust && npx vitest run src/__tests__/services/controle-voos-sigvoos-importer-runner.test.ts`
  - `PASS`
- `cd worker-airtrust && npx vitest run src/__tests__/services/controle-voos-sigvoos-importer.test.ts`
  - `PASS`
- `cd worker-airtrust && npx vitest run src/__tests__/migrations/controle-voos-sigvoos-integration-0411-schema.test.ts`
  - `PASS`
- `npx tsc --noEmit --pretty false`
  - `PASS`
- `git diff --check`
  - `PASS`
- `bash scripts/check-tracked-secrets.sh`
  - `PASS`
- `bash scripts/validation/audit-deploy-scripts.sh`
  - `PASS` como inventario; continuou listando referencias historicas ja existentes a `migrations apply`
- `bash scripts/audit-dangerous-ops.sh`
  - `PASS` com warning preexistente de scripts remotos/local sync fora deste escopo

## Confirmacoes operacionais

- Nenhuma API real SIGVOOS foi chamada.
- Nenhuma credencial SIGVOOS foi usada.
- Nenhum endpoint HTTP publico foi criado.
- Nenhum deploy foi executado.
- Nenhuma migration foi aplicada em staging ou producao.
- Nenhum D1 remoto, Cloudflare, R2 ou secret foi tocado.
- Nenhuma escrita em FRMS foi feita; tabelas locais `frms_jornada` e `frms_alerta` permaneceram zeradas nos testes.
- `worker-airtrust/src/lib/frms/frms-source-policy.ts` nao foi alterado nem referenciado pelo runner.
- Nenhuma integracao CV -> FRMS foi adicionada.

## Proxima recomendacao

- Revisao humana do contrato do runner e do formato do relatorio agregado.
- Se aprovado, a proxima etapa pode ser um invocador local protegido (CLI interna ou script de teste) que apenas consuma este runner, ainda sem endpoint publico e sem qualquer acesso a SIGVOOS real.

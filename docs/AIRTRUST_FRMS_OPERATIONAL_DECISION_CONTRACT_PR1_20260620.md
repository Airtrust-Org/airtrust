# AirTrust FRMS PR-1 — Operational Decision Contract

Data: 2026-06-20
Branch: `codex/frms-pr1-decision-contract`

## Objetivo

Implementar a fundacao backend do contrato operacional FRMS:

`alerta -> causa -> mitigacao -> override -> evidencia`

O PR estende o snapshot operacional existente sem remover campos, sem alterar telas, sem criar migration real e sem abrir SIGVOOS.

## Arquivos alterados

- `worker-airtrust/src/lib/frms/decision-policy.ts`
- `worker-airtrust/src/lib/frms/override.ts`
- `worker-airtrust/src/lib/frms/operational-snapshot.ts`
- `worker-airtrust/src/routes/frms-override.ts`
- `worker-airtrust/src/routes/frms-projection.ts`
- `worker-airtrust/src/index.ts`
- `worker-airtrust/src/__tests__/frms/decision-policy.test.ts`
- `worker-airtrust/src/__tests__/frms/operational-snapshot-extended.test.ts`
- `worker-airtrust/src/__tests__/frms/override.test.ts`
- `worker-airtrust/src/__tests__/frms/projection.test.ts`
- `docs/migration-0412-draft.sql`
- `docs/AIRTRUST_FRMS_OPERATIONAL_DECISION_CONTRACT_PR1_20260620.md`

## Contrato implementado

- Tipos e catalogos: `FrmsNaturezaDado`, `FrmsDecisaoCodigo`, `FrmsMitigacaoRecomendada`, `FrmsLimiteReferencia`, `FrmsDecisaoFields`, `FrmsDecisaoOverride`, `FrmsOverrideAckNoteV1`, `FrmsDecisaoPolicy`.
- Helpers puros: `resolveNaturezaDado`, `resolveCausa`, `resolveMitigacao`, `resolveDecisao`, `resolveLimiteReferencia`, `buildDecisaoFields`.
- Override temporario: `sanitizeOverrideJustificativa`, `buildOverrideAckNote`, `parseOverrideAckNote`, helpers de storage em `override.ts`.
- Snapshot estendido: todos os itens retornam `natureza_dado`, `causa`, `mitigacao_recomendada`, `decisao`, `limite_referencia`.

## Endpoints criados

- `POST /api/frms/override/:eventId`
  - Autenticado.
  - Restrito a manager/admin.
  - Busca e atualiza somente `frms_read_ack_events` por `id` e `empresa_id`.
  - Grava auditoria `OVERRIDE_APPLIED`.
  - Retorna payload sanitizado, sem PII.

- `GET /api/frms/projection?data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD`
  - Reusa `listFrmsOperationalSnapshot`.
  - Mantem escopo self/team do snapshot.
  - Forca `natureza_dado = PROJECAO` em memoria.
  - Garante decisao maxima `ALERTA` para projecao.
  - Sem escrita.

## Migration

- Migration real: nao.
- Draft 0412: sim, em `docs/migration-0412-draft.sql`.
- Aplicada em producao: nao.
- Diretorio real de migrations: nao alterado.

## Seguranca tenant/RBAC

- Override nunca aceita `empresa_id` do body.
- Override consulta e atualiza com `WHERE id = ? AND empresa_id = ?`.
- EventId de outro tenant retorna 404.
- Student/instructor nao aplicam override.
- Sem fallback `empresa_id = 0`.
- Evidencia e ponteiro (`evidencia_ref`), nao conteudo sensivel inline.
- Justificativa rejeita conteudo obviamente sensivel como email, CPF, token, cookie, senha ou secret.

## Compatibilidade

- Campos existentes de `FrmsOperationalSnapshotItem` foram preservados.
- Contrato de `/api/frms/operational-snapshot` permanece aditivo.
- EVD, Escala Mensal, Minha Escala, Ficha 360 e Home nao foram alterados.

## Testes executados

- `npm run test:worker -- --run decision-policy operational-snapshot-extended override projection` — passou, 4 arquivos / 15 testes.
- `npm run test:worker -- --run operational-snapshot decision-policy override projection frms` — passou, 38 arquivos / 315 testes.
- `npm run test:worker -- --run evdFrmsBadges` — filtro sem arquivo correspondente no worker.
- `npm run test:run -- src/react-app/pages/escalas/__tests__/evdFrmsBadges.test.ts` — passou, 1 arquivo / 20 testes.
- `npx tsc --noEmit` — passou.
- `npm run lint` — passou.
- `npm run build` — passou.

## Riscos remanescentes

- Override formal em tabela propria ainda depende de migration futura autorizada.
- UX de override/mitigacao em EVD, Escala Mensal, Minha Escala, Ficha 360 e Central de Alertas fica para PRs futuros.
- Fixture cross-tenant empirico para override deve ser aprofundado quando houver tabela formal.
- DR/observabilidade especifica do novo contrato ainda pendente.

## Proximos PRs grandes

- Revisao Opus/Sonnet do PR-1.
- PR-2 EVD + publicacao mensal.
- PR-3 Minha Escala + Ficha 360.

SIGVOOS permanece NO-GO.

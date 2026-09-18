# conhecimento-ativo-foundation-0503

## Objective

Create the tenant-scoped data foundation for **Conhecimento Ativo**, a non-regulatory technical-knowledge reinforcement domain. It must remain independent from LMS completion, qualifications, certificates and regulatory training status.

## Scope

The change creates only additive tables, indexes and tenant-integrity triggers for:

- technical topic taxonomy;
- controlled technical sources and revisions;
- knowledge items;
- approved question variants and alternatives;
- fortnightly technical challenges;
- immutable question/source snapshots per challenge;
- pilot answers including declared confidence;
- individual retention/mastery state;
- participation XP events;
- standardized XLSX import batches and per-record lineage.

No qualification, certificate, enrollment or LMS completion row is created or modified.

## Technical-content governance

- A published knowledge item must have at least one source in status `VIGENTE`.
- Questions are draft/reviewed/approved independently.
- Superseding a source moves linked items to `REVISAO_NECESSARIA` and linked questions back to review in application code.
- Challenge snapshots preserve the exact question and source revision presented to the pilot.
- AI-generated content, when introduced later, remains draft until explicit human technical approval.

## Tenant and authorization

- Every operational table carries `empresa_id`.
- Cross-table inserts are guarded by tenant-consistency triggers.
- Runtime routes resolve the authenticated tenant and employee server-side.
- Pilot endpoints are restricted to the authenticated employee's own challenges.
- Content-management endpoints require manager/admin authorization in the first release.

## Migration sequencing

At branch creation, `origin/main` ended at migration 0500 while another isolated AirTrust worktree already contained a not-yet-integrated migration numbered 0501 for Controle de Voos. This change therefore uses 0502.

Before merge/apply, revalidate the migration tree on current `origin/main`:

1. If 0501 has been integrated, preserve 0502.
2. If another change has consumed 0502, renumber this change and regenerate this manifest/hashes.
3. Never merge duplicate migration numbers.

## Preflight

1. Confirm exact source SHA and current `origin/main`.
2. Confirm migration numbering and branch protection.
3. Run duplicate/no-go/operational SQL guards.
4. Validate the Schema V2 manifest hashes.
5. Capture the governed D1 recovery point required by the current Schema V2 workflow.
6. Verify expected prerequisite tables exist: `usuarios`, `funcionarios`, `aeronaves`, `funcionarios_aeronaves`, `modelos_aeronave`.

## Apply

Use the governed Schema V2 workflow for the target environment. Do not execute raw remote D1 SQL as a shortcut.

## Postconditions

Verify:

- all 13 `conhecimento_ativo_*` tables exist;
- unique/idempotency indexes exist;
- tenant guard triggers exist;
- no row changed in LMS/qualification/certificate tables;
- authenticated smoke can read an empty `/api/conhecimento-ativo/me` state for an eligible employee;
- approved-content generation fails closed when fewer than five valid questions exist.

## Rollback / compensation

This migration is additive. Routine rollback is application-first:

1. disable/remove the feature routes/UI;
2. stop creating new Conhecimento Ativo rows;
3. preserve accumulated learning evidence for audit/recovery.

Destructive table removal is not part of routine rollback and requires a separate reviewed schema change.

## Data initialization

The standard import contract is versioned (`1.0`) and imported content remains fail-closed: sources enter as `RASCUNHO`, items/questions enter as review state, and nothing is automatically published.

This schema change contains **no production technical seed data**. RFM/FCOM/QRH/SOP knowledge content must come from controlled company sources and pass technical approval before publication.

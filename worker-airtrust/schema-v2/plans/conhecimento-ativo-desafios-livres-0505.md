# conhecimento-ativo-desafios-livres-0505

## Objective

Evolve the Conhecimento Ativo challenge flow requested by the product owner: the employee explicitly chooses aircraft model and knowledge area, each challenge contains 10 questions from that area, and two challenges per fortnight remain the recommended cadence rather than a hard cap. Additional voluntary challenges remain available.

## Data model

The original `numero_desafio` column has a historical `CHECK(numero_desafio BETWEEN 1 AND 2)`. To avoid a non-atomic table rebuild in production, 0505 adds `numero_sequencial` as the canonical 1..N challenge ordinal, backfills it from existing rows, and moves the active uniqueness index to that canonical ordinal. The legacy `numero_desafio` column is retained for compatibility and receives `1` for the first challenge and `2` for the second and later challenges.

0505 also adds nullable `topico_id` to persist the user-selected knowledge area. Existing historical challenges remain valid with `topico_id = NULL`. New topic-scoped challenges are protected by tenant/topic validation triggers and an active lookup index.

A compatibility trigger backfills `numero_sequencial` if the pre-0505 Worker writes during the schema-to-Worker rollout window. No content-bank, answer, mastery, XP-event, challenge ID, tenant ID or employee ID is rewritten.

## Application behavior

- Entry offers AW139 and S-76 as separate study banks.
- After selecting a model, the employee chooses one published knowledge area/topic.
- The topic card exposes the quantity of valid approved questions and the employee's distinct-question coverage.
- New challenges contain exactly 10 questions from the selected topic, with one knowledge item at most once per challenge.
- Question selection prioritizes never-answered questions and uses previous questions only to complete a 10-question challenge when the remaining new pool is smaller than 10.
- Every selected question must have a non-empty explanation, one valid correct alternative, and at least one vigente technical source.
- An existing pre-release 5-question challenge is expanded to 10 before it is resumed; legacy challenges without a topic remain mixed-model-area compatible.
- Multiple topics may have pending challenges independently; selecting the same model/topic resumes its existing pending challenge.
- Completing two challenges remains the fortnight recommendation and keeps the existing one-time `QUINZENA_CONCLUIDA` bonus behavior.
- Challenge 3 and later are voluntary and continue sequentially while eligible content exists.
- The UI keeps the 2/2 recommendation indicator and makes extra challenges explicit.

## Safety / tenant isolation

All rows remain tenant-scoped. The original employee/tenant trigger is preserved. New topic references are validated against active topics in the same tenant. Topic/model consistency is also checked by the Worker before challenge generation.

## Rollout order

1. Verify exact `main` SHA and all required release gates.
2. Capture a D1 recovery point through Schema V2 governance.
3. Apply Schema V2 0505 and verify sequence/topic columns, backfill, uniqueness, topic index and tenant triggers.
4. Deploy Worker and Pages from the same approved SHA.
5. Verify model selection, topic selection, exact 10-question topic-scoped challenge generation, explanation persistence, and challenge number 3 after the recommended first two.

## Rollback / compensation

Use the captured D1 recovery point if the schema apply fails. After successful use of challenge 3+ or topic-scoped challenges, keep the additive 0505 schema even if application code is rolled back; legacy columns remain compatible with the previous Worker for challenges 1 and 2.

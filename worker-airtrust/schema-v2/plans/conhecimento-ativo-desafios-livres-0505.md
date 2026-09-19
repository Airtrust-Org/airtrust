# conhecimento-ativo-desafios-livres-0505

## Objective

Change the Conhecimento Ativo cadence requested by the product owner: each challenge contains 10 questions, while two challenges per fortnight remain the recommended cadence rather than a hard cap. After the recommended two, the employee may voluntarily generate additional challenges in the same fortnight.

## Data model

The original `numero_desafio` column has a historical `CHECK(numero_desafio BETWEEN 1 AND 2)`. To avoid a non-atomic table rebuild in production, 0505 adds `numero_sequencial` as the canonical 1..N challenge ordinal, backfills it from existing rows, and moves the active uniqueness index to that canonical ordinal. The legacy `numero_desafio` column is retained for compatibility and receives `1` for the first challenge and `2` for the second and later challenges. A compatibility trigger backfills `numero_sequencial` if the pre-0505 Worker writes during the schema-to-Worker rollout window.

No content-bank, answer, mastery, XP-event, challenge ID, tenant ID or employee ID is rewritten.

## Application behavior

- New challenges contain exactly 10 questions from distinct knowledge items.
- An existing 5-question challenge created before the release is expanded to 10 before it is resumed, without changing already answered questions.
- At most one challenge remains pending at a time; a DISPONIVEL/EM_ANDAMENTO challenge is resumed before another is created.
- Completing two challenges remains the fortnight recommendation and keeps the existing one-time `QUINZENA_CONCLUIDA` bonus behavior.
- Challenge 3 and later are voluntary and continue sequentially while eligible approved content exists.
- The API exposes the canonical sequential number to the UI.
- The UI keeps the 2/2 recommendation indicator, then presents `Fazer outro desafio` and states that extra challenges remain available.

## Safety / tenant isolation

All rows remain in the existing tenant-scoped table. The original tenant validation trigger is preserved. The active uniqueness index remains tenant + employee + aircraft + period scoped, now using the canonical sequential challenge number.

## Rollout order

1. Verify exact `main` SHA and all required release gates.
2. Capture a D1 recovery point through Schema V2 governance.
3. Apply Schema V2 0505 and verify backfill, uniqueness and compatibility trigger.
4. Deploy Worker and Pages from the same approved SHA.
5. Verify an existing short active challenge is expanded to 10, a fresh challenge contains 10 questions, and challenge number 3 can be generated after completing the first two.

## Rollback / compensation

Use the captured D1 recovery point if the schema apply fails. After successful use of challenge 3+, keep the additive 0505 schema even if application code is rolled back; the legacy columns remain compatible with the previous Worker for challenges 1 and 2.

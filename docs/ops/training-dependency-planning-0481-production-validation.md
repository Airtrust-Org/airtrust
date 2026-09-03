# Production validation notes — 0481

After the exact reviewed Schema V2 bundle is applied to production, validate read-only that the two new tables exist, all four runtime triggers exist, and company 6 has exactly one active `33 -> 106` rule with interval 6 months and `vigencia_inicio = 2026-08-31`. Do not create a synthetic production qualification just to exercise the trigger; runtime validation must remain non-invasive.

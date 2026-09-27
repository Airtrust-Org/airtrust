# qualification-expiry-email-stages-0515

## Objective
Guarantee two governed e-mail stages for qualification expiry: an advance warning at 45 days and the expiry-window entry alert at 30 days.

## Runtime contract
- `EMAIL / low / 45 days`: advance warning before the qualification enters expiry mode.
- `EMAIL / medium / 30 days`: alert when the qualification enters the 30-day expiry window.
- The Worker resolves the employee e-mail dynamically and includes every active manager of the employee's sector.
- Historical fixed recipients in `notificacoes_config` are fallback-only and never replace the employee/manager recipients.
- Each e-mail stage is delivered once per qualification-history record; an old delivery that did not include the employee does not suppress the corrected delivery.
- Existing 15-day and 7-day stages remain unchanged as later reinforcement stages.

## Data model
`notificacoes_config` remains global by the existing platform contract. This change does not add `empresa_id`, does not alter tenant-scoped notification logs, and does not create a parallel notification system.

The change reactivates an existing matching 45/30 e-mail configuration if present, otherwise inserts the missing configuration. It does not remove or rewrite WhatsApp/dashboard stages.

## Safety
- No employee data is written by the schema change.
- No cross-tenant data is queried or copied.
- The change is idempotent at the logical configuration level through `WHERE NOT EXISTS`.
- Runtime delivery continues to write tenant-scoped evidence to `notificacoes_log`.

## Rollout
1. Apply this Schema V2 change through the governed workflow on the exact reviewed SHA.
2. Publish the Worker from the same reviewed release SHA.
3. Verify 45-day and 30-day active e-mail configurations.
4. Validate one real expiring qualification through the normal scheduler/log path without exposing PII in CI output.

## Rollback
Capture the governed D1 recovery point before apply. If rollback is required after a successful apply, restore that recovery point or use a separately reviewed forward compensation that disables the new 45-day stage. Do not delete notification history.

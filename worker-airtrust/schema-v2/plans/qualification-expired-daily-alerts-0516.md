# qualification-expired-daily-alerts-0516

## Objective
Make qualification e-mail stages configurable per company and add the daily reminder for qualifications that are already expired.

## Runtime contract
- Global rows in `notificacoes_config` are product defaults only.
- A tenant may override a stage by `empresa_id + codigo + tipo`; the Worker prefers the tenant row and falls back to the global default.
- Administrators can configure activation, days-before, subject template, body template and frequency without a code change.
- Pre-expiry stages are evaluated as a configurable ordered band, so changing 45/30/15/7 to other values does not depend on hardcoded urgency boundaries.
- The governed change seeds missing 45/30/15/7 global defaults before assigning stable codes, so lean databases do not silently lose stages.
- `QUALIFICACAO_VENCIDA` applies only after expiry and defaults to `DAILY`, with at most one successful employee delivery per UTC calendar day.
- The employee and every active manager of the employee's organizational sector remain the dynamic e-mail recipients.

## Data model
Adds nullable `empresa_id`, stable `codigo`, `assunto_template`, `frequencia` and `intervalo_dias` to the existing notification configuration table. No parallel notification table is created.

## Safety
- Tenant overrides are isolated by `empresa_id` and a partial unique index.
- Global defaults are not writable by tenant administrators through the new tenant configuration route.
- No employee PII is written by this schema change.
- Notification evidence remains tenant-scoped in `notificacoes_log`.

## Rollout
1. Apply the prerequisite 0515 and this 0516 change through the governed path for the target environment, using the exact reviewed SHA. Staging may use the versioned classic-migration mirror only through its existing allowlisted recovery-point workflow; production uses Schema V2.
2. Publish the Worker and Pages from the same reviewed release SHA because both runtime and settings UI change.
3. Verify the new columns, corrected 30-day default and active expired default.
4. Validate tenant override read/write, health/version and the normal scheduler path.

## Rollback
Use the governed D1 recovery point captured before apply. A forward compensation may disable tenant overrides and the expired stage, but must not delete notification history.

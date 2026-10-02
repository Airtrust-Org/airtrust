# setor-compliance-responsibles-0526

## Objective
Separate two concepts that were previously coupled in AirTrust: operational access to a sector and organizational responsibility for receiving Training Compliance alerts.

## Canonical model
- `setores_gestores` remains the authority for the operational sector scope of the technical `GESTOR/MANAGER` role (displayed as **Administrador da Empresa**).
- `setores_responsaveis_compliance` becomes the tenant-scoped authority for the employee(s) responsible for a sector's Compliance escalation alerts.
- A responsible employee does not gain a user role, module permission or sector access by being assigned here.
- One sector may have multiple responsible employees; one employee may be responsible for multiple sectors.

## Runtime transition
The notification service first resolves explicit rows from `setores_responsaveis_compliance`. If a sector has not yet been explicitly configured, it temporarily falls back to the current operational-sector managers so the rollout does not silently stop existing escalation delivery. Once at least one explicit responsible exists for a sector, only the explicit responsible list is used.

## Safety
- New table only; no existing user, employee, role, permission, sector-access or training row is rewritten.
- Tenant triggers reject cross-company sector/employee links.
- The application layer accepts only active employees in the current tenant with a non-empty e-mail.
- Bulk replacement is audited and keeps the responsibility assignment independent from authentication/RBAC.

## Rollout
1. Apply this reviewed Schema V2 change in staging with a D1 Time Travel recovery point.
2. Deploy Worker + Pages from the same reviewed SHA.
3. Validate that `Acesso por Setor` still controls operational scope and `Responsáveis por Setor` controls only Compliance recipients.
4. Configure representative sectors and verify recipient resolution without changing the users' roles or accessible sectors.
5. Production requires explicit authorization for the exact merged SHA and this change ID, followed by the governed Schema V2 workflow and normal Worker + Pages release.

## Rollback
Use the D1 Time Travel recovery point if the schema apply itself fails. After a successful apply, application rollback may stop using the additive table. Do not drop it ad hoc; any structural reversal is a reviewed forward compensation.

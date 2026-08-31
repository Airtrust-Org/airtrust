# Qualification and LMS metric contract

This contract resolves audit issue #196. Metrics are reconciled by **business population and source**, not by forcing unrelated numbers to match.

## Canonical qualification surface

`/qualificacoes` is the canonical user-facing qualification status surface.

Its visible header counts come from `useQualificacoesHistorico`, backed by `GET /api/qualificacoes/historico` and the history route's status/renewal rules. The legacy `/qualificacoes/dashboard` route is compatibility-only and redirects to `/qualificacoes`; it must not reintroduce a second independently calculated qualification dashboard.

### Qualification record metrics

| Metric | Population | Canonical source | Meaning |
| --- | --- | --- | --- |
| Total | qualification history records in the caller's authorized scope after active-employee and status rules | `/api/qualificacoes/historico` stats | Current/selected qualification records, not people |
| Válidas | qualification records | `/api/qualificacoes/historico` stats | Current records outside the configured expiry-warning horizon or without expiry |
| Vencendo | qualification records | `/api/qualificacoes/historico` stats | Current records expiring inside the tenant-configured warning horizon |
| Vencidas | qualification records | `/api/qualificacoes/historico` stats | Current records whose effective expiry is before the operational date |
| Renovadas | historical qualification records | `/api/qualificacoes/historico` stats | Records with a real renewal successor according to the renewal contract |
| Planejadas | planned qualification records | `/api/qualificacoes/historico` stats | Active planned records; not completed qualifications |

The expiry-warning horizon is tenant configuration (`empresas_config.dias_alerta_vencimento`), default 30 days and allowed from 1 to 365 days. User-facing qualification labels therefore must not claim a fixed 30-day horizon unless the displayed value itself is explicitly fixed to 30 days.

## Main operational dashboard

The main dashboard is an operational decision surface, not a duplicate qualification dashboard. It may present two different populations and must label them accordingly:

- `qualificacoesVencidas` / `qualificacoesAVencer`: **qualification records**.
- `tripulantesComQualificacoesVencidas` / `tripulantesComQualificacoesVencendo`: **distinct active people** with at least one matching current qualification.
- “Sem qualificação vencida” is a **people percentage** derived from active people, not a qualification-record compliance percentage.

A count of people is not expected to equal a count of qualification records. One person can hold multiple qualification records.

## LMS metrics

LMS metrics describe the learning platform population and are intentionally independent from qualification validity:

| Metric | Population | Meaning |
| --- | --- | --- |
| Cursos | LMS courses | Course catalog records |
| Matrículas | LMS enrollments | Employee-course enrollment records |
| Concluídos | LMS enrollments | Enrollments with completion status |
| Em andamento | LMS enrollments | Enrollments currently in progress |
| Taxa de conclusão | LMS enrollments | Completion rate over the LMS enrollment denominator used by the endpoint |
| Qualificações geradas | qualification links created by LMS completion | Cross-module integration outcome, not total valid qualifications |

Completing an LMS enrollment can generate or link a qualification, but `LMS concluídos` must never be presented as equivalent to `qualificações válidas`, `vencendo`, or `vencidas`.

## Loading and failure contract

- Loading is not zero.
- Query failure is not zero.
- Empty successful data may be zero.
- A surface must not substitute a second endpoint merely because the canonical endpoint is loading or failed.

## Compatibility rules

- `/qualificacoes/dashboard` remains a safe deep link and redirects to `/qualificacoes`.
- `/dashboard/qualificacoes` may remain as a backend compatibility endpoint for non-canonical consumers, but it is not a second user-facing source of truth.
- New qualification status UI must consume the canonical history contract or an explicitly documented shared aggregate derived from the same rules.

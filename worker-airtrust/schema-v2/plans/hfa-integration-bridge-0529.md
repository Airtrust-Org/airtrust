# hfa-integration-bridge-0529

## Objective
Add a reversible tenant-scoped bridge from AirTrust SGSO to HFA without coupling databases or automatically exporting Safety reports.

## Canonical model
- `integracoes_hfa_config` stores one HFA endpoint and encrypted API token per AirTrust company.
- `integracoes_hfa_eventos` stores only link/synchronization metadata between a RELPREV and an HFA event.
- The raw HFA token is encrypted by the Worker and is never returned by read APIs or written to logs/audit payloads.
- HFA is the authority for HFA/SERA analysis; AirTrust remains the authority for RELPREV operational workflow.

## Safety and privacy controls
- Transmission occurs only after an authorized admin/manager explicitly selects **Enviar ao HFA**.
- Sync registers/updates the event only; it never starts HFA analysis and never consumes HFA credits.
- Anonymous reports are transmitted with `CONFIDENTIAL` classification.
- Tenant triggers reject cross-company RELPREV links.
- Once HFA analysis starts, HFA itself locks source narrative updates from the integration bridge.

## Rollout
1. Apply in staging through the governed D1 recovery-point workflow.
2. Configure `HFA_INTEGRATION_ENCRYPTION_KEY` and one HFA tenant token.
3. Sync one non-sensitive RELPREV, repeat sync to prove idempotency, then refresh HFA status.
4. Confirm the HFA event is untriaged and consumed zero analysis credits.
5. Production requires the exact merged SHA, governed schema apply, Worker/Pages release and smoke validation.

## Rollback
Disable the HFA connection or deploy the previous Worker/Pages build. The additive tables may remain unused. Any structural reversal must be a reviewed forward compensation.

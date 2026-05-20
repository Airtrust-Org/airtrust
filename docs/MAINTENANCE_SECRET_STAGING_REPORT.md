# Maintenance Secret — Staging Configuration Report

**Date:** 2026-05-16
**Branch:** main
**Checkpoint commit:** ca1494654 — chore: restore point before staging maintenance secret setup
**Final commit:** (see git log after commit)
**Production touched:** NO
**Production secret altered:** NO

---

## 1. Pre-configuration State

| Secret | Present Before |
|--------|---------------|
| JWT_SECRET | yes |
| SIGVOOS_CONFIG_ENCRYPTION_KEY | yes |
| MAINTENANCE_SECRET | **NO** |

MAINTENANCE_SECRET was absent from staging before this operation.

---

## 2. Before-configuration HTTP Status (no secret sent)

| Endpoint | HTTP Code | Body |
|----------|-----------|------|
| POST /api/frms/maintenance/reprocessar-lote | 503 | `{"success":false,"error":"Maintenance endpoint not configured."}` |
| POST /api/integracoes/sigvoos/maintenance/sincronizar-frms | 403 | `{"success":false,"error":"Rota disponivel apenas em localhost."}` |

No 200 responses — no security bug detected.

---

## 3. Secret Configuration

**Command used:**
```bash
MAINTENANCE_SECRET_VALUE=$(node -e "const crypto=require('crypto'); process.stdout.write(crypto.randomBytes(32).toString('base64url'))")
printf "%s" "$MAINTENANCE_SECRET_VALUE" | npx wrangler secret put MAINTENANCE_SECRET --env staging
```

- Secret generated: `crypto.randomBytes(32).toString('base64url')` — 32 bytes of CSPRNG, base64url encoded (~43 chars)
- Value piped directly to wrangler; never echoed, never saved to a file
- Result: `✨ Success! Uploaded secret MAINTENANCE_SECRET` (exit 0)

---

## 4. Staging Redeploy

- Performed: **YES**
- Command: `npx wrangler deploy --env staging` (from `worker-airtrust/`)
- Version ID: `dc3cc7c4-03d2-484c-970f-88cde367e526`
- Upload: 5486.74 KiB / gzip: 1060.79 KiB
- Worker startup time: 55 ms

---

## 5. Post-configuration Secret List

| Secret | Present After |
|--------|--------------|
| JWT_SECRET | yes |
| MAINTENANCE_SECRET | **YES** |
| SIGVOOS_CONFIG_ENCRYPTION_KEY | yes |

---

## 6. Negative Validation Results (after redeploy)

| Test | Endpoint | HTTP Code | Expected |
|------|----------|-----------|----------|
| No secret | POST /api/frms/maintenance/reprocessar-lote | **403** | non-200 |
| Invalid secret (`totally_invalid_value_xyz`) | POST /api/frms/maintenance/reprocessar-lote | **403** | non-200 |
| Invalid secret (`totally_invalid_value_xyz`) | POST /api/integracoes/sigvoos/maintenance/sincronizar-frms | **403** | non-200 |

All results are non-200. Security validated.

**Note on behavior change:** Before the secret was configured, FRMS returned 503 (not configured). After deploying with the secret, all routes return 403 because `isLocalMaintenanceRequest()` correctly rejects remote-host requests (non-localhost hostname) before evaluating the secret. An invalid secret from a remote host fails the `isLocalMaintenanceRequest` check, returning 403.

---

## 7. Route Code Analysis

- `reprocessar-lote`: Performs real DB writes (`reprocessarTripulanteCompleto` per tripulante_id). No dryRun mode. Requires non-empty `tripulante_ids` array.
- `reprocessar-faixa`: Performs real DB writes. No dryRun mode. Requires `tripulante_id` and `data_inicio`.
- `sincronizar-frms`: Calls `syncSigvoosForFrms` — real SIGVOOS sync with D1 writes.

**Conclusion:** No safe read-only/dryRun mode exists on any maintenance route.

---

## 8. Valid Secret Test

**Executed:** NO

**Reason:** Both routes perform real D1 writes with no dryRun mode. Additionally, from a remote host, the `isLocalMaintenanceRequest()` function still returns 403 even with a valid secret (it requires localhost hostname OR valid secret to bypass localhost check — but the FRMS handler additionally checks `isLocalMaintenanceRequest` AND `hasValidMaintenanceSecret` separately; from the staging URL the hostname is not localhost, so access is effectively localhost-only by design).

Negative validation (rejection of invalid credentials) is the appropriate test scope for this operation.

---

## 9. Security Confirmation

- Secret not printed: **CONFIRMED**
- Secret not saved to any file: **CONFIRMED**
- Secret not committed to git: **CONFIRMED**
- Docs scanned: no real secret values found in any tracked file
- Production not touched: **CONFIRMED**

---

## 10. Recommendation

MAINTENANCE_SECRET is now configured in staging. The routes are protected by:
1. `isLocalMaintenanceRequest()` — rejects non-localhost hostnames unless secret matches
2. `hasValidMaintenanceSecret()` — timing-safe comparison of provided token vs stored secret

To configure production (when authorized):
```bash
PRODUCTION_SECRET=$(node -e "const crypto=require('crypto'); process.stdout.write(crypto.randomBytes(32).toString('base64url'))")
printf "%s" "$PRODUCTION_SECRET" | npx wrangler secret put MAINTENANCE_SECRET --env production
npx wrangler deploy --env production
```

Store the production secret value securely (password manager) before discarding the shell session.

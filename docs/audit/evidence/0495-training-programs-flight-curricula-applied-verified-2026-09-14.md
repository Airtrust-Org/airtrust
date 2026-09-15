# 0495 — Training Programs and Flight Curricula — production applied and verified

## Production identity

- Change: `training-programs-and-flight-curricula-0495`
- Source SHA: `b0e7d1f1f5d72d8e9160010382e28716f0df4dd3`
- PR: `#711`
- Schema apply workflow: `34909680247` — `SUCCESS`
- Production deploy workflow: `34910021276` — `SUCCESS`
- External health workflow: `34911981342` — `SUCCESS`

## Governed schema apply

The Schema V2 workflow validated the exact `main` SHA, built the reviewed 0495 bundle, captured the D1 Time Travel recovery point, applied schema plus governance ledger atomically, and completed successfully.

The migration itself contains a fail-closed post-guard. Because the governed apply completed successfully, the following production invariants were true at commit time:

- G1/AW139 has distinct Initial and Periodic programs;
- G2/S-76 has distinct Initial and Periodic programs;
- AW139 Initial has exactly 12 ordered curriculum sessions;
- S-76 Initial has exactly 12 ordered curriculum sessions;
- G1 Periodic retains 12 cycle rows across C1/C2/C3;
- G2 Periodic retains 9 cycle rows across C1/C2/C3;
- G1-SEM retains 6 cycle rows;
- G2-SEM has exactly 2 semiannual sessions;
- CRM D3 has distinct Initial and Periodic programs.

## Runtime deployment

`Deploy AirTrust` completed with Worker, Pages and Worker/Pages parity all `SUCCESS` on the same source SHA. Production reported version `2026-09-14T23:42:07Z-b0e7d1f` during the subsequent read-only release probe.

The external production health monitor then completed `SUCCESS`, confirming the public health endpoint remained healthy after deployment.

## Supplemental read-only diagnostics

`Production Release Readonly Preflight` run `34911637617` verified the production source SHA, production schema structural readiness, authorization authority, qualification-renewal readiness and FRMS readiness. Its overall verdict was blocked only by `STAGING_RELEASE_SHA_MISMATCH`: staging was still on `f578b6c78a70bc79c9cd8e667b8f60dfc592e034` while production was on the newer 0495 release SHA. This is a staging provenance mismatch, not a production schema/runtime failure.

`Production Simulator 0490 Read-Only Preflight` run `34911639396` is a pre-apply readiness workflow for 0490. It failed at its expected-unapplied assertion because 0490 is already present in production; it is not a valid post-deploy smoke for 0495 and does not indicate a 0495 regression.

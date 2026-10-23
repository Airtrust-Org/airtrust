# F5 inactive SCORM candidate executor

`scripts/staging/f5-inactive-candidate-executor.mjs` is the orchestration core
for exactly one inactive staging candidate. Its I/O is dependency-injected so
the complete state machine can be exercised with local fakes and fault
simulation; the executor itself does not access GitHub, Worker, D1 or R2.

## Required adapter boundary

An authorized runner must provide all methods below. Worker calls must use the
authenticated, tenant-scoped F5 endpoints; no adapter may issue direct D1/R2
writes. The F0 QA adapter must be supplied by the governed staging setup and
must return Worker-produced receipts, not client assertions.

- `verifyAuthorization(plan)`: recheck the exact fresh F0 grant, one candidate,
  shared mutex and prohibited activation/certification scope.
- `readRuntimeProvenance()`: prove Worker and Pages equal `releaseSha`, and the
  harness equals `harnessSha`. The Worker reports the full SHA; Pages reports
  only its 7-character stamped prefix, which is checked as an exact suffix.
- `verifyF0Receipts(plan)`: verify the synthetic enrollment, cycle, run,
  approval, provisioning, recovery and cleanup receipts.
- `beginIntake`, `putIntakePart`, `completeIntake`, `abortIntake`, and
  `resolveAmbiguousIntake`: use Worker multipart routes; each part is at most
  8 MiB and the original ZIP is re-hashed before and during upload.
- `readCandidateD1` and `readCandidateR2`: prove tenant/course/SHA, validated
  inactive state, candidate prefix and launch asset digest.
- `readQaEvidence` and `runSyntheticCandidate`: use the protected Worker
  readback and a candidate-bound synthetic enrollment. The observed execution
  must match the candidate SHA and must not complete the course, attempt or
  approve an assessment, create a qualification, or issue a certificate.
- `recoverSyntheticCandidate`, `cleanupSyntheticCandidate`, and
  `removeFailedCandidate`: return verified receipts. Successful cleanup keeps
  the validated candidate inactive; failed-run cleanup may remove only the
  operation-owned candidate.

The readiness workflow invokes the executor only after its exact grant and
provenance guards. It requires a private plan and ZIP path plus a SHA-pinned F0
adapter module supplied by the protected staging environment. The F0 module
must provide receipt verification, candidate-bound synthetic execution,
recovery, cleanup, failed-candidate cleanup, and ambiguous-intake resolution.
The repository currently has no such provisioned module. The preview-only
candidate route cannot substitute for it. The workflow never calls the state
machine with mocks; offline mocks are used only by contract tests.

`scripts/staging/f5-worker-adapters.mjs` binds the core to the authenticated
multipart Worker endpoints, candidate version listing, short-lived candidate
asset session/readback, and protected D1 QA readback. Candidate QA responses
use the Worker canonical keys `empresaId` and `cursoId`; the adapter checks
them before normalizing to the executor's `tenantId` and `courseId`. Version
listing returns the same tenant/course keys from the tenant-filtered D1 row.
The Worker creates candidate
`packageId` independently of intake `operationId`, so ownership is established
from the streamed intake response markers and exact SHA/scope readbacks rather
than assuming those IDs are equal.

The remaining staging prerequisites are operational: mount the private plan
and ZIP source on the runner; supply the pinned F0 adapter module and its
SHA-256; provision the protected staging access and QA readback secrets; and
provide F0-issued single-candidate grant, receipt verifier, synthetic
candidate-bound execution, ambiguous-intake resolution, and recovery/cleanup
callbacks. Without any one of these, the workflow exits before treating the
candidate as verified. No staging D1/R2 write was run by the local tests.

```sh
node --test scripts/__tests__/f5-inactive-candidate-executor.test.mjs
```

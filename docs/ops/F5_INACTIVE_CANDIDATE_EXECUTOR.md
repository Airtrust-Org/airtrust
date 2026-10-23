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
  harness equals `harnessSha`.
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

The readiness workflow remains fail-closed while any adapter, private package
source, exact release runtime, secret, F0 grant or receipt is unavailable. The
current repository has no F0 candidate-bound commit/provision/recovery adapter;
the preview-only candidate route cannot substitute for one. The workflow must
not call this state machine with mocks. Offline mocks are used only by the
contract tests below.

```sh
node --test scripts/__tests__/f5-inactive-candidate-executor.test.mjs
```

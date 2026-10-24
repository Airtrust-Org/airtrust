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
The repository now includes the reviewed F0 adapter at
`scripts/staging/f5-f0-adapters.mjs` (integrated by PR #1743). The preview-only
candidate route cannot substitute for its real Worker-backed callbacks. The workflow never calls the state
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

The workflow now provides a **fail-closed private mount step** immediately after
the GitHub F0 authorization guard and before the executor preflight. GitHub
staging Environment secret `F5_EXECUTOR_PLAN_B64` (base64-encoded private
one-candidate JSON plan) is decoded only inside `${{ runner.temp }}`.
The executable F0 adapter is copied from the reviewed `scripts/staging/f5-f0-adapters.mjs`
file in the exact trusted-main checkout, with its computed SHA-256 pinned to
the runner-local copy. No private `F5_F0_ADAPTER_B64` secret or external path
variable is needed.
Exclusive creation, owner-only permissions and unconditional cleanup protect
the runner-local files. Empty, changed or missing values fail before ZIP
materialization and before any remote D1/R2 write. The previous unusable
path-only variables `F5_EXECUTOR_PLAN_PATH` and `F5_F0_ADAPTER_MODULE` are
not required from the Environment.

**This bridge does not create an authorization grant, private plan or QA
credentials.** The versioned F0 adapter implements the Worker-backed receipt
verifier, candidate-bound synthetic execution, ambiguous-intake resolution
and recovery/cleanup callbacks. The F5 staging QA path exercises **Chromium
and WebKit** for the same inactive ZIP SHA and synthetic enrollment/cycle;
only their combined authenticated readback can satisfy the executor and
its sanitized audit summary. Staging also still requires `SCORM_QA_ACCESS_TOKEN` and
`SCORM_QA_READBACK_SECRET`, along with the authorized synthetic tenant,
enrollment/cycle and fresh, immutable single-candidate grant. The original
ZIP #15 continues to use the already protected two-secret bridge. Do not
place secrets or private adapter source in GitHub comments, repository files
or runner logs. Without all required inputs the workflow exits before
treating the candidate as verified. Tests use temporary local fixtures;
no staging D1/R2 writes have been executed by this bridge.

```sh
node --test scripts/__tests__/f5-inactive-candidate-executor.test.mjs
```

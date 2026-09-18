# AirTrust Work Front Handoff

Copy this block into a GitHub issue/PR or a temporary tracked handoff document when a front must be continued by another session.

```text
FRONT:
SCOPE:
BRANCH:
HEAD_SHA:
BASE_MAIN_SHA:

OWNER_MODULES:
-

ROOT_CAUSE:

CHANGES:
-

TESTS_PASS:
-

TESTS_PENDING:
-

STAGING:
not_required | pending | pass | fail

PRODUCTION_AUTH:
none | authorized_exact_sha:<sha>

DEPLOY_RUN:

POSTDEPLOY:

BLOCKERS:
-

NEXT_ACTION:
-
```

## Handoff rules

- Record repository evidence, not conversational assumptions.
- Use exact SHAs for test, staging and release claims.
- Do not copy credentials, tokens or secrets into the handoff.
- Keep independent fronts in independent branches/PRs.
- A completed PR/release should leave enough evidence for a later session to verify what actually happened without reopening the original chat.

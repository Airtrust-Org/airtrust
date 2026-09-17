# AirTrust — Agent Development Workflow

**Goal:** reduce task latency, repeated discovery and cross-front conflicts while preserving the production safety contract in `AGENTS.md` and `docs/PRODUCTION_DEPLOY_RUNBOOK.md`.

## 1. Canonical working model

- **Code/state authority:** GitHub `Airtrust-Org/airtrust`, with `main` as the canonical integration branch.
- **Primary interactive development environment:** ChatGPT Desktop in **Codex** mode with a local clone of this repository.
- **UI validation:** ChatGPT Desktop built-in browser for localhost, staging and targeted production validation when authorized.
- **Cloud/browser agents:** use only when a task materially benefits from delegated web navigation. They are not the default coding environment.
- **Conversation history is not project state.** Durable state belongs in GitHub: branch, PR, issue/work-front note, CI evidence and release evidence.

## 2. Start every coding task from repository state

Before editing:

```bash
git fetch origin main --prune
bash scripts/agent-context.sh
```

Then inspect:

1. current `main` and recent commits;
2. open/active PRs touching the same module when relevant;
3. `AGENTS.md`, `CLAUDE.md` and the applicable runbook;
4. the exact module files and existing tests;
5. staging/production provenance only when the task requires runtime validation.

Do not reconstruct the current pipeline, schema or release status from an old conversation.

## 3. One front, one branch

Use a dedicated branch for each independent front:

```text
fix/<module>-<problem>
feat/<module>-<change>
chore/<topic>
```

Parallel fronts must not share an ad-hoc worktree. Never reset, clean, stash or overwrite unrelated changes. Coordinate through GitHub commits/PRs rather than terminal state held only on one machine.

## 4. Fast diagnostic loop

Use the narrowest loop that proves the change:

```text
reproduce
→ identify owning frontend/backend files
→ focused change
→ focused test
→ affected suite
→ official CI
→ staging only when runtime/integration evidence is required
→ production only after exact-SHA authorization
```

Rules:

- Do not rerun evidence that is already PASS for the same SHA unless a later change invalidated it.
- After two substantially identical failures, change method.
- Prefer code/search/test evidence over repeated manual clicking.
- Convert repeated browser regressions into Playwright or another automated test when practical.
- Keep browser testing focused on behavior that cannot be proven reliably by unit/integration tests.

## 5. Desktop browser usage

Use the built-in browser when testing:

- `http://localhost:3000` frontend;
- local Worker/API;
- staging UI;
- authorized production smoke/real-case validation.

For debugging JavaScript/network/state, enable the Desktop browser developer/CDP access when needed. Do not expose secrets in chat. Staging identities remain governed by the GitHub Environment contract in `AGENTS.md`.

Use the regular browser (Brave/Chrome) for ordinary human browsing, unrelated tabs and sessions that do not need agent interaction.

## 6. Durable work-front handoff

Each substantial front should keep, in its PR body or linked issue, at minimum:

```text
FRONT:
SCOPE:
BRANCH:
HEAD_SHA:
BASE_MAIN_SHA:
OWNER_MODULES:
ROOT_CAUSE:
CHANGES:
TESTS_PASS:
TESTS_PENDING:
STAGING:
PRODUCTION_AUTH:
DEPLOY_RUN:
POSTDEPLOY:
BLOCKERS:
NEXT_ACTION:
```

Use `docs/ops/WORK_FRONT_TEMPLATE.md` when a standalone handoff note is useful.

This lets another session continue from repository evidence instead of replaying a long chat.

## 7. Release path

Production remains governed by `docs/PRODUCTION_DEPLOY_RUNBOOK.md`.

The optimized workflow does **not** change these boundaries:

- no direct push to `main`;
- no bypass of required gates;
- no production migration/data write without scoped authorization;
- authorization remains exact-SHA and scope-specific;
- Cloudflare workflow is the production path;
- validate the deployed version and the real case after release.

## 8. Where each tool fits

| Need | Preferred surface |
|---|---|
| Understand/change code | Desktop Codex + local repository |
| Search current canonical source | GitHub |
| CI/PR coordination | GitHub |
| Local UI inspection | Desktop built-in browser |
| Repeatable regression | automated test / Playwright |
| Staging release | governed GitHub workflow |
| Production release | governed GitHub workflow |
| Long web-only delegated task | Work, selectively |
| Ordinary browsing | Brave/Chrome |

The target is to minimize tool switching, not maximize the number of tools in use.

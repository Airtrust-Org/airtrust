# AIRTRUST — Git Worktree & Release Hygiene Policy (2026-06-24)

Status: **ACTIVE POLICY**
Scope: Ops / git hygiene only. Does not change any product behavior.

This policy exists because worktree sprawl (peaked at 59 registrations, sanitized to
13 on 2026-06-23) repeatedly caused confusion about *which* tree was the source of
truth for a release. The goal is a single, predictable flow.

Companion documents:
- `docs/AIRTRUST_RELEASE_OPERATIONS_POLICY_20260624.md` — deploy preflight/smoke policy.
- `docs/AIRTRUST_PAGES_RELEASE_RECOVERY_20260623.md` — the incident that motivated the secret split.
- `scripts/ops-worktree-audit.sh` — the read-only auditor that enforces this doc.

---

## 1. Where to create worktrees

- Prefer one of:
  - `.worktrees/<ticket-or-pr>` inside the repo, or
  - `/Users/filipedaumas/SAAS/Airtrust-worktrees/<ticket>`.
- **Avoid `/private/tmp`** for any work that may outlive a single session. Temp
  worktrees there are the main source of orphaned, unclassified trees.
- Agent-managed worktrees under `.claude/worktrees/` are owned by the harness and
  cleaned automatically; do not hand-edit them.

## 2. Mandatory naming

Every manually created worktree branch MUST match one of:

- `pr-<numero>-<tema>`        — work tied to a specific PR.
- `incident-<data>-<tema>`    — incident / hotfix response (`<data>` = `YYYYMMDD`).
- `ops-<tema>`                — operational / pipeline / hygiene work.

Examples: `pr-150-cf-debug`, `incident-20260623-pages-token`, `ops-cloudflare-secrets`.

## 3. Required metadata per worktree

Each worktree must have a clear:

- **branch** (named per §2),
- **objective** (one line),
- **owner / agent**,
- **date created**,
- **status** (active / blocked / ready-to-merge / ready-to-remove).

Keep this in the PR description or the incident/ops report committed to the main repo.
`scripts/ops-worktree-audit.sh` reconstructs branch, clean/dirty, merged, untracked,
and last-activity automatically; the human-supplied objective/owner lives in the report.

## 4. Closing a PR / worktree

When a PR is done:

1. Confirm the branch is actually merged into `origin/main`.
2. Save the closing report into the **main repo** (`docs/...`), not only in the worktree.
3. If the worktree has a local diff, archive a patch first:
   `git -C <worktree> diff > docs/worktree-archive/<YYYYMMDD>/<name>.patch`.
4. Remove the worktree: `git worktree remove <path>`.
5. Run `git worktree prune`.

Never delete a worktree that has **unclassified** local changes without archiving a patch.

## 5. Standing limits

At any time keep at most:

- the **main repo** checkout;
- **one** deploy/main worktree (e.g. `Airtrust-wt-main-deploy`);
- **one** active worktree per incident/ops effort.

Anything beyond that should be audited and either merged, archived, or removed.

## 6. Prohibited

- Worktree without a clear branch (detached / ad-hoc names).
- Worktree with forgotten, uncommitted local changes left across sessions.
- **Deploying from a dirty worktree.** Releases come from a clean tree at the
  intended commit only.
- A single PR mixing fronts (feature + pipeline + docs + emergency hotfix).
  Split them; the only exception is a documented release train.

## 7. How to audit (routine)

```bash
# Read-only audit of every worktree (default):
scripts/ops-worktree-audit.sh

# Show the SAFE removal plan (clean + merged only), still a dry-run:
scripts/ops-worktree-audit.sh --prune-merged-clean

# Apply ONLY the safe removals (re-checks clean state at execution time):
scripts/ops-worktree-audit.sh --prune-merged-clean --execute
```

The script never removes a dirty worktree, never removes one with untracked files,
and never removes anything without the explicit `--execute` flag. Dirty/unclassified
trees are reported as `archive-patch` or `review`, never as `remove`.

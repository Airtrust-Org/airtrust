# AIRTRUST_REPOSITORY_SANITIZATION_20260714

Date: 2026-07-14

## Scope

- Objective: non-destructive repository inventory before the main audit.
- Visibility confirmed: public (`airtrustsystem-alt/airtrust`).
- Remote confirmed: `origin git@github.com:airtrustsystem-alt/airtrust.git`.
- Base audited after fetch: `origin/main` at `22bd96b229f078d28ebca7e298ad543811f6cc53`.
- No destructive cleanup was executed.

## Initial Inventory

- Current dirty worktree at start: `<HOME>/SAAS/Airtrust`
- Current branch at start: `codex/hotfix-shared-session-view-regression`
- HEAD at start: `ffe76d3acd057d5ea46bf4f1f0dced844d366f60`
- `origin/main` before fetch: `eec6090d3c55644c962a7740c2b3a4d812f9ee09`
- Divergence at start (`origin/main...HEAD`): `15` ahead, `1` behind
- Staged files at start: none observed
- Unstaged tracked files at start: 18
- Untracked files at start: 15
- Stashes observed: 6
- Worktrees observed before isolation: 13
- Worktrees after creating isolated audit branch: 14

## Worktree Classification

- `MANTER_ATIVA`
- `<HOME>/worktrees/airtrust-scalability-baseline-20260714`
  Branch: `audit/airtrust-scalability-baseline-20260714`
  HEAD: `22bd96b229f0`
  State: clean
  Decision: active isolated worktree for this audit

- `MANTER_COM_PENDENCIA`
- `<HOME>/SAAS/Airtrust`
  Branch: `codex/hotfix-shared-session-view-regression`
  HEAD: `ffe76d3acd05`
  State: dirty (`18` tracked modifications, `15` untracked)
  Decision: preserve; mixed work from another active front

- `/private/tmp/airtrust-fix-fichas`
  Branch: `main`
  HEAD: `1f7cb3a930c8`
  State: clean
  Decision: preserve conservatively; ownership/process usage not proven

- `/private/tmp/airtrust-main-283-review`
  Branch: detached
  HEAD: `4c33d5908ae8`
  State: clean
  Decision: preserve conservatively; detached review worktree without ownership proof

- `/private/tmp/airtrust-main-304`
  Branch: detached
  HEAD: `9aa1984d5a00`
  State: clean
  Decision: preserve conservatively; detached review worktree without ownership proof

- `/private/tmp/airtrust-pr306-SE3IpK`
  Branch: `codex/fix-shared-session-model-hydration`
  HEAD: `80e743c36c30`
  State: clean
  Decision: preserve; linked to a named hotfix branch

- `<HOME>/SAAS/Airtrust-worktrees/airtrust-abab-pto-parity-20260714`
  Branch: `codex/airtrust-abab-pto-parity-20260714`
  HEAD: `eec6090d3c55`
  State: dirty (`2` tracked modifications)
  Decision: preserve; unpublished local changes

- `<HOME>/SAAS/Airtrust-worktrees/fix-schema-contract-production-parser-20260714`
  Branch: `codex/fix-schema-contract-production-parser-20260714`
  HEAD: `4c64fe418242`
  State: clean
  Decision: preserve; corresponds to merged PR #318 lineage

- `<HOME>/SAAS/Airtrust-worktrees/harden-shared-session-ficha-generator-20260714`
  Branch: `codex/fix-shared-session-generator-schema-20260714`
  HEAD: `5bb24d24c5b7`
  State: clean
  Decision: preserve; corresponds to merged PRs #315/#316 lineage

- `<HOME>/SAAS/Airtrust-worktrees/instructor-training-and-ficha-header-20260714`
  Branch: `codex/instructor-training-and-ficha-header-20260714`
  HEAD: `7cbd2f448063`
  State: clean
  Decision: preserve; branch purpose remains potentially active

- `<HOME>/SAAS/Airtrust-worktrees/prod-release-ebde2cdc-20260714`
  Branch: detached
  HEAD: `ebde2cdc1b30`
  State: clean
  Decision: preserve conservatively; release-related detached worktree

- `<HOME>/SAAS/Airtrust-worktrees/schema-baseline-v2-20260714`
  Branch: `codex/schema-baseline-v2-20260714`
  HEAD: `5cb59cec9bfa`
  State: clean
  Decision: preserve; corresponds to merged PR #317 lineage

- `<HOME>/SAAS/Airtrust-worktrees/shared-session-fichas-release-466a71b5`
  Branch: `codex/fix-shared-ficha-generator-tenantless-simulator-v2-20260714`
  HEAD: `40e4ef2d9248`
  State: clean
  Decision: preserve; linked to open PR #313 lineage

- `<HOME>/SAAS/Airtrust-worktrees/simuladores-curriculo-remote-apply-20260713`
  Branch: `codex/simuladores-curriculo-remote-apply-20260713`
  HEAD: `51695c3b6d49`
  State: clean
  Decision: preserve; linked to open PR #305

- `<HOME>/SAAS/Airtrust-worktrees/simuladores-curriculo-sonnet`
  Branch: `codex/simuladores-composicao-curricular-sonnet-20260713`
  HEAD: `8bc7dd3446af`
  State: clean
  Decision: preserve; linked to merged PR #304 lineage

## Governance Signals

- `main` branch protection via GitHub branch protection API: not enabled (`404 Branch not protected`)
- `CODEOWNERS`: absent on `origin/main`
- Public repo visibility increases the bar for sanitization and guardrails

## PR / Branch Signals

- Open PRs relevant to this incident set:
  - `#305` `codex/simuladores-curriculo-remote-apply-20260713` — open, checks green, but operationally incompatible with current no-write/no-remote-apply stance
  - `#313` `codex/fix-shared-ficha-generator-tenantless-simulator-20260714` — open, dirty merge state, superseded by later merged fixes
- Merged PRs relevant to the current production baseline:
  - `#315`
  - `#316`
  - `#317`
  - `#318`

## Commit Provenance On `main`

The following recent commits on `main` were verified as `merge_commit_sha` values of squash-merged PRs via the GitHub API:

- `1f7cb3a930c8` from PR `#308`
- `466a71b58130` from PR `#311`
- `825e631167aa` from PR `#312`
- `eec6090d3c55` from PR `#317`
- `22bd96b229f0` from PR `#318`

Because this repository uses squash merge, commit message shape alone is not sufficient to classify a commit as a direct push to `main`. No direct-push bypass should be declared without separate evidence beyond the commit subject/body format.

The governance risk remains the absence of branch protection and CODEOWNERS, which weakens preventive controls even when recent critical commits do appear to have PR provenance.

## Sensitive Artifact Scan

- No secrets or credentials were intentionally opened.
- No `.env`, `.dev.vars`, dumps, SQLite files, exported cookies, or production payload files were added to the audit worktree.
- Existing repository clutter outside this audit worktree remains out of scope and preserved.

## Backups / Removal / Prune

- Backups created: none
- Worktrees removed: none
- References pruned: none
- Local branches removed: none
- Remote branches removed: none

## Final State For Audit Start

- Isolated audit branch: `audit/airtrust-scalability-baseline-20260714`
- Isolated audit worktree state before code/doc edits: clean
- No `reset --hard`, `git clean -fdx`, `rm -rf`, forced worktree removal, or remote deletion was used

## Residual Risks

- Multiple preserved worktrees remain unclassified beyond conservative retention because active process ownership was not proven.
- `main` lacks branch protection and CODEOWNERS.
- Open superseded PRs still exist and can confuse operational decision-making.

## Verdict

- GO to start the main audit from the isolated worktree
- NO_GO for destructive repository cleanup in this execution

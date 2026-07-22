# AirTrust Repository Sanitization 2026-06-26

## Estado inicial

- Pasta canônica `<AIRTRUST_ROOT>` estava em `feat/lms-progresso-recuperacao-dry-run`.
- Working tree canônica tinha alterações rastreadas em docs e `worker-airtrust/src/routes/simuladores-fichas.ts`.
- Havia múltiplas worktrees e clones paralelos em `<AIRTRUST_ROOT>-worktrees` e `/Users/filipedaumas/SAAS`.
- `origin/main` evoluiu durante a sanitização e terminou em `2be72f03f7bf5ef075d80b78caaff38d95b3756e`.

## Inventário e classificação

| Path | Branch/HEAD | Estado | Classificação | Ação |
| --- | --- | --- | --- | --- |
| `<AIRTRUST_ROOT>` | `main` @ `2be72f03` | limpo | `KEEP_CANONICAL_CANDIDATE` | saneado in-place |
| `<AIRTRUST_ROOT>-worktrees/deploy-main-20260626` | `codex/lms-dry-run-closeout-20260626` @ `8445ed2` | limpo no início da sanitização | `KEEP_ACTIVE_PR` | mantido como única worktree |
| `<AIRTRUST_ROOT>-worktrees/incident-lms-maintenance-progress-20260625` | `codex/lms-maintenance-postdeploy-validation-report-20260625` @ `311c485` | limpo | `REMOVE_MERGED_CLEAN` | removido |
| `<AIRTRUST_ROOT>-worktrees/lms-maintenance-recovery-audit-20260626` | `codex/lms-maintenance-recovery-audit-20260626` @ `060c8cc` | modificado/untracked | `ARCHIVE_PATCH_THEN_REMOVE` | patch salvo e removido |
| `<AIRTRUST_ROOT>-worktrees/lms-recovery-apply-aw139-20260626` | `main` @ `a8b9f12` | limpo | `REMOVE_MERGED_CLEAN` | removido |
| `<AIRTRUST_ROOT>-worktrees/lms-recovery-dry-run-20260626` | `codex/lms-recovery-dry-run-20260626` @ `b7d310a` | limpo | `REMOVE_MERGED_CLEAN` | removido |
| `<AIRTRUST_ROOT>-worktrees/lms-recovery-pr162-clean-20260626` | `codex/lms-recovery-pr162-clean-20260626` | modificado/untracked | `ARCHIVE_PATCH_THEN_REMOVE` | patch salvo e removido |
| `<AIRTRUST_ROOT>-worktrees/deploy-main-20260625` | clone paralelo em `main` | untracked | `STANDALONE_CLONE_REVIEW` | preservado e removido |
| `<AIRTRUST_ROOT>-deploy-main` | clone paralelo em `main` | modificado | `STANDALONE_CLONE_REVIEW` | preservado e removido |
| `<AIRTRUST_ROOT>-sw-decommission-main-publish` | clone paralelo em `main` | limpo | `REMOVE_MERGED_CLEAN` | removido |
| `<AIRTRUST_ROOT>-sw-decommission-main-publish-local` | clone paralelo em `main` | modificado | `STANDALONE_CLONE_REVIEW` | preservado e removido |
| `<AIRTRUST_ROOT>-archive-contaminated-20260624` | `codex/hotfix-lms-aw-progress-reset-20260622` @ `aa138c2` | altamente modificado | `DO_NOT_TOUCH_ACTIVE_UNKNOWN` | mantido como arquivo histórico |

## Patches e preservação

- Arquivo raiz: `<AIRTRUST_ROOT>-repo-archive/20260626`
- Patches, `status`, `untracked` e `head` foram salvos para:
  - `Airtrust`
  - `Airtrust-archive-contaminated-20260624`
  - `Airtrust-deploy-main`
  - `Airtrust-sw-decommission-main-publish-local`
  - `deploy-main-20260625`
  - `lms-maintenance-recovery-audit-20260626`
  - `lms-recovery-pr162-clean-20260626`
- Cópias físicas de docs/scripts não versionados foram salvas em `untracked-copies/`.

## Estado remoto e PRs

| PR | Branch | Estado | Utilidade | Decisão |
| --- | --- | --- | --- | --- |
| `#162` | `feat/lms-progresso-recuperacao-dry-run` | aberto e `DIRTY` na avaliação | conteúdo técnico superado por `#163` e `#165`; fechamento documental entrou em `#166` | `PR162_CLOSED_SUPERSEDED` |
| `#163` | `codex/lms-recovery-dry-run-20260626` | merged | já em `main` | `MERGED_NO_ACTION` |
| `#164` | `codex/lms-dry-run-closeout-20260626` | aberto | docs ainda ativos | `KEEP_AND_REVIEW` |
| `#165` | `codex/lms-recovery-apply-aw139-20260626` | merged | já em `main` | `MERGED_NO_ACTION` |
| `#166` | branch de closeout documental | merged em `origin/main` | consolidou fechamento do tema | `MERGED_NO_ACTION` |

## Resultado final

- Pasta canônica restaurada em `<AIRTRUST_ROOT>`.
- Branch final: `main`.
- HEAD final: `2be72f03f7bf5ef075d80b78caaff38d95b3756e`.
- `origin/main`: `2be72f03f7bf5ef075d80b78caaff38d95b3756e`.
- `git status --short`: limpo na pasta canônica.
- Worktrees restantes:
  - `<AIRTRUST_ROOT>`
  - `<AIRTRUST_ROOT>-worktrees/deploy-main-20260626`

## Riscos e próximos passos

- `Airtrust-archive-contaminated-20260624` continua existindo como arquivo histórico e deve ser tratado manualmente apenas se algum patch antigo ainda for necessário.
- O branch/PR documental `#164` segue aberto e deve ser revisado ou fechado separadamente.
- Reaplicações futuras de material preservado devem ser seletivas e sempre a partir de `main` limpo.

## Decisão final

- `AIRTRUST_CANONICAL_REPOSITORY_RESTORED`
- `WORKTREES_SANITIZED`
- `PR162_CLOSED_SUPERSEDED`
- `MAIN_ALIGNED_WITH_ORIGIN`

# AirTrust Repository Worktree Policy 2026-06-26

1. `<AIRTRUST_ROOT>` é a pasta canônica do projeto.
2. A pasta canônica deve permanecer em `main`, limpa e alinhada com `origin/main`.
3. Nenhuma implementação começa em working tree suja.
4. Worktree existe apenas para uma frente isolada e reversível.
5. Nome padrão: `<AIRTRUST_ROOT>-worktrees/<tema>-YYYYMMDD`.
6. Antes de remover qualquer worktree ou clone, salvar `status`, `diff --binary`, `untracked` e metadados de HEAD.
7. Docs/scripts não versionados úteis devem ser copiados para o archive antes de qualquer limpeza.
8. Ao terminar um PR: validar merge, atualizar `main`, remover a worktree e executar `git worktree prune`.
9. Worktree existe apenas para PR; deploy nunca sai de worktree temporária.
10. O caminho oficial de deploy é GitHub Actions via workflow `Deploy AirTrust`.
11. Deploy local é exceção emergencial e nunca o caminho padrão.
12. Nunca criar clone temporário para deploy.
13. Se `main` local estiver atrasado em relação a `origin/main`, executar `git pull --ff-only` antes de qualquer validação operacional; não fazer deploy nesse estado.
14. Deploy local, quando aprovado por incidente, só parte de `<AIRTRUST_ROOT>` em `main` limpo e alinhado com `origin/main`.
15. Após merge, remover a worktree e executar `git worktree prune`.
16. Não misturar código funcional com docs de outra frente no mesmo PR.
17. Nunca misturar código funcional com docs LMS/SCORM em um PR OPS/release.
18. Se surgir `index.lock`, `cannot lock ref` ou erro de permissão persistente, abandonar a árvore e recriar a partir de worktree limpa; não improvisar clone de deploy.
19. No início de cada turno:
    - `git fetch origin --prune`
    - `git status --short`
    - `git branch --show-current`
    - confirmar que a árvore ativa é a correta para a tarefa

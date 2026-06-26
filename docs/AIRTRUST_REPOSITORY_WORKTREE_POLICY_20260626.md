# AirTrust Repository Worktree Policy 2026-06-26

1. `/Users/filipedaumas/SAAS/Airtrust` é a pasta canônica do projeto.
2. A pasta canônica deve permanecer em `main`, limpa e alinhada com `origin/main`.
3. Nenhuma implementação começa em working tree suja.
4. Worktree existe apenas para uma frente isolada e reversível.
5. Nome padrão: `/Users/filipedaumas/SAAS/Airtrust-worktrees/<tema>-YYYYMMDD`.
6. Antes de remover qualquer worktree ou clone, salvar `status`, `diff --binary`, `untracked` e metadados de HEAD.
7. Docs/scripts não versionados úteis devem ser copiados para o archive antes de qualquer limpeza.
8. Ao terminar um PR: validar merge, atualizar `main`, remover a worktree e executar `git worktree prune`.
9. Deploy só parte de `main` limpo ou de checkout limpo explicitamente preparado para isso.
10. Não misturar docs de uma frente com código de outra.
11. Se surgir `index.lock`, `cannot lock ref` ou erro de permissão persistente, abandonar a árvore e recriar a partir de clone ou worktree limpa.
12. No início de cada turno:
    - `git fetch origin --prune`
    - `git status --short`
    - `git branch --show-current`
    - confirmar que a árvore ativa é a correta para a tarefa

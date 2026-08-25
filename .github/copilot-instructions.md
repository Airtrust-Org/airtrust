# GitHub Copilot — AirTrust

`CLAUDE.md` na raiz do repositório é a fonte operacional canônica para agentes. Em caso de divergência, siga `CLAUDE.md` e os workflows/runbooks atuais.

## Regras obrigatórias

- Trabalhe sempre em branch baseada na `main` atual; nunca altere `main` diretamente.
- Preserve autenticação, RBAC, isolamento por tenant/`empresa_id`, auditoria e contratos de dados.
- Faça mudanças mínimas e verificáveis. Não use `git add -A` quando houver trabalho desconhecido no workspace.
- Não execute deploy, migration remota, seed, restore, deleção em R2/D1 ou outra mutação de ambiente apenas porque a ferramenta permite.
- Staging e produção só podem ser alterados pelos workflows oficiais e pelas autorizações exigidas neles.
- Produção exige autorização explícita para o SHA exato e confirmação vigente; uma autorização anterior não pode ser reutilizada.
- Migrations seguem a governança atual de schema, backup, preflight, aplicação controlada e pós-condições.
- Antes de merge, respeite os oito gates oficiais definidos em `CLAUDE.md`; nunca contorne branch protection ou reduza baseline para obter verde.
- Segredos nunca devem ser impressos, commitados ou copiados para documentação.
- Compatibilidade legada não deve ser removida sem verificar uso e contrato atual.

## Fluxo padrão

`investigar → corrigir → teste focado → suíte afetada → CI oficial → revisão do delta → PR/merge governado → staging quando aplicável → produção somente com autorização específica`

Não trate permissões da IDE como autorização operacional para produção ou dados.

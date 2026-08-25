# WindSurf — Regras do Projeto AirTrust

A fonte operacional canônica é `CLAUDE.md` na raiz do repositório. Estas regras não concedem autorização adicional e não substituem branch protection, CI, workflows de release, governança de migrations ou controles de ambiente.

## Operação segura

- Baseie novas frentes na `main` atual e trabalhe em branch/PR.
- Não faça deploy automático.
- Não execute migrations remotas, seeds, restores, resets, deleções D1/R2 ou alterações de usuários sem a autorização e o workflow exigidos pelo projeto.
- Não trate acesso ao terminal, Wrangler, Git ou variáveis de ambiente como autorização para mutar staging/produção.
- Preserve tenant isolation, RBAC, autenticação, trilha de auditoria e queries parametrizadas.
- Nunca exponha segredos em logs, prompts, commits ou documentação.
- Não use `git add -A` cegamente; preserve alterações desconhecidas.
- Execute primeiro o teste que reproduz a falha, depois a suíte afetada e os gates oficiais aplicáveis.
- Nunca reduza cobertura, baseline ou proteção de branch apenas para fazer CI passar.
- Produção exige autorização explícita para o SHA exato e deve usar somente o workflow oficial vigente.

## Correções

Siga `.cascade-protocol.md`, que é deliberadamente subordinado a `CLAUDE.md` e não contém autorização automática de deploy.

Fluxo esperado:

`identificar → causa suficiente → correção mínima → teste focado → suíte afetada → CI oficial → PR → merge governado → staging quando autorizado → produção somente com autorização específica`

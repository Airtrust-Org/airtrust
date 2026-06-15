# HOME_PROFILE por setor sem novos papeis RBAC

Data: 2026-06-15
Projeto: AirTrust

## Decisao

Implementar a decisao de home inicial por `home_profile` derivado no frontend, sem criar novos papeis RBAC e sem alterar schema.

## Fontes de verdade mantidas

- RBAC continua vindo de `user.role` e permissoes existentes.
- Dashboard administrativo continua existindo, mas fica visivel apenas para o admin principal allowlisted.
- Contexto funcional da home passa a ser derivado de:
  - `user.funcionario_id`
  - `funcionario.setor`
  - `funcionario.funcao`
  - `funcionario.cargo`

## Regras aplicadas

1. `PRIMARY_ADMIN_DASHBOARD`
   - somente para admin principal allowlisted.
   - renderiza `DashboardPrincipal`.
2. `MANAGER_FUNCIONARIOS`
   - para `GESTOR` e admins comuns.
   - redireciona para `/funcionarios`.
3. `STUDENT_MANUTENCAO`
   - para perfis self-service (`ALUNO`, `INSTRUTOR`, `USUARIO`) cujo contexto funcional aponte manutencao.
4. `STUDENT_TRIPULACAO`
   - para perfis self-service com contexto de tripulacao/operacao aerea.
5. `STUDENT_ADMINISTRATIVO`
   - para perfis self-service com contexto administrativo.
6. `STUDENT_DEFAULT`
   - fallback quando nao houver contexto suficiente.
7. `DEFAULT_FUNCIONARIOS`
   - fallback para demais papeis autenticados.

## Escopo deliberadamente fora

- nenhuma migration;
- nenhum novo papel;
- nenhuma alteracao de contrato em `auth/me`;
- nenhuma mudanca de seguranca em rotas protegidas por modulo.

## Limitacoes atuais

- `auth/me` ainda nao entrega `setor`/`funcao`/`cargo`;
- o frontend precisa buscar `GET /api/funcionarios/:id` quando o usuario possui `funcionario_id`;
- a classificacao por setor usa heuristica textual controlada e reversivel.

## Riscos residuais

- classificacoes ambiguidas de setor podem cair em `STUDENT_DEFAULT`;
- ocultacao de menu nao substitui controle de acesso;
- se o cadastro de funcionario estiver inconsistente, a home pode assumir contexto generico.

## Proximos passos recomendados

1. observar logs/feedback dos primeiros usuarios com `home_profile` derivado;
2. consolidar dicionario de setores canonicos quando o cadastro estiver saneado;
3. so entao avaliar se vale mover esse enriquecimento para o backend.

# Manutenção Operacional: Funcionários, Modelos, Sessões e Qualificações

**Data:** 2026-06-15  
**Branch:** `codex/manutencao-operacional-funcionarios-qualificacoes`  
**Veredito:** `MANUTENCAO OPERACIONAL AJUSTADA`

## Diagnóstico

### Achados

- A tela principal de `Funcionários` ainda tratava filtro e exibição a partir de `funcao`, enquanto partes do produto já operavam com fallback `funcao || cargo`.
- Esse descompasso afetava principalmente manutenção, porque funcionários completos em `cargo` podiam ficar menos visíveis na listagem e fora do filtro principal.
- A lista principal de funcionários não expunha `setor` por padrão, reduzindo a separação visual entre manutenção e tripulação.
- O backend de qualificações já estava com suporte a escopo por setor e filtros coerentes para histórico/modelos; não foi necessário ajuste seguro adicional nesse bloco.
- As salvaguardas de visibilidade por perfil e separação contextual de manutenção/tripulação já estavam cobertas pelos testes existentes e permaneceram estáveis.

### Riscos avaliados

- Risco funcional baixo para correção local em frontend/backend de listagem, sem alterar schema.
- Risco alto se a fase exigisse mudança de RBAC backend, permissões reais, tenant isolation ou dados remotos. Isso não foi necessário nesta etapa.

### Correções seguras identificadas

- Unificar o filtro funcional de funcionários para usar `funcao` com fallback em `cargo`.
- Tornar a visibilidade da lista mais explícita com coluna de `setor`.
- Alinhar as opções do filtro da tela a valores reais já carregados na listagem.
- Adicionar testes pequenos e direcionados para preservar esse comportamento.

### Itens que exigiriam fase sensível

- Nenhum item desta execução exigiu schema, migration, RBAC backend, multi-tenant real, staging ou produção.

## Funcionários / Áreas Afetadas

- Funcionários da manutenção com `cargo` preenchido e `funcao` vazia ou heterogênea.
- Separação visual entre setores de manutenção e tripulação na tela principal de funcionários.
- Filtro operacional de função/cargo na rotina administrativa de funcionários.

## Modelos / Sessões / Qualificações Revisados

- Histórico de qualificações por setor: revisado, já suportado no backend, sem alteração necessária.
- Tipos/modelos de qualificação por setor: revisados, já cobertos por testes de escopo, sem alteração necessária.
- Sessões/modelos de simulador: revisados apenas para risco de acoplamento; nenhuma mudança aplicada.

## Correções Feitas

- Backend de `funcionarios` atualizado para filtrar por expressão unificada `funcao` com fallback em `cargo`.
- Frontend de `Funcionários` atualizado para:
  - exibir `Função / Cargo` em vez de depender só de `funcao`;
  - exibir `Setor` por padrão na tabela principal;
  - enriquecer o filtro com opções reais descobertas na listagem, além das funções cadastradas.
- Testes adicionados para o fallback `funcao/cargo` no frontend e para a expressão unificada no backend.

## Arquivos Alterados

- `src/react-app/pages/Funcionarios.tsx`
- `src/react-app/pages/funcionarios/ListaFuncionarios.tsx`
- `src/react-app/pages/funcionarios/__tests__/ListaFuncionarios.helpers.test.ts`
- `worker-airtrust/src/routes/funcionarios.ts`
- `worker-airtrust/src/__tests__/routes/funcionarios-role-filter.test.ts`

## Testes Executados

- `npm run test:run -- src/react-app/pages/funcionarios/__tests__/ListaFuncionarios.helpers.test.ts src/react-app/lib/__tests__/home-profile.test.ts`
- `npm run test:worker -- src/__tests__/routes/funcionarios-role-filter.test.ts src/__tests__/services/employee-sector-access.test.ts src/__tests__/routes/qualificacoes-sector-isolation.test.ts src/__tests__/routes/qualificacoes-tipos-setores-scope.test.ts`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- `git diff --check`
- `bash scripts/check-tracked-secrets.sh`
- `bash scripts/validation/audit-deploy-scripts.sh`
- `bash scripts/audit-dangerous-ops.sh`

## Riscos Restantes

- O filtro enriquecido no frontend continua dependente dos dados efetivamente carregados na listagem para descobrir cargos não cadastrados em `funcoes`.
- Não houve alteração estrutural em cadastros legados de funcionários; inconsistências de preenchimento de dados continuam sendo questão de qualidade cadastral, não de schema.

## Itens Bloqueados por Exigir Fase Sensível

- Nenhum nesta etapa.

## Confirmações de Escopo

- SIGVOOS / importador / runner / `0411` ficaram intocados.
- FRMS e `frms-source-policy.ts` ficaram intocados.
- Não houve deploy.
- Não houve migration aplicada.
- Não houve uso de staging ou produção.
- Não houve D1 remoto, Cloudflare, R2 ou secrets operacionais.

## Próxima Recomendação

- Revisão humana focada em UX operacional da lista de funcionários para confirmar se a coluna `Setor` deve permanecer visível por padrão para todos os perfis administrativos.
- Se a operação quiser filtro canônico de cargos independente da paginação/listagem carregada, tratar em fase separada de baixo risco com endpoint de lookup dedicado, sem tocar RBAC ou schema.

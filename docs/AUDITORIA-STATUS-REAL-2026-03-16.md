# Auditoria de Status Real

Data: 2026-03-16

## Objetivo

Consolidar o estado real dos itens de correção e melhoria já discutidos, separando:

- itens realmente resolvidos no código atual
- itens parcialmente resolvidos
- itens ainda abertos no runtime real
- próximos passos seguros por sprint

Esta auditoria foi baseada no estado atual do workspace principal, ignorando a worktree paralela em `.claude/worktrees/stoic-gagarin` quando havia divergência.

## Resumo Executivo

O projeto avançou em hardening de runtime, configuração de build e isolamento de ambiente, mas a lista ampla de pendências não está zerada.

Os principais blocos ainda abertos hoje são:

- consolidação de autenticação no frontend
- unificação do transporte HTTP
- remoção de clients legados e retries arriscados
- redução de monólitos frontend/backend
- saneamento gradual de typings `any`
- idempotência e padronização de migrations antigas

## Matriz de Status

### Resolvido

1. `ENABLE_DEV_AUTH_BYPASS` bloqueado fora de development.
   Evidência:
   - `worker-airtrust/src/runtime/worker-entrypoint.ts`
   - `worker-airtrust/src/middleware/auth.ts`

2. `JWT_SECRET` obrigatório fora de development.
   Evidência:
   - `worker-airtrust/src/runtime/worker-entrypoint.ts`
   - `worker-airtrust/src/routes/auth.ts`

3. Bancos D1 separados por ambiente.
   Evidência:
   - `worker-airtrust/wrangler.toml`
   - `airtrust-db-dev`
   - `airtrust-db-staging`
   - `airtrust-db`

4. Build de produção com `sourcemap: 'hidden'` e `minify: 'esbuild'`.
   Evidência:
   - `vite.config.ts`

5. Prefixos administrativos de `/api/admin/*` e `/api/migrations/*` protegidos por `auth()` e `requireRole('admin')`.
   Evidência:
   - `worker-airtrust/src/index.ts`

### Parcialmente resolvido

1. Armazenamento de token no frontend.
   Estado atual:
   - `AuthContext` migrou o fluxo principal para `sessionStorage`
   - ainda há fallback e leitura espalhada com `sessionStorage || localStorage`
     Evidência:
   - `src/react-app/context/AuthContext.tsx`
   - `src/react-app/config/api.ts`
   - `src/react-app/pages/Qualificacoes.tsx`
   - `src/react-app/pages/PastaVirtual.tsx`
   - `src/react-app/pages/Configuracoes/Usuarios.tsx`

2. Migração para transporte explícito no frontend.
   Estado atual:
   - `apiFetch` e `http-client` existem e o monkey patch global saiu do app principal
   - ainda coexistem clients legados com regras próprias
     Evidência:
   - `src/react-app/services/http-client.ts`
   - `src/react-app/services/apiClient.ts`
   - `src/react-app/utils/api-client.ts`
   - `src/services/api.ts`

3. Estratégia de cookies/httpOnly.
   Estado atual:
   - há menções e chamadas com `credentials: 'include'`
   - não existe migração completa para sessão baseada só em cookie httpOnly
     Evidência:
   - `src/react-app/config/api.ts`
   - `src/react-app/services/fichasApi.ts`
   - `src/react-app/services/relatoriosSimuladoresApi.ts`

### Aberto

1. Múltiplos clients HTTP no runtime real.
   Impacto:
   - comportamento inconsistente de header, retry, timeout e token
     Evidência:
   - `src/react-app/services/http-client.ts`
   - `src/react-app/utils/api-client.ts`
   - `src/services/api.ts`
   - `src/react-app/hooks/useSimuladores.ts`
   - `src/react-app/hooks/queries/useFuncoesRQ.ts`

2. Retry genérico em client legado ainda ativo em mutações.
   Impacto:
   - risco de duplicidade em `POST`, `PUT`, `PATCH`, `DELETE`
     Evidência:
   - `src/react-app/utils/api-client.ts`
   - `defaultRetries = 3`
   - laço de retry em `request()`

3. Axios legado ainda em uso.
   Impacto:
   - stack duplicado de transporte
   - interceptors e storage divergentes do fluxo principal
     Evidência:
   - `src/services/api.ts`
   - consumidores em `src/react-app/hooks/queries/*.ts`
   - consumidores em `src/react-app/hooks/mutations/*.ts`

4. `react-hot-toast` ainda presente no projeto.
   Impacto:
   - dependência legada e padrão de toast inconsistente
     Evidência:
   - `package.json`
   - `src/lib/sw-manager.tsx`

5. Monólitos backend ainda muito grandes.
   Evidência atual de tamanho:
   - `worker-airtrust/src/routes/simuladores.ts`: 4819 linhas
   - `worker-airtrust/src/routes/escalas.ts`: 2876 linhas
   - `worker-airtrust/src/index.ts`: 1149 linhas

6. Monólitos frontend ainda muito grandes.
   Evidência atual de tamanho:
   - `src/react-app/pages/Qualificacoes.tsx`: 2592 linhas
   - `src/react-app/pages/funcionarios/ModalFuncionario.tsx`: 1804 linhas
   - `src/react-app/pages/frms/FrmsImportacaoFira.tsx`: 1607 linhas

7. Uso massivo de `any` e contratos frouxos.
   Evidência:
   - `src/react-app/services/qualificacoesService.ts`
   - `src/react-app/services/funcionarios.service.ts`
   - `src/react-app/pages/Configuracoes/Cadastros.tsx`
   - `src/react-app/pages/Qualificacoes.tsx`

8. Migrations antigas sem idempotência consistente.
   Impacto:
   - reexecução insegura
   - maior risco em recovery e rebuild de ambientes
     Evidência:
   - múltiplas migrations em `worker-airtrust/migrations/*.sql` com `CREATE TABLE` e `CREATE INDEX` sem `IF NOT EXISTS`

## Falsos Positivos Que Não Estão Mais Abertos

1. `DEV_AUTH_BYPASS` liberado em produção.
   Situação real:
   - o runtime atual rejeita isso explicitamente.

2. D1 compartilhado entre development, staging e production.
   Situação real:
   - o `wrangler.toml` atual já separa os três bancos.

3. `JWT_SECRET` opcional em staging/production.
   Situação real:
   - o runtime atual falha se o secret não existir fora de development.

4. `sourcemap: true` e `minify: false` no build principal.
   Situação real:
   - isso ficou só em worktree paralela/histórico, não no `vite.config.ts` atual do workspace principal.

## Próximos Passos Seguros

### Sprint 1

Objetivo: consolidar autenticação e transporte sem alterar regra de negócio.

1. Remover leituras diretas de token dos componentes e páginas.
   Alvo:
   - toda leitura manual de `sessionStorage/localStorage` deve passar por `getAccessToken()` ou por um único provider.

2. Congelar o uso do client legado `src/react-app/utils/api-client.ts`.
   Alvo:
   - parar novas importações
   - migrar consumidores restantes para `http-client`

3. Congelar o uso de `src/services/api.ts` baseado em axios.
   Alvo:
   - mover hooks `use*RQ` e `use*Mutations` para o client canônico

4. Desabilitar retry automático para mutações enquanto existir client legado.
   Alvo:
   - evitar duplicidade antes da remoção completa do client antigo.

### Sprint 2

Objetivo: limpar passivo técnico de baixo risco.

1. Remover `react-hot-toast` do runtime principal.
2. Remover `axios` quando o último consumidor sair.
3. Centralizar regras de header, timeout, CSRF e `credentials` num único client.
4. Criar lint rule ou busca CI para barrar novos `localStorage.getItem('airtrust_token')` espalhados.

### Sprint 3

Objetivo: iniciar refatoração estrutural sem reescrever regra.

1. Quebrar `worker-airtrust/src/routes/simuladores.ts` por subdomínio.
2. Quebrar `worker-airtrust/src/routes/escalas.ts` por subdomínio.
3. Extrair blocos de `src/react-app/pages/Qualificacoes.tsx` para componentes e hooks dedicados.
4. Extrair blocos de `src/react-app/pages/funcionarios/ModalFuncionario.tsx`.

### Sprint 4

Objetivo: reduzir risco operacional do banco.

1. Criar política de idempotência para migrations novas.
2. Catalogar migrations antigas não idempotentes por severidade.
3. Corrigir primeiro as migrations mais usadas em rebuild de ambiente.

## Ordem Recomendada de Execução

1. Consolidar autenticação e transporte.
2. Remover clients e libs legadas.
3. Só então atacar monólitos.
4. Depois entrar em typings e migrations históricas.

## Critério de Conclusão Real

Um item só deve ser marcado como concluído quando cumprir os três pontos abaixo:

1. o código antigo deixou de ser usado no runtime principal
2. a configuração ou risco correspondente desapareceu do workspace principal
3. existe busca simples no repositório confirmando ausência do padrão antigo

Sem isso, o status correto deve ser `parcial` ou `aberto`.

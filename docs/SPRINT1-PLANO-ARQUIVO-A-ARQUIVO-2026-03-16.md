# Sprint 1 - Plano Arquivo a Arquivo

Data: 2026-03-16

## Escopo

Consolidar autenticação e transporte HTTP no frontend, mantendo comportamento atual.

## Já Aplicado Nesta Execução

1. `src/react-app/utils/api-client.ts`
   - token agora usa `getAccessToken()` (fonte canônica)
   - retry implícito para mutações foi desabilitado por padrão
   - GET continua com retry padrão

2. `src/services/api.ts`
   - token agora usa `getAccessToken()` (sem leitura direta localStorage)
   - client marcado explicitamente como compatibilidade legada

## Próximos Commits (ordem recomendada)

### Commit A - Token Access Cleanup (módulos críticos)

Arquivos alvo:

- `src/react-app/pages/sgso/useSgsoApi.ts`
- `src/react-app/pages/Sgso.tsx`
- `src/react-app/pages/SgsoRelato.tsx`
- `src/react-app/pages/frms/FrmsImportacaoFira.tsx`
- `src/react-app/pages/PastaVirtual.tsx`
- `src/react-app/hooks/usePastaVirtual.ts`

Regra:

- substituir `(sessionStorage.getItem('airtrust_token') || localStorage.getItem('airtrust_token'))` por `getAccessToken()`
- remover fallback para `localStorage.getItem('token')`

### Commit B - Client Legado (axios) para canônico

Arquivos alvo:

- `src/react-app/hooks/queries/useFuncoesRQ.ts`
- `src/react-app/hooks/queries/useAeronavesRQ.ts`
- `src/react-app/hooks/queries/useTreinamentosRQ.ts`
- `src/react-app/hooks/queries/useEmpresasRQ.ts`
- `src/react-app/hooks/queries/useCertificadosRQ.ts`
- `src/react-app/hooks/queries/useFichasRQ.ts`
- `src/react-app/hooks/queries/useSetoresRQ.ts`
- `src/react-app/hooks/mutations/useFuncoesMutations.ts`
- `src/react-app/hooks/mutations/useAeronavesMutations.ts`
- `src/react-app/hooks/mutations/useTreinamentosMutations.ts`
- `src/react-app/hooks/mutations/useEmpresasMutations.ts`
- `src/react-app/hooks/mutations/useCertificadosMutations.ts`
- `src/react-app/hooks/mutations/useFichasMutations.ts`
- `src/react-app/hooks/mutations/useSetoresMutations.ts`

Regra:

- migrar import de `@/services/api` para `@/react-app/services/http-client` ou `@/react-app/services/apiClient`

### Commit C - Client utilitário legado remanescente

Arquivos alvo:

- `src/react-app/hooks/useSimuladores.ts`
- `src/react-app/hooks/useAeronavesConfig.ts`
- `src/react-app/components/simuladores/ModalCadastrarSessao.tsx`
- `src/react-app/components/FixRenovadasButton.tsx`

Regra:

- migrar `api` de `src/react-app/utils/api-client.ts` para `httpClient` / `apiClient` canônico

### Commit D - Limpeza de dependências

Arquivos alvo:

- `package.json`
- `src/lib/sw-manager.tsx`

Regra:

- remover `react-hot-toast` do runtime principal após migração para `sonner`
- remover `axios` apenas após zerar imports em `src/services/api.ts`

## Gate de Validação por Commit

1. `npm run build`
2. smoke SGSO autenticado
3. smoke FRMS básico
4. smoke Pasta Virtual (lista + upload + exclusão)

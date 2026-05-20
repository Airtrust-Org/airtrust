# Histórico - Hooks Unificados

**Data:** 24/11/2025  
**Status:** ✅ Implementado

## Objetivo

Padronizar a conexão entre frontend e API do histórico de qualificações seguindo o mesmo padrão de `useFuncionarios` e `useQualificacoes`.

---

## Padrão Identificado

### 1. **useFuncionarios** (`src/react-app/hooks/useFuncionarios.ts`)

- ✅ Usa **React Query** (useQuery, useMutation, useQueryClient)
- ✅ Usa **apiClient** para chamadas HTTP
- ✅ Exporta hooks específicos: `useFuncionariosRQ`, `useFuncionarioRQ`, `useCriarFuncionario`, `useAtualizarFuncionario`, `useDeletarFuncionario`
- ✅ Invalidação automática de cache após mutations
- ✅ Suporte a filtros e paginação

### 2. **useQualificacoes** (`src/react-app/hooks/useQualificacoes.ts`)

- ✅ Usa **useApi** hook personalizado
- ✅ Normaliza resposta em formato consistente
- ✅ Memoização para performance
- ✅ Endpoint: `/api/qualificacoes/tipos`

---

## Solução Implementada

### Arquivo Criado

**`src/react-app/hooks/useHistorico.unified.ts`**

### Estrutura

```typescript
// INTERFACES
export interface HistoricoQualificacao { ... }
export interface HistoricoFiltros { ... }
export interface HistoricoCreateInput { ... }
export interface HistoricoUpdateInput { ... }

// HOOKS DE QUERY
export function useHistoricoQualificacoes(filtros?) { ... }
export function useHistoricoQualificacao(id) { ... }
export function useHistoricoStats(filtros?) { ... }
export function useHistoricoHealth() { ... }

// HOOKS DE MUTATION
export function useCriarHistorico() { ... }
export function useAtualizarHistorico() { ... }
export function useDeletarHistorico() { ... }
export function useRenovarHistorico() { ... }
export function useImportarHistorico() { ... }
```

---

## Características Principais

### ✅ Consistência com Padrão Existente

- React Query para cache e revalidação
- apiClient para todas as chamadas HTTP
- Invalidação automática de queries relacionadas
- Tipos TypeScript completos

### ✅ Funcionalidades Implementadas

1. **Listagem com Filtros**

   - Paginação (page, limit)
   - Filtro por funcionário, tipo, status
   - Busca textual

2. **CRUD Completo**

   - Criar novo registro
   - Atualizar existente
   - Deletar (soft delete)
   - Buscar por ID

3. **Operações Especiais**
   - Renovar qualificação
   - Importação em lote
   - Estatísticas (com cache estendido)
   - Health check da tabela

### ✅ Cache Strategy

- **Listagem**: 30s stale time
- **Estatísticas**: 60s stale time
- **Health**: 5min stale time
- Invalidação automática após mutations

---

## Integração no QualificacoesWrapper

### Antes

```typescript
import { useHistoricoQualificacoes } from '@/react-app/hooks/qualificacoes/useHistoricoQualificacoes';
import {
  deletarHistoricoQualificacao,
  renovarHistoricoQualificacao,
} from '@/react-app/services/qualificacoesService';

// Chamadas diretas ao service
const res = await deletarHistoricoQualificacao(id);
const res = await renovarHistoricoQualificacao(id, data);
```

### Depois

```typescript
import {
  useHistoricoQualificacoes,
  useDeletarHistorico,
  useRenovarHistorico,
} from '@/react-app/hooks/useHistorico.unified';

// Mutations com React Query
const deletarMutation = useDeletarHistorico();
const renovarMutation = useRenovarHistorico();

await deletarMutation.mutateAsync(id);
await renovarMutation.mutateAsync({ id, data_conclusao, data_vencimento });
```

---

## Vantagens

1. **Cache Inteligente**: React Query gerencia automaticamente
2. **Invalidação Automática**: Após mutations, todas as queries relacionadas são revalidadas
3. **Loading/Error States**: Gerenciados pelo React Query
4. **Otimistic Updates**: Possível implementar facilmente
5. **Dedupe**: Previne requisições duplicadas
6. **Retry Logic**: Configurável por hook
7. **Consistência**: Mesmo padrão de funcionários e qualificações
8. **Type Safety**: TypeScript em toda a cadeia

---

## Endpoints Mapeados

| Hook                      | Método | Endpoint                               | Cache       |
| ------------------------- | ------ | -------------------------------------- | ----------- |
| useHistoricoQualificacoes | GET    | /qualificacoes/historico?...           | 30s         |
| useHistoricoQualificacao  | GET    | /qualificacoes/historico/:id           | Query-based |
| useCriarHistorico         | POST   | /qualificacoes/historico               | -           |
| useAtualizarHistorico     | PUT    | /qualificacoes/historico/:id           | -           |
| useDeletarHistorico       | DELETE | /qualificacoes/historico/:id           | -           |
| useRenovarHistorico       | POST   | /qualificacoes/historico/:id/renovar   | -           |
| useImportarHistorico      | POST   | /qualificacoes/historico/importar-json | -           |
| useHistoricoStats         | GET    | /qualificacoes/historico/stats?...     | 60s         |
| useHistoricoHealth        | GET    | /qualificacoes/historico/health        | 5min        |

---

## Próximos Passos

### Opcional (Melhorias Futuras)

1. **Migrar hooks legados** para usar `.unified.ts`
2. **Adicionar optimistic updates** para melhor UX
3. **Implementar infinite scroll** para listagem grande
4. **Adicionar prefetch** para detalhes ao hover
5. **WebSocket/SSE** para updates real-time

### Deprecar

- ❌ `src/react-app/hooks/qualificacoes/useHistoricoQualificacoes.ts` (substituído)
- ❌ Chamadas diretas aos services (usar mutations)

---

## Comparação de Padrões

| Aspecto        | useFuncionarios | useQualificacoes | useHistorico (Novo) |
| -------------- | --------------- | ---------------- | ------------------- |
| Library        | React Query     | useApi custom    | React Query ✅      |
| Cache          | Automático      | Manual           | Automático ✅       |
| Mutations      | Sim             | Não              | Sim ✅              |
| Invalidação    | Automática      | Manual           | Automática ✅       |
| Tipos          | Completos       | Parciais         | Completos ✅        |
| Loading State  | Gerenciado      | Manual           | Gerenciado ✅       |
| Error Handling | Throw + catch   | Return object    | Throw + catch ✅    |

**Resultado:** Hook de histórico agora segue o padrão mais robusto (useFuncionarios) com React Query.

---

## Uso Recomendado

```typescript
// Component
function HistoricoPage() {
  // Query
  const { data, isLoading, error, refetch } = useHistoricoQualificacoes({
    page: 1,
    limit: 50,
    status: 'VALIDA',
  });

  // Mutations
  const criarMutation = useCriarHistorico();
  const deletarMutation = useDeletarHistorico();

  const handleCriar = async (input: HistoricoCreateInput) => {
    try {
      await criarMutation.mutateAsync(input);
      toast.success('Registro criado');
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (isLoading) return <Spinner />;
  if (error) return <Error message={error.message} />;

  return <Table data={data?.data} />;
}
```

---

## Verificação de Consistência

✅ **apiClient**: Usado em todos os hooks (mesma abstração de useFuncionarios)  
✅ **React Query**: useQuery + useMutation (mesma lib de useFuncionarios)  
✅ **Cache Invalidation**: Automática após mutations  
✅ **TypeScript**: Interfaces completas e exportadas  
✅ **Error Handling**: Throw + try/catch (padrão consistente)  
✅ **Query Keys**: Estruturados e descritivos  
✅ **Mutations onSuccess**: Invalidam queries relacionadas

---

## Configuração de Ambiente

Para garantir que localhost aponte para produção:

```bash
# .env.local
VITE_API_URL=https://airtrust-api-production.airtrust.workers.dev/api
```

Overlay de debug (já implementado):

- Mostra `API_BASE_URL` ativo
- Mostra `historico.total_records` via health endpoint
- Aparece automaticamente em localhost

---

## Conclusão

A implementação do **useHistorico.unified.ts** traz o histórico de qualificações para o mesmo nível de maturidade e consistência dos hooks de funcionários e qualificações, seguindo as melhores práticas:

- ✅ React Query para gerenciamento de estado server
- ✅ apiClient como camada única de comunicação
- ✅ Cache inteligente e invalidação automática
- ✅ Mutations type-safe com feedback de loading/error
- ✅ Padrão replicável para futuros módulos

**Status:** Pronto para uso em produção.

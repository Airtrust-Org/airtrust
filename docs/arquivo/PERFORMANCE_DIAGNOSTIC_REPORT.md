# 📊 RELATÓRIO DE DIAGNÓSTICO DE PERFORMANCE - AIRTRUST

**Data**: 29/11/2025 23:40  
**Worker Version**: 921563d6-c198-410c-93cb-3e5637b467a6  
**Análise**: Pós-refatoração (22 arquivos deletados, bundle -28%)

---

## ✅ RESUMO EXECUTIVO

**CONCLUSÃO INICIAL**: Os tempos de resposta do backend estão **EXCELENTES** (< 1s para todos endpoints). A percepção de lentidão pode ser:

1. **Frontend** (React renders ou React Query)
2. **Cache do navegador** (dados antigos sendo mostrados)
3. **Network waterfall** (requests em cascata)

---

## 1️⃣ BACKEND API - TEMPOS DE RESPOSTA

### Endpoints Testados (média de 3 requests cada):

| Endpoint                     | Tempo Médio | Tamanho    | Status | Avaliação |
| ---------------------------- | ----------- | ---------- | ------ | --------- |
| Health Check                 | ~0.5s       | ~150 bytes | 200    | ✅ ÓTIMO  |
| Funcionários (50)            | ~0.6s       | ~25 KB     | 200    | ✅ ÓTIMO  |
| Funcionário (1)              | ~0.4s       | ~1 KB      | 200    | ✅ ÓTIMO  |
| Qualificações Histórico (50) | ~0.7s       | ~45 KB     | 200    | ✅ ÓTIMO  |
| Qualificações Tipos          | ~0.5s       | ~8 KB      | 200    | ✅ ÓTIMO  |
| Qualificações Categorias     | ~0.5s       | ~3 KB      | 200    | ✅ ÓTIMO  |
| Simuladores (50)             | ~0.6s       | ~12 KB     | 200    | ✅ ÓTIMO  |
| Aeronaves                    | ~0.4s       | ~5 KB      | 200    | ✅ ÓTIMO  |

**✅ BACKEND ESTÁ RÁPIDO - NÃO É O PROBLEMA!**

---

## 2️⃣ DATABASE (D1) - PERFORMANCE DE QUERIES

### Queries SQL Diretas:

| Query                                          | Tempo | Avaliação |
| ---------------------------------------------- | ----- | --------- |
| SELECT simples (funcionários COUNT)            | ~0.2s | ✅ ÓTIMO  |
| SELECT com JOIN (qualificações + funcionários) | ~0.3s | ✅ ÓTIMO  |
| View SQL (v_certificados_completos)            | ~0.5s | ✅ BOM    |

**Observação**: Query com JOIN está 50% mais lenta que SELECT simples, mas ainda é aceitável.

---

## 3️⃣ ÍNDICES D1 - VERIFICAÇÃO

### ✅ ÍNDICES CRÍTICOS EXISTEM E ESTÃO FUNCIONANDO:

**Funcionários**:

- ✅ `idx_funcionarios_deleted` (deleted_at)
- ✅ `idx_funcionarios_cpf` (cpf)
- ✅ `idx_funcionarios_matricula` (matricula)

**Qualificações Histórico**:

- ✅ `idx_historico_func_cpf` (funcionario_cpf WHERE deleted_at IS NULL)
- ✅ `idx_historico_qual_codigo` (qualificacao_codigo WHERE deleted_at IS NULL)
- ✅ `idx_historico_data_conclusao` (data_conclusao WHERE deleted_at IS NULL)
- ✅ `idx_historico_data_vencimento` (data_vencimento WHERE deleted_at IS NULL)
- ✅ `idx_qualificacoes_historico_fk_ids` (funcionario_id, qualificacao_id)

**Qualificações Tipos**:

- ✅ `idx_qualificacoes_tipos_nome` (nome WHERE deleted_at IS NULL)
- ✅ `idx_qualificacoes_tipos_codigo` (codigo WHERE deleted_at IS NULL)

### 🔍 EXPLAIN QUERY PLAN - ANÁLISE:

**Query 1**: `SELECT * FROM funcionarios WHERE deleted_at IS NULL`

```
SEARCH funcionarios USING INDEX idx_funcionarios_deleted (deleted_at=?)
```

✅ **USANDO ÍNDICE CORRETAMENTE**

**Query 2**: `SELECT qh.*, f.nome FROM qualificacoes_historico qh LEFT JOIN funcionarios f`

```
SCAN qh USING INDEX idx_qualificacoes_historico_fk_ids
SEARCH f USING AUTOMATIC COVERING INDEX (cpf=?) LEFT-JOIN
```

✅ **USANDO ÍNDICES CORRETAMENTE**

**CONCLUSÃO**: Índices estão otimizados! ✅

---

## 4️⃣ ESTATÍSTICAS DO BANCO

| Tabela                  | Total Registros | Ativos | Deletados | % Deletado |
| ----------------------- | --------------- | ------ | --------- | ---------- |
| funcionarios            | 55              | 41     | 14        | 25%        |
| qualificacoes_historico | 2806            | 627    | **2179**  | **78%** ⚠️ |
| qualificacoes_tipos     | 64              | 43     | 21        | 33%        |
| simuladores             | 12              | 12     | 0         | 0%         |

### ⚠️ ATENÇÃO CRÍTICA:

**`qualificacoes_historico` tem 78% de registros deletados (2179 de 2806)!**

Isso significa:

- ❌ Queries sem `WHERE deleted_at IS NULL` escaneiam 2179 registros inúteis
- ❌ Índices ficam "poluídos" com dados deletados
- ❌ Backup/restore mais lento
- ❌ Consumo desnecessário de espaço (6.8 MB de DB)

**RECOMENDAÇÃO**: Implementar **VACUUM automático** ou **purge de registros antigos** (> 1 ano deletados).

---

## 5️⃣ HIPÓTESES DE LENTIDÃO

Baseado nos resultados, as causas prováveis são:

### 🎯 HIPÓTESE #1: React Query - Refetch Excessivo (PROVÁVEL)

- **Sintoma**: Dados aparecem, mas depois recarregam várias vezes
- **Causa**: `staleTime` muito curto ou `refetchOnWindowFocus: true`
- **Verificar**: React Query DevTools (queries com `fetchCount > 5`)

### 🎯 HIPÓTESE #2: Network Waterfall (PROVÁVEL)

- **Sintoma**: Página carrega por etapas (primeiro lista, depois dados adicionais)
- **Causa**: Requests sequenciais em vez de paralelas
- **Verificar**: DevTools Network tab (waterfall sequencial)

### 🎯 HIPÓTESE #3: Re-renders React (POSSÍVEL)

- **Sintoma**: Página "trava" durante digitação ou scroll
- **Causa**: Componentes sem `React.memo`, estado global mudando muito
- **Verificar**: React Profiler (componente renderizando > 10x)

### ❌ HIPÓTESE #4: Backend Lento (DESCARTADA)

- Todos endpoints < 1s ✅
- Índices funcionando ✅
- Queries otimizadas ✅

### ❌ HIPÓTESE #5: Database Lento (DESCARTADA)

- Queries diretas < 0.5s ✅
- EXPLAIN mostra uso de índices ✅

---

## 6️⃣ PRÓXIMAS AÇÕES DIAGNÓSTICAS

### ⚡ AÇÃO IMEDIATA #1: Verificar React Query Config

**Arquivo**: `src/react-app/App.tsx` (linha 36-43)

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutos ✅ OK
      refetchOnWindowFocus: false, // ✅ OK
      retry: 1, // ✅ OK
    },
  },
});
```

**Status**: ✅ Configuração está OK!

**Porém**, verificar se alguma página específica está sobrescrevendo isso com:

```typescript
useQuery(['key'], fetchFn, {
  refetchOnWindowFocus: true, // ❌ PROBLEMATICO
  staleTime: 0, // ❌ PROBLEMATICO
});
```

### ⚡ AÇÃO IMEDIATA #2: Adicionar React Query DevTools

**Arquivo**: `src/react-app/App.tsx`

```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-right" richColors closeButton />
      <ReactQueryDevtools initialIsOpen={false} /> {/* 👈 ADICIONAR AQUI */}
      <AuthProvider>{/* ...resto do código */}</AuthProvider>
    </QueryClientProvider>
  );
}
```

### ⚡ AÇÃO IMEDIATA #3: Network Waterfall Analysis

**Abra DevTools → Network tab**:

1. Limpe (Clear)
2. Navegue para **Qualificações**
3. Observe:
   - Quantas requests? (esperado: 3-5)
   - Estão paralelas ou sequenciais?
   - Alguma > 2s?

### ⚡ AÇÃO IMEDIATA #4: React Profiler

**Adicionar temporariamente em `Qualificacoes.tsx`**:

```typescript
import { Profiler } from 'react';

export default function Qualificacoes() {
  return (
    <Profiler
      id="Qualificacoes"
      onRender={(id, phase, duration) => {
        if (duration > 100) {
          // Log só se > 100ms
          console.warn(`🐌 ${id} (${phase}): ${duration.toFixed(2)}ms`);
        }
      }}
    >
      {/* ...código existente */}
    </Profiler>
  );
}
```

---

## 7️⃣ OTIMIZAÇÕES RECOMENDADAS (APÓS DIAGNÓSTICO)

### 🔧 OTIMIZAÇÃO #1: Purge de Dados Deletados

**Criar migration**:

```sql
-- Deletar permanentemente registros soft-deleted há mais de 1 ano
DELETE FROM qualificacoes_historico
WHERE deleted_at IS NOT NULL
  AND deleted_at < datetime('now', '-1 year');

-- Depois executar VACUUM para recuperar espaço
VACUUM;
```

**Impacto**: Reduz DB de 6.8 MB para ~1.5 MB (estimativa)

### 🔧 OTIMIZAÇÃO #2: Prefetch de Dados

Se a página de Qualificações sempre busca:

1. Histórico
2. Tipos
3. Categorias

**Fazer requests em paralelo**:

```typescript
const { data: historico } = useQuery(['historico'], fetchHistorico);
const { data: tipos } = useQuery(['tipos'], fetchTipos);
const { data: categorias } = useQuery(['categorias'], fetchCategorias);
// ✅ React Query faz requests paralelas automaticamente!
```

### 🔧 OTIMIZAÇÃO #3: Virtualização de Listas

Se tabelas grandes (> 100 linhas) estão lentas:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';
// Renderiza só o que está visível na tela
```

---

## 📊 CONCLUSÃO

### ✅ O que está BOM:

- Backend API: < 1s todos endpoints
- Database: Queries otimizadas com índices
- RBAC: Bypass funcionando (DEV_AUTH_BYPASS=true)
- Bundle: 883 KB (214 KB gzip) - tamanho aceitável

### ⚠️ O que precisa ATENÇÃO:

- 78% de dados deletados em `qualificacoes_historico`
- Possível refetch excessivo (precisa confirmar com DevTools)
- Possível waterfall sequencial (precisa confirmar com DevTools)

### 🎯 PRÓXIMOS PASSOS:

1. **Instalar React Query DevTools** → Ver fetchCount das queries
2. **Analisar Network Waterfall** → Ver se requests são paralelas
3. **Usar React Profiler** → Ver se há re-renders excessivos
4. **Purge de dados deletados** → Reduzir 78% de lixo no DB

---

**Aguardo sua confirmação sobre qual página específica está lenta e os resultados dos passos manuais (DevTools, Profiler) para diagnosticar a causa raiz exata!** 🔍

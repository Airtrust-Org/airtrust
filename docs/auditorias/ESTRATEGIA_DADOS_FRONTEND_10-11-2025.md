# 📊 ESTRATÉGIA DE DADOS FRONTEND - AIRTRUST

**Data:** 10 de Novembro de 2025  
**Versão:** v2.0  
**Objetivo:** Mapear todas as tabelas D1 e definir estratégia otimizada de carregamento no frontend

---

## 📋 ÍNDICE

1. [Mapeamento Completo das Tabelas](#1-mapeamento-completo-das-tabelas)
2. [Estratégia de Carregamento](#2-estratégia-de-carregamento)
3. [Arquitetura de Hooks](#3-arquitetura-de-hooks)
4. [Otimização de Endpoints](#4-otimização-de-endpoints)
5. [Plano de Implementação](#5-plano-de-implementação)

---

## 1. MAPEAMENTO COMPLETO DAS TABELAS

### 📊 Visão Geral

**Total de Tabelas Identificadas:** 33+

| Categoria             | Quantidade | Exemplos                                         |
| --------------------- | ---------- | ------------------------------------------------ |
| **Core** (Essenciais) | 8          | funcionarios, qualificacoes, certificacoes       |
| **Simuladores**       | 12         | simuladores, fichas, agendamentos, manobras      |
| **Treinamentos**      | 5          | catalogo_treinamentos, historico, compliance     |
| **Configuração**      | 4          | funcoes, setores, empresas, aeronaves            |
| **Sistema/Auditoria** | 4+         | backup_historico, importacoes_log, user_profiles |

---

### 🗂️ TABELAS CORE (Essenciais)

| #   | Tabela                         | Registros Estimados | Frequência Acesso | Prioridade Cache | Notas                  |
| --- | ------------------------------ | ------------------- | ----------------- | ---------------- | ---------------------- |
| 1   | **funcionarios**               | 100-500             | ⭐⭐⭐ Muito Alta | ⭐⭐⭐           | Base de toda aplicação |
| 2   | **qualificacoes**              | 200-1000            | ⭐⭐⭐ Muito Alta | ⭐⭐⭐           | Compliance crítico     |
| 3   | **certificacoes**              | 500-5000            | ⭐⭐⭐ Muito Alta | ⭐⭐             | Volume médio-alto      |
| 4   | **habilitacoes**               | 50-100              | ⭐⭐ Alta         | ⭐⭐⭐           | Pequeno, carrega tudo  |
| 5   | **historico_certificacoes_v2** | 1000-10000          | ⭐⭐ Alta         | ⭐               | Só sob demanda         |
| 6   | **compliance_status_v2**       | 500-2000            | ⭐⭐ Alta         | ⭐⭐             | Dashboard principal    |
| 7   | **user_profiles_v2**           | 10-50               | ⭐ Média          | ⭐⭐             | Poucos admins          |
| 8   | **empresas**                   | 1-5                 | ⭐ Baixa          | ⭐⭐⭐           | Quase estático         |

---

### 🎮 TABELAS DE SIMULADORES

| #   | Tabela                     | Registros Est. | Frequência        | Cache  | Notas                            |
| --- | -------------------------- | -------------- | ----------------- | ------ | -------------------------------- |
| 9   | **simuladores**            | 5-20           | ⭐⭐ Alta         | ⭐⭐⭐ | Lista pequena, cache longo       |
| 10  | **agendamentos_simulador** | 500-5000       | ⭐⭐⭐ Muito Alta | ⭐⭐   | Agenda semanal                   |
| 11  | **simulador_fichas**       | 5000-20000     | ⭐⭐⭐ Muito Alta | ⭐     | **MAIOR TABELA**                 |
| 12  | **fichas**                 | 5000-20000     | ⭐⭐⭐ Muito Alta | ⭐     | Relacionado com simulador_fichas |
| 13  | **manobras**               | 100-500        | ⭐⭐ Alta         | ⭐⭐⭐ | Catálogo de manobras             |
| 14  | **avaliacoes_manobras**    | 10000-50000    | ⭐⭐ Alta         | ⭐     | Detalhes de cada ficha           |
| 15  | **template_manobras**      | 200-1000       | ⭐ Média          | ⭐⭐   | Templates de sessão              |
| 16  | **sessoes_template**       | 50-200         | ⭐ Média          | ⭐⭐   | Modelos de treinamento           |
| 17  | **agendamento_slots**      | 1000-5000      | ⭐⭐ Alta         | ⭐     | Slots de agenda                  |
| 18  | **simulador_historico**    | 5000-20000     | ⭐ Baixa          | ⭐     | Histórico antigo                 |
| 19  | **frms_eventos**           | 100-1000       | ⭐ Média          | ⭐     | FRMS tracking                    |
| 20  | **frms_sessoes**           | 500-2000       | ⭐ Média          | ⭐     | FRMS sessions                    |

---

### 📚 TABELAS DE TREINAMENTOS

| #   | Tabela                       | Registros Est. | Frequência        | Cache  | Notas                |
| --- | ---------------------------- | -------------- | ----------------- | ------ | -------------------- |
| 21  | **catalogo_treinamentos_v2** | 50-200         | ⭐⭐⭐ Muito Alta | ⭐⭐⭐ | Catálogo principal   |
| 22  | **treinamento_sessoes**      | 200-1000       | ⭐⭐ Alta         | ⭐⭐   | Sessões de treino    |
| 23  | **tipos_qualificacoes**      | 20-50          | ⭐⭐ Alta         | ⭐⭐⭐ | Quase estático       |
| 24  | **certificacoes_funcao**     | 100-500        | ⭐ Média          | ⭐⭐   | Relacionamento       |
| 25  | **manobras_catalogo**        | 50-200         | ⭐ Média          | ⭐⭐   | Catálogo alternativo |

---

### ⚙️ TABELAS DE CONFIGURAÇÃO

| #   | Tabela              | Registros Est. | Frequência        | Cache  | Notas                 |
| --- | ------------------- | -------------- | ----------------- | ------ | --------------------- |
| 26  | **funcoes**         | 10-50          | ⭐⭐⭐ Muito Alta | ⭐⭐⭐ | Funções/cargos        |
| 27  | **setores**         | 10-30          | ⭐⭐⭐ Muito Alta | ⭐⭐⭐ | Setores/departamentos |
| 28  | **aeronaves**       | 10-50          | ⭐⭐ Alta         | ⭐⭐⭐ | Frota de aeronaves    |
| 29  | **tipos_simulador** | 5-20           | ⭐ Média          | ⭐⭐⭐ | Tipos de simulador    |

---

### 🔧 TABELAS DE SISTEMA/AUDITORIA

| #   | Tabela                     | Registros Est. | Frequência | Cache | Notas             |
| --- | -------------------------- | -------------- | ---------- | ----- | ----------------- |
| 30  | **backup_historico**       | 100-500        | ⭐ Baixa   | ❌    | Só admin          |
| 31  | **importacoes_log**        | 50-200         | ⭐ Baixa   | ❌    | Logs de import    |
| 32  | **pasta_virtual**          | 100-1000       | ⭐ Média   | ⭐    | Documentos        |
| 33  | **pasta_virtual_arquivos** | 500-5000       | ⭐ Média   | ⭐    | Arquivos dos docs |

---

## 2. ESTRATÉGIA DE CARREGAMENTO

### 🎯 Decisões de Arquitetura

#### **Quando Carregar?**

| Estratégia               | Quando Usar                                   | Tabelas                                             |
| ------------------------ | --------------------------------------------- | --------------------------------------------------- |
| ⚡ **Ao Login**          | Tabelas pequenas e críticas (< 100 registros) | funcoes, setores, habilitacoes, empresas, aeronaves |
| 📄 **Sob Demanda**       | Tabelas grandes ou específicas de páginas     | funcionarios, qualificacoes, certificacoes, fichas  |
| 🔄 **Refresh Periódico** | Dados mutáveis em dashboards                  | agendamentos, compliance_status                     |
| 💤 **Lazy Load**         | Dados históricos ou raramente usados          | historico_certificacoes, backup_historico           |

#### **Como Armazenar?**

| Método              | Quando Usar                             | Vantagens                              |
| ------------------- | --------------------------------------- | -------------------------------------- |
| 🧠 **React Query**  | Maioria dos dados (90%)                 | Cache inteligente, retry, invalidation |
| 📦 **Context API**  | Dados globais pequenos (< 50 registros) | Acesso rápido, sem fetch               |
| 💾 **LocalStorage** | Configurações do usuário                | Persiste entre sessões                 |
| 🎯 **Estado Local** | Dados temporários de formulários        | Não precisa persistir                  |

#### **Paginação?**

| Tabela           | Paginação? | Tamanho Página | Tipo                |
| ---------------- | ---------- | -------------- | ------------------- |
| funcionarios     | ✅ Sim     | 50             | Offset              |
| qualificacoes    | ✅ Sim     | 50             | Offset              |
| certificacoes    | ✅ Sim     | 50             | Offset              |
| simulador_fichas | ✅ Sim     | 20             | **Infinite Scroll** |
| agendamentos     | ✅ Sim     | 100            | Offset              |
| habilitacoes     | ❌ Não     | -              | Carrega tudo (~50)  |
| funcoes          | ❌ Não     | -              | Carrega tudo (~20)  |
| setores          | ❌ Não     | -              | Carrega tudo (~15)  |

---

### 📋 MATRIZ DE DECISÃO COMPLETA

| Tabela                      | Quando         | Armazenamento  | Paginação        | Hook                 | Invalidação     |
| --------------------------- | -------------- | -------------- | ---------------- | -------------------- | --------------- |
| **funcionarios**            | 📄 Sob demanda | 🧠 React Query | ✅ 50            | `useFuncionarios()`  | Ao editar/criar |
| **qualificacoes**           | 📄 Sob demanda | 🧠 React Query | ✅ 50            | `useQualificacoes()` | Ao editar/criar |
| **certificacoes**           | 📄 Sob demanda | 🧠 React Query | ✅ 50            | `useCertificacoes()` | Ao editar/criar |
| **habilitacoes**            | ⚡ Ao login    | 📦 Context     | ❌               | `useHabilitacoes()`  | Raramente       |
| **funcoes**                 | ⚡ Ao login    | 📦 Context     | ❌               | `useFuncoes()`       | Raramente       |
| **setores**                 | ⚡ Ao login    | 📦 Context     | ❌               | `useSetores()`       | Raramente       |
| **empresas**                | ⚡ Ao login    | 📦 Context     | ❌               | `useEmpresa()`       | Raramente       |
| **aeronaves**               | ⚡ Ao login    | 📦 Context     | ❌               | `useAeronaves()`     | Ao editar       |
| **simuladores**             | ⚡ Ao login    | 📦 Context     | ❌               | `useSimuladores()`   | Ao editar       |
| **agendamentos**            | 🔄 Refresh 30s | 🧠 React Query | ✅ 100           | `useAgendamentos()`  | Real-time       |
| **simulador_fichas**        | 📄 Sob demanda | 🧠 React Query | ✅ 20 (infinite) | `useFichas()`        | Ao criar        |
| **manobras**                | ⚡ Ao login    | 📦 Context     | ❌               | `useManobras()`      | Raramente       |
| **catalogo_treinamentos**   | ⚡ Ao login    | 📦 Context     | ❌               | `useTreinamentos()`  | Ao editar       |
| **compliance_status**       | 🔄 Refresh 60s | 🧠 React Query | ✅ 50            | `useCompliance()`    | Ao mudar cert   |
| **historico_certificacoes** | 💤 Lazy        | 🧠 React Query | ✅ 50            | `useHistorico()`     | Append only     |
| **tipos_qualificacoes**     | ⚡ Ao login    | 📦 Context     | ❌               | `useTiposQual()`     | Raramente       |
| **user_profiles**           | 📄 Sob demanda | 🧠 React Query | ❌               | `useUserProfile()`   | Ao editar       |
| **backup_historico**        | 💤 Lazy        | 🧠 React Query | ✅ 20            | `useBackups()`       | Ao criar backup |
| **pasta_virtual**           | 📄 Sob demanda | 🧠 React Query | ✅ 30            | `usePastaVirtual()`  | Ao upload       |

---

## 3. ARQUITETURA DE HOOKS

### 🏗️ Estrutura de Diretórios

```
src/react-app/hooks/
├─ data/                      # Hooks de data fetching
│  ├─ useFuncionarios.ts
│  ├─ useQualificacoes.ts
│  ├─ useCertificacoes.ts
│  ├─ useFichas.ts
│  ├─ useAgendamentos.ts
│  ├─ useCompliance.ts
│  ├─ useHistorico.ts
│  ├─ useTreinamentos.ts
│  ├─ useBackups.ts
│  └─ usePastaVirtual.ts
│
├─ context/                   # Context providers
│  ├─ HabilitacoesProvider.tsx
│  ├─ FuncoesProvider.tsx
│  ├─ SetoresProvider.tsx
│  ├─ AeronavesProvider.tsx
│  ├─ SimuladoresProvider.tsx
│  ├─ ManobrasProvider.tsx
│  └─ TreinamentosProvider.tsx
│
├─ utils/                     # Hooks utilitários
│  ├─ useDebounce.ts
│  ├─ usePagination.ts
│  ├─ useInfiniteScroll.ts
│  ├─ useLocalStorage.ts
│  └─ useAsync.ts
│
└─ index.ts                   # Exports centralizados
```

---

### 📝 TEMPLATES DE IMPLEMENTAÇÃO

#### **Template 1: Hook com React Query (Paginado)**

```typescript
// src/react-app/hooks/data/useFuncionarios.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/services/api-client';

export interface FuncionariosFilters {
  search?: string;
  setor?: string;
  funcao?: string;
  status?: 'ativo' | 'inativo';
  page?: number;
  limit?: number;
}

export interface Funcionario {
  id: string;
  nome: string;
  matricula: string;
  email: string;
  cpf: string;
  setor: string;
  funcao: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface FuncionariosResponse {
  data: Funcionario[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Hook principal
export function useFuncionarios(filters: FuncionariosFilters = {}) {
  return useQuery<FuncionariosResponse>({
    queryKey: ['funcionarios', filters],
    queryFn: () => apiClient.get('/funcionarios', { params: filters }),
    staleTime: 5 * 60 * 1000, // 5 minutos
    cacheTime: 30 * 60 * 1000, // 30 minutos
    retry: 2,
    refetchOnWindowFocus: false,
    keepPreviousData: true, // Smooth pagination
  });
}

// Hook para um funcionário específico
export function useFuncionario(id: string) {
  return useQuery<Funcionario>({
    queryKey: ['funcionario', id],
    queryFn: () => apiClient.get(`/funcionarios/${id}`),
    staleTime: 10 * 60 * 1000,
    enabled: !!id, // Só busca se id existir
  });
}

// Hook para criar
export function useCreateFuncionario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Funcionario>) => apiClient.post('/funcionarios', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funcionarios'] });
    },
  });
}

// Hook para atualizar
export function useUpdateFuncionario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Funcionario> }) =>
      apiClient.put(`/funcionarios/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['funcionarios'] });
      queryClient.invalidateQueries({ queryKey: ['funcionario', variables.id] });
    },
  });
}

// Hook para deletar (soft delete)
export function useDeleteFuncionario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/funcionarios/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funcionarios'] });
    },
  });
}
```

**Uso:**

```tsx
// Em um componente:
function FuncionariosPage() {
  const [filters, setFilters] = useState({ page: 1, limit: 50 });
  const { data, isLoading, error } = useFuncionarios(filters);
  const createMutation = useCreateFuncionario();

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      <button onClick={() => createMutation.mutate({ nome: 'João' })}>Criar Funcionário</button>

      {data?.data.map((func) => (
        <div key={func.id}>{func.nome}</div>
      ))}

      <Pagination
        page={filters.page}
        total={data?.total}
        onChange={(page) => setFilters({ ...filters, page })}
      />
    </div>
  );
}
```

---

#### **Template 2: Context Provider (Dados Estáticos)**

```typescript
// src/react-app/hooks/context/SetoresProvider.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiClient } from '@/services/api-client';

interface Setor {
  id: string;
  nome: string;
  codigo: string;
  ativo: boolean;
}

interface SetoresContextType {
  setores: Setor[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

const SetoresContext = createContext<SetoresContextType | null>(null);

export function SetoresProvider({ children }: { children: ReactNode }) {
  const [setores, setSetores] = useState<Setor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadSetores = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get('/setores');
      setSetores(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSetores();
  }, []);

  return (
    <SetoresContext.Provider
      value={{
        setores,
        loading,
        error,
        refresh: loadSetores,
      }}
    >
      {children}
    </SetoresContext.Provider>
  );
}

export function useSetores() {
  const context = useContext(SetoresContext);
  if (!context) {
    throw new Error('useSetores must be used within SetoresProvider');
  }
  return context;
}
```

**Setup no App:**

```tsx
// src/react-app/App.tsx
import { SetoresProvider } from '@/hooks/context/SetoresProvider';
import { FuncoesProvider } from '@/hooks/context/FuncoesProvider';
// ... outros providers

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SetoresProvider>
        <FuncoesProvider>{/* ... resto da app */}</FuncoesProvider>
      </SetoresProvider>
    </QueryClientProvider>
  );
}
```

**Uso:**

```tsx
function FuncionarioForm() {
  const { setores, loading } = useSetores();

  return (
    <select>
      {setores.map((setor) => (
        <option key={setor.id} value={setor.id}>
          {setor.nome}
        </option>
      ))}
    </select>
  );
}
```

---

#### **Template 3: Infinite Scroll Hook**

```typescript
// src/react-app/hooks/data/useFichas.ts
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/api-client';

export interface FichasFilters {
  funcionario_id?: string;
  simulador_id?: string;
  data_inicio?: string;
  data_fim?: string;
}

export function useFichasInfinite(filters: FichasFilters = {}) {
  return useInfiniteQuery({
    queryKey: ['fichas', 'infinite', filters],
    queryFn: ({ pageParam = 1 }) =>
      apiClient.get('/simulador-fichas', {
        params: { ...filters, page: pageParam, limit: 20 },
      }),
    getNextPageParam: (lastPage, pages) => {
      return lastPage.hasMore ? pages.length + 1 : undefined;
    },
    staleTime: 2 * 60 * 1000,
  });
}
```

**Uso com Infinite Scroll:**

```tsx
function FichasList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useFichasInfinite({
    funcionario_id: '123',
  });

  const observerRef = useRef<IntersectionObserver>();
  const lastElementRef = useCallback(
    (node: HTMLDivElement) => {
      if (isFetchingNextPage) return;
      if (observerRef.current) observerRef.current.disconnect();

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage) {
          fetchNextPage();
        }
      });

      if (node) observerRef.current.observe(node);
    },
    [isFetchingNextPage, hasNextPage, fetchNextPage],
  );

  return (
    <div>
      {data?.pages.map((page, i) => (
        <div key={i}>
          {page.data.map((ficha, index) => {
            const isLast = i === data.pages.length - 1 && index === page.data.length - 1;

            return (
              <div key={ficha.id} ref={isLast ? lastElementRef : null}>
                {ficha.titulo}
              </div>
            );
          })}
        </div>
      ))}
      {isFetchingNextPage && <LoadingSpinner />}
    </div>
  );
}
```

---

## 4. OTIMIZAÇÃO DE ENDPOINTS

### 🎯 Padrão de Endpoints

Para cada tabela principal, criar 3 endpoints otimizados:

#### **1. GET /list** - Listagem Paginada com Filtros

```typescript
// GET /api/v2/funcionarios/list
// Query params: page, limit, search, setor, funcao, status

interface ListParams {
  page: number; // default: 1
  limit: number; // default: 50, max: 100
  search?: string; // busca em nome, matricula, email
  setor?: string; // filtro por setor
  funcao?: string; // filtro por função
  status?: string; // ativo, inativo
  sortBy?: string; // campo para ordenar
  sortOrder?: 'asc' | 'desc';
}

// Response:
interface ListResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}
```

---

#### **2. GET /count** - Apenas Contagem (Para Stats)

```typescript
// GET /api/v2/funcionarios/count
// Query params: mesmos filtros do /list

interface CountParams {
  search?: string;
  setor?: string;
  funcao?: string;
  status?: string;
}

// Response:
interface CountResponse {
  total: number;
  byStatus?: {
    ativo: number;
    inativo: number;
  };
  bySetor?: Record<string, number>;
}
```

**Vantagem:** Dashboard não precisa carregar dados completos, só contadores

---

#### **3. GET /aggregate** - Dados Agregados (Para Dashboards)

```typescript
// GET /api/v2/funcionarios/aggregate

// Response:
interface AggregateResponse {
  total: number;
  ativos: number;
  inativos: number;
  por_setor: {
    nome: string;
    count: number;
  }[];
  por_funcao: {
    nome: string;
    count: number;
  }[];
  com_certificacao_vencida: number;
  sem_qualificacao: number;
  // ... outras métricas úteis
}
```

**Vantagem:** 1 request ao invés de 10+ para montar dashboard

---

### 📋 ENDPOINTS A CRIAR

#### **Prioridade ALTA (Esta Semana):**

```
✅ GET /funcionarios/list
✅ GET /funcionarios/count
✅ GET /funcionarios/aggregate

✅ GET /qualificacoes/list
✅ GET /qualificacoes/count
✅ GET /qualificacoes/aggregate

✅ GET /certificacoes/list
✅ GET /certificacoes/count
✅ GET /certificacoes/aggregate

✅ GET /simulador-fichas/list
✅ GET /simulador-fichas/count
✅ GET /simulador-fichas/aggregate
```

#### **Prioridade MÉDIA (Próxima Semana):**

```
✅ GET /agendamentos/list
✅ GET /agendamentos/count
✅ GET /agendamentos/aggregate

✅ GET /compliance/list
✅ GET /compliance/count
✅ GET /compliance/aggregate

✅ GET /historico-certificacoes/list
✅ GET /historico-certificacoes/count
```

#### **Prioridade BAIXA (Quando Necessário):**

```
✅ GET /backup-historico/list
✅ GET /pasta-virtual/list
✅ GET /importacoes-log/list
```

---

### 🚀 Exemplo de Implementação

```typescript
// src/worker/api/v2/funcionarios.ts

// Endpoint /list
router.get('/list', async (c) => {
  const { page = 1, limit = 50, search, setor, funcao, status } = c.req.query();

  // Validação
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  // Build query
  const params: any[] = [];
  let whereClause = 'WHERE deleted_at IS NULL';

  if (search) {
    whereClause += ' AND (nome LIKE ? OR matricula LIKE ? OR email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (setor) {
    whereClause += ' AND setor = ?';
    params.push(setor);
  }

  if (funcao) {
    whereClause += ' AND funcao = ?';
    params.push(funcao);
  }

  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }

  // Query data
  const query = `
    SELECT id, nome, matricula, email, cpf, setor, funcao, status, 
           created_at, updated_at
    FROM funcionarios
    ${whereClause}
    ORDER BY nome ASC
    LIMIT ? OFFSET ?
  `;

  const data = await c.env.DB.prepare(query)
    .bind(...params, limitNum, offset)
    .all();

  // Query total
  const countQuery = `SELECT COUNT(*) as total FROM funcionarios ${whereClause}`;
  const totalResult = await c.env.DB.prepare(countQuery)
    .bind(...params)
    .first();

  const total = totalResult.total;
  const totalPages = Math.ceil(total / limitNum);

  return c.json({
    data: data.results,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      hasMore: pageNum < totalPages,
    },
  });
});

// Endpoint /count
router.get('/count', async (c) => {
  const { setor, funcao, status } = c.req.query();

  // ... similar filter logic

  const countQuery = `
    SELECT COUNT(*) as total,
           SUM(CASE WHEN status = 'ativo' THEN 1 ELSE 0 END) as ativos,
           SUM(CASE WHEN status = 'inativo' THEN 1 ELSE 0 END) as inativos
    FROM funcionarios
    WHERE deleted_at IS NULL
  `;

  const result = await c.env.DB.prepare(countQuery).first();

  return c.json(result);
});

// Endpoint /aggregate
router.get('/aggregate', async (c) => {
  const queries = await Promise.all([
    // Total e por status
    c.env.DB.prepare(
      `
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = 'ativo' THEN 1 ELSE 0 END) as ativos,
             SUM(CASE WHEN status = 'inativo' THEN 1 ELSE 0 END) as inativos
      FROM funcionarios WHERE deleted_at IS NULL
    `,
    ).first(),

    // Por setor
    c.env.DB.prepare(
      `
      SELECT setor as nome, COUNT(*) as count
      FROM funcionarios
      WHERE deleted_at IS NULL
      GROUP BY setor
      ORDER BY count DESC
    `,
    ).all(),

    // Por função
    c.env.DB.prepare(
      `
      SELECT funcao as nome, COUNT(*) as count
      FROM funcionarios
      WHERE deleted_at IS NULL
      GROUP BY funcao
      ORDER BY count DESC
    `,
    ).all(),
  ]);

  return c.json({
    ...queries[0],
    por_setor: queries[1].results,
    por_funcao: queries[2].results,
  });
});
```

---

## 5. PLANO DE IMPLEMENTAÇÃO

### 📅 ROADMAP

#### **Semana 1: Foundation (40 horas)**

**Dia 1-2: Setup e Infraestrutura (16h)**

- [ ] Instalar e configurar React Query
- [ ] Criar estrutura de diretórios `hooks/`
- [ ] Criar `api-client.ts` centralizado
- [ ] Setup de tipos TypeScript
- [ ] Documentar padrões

**Dia 3-4: Context Providers (16h)**

- [ ] Criar 7 context providers (setores, funcoes, habilitacoes, etc.)
- [ ] Integrar no App.tsx
- [ ] Testar carregamento inicial
- [ ] Migrar páginas que usam esses dados

**Dia 5: Hooks Utilitários (8h)**

- [ ] Criar `useDebounce.ts`
- [ ] Criar `usePagination.ts`
- [ ] Criar `useInfiniteScroll.ts`
- [ ] Documentar uso

---

#### **Semana 2: Data Hooks - Parte 1 (40 horas)**

**Dia 1: Funcionários (8h)**

- [ ] Criar `useFuncionarios.ts`
- [ ] Criar `useCreateFuncionario.ts`
- [ ] Criar `useUpdateFuncionario.ts`
- [ ] Criar `useDeleteFuncionario.ts`
- [ ] Migrar 5 páginas

**Dia 2: Qualificações (8h)**

- [ ] Criar `useQualificacoes.ts` (com filtros complexos)
- [ ] Criar mutations (create, update, delete)
- [ ] Migrar página principal
- [ ] Migrar página de importação

**Dia 3: Certificações (8h)**

- [ ] Criar `useCertificacoes.ts`
- [ ] Criar `useCertificacoesByFuncionario.ts`
- [ ] Criar mutations
- [ ] Migrar páginas

**Dia 4: Simuladores (8h)**

- [ ] Criar `useFichas.ts` (infinite scroll)
- [ ] Criar `useAgendamentos.ts`
- [ ] Criar `useManobras.ts`
- [ ] Migrar agenda semanal

**Dia 5: Compliance e Dashboard (8h)**

- [ ] Criar `useCompliance.ts`
- [ ] Criar `useDashboardStats.ts`
- [ ] Otimizar dashboard principal
- [ ] Testes de performance

---

#### **Semana 3: Endpoints API (40 horas)**

**Dia 1-2: Endpoints Funcionários (16h)**

- [ ] Criar `/funcionarios/list`
- [ ] Criar `/funcionarios/count`
- [ ] Criar `/funcionarios/aggregate`
- [ ] Adicionar índices D1
- [ ] Testes de carga

**Dia 3: Endpoints Qualificações (8h)**

- [ ] Criar `/qualificacoes/list`
- [ ] Criar `/qualificacoes/count`
- [ ] Criar `/qualificacoes/aggregate`
- [ ] Otimizar queries

**Dia 4: Endpoints Certificações (8h)**

- [ ] Criar `/certificacoes/list`
- [ ] Criar `/certificacoes/count`
- [ ] Criar `/certificacoes/aggregate`
- [ ] Otimizar queries

**Dia 5: Endpoints Simuladores (8h)**

- [ ] Criar `/simulador-fichas/list`
- [ ] Criar `/simulador-fichas/count`
- [ ] Criar `/agendamentos/list`
- [ ] Otimizar queries pesadas

---

#### **Semana 4: Migração e Otimização (40 horas)**

**Dia 1-3: Migrar Páginas Restantes (24h)**

- [ ] Migrar 20+ páginas para usar novos hooks
- [ ] Remover fetch direto
- [ ] Aplicar React.memo onde necessário
- [ ] Otimizar re-renders

**Dia 4: Testes e Validação (8h)**

- [ ] Testar todas as funcionalidades
- [ ] Medir métricas de performance
- [ ] Corrigir bugs encontrados
- [ ] Validar cache e invalidation

**Dia 5: Documentação e Deploy (8h)**

- [ ] Documentar todos os hooks
- [ ] Criar guia de uso
- [ ] Code review final
- [ ] Deploy em produção

---

### 📊 MÉTRICAS DE SUCESSO

#### **Antes (Atual):**

```
❌ Fetch direto em páginas: 182
❌ Duplicação de fetch logic: ~80%
❌ Cache: Não implementado
❌ Retry automático: Não
❌ Loading states: Inconsistentes
❌ Performance: Dashboard ~5-10s
```

#### **Depois (Meta):**

```
✅ Fetch direto: 0 (100% via hooks)
✅ Duplicação: <5%
✅ Cache: React Query (5min stale time)
✅ Retry automático: 2x
✅ Loading states: Padronizados
✅ Performance: Dashboard <1s
```

---

### 🎯 PRÓXIMOS PASSOS IMEDIATOS

**Hoje (4 horas):**

1. [ ] Instalar React Query: `npm install @tanstack/react-query`
2. [ ] Criar estrutura `hooks/data/`, `hooks/context/`, `hooks/utils/`
3. [ ] Criar primeiro hook: `useFuncionarios.ts`
4. [ ] Testar em uma página simples

**Amanhã (8 horas):**

1. [ ] Criar 3 context providers (setores, funcoes, habilitacoes)
2. [ ] Integrar no App.tsx
3. [ ] Migrar 5 páginas para usar contexts
4. [ ] Documentar padrão

**Esta Semana (Completar Semana 1):**

- Concluir todos os context providers
- Criar hooks utilitários
- Migrar 10-15 páginas
- Setup completo de infraestrutura

---

**Documentação gerada automaticamente em:** 10/11/2025  
**Responsável:** Equipe Frontend  
**Próxima revisão:** 17/11/2025

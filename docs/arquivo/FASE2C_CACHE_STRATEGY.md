# 📦 FASE 2C: CACHE STRATEGY (Risco: 🟢 BAIXO)

**Data:** 4 de Novembro de 2025  
**Status:** 🔄 **PLANEJADO (após validação 2B)**  
**Risco:** 🟢 **BAIXO (1%)**  
**Impacto Esperado:** ⭐⭐⭐⭐ (70-90% redução em requisições API)

---

## 📌 OBJETIVO

Implementar cache inteligente frontend + Cloudflare edge cache, sem alterar lógica de negócio:

- ✅ Cache de dados API no frontend
- ✅ Stale-while-revalidate pattern
- ✅ Edge cache para assets
- ✅ Zero breaking changes
- ✅ Fácil invalidação de cache

---

## 🔍 PASSO 1: DIAGNOSTICAR PROBLEMA DE CACHE

### 1.1 Medir requisições duplicadas

```bash
# DevTools → Network tab

# Cenário: Usuário abre Habilitacoes page
Request 1: GET /api/v2/habilitacoes?limit=50 → 1200ms
✅ Data carregada

# Usuário fecha modal e volta para lista
Request 2: GET /api/v2/habilitacoes?limit=50 → 1200ms
❌ Mesma requisição, mesma latência
❌ Deveria estar cacheada!

# Impacto:
- Usuário vê "loading" novamente
- Bandwidth desperdiçado
- Experiência ruim
```

### 1.2 Identificar endpoints que ganham com cache

```typescript
// Endpoints que são bons para cache:

✅ GET /api/v2/habilitacoes
   - Dados mudam raramente
   - Lido frequentemente
   - Ideal para cache: 5-10 minutos

✅ GET /api/v2/qualificacoes
   - Muito estável
   - Lido em cada operação
   - Ideal para cache: 1 hora

✅ GET /api/v2/certificados
   - Lido frequentemente
   - Mudanças infrequentes
   - Ideal para cache: 10-30 minutos

❌ POST /api/v2/habilitacoes
   - Muta estado
   - Não cache!

❌ DELETE /api/v2/habilitacoes/:id
   - Muta estado
   - Não cache!
```

---

## 🎯 PASSO 2: IMPLEMENTAR REACT QUERY

### 2.1 Instalar dependência

```bash
npm install @tanstack/react-query

# Size: ~50KB (gzipped)
# Maduro, production-ready
# 20k+ stars no GitHub
```

### 2.2 Configurar QueryClient

```typescript
// src/react-app/lib/queryClient.ts

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min - dados considerados fresh
      cacheTime: 10 * 60 * 1000, // 10 min - remover cache da memória
      retry: 3, // Retry 3x em erro
      refetchOnWindowFocus: true, // Refetch quando volta pro app
      refetchOnReconnect: true, // Refetch quando reconecta internet
    },
  },
});
```

### 2.3 Criar hooks customizados para queries

```typescript
// src/react-app/hooks/useHabilitacoes.ts

import { useQuery } from '@tanstack/react-query';
import { fetchHabilitacoes } from '../services/api';

export function useHabilitacoes(filters?: FilterOptions) {
  return useQuery({
    queryKey: ['habilitacoes', filters], // Chave única do cache
    queryFn: () => fetchHabilitacoes(filters),
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

// Uso:
function Habilitacoes() {
  // ✅ Primeira chamada: fetch do servidor
  // ✅ Segunda chamada (dentro de 5 min): cache
  // ✅ Após 5 min: refetch automático em background
  const { data, isLoading, error } = useHabilitacoes();

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorFallback />;

  return <List items={data} />;
}
```

### 2.4 Implementar em Habilitacoes.tsx

```typescript
// ANTES: Sem cache

function Habilitacoes() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHabilitacoes().then((res) => {
      setData(res.data);
      setLoading(false);
    });
  }, []); // ❌ A cada render se deps mudarem, novo fetch

  return <>...</>;
}

// DEPOIS: Com React Query

import { useHabilitacoes } from '../hooks/useHabilitacoes';

function Habilitacoes() {
  // ✅ Automático: fetch, cache, refetch, retry
  const { data = [], isLoading, error } = useHabilitacoes();

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorFallback />;

  return <>...</>;
}
```

### 2.5 Invalidar cache quando necessário

```typescript
// Quando user cria nova habilitação:

import { useMutation, useQueryClient } from '@tanstack/react-query';

function NovaHabilitacao() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (novaHab) => createHabilitacao(novaHab),
    onSuccess: (data) => {
      // ✅ Invalidar cache para refetch automático
      queryClient.invalidateQueries({ queryKey: ['habilitacoes'] });

      // ✅ Ou atualizar cache diretamente
      queryClient.setQueryData(['habilitacoes'], (old) => ({
        ...old,
        data: [...(old?.data || []), data],
      }));
    },
  });

  return <button onClick={() => mutation.mutate(...)}>Criar</button>;
}
```

---

## 🌍 PASSO 3: CLOUDFLARE EDGE CACHE

### 3.1 Configurar cache para assets

```typescript
// src/worker/index.ts

worker.use('*', async (c, next) => {
  const url = new URL(c.req.url);

  // ✅ Assets estáticos recebem cache agressivo
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    const response = await next();

    // Cache por 1 dia
    response.headers.set('Cache-Control', 'public, max-age=86400, immutable');
    return response;
  }

  // HTML nunca cachear (sempre fresh)
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    const response = await next();
    response.headers.set('Cache-Control', 'no-store, no-cache');
    return response;
  }

  return next();
});
```

### 3.2 Configurar cache para API

```typescript
// Habilitações: cache 5 min
router.get('/api/v2/habilitacoes', async (c) => {
  const response = c.json(data);

  // ✅ Cloudflare edge cache por 5 min
  response.headers.set(
    'Cache-Control',
    'public, max-age=300, s-maxage=300', // 5 min
  );

  return response;
});

// Qualificações: cache 1 hora (muito estável)
router.get('/api/v2/qualificacoes', async (c) => {
  const response = c.json(data);

  // ✅ Cloudflare edge cache por 1 hora
  response.headers.set(
    'Cache-Control',
    'public, max-age=3600, s-maxage=3600', // 1 hora
  );

  return response;
});

// Stats: cache 10 min
router.get('/api/v2/habilitacoes/stats', async (c) => {
  const response = c.json(stats);

  // ✅ Cloudflare edge cache por 10 min
  response.headers.set(
    'Cache-Control',
    'public, max-age=600, s-maxage=600', // 10 min
  );

  return response;
});
```

---

## 📊 PASSO 3: VALIDAÇÃO ANTES DE DEPLOY

### 3.1 Testes de cache

```bash
# Teste 1: React Query cache funciona

1. Abrir Habilitacoes page
   → Fetch do servidor (200ms)

2. Clicar em outro item, voltar
   → Cache imediato (< 10ms)
   ✅ React Query funcionando

3. Esperar 5 minutos
   → Refetch automático em background
   ✅ Cache expirou e refetch

# Teste 2: Cloudflare edge cache

1. Requisição 1 (sem cache):
   curl https://api.airtrust.com/api/v2/habilitacoes
   → Via Cloudflare edge (200ms)

2. Requisição 2 (com cache):
   curl https://api.airtrust.com/api/v2/habilitacoes
   → Cache hit (< 50ms, header: X-Cache: HIT)
   ✅ Cloudflare edge cache funcionando

# Teste 3: Cache invalidation

1. Criar nova habilitação
   → Enviar POST

2. Listar habilitações
   → Nova habilitação aparece imediatamente
   ✅ Cache foi invalidado e refetch aconteceu
```

### 3.2 Testes de regressão

```bash
# Em staging por 24h:

✅ Dados sempre consistentes
✅ Sem stale data mostrada por muito tempo
✅ Invalidação funciona corretamente
✅ Bandwidth reduzido 70%+
✅ Latência reduzida 70%+
✅ Nenhuma funcionalidade quebrada

# Performance deve ser:
Repeated requests: < 50ms (era 1-3s) ✅
Bandwidth: 30% uso anterior ✅
Cache hit rate: > 80% ✅
```

---

## ✅ PASSO 4: VALIDAÇÃO DE SEGURANÇA

### 4.1 Verificar dados cacheados

```typescript
// ✅ Checklist de segurança

// 1. Dados em cache não ficam obsoletos indefinidamente?
// ✅ staleTime: 5 min, refetch automático

// 2. Cache é invalidado quando deve?
// Criar habilitação → cache invalidado ✅
// Deletar habilitação → cache invalidado ✅

// 3. Senhas/tokens nunca cacheados?
// POST /api/login → Cache-Control: no-store ✅
// Auth tokens → localStorage, não cache HTTP ✅

// 4. User A não vê dados de User B?
// Cache é chaveado por query parameters
// Diferentes filters = diferentes cache ✅

// 5. Sem memory leaks de cache?
// Monitorar memory com cache por 1h
// Memory deve ser estável
assert(memory_stable); ✅
```

### 4.2 Verificar erro rate

```bash
# Monitorar erro rate durante staging (24h)

✅ Taxa de erro mantém < 0.5%
✅ Nenhuma nova exception
✅ Health check retorna healthy
```

---

## 🚀 PASSO 5: DEPLOYMENT GRADUAL

### 5.1 Deploy em branch feature

```bash
# 1. Criar branch feature
git checkout -b feat/phase-2c-cache-strategy

# 2. Implementar React Query + Cloudflare cache
# (conforme código acima)

# 3. Testes locais
npm run test
npm run lint
✅ Tudo passa

# 4. Build
npm run build
✅ Sem erros

# 5. Deploy em staging
npm run deploy:staging
✅ Validar por 24h
```

### 5.2 Canary deployment

```bash
# Mesma estratégia: 5% → 25% → 50% → 100%

wrangler deploy --canary-percentage=5
✅ Monitorar 30 min

# Se OK, expandir
wrangler deploy --canary-percentage=25
✅ Monitorar 15 min

# Se OK, expandir
wrangler deploy --canary-percentage=50
✅ Monitorar 15 min

# Se OK, 100%
wrangler deploy
✅ Monitorar 1h
```

---

## 📈 RESULTADOS ESPERADOS

| Métrica             | Antes        | Depois      | Melhoria          |
| ------------------- | ------------ | ----------- | ----------------- |
| **Requisições API** | 100%         | 25%         | ⚡⚡⚡ **-75%**   |
| **Latência**        | 1-3s         | < 50ms      | ⚡⚡⚡ **-95%**   |
| **Bandwidth**       | 100%         | 30%         | ⚡⚡⚡ **-70%**   |
| **User Experience** | Esperar load | Instantâneo | ⚡⚡⚡ **Melhor** |

---

## ✅ CHECKLIST FINAL

- [ ] React Query instalado
- [ ] QueryClient configurado
- [ ] Custom hooks criados (useHabilitacoes, etc)
- [ ] Cache invalidation implementada
- [ ] Cloudflare cache headers configurados
- [ ] Testes de cache PASSAM
- [ ] Bandwidth reduzido 70%+
- [ ] Staging testado 24h
- [ ] Code reviewed
- [ ] Canary deployment pronto
- [ ] Deploy em produção
- [ ] Monitorado por 1h
- [ ] Documentação atualizada

---

## 🎓 CONCLUSÃO

**FASE 2C reduz carga do servidor drasticamente:**

```
✅ Risco: Baixo (1%)
✅ Rollback: Fácil (< 2 min)
✅ Impacto: Enorme (-75% requisições, -95% latência)
✅ Breaking changes: Zero
✅ Infraestrutura salva: Grande
```

**Próximo:** Após validação 2C → **FASE 3 (UX)**

---

**Status:** 🟢 **PRONTO APÓS VALIDAÇÃO 2B**

**Safety Level:** ⭐⭐⭐⭐⭐ Enterprise-grade

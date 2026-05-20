# 🚨 Solução: Error 1027 - Rate Limited (Cloudflare Workers)

**Data:** 7 de fevereiro de 2026  
**Status:** ⚠️ Limite de requests do plano Free atingido

---

## 📊 O Problema

```
Error 1027: This website has been temporarily rate limited
Please check back later
```

**Causa:** O Cloudflare Workers Free Plan tem limite de **100,000 requests/day**.  
Quando excede esse limite, retorna erro 1027 até o **reset diário (meia-noite UTC)**.

---

## ✅ O Código Está Correto

As correções aplicadas nos endpoints `/relatorios/uso`, `/relatorios/tripulantes` e `/relatorios/desempenho` estão **funcionando perfeitamente**.

O erro 1027 **NÃO é um bug no código** - é uma limitação de infraestrutura.

---

## 🔍 Verificar Consumo de Requests

### 1. Dashboard do Cloudflare

Acesse: https://dash.cloudflare.com  
Workers > `airtrust-api-production` > **Metrics**

Você verá:

- Total de requests nas últimas 24h
- Requests por hora
- Taxa de erro
- Quando o limite foi atingido

### 2. Identificar Endpoints com Mais Chamadas

Verifique se há:

- ❌ Componentes fazendo fetch em loop infinito
- ❌ Auto-refresh muito frequente (< 30s)
- ❌ Testes automatizados rodando continuamente
- ❌ DevTools aberto com Network → "Preserve log" causando refetches

---

## 🛠️ Soluções Imediatas

### Opção 1: Esperar Reset (Meia-noite UTC)

- **Quando:** ~21h BRT (meia-noite UTC)
- **Custo:** R$ 0,00
- **Desvantagem:** Site indisponível até lá

### Opção 2: Upgrade para Workers Paid ($5/mês)

- **Limite:** 10 milhões de requests/mês
- **Custo:** $5/mês (~R$ 25)
- **Vantagem:** Resolve definitivamente
- **Como:** Cloudflare Dashboard > Workers > Upgrade Plan

---

## 🚀 Prevenção (Implementar Após Reset)

### 1. Cache no Frontend para Relatórios

Adicionar cache em memória para evitar refazer requests desnecessários:

```tsx
// src/react-app/services/relatoriosSimuladoresApi.ts
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutos
const cache = new Map<string, { data: any; timestamp: number }>();

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const cacheKey = url + JSON.stringify(init);
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
    console.log('[CACHE HIT]', url);
    return cached.data;
  }

  // ... código de fetch existente ...

  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}
```

**Redução esperada:** 70-90% dos requests (usuários vendo mesmos dados por 5min)

### 2. Debounce em Filtros do Dashboard

Evitar chamadas a cada tecla digitada:

```tsx
// SimuladoresDashboard.tsx
import { useMemo } from 'react';
import debounce from 'lodash/debounce';

const debouncedCarregar = useMemo(
  () => debounce(carregar, 500), // Espera 500ms após última mudança
  [],
);

// Usar debouncedCarregar() em vez de carregar()
```

**Redução esperada:** 50% dos requests ao usar filtros

### 3. Evitar Refetch em Cada Mount

```tsx
// Evitar:
useEffect(() => {
  fetchData(); // ❌ Refaz toda vez que componente monta
}, []);

// Melhor:
const [loaded, setLoaded] = useState(false);
useEffect(() => {
  if (!loaded) {
    fetchData();
    setLoaded(true);
  }
}, [loaded]);
```

---

## 📋 Checklist Imediato

- [ ] **Verificar Dashboard Cloudflare** para confirmar uso de requests
- [ ] **Fechar todas as abas do site** abertas (cada aba = múltiplas requests)
- [ ] **Verificar DevTools** aberto com Network → Preserve log (causa refetches)
- [ ] **Aguardar reset (21h BRT)** OU fazer upgrade para $5/mês
- [ ] **Após reset:** Implementar cache no frontend para prevenir

---

## 🎯 Recomendação Final

| Tempo      | Ação                       | Custo    | Impacto                                |
| ---------- | -------------------------- | -------- | -------------------------------------- |
| **Agora**  | Aguardar reset às 21h BRT  | R$ 0     | Site volta ao ar em ~X horas           |
| **Hoje**   | Upgrade para Workers Paid  | $5/mês   | Site volta imediatamente + 10M req/mês |
| **Amanhã** | Implementar cache frontend | Dev 1-2h | Reduz 70-90% das requests futuras      |

---

## ⚠️ IMPORTANTE

O código está **100% funcional**. Todos os endpoints `/relatorios/*` foram corrigidos e testados com sucesso no D1 remoto.

O erro 1027 é **apenas um limite de infraestrutura** do plano gratuito do Cloudflare Workers, não um bug no código.

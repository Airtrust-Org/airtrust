---
status: ativo
tipo: contexto
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: medio
ultima_revisao: "2026-07-05"
tags:
  - contexto
  - codigo
  - convencoes
---

# Contexto: Convenções de Código

> **BLOCO DE CONTEXTO OBRIGATÓRIO** para qualquer alteração de código.

## Estrutura de resposta de API

```typescript
// Sucesso
return c.json({ success: true, data: result }, 200);

// Erro
return c.json({ success: false, error: "Mensagem descritiva" }, 400);
```

## Validação com Zod

```typescript
import { zValidator } from '@hono/zod-validator';
app.post('/api/rota', zValidator('json', schema), async (c) => { ... });
```

## Acesso ao tenant

```typescript
const empresaId = c.get('empresaId');
const userId = c.get('userId');
```

## Query D1 com tenant

```typescript
const result = await c.env.DB.prepare(
  'SELECT * FROM tabela WHERE empresa_id = ? AND id = ?'
).bind(empresaId, id).first();
```

## Path alias
`@` → `./src` — usar em imports no frontend:
```typescript
import { fetchWithAuth } from '@/config/api';
```

## Nomenclatura
- Rotas: kebab-case (`qualificacoes-alertas.ts`)
- Tabelas: snake_case (`qualificacoes_tipos`)
- Funções: camelCase
- Componentes React: PascalCase
- Zod schemas: camelCase

## Lazy loading
```typescript
const Qualificacoes = lazyWithRetry(
  () => import('./pages/Qualificacoes'),
  'Qualificacoes'
);
```

## i18n
```typescript
import { useLanguage } from '@/i18n';
const { t } = useLanguage();
```

## Zustand stores
- Persistidas: localStorage (`useEscalaConfigStore`)
- Efêmeras: memória (`useEscalaUIStore`)

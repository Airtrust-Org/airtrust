# 🔴 DIAGNÓSTICO CRÍTICO: Endpoints Não Retornam Dados

**Data:** 11 de Novembro de 2025  
**Problema:** Banco D1 TEM dados (categorias, qualificações, modelos/manobras) mas endpoints retornam vazio  
**Status:** 🔴 INVESTIGANDO

---

## 📋 HIPÓTESES

1. **Rota não registrada** → GET retorna 404
2. **Query SQL incorreta** → Retorna vazio (data: [])
3. **WHERE clause muito restritiva** → Filtrando dados válidos
4. **CORS bloqueando** → Requisição falha no frontend
5. **Binding incorreto** → Erro ao buscar do D1

---

## 🧪 DIAGNÓSTICO RÁPIDO

### Teste 1: Verificar se rota existe

```bash
curl -v https://api.airtrust.dev/api/v2/categorias
# Esperado: 200 OK com { success: true, data: [...] }
# Ou: 404 Not Found se rota não existe
```

### Teste 2: Verificar logs do Worker

```bash
wrangler tail --format pretty
# Fazer request e ver logs em tempo real
```

### Teste 3: Verificar Database D1 diretamente

```bash
# No Wrangler Dashboard:
# 1. Ir em D1 Database
# 2. Ver tabelas: categorias, qualificacoes, simuladores_modelos
# 3. Verificar se têm registros com deleted_at IS NULL
```

---

## ✅ SOLUÇÃO: Endpoints Corretos

### 1. Endpoint Categorias

**Arquivo:** `src/worker/api/v2/categorias.ts`

```typescript
import { Hono } from 'hono';
import { Logger } from '../../utils/logger';
import { Env } from '../../types/index';

const categorias = new Hono<{ Bindings: Env }>();

// GET /api/v2/categorias
categorias.get('/', async (c) => {
  const db = c.env.DB;

  try {
    Logger.info('[categorias] Iniciando fetch...');

    const result = await db
      .prepare(
        `
        SELECT 
          id,
          codigo,
          nome,
          descricao,
          tipo,
          created_at,
          updated_at
        FROM categorias
        WHERE deleted_at IS NULL
        ORDER BY codigo ASC
      `,
      )
      .all();

    const total = (result.results || []).length;
    Logger.info(`[categorias] Retornando ${total} categorias`);

    return c.json({
      success: true,
      data: result.results || [],
      total: total,
    });
  } catch (error) {
    Logger.error('[categorias] Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao buscar categorias',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

// GET /api/v2/categorias/:id
categorias.get('/:id', async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;

  try {
    const categoria = await db
      .prepare(
        `
        SELECT id, codigo, nome, descricao, tipo, created_at, updated_at
        FROM categorias
        WHERE id = ? AND deleted_at IS NULL
      `,
      )
      .bind(id)
      .first();

    if (!categoria) {
      return c.json(
        {
          success: false,
          error: 'Categoria não encontrada',
        },
        404,
      );
    }

    return c.json({
      success: true,
      data: categoria,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

export default categorias;
```

### 2. Endpoint Qualificações (Completo com Stats)

**Arquivo:** `src/worker/api/v2/qualificacoes-detalhado.ts`

```typescript
import { Hono } from 'hono';
import { Logger } from '../../utils/logger';
import { Env } from '../../types/index';

const qualificacoes = new Hono<{ Bindings: Env }>();

// GET /api/v2/qualificacoes
qualificacoes.get('/', async (c) => {
  const db = c.env.DB;
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 100;
  const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!) : 0;

  try {
    Logger.info('[qualificacoes] Iniciando fetch...');

    // Buscar qualificações com categoria
    const result = await db
      .prepare(
        `
        SELECT 
          q.id,
          q.codigo,
          q.nome,
          q.descricao,
          q.categoria_id,
          c.codigo as categoria_codigo,
          c.nome as categoria_nome,
          q.validade_dias,
          q.tipo,
          q.created_at,
          q.updated_at
        FROM qualificacoes q
        LEFT JOIN categorias c ON c.id = q.categoria_id AND c.deleted_at IS NULL
        WHERE q.deleted_at IS NULL
        ORDER BY q.codigo ASC
        LIMIT ? OFFSET ?
      `,
      )
      .bind(limit, offset)
      .all();

    // Contar total
    const countResult = await db
      .prepare(`SELECT COUNT(*) as total FROM qualificacoes WHERE deleted_at IS NULL`)
      .first();

    const total = (countResult as any)?.total || 0;

    Logger.info(`[qualificacoes] Retornando ${result.results?.length || 0}/${total} qualificações`);

    return c.json({
      success: true,
      data: result.results || [],
      total: total,
      returned: result.results?.length || 0,
    });
  } catch (error) {
    Logger.error('[qualificacoes] Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao buscar qualificações',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

// GET /api/v2/qualificacoes/:id
qualificacoes.get('/:id', async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;

  try {
    const qualificacao = await db
      .prepare(
        `
        SELECT 
          q.id, q.codigo, q.nome, q.descricao,
          q.categoria_id, q.validade_dias, q.tipo,
          c.codigo as categoria_codigo,
          c.nome as categoria_nome,
          q.created_at, q.updated_at
        FROM qualificacoes q
        LEFT JOIN categorias c ON c.id = q.categoria_id
        WHERE q.id = ? AND q.deleted_at IS NULL
      `,
      )
      .bind(id)
      .first();

    if (!qualificacao) {
      return c.json(
        {
          success: false,
          error: 'Qualificação não encontrada',
        },
        404,
      );
    }

    return c.json({
      success: true,
      data: qualificacao,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

export default qualificacoes;
```

### 3. Endpoint Modelos com Manobras

**Arquivo:** `src/worker/api/v2/modelos-manobras.ts`

```typescript
import { Hono } from 'hono';
import { Logger } from '../../utils/logger';
import { Env } from '../../types/index';

const modelosManobras = new Hono<{ Bindings: Env }>();

// GET /api/v2/simuladores/:simulador_id/modelos
modelosManobras.get('/:simulador_id/modelos', async (c) => {
  const { simulador_id } = c.req.param();
  const db = c.env.DB;

  try {
    Logger.info(`[modelos] Buscando modelos para simulador: ${simulador_id}`);

    // Buscar modelos
    const modelosResult = await db
      .prepare(
        `
        SELECT 
          id,
          simulador_id,
          nome,
          codigo,
          descricao,
          ativo,
          ordem,
          created_at,
          updated_at
        FROM simuladores_modelos
        WHERE simulador_id = ? AND deleted_at IS NULL
        ORDER BY ordem ASC, nome ASC
      `,
      )
      .bind(simulador_id)
      .all();

    Logger.info(`[modelos] Encontrados ${modelosResult.results?.length || 0} modelos`);

    // Para cada modelo, buscar manobras
    const modelosComManobras = await Promise.all(
      (modelosResult.results || []).map(async (modelo: any) => {
        const manobrasResult = await db
          .prepare(
            `
            SELECT 
              id,
              modelo_id,
              nome,
              codigo,
              descricao,
              ordem,
              tempo_estimado,
              created_at,
              updated_at
            FROM simuladores_manobras
            WHERE modelo_id = ? AND deleted_at IS NULL
            ORDER BY ordem ASC, nome ASC
          `,
          )
          .bind(modelo.id)
          .all();

        return {
          ...modelo,
          manobras: manobrasResult.results || [],
        };
      }),
    );

    Logger.info(`[modelos] Retornando ${modelosComManobras.length} modelos com manobras`);

    return c.json({
      success: true,
      data: modelosComManobras,
      total: modelosComManobras.length,
    });
  } catch (error) {
    Logger.error('[modelos] Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao buscar modelos',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

// GET /api/v2/simuladores
modelosManobras.get('/', async (c) => {
  const db = c.env.DB;

  try {
    Logger.info('[simuladores] Buscando simuladores...');

    const result = await db
      .prepare(
        `
        SELECT 
          id,
          nome,
          tipo,
          localizacao,
          status,
          created_at,
          updated_at
        FROM simuladores
        WHERE deleted_at IS NULL
        ORDER BY nome ASC
      `,
      )
      .all();

    Logger.info(`[simuladores] Retornando ${result.results?.length || 0} simuladores`);

    return c.json({
      success: true,
      data: result.results || [],
      total: result.results?.length || 0,
    });
  } catch (error) {
    Logger.error('[simuladores] Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao buscar simuladores',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

export default modelosManobras;
```

---

## 📍 CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Arquivo `categorias.ts` criado
- [ ] Arquivo `qualificacoes-detalhado.ts` criado
- [ ] Arquivo `modelos-manobras.ts` criado
- [ ] Rotas registradas em `routes/index.ts`
- [ ] Build sem erros: `npm run build`
- [ ] Deploy: `wrangler deploy`
- [ ] Testes manuais com curl
- [ ] Verificar logs: `wrangler tail`
- [ ] Frontend atualizado para usar hooks
- [ ] Commit e push

---

## 🚀 PRÓXIMOS PASSOS

1. Criar os 3 arquivos de endpoint
2. Registrar rotas em `routes/index.ts`
3. Executar build
4. Fazer deploy
5. Testar endpoints
6. Atualizar frontend com React hooks
7. Commit final

---

**Status:** 🔴 Aguardando implementação dos endpoints  
**Estimated Time:** 1-2 horas

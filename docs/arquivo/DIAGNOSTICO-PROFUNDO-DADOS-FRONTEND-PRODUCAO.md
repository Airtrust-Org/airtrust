# 🔍 DIAGNÓSTICO PROFUNDO E CORREÇÃO DEFINITIVA: Dados Não Aparecem no Frontend (Produção)

**Data:** 12 de Novembro de 2025  
**Criticidade:** 🔴 ALTA - Vidas dependem disso  
**Status:** 🚨 ATIVO - Modo war room  
**Objetivo:** Forçar retorno de dados **de forma segura e auditável**

---

## 📊 RESUMO EXECUTIVO

**Sintoma:** Frontend de produção não exibe dados, mas:

- ✅ Banco tem dados (4,200+ registros)
- ✅ Endpoints backend funcionam (teste local)
- ✅ Hooks React estão corretos
- ❌ Frontend produção mostra tabelas vazias

**Possíveis Causas** (ordem de probabilidade):

1. **VITE_API_URL incorreta ou não injetada** (60%)
2. **CORS bloqueando requisições** (20%)
3. **Token JWT expirado ou ausente** (10%)
4. **Soft delete incorreto / WHERE deleted_at IS NULL** (5%)
5. **Cache CDN servindo conteúdo antigo** (5%)

---

## 🎯 FASE 1: VERIFICAÇÃO DE CONFIGURAÇÃO DE AMBIENTE

### 1.1 Checar VITE_API_URL no Browser

**Local:** F12 → Console (no site em produção: `https://main.airtrust.pages.dev`)

```javascript
// Cole exatamente isso no console:
console.log('=== AIRTRUST ENVIRONMENT DEBUG ===');
console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);
console.log('VITE_MODE:', import.meta.env.MODE);
console.log('VITE_DEV:', import.meta.env.DEV);
console.log('window.location.origin:', window.location.origin);
console.log('=== FIM DEBUG ===');
```

**Resultado Esperado:**

```
=== AIRTRUST ENVIRONMENT DEBUG ===
VITE_API_URL: https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev
VITE_MODE: production
VITE_DEV: false
window.location.origin: https://main.airtrust.pages.dev
=== FIM DEBUG ===
```

**⚠️ SE VITE_API_URL for:**

- `undefined` → **PROBLEMA CRÍTICO** (fase 1.2)
- `http://localhost:8787` → **Apontando para local!** (fase 1.2)
- URL diferente → **Validar se é correta** (fase 2)

---

### 1.2 Validar Build com VITE_API_URL

**No terminal local (máquina de dev):**

```bash
# 1️⃣ Verifique se a variável está setada
echo $VITE_API_URL

# 2️⃣ Se vazio, defina para produção
export VITE_API_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

# 3️⃣ Limpe build anterior
rm -rf dist/

# 4️⃣ Rebuild com var
npm run build

# 5️⃣ Verifique se foi injetada nos assets
grep -r "0199d03e-fe13-77d7" dist/client/assets/*.js | head -5

# 6️⃣ Esperado: vários matches com a URL
```

**✅ Se aparecer a URL nos assets, VITE_API_URL foi injetado corretamente.**

---

### 1.3 Verificar wrangler.toml

**Arquivo:** `/Users/filipedaumas/Documents/airtrust v1/wrangler.toml`

```bash
# Verifique a seção [env.production]
grep -A 10 "\[env.production\]" wrangler.toml

# Esperado:
# [env.production]
# name = "airtrust-frontend-prod"
# vars = { VITE_API_URL = "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev" }
```

**Se não estiver ou estiver errado, corrija:**

```toml
[env.production]
name = "airtrust-frontend-prod"
route = "https://main.airtrust.pages.dev/*"
zone_id = "SEU_ZONE_ID"

[env.production.vars]
VITE_API_URL = "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"
```

**Depois:**

```bash
npm run build
wrangler pages deploy dist --env production
```

---

## 🔗 FASE 2: TESTE DIRETO DE REDE E CORS

### 2.1 Inspecionar Network Tab (Browser)

**Passos:**

1. Acesse `https://main.airtrust.pages.dev`
2. F12 → Network tab
3. Procure requisições para `/api/v2/...`
4. Clique em uma requisição

**Analise:**

| Campo        | Esperado                         | Se Errado                                          |
| ------------ | -------------------------------- | -------------------------------------------------- |
| **Status**   | 200                              | 404 = URL errada; 401/403 = auth; CORS = bloqueado |
| **Domain**   | `airtrust.workers.dev`           | Se localhost = var errada                          |
| **Response** | `{ success: true, data: [...] }` | `{ success: false, error: ... }` ou vazio          |
| **Headers**  | `Authorization: Bearer ...`      | Ausente = sem token                                |

**Screenshot para documentar:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Network Tab (Esperado)                                          │
├─────────────────────────────────────────────────────────────────┤
│ GET  /api/v2/funcionarios?limit=5  200  airtrust.workers.dev   │
│ GET  /api/v2/qualificacoes        200  airtrust.workers.dev   │
│ GET  /api/v2/habilitacoes         200  airtrust.workers.dev   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Response (Esperado)                                             │
├─────────────────────────────────────────────────────────────────┤
│ {                                                               │
│   "success": true,                                              │
│   "data": [                                                     │
│     { "id": 1, "nome": "João Silva", ... },                    │
│     { "id": 2, "nome": "Maria Santos", ... }                   │
│   ],                                                            │
│   "total": 42,                                                  │
│   "timestamp": "2025-11-12T15:30:45Z"                          │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

### 2.2 Teste CORS via cURL

**Terminal:**

```bash
# 🔴 CRÍTICO: Teste direto do backend
curl -v https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/funcionarios?limit=5

# Esperado:
# < HTTP/2 200
# < access-control-allow-origin: *
# {"success":true,"data":[...]}
```

**Se retornar 401 (Unauthorized):**

```bash
# Teste com header vazio (temporariamente)
curl -v -H "Authorization: Bearer test" \
  https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/funcionarios?limit=5
```

**Se CORS error:**

```
< HTTP/2 200
< access-control-allow-origin: (AUSENTE!)
```

**Solução (adicionar ao backend):**

```typescript
// src/worker/index.ts
import { cors } from 'hono/cors';

app.use(
  '*',
  cors({
    origin: [
      'https://main.airtrust.pages.dev',
      'https://airtrust.pages.dev',
      'http://localhost:3000', // dev local
    ],
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);
```

---

## 🔐 FASE 3: AUTENTICAÇÃO E COOKIES/TOKENS

### 3.1 Verificar Token no Browser

**Console F12:**

```javascript
// Verifique localStorage
console.log('Token:', localStorage.getItem('token'));
console.log('Token Expiry:', localStorage.getItem('token_expiry'));

// Se vazio:
console.log('❌ SEM TOKEN! Redireciona para login?');

// Se preenchido, decodifique
const token = localStorage.getItem('token');
const decoded = JSON.parse(atob(token.split('.')[1]));
console.log('Token decoded:', decoded);
console.log('Expires:', new Date(decoded.exp * 1000));
```

**Esperado:**

```javascript
Token: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
Token Expiry: 2025-11-12T16:30:45Z
Token decoded: {
  sub: "user_123",
  email: "pilot@airtrust.com",
  role: "PILOT",
  exp: 1731421845,
  iat: 1731335445
}
Expires: Wed Nov 12 2025 16:30:45 GMT-0300
```

---

### 3.2 Testar Endpoint com Token

**Console F12:**

```javascript
// 1️⃣ Pega token
const token = localStorage.getItem('token');

// 2️⃣ Testa fetch
fetch(
  'https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/funcionarios?limit=5',
  {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  },
)
  .then((r) => {
    console.log('Status:', r.status);
    console.log('Headers:', r.headers);
    return r.json();
  })
  .then((data) => {
    console.log('Response:', data);
    if (data.success && data.data.length > 0) {
      console.log('✅ DADOS RETORNAM!');
    } else {
      console.log('❌ Response vazio ou error');
    }
  })
  .catch((err) => {
    console.error('❌ ERRO:', err);
  });
```

**Possíveis Erros e Soluções:**

| Erro             | Causa                                        | Solução                   |
| ---------------- | -------------------------------------------- | ------------------------- |
| 401 Unauthorized | Token inválido/expirado                      | Fazer logout + login      |
| 403 Forbidden    | Sem permissão para recurso                   | Verificar RBAC no backend |
| CORS error       | Header `access-control-allow-origin` ausente | Adicionar cors middleware |
| Network error    | URL errada ou host indisponível              | Validar VITE_API_URL      |

---

## 📊 FASE 4: BACKEND - SOFT DELETE, FILTERS E JOINS

### 4.1 Teste Query Direto no D1 (Production)

**Terminal:**

```bash
# Conecte ao banco de produção
wrangler d1 execute airtrust-db --remote --command "SELECT COUNT(*) as total FROM funcionarios;"

# Esperado:
# ┌───────┐
# │ total │
# ├───────┤
# │ 42    │
# └───────┘
```

**Se retornar 0, database está vazia!**

```bash
# Teste soft delete
wrangler d1 execute airtrust-db --remote --command \
  "SELECT COUNT(*) as total, COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as ativos FROM funcionarios;"

# Esperado:
# ┌───────┬────────┐
# │ total │ ativos │
# ├───────┼────────┤
# │ 45    │ 42     │
# └───────┴────────┘
```

**Se todos tiverem deleted_at preenchido:**

```sql
-- Investigar quando foram deletados
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as ativos,
  COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as deletados,
  MAX(deleted_at) as ultimo_delete
FROM funcionarios;
```

---

### 4.2 Adicionar Logs Agressivos no Backend

**Arquivo:** `src/worker/api/v2/debug.ts` (CRIAR SE NÃO EXISTIR)

```typescript
import { Hono } from 'hono';
import type { AppEnv } from '../../types';

const app = new Hono<AppEnv>();

// Debug endpoint - VERBOSE
app.get('/debug/funcionarios', async (c) => {
  const db = c.env.DB;

  console.log('[DEBUG] === FUNCIONARIOS DEBUG ===');
  console.log('[DEBUG] Request URL:', c.req.url);
  console.log('[DEBUG] Authorization:', c.req.header('Authorization')?.substring(0, 20) + '...');

  try {
    // Query 1: Total sem filtro
    const totalResult = await db.prepare('SELECT COUNT(*) as cnt FROM funcionarios').all();
    console.log('[DEBUG] Total (sem filtro):', totalResult.results[0]?.cnt);

    // Query 2: Com soft delete filter
    const activosResult = await db
      .prepare('SELECT COUNT(*) as cnt FROM funcionarios WHERE deleted_at IS NULL')
      .all();
    console.log('[DEBUG] Ativos (deleted_at IS NULL):', activosResult.results[0]?.cnt);

    // Query 3: Primeiras 5 linhas
    const dataResult = await db
      .prepare('SELECT id, nome, deleted_at FROM funcionarios LIMIT 5')
      .all();
    console.log('[DEBUG] Sample data:', JSON.stringify(dataResult.results, null, 2));

    return c.json({
      success: true,
      debug: {
        total: totalResult.results[0]?.cnt,
        ativos: activosResult.results[0]?.cnt,
        sample: dataResult.results,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[DEBUG] ERROR:', error);
    return c.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : null,
        },
      },
      500,
    );
  }
});

// Debug endpoint - Query Raw
app.get('/debug/raw/:table', async (c) => {
  const table = c.req.param('table');
  const limit = c.req.query('limit') || '5';

  console.log(`[DEBUG] Raw query table=${table}, limit=${limit}`);

  try {
    const result = await c.env.DB.prepare(`SELECT * FROM ${table} LIMIT ${limit}`).all();

    console.log(`[DEBUG] Result count: ${result.results?.length}`);

    return c.json({
      success: true,
      table,
      count: result.results?.length,
      data: result.results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[DEBUG] Query error:`, error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

export default app;
```

**Registre no router principal** (`src/worker/routes/index.ts`):

```typescript
import debugRouter from '../api/v2/debug';

// ... outras rotas

router.all('/api/v2/debug/*', debugRouter);
```

**Deploy e teste:**

```bash
npm run build
npm run deploy

# Teste no browser console
fetch('https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/debug/funcionarios')
  .then(r => r.json())
  .then(d => console.log(JSON.stringify(d, null, 2)));
```

---

## 💻 FASE 5: FORÇAR FRONTEND A MOSTRAR ERRO/RAW RESPONSE

### 5.1 Componente de Debug (Temporário)

**Arquivo:** `src/react-app/components/DebugPanel.tsx` (CRIAR)

```typescript
import { useEffect, useState } from 'react';

export function DebugPanel() {
  const [logs, setLogs] = useState<string[]>([]);
  const [responses, setResponses] = useState<Record<string, any>>({});

  useEffect(() => {
    const addLog = (msg: string) => {
      console.log(msg);
      setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
    };

    addLog(`[INIT] API URL: ${import.meta.env.VITE_API_URL}`);
    addLog(`[INIT] Token: ${localStorage.getItem('token')?.substring(0, 20)}...`);

    // Test cada endpoint
    const endpoints = [
      'funcionarios',
      'qualificacoes',
      'habilitacoes',
      'sessoes',
      'certificados',
      'compliance/dashboard',
    ];

    endpoints.forEach((endpoint) => {
      const apiUrl = import.meta.env.VITE_API_URL || window.location.origin;

      fetch(`${apiUrl}/api/v2/${endpoint}?limit=1`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || 'NONE'}`,
        },
      })
        .then((r) => {
          addLog(`[${endpoint}] Status: ${r.status}`);
          return r.json();
        })
        .then((data) => {
          addLog(`[${endpoint}] Response: ${JSON.stringify(data).substring(0, 100)}`);
          setResponses((prev) => ({ ...prev, [endpoint]: data }));
        })
        .catch((err) => {
          addLog(`[${endpoint}] ERROR: ${err.message}`);
        });
    });
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        width: '50%',
        height: '300px',
        background: '#1a1a1a',
        color: '#00ff00',
        overflow: 'auto',
        fontFamily: 'monospace',
        fontSize: '11px',
        padding: '10px',
        zIndex: 9999,
        border: '2px solid #ff0000',
      }}
    >
      <h3 style={{ margin: 0, color: '#ff0000' }}>🔍 DEBUG PANEL</h3>

      <h4 style={{ margin: '10px 0 5px 0' }}>Logs:</h4>
      {logs.map((log, i) => (
        <div key={i}>{log}</div>
      ))}

      <h4 style={{ margin: '10px 0 5px 0' }}>Responses:</h4>
      <pre style={{ margin: 0, fontSize: '9px' }}>{JSON.stringify(responses, null, 2)}</pre>
    </div>
  );
}
```

**Use em página principal:**

```typescript
// src/pages/Dashboard.tsx
import { DebugPanel } from '../components/DebugPanel';

export function Dashboard() {
  return (
    <div>
      {/* conteúdo normal */}
      <DebugPanel /> {/* Adicione aqui */}
    </div>
  );
}
```

**Deploy e observe:**

```bash
npm run build && npm run deploy
# Acesse https://main.airtrust.pages.dev
# Verá painel vermelho no canto inferior direito com logs em tempo real
```

---

## 🗂️ FASE 6: CACHE E CDN

### 6.1 Limpar Cache do Navegador

**Browser (F12):**

```javascript
// Limpar localStorage
localStorage.clear();
sessionStorage.clear();

// Força reload sem cache
location.href = location.href; // Ou Ctrl+Shift+R
```

**Cloudflare Workers (via wrangler):**

```bash
# Se usar KV cache
wrangler kv:key delete airtrust-cache

# Se usar D1, não há cache explícito, mas:
wrangler pages deploy dist --branch production --project airtrust
```

### 6.2 Validar Headers de Cache

**Terminal:**

```bash
# Verifique response headers
curl -i https://main.airtrust.pages.dev/

# Procure por:
# cache-control: public, max-age=0
# ou
# cache-control: private, no-cache

# Se tiver max-age alto (3600+), mude em wrangler.toml:
# [[routes]]
# pattern = "https://main.airtrust.pages.dev/*"
# cache = {default_ttl = 0}
```

---

## 🧪 FASE 7: TESTE DE PONTA A PONTA (FLOW CRÍTICO)

### 7.1 Criar Registro de Teste

**No backend (via curl):**

```bash
# 1️⃣ Criar funcionário de teste
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "TESTE_PONTA_A_PONTA",
    "matricula": "TEST_" + Date.now(),
    "email": "test@airtrust.test",
    "cargo_id": 1
  }' \
  https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/funcionarios

# Resposta esperada:
# {"success":true,"data":{"id":999,"nome":"TESTE_PONTA_A_PONTA",...}}
```

**Documente:**

- Timestamp exato
- ID retornado
- Response body completo

### 7.2 Verificar no Banco

```bash
wrangler d1 execute airtrust-db --remote --command \
  "SELECT * FROM funcionarios WHERE matricula LIKE 'TEST_%';"

# Deve retornar o registro
```

### 7.3 Buscar via Endpoint

```bash
curl https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/funcionarios \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | select(.nome == "TESTE_PONTA_A_PONTA")'

# Deve retornar o registro
```

### 7.4 Visualizar no Frontend

```javascript
// Console do frontend (https://main.airtrust.pages.dev):
fetch('https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/funcionarios', {
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
})
  .then((r) => r.json())
  .then((d) => {
    const teste = d.data.find((f) => f.nome === 'TESTE_PONTA_A_PONTA');
    console.log('Encontrado no frontend?', teste ? 'SIM ✅' : 'NÃO ❌');
    if (!teste) console.log('Todos os dados:', d.data);
  });
```

**Se flopar em algum passo, documente:**

```
TIMESTAMP: 2025-11-12T15:35:22Z
STEP: 7.4 (Frontend)
REQUEST: GET /api/v2/funcionarios
RESPONSE: { success: true, data: [] }  ← SEM O REGISTRO DE TESTE!
HYPOTHESIS: Soft delete ou WHERE filter excluindo dados
ACTION: Ir para Fase 4.1 com query raw
```

---

## 📋 FASE 8: PLANILHA DE VERIFICAÇÃO

Preencha a tabela abaixo para cada módulo com dados **reais**:

### Matriz de Teste Completa

| Módulo        | API curl (status) | API curl (count) | Frontend fetch | Frontend UI   | Error (se houver) | Status |
| ------------- | ----------------- | ---------------- | -------------- | ------------- | ----------------- | ------ |
| Funcionários  | 200               | 42               | OK             | Mostra 42?    | -                 | ✅/❌  |
| Qualificações | 200               | 24               | OK             | Mostra 24?    | -                 | ✅/❌  |
| Habilitações  | 200               | 260              | OK             | Mostra 260?   | -                 | ✅/❌  |
| Sessões       | 200               | 28               | OK             | Mostra 28?    | -                 | ✅/❌  |
| Certificados  | 200               | 178              | OK             | Mostra 178?   | -                 | ✅/❌  |
| Compliance    | 200               | 320              | OK             | Mostra score? | -                 | ✅/❌  |
| Auditoria     | 200               | 2,341            | OK             | Mostra logs?  | -                 | ✅/❌  |

**Instrução de Preenchimento:**

1. **API curl (status):** `curl -s https://...funcionarios | jq .success` → `true` ou `false`
2. **API curl (count):** `curl -s https://...funcionarios | jq '.data | length'` → número
3. **Frontend fetch:** Browser console → `fetch(...).then(r => r.json()).then(d => d.data.length)` → número
4. **Frontend UI:** Visual inspection na página → dados aparecem? SIM/NÃO
5. **Error:** Se houver erro, capture mensagem exata
6. **Status:** `✅` = OK, `❌` = Falha

---

### Exemplo Preenchido:

| Módulo        | API curl (status) | API curl (count) | Frontend fetch | Frontend UI      | Error          | Status |
| ------------- | ----------------- | ---------------- | -------------- | ---------------- | -------------- | ------ |
| Funcionários  | 200               | 42               | 42             | Sim, mostra 42   | -              | ✅     |
| Qualificações | 200               | 24               | 0              | Não, vazio       | `soft delete?` | ❌     |
| Habilitações  | 200               | 260              | 260            | Sim, mostra 260  | -              | ✅     |
| Sessões       | 404               | N/A              | N/A            | Erro 404         | URL errada?    | ❌     |
| Certificados  | 200               | 178              | 178            | Sim, mostra 178  | -              | ✅     |
| Compliance    | 200               | 320              | 320            | Sim, mostra 320  | -              | ✅     |
| Auditoria     | 200               | 2341             | 2341           | Sim, mostra 2341 | -              | ✅     |

---

## 🔧 FASE 9: FEEDBACK E CORREÇÃO

### 9.1 Mapeamento de Anomalias

**Padrão 1: Dados = [] em TODOS endpoints**

```
Causa provável: VITE_API_URL incorreta ou not-injected
Verificação: Fase 1.1 + 1.2
Correção: npm run build com export VITE_API_URL=...
```

**Padrão 2: API retorna dados, Frontend não mostra**

```
Causa provável: CORS ou Auth expirada
Verificação: Fase 2 (Network tab) + Fase 3 (token)
Correção: Adicionar cors middleware OU fazer logout/login
```

**Padrão 3: API retorna dados, fetch() funciona, mas UI vazia**

```
Causa provável: Componente React não renderizando ou soft delete
Verificação: Fase 4.2 (logs backend) + Fase 5 (debug panel)
Correção: Revisar WHERE deleted_at IS NULL ou renderização
```

**Padrão 4: Alguns módulos OK, outros não**

```
Causa provável: Soft delete inconsistente ou JOIN quebrado
Verificação: Fase 4.1 (query direto) para cada módulo com problema
Correção: UPDATE queries para remover WHERE deleted_at ou revisar FKs
```

### 9.2 Árvore de Decisão

```
START: Frontend vazio?

├─ Fase 1.1: VITE_API_URL está correto?
│  ├─ NÃO → Fase 1.2: rebuild com VITE_API_URL
│  └─ SIM → continua
│
├─ Fase 2.1: Network tab mostra 200?
│  ├─ 404 → URL errada (revisar VITE_API_URL)
│  ├─ CORS error → Fase 2.2: adicionar cors middleware
│  ├─ 401/403 → Fase 3: token expirado/inválido
│  └─ 200 → continua
│
├─ Fase 2.1: Response contém dados?
│  ├─ { success: true, data: [] } → Fase 4 (soft delete)
│  ├─ { success: false, error: ... } → erro backend (logs)
│  └─ { success: true, data: [...] } → continua
│
├─ Fase 5: Frontend renderiza dados?
│  ├─ NÃO → revisar componente React / useQuery hook
│  └─ SIM → ✅ DADOS OK!
│
└─ END: Dados aparecem no frontend ✅
```

---

## 🎬 FINALIZAÇÃO

### Checklist Final

- [ ] VITE_API_URL setada e injetada no build ✅
- [ ] API retorna 200 e dados em todos endpoints ✅
- [ ] CORS headers presentes (access-control-allow-origin) ✅
- [ ] Token JWT válido e não expirado ✅
- [ ] Soft delete filtro ONDE existe ✅
- [ ] Frontend fetch() retorna dados via console ✅
- [ ] Frontend UI renderiza dados em tela ✅
- [ ] Teste ponta a ponta: criar → verificar banco → buscar API → mostrar UI ✅
- [ ] Todos 7 módulos retornam dados ✅
- [ ] Sem workarounds, solução permanente ✅

### Escalação (se problema persiste após todas fases)

```
SEM SOLUÇÃO APÓS FASE 9?

1. Gere dump de logs:
   - Browser console (F12 → Save logs)
   - Workers logs (wrangler tail)
   - D1 query results (wrangler d1 shell)

2. Crie war room com:
   - Eng. Frontend (React/Vite)
   - Eng. Backend (Workers/D1)
   - DevOps (Cloudflare config)

3. Revisar:
   - Git history dos últimos deploys
   - Cloudflare Pages build logs
   - D1 replication status
   - WAF rules (se houver)

4. Considerar:
   - Rollback para último commit OK
   - Rebuild from scratch
   - Escalar para Cloudflare support
```

---

## 📎 ANEXOS

### Anexo A: Script Bash Automático

**Arquivo:** `diagnose-frontend.sh`

```bash
#!/bin/bash

echo "🔍 DIAGNÓSTICO AUTOMÁTICO AIRTRUST FRONTEND"
echo "==========================================="
echo ""

# 1. VITE_API_URL
echo "1️⃣ Verificando VITE_API_URL..."
VITE_URL=$(grep -E "VITE_API_URL.*=" dist/client/assets/*.js | head -1 | cut -d= -f2 | cut -d'"' -f2)
echo "   VITE_API_URL: $VITE_URL"

if [ -z "$VITE_URL" ]; then
  echo "   ❌ PROBLEMA: VITE_API_URL não encontrada no build!"
  echo "   Solução: npm run build com VITE_API_URL setada"
fi

# 2. API Connectivity
echo ""
echo "2️⃣ Testando conectividade API..."
API_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

for endpoint in "funcionarios" "qualificacoes" "habilitacoes" "certificados"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v2/$endpoint?limit=1")
  echo "   /$endpoint: $STATUS"

  if [ "$STATUS" != "200" ] && [ "$STATUS" != "401" ]; then
    echo "   ❌ Erro no endpoint!"
  fi
done

# 3. CORS Check
echo ""
echo "3️⃣ Verificando CORS..."
CORS=$(curl -s -I "$API_URL/api/v2/funcionarios" | grep -i "access-control-allow-origin" | cut -d' ' -f2-)
if [ -z "$CORS" ]; then
  echo "   ❌ CORS header ausente!"
else
  echo "   ✅ CORS: $CORS"
fi

# 4. Data Count
echo ""
echo "4️⃣ Contagem de dados no banco..."
wrangler d1 execute airtrust-db --remote --command "
SELECT
  'funcionarios' as tabela, COUNT(*) as total FROM funcionarios
UNION ALL
SELECT 'qualificacoes', COUNT(*) FROM qualificacoes
UNION ALL
SELECT 'habilitacoes', COUNT(*) FROM habilitacoes
UNION ALL
SELECT 'certificados', COUNT(*) FROM certificados
" 2>&1 | grep -E "funcionarios|qualificacoes|habilitacoes|certificados"

echo ""
echo "==========================================="
echo "✅ Diagnóstico completo!"
```

**Uso:**

```bash
chmod +x diagnose-frontend.sh
./diagnose-frontend.sh
```

---

### Anexo B: Curl Commands Rápidos

```bash
# Teste rápido de todos endpoints
for endpoint in funcionarios qualificacoes habilitacoes sessoes certificados; do
  echo "Testing $endpoint..."
  curl -s https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/$endpoint \
    -H "Authorization: Bearer $TOKEN" | jq '.data | length' | xargs -I {} echo "  Count: {}"
done
```

---

### Anexo C: Queries de Diagnóstico D1

```sql
-- Verificação completa de soft delete
SELECT
  'funcionarios' as tabela,
  COUNT(*) as total,
  COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as ativos,
  COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as deletados
FROM funcionarios

UNION ALL

SELECT 'qualificacoes',
  COUNT(*),
  COUNT(CASE WHEN deleted_at IS NULL THEN 1 END),
  COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END)
FROM qualificacoes

UNION ALL

SELECT 'habilitacoes',
  COUNT(*),
  COUNT(CASE WHEN deleted_at IS NULL THEN 1 END),
  COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END)
FROM habilitacoes

UNION ALL

SELECT 'certificados',
  COUNT(*),
  COUNT(CASE WHEN deleted_at IS NULL THEN 1 END),
  COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END)
FROM certificados;
```

---

## 🚨 RESUMO: ORDEM DE EXECUÇÃO

1. **Fase 1** (5min): Validar VITE_API_URL no browser e rebuild
2. **Fase 2** (5min): Testar CORS via Network tab + curl
3. **Fase 3** (5min): Validar token JWT e fazer refresh se necessário
4. **Fase 4** (10min): Debug backend com logs agressivos
5. **Fase 5** (10min): Deploy DebugPanel e observar responses
6. **Fase 6** (5min): Limpar cache
7. **Fase 7** (15min): Teste ponta a ponta (criar → banco → API → Frontend)
8. **Fase 8** (10min): Preencher matriz de testes
9. **Fase 9** (20min): Analisar anomalias e corrigir

**Tempo Total Estimado:** ~1 hora para diagnóstico completo + correção

---

**Documento:** Diagnóstico Profundo AirTrust Frontend  
**Última Atualização:** 12 de Novembro de 2025  
**Status:** 🟢 PRONTO PARA EXECUÇÃO IMEDIATA

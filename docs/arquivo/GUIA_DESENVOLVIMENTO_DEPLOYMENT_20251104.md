# 🚀 GUIA COMPLETO DE DESENVOLVIMENTO & DEPLOYMENT - AIRTRUST v2
## Setup, Desenvolvimento Local e Produção

**Data**: 4 de Novembro de 2025  
**Versão**: 2.2  
**Status**: ✅ PRODUCTION READY

---

## 📋 QUICK START (5 MINUTOS)

### 1. Setup Inicial

```bash
# Clonar repositório
git clone https://github.com/seu-repo/airtrust.git
cd airtrust

# Instalar dependências
npm install

# Configurar ambiente
cp .env.example .env.local
# Editar .env.local com suas credenciais
```

### 2. Rodar Desenvolvimento Local

```bash
# Terminal 1 - Dev Server React
npm run dev

# Terminal 2 - Wrangler (Workers em desenvolvimento)
npm run dev:worker

# Terminal 3 - Observar migrations (opcional)
npm run migrations:watch
```

**Resultado**:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8787
- Proxy automático: Requisições para /api vão para :8787

---

## 🛠️ AMBIENTE DE DESENVOLVIMENTO

### 1. Estrutura de Pastas do Projeto

```
airtrust/
├── src/
│   ├── react-app/          # Frontend React 19
│   │   ├── pages/          # 93 páginas (.tsx)
│   │   ├── components/     # 40+ componentes reutilizáveis
│   │   ├── hooks/          # 12+ custom hooks
│   │   ├── services/       # Serviços de integração
│   │   ├── types/          # TypeScript interfaces
│   │   ├── utils/          # Utilidades
│   │   ├── styles/         # Estilos globais
│   │   └── App.tsx         # Root component
│   ├── worker/             # Backend Cloudflare Workers
│   │   ├── routes/         # 50+ endpoints API
│   │   ├── services/       # Lógica de negócio
│   │   ├── middleware/     # Auth, logging, etc
│   │   ├── validators/     # Zod schemas
│   │   ├── migrations/     # SQL migrations
│   │   ├── wrangler.toml   # Configuração Workers
│   │   └── index.ts        # Entry point
│   ├── shared/             # Código compartilhado
│   │   ├── types/          # Interfaces globais
│   │   └── errors/         # Classes de erro
│   └── database/
│       └── schema.sql      # Schema SQL
├── .env.local              # Variáveis de ambiente (não commitado)
├── .env.example            # Exemplo de .env
├── package.json            # Dependências npm
├── vite.config.ts          # Configuração Vite
├── tsconfig.json           # Configuração TypeScript
├── wrangler.toml           # Configuração Cloudflare Workers
└── README.md               # Documentação
```

---

### 2. Variáveis de Ambiente (.env.local)

```bash
# Frontend
VITE_API_URL=http://localhost:8787
VITE_PUBLIC_URL=http://localhost:3000

# Cloudflare Workers
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token
CLOUDFLARE_ZONE_ID=your_zone_id

# Database (D1)
DATABASE_ID=your_d1_database_id

# Storage (R2)
R2_BUCKET_NAME=airtrust-documents
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key

# Authentication
JWT_SECRET=seu_secret_muito_seguro_aqui

# Email (opcional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu_email@gmail.com
SMTP_PASS=sua_senha_app

# Logging
LOG_LEVEL=debug
```

---

### 3. Dependências Principais

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.3.3",
    "tailwindcss": "^3.3.0",
    "lucide-react": "^0.263.1",
    "zod": "^3.22.4",
    "hono": "^3.9.0",
    "@cloudflare/workers-types": "^4.20231121.0",
    "wrangler": "^3.12.0"
  },
  "devDependencies": {
    "vite": "^6.4.1",
    "@vitejs/plugin-react": "^4.1.0",
    "@types/react": "^18.2.0",
    "@types/node": "^20.0.0",
    "eslint": "^8.50.0",
    "prettier": "^3.0.0"
  }
}
```

---

## 💻 DESENVOLVIMENTO LOCAL

### 1. Iniciar Dev Server

```bash
npm run dev

# Output esperado:
# ➜  Local:   http://localhost:3000/
# ➜  press h to show help
```

**Características**:
- ✅ Hot Module Replacement (HMR)
- ✅ Fast Refresh
- ✅ Source maps
- ✅ Proxy automático para /api

### 2. Estrutura de um Novo Componente

```tsx
// src/react-app/components/MyComponent.tsx

import React, { useState, useEffect } from 'react';

interface MyComponentProps {
  title: string;
  onAction?: () => void;
  className?: string;
}

export function MyComponent({ 
  title, 
  onAction, 
  className = '' 
}: MyComponentProps) {
  const [state, setState] = useState('');

  useEffect(() => {
    // Effect logic
  }, []);

  return (
    <div className={`p-4 ${className}`}>
      <h1>{title}</h1>
      <button onClick={onAction}>Action</button>
    </div>
  );
}

// Exportar no index.ts da pasta
export { MyComponent } from './MyComponent';
```

### 3. Estrutura de uma Nova Página

```tsx
// src/react-app/pages/MyPage.tsx

import { useEffect, useState } from 'react';
import { PageLayout, PageSection, StatCard } from '@/components/layout';
import { useMyData } from '@/hooks/useMyData';
import { LoadingSpinner } from '@/components/shared';

export function MyPage() {
  const { data, loading, error, fetch } = useMyData();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch();
  }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="text-red-600">Erro: {error}</div>;

  return (
    <PageLayout
      title="Minha Página"
      subtitle="Descrição da página"
      action={<button>+ Novo</button>}
    >
      <PageSection title="Estatísticas">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard 
            label="Total" 
            value={stats?.total || 0} 
            icon={FileText} 
            color="blue" 
          />
        </div>
      </PageSection>

      <PageSection title="Dados">
        {/* Conteúdo */}
      </PageSection>
    </PageLayout>
  );
}
```

### 4. Estrutura de um Novo Hook

```typescript
// src/react-app/hooks/useMyData.ts

import { useState, useCallback } from 'react';
import { useToast } from './useToast';

interface MyData {
  id: number;
  name: string;
}

interface UseMyDataReturn {
  data: MyData[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  create: (data: any) => Promise<MyData>;
  update: (id: number, data: any) => Promise<MyData>;
  delete: (id: number) => Promise<void>;
}

export function useMyData(): UseMyDataReturn {
  const [data, setData] = useState<MyData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { success, error: showError } = useToast();

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/v2/mydata');
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (payload: any): Promise<MyData> => {
    const response = await fetch('/api/v2/mydata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    
    success('Criado com sucesso');
    await fetch();
    return result.data;
  }, [fetch]);

  return { data, loading, error, fetch, create, update, delete };
}
```

### 5. Estrutura de um Novo Endpoint API

```typescript
// src/worker/routes/myroute.ts

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreateMyDataDTO, UpdateMyDataDTO } from '@/validators';
import { MyDataService } from '@/services/MyDataService';
import { AppError } from '@/errors';

const myRouter = new Hono();

// GET /api/v2/mydata
myRouter.get('/', async (c) => {
  try {
    const page = Number(c.query('page')) || 1;
    const limit = Number(c.query('limit')) || 20;
    
    const service = new MyDataService(c.env.DB);
    const data = await service.list(page, limit);
    
    return c.json({ success: true, data }, 200);
  } catch (err) {
    console.error(err);
    return c.json({ 
      success: false, 
      error: 'Erro ao listar dados' 
    }, 500);
  }
});

// GET /api/v2/mydata/:id
myRouter.get('/:id', async (c) => {
  try {
    const id = Number(c.param('id'));
    const service = new MyDataService(c.env.DB);
    const data = await service.getById(id);
    
    if (!data) {
      return c.json({ 
        success: false, 
        error: 'Não encontrado' 
      }, 404);
    }
    
    return c.json({ success: true, data }, 200);
  } catch (err) {
    return c.json({ 
      success: false, 
      error: 'Erro ao buscar' 
    }, 500);
  }
});

// POST /api/v2/mydata
myRouter.post('/', zValidator('json', CreateMyDataDTO), async (c) => {
  try {
    const payload = c.req.valid('json');
    const service = new MyDataService(c.env.DB);
    const data = await service.create(payload);
    
    return c.json({ success: true, data }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Zod')) {
      return c.json({ 
        success: false, 
        error: 'Validação falhou' 
      }, 422);
    }
    return c.json({ 
      success: false, 
      error: 'Erro ao criar' 
    }, 500);
  }
});

// PUT /api/v2/mydata/:id
myRouter.put('/:id', zValidator('json', UpdateMyDataDTO), async (c) => {
  try {
    const id = Number(c.param('id'));
    const payload = c.req.valid('json');
    const service = new MyDataService(c.env.DB);
    const data = await service.update(id, payload);
    
    if (!data) {
      return c.json({ 
        success: false, 
        error: 'Não encontrado' 
      }, 404);
    }
    
    return c.json({ success: true, data }, 200);
  } catch (err) {
    return c.json({ 
      success: false, 
      error: 'Erro ao atualizar' 
    }, 500);
  }
});

// DELETE /api/v2/mydata/:id
myRouter.delete('/:id', async (c) => {
  try {
    const id = Number(c.param('id'));
    const service = new MyDataService(c.env.DB);
    await service.delete(id);
    
    return c.json({ success: true }, 200);
  } catch (err) {
    return c.json({ 
      success: false, 
      error: 'Erro ao deletar' 
    }, 500);
  }
});

export { myRouter };
```

---

## 📦 BUILD & PRODUÇÃO

### 1. Build Frontend

```bash
# Build otimizado
npm run build

# Output esperado:
# ✓ 3480 modules transformed
# dist/index.html         0.96 kB │ gzip: 0.45 kB
# dist/assets/index.*.js  245.23 kB │ gzip: 85.88 kB

# Preview do build
npm run preview
```

### 2. Deploy no Cloudflare Workers

```bash
# Login no Cloudflare
wrangler login

# Deploy Workers
npm run deploy:worker

# Output esperado:
# ✓ Uploaded workers/index.ts to your project with status success

# Verificar deployment
curl https://airtrust.seu-dominio.com/api/v2/habilitacoes
```

### 3. Deploy Full (Frontend + Backend)

```bash
# 1. Build frontend
npm run build

# 2. Deploy frontend (Vercel/Netlify ou Pages)
npm run deploy:pages

# 3. Deploy backend
npm run deploy:worker

# 4. Migrar banco de dados (se houver novas migrations)
npm run migrations:deploy

# 5. Verificar saúde da aplicação
npm run health:check
```

---

## 🔄 MIGRATIONS & DATABASE

### 1. Criar Nova Migration

```bash
# Gerar arquivo de migration
npm run migrations:generate "add_new_column"

# Arquivo criado: src/worker/migrations/0012_add_new_column.sql
```

### 2. Conteúdo da Migration

```sql
-- src/worker/migrations/0012_add_new_column.sql

-- Add new column to tabela
ALTER TABLE minha_tabela ADD COLUMN nova_coluna TEXT DEFAULT 'valor';

-- Create index
CREATE INDEX idx_minha_tabela_nova_coluna ON minha_tabela(nova_coluna);

-- Update existing records
UPDATE minha_tabela SET nova_coluna = 'valor' WHERE nova_coluna IS NULL;

-- Verify
SELECT COUNT(*) as total FROM minha_tabela WHERE nova_coluna IS NOT NULL;
```

### 3. Executar Migrations

```bash
# Development
npm run migrations:dev

# Production
npm run migrations:deploy

# Rollback (último)
npm run migrations:rollback
```

### 4. Backup Database

```bash
# Backup automático
npm run backup:create

# Restore
npm run backup:restore backup-name.sql

# List backups
npm run backup:list
```

---

## ✅ TESTES & VALIDAÇÃO

### 1. Validar Build

```bash
npm run build

# Checklist automático:
# ✓ TypeScript errors: 0
# ✓ ESLint warnings: 0
# ✓ Module count: 3480
# ✓ Bundle size: 245 KB (within limits)
# ✓ All pages loads: ✓
```

### 2. Testar APIs

```bash
# Via curl
curl -X GET http://localhost:8787/api/v2/habilitacoes \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json"

# Via Postman
# Import: https://www.postman.com/collections/...
# Set environment variables
# Run collection
```

### 3. Testes E2E (Future)

```bash
npm run test:e2e

# Testes com Playwright
# ✓ Login flow
# ✓ CRUD operations
# ✓ Validations
# ✓ Error handling
```

---

## 🐛 DEBUGGING

### 1. Logs Development

```typescript
// Enable debug logs
localStorage.setItem('DEBUG', 'app:*');

// Na console:
// app:api GET /api/v2/habilitacoes 200 12ms
// app:hook useHabilitacoes loaded 1036 records
```

### 2. Network Tab

```bash
# Chrome DevTools > Network Tab
# Filtrar por /api
# Verificar:
# - Status code (200, 404, 500)
# - Response time
# - Payload size
# - Headers
```

### 3. Console Logs

```typescript
// Bom
console.log('Habilitações carregadas:', habilitacoes.length);

// Ruim
console.log('ok');
console.log(data);
```

---

## 📊 MONITORAMENTO & PERFORMANCE

### 1. Métricas Build

```
✓ TypeScript: 0 errors
✓ ESLint: 0 warnings
✓ CSS: 85.88 KB (gzipped: 14.21 KB)
✓ JS: 245.23 KB (gzipped: 75 KB)
✓ Total: 330 KB
```

### 2. Métricas Runtime

```bash
npm run health:check

# Output:
# Frontend: ✓ Online
# API Gateway: ✓ Online (avg 45ms)
# Database: ✓ Connected (1036 records)
# R2 Storage: ✓ Available
# Overall: ✓ Healthy
```

### 3. Observability

```typescript
// Structured logging
logger.info('Habilitação criada', {
  habilitacao_id: 123,
  funcionario_id: 456,
  timestamp: new Date().toISOString(),
  duration_ms: 125
});
```

---

## 🚨 TROUBLESHOOTING

### Problema: Build falha com erro TypeScript

**Solução**:
```bash
# Verificar erros
npm run check
# Corrigir tipos
# Rodar build novamente
npm run build
```

### Problema: API retorna 404

**Checklist**:
1. URL está correta? `/api/v2/habilitacoes`
2. Método HTTP correto? GET/POST/PUT/DELETE
3. Token de auth presente? `Authorization: Bearer ...`
4. Recurso existe no banco? `SELECT * FROM habilitacoes WHERE id = 1`

### Problema: Hot reload não funciona

**Solução**:
```bash
# Restart dev server
npm run dev

# Limpar cache Vite
rm -rf .vite
npm run dev
```

---

## 📋 CHECKLIST PRÉ-DEPLOYMENT

- [ ] Build passes: `npm run build`
- [ ] Tests pass: `npm run test`
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] Environment variables configured
- [ ] Database migrations ready
- [ ] All endpoints tested
- [ ] Performance acceptable
- [ ] Security review done
- [ ] Documentation updated
- [ ] Backup created
- [ ] Rollback plan documented

---

## 🔗 RECURSOS ÚTEIS

- [Documentação Vite](https://vitejs.dev/)
- [React 19 Docs](https://react.dev/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [D1 Database](https://developers.cloudflare.com/d1/)
- [Hono Framework](https://hono.dev/)
- [TypeScript Docs](https://www.typescriptlang.org/)

---

**Versão**: 2.2  
**Última Atualização**: 4 de Novembro de 2025  
**Status**: ✅ PRODUCTION READY

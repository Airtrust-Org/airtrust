# 📋 QUICK REFERENCE - AIRTRUST API & COMMANDS

**Data:** 6 de Novembro de 2025  
**Para:** Compartilhar com IA externa | Referência rápida

---

## 🚀 QUICK START

```bash
# Desenvolver
npm run dev:all              # Frontend (3000) + Backend (8787)

# Build & Deploy
npm run build               # Compilar (deve passar sem erros)
npm run deploy              # Deploy para produção

# Testar
npm run health              # Verifica health endpoint
npm run validate            # Teste completo de sistema
npm run test:endpoints      # Testa endpoints críticos
```

---

## 🔑 API KEYS & AUTH

```
// Local Development
- Frontend: http://localhost:3000
- Backend: http://localhost:8787
- DB: .wrangler/state/v3/d1/

// Production
- Frontend: https://airtrust.pages.dev
- Backend: https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev
- DB: Cloudflare D1
- Storage: Cloudflare R2 (binding: AIRTRUST_STORAGE)

// Auth Type
- JWT Token (em Authorization header)
- Query Param: ?token=... (fallback)
```

---

## 📡 MOST USED ENDPOINTS

### Funcionários

```
GET    /api/v2/funcionarios              # Listar todos
GET    /api/v2/funcionarios/:id          # Get one
GET    /api/v2/funcionarios/instrutores  # Listar instrutores ⭐
POST   /api/v2/funcionarios              # Criar
PUT    /api/v2/funcionarios/:id          # Atualizar
DELETE /api/v2/funcionarios/:id          # Soft delete
```

### Fichas (Sessões de Treinamento)

```
GET    /api/v2/fichas                    # Listar
POST   /api/v2/fichas                    # Criar
PUT    /api/v2/fichas/:id                # Atualizar
PUT    /api/v2/fichas/:id/assinatura     # Assinar
POST   /api/v2/fichas/:id/manobras       # Adicionar manobra
GET    /api/v2/fichas/:id/pdf            # Gerar PDF
```

### Qualificações

```
GET    /api/v2/qualificacoes             # Listar
POST   /api/v2/qualificacoes             # Criar
PUT    /api/v2/qualificacoes/:id         # Atualizar
POST   /api/v2/qualificacoes/:id/upload-certificado  # Upload
```

### Agendamentos

```
GET    /api/v2/agendamentos              # Listar
POST   /api/v2/agendamentos              # Criar
PUT    /api/v2/agendamentos/:id          # Atualizar
DELETE /api/v2/agendamentos/:id          # Soft delete
```

### Simuladores

```
GET    /api/v2/simuladores               # Listar
GET    /api/v2/simuladores/:id/slots     # Slots disponíveis
GET    /api/v2/simuladores-consolidado/templates  # Templates (com cache)
```

---

## 🗄️ BANCO DE DADOS - TABELAS CRÍTICAS

```sql
-- Entidades principais
funcionarios                    (15 cols) - Pilotos, instrutores, checadores
simuladores                     (13 cols) - Equipamentos de treinamento
agendamentos_simulador          (18 cols) - Reservas de simulador
fichas                          (27 cols) - Sessões de treinamento (CRÍTICA)
avaliacoes_manobras             (14 cols) - Avaliações de manobras
manobras                        (10 cols) - Lista de manobras

-- Master data
qualificacoes                   (13 cols) - Certificações dos pilotos
tipos_qualificacoes             (8 cols)  - Tipos de certificação
habilitacoes                    (11 cols) - Status de habilitação
empresas                        (12 cols) - Empresas/Clientes

-- Config
system_config                   (4 cols)  - Configurações de sistema
empresa_config                  (5 cols)  - Config por empresa
```

---

## 🎯 TIPOS TYPESCRIPT PRINCIPAIS

```typescript
// /src/worker/types/index.ts

type UserRole = 'ADMIN' | 'COMPLIANCE' | 'GESTOR' | 'INSTRUTOR' | 'FUNCIONARIO';

interface Funcionario {
  id: number;
  nome: string;
  matricula?: string;
  funcao: string;
  is_instrutor: boolean;
  is_checador: boolean;
  status: 'ATIVO' | 'INATIVO' | 'LICENCA' | 'DEMITIDO';
  // ... 15 campos total
}

interface Ficha {
  id: number;
  uuid: string;
  agendamento_id: number;
  simulador_id: number;
  funcionario_id: number;
  instrutor_id: number;
  data_sessao: string;
  hora_inicio: string;
  hora_fim: string;
  duracao_minutos: number;
  status: 'RASCUNHO' | 'EM_AVALIACAO' | 'APROVADO' | 'REPROVADO' | 'CANCELADO';
  assinatura_instrutor_data?: string;
  // ... 27 campos total
}

interface Qualificacao {
  id: number;
  uuid: string;
  funcionario_id: number;
  tipo_qualificacao_id: number;
  data_conclusao: string;
  data_vencimento: string;
  status: 'VALIDA' | 'VENCIDA' | 'VENCENDO';
  is_renovada: boolean;
  arquivo_url?: string;
  // ... 13 campos total
}
```

---

## 🔧 ARQUIVOS CRÍTICOS PARA MODIFICAR

| Tarefa              | Arquivo(s)                                                |
| ------------------- | --------------------------------------------------------- |
| Novo endpoint       | `src/worker/api/v2/novo-recurso.ts`                       |
| Novo campo em Ficha | `src/worker/types/index.ts` + `src/worker/dtos/fichas.ts` |
| Alterar validação   | `src/worker/dtos/*.ts` (Zod schemas)                      |
| Novo query no banco | `src/worker/migrations/YYYY_descricao.sql`                |
| Novo middleware     | `src/worker/middleware/novo-middleware.ts`                |
| Novo erro           | `src/worker/utils/AppError.ts`                            |
| Alterar cache       | `src/worker/utils/cache.ts` ou `cache-qualificacoes.ts`   |

---

## 🚨 KNOWN ISSUES & FIXES

### ✅ RESOLVIDO: NaN Error no /instrutores

- **Problema:** Endpoint retornava NaN
- **Fix:** Corrigido em commit `6c0efa4`
- **Status:** ✅ LIVE

### ✅ RESOLVIDO: Missing Column assinatura_instrutor_data

- **Problema:** Coluna não existia
- **Fix:** Adicionado em migration `2022_fix_fichas_assinatura_columns.sql`
- **Status:** ✅ LIVE

### ✅ RESOLVIDO: 42 referências fichas_sessao → fichas

- **Problema:** Código antigo usava alias errado
- **Fix:** Substituído globalmente em 20 arquivos
- **Status:** ✅ LIVE (commit `ea36cce`)

### ✅ RESOLVIDO: N+1 Queries em templates

- **Problema:** 2000ms latência
- **Fix:** Adicionado cache (5min) + JOIN otimizado
- **Performance:** **15.3x mais rápido** (131ms)
- **Status:** ✅ LIVE

---

## 🔍 DEBUGGING CHECKLIST

```bash
# 1. Verificar se servidor está rodando
npm run health

# 2. Verificar DB sync
wrangler d1 execute airtrust-db --local --command "SELECT name FROM sqlite_master WHERE type='table';"

# 3. Verificar migrations
wrangler d1 execute airtrust-db --local --command "PRAGMA table_info(fichas);"

# 4. Testar endpoint específico
curl -s http://localhost:8787/api/v2/funcionarios/instrutores | jq '.'

# 5. Limpar cache local
rm -rf .wrangler/state node_modules/.vite

# 6. Rebuild completo
npm run build:clean
npm run build

# 7. Deploy para staging
npm run deploy
```

---

## 📊 CACHE KEYS

```
simuladores:templates           (5 min)   - Templates de treinamento
qualificacoes:*                 (10 min)  - Todas qualificacoes
funcionarios:instrutores        (15 min)  - Instrutores (listar)
manobras:disponiveis            (5 min)   - Manobras disponíveis
fichas:{id}                     (1 min)   - Ficha específica
```

**Invalidar cache:**

```typescript
import { invalidateCache } from './utils/cache-qualificacoes';

invalidateCache('qualificacoes:'); // Remove todas qualificacoes
invalidateCache('simuladores:templates'); // Remove template cache
invalidateCache('*'); // Clear all
```

---

## 🎨 RESPONSE FORMAT PADRÃO

### Success

```json
{
  "success": true,
  "data": {
    /* objeto ou array */
  },
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

### Error

```json
{
  "success": false,
  "error": "Mensagem amigável",
  "code": "ERROR_CODE",
  "details": {
    /* opcional */
  }
}
```

---

## 🔐 RBAC - Quem pode fazer o quê

```typescript
// Admin only
app.post('/admin/limpar-dados', checkRole(['ADMIN']), handler);

// Compliance + Admin
app.get('/audit-reports/completo', checkRole(['ADMIN', 'COMPLIANCE']), handler);

// Gestor pode gerenciar agendamentos
app.post('/api/v2/agendamentos', checkRole(['ADMIN', 'GESTOR']), handler);

// Instrutor pode criar fichas
app.post('/api/v2/fichas', checkRole(['ADMIN', 'INSTRUTOR']), handler);

// Qualquer um autenticado
app.get('/api/v2/funcionarios', requireAuth(), handler);
```

---

## 🚀 VERSÃO ATUAL

```
Version: 5dfb9939-bf9f-48b5-ad0e-3b4207a7bd04
Status: ✅ LIVE & VERIFIED
Build Time: 3.64s
Deployed: 6 de Novembro de 2025, 02:45 UTC
Quality: 100% tests passing
```

---

## 📞 SUPPORT CONTACTS

- **Frontend Issues:** React 19 + Vite setup
- **Backend Issues:** Hono + Cloudflare Workers
- **Database Issues:** D1 SQLite migrations
- **Deployment Issues:** wrangler CLI + Pages

---

**Este é um documento de referência rápida**  
**Para detalhes completos, ver: ARQUITETURA_COMPLETA_AIRTRUST_20251106.md**

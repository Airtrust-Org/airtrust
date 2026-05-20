# ✅ FASE 22 – PARTE 1: ARQUITETURA DO BACKEND (WORKER AIRTRUST)

**Data**: 15 de Novembro de 2025  
**Projeto**: AirTrust v1  
**Localização**: `/Users/filipedaumas/Documents/airtrust v1/worker-airtrust`

---

## 📋 SUMÁRIO

1. [Visão Geral](#1-visão-geral)
2. [Estrutura de Arquivos](#2-estrutura-de-arquivos)
3. [Entrypoint e Middlewares](#3-entrypoint-e-middlewares)
4. [Rotas e Endpoints](#4-rotas-e-endpoints)
5. [Acesso a D1 (Database)](#5-acesso-a-d1-database)
6. [Acesso a R2 (Storage)](#6-acesso-a-r2-storage)
7. [Pontos Frágeis Conhecidos](#7-pontos-frágeis-conhecidos)

---

## 1. VISÃO GERAL

### 1.1 Tecnologias

```yaml
Runtime: Cloudflare Workers
Framework: Hono v4.10.1
Linguagem: TypeScript 5.8.3
Database: D1 (SQLite distribuído)
Storage: R2 (Object Storage)
Autenticação: JWT (jsonwebtoken)
```

### 1.2 URLs de Produção

```yaml
Worker API: https://airtrust.airtrust.workers.dev
D1 Database ID: 7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae
R2 Bucket: airtrust-files
Account ID: 4dca4e5fddc6a351651dd224f456586f
```

### 1.3 Configuração (wrangler.toml)

```toml
name = "airtrust"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# D1 Binding
[[d1_databases]]
binding = "DB"
database_name = "airtrust-db"
database_id = "7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"

# R2 Binding
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "airtrust-files"

# Environment Variables
[vars]
ENVIRONMENT = "production"
API_URL = "https://airtrust.airtrust.workers.dev"
FRONTEND_URL = "https://production.airtrust.pages.dev"
CORS_ORIGINS = "https://production.airtrust.pages.dev,..."
```

### 1.4 Secrets Configurados

```yaml
JWT_SECRET: ✅ Configurado (via wrangler secret put)
```

---

## 2. ESTRUTURA DE ARQUIVOS

```
worker-airtrust/
├── src/
│   ├── index.ts                 # Entrypoint principal
│   ├── types/
│   │   └── index.ts            # Tipos TypeScript (Env, Funcionario, etc.)
│   ├── middleware/
│   │   ├── auth.ts             # Autenticação JWT
│   │   ├── cors.ts             # CORS configuration
│   │   ├── error-handler.ts    # Error handling global
│   │   ├── logger.ts           # Request logging
│   │   └── rbac.ts             # Role-based access control
│   ├── routes/
│   │   ├── auth.ts             # Login, refresh, logout
│   │   ├── funcionarios.ts     # CRUD funcionários
│   │   ├── qualificacoes.ts    # Tipos + histórico
│   │   ├── habilitacoes.ts     # Habilitações (dados completos)
│   │   └── simuladores.ts      # Simuladores + sessões
│   ├── utils/
│   │   ├── db.ts               # Helpers D1 (pagination, soft delete)
│   │   └── security.ts         # Validações (email, CPF, datas)
│   └── dtos/                   # Data Transfer Objects (não implementado)
├── migrations/
│   ├── 0001_initial_schema.sql
│   ├── 0002_seed_minimo.sql
│   ├── 0003_create_usuarios.sql
│   ├── 0004_seed_usuarios.sql
│   └── 0006_add_missing_columns.sql
├── wrangler.toml               # Configuração Cloudflare
├── package.json
└── tsconfig.json
```

---

## 3. ENTRYPOINT E MIDDLEWARES

### 3.1 Entrypoint (`src/index.ts`)

```typescript
import { Hono } from 'hono';

const app = new Hono<{ Bindings: Env }>();

// ===== MIDDLEWARES GLOBAIS =====
app.use('*', cors());
app.use('*', detailedLogger());
app.onError(errorHandler);

// ===== HEALTH CHECK =====
app.get('/api/health', async (c) => {
  const db = c.env.DB;
  const dbTest = await db.prepare('SELECT 1 as test').first();

  return c.json({
    success: true,
    status: 'healthy',
    db: { connected: !!dbTest },
    version: '1.0.0',
  });
});

// ===== ROTAS =====
app.route('/api/auth', authRoutes);
app.route('/api/funcionarios', funcionariosRoutes);
app.route('/api/qualificacoes', qualificacoesRoutes);
app.route('/api/habilitacoes', habilitacoesRoutes);
app.route('/api/simuladores', simuladoresRoutes);

// Alias: /api/historico → /api/qualificacoes/historico
app.get('/api/historico', (c) => {
  const url = new URL(c.req.url);
  return c.redirect(`/api/qualificacoes/historico${url.search}`, 301);
});

// ===== CRON JOBS (DESABILITADO) =====
export default {
  async fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    // Recalcular status de qualificações (VALIDA/VENCIDA)
    // Enviar alertas de vencimento
    // DESABILITADO: conta free tem limite de 5 cron triggers
  },
};
```

### 3.2 Middlewares Implementados

#### CORS (`middleware/cors.ts`)

```yaml
Função: Permitir requisições do frontend
Origens permitidas:
  - https://production.airtrust.pages.dev
  - https://*.airtrust.pages.dev
  - localhost (development)
Headers permitidos:
  - Content-Type
  - Authorization
Métodos: GET, POST, PUT, DELETE, OPTIONS
```

#### Logger (`middleware/logger.ts`)

```yaml
Tipos:
  - logger(): Simples (método + path + status)
  - detailedLogger(): Completo (+ body, query, headers)

Usado em: Todas as requisições (app.use('*', detailedLogger()))
Console output: Cloudflare Workers Logs
```

#### Error Handler (`middleware/error-handler.ts`)

```yaml
Função: Capturar erros não tratados e retornar JSON consistente
Formato de resposta:
  {
    "success": false,
    "error": "mensagem do erro",
    "code": "ERROR_CODE" (opcional)
  }

Helpers exportados:
  - notFound(message): HTTP 404
  - badRequest(message): HTTP 400
  - unauthorized(message): HTTP 401
  - forbidden(message): HTTP 403
```

#### Auth (`middleware/auth.ts`)

```yaml
Função: Validar JWT token em rotas protegidas
Header esperado: Authorization: Bearer <token>
Verifica: Assinatura, expiração, payload
Adiciona ao contexto: c.user (id, email, role)

Status: ⚠️ IMPLEMENTADO mas NÃO USADO nas rotas
Motivo: Rotas não aplicam middleware auth() ainda
```

#### RBAC (`middleware/rbac.ts`)

```yaml
Função: Controle de acesso baseado em roles
Roles suportados: admin, manager, user
Função: requireRole(['admin', 'manager'])

Status: ⚠️ IMPLEMENTADO mas NÃO USADO
Motivo: Depende de auth() estar aplicado
```

---

## 4. ROTAS E ENDPOINTS

### 4.1 Autenticação (`/api/auth`)

| Método | Path                | Propósito               | Status          | Crítico  |
| ------ | ------------------- | ----------------------- | --------------- | -------- |
| POST   | `/api/auth/login`   | Login com email/senha   | ✅ Implementado | 🔴 SIM   |
| POST   | `/api/auth/refresh` | Renovar access token    | ✅ Implementado | 🟡 Médio |
| POST   | `/api/auth/logout`  | Invalidar refresh token | ✅ Implementado | 🟢 Baixo |
| GET    | `/api/auth/me`      | Dados do usuário logado | ✅ Implementado | 🟡 Médio |

**Tabela D1**: `usuarios`, `refresh_tokens`

**Fluxo de Login**:

```
1. POST /api/auth/login { email, senha }
2. Busca usuário em D1: SELECT * FROM usuarios WHERE email = ?
3. Valida senha: bcrypt.compare(senha, senha_hash)
4. Gera tokens:
   - accessToken: JWT válido por 1h
   - refreshToken: UUID armazenado em D1, válido por 7 dias
5. Retorna: { success: true, data: { accessToken, refreshToken, user } }
```

---

### 4.2 Funcionários (`/api/funcionarios`)

| Método | Path                    | Propósito           | Status          | Crítico  |
| ------ | ----------------------- | ------------------- | --------------- | -------- |
| GET    | `/api/funcionarios`     | Lista com paginação | ⚠️ Parcial      | 🔴 SIM   |
| GET    | `/api/funcionarios/:id` | Busca por ID        | ✅ Implementado | 🔴 SIM   |
| POST   | `/api/funcionarios`     | Criar funcionário   | ✅ Implementado | 🔴 SIM   |
| PUT    | `/api/funcionarios/:id` | Atualizar           | ✅ Implementado | 🔴 SIM   |
| DELETE | `/api/funcionarios/:id` | Soft delete         | ✅ Implementado | 🟡 Médio |

**Tabela D1**: `funcionarios`

**Query Params (GET)**:

```yaml
page: Número da página (default: 1)
limit: Itens por página (default: 50, max: 100)
search: Busca por nome, email, cpf, matricula
status: Filtro por status (true=ATIVO, false=INATIVO)
cargo: Filtro por cargo
orderBy: Coluna para ordenação (default: id)
order: Direção (ASC/DESC, default: DESC)
```

**Resposta (GET /api/funcionarios)**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "matricula": "MAT001",
      "nome": "João Silva",
      "cpf": "12345678900",
      "email": "joao@example.com",
      "telefone": "11999999999",
      "cargo": "PILOTO",
      "setor": "OPERACIONAL",
      "funcao": "Piloto Comandante",
      "codigo_anac": "PLA12345",
      "ativo": 1,
      "is_instrutor": 0,
      "is_checador": 0,
      "status": "ATIVO",
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

**⚠️ PROBLEMA CONHECIDO**:

- Coluna `setor` usada no código mas **NÃO EXISTE EM PRODUÇÃO**
- Causa: `D1_ERROR: no such column: setor` → HTTP 500
- Solução aplicada: Migration 0006 adiciona coluna `setor`
- Status: Migration criada, **PRECISA SER APLICADA EM PRODUÇÃO**

---

### 4.3 Qualificações (`/api/qualificacoes`)

#### 4.3.1 Tipos de Qualificações

| Método | Path                       | Propósito           | Status          | Crítico |
| ------ | -------------------------- | ------------------- | --------------- | ------- |
| GET    | `/api/qualificacoes`       | Lista tipos (alias) | ✅ Implementado | 🔴 SIM  |
| GET    | `/api/qualificacoes/tipos` | Lista tipos         | ✅ Implementado | 🔴 SIM  |

**Tabela D1**: `qualificacoes_tipos`

**Resposta**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "nome": "Piloto Privado de Avião",
      "codigo": "PPA",
      "categoria": "HABILITACAO",
      "descricao": "Licença para pilotar avião como piloto privado",
      "validade_meses": 24,
      "obrigatoria": 1,
      "created_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### 4.3.2 Histórico de Qualificações

| Método | Path                               | Propósito            | Status          | Crítico  |
| ------ | ---------------------------------- | -------------------- | --------------- | -------- |
| GET    | `/api/qualificacoes/historico`     | Lista histórico      | ⚠️ Parcial      | 🔴 SIM   |
| GET    | `/api/historico`                   | Alias (redirect 301) | ✅ Implementado | 🟡 Médio |
| POST   | `/api/qualificacoes/historico`     | Registrar nova       | ✅ Implementado | 🔴 SIM   |
| PUT    | `/api/qualificacoes/historico/:id` | Atualizar            | ✅ Implementado | 🟡 Médio |
| DELETE | `/api/qualificacoes/historico/:id` | Soft delete          | ✅ Implementado | 🟡 Médio |

**Tabela D1**: `qualificacoes_historico` (legacy, já populada)

**Query Params (GET)**:

```yaml
funcionario_id: Filtrar por funcionário
qualificacao_id: Filtrar por tipo
status: Filtrar por status (VALIDA, VENCIDA, PROXIMA_VENCIMENTO)
page: Número da página (default: 1)
limit: Itens por página (default: 50)
```

**Schema Legado (Dados Importados)**:

```sql
-- qualificacoes_historico NÃO TEM FK real
-- Usa TEXT para relacionamentos (matricula, nome da qualificação)
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY,
  funcionario_id TEXT,        -- Matrícula do funcionário (não FK)
  nome TEXT,                  -- Nome da qualificação (não FK)
  codigo TEXT,                -- Código (pode ser NULL)
  data_conclusao TEXT,        -- ou data_emissao
  data_vencimento TEXT,       -- ou data_validade
  status TEXT,                -- Calculado em tempo real
  observacoes TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);
```

**Query Principal**:

```sql
SELECT
  qh.id,
  qh.funcionario_id,
  qh.nome as qualificacao_nome,
  -- Buscar código de qualificacoes_tipos via nome (subquery)
  COALESCE(
    qh.codigo,
    (SELECT codigo FROM qualificacoes_tipos
     WHERE nome = qh.nome AND deleted_at IS NULL LIMIT 1)
  ) as codigo,
  qh.data_conclusao,
  qh.data_vencimento,
  -- Status calculado dinamicamente
  CASE
    WHEN julianday(qh.data_vencimento) < julianday('now') THEN 'VENCIDA'
    WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 THEN 'PROXIMA_VENCIMENTO'
    ELSE 'VALIDA'
  END as status,
  f.nome as funcionario_nome,
  f.matricula as funcionario_matricula
FROM qualificacoes_historico qh
LEFT JOIN funcionarios f ON qh.funcionario_id = f.matricula
WHERE qh.deleted_at IS NULL
ORDER BY qh.data_vencimento ASC
LIMIT ? OFFSET ?
```

**Resposta**:

```json
{
  "success": true,
  "data": [
    {
      "id": 932,
      "funcionario_id": "MAT001",
      "funcionario_nome": "João Silva",
      "funcionario_matricula": "MAT001",
      "qualificacao_nome": "Examinador Credenciado - Solo",
      "codigo": "Examinador",
      "data_conclusao": "2023-06-15",
      "data_vencimento": "2026-06-15",
      "status": "VALIDA",
      "observacoes": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1036,
    "totalPages": 21
  }
}
```

**⚠️ PROBLEMAS CONHECIDOS**:

1. **Schema legado**: Sem FK real, usa TEXT para relacionamentos
2. **Código NULL**: Muitos registros sem `codigo`, resolvido via subquery
3. **Status hardcoded**: Antes era "MIGRADO" fixo, agora calculado dinamicamente
4. **Duplicação potencial**: JOIN com qualificacoes_tipos pode duplicar linhas (resolvido com subquery + LIMIT 1)
5. **Performance**: 1036 registros, queries podem ser lentas sem índices

---

### 4.4 Habilitações (`/api/habilitacoes`)

| Método | Path                | Propósito                    | Status          | Crítico  |
| ------ | ------------------- | ---------------------------- | --------------- | -------- |
| GET    | `/api/habilitacoes` | Lista habilitações completas | ✅ Implementado | 🟡 Médio |

**Tabela D1**: `habilitacoes` (se existir, schema desconhecido)

**Diferença para `/api/qualificacoes/historico`**:

- Histórico: Dados legados importados, schema simplificado
- Habilitações: Tabela nova com campos completos (renovações, timezone, instrutor)

**Status**: Endpoint implementado, mas tabela pode não existir em produção

---

### 4.5 Simuladores (`/api/simuladores`)

#### 4.5.1 Simuladores

| Método | Path               | Propósito         | Status          | Crítico  |
| ------ | ------------------ | ----------------- | --------------- | -------- |
| GET    | `/api/simuladores` | Lista simuladores | ✅ Implementado | 🟡 Médio |

**Tabela D1**: `simuladores`

**Query Params**:

```yaml
ativo: Filtrar apenas ativos (true/false)
```

**Resposta**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "modelo": "A320",
      "fabricante": "Airbus",
      "tipo": "FULL_FLIGHT_SIMULATOR",
      "codigo": "SIM-A320-001",
      "ativo": 1,
      "created_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### 4.5.2 Sessões de Simulador

| Método | Path                           | Propósito        | Status          | Crítico  |
| ------ | ------------------------------ | ---------------- | --------------- | -------- |
| GET    | `/api/simuladores/sessoes`     | Lista sessões    | ✅ Implementado | 🟡 Médio |
| POST   | `/api/simuladores/sessoes`     | Agendar sessão   | ✅ Implementado | 🟡 Médio |
| PUT    | `/api/simuladores/sessoes/:id` | Atualizar sessão | ✅ Implementado | 🟡 Médio |
| DELETE | `/api/simuladores/sessoes/:id` | Cancelar sessão  | ✅ Implementado | 🟡 Médio |

**Tabelas D1**: `sessoes_simulador`, `participantes_sessao`

**Query Params (GET)**:

```yaml
simulador_id: Filtrar por simulador
instrutor_id: Filtrar por instrutor
status: Filtrar por status (AGENDADA, EM_ANDAMENTO, CONCLUIDA, CANCELADA)
data_inicio: Filtrar por período (>=)
data_fim: Filtrar por período (<=)
page: Número da página
limit: Itens por página
```

**Resposta**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "simulador_id": 1,
      "instrutor_id": 10,
      "checador_id": null,
      "data_sessao": "2025-11-20T14:00:00Z",
      "duracao_minutos": 120,
      "tipo_sessao": "TREINAMENTO",
      "status": "AGENDADA",
      "observacoes": "Sessão de emergências",
      "created_at": "2025-11-15T10:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 5, "totalPages": 1 }
}
```

---

### 4.6 Health & Version

| Método | Path           | Propósito             | Status          | Crítico  |
| ------ | -------------- | --------------------- | --------------- | -------- |
| GET    | `/api/health`  | Status do worker + D1 | ✅ Implementado | 🔴 SIM   |
| GET    | `/api/version` | Versão e ambiente     | ✅ Implementado | 🟢 Baixo |

**Resposta `/api/health`**:

```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-11-15T12:00:00Z",
  "environment": "production",
  "db": {
    "connected": true,
    "test": true
  },
  "version": "1.0.0"
}
```

---

## 5. ACESSO A D1 (DATABASE)

### 5.1 Camada de Acesso

**Localização**: `src/utils/db.ts`

**Funções Utilitárias**:

```typescript
// Soft Delete
export async function softDelete(
  db: D1Database,
  table: string,
  id: number | string,
): Promise<boolean> {
  const query = `UPDATE ${table} SET deleted_at = datetime('now') WHERE id = ?`;
  const result = await db.prepare(query).bind(id).run();
  return result.meta.changes > 0;
}

// Paginação
export function calculatePagination(params: { page: number; limit: number }, total: number) {
  const { page, limit } = params;
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    offset: (page - 1) * limit,
  };
}

// Contar registros
export async function countRecords(
  db: D1Database,
  table: string,
  whereClause: string,
  bindings: unknown[],
): Promise<number> {
  const query = `SELECT COUNT(*) as total FROM ${table} WHERE ${whereClause}`;
  const result = await db
    .prepare(query)
    .bind(...bindings)
    .first();
  return result?.total || 0;
}

// Busca textual (LIKE)
export function buildSearchWhere(
  columns: string[],
  search: string,
): { clause: string; binding: string } {
  const conditions = columns.map((col) => `${col} LIKE ?`).join(' OR ');
  return {
    clause: `(${conditions})`,
    binding: `%${search}%`,
  };
}

// Ordenação
export function buildOrderBy(column?: string, direction?: 'ASC' | 'DESC'): string {
  if (!column) return 'id DESC';
  const safeDirection = direction === 'ASC' ? 'ASC' : 'DESC';
  return `${column} ${safeDirection}`;
}
```

### 5.2 Padrão de Query

```typescript
// Exemplo: GET /api/funcionarios
const db = c.env.DB;

// 1. Construir WHERE clause
const whereClauses = ['deleted_at IS NULL'];
const bindings = [];

if (search) {
  whereClauses.push('(nome LIKE ? OR email LIKE ?)');
  bindings.push(`%${search}%`, `%${search}%`);
}

const whereClause = whereClauses.join(' AND ');

// 2. Contar total
const total = await countRecords(db, 'funcionarios', whereClause, bindings);

// 3. Calcular paginação
const pagination = calculatePagination({ page, limit }, total);

// 4. Buscar dados
const { results } = await db
  .prepare(
    `
    SELECT * FROM funcionarios
    WHERE ${whereClause}
    ORDER BY ${buildOrderBy(orderBy, order)}
    LIMIT ? OFFSET ?
  `,
  )
  .bind(...bindings, pagination.limit, pagination.offset)
  .all();

// 5. Retornar
return c.json({
  success: true,
  data: results,
  pagination,
});
```

### 5.3 Sem ORM

```yaml
Status: ❌ NÃO USA ORM
Queries: SQL puro com prepared statements
Proteção: Parameterized queries (previne SQL injection)
Vantagem: Performance, controle total
Desvantagem: Mais verboso, sem type safety automático
```

---

## 6. ACESSO A R2 (STORAGE)

### 6.1 Configuração

```yaml
Binding: BUCKET (c.env.BUCKET)
Bucket Name: airtrust-files
Tipo: R2Bucket (Cloudflare Workers Types)
```

### 6.2 Uso Atual

```typescript
// Binding configurado mas NÃO IMPLEMENTADO nas rotas
// Acesso disponível via:
const bucket = c.env.BUCKET;

// Operações R2:
await bucket.put(key, file); // Upload
await bucket.get(key); // Download
await bucket.delete(key); // Deletar
await bucket.list({ prefix: '...' }); // Listar
```

### 6.3 Padrão de Nomenclatura Esperado

```yaml
Certificados de Qualificação:
  CERT-{MATRICULA}-{CODIGO}-{DATA}.pdf
  Exemplo: CERT-MAT001-PPA-20250115.pdf

Documentos de Funcionários:
  DOCS-{MATRICULA}-{TIPO}-{DATA}.pdf
  Exemplo: DOCS-MAT001-RG-20250115.pdf

Sessões de Simulador:
  SIM-{SESSAO_ID}-{TIPO}-{DATA}.pdf
  Exemplo: SIM-123-RELATORIO-20250115.pdf
```

### 6.4 Status

```yaml
R2 Binding: ✅ Configurado
Endpoints de Upload: ❌ NÃO IMPLEMENTADOS
Frontend Upload: ⚠️ Código existe mas sem backend
Integração: ⚠️ PENDENTE
```

---

## 7. PONTOS FRÁGEIS CONHECIDOS

### 7.1 Críticos (Quebram o Sistema)

#### 🔴 1. Coluna `setor` em Funcionários

```yaml
Problema: worker-airtrust/src/routes/funcionarios.ts usa coluna 'setor'
Database: Coluna NÃO EXISTE em produção
Erro: D1_ERROR: no such column: setor → HTTP 500
Impacto: GET /api/funcionarios QUEBRADO em produção
Solução: Migration 0006_add_missing_columns.sql criada
Status: ⚠️ MIGRATION PRECISA SER APLICADA EM PRODUÇÃO
Comando: wrangler d1 execute airtrust-db --env=production --file=./migrations/0006_add_missing_columns.sql
```

#### 🔴 2. Schema Legado de Qualificações

```yaml
Problema: qualificacoes_historico sem FK real, usa TEXT
Impacto:
  - Queries complexas (subquery para buscar código)
  - Performance ruim (1036 registros sem índices)
  - Duplicação potencial (JOIN gera múltiplas linhas)
Solução Atual: Subquery com LIMIT 1
Solução Ideal: Normalizar schema, criar FKs reais
Status: ⚠️ WORKAROUND APLICADO, REFACTOR PENDENTE
```

#### 🔴 3. Endpoints Retornando 404 em Produção

```yaml
Problema: /api/qualificacoes/historico retorna 404 em algumas requisições
Causa Possível: 1. Erro no código de rota (typo)
  2. Divergência entre rotas dev/prod
  3. Cache do Cloudflare
Verificado: curl retorna 200 OK
Status: ⚠️ INTERMITENTE, INVESTIGAR
```

### 7.2 Médios (Funciona Parcialmente)

#### 🟡 1. Autenticação Não Aplicada

```yaml
Problema: Middleware auth() implementado mas NÃO USADO
Impacto: Todas as rotas públicas (sem proteção)
Risco: Qualquer um pode acessar/modificar dados
Solução: Aplicar auth() nas rotas:
  app.get('/api/funcionarios', auth(), async (c) => ...)
Status: ⚠️ PENDENTE
```

#### 🟡 2. RBAC Não Aplicado

```yaml
Problema: requireRole() implementado mas NÃO USADO
Impacto: Sem controle de permissões (admin/manager/user)
Depende: auth() estar aplicado primeiro
Status: ⚠️ PENDENTE
```

#### 🟡 3. R2 Não Integrado

```yaml
Problema: Binding configurado mas sem endpoints de upload
Impacto: Frontend não consegue fazer upload de certificados
Risco: Funcionalidade de Pasta Virtual não funciona
Status: ⚠️ PENDENTE IMPLEMENTAÇÃO
```

### 7.3 Baixos (Melhorias)

#### 🟢 1. Sem Validação de Dados

```yaml
Problema: POST/PUT não validam payload (sem Zod)
Impacto: Dados inválidos podem ser inseridos no D1
Solução: Implementar DTOs com Zod validation
Status: ⚠️ PENDENTE
```

#### 🟢 2. Sem Testes Automatizados

```yaml
Problema: Zero testes unitários ou de integração
Impacto: Refactors arriscados, regressões não detectadas
Solução: Vitest + testes de rotas
Status: ⚠️ PENDENTE
```

#### 🟢 3. Cron Jobs Desabilitados

```yaml
Problema: Recalcular status de qualificações via cron está desabilitado
Motivo: Conta free tem limite de 5 cron triggers
Impacto: Status pode ficar desatualizado
Workaround: Calculado em tempo real nas queries
Status: ✅ OK (workaround funciona)
```

---

## 8. RESUMO EXECUTIVO

### 8.1 Estado Atual

```yaml
✅ FUNCIONANDO:
  - Health check e version
  - Autenticação (login, refresh, logout)
  - Funcionários: GET, POST, PUT, DELETE (com bug em prod)
  - Qualificações: GET tipos, GET histórico (com workarounds)
  - Simuladores: GET simuladores, GET/POST/PUT/DELETE sessões

⚠️ FUNCIONANDO COM PROBLEMAS:
  - GET /api/funcionarios: Quebra em prod (coluna setor)
  - GET /api/qualificacoes/historico: Schema legado, queries lentas
  - Auth: Implementado mas não aplicado nas rotas

❌ NÃO FUNCIONANDO:
  - Upload de certificados (R2)
  - Pasta Virtual (backend)
  - Proteção de rotas (auth middleware)
  - RBAC (controle de permissões)
```

### 8.2 Prioridades de Correção

```yaml
URGENTE (Fazer Agora): 1. Aplicar migration 0006 em produção (coluna setor)
  2. Testar GET /api/funcionarios em prod após migration
  3. Aplicar middleware auth() nas rotas críticas

IMPORTANTE (Próxima Sprint): 4. Implementar endpoints de upload R2
  5. Normalizar schema de qualificacoes_historico
  6. Adicionar índices em D1 (performance)
  7. Implementar validação com Zod

MELHORIAS (Backlog): 8. Adicionar testes automatizados
  9. Implementar RBAC nas rotas
  10. Documentar API com OpenAPI/Swagger
```

---

**Próximo Relatório**: FASE22-PARTE2-FRONTEND.md

**Gerado em**: 15/11/2025  
**Autor**: GitHub Copilot - Auditor de Arquitetura

# 🚀 AirTrust Worker

Worker Cloudflare moderno e escalável para o backend do sistema AirTrust, construído com **Hono v4** + **TypeScript** + **D1** + **R2**.

## 📋 Índice

- [Stack Tecnológica](#-stack-tecnológica)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Setup Local](#%EF%B8%8F-setup-local)
- [Desenvolvimento](#-desenvolvimento)
- [Deploy](#-deploy)
- [API Endpoints](#-api-endpoints)
- [Configuração](#%EF%B8%8F-configuração)
- [Extensões Futuras](#-extensões-futuras)

---

## 🛠️ Stack Tecnológica

- **Runtime**: Cloudflare Workers (V8 isolates)
- **Framework**: [Hono v4](https://hono.dev/) - Ultra-rápido, leve, modular
- **Language**: TypeScript 5.6+
- **Database**: D1 (SQLite na edge)
- **Storage**: R2 (Object storage compatível com S3)
- **Auth**: JWT via [jose](https://github.com/panva/jose)
- **Validation**: TypeScript types + runtime validation
- **Logging**: Console + Cloudflare Logs

---

## 📁 Estrutura do Projeto

```
worker-airtrust/
├── src/
│   ├── index.ts                  # Entry point principal
│   ├── types/
│   │   └── index.ts              # Definições TypeScript (Env, tipos de domínio)
│   ├── middleware/
│   │   ├── cors.ts               # CORS configurável via ENV
│   │   ├── logger.ts             # Request/response logging
│   │   ├── error-handler.ts      # Global error handling (JSON)
│   │   └── auth.ts               # JWT authentication (preparado, desabilitado)
│   ├── utils/
│   │   ├── db.ts                 # Helpers D1 (soft delete, pagination, audit)
│   │   └── security.ts           # JWT, hashing, validation, sanitization
│   └── routes/
│       ├── funcionarios.ts       # CRUD de funcionários
│       ├── qualificacoes.ts      # Gestão de qualificações
│       └── simuladores.ts        # Gestão de simuladores e sessões
├── wrangler.toml                 # Cloudflare Workers config
├── package.json
├── tsconfig.json
├── .dev.vars                     # Env vars locais (não commitar!)
├── .gitignore
└── README.md
```

---

## ⚙️ Setup Local

### 1. Pré-requisitos

- **Node.js**: v18+ (recomendado v20+)
- **npm** ou **pnpm** ou **yarn**
- **Wrangler CLI**: `npm install -g wrangler` (opcional, já incluído em dev dependencies)
- **Conta Cloudflare** com Workers habilitado

### 2. Clonar e Instalar

```bash
cd worker-airtrust
npm install
```

### 3. Configurar D1 Database

#### Opção A: Usar database existente

Edite `wrangler.toml` e configure o `database_id` existente:

```toml
[[d1_databases]]
binding = "DB"
database_name = "airtrust-db"
database_id = "7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"  # Seu ID aqui
```

#### Opção B: Criar novo database

```bash
npm run d1:create
# Copie o database_id retornado para wrangler.toml
```

#### Aplicar schema/migrations

```bash
# Executar SQL file
npm run d1:execute -- ./schema.sql

# Ou comando direto
npm run d1:query -- "CREATE TABLE IF NOT EXISTS funcionarios (id INTEGER PRIMARY KEY, nome TEXT, ...);"
```

### 4. Configurar R2 Bucket

```bash
npm run r2:create
# Bucket 'airtrust-files' criado
```

### 5. Configurar Secrets

```bash
# JWT Secret (obrigatório)
npm run secret:put JWT_SECRET
# Digite o secret quando solicitado (exemplo: my-super-secret-key-2025)

# Listar secrets configurados
npm run secret:list
```

### 6. Configurar Variáveis Locais

Edite `.dev.vars` com seus valores de desenvolvimento:

```bash
JWT_SECRET="airtrust-dev-secret-2025"
ENVIRONMENT="development"
DEBUG="true"
LOG_LEVEL="debug"
```

**⚠️ IMPORTANTE**: Nunca commite `.dev.vars` com secrets reais!

---

## 🧪 Desenvolvimento

### Executar Worker Localmente

```bash
# Development (porta 8787)
npm run dev

# Staging
npm run dev:staging
```

O worker estará disponível em: **http://localhost:8787**

### Testar Endpoints

```bash
# Health check
curl http://localhost:8787/api/health

# Listar funcionários
curl http://localhost:8787/api/funcionarios

# Criar funcionário
curl -X POST http://localhost:8787/api/funcionarios \
  -H "Content-Type: application/json" \
  -d '{"matricula":"001","nome":"João Silva","cpf":"12345678901","email":"joao@example.com"}'
```

### Ver Logs em Tempo Real

```bash
# Production logs
npm run tail

# Development logs
npm run tail:dev
```

---

## 🚀 Deploy

### Deploy para Produção

```bash
npm run deploy
# Worker publicado em: https://airtrust.airtrust.workers.dev
```

### Deploy para Staging

```bash
npm run deploy:staging
# Worker publicado em: https://airtrust-staging.airtrust.workers.dev
```

### Deploy para Development

```bash
npm run deploy:dev
# Worker publicado em: https://airtrust-dev.airtrust.workers.dev
```

### Após Deploy

1. Configure secrets via Cloudflare Dashboard ou CLI:

   ```bash
   wrangler secret put JWT_SECRET --env production
   ```

2. Verifique health:

   ```bash
   curl https://airtrust.airtrust.workers.dev/api/health
   ```

3. Monitore logs:
   ```bash
   npm run tail
   ```

---

## 📡 API Endpoints

### Health & Version

| Method | Endpoint       | Descrição                         |
| ------ | -------------- | --------------------------------- |
| GET    | `/api/health`  | Health check + DB connection test |
| GET    | `/api/version` | Versão e informações do ambiente  |

### Funcionários

| Method | Endpoint                | Descrição                                     |
| ------ | ----------------------- | --------------------------------------------- |
| GET    | `/api/funcionarios`     | Lista funcionários (paginado, busca, filtros) |
| GET    | `/api/funcionarios/:id` | Busca funcionário por ID                      |
| POST   | `/api/funcionarios`     | Cria novo funcionário                         |
| PUT    | `/api/funcionarios/:id` | Atualiza funcionário                          |
| DELETE | `/api/funcionarios/:id` | Remove funcionário (soft delete)              |

**Query Params (GET /api/funcionarios)**:

- `page`: Número da página (default: 1)
- `limit`: Itens por página (default: 50, max: 100)
- `search`: Busca por nome, email, cpf, matricula
- `status`: Filtro por ativo (true/false)
- `cargo`: Filtro por cargo
- `setor`: Filtro por setor
- `orderBy`: Coluna para ordenação
- `order`: Direção (ASC/DESC)

### Qualificações

| Method | Endpoint                           | Descrição                        |
| ------ | ---------------------------------- | -------------------------------- |
| GET    | `/api/qualificacoes/tipos`         | Lista tipos de qualificações     |
| GET    | `/api/qualificacoes/historico`     | Lista histórico de qualificações |
| POST   | `/api/qualificacoes/historico`     | Registra nova qualificação       |
| PUT    | `/api/qualificacoes/historico/:id` | Atualiza qualificação            |
| DELETE | `/api/qualificacoes/historico/:id` | Remove qualificação              |

### Simuladores

| Method | Endpoint                       | Descrição                  |
| ------ | ------------------------------ | -------------------------- |
| GET    | `/api/simuladores`             | Lista simuladores          |
| GET    | `/api/simuladores/sessoes`     | Lista sessões de simulador |
| POST   | `/api/simuladores/sessoes`     | Agenda nova sessão         |
| PUT    | `/api/simuladores/sessoes/:id` | Atualiza sessão            |
| DELETE | `/api/simuladores/sessoes/:id` | Cancela sessão             |

### Response Format

Todas as respostas seguem o formato padrão:

**Success**:

```json
{
  "success": true,
  "data": { ... }
}
```

**Paginado**:

```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "totalPages": 3
  }
}
```

**Error**:

```json
{
  "success": false,
  "error": "Mensagem de erro",
  "code": "ERROR_CODE"
}
```

---

## ⚙️ Configuração

### Environment Variables (wrangler.toml)

| Variável       | Descrição                                  | Default                               |
| -------------- | ------------------------------------------ | ------------------------------------- |
| `ENVIRONMENT`  | Ambiente (development/staging/production)  | production                            |
| `API_URL`      | URL do Worker                              | https://airtrust.airtrust.workers.dev |
| `FRONTEND_URL` | URL do frontend                            | https://production.airtrust.pages.dev |
| `DEBUG`        | Habilita debug logs                        | false                                 |
| `LOG_LEVEL`    | Nível de log (debug/info/warn/error)       | info                                  |
| `CORS_ORIGINS` | Origens permitidas (separadas por vírgula) | -                                     |

### Secrets (via wrangler secret put)

| Secret       | Descrição              | Obrigatório |
| ------------ | ---------------------- | ----------- |
| `JWT_SECRET` | Secret para JWT tokens | ✅ Sim      |

### Bindings

| Binding  | Tipo        | Nome           | Descrição             |
| -------- | ----------- | -------------- | --------------------- |
| `DB`     | D1 Database | airtrust-db    | Banco de dados SQLite |
| `BUCKET` | R2 Bucket   | airtrust-files | Object storage        |

### Cron Jobs (wrangler.toml)

Configurado para executar diariamente à meia-noite UTC:

```toml
[triggers]
crons = ["0 0 * * *"]
```

**Tarefas executadas**:

- Recalcula status de qualificações (VALIDA → VENCIDA)
- Atualiza qualificações próximas do vencimento (→ PROXIMA_VENCIMENTO)

---

## 🔐 Autenticação (Preparado, Desabilitado)

O worker inclui middleware de autenticação JWT **preparado mas desabilitado** por padrão.

### Para Habilitar

1. **Descomentar middleware** em `src/index.ts`:

   ```typescript
   import { auth } from './middleware/auth';

   // Proteger rotas específicas
   app.use('/api/funcionarios', auth());
   ```

2. **Implementar endpoint de login** que gera tokens:

   ```typescript
   import { generateJWT } from './utils/security';

   app.post('/api/auth/login', async (c) => {
     // Validar credenciais
     const { email, password } = await c.req.json();

     // Gerar token
     const token = await generateJWT({ sub: userId, email, role: 'admin' }, c.env.JWT_SECRET);

     return c.json({ success: true, token });
   });
   ```

3. **Cliente frontend** envia token:
   ```javascript
   fetch('https://airtrust.airtrust.workers.dev/api/funcionarios', {
     headers: {
       Authorization: `Bearer ${token}`,
     },
   });
   ```

---

## 🔮 Extensões Futuras

### 1. Caching com KV

```typescript
// Adicionar KV binding em wrangler.toml
[[kv_namespaces]];
binding = 'KV';
id = 'seu-kv-namespace-id';

// Usar no código
const cached = await c.env.KV.get('funcionarios:list');
if (cached) return c.json(JSON.parse(cached));
```

### 2. Rate Limiting

```typescript
// Middleware simples com KV
export function rateLimit() {
  return async (c, next) => {
    const ip = c.req.header('cf-connecting-ip');
    const key = `rate:${ip}`;
    const requests = await c.env.KV.get(key);

    if (parseInt(requests || '0') > 100) {
      return c.json({ error: 'Too many requests' }, 429);
    }

    await c.env.KV.put(key, String(parseInt(requests || '0') + 1), {
      expirationTtl: 60, // 1 minuto
    });

    await next();
  };
}
```

### 3. Testes Automatizados

```bash
npm install -D vitest @cloudflare/workers-types

# package.json
"scripts": {
  "test": "vitest",
  "test:watch": "vitest --watch"
}
```

```typescript
// src/__tests__/funcionarios.test.ts
import { describe, it, expect } from 'vitest';
// Implementar testes...
```

### 4. Validação com Zod

```bash
npm install zod

// src/dtos/funcionarios.ts
import { z } from 'zod';

export const CreateFuncionarioSchema = z.object({
  matricula: z.string().min(1),
  nome: z.string().min(3),
  cpf: z.string().length(11),
  email: z.string().email(),
  // ...
});

// Usar nas rotas
const body = CreateFuncionarioSchema.parse(await c.req.json());
```

### 5. Observability (Sentry, Datadog)

```typescript
// Enviar erros para Sentry
export const errorHandler: ErrorHandler = (err, c) => {
  // Log to Sentry
  fetch('https://sentry.io/api/...', {
    method: 'POST',
    body: JSON.stringify({
      error: err.message,
      stack: err.stack,
      // ...
    }),
  });

  return c.json({ error: err.message }, 500);
};
```

---

## 📝 Notas

- **Soft Delete**: Todos os registros usam `deleted_at` ao invés de DELETE físico
- **Audit Trail**: Tabela `audit_logs` para rastreabilidade (helper pronto em `utils/db.ts`)
- **Paginação**: Padrão de 50 itens/página, máximo 100
- **CORS**: Configurado via ENV (`CORS_ORIGINS`), permite credenciais
- **Errors**: Formato JSON padronizado, sem vazamento de info em produção
- **TypeScript**: Types completos para Env, entidades, responses

---

## 🤝 Contribuindo

1. Crie branch: `git checkout -b feature/nova-funcionalidade`
2. Commit: `git commit -m "feat: adiciona nova funcionalidade"`
3. Push: `git push origin feature/nova-funcionalidade`
4. Abra Pull Request

---

## 📄 Licença

UNLICENSED - Propriedade privada da AirTrust

---

## 📞 Suporte

- **Documentação Cloudflare Workers**: https://developers.cloudflare.com/workers/
- **Documentação Hono**: https://hono.dev/
- **Documentação D1**: https://developers.cloudflare.com/d1/
- **Documentação R2**: https://developers.cloudflare.com/r2/

---

**Criado com ❤️ para AirTrust**

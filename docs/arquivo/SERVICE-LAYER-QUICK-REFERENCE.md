# 🏗️ AirTrust Service Layer - Quick Reference Guide

## File Structure

```
src/worker/
├── services/
│   ├── BaseService.ts                  # Generic CRUD base class
│   ├── habilitacoesService.ts          # Habilitações business logic
│   ├── qualificacoesService.ts         # Qualificações business logic
│   ├── funcionariosService.ts          # Funcionários business logic
│   ├── empresasService.ts              # Empresas business logic
│   ├── certificadosService.ts          # Certificados business logic
│   ├── simuladoresService.ts           # Simuladores business logic
│   ├── categoriasService.ts            # Categorias business logic
│   └── funcoesService.ts               # Funções business logic
│
├── dtos/
│   ├── habilitacoes.ts                 # Habilitações DTOs + Zod schemas
│   ├── qualificacoes.ts                # Qualificações DTOs + Zod schemas
│   ├── funcionarios.ts                 # Funcionários DTOs + Zod schemas
│   ├── empresas.ts                     # Empresas DTOs + Zod schemas
│   ├── certificados.ts                 # Certificados DTOs + Zod schemas
│   ├── simuladores.ts                  # Simuladores DTOs + Zod schemas
│   ├── categorias.ts                   # Categorias DTOs + Zod schemas
│   └── funcoes.ts                      # Funções DTOs + Zod schemas
│
├── routes/
│   ├── habilitacoes.ts                 # Habilitações HTTP endpoints (refactored)
│   ├── qualificacoes.ts                # Qualificações HTTP endpoints (refactored)
│   ├── funcionarios.ts                 # Funcionários HTTP endpoints (refactored)
│   ├── empresas.ts                     # Empresas HTTP endpoints (refactored)
│   ├── certificados.ts                 # Certificados HTTP endpoints (refactored)
│   ├── simuladores.ts                  # Simuladores HTTP endpoints (refactored)
│   ├── categorias.ts                   # Categorias HTTP endpoints (refactored)
│   └── funcoes.ts                      # Funções HTTP endpoints (refactored)
│
├── utils/
│   └── AppError.ts                     # Error class hierarchy
│
├── middleware/
│   └── cache.ts                        # HTTP caching middleware
│
└── schemas/
    └── pagination.ts                   # Pagination schema + utilities

src/shared/
└── types.ts                            # Shared type contracts
```

## Service Pattern

### Example: Creating a New Service

```typescript
import { BaseService } from './BaseService';
import type { YourEntity } from '../../shared/types';

export class YourEntityService extends BaseService<YourEntity> {
  constructor(db: any) {
    super('your_table_name', db);
  }

  // Add custom methods
  async getByCustomField(value: string) {
    return this.getWithFilter({ custom_field: value });
  }

  async getActive() {
    return this.getWithFilter({ ativo: true });
  }
}
```

### Base Service Methods Available

```typescript
// Get all with pagination
const { data, total } = await service.getAll(page, limit);

// Get by ID (throws NotFoundError if not found)
const item = await service.getById(id);

// Create new
const created = await service.create({
  field1: value1,
  field2: value2,
});

// Update existing (throws NotFoundError if not found)
const updated = await service.update(id, {
  field1: newValue1,
});

// Soft delete (marks deleted_at = NOW)
await service.delete(id);

// Get with custom filter
const filtered = await service.getWithFilter({ field1: value1, field2: value2 }, page, limit);
```

## DTO Pattern

### Example: Creating DTOs

```typescript
import { z } from 'zod';

// Input DTO for creating
export const CreateYourEntityDTO = z.object({
  field1: z.string().min(1),
  field2: z.number().int().positive(),
  field3: z.string().optional(),
});

export type CreateYourEntityInput = z.infer<typeof CreateYourEntityDTO>;

// Input DTO for updating
export const UpdateYourEntityDTO = z.object({
  field1: z.string().min(1).optional(),
  field2: z.number().int().positive().optional(),
  field3: z.string().optional(),
});

export type UpdateYourEntityInput = z.infer<typeof UpdateYourEntityDTO>;

// Output DTO for responses
export const YourEntityResponseDTO = z.object({
  id: z.number(),
  field1: z.string(),
  field2: z.number(),
  field3: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});

export type YourEntityResponse = z.infer<typeof YourEntityResponseDTO>;
```

## Route Pattern

### Example: Refactored Route

```typescript
import { Hono } from 'hono';
import type { Env } from '../types/index';
import { YourEntityService } from '../services/yourEntityService';
import {
  CreateYourEntityDTO,
  UpdateYourEntityDTO,
  YourEntityResponseDTO,
} from '../dtos/yourEntity';

export function yourEntityRoutes() {
  const router = new Hono<{ Bindings: Env }>();

  // GET / - List with pagination
  router.get('/', async (c) => {
    const service = new YourEntityService(c.env.DB);
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');

    const result = await service.getAll(page, limit);
    return c.json({
      success: true,
      data: result.data,
      page,
      total: result.total,
      timestamp: new Date().toISOString(),
    });
  });

  // POST / - Create new
  router.post('/', async (c) => {
    const service = new YourEntityService(c.env.DB);
    const body = await c.req.json();
    const dados = CreateYourEntityDTO.parse(body); // Validation
    const created = await service.create(dados as Record<string, unknown>);
    const response = YourEntityResponseDTO.parse(created); // Response validation
    return c.json({ success: true, data: response }, 201);
  });

  // GET /:id - Get one
  router.get('/:id', async (c) => {
    const service = new YourEntityService(c.env.DB);
    const id = parseInt(c.req.param('id'));
    const item = await service.getById(id); // Throws NotFoundError
    const response = YourEntityResponseDTO.parse(item);
    return c.json({ success: true, data: response });
  });

  // PUT /:id - Update
  router.put('/:id', async (c) => {
    const service = new YourEntityService(c.env.DB);
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const dados = UpdateYourEntityDTO.parse(body);
    const updated = await service.update(id, dados as Record<string, unknown>);
    const response = YourEntityResponseDTO.parse(updated);
    return c.json({ success: true, data: response });
  });

  // DELETE /:id - Delete (soft)
  router.delete('/:id', async (c) => {
    const service = new YourEntityService(c.env.DB);
    const id = parseInt(c.req.param('id'));
    await service.delete(id); // Throws NotFoundError
    return c.json({ success: true });
  });

  return router;
}
```

## Error Handling

### Error Hierarchy

```typescript
import { AppError, NotFoundError, ValidationError } from '../utils/AppError';

// AppError - Base class
throw new AppError('Custom message', 500, 'CUSTOM_CODE');

// NotFoundError - 404
throw new NotFoundError('User'); // → "User não encontrado"

// ValidationError - 400
throw new ValidationError('Email', { field: 'email', code: 'invalid_email' });

// UnauthorizedError - 401
throw new UnauthorizedError();

// ForbiddenError - 403
throw new ForbiddenError();

// ConflictError - 409
throw new ConflictError('Email já cadastrado');
```

### Global Error Handler (index.ts)

```typescript
worker.onError((err: unknown, c) => {
  // AppError instances → respond with status code + error code
  if (err instanceof AppError) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message,
        code: err.code,
      }),
      {
        status: err.statusCode,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // ZodError instances → respond with validation details
  if (err instanceof ZodError) {
    return c.json(
      {
        success: false,
        error: 'Erro de validação',
        code: 'VALIDATION_ERROR',
        details: err.errors,
      },
      400,
    );
  }

  // Generic error → 500
  return c.json(
    {
      success: false,
      error: 'Erro interno do servidor',
    },
    500,
  );
});
```

## Usage Examples

### Creating a resource

```typescript
const service = new HabilitacoesService(db);
const input = CreateHabilitacaoDTO.parse(req.body);
const created = await service.create(input as Record<string, unknown>);
const response = HabilitacaoResponseDTO.parse(created);
```

### Getting filtered data

```typescript
const service = new FuncionariosService(db);
const { data, total } = await service.getByEmpresa(empresaId, page, limit);
```

### Error handling

```typescript
try {
  const item = await service.getById(123);
} catch (err) {
  // err instanceof NotFoundError will be true
  // Global handler automatically responds with 404
}
```

## Testing Pattern

```typescript
// Mock service in tests
const mockService = {
  getAll: jest.fn().mockResolvedValue({
    data: [
      /* test data */
    ],
    total: 10,
  }),
  getById: jest.fn().mockResolvedValue({
    /* test data */
  }),
  create: jest.fn().mockResolvedValue({
    /* test data */
  }),
};

// Test route with mocked service
const response = await router.get('/')(mockContext);
expect(response.status).toBe(200);
```

## Shared Types

All domain model interfaces defined in `src/shared/types.ts`:

```typescript
interface Habilitacao { ... }
interface Qualificacao { ... }
interface Funcionario { ... }
interface Empresa { ... }
interface EmpresaConfig { ... }
interface Certificado { ... }
interface Simulador { ... }
interface SimuladorSessao { ... }
interface Categoria { ... }
interface Funcao { ... }
interface Permissao { ... }
interface Treinamento { ... }
interface Manobra { ... }
interface ApiResponse<T> { ... }
interface AuditLog { ... }
interface User { ... }
```

---

**Status**: ✅ Ready for use and development

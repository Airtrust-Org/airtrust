# AIRTRUST - Technical Reference & API Documentation

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE EDGE (Global)                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         CLOUDFLARE WORKERS (Compute Layer)           │   │
│  │                                                        │   │
│  │  ✓ TypeScript/Hono Backend Runtime                  │   │
│  │  ✓ 28ms Startup Time                                │   │
│  │  ✓ Global Distribution                              │   │
│  │  ✓ Auto-scaling                                     │   │
│  │  ✓ Version: a2c223c3-5c6e-46f6-a675-59e634cc854b   │   │
│  └──────────────────────────────────────────────────────┘   │
│              ↓              ↓              ↓                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   D1 DB      │  │  R2 Storage  │  │   Assets     │       │
│  │  (SQLite)    │  │  (S3-compat) │  │  (dist/*)    │       │
│  │              │  │              │  │              │       │
│  │ airtrust-db  │  │airtrust-stos │  │ React SPA    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  CLIENT BROWSERS (Global)                     │
│  • React 19 SPA                                              │
│  • TypeScript Strict Mode                                    │
│  • Tailwind CSS Styling                                      │
│  • Client-side Routing (React Router v6)                     │
└─────────────────────────────────────────────────────────────┘
```

---

## API Route Structure

### Base URL

```
Production: https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev
```

### API Version

```
Current: /api/v2/
Deprecation: v1 routes not recommended
```

### Endpoint Organization

```
/api/v2/
├── qualificacoes/                          # Qualifications management
│   ├── GET    /                            # List with pagination
│   ├── POST   /                            # Create qualification
│   ├── GET    /:id                         # Get single
│   ├── PUT    /:id                         # Update
│   ├── DELETE /:id                         # Soft delete
│   ├── POST   /:id/gerar-certificado       # Generate certificate [NEW]
│   ├── GET    /:id/historico               # Get history
│   ├── POST   /importar                    # Bulk import
│   ├── POST   /exportar                    # Bulk export
│   ├── GET    /estatisticas                # Statistics
│   └── POST   /recalcular-datas            # Recalculate dates
│
├── certificados/                           # Certificate management
│   ├── POST   /upload                      # Upload certificate
│   ├── GET    /:id/download                # Download file
│   ├── DELETE /:id                         # Delete certificate
│   ├── GET    /funcionario/:id             # List by employee
│   └── GET    /qualificacao/:id            # List by qualification
│
├── exames/                                 # Exam management
│   ├── GET    /                            # List
│   ├── POST   /                            # Create
│   ├── PUT    /:id                         # Update
│   └── DELETE /:id                         # Delete
│
├── checks/                                 # Flight checks
│   ├── GET    /                            # List
│   ├── POST   /                            # Create
│   └── ...                                 # Standard CRUD
│
├── funcionarios/                           # Employee management
│   ├── GET    /                            # List
│   ├── POST   /                            # Create
│   ├── GET    /:id                         # Get details
│   ├── PUT    /:id                         # Update
│   └── DELETE /:id                         # Delete
│
├── sistema/                                # System endpoints
│   ├── GET    /health                      # Health check (88ms)
│   ├── GET    /info                        # System info
│   ├── GET    /stats                       # Statistics
│   └── POST   /audit                       # Audit operations
│
├── simulador/                              # Simulator management
│   ├── GET    /agendamentos                # List bookings
│   ├── POST   /agendamentos                # Create booking
│   ├── GET    /fichas                      # List forms
│   └── ...                                 # More operations
│
├── compliance/                             # Compliance tracking
│   ├── GET    /                            # List compliance items
│   ├── POST   /                            # Create
│   └── ...                                 # Standard CRUD
│
└── templates/                              # Document templates
    ├── GET    /                            # List templates
    ├── POST   /                            # Create
    └── ...                                 # Standard CRUD
```

---

## Authentication & Authorization

### JWT Token Structure

```
Header: {
  "alg": "HS256",
  "typ": "JWT"
}

Payload: {
  "sub": "user_id",
  "nome": "User Name",
  "role": "ADMIN|USER|VIEWER",
  "permissoes": ["system:health", "qualificacoes:read", ...],
  "iat": 1700000000,
  "exp": 1700003600
}

Secret: seu_jwt_secret_aqui_super_secreto_com_32_caracteres_minimo
```

### Headers Required

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
X-Request-ID: <UUID> (optional)
```

### Permission System

```
Format: "modulo:acao"

Examples:
  - "system:health"          # Access health checks
  - "qualificacoes:read"     # Read qualifications
  - "qualificacoes:write"    # Create/update
  - "qualificacoes:delete"   # Delete qualifications
  - "certificados:upload"    # Upload certificates
  - "certificados:download"  # Download files
  - "admin:all"              # Full access
```

---

## Database Schema (Key Tables)

### Qualificações

```sql
CREATE TABLE qualificacoes (
  id INTEGER PRIMARY KEY,
  funcionario_id INTEGER NOT NULL,           -- Foreign key
  tipo TEXT CHECK(IN 'TREINAMENTO|EXAME|CHECK'),
  codigo TEXT NOT NULL,                      -- e.g., "ICAO"
  nome TEXT NOT NULL,                        -- Display name
  data_realizacao TEXT,                      -- Completion date
  data_validade TEXT,                        -- Expiration date
  resultado TEXT,                            -- APROVADO|REPROVADO
  nota REAL,                                 -- Score
  instrutor TEXT,                            -- Trainer name
  local TEXT,                                -- Location
  observacoes TEXT,                          -- Notes
  certificado_url TEXT,                      -- Certificate file URL
  status TEXT DEFAULT 'ATIVO',               -- ATIVO|INATIVO|ARQUIVADO
  superseded_by INTEGER,                     -- References newer record
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,                           -- Soft delete

  UNIQUE(funcionario_id, tipo, codigo, data_realizacao)
    WHERE deleted_at IS NULL
);
```

### Certificados

```sql
CREATE TABLE certificados (
  id INTEGER PRIMARY KEY,
  qualificacao_id INTEGER NOT NULL,          -- Link to qualification
  funcionario_id INTEGER NOT NULL,           -- Link to employee
  arquivo_nome TEXT NOT NULL,                -- Sanitized filename
  arquivo_nome_original TEXT NOT NULL,       -- Original filename
  arquivo_tamanho INTEGER,                   -- Current size
  arquivo_hash TEXT NOT NULL UNIQUE,         -- SHA256 for dedup
  arquivo_r2_key TEXT NOT NULL UNIQUE,       -- R2 storage path
  arquivo_url TEXT NOT NULL,                 -- Public URL
  tipo TEXT DEFAULT 'CERTIFICADO',           -- CERTIFICADO|ANEXO
  data_documento TEXT,                       -- Document date
  uploaded_by INTEGER,                       -- User who uploaded
  uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,                           -- Soft delete

  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
```

### Funcionários

```sql
CREATE TABLE funcionarios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  matricula TEXT UNIQUE,
  codigo_anac TEXT UNIQUE,
  data_admissao TEXT,
  data_demissao TEXT,
  cargo TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
```

---

## Request/Response Examples

### Example 1: List Qualifications

```http
GET /api/v2/qualificacoes?page=1&limit=20&ordenarPor=data_vencimento&ordem=ASC
Authorization: Bearer eyJhbGc...

Response 200 OK:
{
  "success": true,
  "data": [
    {
      "id": 1,
      "funcionario_id": 5,
      "funcionario_nome": "João Silva",
      "tipo": "TREINAMENTO",
      "codigo": "ICAO",
      "nome": "ICAO Type Rating",
      "data_conclusao": "2025-06-15",
      "data_vencimento": "2026-06-15",
      "status_calculado": "VALIDA",
      "dias_para_vencimento": 226,
      "certificado_url": "https://..."
    },
    ...
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "pages": 8
  }
}
```

### Example 2: Generate Certificate [NEW]

```http
POST /api/v2/qualificacoes/1/gerar-certificado
Authorization: Bearer eyJhbGc...

Response 200 OK:
{
  "success": true,
  "message": "Certificate generation processed",
  "qualificacao_id": 1,
  "timestamp": "2025-11-02T22:04:00Z"
}

Response 404 Not Found:
{
  "success": false,
  "error": "Qualification not found"
}
```

### Example 3: Upload Certificate

```http
POST /api/v2/certificados/upload
Authorization: Bearer eyJhbGc...
Content-Type: multipart/form-data

Form Data:
  qualificacao_id: 1
  funcionario_id: 5
  arquivo: <binary PDF data>
  data_documento: 2025-06-15

Response 200 OK:
{
  "success": true,
  "certificado": {
    "id": 42,
    "qualificacao_id": 1,
    "funcionario_id": 5,
    "arquivo_nome": "cert_001_f5_20250615.pdf",
    "arquivo_url": "https://airtrust-storage.r2.cloudflarestorage.com/...",
    "arquivo_hash": "a1b2c3d4...",
    "uploaded_at": "2025-11-02T22:04:00Z"
  }
}
```

### Example 4: Import Qualifications (Bulk)

```http
POST /api/v2/qualificacoes/importar
Authorization: Bearer eyJhbGc...
Content-Type: application/json

Body:
{
  "qualificacoes": [
    {
      "funcionario_id": 5,
      "tipo": "TREINAMENTO",
      "codigo": "ICAO",
      "nome": "ICAO Type Rating",
      "data_conclusao": "2025-06-15",
      "data_vencimento": "2026-06-15"
    },
    ...
  ]
}

Response 200 OK:
{
  "success": true,
  "importados": 25,
  "erros": 0,
  "avisos": 2,
  "detalhes": {
    "novos": 20,
    "atualizados": 5,
    "duplicados_pulados": 0
  }
}
```

### Example 5: Health Check

```http
GET /api/v2/system/health
Authorization: Bearer eyJhbGc...

Response 200 OK:
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-11-02T22:04:00Z",
  "checks": {
    "database": {
      "status": "ok",
      "response_time": 8
    },
    "storage": {
      "status": "ok",
      "response_time": 12
    },
    "tables": {
      "status": "ok",
      "count": 42
    }
  },
  "version": "2.2.1",
  "environment": "production"
}
```

---

## Rate Limiting

### Limits Applied

```
General Endpoints:
  - Unauthenticated: 60 req/hour
  - Authenticated: 1000 req/hour

Import Endpoints:
  - All users: 10 req/hour (to prevent abuse)

Export Endpoints:
  - All users: 30 req/hour

File Upload:
  - Max size: 100 MB per file
  - Timeout: 30 seconds
```

### Rate Limit Headers

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1700003600

Response 429 Too Many Requests:
{
  "success": false,
  "error": "Rate limit exceeded",
  "retry_after": 3600
}
```

---

## Error Handling

### HTTP Status Codes

```
200 OK              - Success
201 Created         - Resource created
204 No Content      - Success, no body
400 Bad Request     - Invalid input
401 Unauthorized    - Missing/invalid token
403 Forbidden       - Insufficient permissions
404 Not Found       - Resource not found
409 Conflict        - Resource conflict (duplicate)
429 Too Many        - Rate limited
500 Server Error    - Unexpected error
503 Unavailable     - Service unavailable
```

### Error Response Format

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "error details"
  },
  "timestamp": "2025-11-02T22:04:00Z"
}
```

### Common Error Codes

```
INVALID_INPUT       - Missing/invalid parameters
UNAUTHORIZED        - Auth token missing/expired
FORBIDDEN           - Permission denied
NOT_FOUND           - Resource doesn't exist
CONFLICT            - Duplicate/conflict
RATE_LIMITED        - Too many requests
DATABASE_ERROR      - Database operation failed
STORAGE_ERROR       - File storage failed
VALIDATION_ERROR    - Data validation failed
```

---

## Security Features

### Implemented

✅ JWT Authentication (HS256)
✅ CORS Validation (whitelist)
✅ Rate Limiting (per endpoint)
✅ Input Validation (Zod schemas)
✅ SQL Injection Prevention (parameterized queries)
✅ XSS Protection (Content-Type headers)
✅ CSRF Protection (SameSite cookies)
✅ Soft Deletes (data retention)
✅ Audit Logging (all operations)
✅ Type Safety (TypeScript strict)

### Configuration

```
JWT Algorithm:      HS256
JWT Expiry:         1 hour
Password Hashing:   bcrypt (if used)
CORS Origins:       Cloudflare domain + whitelist
Security Headers:   Strict-Transport-Security, etc.
```

---

## Performance Optimization

### Caching Strategy

```
Database Queries:   Indexed (30+ indices)
API Responses:      20-second cache for reads
File Downloads:     Cache-Control: public, max-age=3600
Frontend Assets:    Cache-Control: immutable, max-age=31536000

Cache Keys:
  - qualificacoes:list:{page}:{limit}:{filters}
  - certificados:funcionario:{id}
  - funcionarios:active
  - sistema:health
```

### Query Optimization

```sql
Indices Created:
  idx_qualificacoes_funcionario    -- Foreign key
  idx_qualificacoes_tipo           -- Type filter
  idx_qualificacoes_codigo         -- Code lookup
  idx_qualificacoes_validade       -- Date range
  idx_qualificacoes_deleted        -- Soft delete filter
  idx_certificados_qualificacao    -- Association
  idx_certificados_funcionario     -- Bulk lookup
  ... and 23 more

Query Performance:
  - Simple lookups:     5-8 ms
  - Filtered lists:     10-15 ms
  - Aggregations:       20-30 ms
  - Full table scans:   <100 ms (rare)
```

### Asset Optimization

```
Build Output:
  - 81 files deployed
  - 738.77 KiB raw
  - 136.32 KiB gzipped (81.6% compression)
  - Source maps available
  - Cache busting via hash

JavaScript:
  - Main bundle: index-Ca55w57-.js
  - Code splitting: 27+ chunks
  - Lazy loading enabled
  - Tree-shaking applied

CSS:
  - Tailwind CSS purged
  - Production build
  - 50KB average per page
```

---

## Deployment Details

### Version Info

```
Version:            2.2.1
Release Date:       2025-11-02
Build Time:         3.50 seconds
Total Modules:      3465

Runtime Environment:
  - Node.js compat:  ✓
  - TypeScript:      5.x
  - Hono:            Latest
  - React:           19.x
  - Vite:            6.4.1
```

### Cloudflare Configuration

```
Worker:
  - Entry point: src/worker/index.ts
  - Compatibility: 2025-06-17
  - Observability: Enabled
  - Source maps: Uploaded

Bindings:
  - DB (D1):         airtrust-db
  - Storage (R2):    airtrust-storage
  - Assets:          dist/client
  - Environment:     production

Cron Schedules:
  - 0 3 * * *       (3:00 AM UTC)
  - 6 0 * * *       (12:06 AM UTC)
```

---

## Troubleshooting Guide

### Issue: 401 Unauthorized

```
Cause:    Missing or invalid JWT token
Solution:
  1. Check Authorization header is present
  2. Verify token hasn't expired
  3. Confirm JWT_SECRET is correct
  4. Re-authenticate and get new token
```

### Issue: 429 Too Many Requests

```
Cause:    Rate limit exceeded
Solution:
  1. Wait for X-RateLimit-Reset
  2. Reduce request frequency
  3. Batch operations where possible
  4. For imports, max 10 req/hour
```

### Issue: 500 Internal Server Error

```
Cause:    Database or runtime error
Solution:
  1. Check worker logs in Cloudflare dashboard
  2. Verify database is accessible
  3. Check R2 storage connectivity
  4. Review error message in response
```

### Issue: File Upload Failed

```
Cause:    File too large, timeout, or storage error
Solution:
  1. Check file size < 100MB
  2. Ensure stable connection
  3. Check CORS configuration
  4. Verify R2 bucket has write permission
```

### Issue: Slow Queries

```
Cause:    Missing index, large dataset, or N+1 queries
Solution:
  1. Analyze query plans
  2. Add appropriate indices
  3. Use pagination (limit 100)
  4. Cache frequently accessed data
```

---

## Monitoring & Logging

### Metrics to Monitor

```
Response Times:     Target <200ms (P95)
Error Rate:         Target <0.1%
Database Latency:   Target <20ms (P95)
Storage Latency:    Target <50ms (P95)
Uptime:             Target 99.95%
```

### Log Levels

```
ERROR   - System failures, exceptions
WARN    - Deprecated features, unusual patterns
INFO    - Operation summaries, deployments
DEBUG   - Detailed operation data (development only)
TRACE   - Full request/response data (development only)
```

### Audit Trail

```
Logged Operations:
  - User authentication
  - CRUD operations
  - Bulk imports/exports
  - File uploads/downloads
  - Permission changes
  - System configuration

Format:
{
  "timestamp": "2025-11-02T22:04:00Z",
  "user": "user_id",
  "action": "CREATE_QUALIFICATION",
  "resource": "qualificacao_id",
  "status": "success",
  "duration_ms": 45,
  "ip": "203.0.113.0"
}
```

---

## License & Support

**System**: AirTrust Aviation Training Platform
**Version**: 2.2.1
**Status**: Production Ready ✅
**Support**: Internal Team
**Documentation**: This file + additional guides
**Last Updated**: 2025-11-02 22:04 UTC

---

_Technical Reference Document_
_For use by development and operations teams_
_Internal Only_

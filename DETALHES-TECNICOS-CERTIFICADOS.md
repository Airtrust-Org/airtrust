# 🔧 DETALHES TÉCNICOS - Consolidação de Certificados

**Data**: 13 de Novembro de 2025  
**Versão**: 1.0  
**Scope**: Fluxo de certificados do AirTrust

---

## 📚 Índice

1. [Endpoints Consolidados](#endpoints-consolidados)
2. [Fluxo de Dados](#fluxo-de-dados)
3. [Naming Convention](#naming-convention)
4. [Implementação](#implementação)
5. [Troubleshooting](#troubleshooting)

---

## 1. Endpoints Consolidados

### 1.1 Gerar Certificado

**Endpoint**: `POST /api/certificados/historico/:id/certificados/gerar`

**Headers**:

```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `id` | number | Qualificação histórico ID |

**Request Body**: Empty (POST sem corpo)

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "id": 789,
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "r2_key": "certificados/CERT-00123-CODE-20260113-abc12345.pdf",
    "tamanho": 152847
  }
}
```

**Response** (400/500 Error):

```json
{
  "success": false,
  "error": "Certificado já existe para esta qualificação"
}
```

**Implementação**: `worker-airtrust/src/routes/qualificacoes-certificados.ts`  
**Line Range**: 178-500

---

### 1.2 Listar Certificados

**Endpoint**: `GET /api/certificados/historico/:id/certificados`

**Headers**:

```http
Authorization: Bearer <jwt_token>
```

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `id` | number | Qualificação histórico ID |

**Query Parameters**: None

**Response** (200 OK):

```json
{
  "success": true,
  "data": [
    {
      "id": 789,
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "nome_arquivo": "CERT-00123-CODE-20260113-abc12345.pdf",
      "r2_key": "certificados/CERT-00123-CODE-20260113-abc12345.pdf",
      "tamanho": 152847,
      "tipo": "GERADO",
      "created_at": "2025-11-13T10:30:00Z",
      "updated_at": "2025-11-13T10:30:00Z"
    }
  ]
}
```

**Implementação**: Same as 1.1 (GET /api/certificados/historico/:id/certificados route)

---

### 1.3 Download Certificado (CENTRALIZADO)

**Endpoint**: `GET /api/pasta-virtual/stream/:id`

**⚠️ IMPORTANTE**: Este é o ÚNICO endpoint para download de qualquer documento (certificados, uploads, etc.)

**Headers**:

```http
Authorization: Bearer <jwt_token>
Accept: application/pdf
```

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `id` | number | Documento ID (primary key de `documentos` table) |

**Query Parameters**: None (optional: `?token=xyz` for legacy support)

**Response** (200 OK):

```
Content-Type: application/pdf
Content-Length: 152847

[Binary PDF Data]
%PDF-1.4
1 0 obj
...
%%EOF
```

**Response Headers**:

```http
Content-Disposition: attachment; filename="CERT-00123-CODE-20260113-abc12345.pdf"
Content-Type: application/pdf
Content-Length: 152847
X-Document-ID: 789
```

**Response** (404 Not Found):

```json
{
  "success": false,
  "error": "Documento não encontrado"
}
```

**Response** (403 Forbidden):

```json
{
  "success": false,
  "error": "Sem permissão para acessar este documento"
}
```

**Implementação**: `worker-airtrust/src/routes/pasta-virtual.ts`  
**Line Range**: 700-850 (GET /stream/:id route)

**Validações**:

- [ ] Magic bytes check: File starts with `%PDF`
- [ ] Token validation
- [ ] User authorization (if documento is private)
- [ ] Audit logging (usuario_id, documento_id, timestamp)

---

### 1.4 Deletar Certificado

**Endpoint**: `DELETE /api/pasta-virtual/delete/:id`

**Headers**:

```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `id` | number | Documento ID |

**Request Body**: Empty

**Response** (200 OK):

```json
{
  "success": true,
  "message": "Documento deletado com sucesso",
  "data": {
    "id": 789,
    "deleted_at": "2025-11-13T11:00:00Z"
  }
}
```

**Implementação**: `pasta-virtual.ts`  
**Type**: Soft delete (sets `deleted_at` timestamp, não remove do DB)

---

## 2. Fluxo de Dados

### 2.1 Geração de Certificado (Complete Flow)

```
Frontend (React)
    │
    ├─ useCertificados.gerar()
    │   └─ POST /api/certificados/historico/:id/certificados/gerar
    │      └─ Bearer token validation
    │
    └─> Backend (qualificacoes-certificados.ts)
        │
        ├─ Fetch funcionário data from D1
        ├─ Generate PDF using pdf-lib
        │   ├─ Create document
        │   ├─ Add text, QR code, etc.
        │   └─ Serialize to Uint8Array
        │
        ├─ Build filename using certificate-naming.ts
        │   └─ buildCertificateFilename()
        │       └─ Returns: CERT-00123-CODE-20260113-abc12345.pdf
        │
        ├─ Upload to R2 (Cloudflare Storage)
        │   ├─ r2.put(r2_key, pdfBytes, { ... })
        │   └─ r2_key = "certificados/CERT-00123-CODE-20260113-abc12345.pdf"
        │
        ├─ Index in D1 (documentos table)
        │   ├─ INSERT INTO documentos
        │   │   (uuid, funcionario_id, nome_arquivo, tipo, tamanho, r2_key, created_at)
        │   └─ Returns: { id: 789 }
        │
        ├─ Update qualificacao_historico
        │   └─ SET certificado_arquivo_id = 789, arquivo_url = /api/pasta-virtual/stream/789
        │
        └─> Frontend receives:
            { success: true, data: { id: 789, uuid: "...", r2_key: "...", tamanho: 152847 } }
                │
                └─> useCertificados.carregar() reloads list
                    └─> Shows new certificate in modal
```

### 2.2 Download de Certificado (Complete Flow)

```
Frontend (React)
    │
    ├─ useCertificados.download(documentId)
    │   │
    │   └─ fetch(`/api/pasta-virtual/stream/${documentId}`)
    │      └─ Bearer token validation
    │
    └─> Backend (pasta-virtual.ts)
        │
        ├─ Query D1: SELECT * FROM documentos WHERE id = ?
        │   └─ Fetch: { id, r2_key, nome_arquivo, tamanho, ... }
        │
        ├─ Check permissions
        │   ├─ Token belongs to owner or admin?
        │   └─ Is document deleted? (deleted_at IS NULL)
        │
        ├─ Fetch from R2
        │   ├─ r2.get(r2_key)
        │   └─ Returns: Uint8Array (binary data)
        │
        ├─ Validate magic bytes
        │   ├─ Check first 4 bytes = 0x25504446 (%PDF in hex)
        │   └─ If not PDF: Return error (corrupted file protection)
        │
        ├─ Log download (audit trail)
        │   ├─ INSERT INTO documentos_downloads
        │   │   (usuario_id, documento_id, timestamp, reason)
        │   └─ For compliance tracking
        │
        └─> Return binary PDF
            ├─ Content-Type: application/pdf
            ├─ Content-Disposition: attachment; filename="..."
            ├─ Content-Length: <bytes>
            └─ Body: [Binary PDF Data]
                │
                └─> Frontend receives blob
                    ├─ Create ObjectURL
                    ├─ Create <a href=blob> link
                    ├─ Trigger click (download)
                    └─> File saved to user's Downloads
```

---

## 3. Naming Convention

### 3.1 Certificate Filename Format

**Pattern**: `CERT-{MATRICULA:5D}-{CODE:UPPER}-{DATE:YYYYMMDD}-{UUID:8CHARS}.pdf`

**Example**: `CERT-00123-CODE-20260113-abc12345.pdf`

**Components**:
| Component | Format | Example | Purpose |
|-----------|--------|---------|---------|
| Prefix | `CERT` | `CERT` | Identifies as certificate |
| Matrícula | 5 digits (zero-padded) | `00123` | Funcionário matrícula |
| Code | Uppercase (short code) | `CODE` | Qualification code |
| Date | YYYYMMDD format | `20260113` | Generation date |
| UUID | First 8 chars | `abc12345` | Unique identifier |
| Extension | `.pdf` | `.pdf` | File type |

### 3.2 Implementation

**File**: `worker-airtrust/src/utils/certificate-naming.ts`

```typescript
export function buildCertificateFilename(matricula: string, code: string, date?: Date): string {
  const mat = String(matricula).padStart(5, '0');
  const c = String(code).toUpperCase();
  const d = date ? formatarDataCertificado(date) : formatarDataCertificado(new Date());
  const uuid = generateUUID().substring(0, 8);
  return `CERT-${mat}-${c}-${d}-${uuid}.pdf`;
}

export function validateCertificateFilename(filename: string): boolean {
  const pattern = /^CERT-\d{5}-[A-Z0-9]+-\d{8}-[a-f0-9]{8}\.pdf$/i;
  return pattern.test(filename);
}

export function parseCertificateFilename(filename: string): {
  matricula: string;
  code: string;
  date: string;
  uuid: string;
} | null {
  const pattern = /^CERT-(\d{5})-([A-Z0-9]+)-(\d{8})-([a-f0-9]{8})\.pdf$/i;
  const match = filename.match(pattern);

  if (!match) return null;

  return {
    matricula: match[1],
    code: match[2],
    date: match[3],
    uuid: match[4],
  };
}
```

---

## 4. Implementação

### 4.1 Database Schema

**Table**: `documentos`

```sql
CREATE TABLE documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id),
  nome_arquivo TEXT NOT NULL,
  tipo TEXT CHECK(tipo IN ('UPLOAD', 'GERADO', 'RENOVADO')),
  tamanho INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,

  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE TABLE documentos_downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  documento_id INTEGER NOT NULL REFERENCES documentos(id),
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  reason TEXT,

  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (documento_id) REFERENCES documentos(id)
);
```

### 4.2 R2 Storage Structure

**Bucket**: `airtrust-storage`

**Path Structure**:

```
airtrust-storage/
├─ certificados/
│  ├─ CERT-00001-EMP-20250101-abc12345.pdf
│  ├─ CERT-00002-ENG-20250102-def67890.pdf
│  └─ CERT-00003-CODE-20260113-xyz99999.pdf
├─ uploads/
│  ├─ funcionario-123-resume-20250101.pdf
│  └─ funcionario-124-certify-20250102.pdf
└─ backups/
   └─ db-backup-20250113.sql
```

### 4.3 Environment Variables

**Required for PDF generation** (`.env.local`):

```bash
# D1 Database
D1_DB_ID=xxxx-xxxx-xxxx
D1_AUTH_TOKEN=Bearer xxxx

# R2 Storage
R2_BUCKET_NAME=airtrust-storage
R2_ACCOUNT_ID=xxxx
R2_ACCESS_KEY_ID=xxxx
R2_SECRET_ACCESS_KEY=xxxx
R2_REGION=auto

# PDF Generation
PDF_TEMP_DIR=/tmp/pdfs
MAX_PDF_SIZE_MB=50

# Security
JWT_SECRET=your-secret-key
```

---

## 5. Troubleshooting

### 5.1 PDF Corrompido

**Problema**: PDF não abre / Navegador mostra erro

**Causas Possíveis**:

1. Magic bytes inválidos (não começa com `%PDF`)
2. Arquivo truncado (R2 upload incompleto)
3. Base64 encoding errado (histórico de bugs)
4. Validação de MIME type muito restritiva

**Solução**:

```bash
# Verificar magic bytes
hexdump -C /tmp/certificado.pdf | head -1
# Esperado: 25 50 44 46 (= %PDF)

# Verificar tamanho
ls -lh /tmp/certificado.pdf

# Testar abertura
file /tmp/certificado.pdf
# Esperado: PDF document, version 1.4

# Se falhar, checar logs:
# - worker-airtrust/.wrangler/logs
# - Cloudflare Dashboard > Workers > Logs
```

### 5.2 Endpoint Retorna 404

**Problema**: `GET /api/pasta-virtual/stream/123` retorna 404

**Causas**:

1. Documento não existe (ID inválido)
2. Documento foi deletado (soft delete)
3. Usuário sem permissão
4. URL mal formada

**Solução**:

```bash
# Verificar se documento existe
curl -X GET https://api.airtrust.com.br/api/documentos/123 \
  -H "Authorization: Bearer $TOKEN" | jq .

# Se retorna null: documento não existe ou foi deletado
# Se retorna dados: problema de permissão ou corrupção

# Testar outro documento
curl -X GET https://api.airtrust.com.br/api/pasta-virtual/stream/456 \
  -H "Authorization: Bearer $TOKEN"
```

### 5.3 Geração Falha com Timeout

**Problema**: `POST .../certificados/gerar` toma > 30 segundos

**Causas**:

1. PDF muito grande
2. Queries ao D1 lentas
3. R2 upload lento
4. QR code generation

**Solução**:

```javascript
// Adicionar timeout handling no frontend
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

fetch('/api/certificados/historico/123/certificados/gerar', {
  signal: controller.signal,
})
  .then((r) => r.json())
  .finally(() => clearTimeout(timeoutId));
```

### 5.4 Nomes Inconsistentes

**Problema**: Certificados com nomes diferentes (CERT-123-... vs Certificate-123-...)

**Causa**: Código antigo usando múltiplas funções de naming

**Solução**:

1. Verificar que `buildCertificateFilename()` está sendo usado
2. Grep por padrões antigos:

```bash
grep -r "gerarNomeArquivo\|generateFileName\|create.*Filename" \
  src/ worker-airtrust/src/
# Deve retornar vazio (só deve ter buildCertificateFilename)
```

### 5.5 Auditoria não Registrada

**Problema**: Downloads não aparecem em `documentos_downloads`

**Causa**: Logging não está acionado na rota

**Solução**:

```sql
-- Verificar se há registros
SELECT COUNT(*) FROM documentos_downloads
WHERE documento_id = 789;

-- Verificar últimos downloads
SELECT * FROM documentos_downloads
ORDER BY timestamp DESC
LIMIT 10;

-- Se vazio: verificar logs do worker
-- Cloudflare > Workers > Logs > Errors
```

---

## 📊 Comparação: Antes vs Depois

### Endpoints Before

```
POST /api/certificados/gerar/:id          ❌ Errado (não existe)
GET  /api/certificados/stream/:id         ❌ Duplicado
GET  /api/certificados/download/:id       ❌ Duplicado
POST /api/qualificacoes/.../gerar-cert    ❌ Errado (rota antiga)
```

### Endpoints After

```
POST /api/certificados/historico/:id/certificados/gerar    ✅
GET  /api/certificados/historico/:id/certificados          ✅
GET  /api/pasta-virtual/stream/:id                         ✅ (ÚNICO para downloads)
DELETE /api/pasta-virtual/delete/:id                       ✅
```

---

## 🎓 Lessons Learned

1. **One endpoint, one job**: `/api/pasta-virtual/stream/:id` faz download de TUDO
2. **Centralize naming**: `certificate-naming.ts` é single source of truth
3. **Validate early**: Magic bytes check previne propagação de corrupção
4. **Audit everything**: `documentos_downloads` table para compliance
5. **Clear naming**: Endpoints devem ser óbvios (historico vs stream vs delete)

---

**Mantido por**: GitHub Copilot  
**Última atualização**: 2025-11-13  
**Version**: 1.0

# 📚 API Endpoints Documentation

**Data:** 11 de Novembro de 2025  
**Status:** ✅ Production Ready  
**Version:** 1.0.0

---

## 📋 Table of Contents

1. [Qualificações (Simple)](#qualificações-simple)
2. [Qualificações (Complete)](#qualificações-complete)
3. [Histórico](#histórico)
4. [Categorias](#categorias)
5. [Response Formats](#response-formats)
6. [Error Handling](#error-handling)
7. [React Hooks Integration](#react-hooks-integration)

---

## Qualificações (Simple)

**Purpose:** Get simple list of qualifications for dropdowns and selects.  
**Performance:** Fast (< 100ms), no complex JOINs  
**Cache:** 5 minutes

### GET /api/v2/qualificacoes-list

List all active qualifications.

**Request:**

```bash
curl https://api.airtrust.dev/api/v2/qualificacoes-list
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "codigo": "QL001",
      "nome": "Piloto Comercial",
      "descricao": "Licença de Piloto Comercial",
      "categoria": "Licenças"
    },
    {
      "id": 2,
      "codigo": "QL002",
      "nome": "Instrutor",
      "descricao": "Qualificação de Instrutor",
      "categoria": "Treinamento"
    }
  ],
  "total": 2
}
```

**Status Codes:**

- `200 OK` - Success
- `500 Internal Server Error` - Database error

---

### GET /api/v2/qualificacoes-list/:id

Get individual qualification.

**Request:**

```bash
curl https://api.airtrust.dev/api/v2/qualificacoes-list/1
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "codigo": "QL001",
    "nome": "Piloto Comercial",
    "descricao": "Licença de Piloto Comercial",
    "categoria": "Licenças"
  }
}
```

**Status Codes:**

- `200 OK` - Success
- `404 Not Found` - Qualification not found
- `500 Internal Server Error` - Database error

---

## Qualificações (Complete)

**Purpose:** Get complete qualifications with alerts and statistics.  
**Performance:** Medium (< 500ms), includes stats  
**Cache:** 2 minutes

### GET /api/v2/qualificacoes

List all qualifications with alerts and statistics.

**Request:**

```bash
curl https://api.airtrust.dev/api/v2/qualificacoes
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "codigo": "QL001",
      "nome": "Piloto Comercial",
      "descricao": "Licença de Piloto Comercial",
      "categoria": "Licenças",
      "alertas_vencimento": 5,
      "dashboard_stats": {
        "total_funcionarios": 15,
        "vencidas": 2,
        "proximas_vencer": 3
      }
    }
  ],
  "total": 1
}
```

---

## Histórico

**Purpose:** Get qualification history (renamed from "habilitações").  
**Performance:** Medium (< 300ms), includes JOINs  
**Cache:** 3 minutes

### GET /api/v2/historico

List qualification history for all employees.

**Query Parameters:**

- `funcionario_id` (optional): Filter by employee ID
- `qualificacao_id` (optional): Filter by qualification ID
- `limit` (optional): Maximum results (default: unlimited)
- `offset` (optional): Pagination offset (default: 0)

**Request:**

```bash
# List all history
curl https://api.airtrust.dev/api/v2/historico

# Filter by employee
curl https://api.airtrust.dev/api/v2/historico?funcionario_id=5

# Filter by qualification
curl https://api.airtrust.dev/api/v2/historico?qualificacao_id=2

# With pagination
curl https://api.airtrust.dev/api/v2/historico?limit=10&offset=0
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "funcionario_id": 5,
      "funcionario_nome": "João Silva",
      "funcionario_matricula": "FUNC001",
      "qualificacao_id": 1,
      "qualificacao_codigo": "QL001",
      "qualificacao_nome": "Piloto Comercial",
      "data_conclusao": "2024-10-15",
      "data_vencimento": "2026-10-15",
      "resultado": "Aprovado",
      "observacoes": "Aprovado com distinção",
      "created_at": "2024-10-15T10:30:00Z",
      "updated_at": "2024-10-15T10:30:00Z"
    }
  ],
  "total": 1
}
```

**Status Codes:**

- `200 OK` - Success
- `400 Bad Request` - Invalid parameters
- `500 Internal Server Error` - Database error

---

### GET /api/v2/historico/:id

Get specific qualification history record.

**Request:**

```bash
curl https://api.airtrust.dev/api/v2/historico/1
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "funcionario_id": 5,
    "funcionario_nome": "João Silva",
    "funcionario_matricula": "FUNC001",
    "qualificacao_id": 1,
    "qualificacao_codigo": "QL001",
    "qualificacao_nome": "Piloto Comercial",
    "data_conclusao": "2024-10-15",
    "data_vencimento": "2026-10-15",
    "resultado": "Aprovado",
    "observacoes": "Aprovado com distinção",
    "created_at": "2024-10-15T10:30:00Z",
    "updated_at": "2024-10-15T10:30:00Z"
  }
}
```

**Status Codes:**

- `200 OK` - Success
- `404 Not Found` - Record not found
- `500 Internal Server Error` - Database error

---

### Backward Compatibility: /api/v2/habilitacoes

The old `/api/v2/habilitacoes` endpoint now returns a **301 Moved Permanently** redirect to `/api/v2/historico`.

**Request:**

```bash
curl -L https://api.airtrust.dev/api/v2/habilitacoes
```

**Response:** Automatic redirect to `/api/v2/historico`

---

## Categorias

**Purpose:** Get qualification categories.  
**Performance:** Very fast (< 50ms)  
**Cache:** 30 minutes (rarely changes)

### GET /api/v2/categorias

List all categories.

**Request:**

```bash
curl https://api.airtrust.dev/api/v2/categorias
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "nome": "Licenças",
      "codigo": "LIC",
      "descricao": "Licenças de voo"
    },
    {
      "id": 2,
      "nome": "Treinamento",
      "codigo": "TRNM",
      "descricao": "Cursos e treinamentos"
    }
  ],
  "total": 2
}
```

---

### GET /api/v2/categorias/:id

Get individual category.

**Request:**

```bash
curl https://api.airtrust.dev/api/v2/categorias/1
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "nome": "Licenças",
    "codigo": "LIC",
    "descricao": "Licenças de voo"
  }
}
```

---

## Response Formats

### Success Response

```typescript
{
  "success": true,
  "data": T,        // Single object or array
  "total"?: number  // Total count for list responses
}
```

### Error Response

```typescript
{
  "success": false,
  "error": string,      // Error message
  "details"?: string    // Additional error details
}
```

---

## Error Handling

**Common Error Codes:**

| Code | Message               | Cause                      |
| ---- | --------------------- | -------------------------- |
| 400  | Bad Request           | Invalid parameters or data |
| 404  | Not Found             | Resource doesn't exist     |
| 500  | Internal Server Error | Database or server error   |

**Example Error Response:**

```json
{
  "success": false,
  "error": "Registro de histórico não encontrado",
  "details": "No record with ID 999"
}
```

---

## React Hooks Integration

### Installation

The hooks are available in `src/client/hooks/useQualificacoes.ts`.

### Usage Examples

**Simple Qualifications List (Dropdowns)**

```typescript
import { useQualificacoes } from '@/hooks/useQualificacoes';

function QualificacaoSelect() {
  const { data: qualificacoes, isLoading, error } = useQualificacoes();

  if (isLoading) return <div>Carregando...</div>;
  if (error) return <div>Erro ao carregar qualificações</div>;

  return (
    <select>
      {qualificacoes?.map((q) => (
        <option key={q.id} value={q.id}>
          {q.nome} ({q.codigo})
        </option>
      ))}
    </select>
  );
}
```

**Complete Qualifications with Stats**

```typescript
import { useQualificacoesCompletas } from '@/hooks/useQualificacoes';

function QualificacoesStats() {
  const { data: qualificacoes } = useQualificacoesCompletas();

  return (
    <div>
      {qualificacoes?.map((q) => (
        <div key={q.id}>
          <h3>{q.nome}</h3>
          <p>Vencidas: {q.dashboard_stats?.vencidas || 0}</p>
          <p>Próximas vencer: {q.dashboard_stats?.proximas_vencer || 0}</p>
        </div>
      ))}
    </div>
  );
}
```

**Qualification History by Employee**

```typescript
import { useHistoricoPorFuncionario } from '@/hooks/useQualificacoes';

function EmployeeHistory({ funcionarioId }: { funcionarioId: number }) {
  const { data: historico } = useHistoricoPorFuncionario(funcionarioId);

  return (
    <table>
      <tbody>
        {historico?.map((h) => (
          <tr key={h.id}>
            <td>{h.qualificacao_nome}</td>
            <td>{h.data_conclusao}</td>
            <td>{h.data_vencimento}</td>
            <td>{h.resultado}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

**Individual History Record**

```typescript
import { useHistoricoById } from '@/hooks/useQualificacoes';

function HistoricoDetail({ recordId }: { recordId: number }) {
  const { data: record, isLoading } = useHistoricoById(recordId);

  if (isLoading) return <div>Carregando...</div>;

  return (
    <div>
      <h3>{record?.qualificacao_nome}</h3>
      <p>Funcionário: {record?.funcionario_nome}</p>
      <p>Vencimento: {record?.data_vencimento}</p>
    </div>
  );
}
```

**Categories Select**

```typescript
import { useCategorias } from '@/hooks/useQualificacoes';

function CategoriaSelect() {
  const { data: categorias } = useCategorias();

  return (
    <select>
      {categorias?.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nome}
        </option>
      ))}
    </select>
  );
}
```

---

## Hook Reference

### All Available Hooks

| Hook                             | Returns                  | Cache | Use Case             |
| -------------------------------- | ------------------------ | ----- | -------------------- |
| `useQualificacoes()`             | `Qualificacao[]`         | 5min  | Dropdowns, selects   |
| `useQualificacaoById(id)`        | `Qualificacao`           | 10min | Single qualification |
| `useQualificacoesCompletas()`    | `QualificacaoCompleta[]` | 2min  | Dashboard stats      |
| `useHistorico(params)`           | `Historico[]`            | 3min  | History listings     |
| `useHistoricoById(id)`           | `Historico`              | 10min | Single record        |
| `useHistoricoPorFuncionario(id)` | `Historico[]`            | 3min  | Employee history     |
| `useCategorias()`                | `Categoria[]`            | 30min | Category selects     |
| `useCategoriaById(id)`           | `Categoria`              | 30min | Single category      |

---

## Performance Tips

1. **Use `useQualificacoes()`** for dropdowns (fastest, no JOINs)
2. **Use `useHistoricoPorFuncionario()`** for employee records (pre-filtered)
3. **Cache times are optimized**: 30min for categories, 5min for simple lists, 3min for history
4. **Always check `isLoading` and `error` states** in components
5. **Queries are automatically deduplicated** by TanStack Query

---

## Integration Checklist

- [x] All endpoints created and deployed
- [x] React hooks created with TanStack Query
- [x] Backward compatibility (301 redirect)
- [x] Performance optimized (cache times set)
- [x] Error handling implemented
- [x] TypeScript types defined
- [x] Documentation complete

---

**Last Updated:** 11 de Novembro de 2025  
**Deployed Version:** 24dba836-6bf1-4e71-a0e3-07d1912e6c6c

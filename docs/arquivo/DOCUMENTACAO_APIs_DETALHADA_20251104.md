# 📡 DOCUMENTAÇÃO COMPLETA DE APIs - AIRTRUST v2
## Referência Detalhada de Todos os Endpoints

**Data**: 4 de Novembro de 2025  
**Versão**: 2.2  
**Total de Endpoints**: 50+

---

## 🎯 ESTRUTURA DE RESPOSTA PADRÃO

Todos os endpoints retornam no formato:

```json
{
  "success": true,
  "data": {
    // conteúdo específico do endpoint
  },
  "code": 200
}
```

**Códigos de Status**:
- `200` - Sucesso (GET, PUT, DELETE)
- `201` - Criado (POST)
- `400` - Erro de validação (bad request)
- `401` - Não autenticado
- `403` - Não autorizado
- `404` - Não encontrado
- `422` - Validação Zod falhou
- `500` - Erro servidor

---

## 📋 MÓDULO: HABILITAÇÕES

### 1. Listar Habilitações (GET)
**Endpoint**: `GET /api/v2/habilitacoes`

**Query Parameters**:
```typescript
?page=1              // Page number (default: 1)
&limit=20            // Records per page (default: 20)
&funcionario_id=123  // Filter by employee (optional)
&status=VÁLIDO       // Filter by status: VÁLIDO|VENCENDO|VENCIDA
```

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "funcionario_id": 123,
      "funcionario_nome": "João Silva",
      "qualificacao_id": 5,
      "qualificacao_nome": "PIC",
      "qualificacao_codigo": "PIC-A320",
      "qualificacao_categoria": "Categoria 1",
      "qualificacao_validade_meses": 12,
      "data_conclusao": "2024-01-15",
      "data_vencimento": "2025-01-15",
      "resultado": "APROVADO",
      "status": "VÁLIDO",
      "certificado_url": "https://r2.example.com/cert-123.pdf",
      "observacoes": "Aprovado com excelência",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "page": 1,
  "totalPages": 5,
  "total": 100,
  "code": 200
}
```

**Handler**: `src/worker/routes/habilitacoes.ts` - GET /
**Service**: `src/worker/services/habilitacoesService.ts` - list()

---

### 2. Obter Habilitação (GET)
**Endpoint**: `GET /api/v2/habilitacoes/:id`

**Path Parameters**:
- `id` (number) - Habilitação ID

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "funcionario_id": 123,
    "funcionario_nome": "João Silva",
    "qualificacao_id": 5,
    "qualificacao_nome": "PIC",
    // ... all fields as in list response
  },
  "code": 200
}
```

**Error Responses**:
- `404 - Not Found`: Habilitação não existe
- `500 - Server Error`: Database error

**Handler**: `src/worker/routes/habilitacoes.ts` - GET /:id

---

### 3. Criar Habilitação (POST)
**Endpoint**: `POST /api/v2/habilitacoes`

**Request Body** (JSON):
```json
{
  "funcionario_id": 123,
  "qualificacao_id": 5,
  "data_conclusao": "2024-11-04",
  "data_vencimento": "2025-11-04",
  "resultado": "APROVADO",
  "observacoes": "Aprovado com distinção"
}
```

**Validação Zod**:
```typescript
CreateHabilitacaoDTO = z.object({
  funcionario_id: z.number().positive(),
  qualificacao_id: z.number().positive(),
  data_conclusao: z.string().date(),      // ISO 8601
  data_vencimento: z.string().date(),     // ISO 8601
  resultado: z.enum(['PENDENTE', 'APROVADO', 'REPROVADO']),
  observacoes: z.string().optional(),
})
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "id": 101,
    "funcionario_id": 123,
    "qualificacao_id": 5,
    "data_conclusao": "2024-11-04",
    "data_vencimento": "2025-11-04",
    "resultado": "APROVADO",
    "status": "VÁLIDO",
    "observacoes": "Aprovado com distinção",
    "created_at": "2024-11-04T15:30:00Z",
    "updated_at": "2024-11-04T15:30:00Z"
  },
  "code": 201
}
```

**Error Responses**:
- `422 - Validation Error`:
  ```json
  {
    "success": false,
    "error": "Validação falhou",
    "details": [
      {
        "field": "data_vencimento",
        "message": "Data de vencimento inválida"
      }
    ],
    "code": 422
  }
  ```
- `404 - Not Found`: Funcionário ou qualificação não existe

**Handler**: `src/worker/routes/habilitacoes.ts` - POST /

---

### 4. Atualizar Habilitação (PUT)
**Endpoint**: `PUT /api/v2/habilitacoes/:id`

**Path Parameters**:
- `id` (number) - Habilitação ID

**Request Body** (JSON - todos os campos opcionais):
```json
{
  "data_conclusao": "2024-11-04",
  "data_vencimento": "2025-11-04",
  "resultado": "APROVADO",
  "observacoes": "Atualizado"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "funcionario_id": 123,
    "qualificacao_id": 5,
    "data_conclusao": "2024-11-04",
    "data_vencimento": "2025-11-04",
    "resultado": "APROVADO",
    "status": "VÁLIDO",
    "observacoes": "Atualizado",
    "updated_at": "2024-11-04T16:00:00Z"
  },
  "code": 200
}
```

**Error Responses**:
- `422 - Validation Error`: Dados inválidos
- `404 - Not Found`: Habilitação não existe

**Handler**: `src/worker/routes/habilitacoes.ts` - PUT /:id

---

### 5. Deletar Habilitação (DELETE)
**Endpoint**: `DELETE /api/v2/habilitacoes/:id`

**Path Parameters**:
- `id` (number) - Habilitação ID

**Note**: Soft delete (marked with deleted_at timestamp)

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "deletedAt": "2024-11-04T16:30:00Z"
  },
  "code": 200
}
```

**Error Response (404)**:
```json
{
  "success": false,
  "error": "Habilitação não encontrada",
  "code": 404
}
```

**Handler**: `src/worker/routes/habilitacoes.ts` - DELETE /:id

---

## 📋 MÓDULO: QUALIFICAÇÕES

### 1. Listar Qualificações (GET)
**Endpoint**: `GET /api/v2/qualificacoes`

**Query Parameters**:
```
?ativo=true          // Filter by active status
&categoria_id=1      // Filter by category
&page=1
&limit=50
```

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 5,
      "codigo": "PIC-A320",
      "nome": "PIC Airbus A320",
      "categoria_id": 1,
      "categoria_nome": "Categoria 1",
      "descricao": "Piloto em Comando de Airbus A320",
      "validade_meses": 12,
      "ativo": true,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 25,
  "code": 200
}
```

---

### 2. Criar Qualificação (POST)
**Endpoint**: `POST /api/v2/qualificacoes`

**Request Body**:
```json
{
  "codigo": "PIC-A320",
  "nome": "PIC Airbus A320",
  "categoria_id": 1,
  "descricao": "Piloto em Comando",
  "validade_meses": 12
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "id": 5,
    "codigo": "PIC-A320",
    "nome": "PIC Airbus A320",
    "categoria_id": 1,
    "descricao": "Piloto em Comando",
    "validade_meses": 12,
    "ativo": true,
    "created_at": "2024-11-04T17:00:00Z"
  },
  "code": 201
}
```

---

### 3. Atualizar Qualificação (PUT)
**Endpoint**: `PUT /api/v2/qualificacoes/:id`

**Request Body**:
```json
{
  "nome": "PIC Airbus A320 (Updated)",
  "validade_meses": 24,
  "ativo": true
}
```

**Response (200)**: Retorna qualificação atualizada

---

### 4. Deletar Qualificação (DELETE)
**Endpoint**: `DELETE /api/v2/qualificacoes/:id`

**Response (200)**: Soft delete

---

## 📋 MÓDULO: FUNCIONÁRIOS

### 1. Listar Funcionários (GET)
**Endpoint**: `GET /api/v2/funcionarios`

**Query Parameters**:
```
?funcao=PILOTO           // Filter by role
&status=ATIVO            // ATIVO|INATIVO|FÉRIAS
&page=1
&limit=20
&search=João             // Search by name
```

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "nome": "João Silva",
      "matricula": "PL-001",
      "cpf": "12345678901",
      "email": "joao@airline.com",
      "telefone": "11999999999",
      "funcao": "PILOTO",
      "status": "ATIVO",
      "aeronave_principal": "A320",
      "habilitacoes_ativas": 5,
      "habilitacoes_vencendo": 1,
      "habilitacoes_vencidas": 0,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 150,
  "code": 200
}
```

---

### 2. Obter Funcionário (GET)
**Endpoint**: `GET /api/v2/funcionarios/:id`

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": 123,
    "nome": "João Silva",
    "matricula": "PL-001",
    "cpf": "12345678901",
    "email": "joao@airline.com",
    "telefone": "11999999999",
    "funcao": "PILOTO",
    "status": "ATIVO",
    "aeronave_principal": "A320",
    "habilitacoes": [
      {
        "id": 1,
        "qualificacao_nome": "PIC A320",
        "data_vencimento": "2025-01-15",
        "status": "VÁLIDO"
      }
    ],
    "certificados": 5,
    "treinamentos": 3,
    "created_at": "2024-01-01T00:00:00Z"
  },
  "code": 200
}
```

---

### 3. Criar Funcionário (POST)
**Endpoint**: `POST /api/v2/funcionarios`

**Request Body**:
```json
{
  "nome": "Maria Santos",
  "matricula": "PL-002",
  "cpf": "98765432109",
  "email": "maria@airline.com",
  "telefone": "11988888888",
  "funcao": "CO_PILOTO",
  "status": "ATIVO",
  "aeronave_principal": "A320"
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "id": 124,
    "nome": "Maria Santos",
    "matricula": "PL-002",
    // ... all fields
    "created_at": "2024-11-04T17:30:00Z"
  },
  "code": 201
}
```

---

### 4. Atualizar Funcionário (PUT)
**Endpoint**: `PUT /api/v2/funcionarios/:id`

**Request Body**:
```json
{
  "status": "FÉRIAS",
  "aeronave_principal": "B787"
}
```

**Response (200)**: Funcionário atualizado

---

### 5. Deletar Funcionário (DELETE)
**Endpoint**: `DELETE /api/v2/funcionarios/:id`

**Response (200)**: Soft delete

---

## 📋 MÓDULO: CERTIFICADOS

### 1. Listar Certificados (GET)
**Endpoint**: `GET /api/v2/certificados`

**Query Parameters**:
```
?habilitacao_id=1       // Filter by habilitação
&tipo=PDF               // Filter by file type
&page=1
```

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "habilitacao_id": 1,
      "nome_arquivo": "certificado-pic-a320.pdf",
      "url_r2": "https://r2.example.com/...",
      "tipo": "PDF",
      "tamanho_bytes": 245872,
      "data_upload": "2024-11-04T10:00:00Z"
    }
  ],
  "total": 10,
  "code": 200
}
```

---

### 2. Upload Certificado (POST)
**Endpoint**: `POST /api/v2/certificados/upload`

**Content-Type**: `multipart/form-data`

**Form Data**:
```
file: (binary PDF or JPG)
habilitacao_id: 1
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "habilitacao_id": 1,
    "nome_arquivo": "certificado-pic-a320.pdf",
    "url_r2": "https://r2.example.com/certs/...",
    "tipo": "PDF",
    "tamanho_bytes": 245872,
    "data_upload": "2024-11-04T17:00:00Z"
  },
  "code": 201
}
```

**Error Response (422)**:
```json
{
  "success": false,
  "error": "Arquivo inválido",
  "details": {
    "message": "Arquivo deve ser PDF ou JPG",
    "maxSize": "10MB"
  },
  "code": 422
}
```

---

### 3. Download Certificado (GET)
**Endpoint**: `GET /api/v2/certificados/:id/download`

**Response**: File download (application/pdf or image/jpeg)

---

### 4. Deletar Certificado (DELETE)
**Endpoint**: `DELETE /api/v2/certificados/:id`

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "deletedAt": "2024-11-04T17:30:00Z"
  },
  "code": 200
}
```

---

## 📋 MÓDULO: AGENDAMENTOS

### 1. Listar Agendamentos (GET)
**Endpoint**: `GET /api/v2/agendamentos`

**Query Parameters**:
```
?data=2024-11-04         // Specific date
&simulador_id=1          // Filter by simulator
&status=AGENDADO         // AGENDADO|CONCLUIDO|CANCELADO
&page=1
```

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "simulador_id": 1,
      "simulador_nome": "A320 FTD",
      "data": "2024-11-05",
      "hora_inicio": "14:00",
      "hora_fim": "16:00",
      "instrutor_id": 200,
      "instrutor_nome": "Carlos Professor",
      "checador_id": 201,
      "checador_nome": "Ana Checadora",
      "status": "AGENDADO",
      "tipo_sessao": "INICIAL",
      "observacoes": "Treinamento obrigatório",
      "criado_em": "2024-11-04T09:00:00Z"
    }
  ],
  "total": 45,
  "code": 200
}
```

---

### 2. Criar Agendamento (POST)
**Endpoint**: `POST /api/v2/agendamentos`

**Request Body**:
```json
{
  "simulador_id": 1,
  "data": "2024-11-05",
  "hora_inicio": "14:00",
  "hora_fim": "16:00",
  "instrutor_id": 200,
  "checador_id": 201,
  "tipo_sessao": "INICIAL",
  "observacoes": "Treinamento obrigatório"
}
```

**Validação**:
- `hora_fim` > `hora_inicio`
- Data não no passado
- Simulador disponível nesse horário
- Instrutor e checador válidos

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "simulador_id": 1,
    // ... all fields
    "criado_em": "2024-11-04T17:00:00Z"
  },
  "code": 201
}
```

---

### 3. Atualizar Agendamento (PUT)
**Endpoint**: `PUT /api/v2/agendamentos/:id`

**Request Body**:
```json
{
  "status": "CONCLUIDO",
  "observacoes": "Sessão completa com sucesso"
}
```

**Response (200)**: Agendamento atualizado

---

### 4. Deletar Agendamento (DELETE)
**Endpoint**: `DELETE /api/v2/agendamentos/:id`

**Response (200)**: Soft delete

---

## 📋 MÓDULO: COMPLIANCE & AUDITORIA

### 1. Dashboard Compliance (GET)
**Endpoint**: `GET /api/v2/compliance/dashboard`

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "total_funcionarios": 150,
    "habilitacoes_validas": 142,
    "habilitacoes_vencendo": 6,
    "habilitacoes_vencidas": 2,
    "taxa_conformidade": 94.67,
    "alertas_criticos": 2,
    "alertas_avisos": 6,
    "proximos_vencimentos": [
      {
        "funcionario_nome": "João Silva",
        "qualificacao": "PIC A320",
        "data_vencimento": "2024-11-10"
      }
    ]
  },
  "code": 200
}
```

---

### 2. Matriz de Compliance (GET)
**Endpoint**: `GET /api/v2/compliance/matriz`

**Query Parameters**:
```
?setor=PILOTOS           // Filter by sector
&funcao=PIC              // Filter by function
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "matriz": [
      {
        "funcionario_id": 123,
        "funcionario_nome": "João Silva",
        "funcao": "PIC",
        "habilitacoes_validas": 5,
        "habilitacoes_vencendo": 1,
        "habilitacoes_vencidas": 0,
        "status": "ATENÇÃO"
      }
    ],
    "total_funcionarios": 45,
    "conformidade_geral": 96.5
  },
  "code": 200
}
```

---

### 3. Executar Auditoria de Datas (POST)
**Endpoint**: `POST /api/v2/auditoria-datas/executar`

**Request Body**:
```json
{
  "tabelas": ["habilitacoes", "qualificacoes", "certificados"],
  "campos_data": ["data_conclusao", "data_vencimento"]
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "total_campos": 2500,
    "corretos": 2480,
    "problematicos": 20,
    "taxa_conformidade": 99.2,
    "problemas": [
      {
        "tabela": "habilitacoes",
        "id": 45,
        "campo": "data_vencimento",
        "valor": "2024-13-40",
        "problema": "Data inválida"
      }
    ],
    "tempo_execucao_ms": 1250,
    "criado_em": "2024-11-04T17:00:00Z"
  },
  "code": 200
}
```

---

### 4. Obter Alertas (GET)
**Endpoint**: `GET /api/v2/compliance/alertas`

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "criticos": [
      {
        "id": 1,
        "funcionario_id": 125,
        "funcionario_nome": "Maria Santos",
        "tipo": "VENCIDA",
        "qualificacao": "CRM A320",
        "data_vencimento": "2024-10-15",
        "dias_atraso": 20
      }
    ],
    "avisos": [
      {
        "id": 2,
        "funcionario_id": 123,
        "tipo": "VENCENDO",
        "qualificacao": "PIC A320",
        "data_vencimento": "2024-11-10",
        "dias_para_vencer": 6
      }
    ],
    "total_criticos": 2,
    "total_avisos": 6
  },
  "code": 200
}
```

---

## 📋 MÓDULO: TREINAMENTOS

### 1. Listar Treinamentos (GET)
**Endpoint**: `GET /api/v2/treinamentos`

**Query Parameters**:
```
?funcionario_id=123      // Filter by employee
&status=CONCLUIDO        // Filter by status
&page=1
```

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "funcionario_id": 123,
      "funcionario_nome": "João Silva",
      "tipo": "CRM",
      "data_conclusao": "2024-10-15",
      "instrutor": "Carlos Professor",
      "nota": 8.5,
      "status": "CONCLUIDO",
      "certificado_url": "https://r2.example.com/...",
      "created_at": "2024-10-15T15:00:00Z"
    }
  ],
  "total": 25,
  "code": 200
}
```

---

### 2. Criar Treinamento (POST)
**Endpoint**: `POST /api/v2/treinamentos`

**Request Body**:
```json
{
  "funcionario_id": 123,
  "tipo": "CRM",
  "data_conclusao": "2024-11-04",
  "instrutor": "Carlos Professor",
  "nota": 9.0
}
```

**Response (201)**: Treinamento criado

---

## 🔐 AUTENTICAÇÃO & HEADERS

### Header Obrigatório
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Exemplo de Request
```bash
curl -X GET "https://airtrust.workers.dev/api/v2/habilitacoes?page=1" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json"
```

---

## ⚠️ TRATAMENTO DE ERROS

### Erro de Validação (422)
```json
{
  "success": false,
  "error": "Validation failed",
  "code": 422,
  "details": [
    {
      "path": "data_vencimento",
      "message": "Invalid date format"
    }
  ]
}
```

### Erro de Não Encontrado (404)
```json
{
  "success": false,
  "error": "Habilitação não encontrada",
  "code": 404
}
```

### Erro de Servidor (500)
```json
{
  "success": false,
  "error": "Erro interno do servidor",
  "code": 500
}
```

---

## 📊 RESUMO ENDPOINTS

| Módulo | GET | POST | PUT | DELETE | Total |
|--------|-----|------|-----|--------|-------|
| Habilitações | 2 | 1 | 1 | 1 | 5 |
| Qualificações | 2 | 1 | 1 | 1 | 5 |
| Funcionários | 2 | 1 | 1 | 1 | 5 |
| Certificados | 2 | 1 | 0 | 1 | 4 |
| Agendamentos | 2 | 1 | 1 | 1 | 5 |
| Compliance | 3 | 1 | 0 | 0 | 4 |
| Treinamentos | 2 | 1 | 1 | 1 | 5 |
| **TOTAL** | **15** | **7** | **5** | **6** | **33** |

**Nota**: Existem +15 endpoints adicionais para outras funcionalidades (manobras, fichas, empresas, aeronaves, etc.)

---

**Total de Endpoints Documentados**: 33 principais + 15+ adicionais  
**Última Atualização**: 4 de Novembro de 2025  
**Status**: ✅ COMPLETO

# API Reference - AirTrust v1

**Base URL:** `https://airtrust.workers.dev/api/v2`

**Última Atualização:** 10 de Novembro de 2025

---

## 📋 Sumário

- [Autenticação](#autenticação)
- [Endpoints](#endpoints)
  - [Funcionários](#funcionários)
  - [Qualificações](#qualificações)
  - [Habilitações](#habilitações)
  - [Certificados](#certificados)
  - [Simuladores](#simuladores)
  - [Agendamentos](#agendamentos)
  - [Fichas](#fichas)
- [Códigos de Erro](#códigos-de-erro)
- [Rate Limiting](#rate-limiting)

---

## Autenticação

Todas as requisições requerem JWT token no header:

```
Authorization: Bearer <token>
```

**Exemplo:**

```bash
curl -H "Authorization: Bearer eyJhbGc..." https://airtrust.workers.dev/api/v2/funcionarios
```

---

## Endpoints

### Funcionários

#### GET /funcionarios

Lista todos os funcionários.

**Query Params:**

| Param    | Tipo   | Descrição                                |
| -------- | ------ | ---------------------------------------- |
| `page`   | number | Página (default: 1)                      |
| `limit`  | number | Itens por página (default: 50, max: 100) |
| `search` | string | Buscar por nome/matricula/CPF            |
| `status` | string | Filtrar por status (active/inactive)     |

**Response:**

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "uuid",
        "nome": "João Silva",
        "matricula": "001234",
        "cpf": "12345678909",
        "email": "joao@example.com",
        "funcao_id": "uuid",
        "empresa_id": "uuid",
        "status": "active",
        "created_at": "2025-01-10T10:00:00Z",
        "updated_at": "2025-01-10T10:00:00Z"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 50,
    "totalPages": 2
  },
  "code": "SUCCESS"
}
```

---

#### GET /funcionarios/:id

Busca funcionário por ID.

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "nome": "João Silva",
    "matricula": "001234",
    "cpf": "12345678909",
    "email": "joao@example.com",
    "habilitacoes": [
      {
        "id": "uuid",
        "tipo": "PLA",
        "data_vencimento": "2026-01-10"
      }
    ],
    "certificados": [
      {
        "id": "uuid",
        "tipo": "Médico",
        "data_validade": "2025-06-10"
      }
    ]
  },
  "code": "SUCCESS"
}
```

---

#### POST /funcionarios

Cria novo funcionário.

**Body:**

```json
{
  "nome": "João Silva",
  "matricula": "001234",
  "cpf": "12345678909",
  "email": "joao@example.com",
  "funcao_id": "uuid",
  "empresa_id": "uuid"
}
```

**Validações:**

- `nome`: required, string, min 3, max 100
- `matricula`: required, unique, min 4, max 20
- `cpf`: required, unique, valid CPF
- `email`: required, unique, valid email
- `funcao_id`: required, uuid válido
- `empresa_id`: required, uuid válido

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "nome": "João Silva",
    "matricula": "001234",
    "created_at": "2025-01-10T10:00:00Z"
  },
  "code": "CREATED"
}
```

---

#### PUT /funcionarios/:id

Atualiza funcionário.

**Body:**

```json
{
  "nome": "João Silva Atualizado",
  "email": "novo@example.com"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "nome": "João Silva Atualizado",
    "updated_at": "2025-01-10T11:00:00Z"
  },
  "code": "SUCCESS"
}
```

---

#### DELETE /funcionarios/:id

Deleta funcionário (soft delete).

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "deleted_at": "2025-01-10T11:00:00Z"
  },
  "code": "SUCCESS"
}
```

---

### Habilitações

#### GET /habilitacoes

Lista habilitações.

**Query Params:**

| Param            | Tipo    | Descrição                        |
| ---------------- | ------- | -------------------------------- |
| `funcionario_id` | uuid    | Filtrar por funcionário          |
| `tipo`           | string  | Filtrar por tipo (PLA, COM, ASI) |
| `vencidas`       | boolean | Mostrar apenas vencidas          |

**Response:**

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "uuid",
        "funcionario_id": "uuid",
        "tipo": "PLA",
        "data_vencimento": "2026-01-10",
        "status": "active"
      }
    ],
    "total": 25
  },
  "code": "SUCCESS"
}
```

---

#### POST /habilitacoes

Cria habilitação.

**Body:**

```json
{
  "funcionario_id": "uuid",
  "tipo": "PLA",
  "data_vencimento": "2026-01-10"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "funcionario_id": "uuid",
    "tipo": "PLA"
  },
  "code": "CREATED"
}
```

---

### Certificados

#### GET /certificados

Lista certificados.

**Query Params:**

| Param            | Tipo    | Descrição               |
| ---------------- | ------- | ----------------------- |
| `funcionario_id` | uuid    | Filtrar por funcionário |
| `tipo`           | string  | Filtrar por tipo        |
| `vencidos`       | boolean | Mostrar apenas vencidos |

---

#### POST /certificados

Cria certificado.

**Body:**

```json
{
  "funcionario_id": "uuid",
  "tipo": "Médico",
  "data_validade": "2025-06-10",
  "numero_documento": "ABC123456"
}
```

---

### Simuladores

#### GET /simuladores

Lista simuladores.

**Query Params:**

| Param        | Tipo   | Descrição           |
| ------------ | ------ | ------------------- |
| `empresa_id` | uuid   | Filtrar por empresa |
| `tipo`       | string | Filtrar por tipo    |

---

#### GET /simuladores/:id

Busca simulador específico.

---

#### POST /simuladores

Cria simulador.

**Body:**

```json
{
  "nome": "Simulador B777",
  "tipo": "Full Flight Simulator",
  "modelo": "B777",
  "empresa_id": "uuid",
  "habilitacoes_requeridas": ["PLA", "COM"]
}
```

---

### Agendamentos

#### GET /agendamentos

Lista agendamentos.

**Query Params:**

| Param            | Tipo | Descrição               |
| ---------------- | ---- | ----------------------- |
| `funcionario_id` | uuid | Filtrar por funcionário |
| `simulador_id`   | uuid | Filtrar por simulador   |
| `data_inicio`    | date | Filtrar a partir de     |
| `data_fim`       | date | Filtrar até             |

**Response:**

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "uuid",
        "funcionario_id": "uuid",
        "simulador_id": "uuid",
        "data_inicio": "2025-02-15T09:00:00Z",
        "data_fim": "2025-02-15T11:00:00Z",
        "status": "scheduled"
      }
    ],
    "total": 50
  },
  "code": "SUCCESS"
}
```

---

#### POST /agendamentos

Cria agendamento.

**Body:**

```json
{
  "funcionario_id": "uuid",
  "simulador_id": "uuid",
  "data_inicio": "2025-02-15T09:00:00Z",
  "data_fim": "2025-02-15T11:00:00Z",
  "instrutor_id": "uuid",
  "notas": "Teste de qualificação inicial"
}
```

**Validações:**

- Funcionário deve ter habilitações requeridas
- Habilitações não podem estar vencidas
- Data não pode estar no passado
- Simulador deve estar disponível

---

#### PUT /agendamentos/:id

Atualiza agendamento.

---

#### DELETE /agendamentos/:id

Cancela agendamento.

---

### Fichas

#### GET /fichas

Lista fichas de voo.

**Query Params:**

| Param            | Tipo   | Descrição               |
| ---------------- | ------ | ----------------------- |
| `funcionario_id` | uuid   | Filtrar por funcionário |
| `agendamento_id` | uuid   | Filtrar por agendamento |
| `status`         | string | Filtrar por status      |

---

#### GET /fichas/:id

Busca ficha específica.

---

#### POST /fichas

Cria ficha de voo.

**Body:**

```json
{
  "agendamento_id": "uuid",
  "resultado": "PASS",
  "observacoes": "Voo bem-sucedido",
  "assinatura_instrutor": "base64",
  "dados_voo": {
    "decolagens": 3,
    "pouso": 2,
    "tempo_voo": 180
  }
}
```

---

#### PUT /fichas/:id

Atualiza ficha.

---

## Códigos de Erro

| Código                  | Status HTTP | Descrição                  |
| ----------------------- | ----------- | -------------------------- |
| `SUCCESS`               | 200         | Requisição bem-sucedida    |
| `CREATED`               | 201         | Recurso criado             |
| `BAD_REQUEST`           | 400         | Dados inválidos            |
| `UNAUTHORIZED`          | 401         | Token inválido ou expirado |
| `FORBIDDEN`             | 403         | Sem permissão              |
| `NOT_FOUND`             | 404         | Recurso não encontrado     |
| `CONFLICT`              | 409         | Dado duplicado             |
| `UNPROCESSABLE_ENTITY`  | 422         | Validação falhou           |
| `INTERNAL_SERVER_ERROR` | 500         | Erro do servidor           |

---

## Rate Limiting

**Limites:**

- 1000 requests por hora por usuário
- 100 requests por minuto por IP

**Headers de Resposta:**

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1673433600
```

---

## Exemplos cURL

### Listar funcionários

```bash
curl -X GET \
  'https://airtrust.workers.dev/api/v2/funcionarios?page=1&limit=10' \
  -H 'Authorization: Bearer token-aqui'
```

### Criar funcionário

```bash
curl -X POST \
  https://airtrust.workers.dev/api/v2/funcionarios \
  -H 'Authorization: Bearer token-aqui' \
  -H 'Content-Type: application/json' \
  -d '{
    "nome": "João Silva",
    "matricula": "001234",
    "cpf": "12345678909",
    "email": "joao@example.com",
    "funcao_id": "uuid",
    "empresa_id": "uuid"
  }'
```

### Criar agendamento

```bash
curl -X POST \
  https://airtrust.workers.dev/api/v2/agendamentos \
  -H 'Authorization: Bearer token-aqui' \
  -H 'Content-Type: application/json' \
  -d '{
    "funcionario_id": "uuid",
    "simulador_id": "uuid",
    "data_inicio": "2025-02-15T09:00:00Z",
    "data_fim": "2025-02-15T11:00:00Z"
  }'
```

---

## Notas de Implementação

- Todas as datas são em ISO 8601 format (UTC)
- Todos os IDs são UUIDs v4
- Soft delete é usado para funcionários e agendamentos
- Todos os endpoints suportam filtros básicos
- Paginação é obrigatória para lista com 50+ itens
- CSRF tokens são auto-injetados

---

**Documentação atualizada:** 10 de Novembro de 2025

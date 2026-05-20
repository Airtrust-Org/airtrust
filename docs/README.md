# 📚 DOCUMENTAÇÃO API - AIRTRUST v2.0

**Data:** 19 de Outubro de 2025  
**Versão:** 2.0.0  
**Base URL:** `https://api.airtrust.com.br` ou `http://localhost:8787` 

---

## 📑 ÍNDICE

1. [Visão Geral](#visão-geral)
2. [Autenticação](#autenticação)
3. [Módulo Qualificações](#módulo-qualificações)
4. [Módulo Treinamentos](#módulo-treinamentos)
5. [Módulo Integrações](#módulo-integrações)
6. [Códigos de Erro](#códigos-de-erro)
7. [Troubleshooting](#troubleshooting)

---

## 🎯 VISÃO GERAL

AirTrust é um sistema de gestão de qualificações aeronáuticas com controle de validade, compliance e notificações automáticas.

### Stack Técnica
- **Backend:** Cloudflare Workers + Hono
- **Database:** D1 (SQLite)
- **Storage:** R2
- **Email:** Resend API
- **Frontend:** React 19 + TailwindCSS

### Princípios
- ✅ Soft Delete em todas as tabelas
- ✅ Auditoria completa de operações
- ✅ Timestamps automáticos (created_at, updated_at)
- ✅ Validação backend obrigatória

---

## 🔐 AUTENTICAÇÃO

### JWT Bearer Token

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Obter Token

```http
POST /api/v2/auth/login
Content-Type: application/json

{
  "email": "usuario@airtrust.com",
  "password": "senha123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "usuario@airtrust.com",
    "role": "ADMIN"
  }
}
```

---

## 🎓 MÓDULO QUALIFICAÇÕES

### Tipos Disponíveis
- `TREINAMENTO` - Cursos e capacitações
- `CHECK` - Verificações de proficiência
- `EXAME` - Avaliações médicas e técnicas

### Status Automático
```
VENCIDO: data_validade < hoje
VENCENDO: data_validade entre hoje e hoje+30 dias
VÁLIDO: data_validade > hoje+30 dias
```

---

### 📊 GET /api/v2/qualificacoes/compliance

Dashboard com estatísticas de vencimento.

**Request:**
```http
GET /api/v2/qualificacoes/compliance
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "stats": {
    "total": 150,
    "validas": 120,
    "vencendo": 20,
    "vencidas": 10
  },
  "compliance": "80.00",
  "vencendo_proximos_30_dias": [
    {
      "id": 1,
      "funcionario_id": 10,
      "funcionario_nome": "João Silva",
      "categoria": "CMA",
      "data_validade": "2025-11-15",
      "dias_restantes": 27
    }
  ],
  "vencidas": [
    {
      "id": 2,
      "funcionario_id": 11,
      "funcionario_nome": "Maria Santos",
      "categoria": "ICAO",
      "data_validade": "2025-09-30",
      "dias_vencido": 19
    }
  ]
}
```

---

### 📋 GET /api/v2/qualificacoes

Lista paginada com filtros.

**Request:**
```http
GET /api/v2/qualificacoes?tipo=TREINAMENTO&status=VÁLIDO&page=1&per_page=20
Authorization: Bearer {token}
```

**Query Parameters:**
| Parâmetro | Tipo | Descrição | Exemplo |
|-----------|------|-----------|---------|
| `tipo` | string | Filtrar por tipo | `TREINAMENTO` |
| `status` | string | Filtrar por status | `VÁLIDO` |
| `funcionario_id` | number | Filtrar por funcionário | `123` |
| `categoria` | string | Filtrar por categoria | `CRM` |
| `page` | number | Número da página | `1` |
| `per_page` | number | Registros por página | `20` |

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": 1,
      "funcionario_id": 10,
      "tipo": "TREINAMENTO",
      "categoria": "CRM",
      "descricao": "Crew Resource Management",
      "data_validade": "2026-01-15",
      "status": "VÁLIDO",
      "created_at": "2025-01-10T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "total_pages": 8,
    "has_next": true,
    "has_prev": false
  }
}
```

---

### ➕ POST /api/v2/qualificacoes

Cria nova qualificação.

**Request:**
```http
POST /api/v2/qualificacoes
Authorization: Bearer {token}
Content-Type: application/json

{
  "funcionario_id": 10,
  "tipo": "TREINAMENTO",
  "categoria": "CRM",
  "descricao": "Crew Resource Management",
  "instituicao": "ANAC",
  "instrutor": "Pedro Almeida",
  "carga_horaria": 40,
  "numero": "CRM-2025-001",
  "data_emissao": "2025-10-01",
  "data_conclusao": "2025-10-05",
  "data_validade": "2027-10-05",
  "observacoes": "Treinamento inicial"
}
```

**Campos Obrigatórios:**
- `funcionario_id` (number)
- `tipo` (enum: TREINAMENTO, CHECK, EXAME)
- `categoria` (string)
- `data_validade` (string YYYY-MM-DD)

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": 151,
    "funcionario_id": 10,
    "tipo": "TREINAMENTO",
    "categoria": "CRM",
    "status": "VÁLIDO",
    "created_at": "2025-10-19T16:00:00Z"
  }
}
```

---

### 📤 POST /api/v2/qualificacoes/:id/upload

Upload de certificado (PDF, JPG, PNG até 10MB).

**Request:**
```http
POST /api/v2/qualificacoes/151/upload
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: certificado.pdf
```

**Response (200 OK):**
```json
{
  "success": true,
  "filename": "151_1729350000000_a1b2c3d4.pdf",
  "url": "/api/v2/qualificacoes/151/download"
}
```

---

### 📥 GET /api/v2/qualificacoes/:id/download

Download do certificado.

**Request:**
```http
GET /api/v2/qualificacoes/151/download
Authorization: Bearer {token}
```

**Response (200 OK):**
```http
Content-Type: application/pdf
Content-Disposition: attachment; filename="151_1729350000000_a1b2c3d4.pdf"

[binary data]
```

---

### 👤 GET /api/v2/qualificacoes/funcionario/:id

Lista todas as qualificações de um funcionário.

**Request:**
```http
GET /api/v2/qualificacoes/funcionario/10
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "funcionario": {
    "id": 10,
    "nome": "João Silva",
    "matricula": "12345"
  },
  "qualificacoes": [
    {
      "id": 1,
      "tipo": "TREINAMENTO",
      "categoria": "CRM",
      "data_validade": "2027-10-05",
      "status": "VÁLIDO"
    }
  ],
  "exames": [
    {
      "id": 1,
      "tipo_exame": "CMA",
      "data_vencimento": "2026-05-15",
      "resultado": "APTO"
    }
  ],
  "checks": [
    {
      "id": 1,
      "tipo_check": "ICAO",
      "data_vencimento": "2027-12-31",
      "resultado": "APROVADO"
    }
  ],
  "total": {
    "qualificacoes": 5,
    "exames": 2,
    "checks": 3
  }
}
```

---

## 🎯 MÓDULO TREINAMENTOS

### 📋 GET /api/v2/treinamentos

Lista completa do catálogo.

**Request:**
```http
GET /api/v2/treinamentos
```

**Response (200 OK):**
```json
{
  "treinamentos": [
    {
      "id": 1,
      "codigo": "SEG001",
      "nome": "Segurança de Voo",
      "categoria": "SEGURANÇA",
      "periodicidade_meses": 12,
      "carga_horaria": 24,
      "instrutor_padrao": "ANAC",
      "obrigatorio": true
    }
  ]
}
```

### Categorias Disponíveis

| Categoria | Periodicidade | Criticidade |
|-----------|---------------|-------------|
| SEGURANÇA | 12 meses | 🔴 CRÍTICA |
| OPERACIONAL | 24 meses | 🟡 ALTA |
| COMPLIANCE | 36 meses | 🟡 ALTA |
| EMERGÊNCIA | 6 meses | 🔴 CRÍTICA |
| MANUTENÇÃO | 12 meses | 🟠 MÉDIA |
| LICENÇA MÉDICA | 12 meses | 🔴 CRÍTICA |
| PROFICIÊNCIA | 36 meses | 🟡 ALTA |
| SIMULADOR | 6-12 meses | 🔴 CRÍTICA |

---

## 🔗 MÓDULO INTEGRAÇÕES

### Relacionamentos

```
Funcionário (1) ←→ (N) Qualificações
Funcionário (1) ←→ (N) Exames
Funcionário (1) ←→ (N) Checks
```

### Queries de Integridade

```sql
-- Funcionários com qualificações vencidas
SELECT f.id, f.nome, COUNT(q.id) as total_vencidas
FROM funcionarios f
INNER JOIN qualificacoes q ON f.id = q.funcionario_id
WHERE q.data_validade < CURRENT_DATE
AND q.deleted_at IS NULL
AND f.deleted_at IS NULL
GROUP BY f.id;

-- Funcionários sem qualificações
SELECT f.*
FROM funcionarios f
LEFT JOIN qualificacoes q ON f.id = q.funcionario_id
WHERE q.id IS NULL
AND f.deleted_at IS NULL;

-- Compliance < 80%
SELECT 
  f.id,
  f.nome,
  COUNT(q.id) as total,
  COUNT(CASE WHEN q.data_validade >= CURRENT_DATE THEN 1 END) as validas,
  (COUNT(CASE WHEN q.data_validade >= CURRENT_DATE THEN 1 END) * 100.0 / COUNT(q.id)) as compliance
FROM funcionarios f
INNER JOIN qualificacoes q ON f.id = q.funcionario_id
WHERE f.deleted_at IS NULL
AND q.deleted_at IS NULL
GROUP BY f.id
HAVING compliance < 80;
```

---

## ❌ CÓDIGOS DE ERRO

| Código | Descrição | Ação Recomendada |
|--------|-----------|------------------|
| **400** | Bad Request | Verificar campos obrigatórios e formato |
| **401** | Unauthorized | Verificar token JWT |
| **403** | Forbidden | Verificar permissões do usuário |
| **404** | Not Found | Verificar se ID existe |
| **409** | Conflict | Registro duplicado, verificar matrícula/CPF |
| **413** | Payload Too Large | Arquivo > 10MB, comprimir |
| **422** | Unprocessable Entity | Validação falhou, verificar dados |
| **500** | Internal Server Error | Contactar suporte |

### Formato de Erro

```json
{
  "error": "Validation failed",
  "message": "Campo 'data_validade' é obrigatório",
  "field": "data_validade",
  "code": "VALIDATION_ERROR"
}
```

---

## 🔧 TROUBLESHOOTING

### Problema: Upload falha com 413
**Causa:** Arquivo > 10MB  
**Solução:** Comprimir arquivo ou dividir em múltiplos uploads

### Problema: Qualificação não aparece na lista
**Causa:** `deleted_at` não é NULL (soft delete)  
**Solução:** Verificar se foi deletada acidentalmente ou restaurar

### Problema: Token expirado (401)
**Causa:** JWT expirou (24h)  
**Solução:** Fazer login novamente

### Problema: Notificações não enviadas
**Causa:** Cron job não configurado  
**Solução:** Verificar Cloudflare Workers Triggers em Dashboard

### Problema: CORS error no frontend
**Causa:** Origem não permitida  
**Solução:** Adicionar domínio em `allowedOrigins` no backend

---

## 📊 MÉTRICAS E LOGS

### Auditoria

```sql
-- Ver histórico de uma qualificação
SELECT * FROM auditoriaavancadav2
WHERE module = 'qualificacoes'
AND target_record_id = 151
ORDER BY created_at DESC
LIMIT 20;
```

### Performance
- Latência média: <100ms
- Taxa de erro: <1%
- Uptime: 99.9%

---

## 🔔 WEBHOOKS E EVENTOS

### Eventos Disponíveis

1. `qualificacao.created` - Nova qualificação cadastrada
2. `qualificacao.vencendo` - Vencimento em 30 dias
3. `qualificacao.vencida` - Qualificação expirou
4. `qualificacao.renovada` - Qualificação renovada

### Configurar Webhook

```http
POST /api/v2/webhooks
Authorization: Bearer {token}
Content-Type: application/json

{
  "url": "https://seu-sistema.com/webhook",
  "events": ["qualificacao.vencendo", "qualificacao.vencida"],
  "secret": "seu-secret-key"
}
```

**Payload enviado:**
```json
{
  "event": "qualificacao.vencendo",
  "timestamp": "2025-10-19T16:00:00Z",
  "data": {
    "id": 151,
    "funcionario_id": 10,
    "categoria": "CMA",
    "data_validade": "2025-11-15",
    "dias_restantes": 27
  }
}
```

---

## 📞 SUPORTE

- **Email:** suporte@airtrust.com.br
- **Documentação:** https://docs.airtrust.com.br
- **Status:** https://status.airtrust.com.br

---

**Última atualização:** 19/10/2025  
**Versão da API:** 2.0.0

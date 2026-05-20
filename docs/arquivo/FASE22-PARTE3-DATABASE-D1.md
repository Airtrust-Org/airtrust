# ✅ FASE 22 – PARTE 3: BANCO DE DADOS D1

**Data**: 15 de Novembro de 2025  
**Projeto**: AirTrust v1  
**Database**: D1 (SQLite Distribuído)

---

## 📋 SUMÁRIO

1. [Visão Geral](#1-visão-geral)
2. [Migrations Aplicadas](#2-migrations-aplicadas)
3. [Schema Completo](#3-schema-completo)
4. [Tabelas por Módulo](#4-tabelas-por-módulo)
5. [Relacionamentos](#5-relacionamentos)
6. [Índices e Performance](#6-índices-e-performance)
7. [Divergências Schema vs Código](#7-divergências-schema-vs-código)
8. [Problemas Conhecidos](#8-problemas-conhecidos)

---

## 1. VISÃO GERAL

### 1.1 Informações do Banco

```yaml
Database ID: 7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae
Database Name: airtrust-db
Tipo: D1 (SQLite distribuído)
Versão SQLite: 3.x
Localização: Cloudflare Edge
Binding Worker: DB (c.env.DB)
```

### 1.2 Migrations

```yaml
Localização: worker-airtrust/migrations/
Total Migrations: 5 arquivos
Aplicadas em Produção:
  - 0001_initial_schema.sql ✅
  - 0003_create_usuarios.sql ✅
  - 0005_* (desconhecido) ✅

Pendentes em Produção:
  - 0002_seed_minimo.sql ❌ (seeds não aplicados)
  - 0004_seed_usuarios.sql ❌ (seeds não aplicados)
  - 0006_add_missing_columns.sql ❌ (URGENTE)
```

### 1.3 Comando para Aplicar Migrations

```bash
# Development (local)
wrangler d1 execute airtrust-db --local --file=./migrations/0001_initial_schema.sql

# Production
wrangler d1 execute airtrust-db --env=production --file=./migrations/0001_initial_schema.sql

# Aplicar migration 0006 URGENTE
cd worker-airtrust
wrangler d1 execute airtrust-db --env=production --file=./migrations/0006_add_missing_columns.sql
```

---

## 2. MIGRATIONS APLICADAS

### 2.1 Migration 0001: Initial Schema

**Arquivo**: `0001_initial_schema.sql`  
**Data**: 2025-11-14  
**Status**: ✅ Aplicada em Produção

**Tabelas Criadas**:

1. `funcionarios` - Cadastro de funcionários
2. `qualificacoes_tipos` - Catálogo de tipos de qualificações
3. `qualificacoes_historico` - Histórico de qualificações por funcionário
4. `simuladores` - Equipamentos de simulador
5. `sessoes_simulador` - Sessões de treinamento
6. `participantes_sessao` - Relação N:N (sessão ↔ funcionários)
7. `audit_logs` - Logs de auditoria

**Schema**:

```sql
-- FUNCIONARIOS
CREATE TABLE IF NOT EXISTS funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  telefone TEXT,
  cargo TEXT NOT NULL,
  setor TEXT NOT NULL,              -- ⚠️ PROBLEMA: Coluna não existe em produção
  funcao TEXT,
  codigo_anac TEXT,
  ativo INTEGER DEFAULT 1,
  is_instrutor INTEGER DEFAULT 0,
  is_checador INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL
);

-- QUALIFICACOES TIPOS
CREATE TABLE IF NOT EXISTS qualificacoes_tipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  codigo TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL,
  descricao TEXT,
  validade_meses INTEGER NOT NULL DEFAULT 12,
  obrigatoria INTEGER DEFAULT 0,   -- ⚠️ Schema diz obrigatoria, código usa ativo
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL
);

-- QUALIFICACOES HISTORICO
CREATE TABLE IF NOT EXISTS qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,  -- ⚠️ Schema: INTEGER, Dados reais: TEXT (matricula)
  qualificacao_id INTEGER NOT NULL, -- ⚠️ Schema: INTEGER, Dados reais: NULL (usa nome)
  data_obtencao TEXT NOT NULL,
  data_validade TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'VALIDA',
  certificado_url TEXT,
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes_tipos(id)
);

-- SIMULADORES
CREATE TABLE IF NOT EXISTS simuladores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo TEXT NOT NULL,
  fabricante TEXT NOT NULL,
  tipo TEXT NOT NULL,
  codigo TEXT NOT NULL UNIQUE,
  ativo INTEGER DEFAULT 1,
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL
);

-- SESSOES SIMULADOR
CREATE TABLE IF NOT EXISTS sessoes_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  simulador_id INTEGER NOT NULL,
  instrutor_id INTEGER,
  checador_id INTEGER,
  data_sessao TEXT NOT NULL,
  duracao_minutos INTEGER NOT NULL,
  tipo_sessao TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AGENDADA',
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (simulador_id) REFERENCES simuladores(id),
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id),
  FOREIGN KEY (checador_id) REFERENCES funcionarios(id)
);

-- PARTICIPANTES SESSAO
CREATE TABLE IF NOT EXISTS participantes_sessao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  funcao TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (sessao_id) REFERENCES sessoes_simulador(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id INTEGER,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  timestamp TEXT DEFAULT (datetime('now'))
);
```

---

### 2.2 Migration 0003: Usuários e Autenticação

**Arquivo**: `0003_create_usuarios.sql`  
**Data**: 2025-11-14  
**Status**: ✅ Aplicada em Produção

**Tabelas Criadas**:

1. `usuarios` - Usuários do sistema
2. `refresh_tokens` - Tokens de refresh JWT

**Schema**:

```sql
-- USUARIOS
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  nome TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'manager', 'user')),
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_role ON usuarios(role);
CREATE INDEX IF NOT EXISTS idx_usuarios_ativo ON usuarios(ativo);
CREATE INDEX IF NOT EXISTS idx_usuarios_deleted ON usuarios(deleted_at);

-- REFRESH TOKENS
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
```

---

### 2.3 Migration 0006: Adicionar Coluna setor (PENDENTE)

**Arquivo**: `0006_add_missing_columns.sql`  
**Data**: 2025-11-15  
**Status**: ❌ NÃO APLICADA EM PRODUÇÃO (URGENTE)

**Propósito**: Corrigir divergência entre schema e código

**Conteúdo**:

```sql
-- Adicionar coluna 'setor' em funcionarios
ALTER TABLE funcionarios ADD COLUMN setor TEXT;

-- Popular com valor default
UPDATE funcionarios
SET setor = 'OPERACIONAL'
WHERE setor IS NULL AND deleted_at IS NULL;

-- Validação
SELECT
  COUNT(*) as total_funcionarios,
  COUNT(setor) as com_setor
FROM funcionarios
WHERE deleted_at IS NULL;
```

**Impacto**: Sem essa migration, `GET /api/funcionarios` retorna HTTP 500

---

## 3. SCHEMA COMPLETO

### 3.1 Visão Geral de Tabelas

| Tabela                    | Linhas (aprox) | Propósito                     | Status                |
| ------------------------- | -------------- | ----------------------------- | --------------------- |
| `funcionarios`            | ~100           | Cadastro de colaboradores     | ⚠️ Falta coluna setor |
| `qualificacoes_tipos`     | ~50            | Catálogo de qualificações     | ✅ OK                 |
| `qualificacoes_historico` | ~1036          | Qualificações por funcionário | ⚠️ Schema legado      |
| `simuladores`             | ~10            | Equipamentos                  | ✅ OK                 |
| `sessoes_simulador`       | ~50            | Sessões agendadas             | ✅ OK                 |
| `participantes_sessao`    | ~100           | Relação sessão↔funcionário    | ✅ OK                 |
| `usuarios`                | ~5             | Usuários do sistema           | ⚠️ Sem seeds          |
| `refresh_tokens`          | ~10            | Tokens JWT                    | ✅ OK                 |
| `audit_logs`              | ~1000          | Logs de auditoria             | ✅ OK                 |

---

### 3.2 Diagrama de Relacionamentos

```
┌─────────────────┐
│  funcionarios   │
└────────┬────────┘
         │
         │ 1:N
         │
    ┌────▼────────────────────┐
    │ qualificacoes_historico │  ◄── ⚠️ FK não funcional (usa TEXT)
    └────┬────────────────────┘
         │
         │ N:1 (nome textual)
         │
    ┌────▼─────────────────┐
    │ qualificacoes_tipos  │
    └──────────────────────┘

┌─────────────────┐
│  funcionarios   │
└────────┬────────┘
         │
         │ N:M (via participantes_sessao)
         │
    ┌────▼──────────────┐         ┌──────────────┐
    │ sessoes_simulador │  N:1    │ simuladores  │
    └───────────────────┘ ◄────── └──────────────┘
         │ N:1
         │ (instrutor_id)
         └──────► funcionarios

┌─────────────┐
│  usuarios   │
└──────┬──────┘
       │ 1:N
       │
   ┌───▼──────────────┐
   │ refresh_tokens   │
   └──────────────────┘

┌─────────────┐
│  usuarios   │  1:N  ┌──────────────┐
└──────┬──────┘ ◄──── │ audit_logs   │
       │               └──────────────┘
       │ (user_id opcional)
```

---

## 4. TABELAS POR MÓDULO

### 4.1 Módulo: Funcionários

#### Tabela Principal: `funcionarios`

```sql
Colunas:
  - id: INTEGER PK AUTOINCREMENT
  - matricula: TEXT NOT NULL UNIQUE
  - nome: TEXT NOT NULL
  - cpf: TEXT NOT NULL UNIQUE
  - email: TEXT NOT NULL UNIQUE
  - telefone: TEXT
  - cargo: TEXT NOT NULL
  - setor: TEXT NOT NULL           -- ⚠️ NÃO EXISTE EM PRODUÇÃO
  - funcao: TEXT
  - codigo_anac: TEXT
  - ativo: INTEGER (0/1)
  - is_instrutor: INTEGER (0/1)
  - is_checador: INTEGER (0/1)
  - created_at: TEXT (ISO datetime)
  - updated_at: TEXT (ISO datetime)
  - deleted_at: TEXT (soft delete)

Índices:
  - idx_funcionarios_matricula (WHERE deleted_at IS NULL)
  - idx_funcionarios_cpf (WHERE deleted_at IS NULL)
  - idx_funcionarios_ativo (WHERE deleted_at IS NULL)
  - idx_funcionarios_deleted

Constraints:
  - UNIQUE(matricula)
  - UNIQUE(cpf)
  - UNIQUE(email)
```

**Problema Conhecido**:

- Schema define `setor TEXT NOT NULL`
- Migration 0001 cria coluna
- **MAS em produção a coluna não existe**
- Causa: Migration 0001 pode ter sido aplicada SEM essa coluna
- Solução: Migration 0006 adiciona coluna

**Campos Usados no Código**:

```typescript
// worker-airtrust/src/routes/funcionarios.ts
SELECT
  id, matricula, nome, cpf, email, telefone,
  cargo, setor,  -- ⚠️ setor causa erro em prod
  funcao, codigo_anac, ativo,
  is_instrutor, is_checador,
  created_at, updated_at
FROM funcionarios
WHERE deleted_at IS NULL
  AND setor = ?  -- ⚠️ Filtro também causa erro
ORDER BY setor, nome  -- ⚠️ Ordenação causa erro
```

---

### 4.2 Módulo: Qualificações

#### Tabela: `qualificacoes_tipos` (Catálogo)

```sql
Colunas:
  - id: INTEGER PK AUTOINCREMENT
  - nome: TEXT NOT NULL UNIQUE
  - codigo: TEXT NOT NULL UNIQUE
  - categoria: TEXT NOT NULL
  - descricao: TEXT
  - validade_meses: INTEGER DEFAULT 12
  - obrigatoria: INTEGER (0/1)     -- ⚠️ Schema: obrigatoria, Query: ativo
  - created_at: TEXT
  - updated_at: TEXT
  - deleted_at: TEXT

Índices:
  - idx_qualificacoes_tipos_codigo (WHERE deleted_at IS NULL)
  - idx_qualificacoes_tipos_categoria (WHERE deleted_at IS NULL)

Constraints:
  - UNIQUE(nome)
  - UNIQUE(codigo)

Exemplos de Dados:
  - PPA: Piloto Privado de Avião
  - PLA: Piloto de Linha Aérea
  - MLTE: Multi-Engine Land
  - INVA: Inglês Nível A
```

**Problema de Nomenclatura**:

```sql
-- Schema migration:
obrigatoria INTEGER DEFAULT 0

-- Código worker:
SELECT
  CASE WHEN ativo = 1 THEN 1 ELSE 0 END AS obrigatoria
FROM qualificacoes_tipos

-- ⚠️ DIVERGÊNCIA: Schema usa 'obrigatoria', código lê 'ativo'
-- Resultado: Campo sempre NULL ou 0
```

#### Tabela: `qualificacoes_historico` (Por Funcionário)

```sql
Schema Esperado:
  - id: INTEGER PK
  - funcionario_id: INTEGER FK → funcionarios(id)
  - qualificacao_id: INTEGER FK → qualificacoes_tipos(id)
  - data_obtencao: TEXT
  - data_validade: TEXT
  - status: TEXT (VALIDA, VENCIDA, PROXIMA_VENCIMENTO)
  - certificado_url: TEXT
  - observacoes: TEXT
  - created_at, updated_at, deleted_at

Schema Real (Dados Importados):
  - id: INTEGER PK
  - funcionario_id: TEXT (matrícula, não FK)
  - qualificacao_id: TEXT ou NULL
  - nome: TEXT (nome da qualificação)
  - codigo: TEXT ou NULL
  - data_conclusao: TEXT
  - data_vencimento: TEXT (não data_validade)
  - status: TEXT (mas sempre 'MIGRADO')
  - observacoes: TEXT
  - created_at, updated_at, deleted_at

Índices:
  - idx_qualificacoes_historico_func (funcionario_id, deleted_at)
  - idx_qualificacoes_historico_qual (qualificacao_id, deleted_at)
  - idx_qualificacoes_historico_status (status, deleted_at)
  - idx_qualificacoes_historico_validade (data_validade, deleted_at)
```

**Problemas Graves**:

1. **FK não funcional**:

```sql
-- Schema define:
FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)

-- Dados reais usam:
funcionario_id = 'MAT001' (TEXT)

-- Resultado: FK não valida nada
```

2. **Campos Renomeados**:

```yaml
Schema: data_obtencao, data_validade
Dados: data_conclusao, data_vencimento
Código: Trata ambos (OR logic)
```

3. **Status Hardcoded**:

```yaml
Antes: status = 'MIGRADO' (fixo)
Agora: Calculado dinamicamente em query:
  CASE
    WHEN julianday(data_vencimento) < julianday('now') THEN 'VENCIDA'
    WHEN ... <= 30 THEN 'PROXIMA_VENCIMENTO'
    ELSE 'VALIDA'
  END
```

4. **Código NULL**:

```yaml
Problema: 80% dos registros sem codigo
Solução: Subquery para buscar de qualificacoes_tipos:
  COALESCE(
    qh.codigo,
    (SELECT codigo FROM qualificacoes_tipos
     WHERE nome = qh.nome LIMIT 1)
  ) as codigo
```

---

### 4.3 Módulo: Simuladores

#### Tabela: `simuladores`

```sql
Colunas:
  - id: INTEGER PK
  - modelo: TEXT NOT NULL
  - fabricante: TEXT NOT NULL
  - tipo: TEXT NOT NULL
  - codigo: TEXT NOT NULL UNIQUE
  - ativo: INTEGER (0/1)
  - observacoes: TEXT
  - created_at, updated_at, deleted_at

Índices:
  - idx_simuladores_codigo (WHERE deleted_at IS NULL)
  - idx_simuladores_ativo (WHERE deleted_at IS NULL)

Constraints:
  - UNIQUE(codigo)

Exemplos:
  - SIM-A320-001: Airbus A320 Full Flight Simulator
  - SIM-B737-002: Boeing 737 Procedure Trainer
```

#### Tabela: `sessoes_simulador`

```sql
Colunas:
  - id: INTEGER PK
  - simulador_id: INTEGER FK → simuladores(id)
  - instrutor_id: INTEGER FK → funcionarios(id)
  - checador_id: INTEGER FK → funcionarios(id)
  - data_sessao: TEXT (ISO datetime)
  - duracao_minutos: INTEGER
  - tipo_sessao: TEXT (TREINAMENTO, AVALIACAO, PROFICIENCIA)
  - status: TEXT (AGENDADA, EM_ANDAMENTO, CONCLUIDA, CANCELADA)
  - observacoes: TEXT
  - created_at, updated_at, deleted_at

Índices:
  - idx_sessoes_simulador_sim (simulador_id, deleted_at)
  - idx_sessoes_simulador_data (data_sessao, deleted_at)
  - idx_sessoes_simulador_status (status, deleted_at)

Constraints:
  - FK simulador_id → simuladores(id)
  - FK instrutor_id → funcionarios(id)
  - FK checador_id → funcionarios(id)
```

#### Tabela: `participantes_sessao` (N:M)

```sql
Colunas:
  - id: INTEGER PK
  - sessao_id: INTEGER FK → sessoes_simulador(id)
  - funcionario_id: INTEGER FK → funcionarios(id)
  - funcao: TEXT (PILOTO, COPILOTO, OBSERVADOR)
  - created_at: TEXT

Índices:
  - idx_participantes_sessao_sessao (sessao_id)
  - idx_participantes_sessao_func (funcionario_id)

Constraints:
  - FK sessao_id → sessoes_simulador(id)
  - FK funcionario_id → funcionarios(id)
```

---

### 4.4 Módulo: Autenticação

#### Tabela: `usuarios`

```sql
Colunas:
  - id: INTEGER PK
  - email: TEXT UNIQUE NOT NULL
  - senha_hash: TEXT NOT NULL (bcrypt)
  - nome: TEXT NOT NULL
  - role: TEXT CHECK(role IN ('admin', 'manager', 'user'))
  - ativo: INTEGER (0/1)
  - created_at, updated_at, deleted_at

Índices:
  - idx_usuarios_email
  - idx_usuarios_role
  - idx_usuarios_ativo
  - idx_usuarios_deleted

Constraints:
  - UNIQUE(email)
  - CHECK(role IN (...))

⚠️ PROBLEMA: Sem seed em produção
- Tabela vazia
- Não há usuário admin
- Login impossível até popular
```

#### Tabela: `refresh_tokens`

```sql
Colunas:
  - id: INTEGER PK
  - user_id: INTEGER FK → usuarios(id)
  - token: TEXT UNIQUE (UUID)
  - created_at: TEXT
  - expires_at: TEXT
  - revoked_at: TEXT (NULL = ativo)

Índices:
  - idx_refresh_tokens_user (user_id)
  - idx_refresh_tokens_token (token)
  - idx_refresh_tokens_expires (expires_at)

Constraints:
  - UNIQUE(token)
  - FK user_id → usuarios(id)
```

---

### 4.5 Módulo: Auditoria

#### Tabela: `audit_logs`

```sql
Colunas:
  - id: INTEGER PK
  - user_id: INTEGER (FK opcional)
  - action: TEXT NOT NULL (CREATE, UPDATE, DELETE)
  - resource: TEXT NOT NULL (funcionarios, qualificacoes, etc)
  - resource_id: INTEGER
  - details: TEXT (JSON)
  - ip_address: TEXT
  - user_agent: TEXT
  - timestamp: TEXT DEFAULT (datetime('now'))

Índices:
  - idx_audit_logs_user (user_id)
  - idx_audit_logs_resource (resource, resource_id)
  - idx_audit_logs_timestamp (timestamp)

Uso:
  INSERT INTO audit_logs (user_id, action, resource, resource_id, details)
  VALUES (1, 'UPDATE', 'funcionarios', 123, '{"old": {...}, "new": {...}}');
```

---

## 5. RELACIONAMENTOS

### 5.1 Funcionários ↔ Qualificações

```yaml
Tipo: 1:N
Tabelas: funcionarios → qualificacoes_historico

Schema Ideal: funcionarios.id → qualificacoes_historico.funcionario_id (INTEGER FK)

Realidade: funcionarios.matricula → qualificacoes_historico.funcionario_id (TEXT)
  ❌ Sem FK real, relação via LEFT JOIN em TEXT

Query: LEFT JOIN funcionarios f ON qh.funcionario_id = f.matricula
```

### 5.2 Qualificações Tipos ↔ Histórico

```yaml
Tipo: 1:N
Tabelas: qualificacoes_tipos → qualificacoes_historico

Schema Ideal: qualificacoes_tipos.id → qualificacoes_historico.qualificacao_id (INTEGER FK)

Realidade: qualificacoes_historico.qualificacao_id = NULL
  qualificacoes_historico.nome = 'Examinador Credenciado - Solo'
  ❌ Relação via nome textual (subquery)

Query: (SELECT codigo FROM qualificacoes_tipos
  WHERE nome = qh.nome LIMIT 1) as codigo
```

### 5.3 Simuladores ↔ Sessões

```yaml
Tipo: 1:N
Tabelas: simuladores → sessoes_simulador

FK Real: simuladores.id → sessoes_simulador.simulador_id (INTEGER FK)
  ✅ FUNCIONA CORRETAMENTE

Query: LEFT JOIN simuladores s ON sess.simulador_id = s.id
```

### 5.4 Funcionários ↔ Sessões (N:M)

```yaml
Tipo: N:M (via tabela intermediária)
Tabelas: funcionarios ↔ participantes_sessao ↔ sessoes_simulador

FK Real: funcionarios.id → participantes_sessao.funcionario_id
  sessoes_simulador.id → participantes_sessao.sessao_id
  ✅ FUNCIONA CORRETAMENTE

Query: SELECT f.nome, s.data_sessao, p.funcao
  FROM funcionarios f
  JOIN participantes_sessao p ON f.id = p.funcionario_id
  JOIN sessoes_simulador s ON p.sessao_id = s.id
```

### 5.5 Usuários ↔ Refresh Tokens

```yaml
Tipo: 1:N
Tabelas: usuarios → refresh_tokens

FK Real: usuarios.id → refresh_tokens.user_id (INTEGER FK)
  ✅ FUNCIONA CORRETAMENTE

Query: DELETE FROM refresh_tokens WHERE user_id = ? AND token = ?
```

---

## 6. ÍNDICES E PERFORMANCE

### 6.1 Índices Existentes

```sql
-- FUNCIONARIOS (4 índices)
CREATE INDEX idx_funcionarios_matricula ON funcionarios(matricula) WHERE deleted_at IS NULL;
CREATE INDEX idx_funcionarios_cpf ON funcionarios(cpf) WHERE deleted_at IS NULL;
CREATE INDEX idx_funcionarios_ativo ON funcionarios(ativo) WHERE deleted_at IS NULL;
CREATE INDEX idx_funcionarios_deleted ON funcionarios(deleted_at);

-- QUALIFICACOES_TIPOS (2 índices)
CREATE INDEX idx_qualificacoes_tipos_codigo ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_tipos_categoria ON qualificacoes_tipos(categoria) WHERE deleted_at IS NULL;

-- QUALIFICACOES_HISTORICO (4 índices)
CREATE INDEX idx_qualificacoes_historico_func ON qualificacoes_historico(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_qual ON qualificacoes_historico(qualificacao_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_status ON qualificacoes_historico(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_validade ON qualificacoes_historico(data_validade) WHERE deleted_at IS NULL;

-- SIMULADORES (2 índices)
CREATE INDEX idx_simuladores_codigo ON simuladores(codigo) WHERE deleted_at IS NULL;
CREATE INDEX idx_simuladores_ativo ON simuladores(ativo) WHERE deleted_at IS NULL;

-- SESSOES_SIMULADOR (3 índices)
CREATE INDEX idx_sessoes_simulador_sim ON sessoes_simulador(simulador_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sessoes_simulador_data ON sessoes_simulador(data_sessao) WHERE deleted_at IS NULL;
CREATE INDEX idx_sessoes_simulador_status ON sessoes_simulador(status) WHERE deleted_at IS NULL;

-- PARTICIPANTES_SESSAO (2 índices)
CREATE INDEX idx_participantes_sessao_sessao ON participantes_sessao(sessao_id);
CREATE INDEX idx_participantes_sessao_func ON participantes_sessao(funcionario_id);

-- USUARIOS (4 índices)
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_role ON usuarios(role);
CREATE INDEX idx_usuarios_ativo ON usuarios(ativo);
CREATE INDEX idx_usuarios_deleted ON usuarios(deleted_at);

-- REFRESH_TOKENS (3 índices)
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- AUDIT_LOGS (3 índices)
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource, resource_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
```

### 6.2 Índices Faltando (Performance)

```sql
-- ⚠️ RECOMENDADO: Índice composto para queries comuns

-- Funcionários por setor + status
CREATE INDEX idx_funcionarios_setor_status
ON funcionarios(setor, ativo)
WHERE deleted_at IS NULL;

-- Qualificações por status + data vencimento
CREATE INDEX idx_qualificacoes_status_venc
ON qualificacoes_historico(status, data_vencimento)
WHERE deleted_at IS NULL;

-- Sessões por simulador + data
CREATE INDEX idx_sessoes_sim_data
ON sessoes_simulador(simulador_id, data_sessao)
WHERE deleted_at IS NULL;

-- Histórico: nome (para subquery)
CREATE INDEX idx_qualificacoes_historico_nome
ON qualificacoes_historico(nome)
WHERE deleted_at IS NULL;
```

---

## 7. DIVERGÊNCIAS SCHEMA VS CÓDIGO

### 7.1 Funcionários

| Campo    | Schema        | Código                | Produção      | Status     |
| -------- | ------------- | --------------------- | ------------- | ---------- |
| `setor`  | TEXT NOT NULL | Usado em SELECT/WHERE | ❌ Não existe | 🔴 CRÍTICO |
| `cargo`  | TEXT NOT NULL | Usado                 | ✅ Existe     | ✅ OK      |
| `funcao` | TEXT          | Usado                 | ✅ Existe     | ✅ OK      |

**Problema**: Migration 0001 define `setor` mas coluna não existe em produção

### 7.2 Qualificações Tipos

| Campo         | Schema        | Código               | Produção        | Status         |
| ------------- | ------------- | -------------------- | --------------- | -------------- |
| `obrigatoria` | INTEGER       | ❌ Não usado         | ✅ Existe       | ⚠️ Divergência |
| `ativo`       | ❌ Não existe | Usado (SELECT ativo) | ❓ Desconhecido | ⚠️ Problema    |

**Problema**: Código lê `ativo`, schema define `obrigatoria`

### 7.3 Qualificações Histórico

| Campo             | Schema        | Código            | Dados Reais    | Status         |
| ----------------- | ------------- | ----------------- | -------------- | -------------- |
| `funcionario_id`  | INTEGER FK    | TEXT (matricula)  | TEXT           | 🔴 FK quebrado |
| `qualificacao_id` | INTEGER FK    | NULL ou TEXT      | NULL           | 🔴 FK quebrado |
| `nome`            | ❌ Não existe | Usado             | TEXT           | ⚠️ Legacy      |
| `codigo`          | ❌ Não existe | Usado             | TEXT ou NULL   | ⚠️ Legacy      |
| `data_obtencao`   | TEXT          | `data_conclusao`  | TEXT           | ⚠️ Renomeado   |
| `data_validade`   | TEXT          | `data_vencimento` | TEXT           | ⚠️ Renomeado   |
| `status`          | TEXT          | Calculado         | 'MIGRADO' fixo | ⚠️ Hardcoded   |

**Problema**: Schema normalizado, dados legados não normalizados

---

## 8. PROBLEMAS CONHECIDOS

### 8.1 Críticos

#### 🔴 1. Coluna `setor` Faltando

```yaml
Problema: funcionarios.setor definida em schema mas não existe em produção
Causa: Migration 0001 pode ter sido aplicada sem essa coluna
Erro: D1_ERROR: no such column: setor
Impacto: GET /api/funcionarios retorna HTTP 500
Solução: Aplicar migration 0006_add_missing_columns.sql
Status: ⚠️ URGENTE
Comando:
  wrangler d1 execute airtrust-db --env=production \
    --file=./migrations/0006_add_missing_columns.sql
```

#### 🔴 2. FK Quebradas em Qualificações

```yaml
Problema: qualificacoes_historico sem FK funcionais
Detalhes:
  - funcionario_id deveria ser INTEGER FK
  - Dados reais usam TEXT (matrícula)
  - qualificacao_id deveria ser INTEGER FK
  - Dados reais são NULL (relação via nome)

Impacto:
  - Integridade referencial não funciona
  - Cascading deletes não funcionam
  - Queries complexas (subqueries, LEFT JOIN em TEXT)
  - Performance ruim (sem otimização de FK)

Solução Ideal:
  1. Normalizar dados:
     - Criar FK reais
     - Migrar funcionario_id TEXT → INTEGER
     - Migrar nome → qualificacao_id INTEGER
  2. Criar migration de transformação
  3. Manter compatibilidade com queries antigas

Solução Atual (Workaround):
  - LEFT JOIN em TEXT (funcionario_id = matricula)
  - Subquery para buscar codigo por nome
  - LIMIT 1 para evitar duplicação

Status: ⚠️ WORKAROUND EM USO, REFACTOR FUTURO
```

#### 🔴 3. Tabela usuarios Vazia

```yaml
Problema: usuarios criada mas sem seed em produção
Impacto: Impossível fazer login (sem usuários)
Seeds existem: 0004_seed_usuarios.sql
Status: ❌ NÃO APLICADO EM PRODUÇÃO

Solução: wrangler d1 execute airtrust-db --env=production \
  --file=./migrations/0004_seed_usuarios.sql

Ou criar manualmente: INSERT INTO usuarios (email, senha_hash, nome, role, ativo)
  VALUES (
  'admin@airtrust.com',
  '$2a$10$...', -- bcrypt de senha segura
  'Administrador',
  'admin',
  1
  );
```

### 8.2 Médios

#### 🟡 1. Campo `ativo` vs `obrigatoria`

```yaml
Problema: Divergência de nomenclatura
Schema: obrigatoria INTEGER
Código: SELECT ativo AS obrigatoria

Impacto:
  - Confusão semântica
  - Campo sempre NULL ou incorreto

Solução: 1. Decidir campo oficial (ativo ou obrigatoria)
  2. Atualizar schema OU código para consistência
  3. Adicionar migration se necessário
```

#### 🟡 2. Datas com Nomes Diferentes

```yaml
Problema: data_obtencao vs data_conclusao, data_validade vs data_vencimento
Causa: Migração de sistema legado
Código: Trata ambos (OR logic)

Solução Atual: COALESCE(qh.data_obtencao, qh.data_conclusao) as data_conclusao

Solução Ideal:
  - Padronizar nomes
  - Migration para renomear colunas
  - Atualizar código para usar apenas um nome
```

#### 🟡 3. Índices Não Otimizados

```yaml
Problema: Faltam índices compostos para queries comuns
Impacto: Queries lentas com 1000+ registros

Queries lentas:
  1. Funcionários por setor + status
  2. Qualificações por status + vencimento
  3. Histórico: busca por nome (subquery)

Solução: Adicionar índices compostos (ver seção 6.2)
```

### 8.3 Baixos

#### 🟢 1. Soft Delete Inconsistente

```yaml
Problema: Alguns códigos checam deleted_at, outros não
Impacto: Registros "deletados" podem aparecer

Solução: Sempre usar WHERE deleted_at IS NULL
Padrão: Criar views automáticas ou helper function
```

#### 🟢 2. Timestamps em TEXT

```yaml
Problema: Datas armazenadas como TEXT, não DATE/DATETIME
Causa: SQLite não tem tipo DATE nativo
Impacto: Comparações de data usam julianday()

Status: ✅ OK (padrão SQLite)
Observação: TEXT com ISO 8601 é recomendado pelo SQLite
```

---

## 9. RESUMO EXECUTIVO

### 9.1 Estado Atual

```yaml
✅ FUNCIONANDO:
  - Tabelas criadas (funcionarios, qualificacoes, simuladores, sessoes, usuarios)
  - Índices básicos aplicados
  - Soft delete implementado
  - FK funcionando (simuladores, sessoes, usuarios)

⚠️ FUNCIONANDO COM PROBLEMAS:
  - funcionarios: Falta coluna setor
  - qualificacoes_historico: FK quebradas, schema legado
  - qualificacoes_tipos: Campo ativo vs obrigatoria
  - usuarios: Tabela vazia (sem seed)

❌ NÃO FUNCIONANDO:
  - GET /api/funcionarios (coluna setor)
  - Login (sem usuários)
  - Integridade referencial em qualificações
```

### 9.2 Migrations Pendentes

```yaml
URGENTE: 1. 0006_add_missing_columns.sql (coluna setor)
  2. 0004_seed_usuarios.sql (popular usuários)

RECOMENDADO: 3. Criar migration para normalizar qualificacoes_historico
  4. Adicionar índices compostos (performance)
  5. Padronizar nomes de colunas (data_*)
```

### 9.3 Prioridades de Correção

```yaml
FAZER AGORA: 1. Aplicar migration 0006 (setor)
  2. Popular tabela usuarios (seed ou manual)
  3. Testar GET /api/funcionarios após migration

FAZER EM BREVE: 4. Normalizar qualificacoes_historico
  5. Adicionar índices compostos
  6. Criar seeds para tipos de qualificações

BACKLOG: 7. Documentar schema completo
  8. Criar ERD visual
  9. Implementar views para soft delete
  10. Migrar para schema normalizado completo
```

---

**Próximo Relatório**: FASE22-PARTE4-FLUXOS-E-INTEGRACAO.md

**Gerado em**: 15/11/2025  
**Autor**: GitHub Copilot - Auditor de Arquitetura

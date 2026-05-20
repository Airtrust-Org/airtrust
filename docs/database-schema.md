# 📊 DATABASE SCHEMAS - AIRTRUST

**Última atualização:** 24/10/2025  
**Banco:** D1 (SQLite)  
**Ambiente:** Produção

---

## 🎯 GUIA RÁPIDO

### ⚠️ COLUNAS PROBLEMÁTICAS (EVITAR)

| ❌ Errado | ✅ Correto | Tabela |
|-----------|-----------|--------|
| `a.data` | `a.data_agendamento` | agendamentos_simulador |
| `template_id` | ❌ Não existe | agendamentos_simulador |
| `instrutor` | `instrutor_id` | agendamentos_simulador |
| `certificado_url` | `arquivo_url` | pasta_virtual |

---

## 📋 TABELAS PRINCIPAIS

### 1. funcionarios

```sql
CREATE TABLE funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  funcao TEXT,
  setor TEXT,
  status TEXT DEFAULT 'ATIVO',
  is_instrutor INTEGER DEFAULT 0,
  is_checador INTEGER DEFAULT 0,
  email TEXT,
  telefone TEXT,
  data_admissao DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

**Colunas principais:**
- `id` - ID único (INTEGER)
- `matricula` - Matrícula única (5 dígitos: 00001)
- `nome` - Nome completo
- `funcao` - Função/cargo
- `setor` - Setor de trabalho
- `status` - ATIVO | INATIVO
- `is_instrutor` - 0 | 1 (flag booleana)
- `is_checador` - 0 | 1 (flag booleana)

**Índices:**
```sql
CREATE INDEX idx_funcionarios_matricula ON funcionarios(matricula);
CREATE INDEX idx_funcionarios_status ON funcionarios(status);
```

**Uso comum:**
```sql
-- Buscar funcionário por matrícula
SELECT id, nome, funcao, status 
FROM funcionarios 
WHERE matricula = ? AND deleted_at IS NULL;

-- Listar instrutores ativos
SELECT id, nome, matricula 
FROM funcionarios 
WHERE is_instrutor = 1 AND status = 'ATIVO' AND deleted_at IS NULL;
```

---

### 2. qualificacoes

```sql
CREATE TABLE qualificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT,
  data_conclusao DATE,
  data_validade DATE,
  certificado_url TEXT,
  instrutor TEXT,
  nota_final REAL,
  status TEXT DEFAULT 'VALIDA',
  is_renovada INTEGER DEFAULT 0,
  qualificacao_anterior_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_anterior_id) REFERENCES qualificacoes(id)
);
```

**Colunas principais:**
- `id` - ID único
- `funcionario_id` - FK para funcionarios
- `tipo` - Tipo (TREINAMENTO, CHECK, EXAME)
- `codigo` - Código da qualificação (ex: CMA, ASO, CHT-IFR)
- `nome` - Nome descritivo
- `data_conclusao` - Data de conclusão
- `data_validade` - Data de vencimento
- `certificado_url` - URL do certificado (Cloudflare R2)
- `status` - VALIDA | VENCIDA | VENCENDO | RENOVADA
- `is_renovada` - 0 | 1 (se foi renovada)
- `qualificacao_anterior_id` - FK para qualificação que foi renovada

**Índices:**
```sql
CREATE INDEX idx_qualificacoes_funcionario ON qualificacoes(funcionario_id);
CREATE INDEX idx_qualificacoes_codigo ON qualificacoes(codigo);
CREATE INDEX idx_qualificacoes_validade ON qualificacoes(data_validade);
```

**Uso comum:**
```sql
-- Buscar qualificações de um funcionário
SELECT id, codigo, nome, data_validade, status, certificado_url
FROM qualificacoes 
WHERE funcionario_id = ? AND deleted_at IS NULL
ORDER BY data_validade DESC;

-- Buscar qualificações vencendo (próximos 30 dias)
SELECT q.id, q.codigo, f.nome as funcionario_nome, q.data_validade
FROM qualificacoes q
JOIN funcionarios f ON q.funcionario_id = f.id
WHERE q.deleted_at IS NULL 
  AND julianday(q.data_validade) - julianday('now') BETWEEN 0 AND 30;
```

---

### 3. agendamentos_simulador

```sql
CREATE TABLE agendamentos_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  simulador_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  data_agendamento TEXT NOT NULL,  -- ⚠️ NÃO usar "data"
  hora_inicio TEXT NOT NULL,
  hora_fim TEXT NOT NULL,
  status TEXT DEFAULT 'AGENDADO',
  tipo_sessao TEXT,
  instrutor_id INTEGER,
  observacoes TEXT,
  resultado TEXT,
  nota REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (simulador_id) REFERENCES simuladores(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id)
);
```

**⚠️ IMPORTANTE:**
- Usar `data_agendamento` (NÃO `data`)
- Usar `instrutor_id` (NÃO `instrutor`)
- NÃO existe coluna `template_id`

**Colunas principais:**
- `id` - ID único
- `simulador_id` - FK para simuladores
- `funcionario_id` - FK para funcionario sendo treinado
- `data_agendamento` - Data do agendamento (TEXT: YYYY-MM-DD)
- `hora_inicio` - Hora início (TEXT: HH:MM)
- `hora_fim` - Hora fim (TEXT: HH:MM)
- `status` - AGENDADO | CONFIRMADO | CANCELADO | REALIZADO | FALTA
- `tipo_sessao` - TREINAMENTO | CHECK | AVALIACAO | PRATICA
- `instrutor_id` - FK para funcionario instrutor

**Índices:**
```sql
CREATE INDEX idx_agendamentos_simulador_data ON agendamentos_simulador(data_agendamento);
CREATE INDEX idx_agendamentos_funcionario ON agendamentos_simulador(funcionario_id);
CREATE INDEX idx_agendamentos_simulador_id ON agendamentos_simulador(simulador_id);
```

**Uso comum:**
```sql
-- Listar agendamentos
SELECT 
  a.id, a.simulador_id, a.instrutor_id, a.funcionario_id,
  a.data_agendamento as data,
  a.hora_inicio, a.hora_fim, a.tipo_sessao, a.status,
  a.observacoes, a.resultado, a.nota,
  s.nome as simulador_nome,
  f.nome as instrutor_nome,
  func.nome as funcionario_nome
FROM agendamentos_simulador a
LEFT JOIN simuladores s ON a.simulador_id = s.id
LEFT JOIN funcionarios f ON a.instrutor_id = f.id
LEFT JOIN funcionarios func ON a.funcionario_id = func.id
WHERE a.deleted_at IS NULL
ORDER BY a.data_agendamento DESC, a.hora_inicio DESC;
```

---

### 4. simuladores

```sql
CREATE TABLE simuladores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  modelo TEXT,
  fabricante TEXT,
  numero_serie TEXT,
  status TEXT DEFAULT 'ATIVO',
  localizacao TEXT,
  observacoes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

**Colunas principais:**
- `id` - ID único
- `nome` - Nome do simulador
- `modelo` - Modelo do equipamento
- `fabricante` - Fabricante
- `status` - ATIVO | INATIVO | MANUTENCAO

**Uso comum:**
```sql
-- Listar simuladores ativos
SELECT id, nome, modelo, status
FROM simuladores
WHERE deleted_at IS NULL AND status = 'ATIVO'
ORDER BY nome;
```

---

### 5. manobras

```sql
CREATE TABLE manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  nivel_dificuldade INTEGER,
  tempo_estimado INTEGER,
  pontuacao_maxima REAL,
  status TEXT DEFAULT 'ATIVA',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

**Colunas principais:**
- `id` - ID único
- `codigo` - Código único da manobra
- `nome` - Nome da manobra
- `categoria` - Categoria (BASICA, INTERMEDIARIA, AVANCADA)
- `nivel_dificuldade` - 1-5
- `pontuacao_maxima` - Pontuação máxima possível

---

## 🔍 QUERIES COMUNS

### Buscar Funcionário com Qualificações

```sql
SELECT 
  f.id,
  f.matricula,
  f.nome,
  f.funcao,
  COUNT(q.id) as total_qualificacoes,
  SUM(CASE WHEN q.status = 'VALIDA' THEN 1 ELSE 0 END) as qualificacoes_validas,
  SUM(CASE WHEN q.status = 'VENCIDA' THEN 1 ELSE 0 END) as qualificacoes_vencidas
FROM funcionarios f
LEFT JOIN qualificacoes q ON f.id = q.funcionario_id AND q.deleted_at IS NULL
WHERE f.deleted_at IS NULL
GROUP BY f.id, f.matricula, f.nome, f.funcao;
```

### Dashboard de Compliance

```sql
SELECT 
  COUNT(DISTINCT f.id) as total_funcionarios,
  COUNT(DISTINCT CASE WHEN q.status = 'VALIDA' THEN f.id END) as funcionarios_compliance,
  COUNT(q.id) as total_qualificacoes,
  SUM(CASE WHEN q.status = 'VALIDA' THEN 1 ELSE 0 END) as qualificacoes_validas,
  SUM(CASE WHEN q.status = 'VENCIDA' THEN 1 ELSE 0 END) as qualificacoes_vencidas,
  SUM(CASE WHEN julianday(q.data_validade) - julianday('now') BETWEEN 0 AND 30 THEN 1 ELSE 0 END) as qualificacoes_vencendo
FROM funcionarios f
LEFT JOIN qualificacoes q ON f.id = q.funcionario_id AND q.deleted_at IS NULL
WHERE f.deleted_at IS NULL AND f.status = 'ATIVO';
```

---

## 🚨 ERROS COMUNS E SOLUÇÕES

### Erro: "no such column: a.data"
```sql
-- ❌ ERRADO
SELECT a.data FROM agendamentos_simulador a

-- ✅ CORRETO
SELECT a.data_agendamento as data FROM agendamentos_simulador a
```

### Erro: "no such column: template_id"
```sql
-- ❌ ERRADO
SELECT a.template_id FROM agendamentos_simulador a

-- ✅ CORRETO
-- Esta coluna não existe na tabela agendamentos_simulador
-- Remover do SELECT
```

### Erro: Qualificações sem certificado aparecem
```sql
-- ❌ ERRADO
SELECT * FROM qualificacoes WHERE funcionario_id = ?

-- ✅ CORRETO
SELECT * FROM qualificacoes 
WHERE funcionario_id = ? 
  AND certificado_url IS NOT NULL 
  AND certificado_url != ''
```

---

## 📝 CONVENÇÕES

### Soft Delete
Todas as tabelas principais usam `deleted_at`:
```sql
-- Sempre adicionar na WHERE
WHERE deleted_at IS NULL
```

### Timestamps
```sql
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP
deleted_at TIMESTAMP
```

### Status
Usar UPPERCASE para valores de status:
```sql
status TEXT DEFAULT 'ATIVO'
-- Valores: ATIVO, INATIVO, CANCELADO, etc
```

### Foreign Keys
Sempre usar sufixo `_id`:
```sql
funcionario_id INTEGER NOT NULL
simulador_id INTEGER NOT NULL
```

---

## 🔗 REFERÊNCIAS

- **Migrations:** `/migrations/`
- **API Endpoints:** `/src/worker/api/v2/`
- **Validação:** `/scripts/validate-schemas.sh`

---

**Última revisão:** 24/10/2025  
**Mantido por:** Equipe AirTrust

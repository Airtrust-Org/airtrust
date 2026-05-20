# 🗄️ SCHEMA COMPLETO DO BANCO DE DADOS D1 - AIRTRUST v2
## Estrutura SQL Detalhada com Todas as Tabelas

**Data**: 4 de Novembro de 2025  
**Database**: Cloudflare D1 (SQLite)  
**Versão**: 2.2

---

## 📋 ÍNDICE DE TABELAS

1. **habilitacoes** - Qualificações de voo dos pilotos
2. **qualificacoes** - Tipos de qualificações disponíveis
3. **categorias_qualificacoes** - Categorias de qualificações
4. **funcionarios** - Dados dos pilotos/crew
5. **certificados** - Documentos PDF/JPG dos certificados
6. **treinamentos** - Cursos realizados
7. **agendamentos** - Agendamentos de simulador
8. **fichas_simulador** - Fichas de sessões de simulador
9. **manobras** - Manobras de voo
10. **template_manobras** - Templates de manobras
11. **empresas** - Cadastro de companhias aéreas
12. **aeronaves** - Cadastro de aeronaves
13. **usuarios** - Usuários do sistema
14. **auditoria_logs** - Log de todas operações
15. **backup_status** - Status de backups

---

## 🔑 TABELA: habilitacoes

**Descrição**: Qualificações de voo atribuídas a cada piloto  
**Importância**: ⭐⭐⭐⭐⭐ CRÍTICA

### SQL DDL

```sql
CREATE TABLE habilitacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id INTEGER NOT NULL,
  data_conclusao DATE NOT NULL,
  data_vencimento DATE NOT NULL,
  resultado TEXT NOT NULL CHECK(resultado IN ('PENDENTE', 'APROVADO', 'REPROVADO')),
  observacoes TEXT,
  certificado_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes(id)
);

CREATE INDEX idx_habilitacoes_deleted_at ON habilitacoes(deleted_at);
CREATE INDEX idx_habilitacoes_funcionario_id ON habilitacoes(funcionario_id);
CREATE INDEX idx_habilitacoes_qualificacao_id ON habilitacoes(qualificacao_id);
CREATE INDEX idx_habilitacoes_vencimento ON habilitacoes(data_vencimento);
```

### Colunas

| Nome | Tipo | Constraints | Descrição |
|------|------|-------------|-----------|
| id | INTEGER | PK, AI | Identificador único |
| funcionario_id | INTEGER | FK, NOT NULL | Referência ao funcionário |
| qualificacao_id | INTEGER | FK, NOT NULL | Referência à qualificação |
| data_conclusao | DATE | NOT NULL | Data de conclusão do curso |
| data_vencimento | DATE | NOT NULL | Data de vencimento |
| resultado | TEXT | CHECK, NOT NULL | PENDENTE/APROVADO/REPROVADO |
| observacoes | TEXT | Optional | Observações adicionais |
| certificado_url | TEXT | Optional | URL do PDF no R2 |
| created_at | TIMESTAMP | DEFAULT | Data de criação |
| updated_at | TIMESTAMP | DEFAULT | Data de atualização |
| deleted_at | TIMESTAMP | Optional | Soft delete (NULL = ativo) |

### Exemplos de Dados

```sql
INSERT INTO habilitacoes 
  (funcionario_id, qualificacao_id, data_conclusao, data_vencimento, resultado, observacoes)
VALUES 
  (123, 5, '2024-01-15', '2025-01-15', 'APROVADO', 'Aprovado com excelência');

INSERT INTO habilitacoes 
  (funcionario_id, qualificacao_id, data_conclusao, data_vencimento, resultado)
VALUES 
  (124, 6, '2024-11-04', '2025-11-04', 'APROVADO');
```

### Queries Comuns

```sql
-- Habilitações válidas de um piloto
SELECT h.* FROM habilitacoes h
WHERE h.funcionario_id = 123 
  AND h.deleted_at IS NULL
  AND h.data_vencimento > CURRENT_DATE;

-- Habilitações vencendo em 30 dias
SELECT h.*, f.nome, q.nome as qualificacao
FROM habilitacoes h
JOIN funcionarios f ON h.funcionario_id = f.id
JOIN qualificacoes q ON h.qualificacao_id = q.id
WHERE h.deleted_at IS NULL
  AND h.data_vencimento BETWEEN CURRENT_DATE AND DATE('now', '+30 days');

-- Contar por status
SELECT 
  COUNT(CASE WHEN data_vencimento > CURRENT_DATE THEN 1 END) as valido,
  COUNT(CASE WHEN data_vencimento <= CURRENT_DATE THEN 1 END) as vencido
FROM habilitacoes
WHERE deleted_at IS NULL;
```

---

## 🔑 TABELA: qualificacoes

**Descrição**: Tipos de qualificações disponíveis (PIC, CRM, etc)  
**Importância**: ⭐⭐⭐⭐⭐ CRÍTICA

### SQL DDL

```sql
CREATE TABLE qualificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  categoria_id INTEGER NOT NULL,
  descricao TEXT,
  validade_meses INTEGER NOT NULL DEFAULT 12,
  ativo BOOLEAN NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  FOREIGN KEY (categoria_id) REFERENCES categorias_qualificacoes(id)
);

CREATE INDEX idx_qualificacoes_deleted_at ON qualificacoes(deleted_at);
CREATE INDEX idx_qualificacoes_categoria_id ON qualificacoes(categoria_id);
CREATE INDEX idx_qualificacoes_ativo ON qualificacoes(ativo);
```

### Colunas

| Nome | Tipo | Constraints | Descrição |
|------|------|-------------|-----------|
| id | INTEGER | PK, AI | Identificador único |
| codigo | TEXT | UNIQUE, NOT NULL | Código único (ex: PIC-A320) |
| nome | TEXT | NOT NULL | Nome descritivo |
| categoria_id | INTEGER | FK, NOT NULL | Categoria da qualificação |
| descricao | TEXT | Optional | Descrição detalhada |
| validade_meses | INTEGER | DEFAULT 12 | Validade em meses |
| ativo | BOOLEAN | DEFAULT 1 | Qualificação ativa/inativa |
| created_at | TIMESTAMP | DEFAULT | Data de criação |
| updated_at | TIMESTAMP | DEFAULT | Data de atualização |
| deleted_at | TIMESTAMP | Optional | Soft delete |

### Exemplos de Dados

```sql
INSERT INTO qualificacoes (codigo, nome, categoria_id, descricao, validade_meses)
VALUES 
  ('PIC-A320', 'PIC Airbus A320', 1, 'Piloto em Comando', 12),
  ('CO-A320', 'CO Airbus A320', 1, 'Co-piloto', 12),
  ('CRM', 'Crew Resource Management', 2, 'Treinamento de CRM', 24);
```

---

## 🔑 TABELA: categorias_qualificacoes

**Descrição**: Categorias/tipos de qualificações  
**Importância**: ⭐⭐⭐⭐ IMPORTANTE

### SQL DDL

```sql
CREATE TABLE categorias_qualificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Exemplos de Dados

```sql
INSERT INTO categorias_qualificacoes (nome, descricao, ordem)
VALUES 
  ('Habilitação de Tipo', 'Qualificações de aeronave (PIC, CO)', 1),
  ('Treinamentos Obrigatórios', 'CRM, LPV, etc', 2),
  ('Certificados Especiais', 'RVSM, ETOPS, etc', 3);
```

---

## 🔑 TABELA: funcionarios

**Descrição**: Dados dos pilotos e crew members  
**Importância**: ⭐⭐⭐⭐⭐ CRÍTICA

### SQL DDL

```sql
CREATE TABLE funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  matricula TEXT NOT NULL UNIQUE,
  cpf TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  telefone TEXT,
  funcao TEXT NOT NULL CHECK(funcao IN ('PILOTO', 'CO_PILOTO', 'COMISSARIO')),
  status TEXT NOT NULL DEFAULT 'ATIVO' CHECK(status IN ('ATIVO', 'INATIVO', 'FÉRIAS')),
  aeronave_principal TEXT,
  data_admissao DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  FOREIGN KEY (aeronave_principal) REFERENCES aeronaves(codigo)
);

CREATE INDEX idx_funcionarios_deleted_at ON funcionarios(deleted_at);
CREATE INDEX idx_funcionarios_status ON funcionarios(status);
CREATE INDEX idx_funcionarios_funcao ON funcionarios(funcao);
```

### Colunas

| Nome | Tipo | Constraints | Descrição |
|------|------|-------------|-----------|
| id | INTEGER | PK, AI | Identificador único |
| nome | TEXT | NOT NULL | Nome completo |
| matricula | TEXT | UNIQUE, NOT NULL | Número de matrícula |
| cpf | TEXT | UNIQUE, NOT NULL | CPF (11 dígitos) |
| email | TEXT | UNIQUE | Email corporativo |
| telefone | TEXT | Optional | Telefone de contato |
| funcao | TEXT | CHECK, NOT NULL | PILOTO/CO_PILOTO/COMISSARIO |
| status | TEXT | CHECK, DEFAULT | ATIVO/INATIVO/FÉRIAS |
| aeronave_principal | TEXT | FK, Optional | Aeronave principal |
| data_admissao | DATE | Optional | Data de admissão |
| created_at | TIMESTAMP | DEFAULT | Data de criação |
| updated_at | TIMESTAMP | DEFAULT | Data de atualização |
| deleted_at | TIMESTAMP | Optional | Soft delete |

### Exemplos de Dados

```sql
INSERT INTO funcionarios 
  (nome, matricula, cpf, email, telefone, funcao, status, aeronave_principal)
VALUES 
  ('João Silva', 'PL-001', '12345678901', 'joao@airline.com', '11999999999', 'PILOTO', 'ATIVO', 'A320'),
  ('Maria Santos', 'PL-002', '98765432109', 'maria@airline.com', '11988888888', 'CO_PILOTO', 'ATIVO', 'A320');
```

---

## 🔑 TABELA: certificados

**Descrição**: PDFs e documentos de certificados  
**Importância**: ⭐⭐⭐⭐ IMPORTANTE

### SQL DDL

```sql
CREATE TABLE certificados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habilitacao_id INTEGER NOT NULL,
  nome_arquivo TEXT NOT NULL,
  url_r2 TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('PDF', 'JPG', 'PNG')),
  tamanho_bytes INTEGER,
  hash_md5 TEXT,
  data_upload TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data_validacao TIMESTAMP,
  valido BOOLEAN DEFAULT 1,
  observacoes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  FOREIGN KEY (habilitacao_id) REFERENCES habilitacoes(id)
);

CREATE INDEX idx_certificados_deleted_at ON certificados(deleted_at);
CREATE INDEX idx_certificados_habilitacao_id ON certificados(habilitacao_id);
CREATE INDEX idx_certificados_valido ON certificados(valido);
```

### Colunas

| Nome | Tipo | Constraints | Descrição |
|------|------|-------------|-----------|
| id | INTEGER | PK, AI | Identificador único |
| habilitacao_id | INTEGER | FK, NOT NULL | Habilitação relacionada |
| nome_arquivo | TEXT | NOT NULL | Nome original do arquivo |
| url_r2 | TEXT | NOT NULL | URL no Cloudflare R2 |
| tipo | TEXT | CHECK, NOT NULL | PDF/JPG/PNG |
| tamanho_bytes | INTEGER | Optional | Tamanho em bytes |
| hash_md5 | TEXT | Optional | Hash MD5 para integridade |
| data_upload | TIMESTAMP | DEFAULT | Data do upload |
| data_validacao | TIMESTAMP | Optional | Data da validação |
| valido | BOOLEAN | DEFAULT 1 | Documento válido |
| observacoes | TEXT | Optional | Observações |
| created_at | TIMESTAMP | DEFAULT | Data de criação |
| updated_at | TIMESTAMP | DEFAULT | Data de atualização |
| deleted_at | TIMESTAMP | Optional | Soft delete |

---

## 🔑 TABELA: treinamentos

**Descrição**: Cursos e treinamentos realizados  
**Importância**: ⭐⭐⭐⭐ IMPORTANTE

### SQL DDL

```sql
CREATE TABLE treinamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  data_conclusao DATE NOT NULL,
  instrutor TEXT,
  nota DECIMAL(3,1) CHECK(nota >= 0 AND nota <= 10),
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE', 'CONCLUIDO', 'CANCELADO')),
  certificado_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX idx_treinamentos_deleted_at ON treinamentos(deleted_at);
CREATE INDEX idx_treinamentos_funcionario_id ON treinamentos(funcionario_id);
```

### Colunas

| Nome | Tipo | Constraints | Descrição |
|------|------|-------------|-----------|
| id | INTEGER | PK, AI | Identificador único |
| funcionario_id | INTEGER | FK, NOT NULL | Funcionário |
| tipo | TEXT | NOT NULL | Tipo de treinamento |
| data_conclusao | DATE | NOT NULL | Data de conclusão |
| instrutor | TEXT | Optional | Nome do instrutor |
| nota | DECIMAL | CHECK 0-10 | Nota obtida |
| status | TEXT | CHECK, DEFAULT | PENDENTE/CONCLUIDO/CANCELADO |
| certificado_url | TEXT | Optional | URL do certificado |
| created_at | TIMESTAMP | DEFAULT | Data de criação |
| updated_at | TIMESTAMP | DEFAULT | Data de atualização |
| deleted_at | TIMESTAMP | Optional | Soft delete |

---

## 🔑 TABELA: agendamentos

**Descrição**: Agendamentos de simulador  
**Importância**: ⭐⭐⭐⭐ IMPORTANTE

### SQL DDL

```sql
CREATE TABLE agendamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  simulador_id INTEGER NOT NULL,
  data DATE NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fim TEXT NOT NULL,
  instrutor_id INTEGER NOT NULL,
  checador_id INTEGER,
  participantes TEXT,
  status TEXT NOT NULL DEFAULT 'AGENDADO' 
    CHECK(status IN ('AGENDADO', 'CONCLUIDO', 'CANCELADO', 'AUSENTE')),
  tipo_sessao TEXT NOT NULL DEFAULT 'INICIAL' 
    CHECK(tipo_sessao IN ('INICIAL', 'RECORRENTE', 'CHECK', 'REFRESHER')),
  observacoes TEXT,
  resultado TEXT CHECK(resultado IN ('APROVADO', 'REPROVADO', 'SUSPENDIDO')),
  ficha_id INTEGER,
  assinatura_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  FOREIGN KEY (simulador_id) REFERENCES simuladores(id),
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id),
  FOREIGN KEY (checador_id) REFERENCES funcionarios(id),
  FOREIGN KEY (ficha_id) REFERENCES fichas_simulador(id)
);

CREATE INDEX idx_agendamentos_deleted_at ON agendamentos(deleted_at);
CREATE INDEX idx_agendamentos_data ON agendamentos(data);
CREATE INDEX idx_agendamentos_simulador_id ON agendamentos(simulador_id);
```

### Colunas

| Nome | Tipo | Constraints | Descrição |
|------|------|-------------|-----------|
| id | INTEGER | PK, AI | Identificador único |
| simulador_id | INTEGER | FK, NOT NULL | Simulador |
| data | DATE | NOT NULL | Data do agendamento |
| hora_inicio | TEXT | NOT NULL | Horário inicial (HH:MM) |
| hora_fim | TEXT | NOT NULL | Horário final (HH:MM) |
| instrutor_id | INTEGER | FK, NOT NULL | Instrutor |
| checador_id | INTEGER | FK, Optional | Checador |
| participantes | TEXT | Optional | Lista de participantes |
| status | TEXT | CHECK | AGENDADO/CONCLUIDO/CANCELADO/AUSENTE |
| tipo_sessao | TEXT | CHECK | INICIAL/RECORRENTE/CHECK/REFRESHER |
| observacoes | TEXT | Optional | Observações |
| resultado | TEXT | CHECK | APROVADO/REPROVADO/SUSPENDIDO |
| ficha_id | INTEGER | FK | Ficha de simulador |
| assinatura_url | TEXT | Optional | URL de assinatura |
| created_at | TIMESTAMP | DEFAULT | Data de criação |
| updated_at | TIMESTAMP | DEFAULT | Data de atualização |
| deleted_at | TIMESTAMP | Optional | Soft delete |

---

## 🔑 TABELA: fichas_simulador

**Descrição**: Fichas de sessões de simulador  
**Importância**: ⭐⭐⭐⭐ IMPORTANTE

### SQL DDL

```sql
CREATE TABLE fichas_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agendamento_id INTEGER,
  numero_ficha TEXT NOT NULL UNIQUE,
  data_sessao DATE NOT NULL,
  piloto_id INTEGER NOT NULL,
  copiloto_id INTEGER,
  instrutor_id INTEGER NOT NULL,
  checador_id INTEGER,
  aeronave TEXT,
  manobras_realizadas TEXT,
  tempo_total_minutos INTEGER,
  resultado TEXT CHECK(resultado IN ('APROVADO', 'REPROVADO', 'SUSPENSO')),
  observacoes TEXT,
  assinatura_piloto TEXT,
  assinatura_instrutor TEXT,
  data_assinatura TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id),
  FOREIGN KEY (piloto_id) REFERENCES funcionarios(id),
  FOREIGN KEY (copiloto_id) REFERENCES funcionarios(id),
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id),
  FOREIGN KEY (checador_id) REFERENCES funcionarios(id)
);

CREATE INDEX idx_fichas_deleted_at ON fichas_simulador(deleted_at);
CREATE INDEX idx_fichas_data_sessao ON fichas_simulador(data_sessao);
```

---

## 🔑 TABELA: manobras

**Descrição**: Manobras de voo disponíveis  
**Importância**: ⭐⭐⭐ MÉDIA

### SQL DDL

```sql
CREATE TABLE manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  dificuldade TEXT CHECK(dificuldade IN ('FÁCIL', 'MÉDIO', 'DIFÍCIL')),
  tempo_estimado_minutos INTEGER,
  ativo BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Exemplos de Dados

```sql
INSERT INTO manobras (codigo, nome, descricao, categoria, dificuldade)
VALUES 
  ('MAN-001', 'Decolagem Normal', 'Decolagem em condições normais', 'BÁSICO', 'FÁCIL'),
  ('MAN-002', 'Pouso em Emergência', 'Pouso com uma emergência', 'AVANÇADO', 'DIFÍCIL');
```

---

## 🔑 TABELA: template_manobras

**Descrição**: Templates/checklists de manobras  
**Importância**: ⭐⭐⭐ MÉDIA

### SQL DDL

```sql
CREATE TABLE template_manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  manobras_ids TEXT,
  tempo_total_minutos INTEGER,
  ativo BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔑 TABELA: empresas

**Descrição**: Companhias aéreas cadastradas  
**Importância**: ⭐⭐⭐ MÉDIA

### SQL DDL

```sql
CREATE TABLE empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj TEXT NOT NULL UNIQUE,
  email TEXT,
  telefone TEXT,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  ativo BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔑 TABELA: aeronaves

**Descrição**: Frota de aeronaves  
**Importância**: ⭐⭐⭐ MÉDIA

### SQL DDL

```sql
CREATE TABLE aeronaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  modelo TEXT NOT NULL,
  fabricante TEXT,
  numero_serie TEXT,
  registro_anac TEXT UNIQUE,
  data_fabricacao DATE,
  capacidade_passageiros INTEGER,
  status TEXT DEFAULT 'ATIVA' CHECK(status IN ('ATIVA', 'MANUTENCAO', 'APOSENTADA')),
  empresa_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);
```

### Exemplos de Dados

```sql
INSERT INTO aeronaves (codigo, modelo, fabricante, capacidade_passageiros, status)
VALUES 
  ('A320-001', 'A320-200', 'Airbus', 180, 'ATIVA'),
  ('B787-001', 'B787-9', 'Boeing', 242, 'ATIVA');
```

---

## 🔑 TABELA: usuarios

**Descrição**: Usuários do sistema  
**Importância**: ⭐⭐⭐⭐ IMPORTANTE

### SQL DDL

```sql
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  nome TEXT NOT NULL,
  funcao TEXT CHECK(funcao IN ('ADMIN', 'GERENTE', 'INSTRUTOR', 'USUARIO')),
  ativo BOOLEAN DEFAULT 1,
  ultimo_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔑 TABELA: auditoria_logs

**Descrição**: Log de todas as operações (compliance)  
**Importância**: ⭐⭐⭐⭐ IMPORTANTE

### SQL DDL

```sql
CREATE TABLE auditoria_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  acao TEXT NOT NULL,
  tabela TEXT NOT NULL,
  registro_id INTEGER,
  dados_antes TEXT,
  dados_depois TEXT,
  ip_address TEXT,
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX idx_auditoria_logs_timestamp ON auditoria_logs(timestamp);
```

---

## 🔑 TABELA: backup_status

**Descrição**: Status de backups  
**Importância**: ⭐⭐⭐ MÉDIA

### SQL DDL

```sql
CREATE TABLE backup_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT CHECK(tipo IN ('DIARIO', 'SEMANAL', 'MENSAL')),
  data_backup TIMESTAMP NOT NULL,
  tamanho_bytes BIGINT,
  status TEXT CHECK(status IN ('SUCESSO', 'FALHA')),
  observacoes TEXT,
  proxima_data_backup TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 📊 DIAGRAMA DE RELACIONAMENTOS

```
funcionarios (1) ─────────── (N) habilitacoes
                            |
                            └─── qualificacoes (1) ─── categorias_qualificacoes
                            
funcionarios (1) ─────────── (N) treinamentos

funcionarios (1) ─────────── (N) agendamentos
funcionarios (1) ─────────── (N) agendamentos (como instrutor/checador)

agendamentos ─────────── fichas_simulador
             └─── simuladores

fichas_simulador ─── funcionarios (piloto, copiloto, instrutor, checador)

aeronaves ───── empresas
      └─── funcionarios (aeronave_principal)

usuarios (1) ─────────── (N) auditoria_logs
```

---

## 🔍 QUERIES DE EXEMPLO

### 1. Dashboard Compliance
```sql
SELECT 
  f.id,
  f.nome,
  f.funcao,
  COUNT(h.id) as total_habilitacoes,
  COUNT(CASE WHEN h.data_vencimento > CURRENT_DATE THEN 1 END) as validas,
  COUNT(CASE WHEN h.data_vencimento <= CURRENT_DATE THEN 1 END) as vencidas,
  COUNT(CASE WHEN h.data_vencimento BETWEEN CURRENT_DATE AND DATE('now', '+30 days') THEN 1 END) as vencendo
FROM funcionarios f
LEFT JOIN habilitacoes h ON f.id = h.funcionario_id AND h.deleted_at IS NULL
WHERE f.deleted_at IS NULL
GROUP BY f.id
ORDER BY validas ASC;
```

### 2. Habilitações Vencendo
```sql
SELECT h.id, f.nome, q.nome, h.data_vencimento, 
       (JULIANDAY(h.data_vencimento) - JULIANDAY('now')) as dias_para_vencer
FROM habilitacoes h
JOIN funcionarios f ON h.funcionario_id = f.id
JOIN qualificacoes q ON h.qualificacao_id = q.id
WHERE h.deleted_at IS NULL
  AND h.data_vencimento BETWEEN CURRENT_DATE AND DATE('now', '+30 days')
ORDER BY h.data_vencimento ASC;
```

### 3. Agendamentos por Mês
```sql
SELECT 
  strftime('%Y-%m', a.data) as mes,
  COUNT(*) as total_agendamentos,
  SUM(CAST(julianday(a.hora_fim) - julianday(a.hora_inicio) AS INTEGER) * 24) as horas_simulador
FROM agendamentos a
WHERE a.deleted_at IS NULL
GROUP BY mes
ORDER BY mes DESC;
```

### 4. Funcionários com Status
```sql
SELECT 
  f.id, f.nome, f.funcao, f.status,
  (SELECT COUNT(*) FROM habilitacoes WHERE funcionario_id = f.id AND deleted_at IS NULL) as habilitacoes,
  (SELECT COUNT(*) FROM treinamentos WHERE funcionario_id = f.id AND deleted_at IS NULL) as treinamentos
FROM funcionarios f
WHERE f.deleted_at IS NULL
ORDER BY f.nome;
```

---

## ⚡ PERFORMANCE TIPS

### Índices Criados
```sql
idx_habilitacoes_deleted_at
idx_habilitacoes_funcionario_id
idx_habilitacoes_qualificacao_id
idx_habilitacoes_vencimento
idx_qualificacoes_deleted_at
idx_funcionarios_deleted_at
idx_funcionarios_status
idx_funcionarios_funcao
idx_certificados_deleted_at
idx_certificados_habilitacao_id
idx_treinamentos_deleted_at
idx_agendamentos_deleted_at
idx_agendamentos_data
idx_auditoria_logs_timestamp
```

### Soft Delete Pattern
```sql
-- SEMPRE usar em SELECT
SELECT * FROM habilitacoes WHERE deleted_at IS NULL;

-- NUNCA usar DELETE
-- UPDATE com deleted_at
UPDATE habilitacoes SET deleted_at = CURRENT_TIMESTAMP WHERE id = 123;
```

---

## 📈 ESTATÍSTICAS BANCO DE DADOS

| Tabela | Linhas (aprox) | Índices | Tamanho |
|--------|----------------|---------|---------|
| habilitacoes | 1,036 | 4 | ~250KB |
| qualificacoes | 25 | 3 | ~10KB |
| funcionarios | 150 | 3 | ~50KB |
| certificados | 800 | 3 | ~100KB |
| treinamentos | 300 | 2 | ~60KB |
| agendamentos | 500 | 3 | ~120KB |
| fichas_simulador | 450 | 2 | ~150KB |
| **TOTAL** | **~3,261** | **~23** | **~740KB** |

---

**Versão**: 2.2  
**Última Atualização**: 4 de Novembro de 2025  
**Status**: ✅ COMPLETO & OTIMIZADO

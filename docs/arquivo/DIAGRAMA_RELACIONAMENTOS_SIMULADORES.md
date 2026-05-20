# 📊 DIAGRAMA DE RELACIONAMENTOS - MÓDULO SIMULADORES

## 1. ENTIDADES E RELACIONAMENTOS (ER Diagram)

```
┌─────────────────────────┐
│     SIMULADORES         │
│─────────────────────────│
│ • id (PK)               │
│ • nome                  │
│ • modelo                │
│ • tipo / tipo_aeronave  │◄────┐
│ • fabricante            │     │
│ • status                │     │
│ • created_at            │     │
│ • deleted_at (soft)     │     │
└─────────────────────────┘     │
            │                   │
            │ 1:N               │
            ▼                   │
┌─────────────────────────────────┐
│ SIMULADOR_AGENDAMENTOS          │
│ (sessões)                       │
│─────────────────────────────────│
│ • id (PK)                       │
│ • simulador_id (FK) ────────────┘
│ • data                          │
│ • duracao_minutos               │
│ • instrutor_id (FK) ───────┐    │
│ • tipo_sessao               │    │
│ • status                    │    │
│ • created_at                │    │
│ • deleted_at (soft)         │    │
└─────────────────────────────────┘
            │                      │
            │ 1:N                  │
            ▼                      │
┌──────────────────────────────────┐
│  SESSOES_PARTICIPANTES           │
│  (JOIN alunos/instrutores)       │
│──────────────────────────────────│
│ • id (PK)                        │
│ • sessao_id (FK) ────────────┐   │
│ • funcionario_id (FK) ───────│───┼───┐
│ • funcao ('ALUNO',           │   │   │
│          'INSTRUTOR',        │   │   │
│          'EXAMINADOR')       │   │   │
│ • presente                   │   │   │
│ • deleted_at (soft)          │   │   │
└──────────────────────────────────┘   │
                                       │
┌──────────────────────────────────┐   │
│      FUNCIONARIOS                │◄──┼───┘
│──────────────────────────────────│   │
│ • id (PK)                        │   │
│ • nome                           │   │
│ • matricula                      │   │
│ • email                          │   │
│ • cargo                          │   │
└──────────────────────────────────┘   │
            │                          │
            │ 1:N (aluno)              │
            ▼                          │
┌───────────────────────────────────────┐
│        FICHAS_SESSAO                  │
│───────────────────────────────────────│
│ • id (PK)                             │
│ • agendamento_slot_id (FK) ──────────┘
│ • colaborador_id_aluno (FK) ──────┐
│ • instrutor_id (FK) ──────────────┼───► FUNCIONARIOS
│ • examinador_id (FK) ─────────────┘
│ • funcao                          │
│ • template_id (FK)                │
│ • status                          │
│ • resultado_final                 │
│ • nota_final                      │
│ • aprovado (0/1)                  │
│ • assinado (0/1)                  │
│ • tipo_sessao                     │
│ • tipo_aeronave                   │
│ • assinatura_aluno_ip             │
│ • assinatura_aluno_timestamp      │
│ • assinatura_instrutor_ip         │
│ • assinatura_instrutor_timestamp  │
│ • deleted_at (soft)               │
└───────────────────────────────────────┘
            │
            │ 1:N
            ▼
┌───────────────────────────────────┐
│  FICHAS_SESSAO_MANOBRAS           │
│───────────────────────────────────│
│ • id (PK)                         │
│ • ficha_id (FK)                   │
│ • codigo                          │
│ • descricao                       │
│ • categoria                       │
│ • ordem                           │
│ • resultado ('S' ou 'I')         │
│ • observacoes                     │
│ • deleted_at (soft)               │
└───────────────────────────────────┘
            │
            │ N:1 (template)
            ▼
┌───────────────────────────────┐
│   CADASTRO_MANOBRAS           │
│   (templates)                 │
│───────────────────────────────│
│ • id (PK)                     │
│ • codigo                      │
│ • descricao                   │
│ • categoria                   │
│ • tipo_sessao                 │
│ • tipo_aeronave               │
│ • ordem                       │
│ • ativo                       │
│ • deleted_at (soft)           │
└───────────────────────────────┘
```

---

## 2. FLUXO DE CRIAÇÃO DE SESSÃO

```
┌─────────────────────────────────────────────────────────────┐
│  1. CRIAR SESSÃO                                            │
│  POST /api/simuladores/sessoes                              │
│  {                                                          │
│    simulador_id: 1,                                         │
│    data: "2025-12-01T10:00",                                │
│    duracao_minutos: 120,                                    │
│    instrutor_id: 5,                                         │
│    tipo_sessao: "RECURRENT",                                │
│    alunos: [10, 11, 12]  // IDs dos funcionários           │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. INSERT INTO simulador_agendamentos                      │
│     └─► Retorna: sessao_id = 100                           │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Para cada aluno in [10, 11, 12]:                        │
│     INSERT INTO sessoes_participantes                       │
│       (sessao_id, funcionario_id, funcao, presente)         │
│       VALUES (100, 10, 'ALUNO', 1)                          │
│       VALUES (100, 11, 'ALUNO', 1)                          │
│       VALUES (100, 12, 'ALUNO', 1)                          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Função: criarFichasParaSessao(db, 100)                  │
│     ┌─────────────────────────────────────────────────────┐│
│     │ a) Busca tipo_aeronave do simulador (dinâmico)     ││
│     │    SELECT tipo/tipo_aeronave FROM simuladores       ││
│     │    └─► tipo_aeronave = "B737"                       ││
│     │                                                      ││
│     │ b) Busca alunos da sessão                           ││
│     │    SELECT funcionario_id                            ││
│     │    FROM sessoes_participantes                       ││
│     │    WHERE sessao_id = 100 AND funcao = 'ALUNO'      ││
│     │    └─► [10, 11, 12]                                ││
│     │                                                      ││
│     │ c) Busca instrutor                                  ││
│     │    SELECT funcionario_id                            ││
│     │    WHERE sessao_id = 100 AND funcao = 'INSTRUTOR'  ││
│     │    └─► instrutor_id = 5                            ││
│     │                                                      ││
│     │ d) Para cada aluno, cria ficha:                     ││
│     │    INSERT INTO fichas_sessao                        ││
│     │      (agendamento_slot_id, colaborador_id_aluno,   ││
│     │       instrutor_id, tipo_sessao, tipo_aeronave,    ││
│     │       status)                                        ││
│     │    VALUES (100, 10, 5, 'RECURRENT', 'B737',        ││
│     │            'EM_PREENCHIMENTO')                       ││
│     │    └─► ficha_id = 200 (aluno 10)                   ││
│     │    └─► ficha_id = 201 (aluno 11)                   ││
│     │    └─► ficha_id = 202 (aluno 12)                   ││
│     │                                                      ││
│     │ e) Busca manobras do template                       ││
│     │    SELECT codigo, descricao, categoria, ordem       ││
│     │    FROM cadastro_manobras                           ││
│     │    WHERE tipo_sessao = 'RECURRENT'                  ││
│     │      AND tipo_aeronave = 'B737'                     ││
│     │    └─► 15 manobras encontradas                      ││
│     │                                                      ││
│     │ f) Para cada ficha + manobra:                       ││
│     │    INSERT INTO fichas_sessao_manobras               ││
│     │      (ficha_id, codigo, descricao, categoria,      ││
│     │       ordem)                                         ││
│     │    VALUES (200, 'M001', 'Decolagem', 'NORMAL', 1)  ││
│     │    VALUES (200, 'M002', 'Subida', 'NORMAL', 2)     ││
│     │    ...                                               ││
│     │    └─► 15 manobras x 3 fichas = 45 inserts         ││
│     └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  5. RESPONSE                                                │
│  {                                                          │
│    success: true,                                           │
│    data: {                                                  │
│      sessao_id: 100,                                        │
│      fichas_criadas: 3,                                     │
│      manobras_populadas: 45                                 │
│    }                                                        │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. FLUXO DE ASSINATURA DE FICHA

```
┌─────────────────────────────────────────────────────────────┐
│  ESTADO INICIAL                                             │
│  Ficha ID: 200                                              │
│  status: "EM_PREENCHIMENTO"                                 │
│  assinatura_aluno_ip: null                                  │
│  assinatura_instrutor_ip: null                              │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  1. ALUNO ASSINA                                            │
│  POST /api/simuladores/fichas/200/assinar                   │
│  { tipo: "ALUNO" }                                          │
│                                                             │
│  UPDATE fichas_sessao SET                                   │
│    assinatura_aluno_ip = '192.168.1.100',                  │
│    assinatura_aluno_timestamp = '2025-12-01T14:30:00',     │
│    status = 'ASSINADA_ALUNO'                                │
│  WHERE id = 200                                             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  ESTADO INTERMEDIÁRIO                                       │
│  status: "ASSINADA_ALUNO"                                   │
│  assinatura_aluno_ip: "192.168.1.100"                       │
│  assinatura_instrutor_ip: null  ◄─── FALTA                 │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. INSTRUTOR ASSINA                                        │
│  POST /api/simuladores/fichas/200/assinar                   │
│  { tipo: "INSTRUTOR" }                                      │
│                                                             │
│  UPDATE fichas_sessao SET                                   │
│    assinatura_instrutor_ip = '192.168.1.50',               │
│    assinatura_instrutor_timestamp = '2025-12-01T15:00:00', │
│    status = 'ASSINADA_TOTAL'  ◄─── MUDA PARA TOTAL         │
│  WHERE id = 200                                             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  ESTADO FINAL                                               │
│  status: "ASSINADA_TOTAL"                                   │
│  assinatura_aluno_ip: "192.168.1.100"                       │
│  assinatura_aluno_timestamp: "2025-12-01T14:30:00"          │
│  assinatura_instrutor_ip: "192.168.1.50"                    │
│  assinatura_instrutor_timestamp: "2025-12-01T15:00:00"      │
│  ✅ PRONTA PARA GERAR QUALIFICAÇÃO                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. FLUXO DE GERAÇÃO DE QUALIFICAÇÃO

```
┌─────────────────────────────────────────────────────────────┐
│  1. VALIDAÇÃO PRÉVIA                                        │
│  POST /api/simuladores/fichas/200/gerar-qualificacao       │
│                                                             │
│  Checks:                                                    │
│  ✅ ficha.status === 'ASSINADA_TOTAL'                       │
│  ✅ ficha.aprovado === 1                                    │
│  ✅ Não existe qualificação duplicada                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. BUSCAR DADOS DA FICHA                                   │
│  SELECT                                                     │
│    f.*,                                                     │
│    func.nome as aluno_nome,                                 │
│    func.matricula as aluno_matricula                        │
│  FROM fichas_sessao f                                       │
│  JOIN funcionarios func ON f.colaborador_id_aluno = func.id│
│  WHERE f.id = 200                                           │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  3. VERIFICAR NÃO DUPLICAR                                  │
│  SELECT id                                                  │
│  FROM qualificacoes_historico                               │
│  WHERE funcionario_id = 10                                  │
│    AND tipo_qualificacao = 'RECURRENT_B737'                 │
│    AND data_validade > CURRENT_DATE                         │
│                                                             │
│  Se encontrar → ERRO: "Qualificação já existe"             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  4. INSERT QUALIFICAÇÃO                                     │
│  INSERT INTO qualificacoes_historico (                      │
│    funcionario_id,                                          │
│    tipo_qualificacao,                                       │
│    data_obtencao,                                           │
│    data_validade,                                           │
│    origem,                                                  │
│    observacoes                                              │
│  ) VALUES (                                                 │
│    10,                              -- aluno                │
│    'RECURRENT_B737',                -- tipo + aeronave      │
│    '2025-12-01',                    -- hoje                 │
│    '2026-12-01',                    -- +1 ano               │
│    'AUTO_FICHA_SIMULADOR',          -- origem               │
│    'Gerado da ficha #200'           -- ref                  │
│  )                                                          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  5. AUDITORIA                                               │
│  INSERT INTO auditoria_avancada_v2 (                        │
│    tabela,                                                  │
│    acao,                                                    │
│    registro_id,                                             │
│    dados_novos                                              │
│  ) VALUES (                                                 │
│    'qualificacoes_historico',                               │
│    'INSERT',                                                │
│    '300',                           -- nova qual_id         │
│    JSON(...)                        -- todos dados          │
│  )                                                          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  6. RESPONSE                                                │
│  {                                                          │
│    success: true,                                           │
│    data: {                                                  │
│      qualificacao_id: 300,                                  │
│      funcionario: "João Silva",                             │
│      tipo: "RECURRENT_B737",                                │
│      valida_ate: "2026-12-01"                               │
│    }                                                        │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. ENDPOINTS POR TABELA

### SIMULADORES
```
GET    /api/simuladores                 → SELECT * FROM simuladores
POST   /api/simuladores                 → INSERT INTO simuladores
GET    /api/simuladores/:id             → SELECT * FROM simuladores WHERE id = ?
PUT    /api/simuladores/:id             → UPDATE simuladores SET ... WHERE id = ?
DELETE /api/simuladores/:id             → UPDATE simuladores SET deleted_at = NOW() WHERE id = ?
```

### SIMULADOR_AGENDAMENTOS (sessões)
```
GET    /api/simuladores/sessoes         → SELECT * FROM simulador_agendamentos
POST   /api/simuladores/sessoes         → INSERT INTO simulador_agendamentos
                                          + INSERT INTO sessoes_participantes (para cada aluno)
                                          + criarFichasParaSessao(sessao_id)
GET    /api/simuladores/sessoes/:id     → SELECT * FROM simulador_agendamentos WHERE id = ?
PUT    /api/simuladores/sessoes/:id     → UPDATE simulador_agendamentos SET ... WHERE id = ?
DELETE /api/simuladores/sessoes/:id     → UPDATE simulador_agendamentos SET deleted_at = NOW()
                                          + UPDATE sessoes_participantes SET deleted_at = NOW()
```

### SESSOES_PARTICIPANTES
```
GET    /api/simuladores/sessoes/:id/participantes → SELECT * FROM sessoes_participantes WHERE sessao_id = ?
POST   /api/simuladores/sessoes/:id/participantes → INSERT INTO sessoes_participantes
PUT    /api/simuladores/participantes/:id         → UPDATE sessoes_participantes SET ... WHERE id = ?
DELETE /api/simuladores/participantes/:id         → UPDATE sessoes_participantes SET deleted_at = NOW()
```

### FICHAS_SESSAO
```
GET    /api/simuladores/fichas          → SELECT f.*, func.nome, inst.nome
                                           FROM fichas_sessao f
                                           LEFT JOIN funcionarios func ON f.colaborador_id_aluno = func.id
                                           LEFT JOIN funcionarios inst ON f.instrutor_id = inst.id
GET    /api/simuladores/fichas/:id      → SELECT * FROM fichas_sessao WHERE id = ?
POST   /api/simuladores/fichas          → INSERT INTO fichas_sessao
PUT    /api/simuladores/fichas/:id      → UPDATE fichas_sessao SET ... WHERE id = ?
DELETE /api/simuladores/fichas/:id      → UPDATE fichas_sessao SET deleted_at = NOW()
POST   /api/simuladores/fichas/:id/assinar → UPDATE fichas_sessao SET
                                             assinatura_X_ip = ?,
                                             assinatura_X_timestamp = ?,
                                             status = 'ASSINADA_ALUNO' | 'ASSINADA_TOTAL'
```

### FICHAS_SESSAO_MANOBRAS
```
GET    /api/simuladores/fichas-simulador/:id/manobras → SELECT * FROM fichas_sessao_manobras WHERE ficha_id = ?
POST   /api/simuladores/fichas-simulador/:id/popular-manobras → INSERT INTO fichas_sessao_manobras
                                                                 (auto-popular do template)
```

### CADASTRO_MANOBRAS
```
GET    /api/simuladores/manobras        → SELECT * FROM cadastro_manobras
POST   /api/simuladores/manobras        → INSERT INTO cadastro_manobras
PUT    /api/simuladores/manobras/:id    → UPDATE cadastro_manobras SET ... WHERE id = ?
DELETE /api/simuladores/manobras/:id    → UPDATE cadastro_manobras SET deleted_at = NOW()
```

---

## 6. QUERIES CRÍTICAS (TOP 3)

### 1. Relatório Tripulantes
```sql
SELECT 
  f.matricula, 
  f.nome, 
  sp.funcao,
  COUNT(DISTINCT fs.id) as sessoes,
  SUM(CASE WHEN fs.aprovado = 1 THEN 1 ELSE 0 END) as aprovados,
  SUM(CASE WHEN fs.aprovado = 0 AND fs.resultado_final != 'PENDENTE' THEN 1 ELSE 0 END) as reprovados,
  SUM(CASE WHEN fs.resultado_final = 'PENDENTE' THEN 1 ELSE 0 END) as faltas
FROM funcionarios f
INNER JOIN sessoes_participantes sp ON f.id = sp.funcionario_id
INNER JOIN fichas_sessao fs ON sp.sessao_id = fs.agendamento_slot_id
WHERE fs.deleted_at IS NULL
  AND (? = '' OR sp.funcao = ?)
  AND (? = '' OR fs.tipo_sessao = ?)
  AND (? = '' OR f.id = ?)
  AND fs.data_sessao BETWEEN ? AND ?
GROUP BY f.id, f.matricula, f.nome, sp.funcao
HAVING sessoes > 0
ORDER BY sessoes DESC
LIMIT ?
```

### 2. Relatório Uso por Simulador
```sql
SELECT 
  s.nome as simulador,
  s.tipo,
  COUNT(sa.id) as total_sessoes,
  SUM(sa.duracao_minutos) / 60.0 as horas_uso,
  SUM(CASE WHEN sa.tipo_sessao = 'RECURRENT' THEN 1 ELSE 0 END) as recurrent,
  SUM(CASE WHEN sa.tipo_sessao = 'PC' THEN 1 ELSE 0 END) as pc,
  SUM(CASE WHEN sa.tipo_sessao = 'OPC' THEN 1 ELSE 0 END) as opc
FROM simuladores s
LEFT JOIN simulador_agendamentos sa ON s.id = sa.simulador_id
WHERE s.deleted_at IS NULL
  AND sa.deleted_at IS NULL
  AND sa.data BETWEEN ? AND ?
GROUP BY s.id, s.nome, s.tipo
ORDER BY horas_uso DESC
```

### 3. Relatório Desempenho por Tipo
```sql
SELECT 
  fs.tipo_sessao,
  COUNT(*) as total,
  SUM(CASE WHEN fs.aprovado = 1 THEN 1 ELSE 0 END) as aprovados,
  SUM(CASE WHEN fs.aprovado = 0 THEN 1 ELSE 0 END) as reprovados,
  SUM(CASE WHEN fs.resultado_final = 'PENDENTE' THEN 1 ELSE 0 END) as pendentes,
  ROUND(SUM(CASE WHEN fs.aprovado = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as taxa_aprovacao
FROM fichas_sessao fs
WHERE fs.deleted_at IS NULL
  AND fs.data_sessao BETWEEN ? AND ?
  AND (? = '' OR fs.tipo_sessao = ?)
GROUP BY fs.tipo_sessao
ORDER BY total DESC
```

---

## 7. ÍNDICES NECESSÁRIOS (PERFORMANCE)

### Existentes
```sql
CREATE INDEX idx_auditoria_v2_tabela ON auditoria_avancada_v2(tabela);
CREATE INDEX idx_auditoria_v2_registro ON auditoria_avancada_v2(registro_id);
```

### 🚨 FALTANDO (CRIAR NA ETAPA 0)
```sql
-- Simuladores
CREATE INDEX idx_simuladores_status ON simuladores(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_simuladores_tipo ON simuladores(tipo) WHERE deleted_at IS NULL;

-- Sessões
CREATE INDEX idx_simulador_agendamentos_simulador ON simulador_agendamentos(simulador_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_simulador_agendamentos_data ON simulador_agendamentos(data) WHERE deleted_at IS NULL;
CREATE INDEX idx_simulador_agendamentos_instrutor ON simulador_agendamentos(instrutor_id) WHERE deleted_at IS NULL;

-- Participantes
CREATE INDEX idx_sessoes_participantes_sessao ON sessoes_participantes(sessao_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sessoes_participantes_funcionario ON sessoes_participantes(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sessoes_participantes_funcao ON sessoes_participantes(funcao) WHERE deleted_at IS NULL;

-- Fichas
CREATE INDEX idx_fichas_sessao_agendamento ON fichas_sessao(agendamento_slot_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_fichas_sessao_aluno ON fichas_sessao(colaborador_id_aluno) WHERE deleted_at IS NULL;
CREATE INDEX idx_fichas_sessao_instrutor ON fichas_sessao(instrutor_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_fichas_sessao_status ON fichas_sessao(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_fichas_sessao_data ON fichas_sessao(data_sessao) WHERE deleted_at IS NULL;
CREATE INDEX idx_fichas_sessao_tipo ON fichas_sessao(tipo_sessao) WHERE deleted_at IS NULL;

-- Manobras
CREATE INDEX idx_fichas_sessao_manobras_ficha ON fichas_sessao_manobras(ficha_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cadastro_manobras_tipo_aero ON cadastro_manobras(tipo_sessao, tipo_aeronave) WHERE deleted_at IS NULL;
```

**Impacto Esperado**: 50-80% redução no tempo de queries JOIN e relatórios

---

**Data**: 30/11/2025  
**Status**: ✅ DIAGRAMA COMPLETO

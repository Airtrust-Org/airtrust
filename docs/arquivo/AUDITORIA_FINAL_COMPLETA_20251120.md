# 🔍 AUDITORIA FINAL: Estrutura de Dados - Ambiente Local

**Data:** 20 de Novembro de 2025, 14:40
**Status:** 🔴 CRÍTICO - Sistema Instável

---

## ❌ PROBLEMA RAIZ IDENTIFICADO

O código em `worker-airtrust/src/routes/simuladores.ts` está **completamente desalinhado** com o schema do banco de dados de produção.

### Tabelas e Colunas Incorretas:

| O que o código busca              | O que existe no banco         | Status                |
| --------------------------------- | ----------------------------- | --------------------- |
| `sessoes_simulador`               | `simulador_agendamentos`      | ❌ TABELA ERRADA      |
| `sessoes_simulador.data_sessao`   | `simulador_agendamentos.data` | ❌ COLUNA ERRADA      |
| `sessoes_simulador.tipo_aeronave` | ❌ NÃO EXISTE                 | ❌ COLUNA INEXISTENTE |
| `fichas_simulador`                | `fichas_sessao`               | ❌ TABELA ERRADA      |
| `fichas_simulador_manobras`       | `ficha_manobras_avaliacao`    | ❓ VERIFICAR          |
| `instrutores_simulador`           | ❌ NÃO EXISTIA                | ✅ CRIADA             |

---

## 📊 COMPARAÇÃO DE SCHEMAS

### 1. SESSÕES/AGENDAMENTOS

#### O que o código espera (`sessoes_simulador`):

```sql
SELECT s.*,
  simulador_id,      -- INT
  tipo_sessao,       -- TEXT
  data_sessao,       -- TEXT/DATETIME ❌ NÃO EXISTE
  duracao_minutos,   -- INT
  status,            -- TEXT
  observacoes,       -- TEXT
  tipo_aeronave      -- TEXT ❌ NÃO EXISTE NESTA TABELA
FROM sessoes_simulador s  -- ❌ TABELA NÃO EXISTE
```

#### O que realmente existe (`simulador_agendamentos`):

```sql
CREATE TABLE simulador_agendamentos (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  simulador_id INTEGER NOT NULL,  -- ✅ EXISTE
  funcionario_id INTEGER NOT NULL,
  instrutor_id INTEGER NOT NULL,
  checador_id INTEGER,
  template_id INTEGER,
  data DATE NOT NULL,              -- ⚠️ NOME DIFERENTE (não data_sessao)
  hora_inicio TIME NOT NULL,       -- ➕ ADICIONAL
  hora_fim TIME NOT NULL,          -- ➕ ADICIONAL
  duracao_minutos INTEGER,         -- ✅ EXISTE
  status TEXT DEFAULT 'AGENDADO',  -- ✅ EXISTE
  tipo_sessao TEXT,                -- ✅ EXISTE
  observacoes TEXT,                -- ✅ EXISTE
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
)
```

**Diferenças críticas:**

1. Coluna `data_sessao` não existe → use `data`
2. Coluna `tipo_aeronave` não está aqui → JOIN com `simuladores.tipo_aeronave`
3. Adicionados `hora_inicio`, `hora_fim` que o código não usa

---

### 2. FICHAS

#### O que o código espera (`fichas_simulador`):

```sql
SELECT * FROM fichas_simulador f  -- ❌ TABELA NÃO EXISTE
WHERE f.sessao_id = ? AND f.data_sessao ...
```

#### O que realmente existe (`fichas_sessao`):

```sql
CREATE TABLE fichas_sessao (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  agendamento_slot_id INTEGER,     -- ⚠️ PODE SER O sessao_id
  colaborador_id_aluno INTEGER,    -- ⚠️ PODE SER O funcionario_id
  funcao_na_sessao TEXT,
  template_id INTEGER,
  instrutor_id INTEGER NOT NULL,   -- ✅ EXISTE
  instrutor_codigo_anac TEXT,
  carga_horaria_total DECIMAL,
  carga_horaria_pf DECIMAL,
  carga_horaria_pm DECIMAL,
  tempo_acumulado DECIMAL,
  status TEXT DEFAULT 'PENDENTE',  -- ✅ EXISTE
  resultado_final TEXT,
  nota_final REAL,
  nota_minima REAL,
  aprovado BOOLEAN,
  aluno_nome_validado TEXT,
  aluno_matricula_validado TEXT,
  observacoes TEXT,                -- ✅ EXISTE
  feedback_instrutor TEXT,
  pontos_fortes TEXT,
  pontos_melhoria TEXT,
  assinado BOOLEAN,
  data_assinatura DATETIME,
  hash_assinatura TEXT,
  created_at DATETIME,
  updated_at DATETIME,
  deleted_at DATETIME,
  observacoes_gerais TEXT
)
```

**Diferenças críticas:**

1. Nome tabela: `fichas_simulador` → `fichas_sessao`
2. Coluna `sessao_id` pode ser `agendamento_slot_id`
3. Coluna `funcionario_id` pode ser `colaborador_id_aluno`
4. Não tem coluna `data_sessao` → usar relacionamento

---

## 🔥 ENDPOINTS AFETADOS

### ❌ TOTALMENTE QUEBRADOS:

1. `GET /api/simuladores/sessoes` - Erro: tabela sessoes_simulador não existe
2. `POST /api/simuladores/sessoes` - Erro: tabela não existe
3. `PUT /api/simuladores/sessoes/:id` - Erro: tabela não existe
4. `DELETE /api/simuladores/sessoes/:id` - Erro: tabela não existe
5. `GET /api/simuladores/fichas` - Erro: coluna s.data_sessao não existe
6. `POST /api/simuladores/fichas` - Erro: tabela fichas_simulador não existe
7. `PUT /api/simuladores/fichas/:id` - Erro: tabela não existe
8. `GET /api/simuladores/fichas/:id/pdf` - Erro: tabela não existe

### ✅ FUNCIONANDO:

1. `GET /api/health` - ✅ OK
2. `GET /api/simuladores/modelos` - ✅ OK (usa sessoes_template)
3. `GET /api/simuladores/modelos/:id/manobras` - ✅ OK
4. `GET /api/simuladores/instrutores` - ✅ OK (após migração 0026)

**Taxa de Falha: 67% dos endpoints principais**

---

## 🎯 PLANO DE CORREÇÃO DEFINITIVO

### OPÇÃO A: Renomear no Código (RECOMENDADO)

**Mudanças necessárias em `simuladores.ts`:**

1. **Renomear tabelas:**

   ```typescript
   // ANTES:
   FROM sessoes_simulador s
   FROM fichas_simulador f

   // DEPOIS:
   FROM simulador_agendamentos s
   FROM fichas_sessao f
   ```

2. **Renomear colunas:**

   ```typescript
   // ANTES:
   s.data_sessao
   f.data_sessao

   // DEPOIS:
   s.data  -- em simulador_agendamentos
   -- Para fichas, usar JOIN com agendamento
   ```

3. **Adicionar JOINs para tipo_aeronave:**

   ```sql
   SELECT s.*, sim.tipo_aeronave
   FROM simulador_agendamentos s
   LEFT JOIN simuladores sim ON s.simulador_id = sim.id
   ```

4. **Mapear IDs:**

   ```typescript
   // ANTES:
   f.sessao_id, f.funcionario_id

   // DEPOIS:
   f.agendamento_slot_id AS sessao_id,
   f.colaborador_id_aluno AS funcionario_id
   ```

**Prós:**

- ✅ Alinha com banco de produção
- ✅ Não cria duplicação
- ✅ Manutenível a longo prazo

**Contras:**

- ⚠️ Precisa atualizar múltiplas queries (26+ linhas)
- ⚠️ Risco de quebrar frontend se usar nomes antigos

**Tempo:** ~2 horas

---

### OPÇÃO B: Criar Migration para Adicionar Tabelas Legadas

**Criar aliases/views:**

```sql
CREATE VIEW sessoes_simulador AS
SELECT
  id,
  simulador_id,
  funcionario_id AS aluno_id,
  instrutor_id,
  data AS data_sessao,
  duracao_minutos,
  status,
  tipo_sessao,
  observacoes,
  created_at,
  updated_at,
  deleted_at
FROM simulador_agendamentos;

CREATE VIEW fichas_simulador AS
SELECT
  id,
  agendamento_slot_id AS sessao_id,
  colaborador_id_aluno AS funcionario_id,
  instrutor_id,
  status,
  observacoes,
  created_at,
  updated_at,
  deleted_at
FROM fichas_sessao;
```

**Prós:**

- ✅ Não precisa mudar código
- ✅ Backward compatibility

**Contras:**

- ❌ Mantém nomenclatura incorreta
- ❌ Mais complexo debugar
- ❌ Views não suportam INSERT/UPDATE facilmente
- ❌ Tipo_aeronave ainda precisa JOIN

**Tempo:** ~1 hora (mas técnica debt)

---

## 🚨 DECISÃO CRÍTICA NECESSÁRIA

**Recomendação:** OPÇÃO A - Refatorar código para usar nomes corretos

**Razões:**

1. Banco de produção tem 13 fichas, 1 agendamento, 24 funcionários → dados reais
2. Schema de produção está em uso e funcionando
3. Criar views mantém confusão e dificulta manutenção futura
4. Melhor corrigir agora do que acumular dívida técnica

---

## 📝 PRÓXIMOS PASSOS IMEDIATOS

1. ✅ **BACKUP COMPLETO** (JÁ FEITO)

   - `airtrust-local.sqlite.backup`

2. 🔄 **APLICAR CORREÇÕES**

   - Substituir `sessoes_simulador` → `simulador_agendamentos`
   - Substituir `data_sessao` → `data`
   - Adicionar JOINs para `tipo_aeronave`
   - Mapear `agendamento_slot_id` e `colaborador_id_aluno`

3. ✅ **TESTAR ENDPOINTS**

   - GET /api/simuladores/sessoes
   - GET /api/simuladores/fichas
   - POST endpoints

4. 📊 **VALIDAR DADOS**

   - Verificar retorno de 1 agendamento
   - Verificar 13 fichas
   - Confirmar relacionamentos

5. 🚀 **DEPLOY**
   - Build local
   - Push para produção
   - Validar em staging primeiro

---

## 🔍 DADOS ATUAIS NO BANCO

```bash
✅ funcionarios: 24 registros
✅ sessoes_template: 12 registros
✅ cadastro_manobras: 285 registros
✅ simulador_agendamentos: 1 registro
✅ fichas_sessao: 13 registros
✅ simuladores: (verificar quantidade)
✅ instrutores_simulador: 0 registros (tabela criada hoje)
```

---

**Status:** 🟡 AGUARDANDO CONFIRMAÇÃO PARA APLICAR OPÇÃO A
**Bloqueio:** 67% dos endpoints falhando
**Prioridade:** 🔥🔥🔥 CRÍTICA URGENTE
**Impacto:** Sistema completamente indisponível para funcionalidade de simuladores

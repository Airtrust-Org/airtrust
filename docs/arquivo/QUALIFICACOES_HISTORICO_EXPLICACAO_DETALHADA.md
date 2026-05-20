# 📚 Tabela `qualificacoes_historico` - Explicação Detalhada

## 🎯 Propósito Principal

A tabela `qualificacoes_historico` é o **coração do sistema de qualificações** do AirTrust. Ela armazena o **histórico completo** de qualificações, certificações e habilitações de cada funcionário, mantendo rastreabilidade total e status de validade.

---

## 📊 Estrutura de Dados

### 1. **Colunas Básicas de Identificação**

| Campo             | Tipo                | Obrigatório | Descrição                                                     |
| ----------------- | ------------------- | ----------- | ------------------------------------------------------------- |
| `id`              | INTEGER PRIMARY KEY | ✅          | Identificador único auto-incrementado                         |
| `funcionario_id`  | INTEGER             | ✅          | FK → `funcionarios.id` - Quem tem a qualificação              |
| `qualificacao_id` | INTEGER             | ✅          | FK → `qualificacoes_tipos.id` - Qual é o tipo de qualificação |

**Exemplo:**

```sql
-- Funcionário ID 42 tem a Qualificação ID 5 (CMA)
id: 1001
funcionario_id: 42
qualificacao_id: 5
```

---

### 2. **Colunas de Código e Classificação**

| Campo         | Tipo | Descrição                                                                            |
| ------------- | ---- | ------------------------------------------------------------------------------------ |
| `tipo_codigo` | TEXT | Código do tipo (ex: "CMA", "CANAC", "CHT", "PP", "PC")                               |
| `codigo`      | TEXT | Código específico da qualificação (pode ser herdado de `qualificacoes_tipos.codigo`) |
| `categoria`   | TEXT | Categoria da qualificação (ex: "TRIAGEM_MÉDICA", "PILOTO", "TÉCNICO")                |

**Uso:**

- Usado para **deduplicação e busca**
- Permite rápida identificação sem JOIN com qualificacoes_tipos
- Cache para performance

---

### 3. **Colunas de Datas (CRÍTICAS)**

| Campo             | Tipo              | Descrição                                  | Padrão                            |
| ----------------- | ----------------- | ------------------------------------------ | --------------------------------- |
| `data_conclusao`  | TEXT (YYYY-MM-DD) | Quando a qualificação foi concluída/obtida | Obrigatório                       |
| `data_vencimento` | TEXT (YYYY-MM-DD) | Quando a qualificação vence                | Pode ser NULL (sem prazo)         |
| `validade_meses`  | INTEGER           | Quantos meses a qualificação é válida      | Pode vir de `qualificacoes_tipos` |

**Lógica de Status Calculada:**

```
REMOVIDA         → deleted_at IS NOT NULL
INDETERMINADA    → data_vencimento IS NULL (qualificação sem prazo)
VENCIDA          → DATE(data_vencimento) < DATE('now')
PROXIMA_VENCIMENTO → data_vencimento entre hoje e +30 dias
ATENCAO          → data_vencimento entre +31 e +60 dias
VALIDA           → Qualquer outra data futura
```

---

### 4. **Colunas de Documentação**

| Campo                | Tipo | Descrição                             |
| -------------------- | ---- | ------------------------------------- |
| `numero_certificado` | TEXT | Número do certificado físico          |
| `observacoes`        | TEXT | Anotações adicionais                  |
| `arquivo_url`        | TEXT | URL do arquivo de certificado (S3/R2) |

---

### 5. **Colunas de Contexto de Aprendizado**

| Campo           | Tipo    | Descrição                                                    |
| --------------- | ------- | ------------------------------------------------------------ |
| `nota`          | REAL    | Nota alcançada (0-100)                                       |
| `instrutor`     | TEXT    | Nome/ID do instrutor                                         |
| `local`         | TEXT    | Onde foi realizado (ex: "São Paulo", "Simulator Hall")       |
| `modalidade`    | TEXT    | Como foi realizado (ex: "PRESENCIAL", "ONLINE", "SIMULATOR") |
| `carga_horaria` | INTEGER | Horas de treinamento                                         |

---

### 6. **Colunas de Auditoria**

| Campo        | Tipo | Descrição                            |
| ------------ | ---- | ------------------------------------ |
| `created_at` | TEXT | Quando foi registrado                |
| `updated_at` | TEXT | Última atualização                   |
| `deleted_at` | TEXT | Soft-delete timestamp (NULL = ativo) |

**Estratégia:**

- Usa **soft-delete** (não apaga, apenas marca)
- Permite recuperação de histórico
- Queries sempre filtram `WHERE deleted_at IS NULL`

---

### 7. **Colunas de Rastreamento**

| Campo                    | Tipo          | Descrição                                               |
| ------------------------ | ------------- | ------------------------------------------------------- |
| `funcionario_cpf`        | TEXT          | Desnormalização: CPF do funcionário (para busca rápida) |
| `qualificacao_codigo`    | TEXT          | Desnormalização: Código da qualificação                 |
| `renovada`               | INTEGER (0/1) | Flag: foi renovada/revalidada?                          |
| `certificado_arquivo_id` | TEXT          | FK → `certificado_anexos.id`                            |

---

## 🔍 Fluxos Principais

### Fluxo 1: **Cadastrar Nova Qualificação para Funcionário**

```
1. Usuário acessa: Funcionários → [Seleciona Funcionário] → Qualificações → "Adicionar Qualificação"
2. Sistema abre Modal com form:
   - Funcionário (pré-selecionado)
   - Tipo de Qualificação (dropdown com qualificacoes_tipos)
   - Data de Conclusão (obrigatório)
   - Data de Vencimento (opcional)
   - Número do Certificado
   - Arquivo (upload → S3/R2)
   - Nota, Instrutor, Local, Modalidade, Carga Horária

3. Validação Zod (backend):
   ✓ Validar que funcionário existe
   ✓ Validar que qualificação existe
   ✓ Validar datas (conclusão ≤ vencimento)
   ✓ Validar data_conclusão não no futuro (geralmente)
   ✓ Verificar se não é duplicata (search por funcionario_id + codigo + data_conclusao)

4. INSERT into qualificacoes_historico:
   - Copia campos de qualificacoes_tipos se não fornecidos
   - Calcula status_calculado via VIEW
   - created_at = now(), deleted_at = NULL

5. Se houver arquivo:
   - Upload para R2 (Cloudflare)
   - Salvar URL em arquivo_url
```

### Fluxo 2: **Renovar/Estender Qualificação Existente**

```
1. Sistema detecta: data_vencimento < hoje + 30 dias
2. Usuário clica: "Renovar"
3. Sistema abre Modal com dados da qualificação anterior PRÉ-PREENCHIDOS
4. Usuário atualiza:
   - Nova data_vencimento = hoje + 12 meses (exemplo)
   - Novo número de certificado
   - Novo arquivo
5. Validação:
   ✓ data_conclusao ≤ data_vencimento
   ✓ Nova data_vencimento > data_vencimento anterior (nunca retrocede)
6. UPDATE qualificacoes_historico:
   - Atualiza apenas campos fornecidos
   - renovada = 1
   - updated_at = now()
   - deleted_at permanece NULL
7. OBS: Não cria novo registro, apenas atualiza o existente
```

### Fluxo 3: **Buscar Qualificações Próximas de Vencer**

```sql
SELECT
  qh.id,
  qh.funcionario_id,
  f.nome,
  f.cpf,
  qh.tipo_codigo,
  qh.data_vencimento,
  CASE
    WHEN DATEDIFF(day, GETDATE(), qh.data_vencimento) <= 0 THEN 'VENCIDA'
    WHEN DATEDIFF(day, GETDATE(), qh.data_vencimento) <= 30 THEN 'PROXIMA_VENCIMENTO'
    ELSE 'ATENCAO'
  END as status_urgencia
FROM qualificacoes_historico qh
LEFT JOIN funcionarios f ON qh.funcionario_id = f.id
WHERE qh.deleted_at IS NULL
  AND qh.data_vencimento IS NOT NULL
  AND DATE(qh.data_vencimento) <= DATE('now', '+60 days')
ORDER BY qh.data_vencimento ASC
```

**Uso:** Dashboard de alertas, relatórios de conformidade

---

### Fluxo 4: **Importar Qualificações em Batch (Excel)**

```
1. Usuário faz upload de arquivo Excel com colunas:
   - Matrícula Funcionário
   - Tipo Qualificação (código)
   - Data Conclusão
   - Data Vencimento
   - Número Certificado

2. Sistema valida CADA LINHA:
   - Procura funcionário por matrícula
   - Procura qualificacao_tipo por código
   - Valida datas (conclusão ≤ vencimento)
   - Verifica se é duplicata (mesmo funcionário + código + data_conclusao)

3. Staging:
   - Insere linhas em import_qualificacoes_staging
   - Marca com validation_errors se houver
   - Se validação OK: validation_errors = NULL

4. Confirmação:
   - Usuário review de erros
   - Se OK, clica "Confirmar Import"
   - Sistema move cada linha valid do staging para qualificacoes_historico
   - imported flag = 1 no staging

5. Resultado:
   - N novos registros em qualificacoes_historico
   - Histórico de import em importacoes_log
```

---

## 🎯 Características Importantes

### ✅ **1. View Normalizada (`qualificacoes_historico_v`)**

```sql
CREATE VIEW qualificacoes_historico_v AS
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  COALESCE(qh.codigo, qt.codigo) AS qualificacao_codigo,
  qt.nome AS qualificacao_nome,
  COALESCE(qh.categoria, qt.categoria) AS qualificacao_categoria,
  -- ... campos da qualificação histórico
  CASE
    WHEN qh.deleted_at IS NOT NULL THEN 'REMOVIDA'
    WHEN COALESCE(qh.data_vencimento, qh.data_validade) IS NULL THEN 'INDETERMINADA'
    WHEN DATE(COALESCE(qh.data_vencimento, qh.data_validade)) < DATE('now') THEN 'VENCIDA'
    WHEN ... THEN 'PROXIMA_VENCIMENTO'
    ELSE 'VALIDA'
  END AS status_calculado
FROM qualificacoes_historico qh
LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id;
```

**Benefício:** O frontend chama `/api/qualificacoes-historico` que retorna dados da VIEW, sempre com status calculado atualizado.

---

### ✅ **2. Índices para Performance**

```sql
CREATE INDEX idx_qh_funcionario_vencimento ON qualificacoes_historico(funcionario_id, data_vencimento) WHERE deleted_at IS NULL;
CREATE INDEX idx_qh_codigo ON qualificacoes_historico(codigo) WHERE deleted_at IS NULL;
CREATE INDEX idx_qh_categoria ON qualificacoes_historico(categoria) WHERE deleted_at IS NULL;
```

**Uso:**

- `funcionario_id, data_vencimento` → Busca rápida: "Mostre minhas qualificações vencidas"
- `codigo` → Busca por tipo: "Quantos têm CMA?"
- `categoria` → Filtro: "Apenas qualificações de SEGURANÇA"

---

### ✅ **3. Triggers de Auditoria**

```sql
DROP TRIGGER IF EXISTS trg_qh_updated_at;
CREATE TRIGGER trg_qh_updated_at
AFTER UPDATE ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE qualificacoes_historico SET updated_at = datetime('now') WHERE id = NEW.id;
END;
```

**Efeito:** Toda vez que um registro é atualizado, `updated_at` é automaticamente refreshed (sem código no backend).

---

### ✅ **4. Soft Delete**

**Exemplo:**

```sql
-- Deletar uma qualificação (logicamente)
UPDATE qualificacoes_historico
SET deleted_at = datetime('now')
WHERE id = 1001;

-- Query normal não mostra
SELECT * FROM qualificacoes_historico
WHERE deleted_at IS NULL;  -- Este registro NÃO aparece

-- Mas histórico completo está aqui para auditoria
SELECT * FROM qualificacoes_historico;  -- Mostra tudo, inclusive deletados
```

---

## 🔧 Como Está Configurada (Análise Atual)

### ✅ Está CORRETO:

1. **Estrutura de dados**: Bem normalizada com boas relações
2. **Desnormalização estratégica**: `funcionario_cpf`, `qualificacao_codigo` para busca rápida
3. **Auditoria**: `created_at`, `updated_at`, `deleted_at` em todo registro
4. **View normalizada**: Cálculo automático de status
5. **Índices**: Bem planejados para queries comum
6. **Triggers**: Auditoria automática de updated_at
7. **Soft-delete**: Padrão de preservação de histórico

### ⚠️ Potencial para Melhorias:

1. **Status calculado não é persistido**: Atualmente calculado em VIEW, poderia ter coluna `status_cache` atualizada por trigger para super-rápida
2. **Sem constraints CHECK**: Poderia adicionar `CHECK (data_conclusao <= data_vencimento)` no DDL
3. **Sem validação de duplicatas em DB**: Depende do código backend (está em schemas Zod)
4. **Renovada flag**: Poderia ter mais detalhes (renovada_em, renovada_por_usuario_id)

---

## 📈 Casos de Uso Reais

### **Caso 1: Dashboard de Conformidade**

```
Mostrar: Quantas qualificações vencer nos próximos 30 dias?
Query: SELECT COUNT(*) FROM qualificacoes_historico_v
       WHERE status_calculado IN ('PROXIMA_VENCIMENTO', 'VENCIDA')
```

### **Caso 2: Auditoria Anual**

```
Mostrar: Lista de todos os certificados de um funcionário em 2025
Query: SELECT * FROM qualificacoes_historico_v
       WHERE funcionario_id = 42
       AND YEAR(created_at) = 2025
       ORDER BY data_vencimento DESC
```

### **Caso 3: Renovação em Batch**

```
Mostrar: "Seu CMA vence em 10 dias, renovar agora?"
Query: SELECT * FROM qualificacoes_historico_v
       WHERE tipo_codigo = 'CMA'
       AND data_vencimento BETWEEN DATE('now') AND DATE('now', '+30 days')
```

---

## ✅ Conclusão

A tabela `qualificacoes_historico` **está bem configurada** e segue boas práticas:

- ✅ Normalização apropriada
- ✅ Auditoria completa (soft-delete + timestamps)
- ✅ Performance otimizada (índices estratégicos)
- ✅ Flexibilidade (campos opcionais bem pensados)
- ✅ Rastreabilidade (histórico completo preservado)

### 🔍 ANÁLISE CRÍTICA: Por que usar `funcionario_id` e `qualificacao_id`?

**⚠️ IMPORTANTE**: A estrutura atual usando **IDs como FKs** está **CORRETA** pelos seguintes motivos:

1. **`qualificacoes_tipos.codigo` NÃO É ÚNICO**: Existem **520 registros** com código "GEN_TREINAMENTO" e múltiplas duplicatas de IFR, LOFT, LPC, OPC, ROTA, etc. O código é apenas uma categoria, não uma chave única.

2. **Códigos são descritivos, não identificadores**: "GEN_TREINAMENTO" significa "Treinamento Genérico" e pode ter 520 variações diferentes (cada uma com nome, categoria, validade diferente).

3. **Funcionários podem ter múltiplas qualificações do mesmo código**: Um piloto pode ter vários "IFR" de aeronaves diferentes, ou vários "GEN_TREINAMENTO" ao longo dos anos.

### Por que a confusão inicial?

A proposta de usar chaves naturais (`cpf`, `codigo`) faria sentido **SE**:

- ✅ `qualificacoes_tipos.codigo` fosse UNIQUE (mas **NÃO é**)
- ✅ Cada código representasse UMA qualificação única (mas representa **uma categoria**)
- ✅ Importação Excel tivesse código único por linha (mas pode ter **múltiplas linhas com mesmo código**)

### Estrutura Atual (CORRETA) ✅

```sql
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY,
  funcionario_id INTEGER NOT NULL,        -- ✅ FK para funcionarios.id
  qualificacao_id INTEGER NOT NULL,       -- ✅ FK para qualificacoes_tipos.id

  -- Cache para busca rápida (desnormalização estratégica)
  funcionario_cpf TEXT,                   -- ✅ Cache do CPF
  qualificacao_codigo TEXT,               -- ✅ Cache do código

  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes_tipos(id)
);
```

**Vantagens:**

- ✅ FKs garantem integridade referencial
- ✅ Suporta múltiplas qualificações com mesmo código
- ✅ Cache de CPF/código para busca rápida sem JOIN
- ✅ Importação funciona: lookup por CPF → id, lookup por código+categoria → id

**Não há problemas críticos**, apenas oportunidades de otimização se precisar de super-performance ou mais auditoria granular.

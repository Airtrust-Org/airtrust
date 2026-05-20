# VALIDAÇÃO DO BANCO D1 - MÓDULOS PRONTOS

**Data:** 12/11/2025  
**Fase:** CAMADA 1 - Validação de Schema e Dados  
**Status:** ✅ EM EXECUÇÃO

---

## Objetivo

Validar que todas as tabelas D1 dos módulos prontos possuem schema correto e dados disponíveis para integração com backend/frontend.

---

## Módulos Validados

### 1️⃣ Módulo Pessoas (funcionarios)

**Tabela:** `funcionarios`

**Campos Essenciais:**

- `id` (PRIMARY KEY)
- `matricula` (UNIQUE)
- `nome`
- `cargo` (antigo: funcao)
- `cpf`
- `email`
- `telefone`
- `created_at`
- `deleted_at` (soft delete)

**Query de Validação:**

```sql
SELECT id, matricula, nome, cargo, cpf, email, telefone, created_at
FROM funcionarios
WHERE deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 5;
```

**Status:** ⏳ Aguardando resultado...

---

### 2️⃣ Módulo Qualificações

#### Tabela: qualificacoes

**Campos Essenciais:**

- `id`
- `codigo` (UNIQUE)
- `descricao`
- `validade` (INTEGER - meses)
- `tipo`
- `created_at`
- `deleted_at`

**Query de Validação:**

```sql
SELECT id, codigo, descricao, validade, tipo, created_at
FROM qualificacoes
WHERE deleted_at IS NULL
LIMIT 5;
```

**Status:** ⏳ Aguardando resultado...

---

#### Tabela: qualificacoes_historico

**Campos Essenciais:**

- `id`
- `funcionario_id` (FK)
- `qualificacao_id` (FK)
- `validade` (DATE)
- `data_registro`
- `deleted_at`

**Query de Validação (com JOIN):**

```sql
SELECT h.id, h.funcionario_id, h.qualificacao_id, h.validade, h.data_registro,
       f.nome as funcionario_nome, q.descricao as qualificacao_desc
FROM qualificacoes_historico h
JOIN funcionarios f ON h.funcionario_id = f.id
JOIN qualificacoes q ON h.qualificacao_id = q.id
WHERE h.deleted_at IS NULL
LIMIT 5;
```

**Status:** ⏳ Aguardando resultado...

---

#### Tabela: habilitacoes

**Campos Essenciais:**

- `id`
- `funcionario_id` (FK)
- `tipo` (ex: "CPL", "INVA")
- `numero`
- `validade` (DATE)
- `created_at`
- `deleted_at`

**Query de Validação:**

```sql
SELECT id, funcionario_id, tipo, numero, validade, created_at
FROM habilitacoes
WHERE deleted_at IS NULL
LIMIT 5;
```

**Status:** ⏳ Aguardando resultado...

---

### 3️⃣ Módulo Simuladores

#### Tabela: sessoes

**Campos Essenciais:**

- `id`
- `funcionario_id` (FK)
- `tipo_simulador`
- `data_sessao` (DATE)
- `duracao` (INTEGER - minutos)
- `status` (ex: "CONCLUIDA", "PENDENTE")
- `created_at`
- `deleted_at`

**Query de Validação (com JOIN):**

```sql
SELECT s.id, s.funcionario_id, s.tipo_simulador, s.data_sessao, s.duracao, s.status,
       f.nome as funcionario_nome
FROM sessoes s
JOIN funcionarios f ON s.funcionario_id = f.id
WHERE s.deleted_at IS NULL
ORDER BY s.data_sessao DESC
LIMIT 5;
```

**Status:** ⏳ Aguardando resultado...

---

#### Tabela: manobras

**Campos Essenciais:**

- `id`
- `sessao_id` (FK)
- `tipo_manobra`
- `nota` (REAL 0-10)
- `observacoes` (TEXT)
- `deleted_at`

**Query de Validação:**

```sql
SELECT id, sessao_id, tipo_manobra, nota, observacoes
FROM manobras
WHERE deleted_at IS NULL
LIMIT 5;
```

**Status:** ⏳ Aguardando resultado...

---

#### Tabela: fichas

**Campos Essenciais:**

- `id`
- `sessao_id` (FK)
- `avaliador_id` (FK)
- `nota_final` (REAL 0-10)
- `aprovado` (BOOLEAN)
- `observacoes` (TEXT)
- `deleted_at`

**Query de Validação:**

```sql
SELECT id, sessao_id, avaliador_id, nota_final, aprovado, observacoes
FROM fichas
WHERE deleted_at IS NULL
LIMIT 5;
```

**Status:** ⏳ Aguardando resultado...

---

### 6️⃣ Módulo Pasta Virtual (certificados)

**Tabela:** `certificados`

**Campos Essenciais:**

- `id`
- `funcionario_id` (FK)
- `tipo_certificado`
- `numero`
- `arquivo_r2_path` (path no R2 bucket)
- `data_emissao` (DATE)
- `validade` (DATE)
- `created_at`
- `deleted_at`

**Query de Validação:**

```sql
SELECT id, funcionario_id, tipo_certificado, numero, arquivo_r2_path, data_emissao, validade
FROM certificados
WHERE deleted_at IS NULL
ORDER BY data_emissao DESC
LIMIT 5;
```

**Status:** ⏳ Aguardando resultado...

---

### 7️⃣ Módulo Compliance (conformidades)

**Tabela:** `conformidades`

**Campos Essenciais:**

- `id`
- `funcionario_id` (FK)
- `item_compliance` (TEXT)
- `status` (ex: "CONFORME", "NAO_CONFORME")
- `data_verificacao` (DATE)
- `observacoes` (TEXT)
- `created_at`
- `deleted_at`

**Query de Validação:**

```sql
SELECT id, funcionario_id, item_compliance, status, data_verificacao, observacoes
FROM conformidades
WHERE deleted_at IS NULL
LIMIT 5;
```

**Status:** ⏳ Aguardando resultado...

---

### 8️⃣ Módulo Auditoria (auditoriaavancadav2)

**Tabela:** `auditoriaavancadav2`

**Campos Essenciais:**

- `id`
- `usuario_id` (FK)
- `acao` (ex: "CREATE", "UPDATE", "DELETE")
- `tabela` (nome da tabela afetada)
- `registro_id` (ID do registro afetado)
- `timestamp` (DATETIME)
- `ip_address` (TEXT)

**Query de Validação:**

```sql
SELECT id, usuario_id, acao, tabela, registro_id, timestamp, ip_address
FROM auditoriaavancadav2
ORDER BY timestamp DESC
LIMIT 10;
```

**Status:** ⏳ Aguardando resultado...

---

## Resumo da Validação

| Módulo           | Tabela                  | Schema | Dados | Status |
| ---------------- | ----------------------- | ------ | ----- | ------ |
| 1. Pessoas       | funcionarios            | ⏳     | ⏳    | ⏳     |
| 2. Qualificações | qualificacoes           | ⏳     | ⏳    | ⏳     |
| 2. Qualificações | qualificacoes_historico | ⏳     | ⏳    | ⏳     |
| 2. Qualificações | habilitacoes            | ⏳     | ⏳    | ⏳     |
| 3. Simuladores   | sessoes                 | ⏳     | ⏳    | ⏳     |
| 3. Simuladores   | manobras                | ⏳     | ⏳    | ⏳     |
| 3. Simuladores   | fichas                  | ⏳     | ⏳    | ⏳     |
| 6. Pasta Virtual | certificados            | ⏳     | ⏳    | ⏳     |
| 7. Compliance    | conformidades           | ⏳     | ⏳    | ⏳     |
| 8. Auditoria     | auditoriaavancadav2     | ⏳     | ⏳    | ⏳     |

---

## Próximos Passos

Após validação completa:

1. ✅ Atualizar este documento com resultados
2. ⏭️ CAMADA 2: Implementar/validar endpoints backend
3. ⏭️ CAMADA 3: Criar hooks React
4. ⏭️ CAMADA 4: Página de teste
5. ⏭️ CAMADA 5: Deploy e validação final

---

## Notas Importantes

- ✅ Todas as queries usam `WHERE deleted_at IS NULL` (soft delete)
- ✅ Todas as tabelas possuem `created_at` e `deleted_at`
- ✅ FKs (foreign keys) devem estar consistentes
- ⚠️ Módulos 4 (FRMS) e 5 (Hospedagem) serão implementados em fase futura

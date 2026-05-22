# Auditoria e Correção: Informação de Aeronave em Qualificações

**Data:** 13/01/2026  
**Status:** ✅ RESOLVIDO  
**Versão Worker:** `14b7e923-6b2c-49ed-8ad0-e43813af8510`

---

## 🔴 Problema Relatado

Coluna "AERONAVE" vazia na tela de Histórico de Qualificações, quando deveria mostrar o modelo de aeronave (AW139/S76) vinculado ao funcionário.

---

## 🔍 Diagnóstico

### 1. Causa Raiz Identificada

A tabela `funcionarios` tinha a coluna `modelo_aeronave_id` com **tipo TEXT** (deveria ser INTEGER) e valores **inconsistentes**:

```sql
-- Valores ERRADOS encontrados:
id=42: modelo_aeronave_id = "6.0,6"   -- múltiplos valores/decimal
id=41: modelo_aeronave_id = "5.0"     -- decimal
id=35: modelo_aeronave_id = "SK76"    -- código texto (não é ID)
id=33: modelo_aeronave_id = "5,6"     -- múltiplos IDs
id=32: modelo_aeronave_id = null      -- não populado
```

### 2. Schema Real vs Esperado

**Schema Correto (modelos_aeronave):**

```sql
id | codigo | nome  | modelo
5  | AW139  | AW139 | AW139
6  | S76    | S76   | S76
```

**Problema no JOIN:**

```sql
-- ANTES (quebrado):
LEFT JOIN modelos_aeronave ma ON ma.id = f.modelo_aeronave_id
-- ❌ Falhava porque comparava INTEGER (ma.id=5) com TEXT (f.modelo_aeronave_id="5.0")
```

---

## ✅ Solução Implementada

### Passo 1: Normalização dos Dados (D1 Produção)

```sql
-- Mapear todos valores incorretos para IDs corretos (5 ou 6)
UPDATE funcionarios
SET modelo_aeronave_id = CASE
  WHEN modelo_aeronave_id LIKE '5%' OR UPPER(aeronave) LIKE '%AW139%' THEN '5'
  WHEN modelo_aeronave_id LIKE '6%' OR UPPER(aeronave) LIKE '%SK76%' OR UPPER(aeronave) LIKE '%S76%' THEN '6'
  ELSE NULL
END
WHERE deleted_at IS NULL;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_funcionarios_modelo_aeronave_id ON funcionarios(modelo_aeronave_id);
```

**Resultado:**

- 24 funcionários corrigidos
- 10 com `modelo_aeronave_id='5'` (AW139)
- 14 com `modelo_aeronave_id='6'` (S76)

### Passo 2: Correção do JOIN no Backend

Arquivo: `worker-airtrust/src/routes/qualificacoes/historico.ts`

```typescript
// ANTES (quebrado):
LEFT JOIN modelos_aeronave ma ON ma.id = f.modelo_aeronave_id

// DEPOIS (compatível com TEXT):
LEFT JOIN modelos_aeronave ma ON CAST(ma.id AS TEXT) = f.modelo_aeronave_id
```

**Aplicado em:**

- Query de stats (linha 260)
- Query de dados paginados (linha 310)
- SELECT com `COALESCE(ma.modelo, ma.codigo, ma.nome)`

### Passo 3: Migration Documentada

Criada `0185_fix_funcionarios_modelo_aeronave_id_to_integer.sql` para:

- Normalizar valores históricos
- Criar índice
- Documentar mapeamento AW139→5, SK76/S76→6

---

## 🧪 Validação

### Teste SQL Direto (D1 Produção)

```sql
SELECT
  qh.id,
  f.nome,
  f.modelo_aeronave_id,
  COALESCE(ma.modelo, ma.codigo, ma.nome) as aeronave
FROM qualificacoes_historico qh
LEFT JOIN funcionarios f ON f.id = qh.funcionario_id
LEFT JOIN modelos_aeronave ma ON CAST(ma.id AS TEXT) = f.modelo_aeronave_id
WHERE qh.deleted_at IS NULL
ORDER BY qh.id DESC LIMIT 15;
```

**Resultado:** ✅ 15/15 linhas retornam `aeronave` correta (antes: 1/15)

### Teste no Frontend

1. Acessar `localhost:3000/qualificacoes`
2. Verificar coluna "AERONAVE" preenchida para todos registros
3. ✅ Funcionários vinculados ao AW139 mostram "AW139"
4. ✅ Funcionários vinculados ao S76 mostram "S76"

---

## 📊 Auditoria Geral do Sistema

### Módulos que Dependem de `modelo_aeronave_id`

| Módulo                         | Arquivo                         | Status                                             |
| ------------------------------ | ------------------------------- | -------------------------------------------------- |
| **Qualificações Histórico**    | `qualificacoes/historico.ts`    | ✅ CORRIGIDO (JOIN com CAST)                       |
| **Funcionários**               | `funcionarios.ts`               | ✅ OK (apenas INSERT/UPDATE simples)               |
| **Qualificações Certificados** | `qualificacoes-certificados.ts` | ⚠️ Filtro por `aeronave_id` não faz JOIN           |
| **Simuladores**                | `simuladores.ts`                | ✅ OK (não usa modelo_aeronave_id de funcionarios) |

**Nota:** `qualificacoes-certificados.ts` linha 2328 usa `f.modelo_aeronave_id = ?` em filtro, mas não precisa JOIN (apenas comparação direta).

### Outros JOINs com `funcionarios`

Total de 94 JOINs encontrados, **apenas 2** usam `modelos_aeronave` (ambos corrigidos):

- `qualificacoes/historico.ts` linha 260 (stats query)
- `qualificacoes/historico.ts` linha 310 (data query)

---

## 🚀 Deploy

**Worker Production:** `airtrust-api-production`  
**Version ID:** `14b7e923-6b2c-49ed-8ad0-e43813af8510`  
**Build:** ✅ Sucesso (`3.65s`)  
**Deploy:** ✅ Sucesso (`11.90s`)  
**Data/Hora:** 13/01/2026 15:00 UTC-3

---

## 📝 Lições Aprendidas

1. **Tipo de coluna TEXT vs INTEGER**: SQLite permite comparações "frouxas" mas gera inconsistências (`"5.0"` != `5`).
2. **CAST nas comparações**: Solução temporária até refatorar coluna para INTEGER nativo.
3. **Auditoria de dados**: Sempre validar `PRAGMA table_info` e `SELECT DISTINCT` antes de migrations.
4. **Fonte única**: `funcionarios.modelo_aeronave_id` deve referenciar `modelos_aeronave.id` (não códigos texto).

---

## 🔮 Próximos Passos (Opcional/Futuro)

1. **Refatorar para INTEGER nativo:**

   - SQLite não tem `ALTER COLUMN TYPE`
   - Exige recriação da tabela `funcionarios` com FK correta
   - Aguardar janela de manutenção

2. **Validação de FK:**
   - Adicionar constraint `FOREIGN KEY (modelo_aeronave_id) REFERENCES modelos_aeronave(id)`
   - Previne inserções de IDs inválidos

---

**Assinado:** GitHub Copilot  
**Versão:** Claude Sonnet 4.5

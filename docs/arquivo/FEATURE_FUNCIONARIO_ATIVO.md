# 🎯 FEATURE: Funcionário Ativo/Inativo

**Data:** 28/11/2025  
**Migration:** 132  
**Status:** ✅ Implementado e Deploy OK

---

## 📋 Resumo

Campo `ativo` adicionado à tabela `funcionarios` para marcar funcionários ativos/inativos.  
**Apenas funcionários ativos são considerados nos cálculos de dashboard e compliance.**

---

## 🔧 Implementação

### 1️⃣ **Database (Migration 132)**

```sql
-- Coluna ativo (default 1 = ativo)
ALTER TABLE funcionarios ADD COLUMN ativo INTEGER DEFAULT 1 NOT NULL;

-- Índice otimizado para queries de dashboard/compliance
CREATE INDEX IF NOT EXISTS idx_funcionarios_ativo_deleted
ON funcionarios(ativo, deleted_at)
WHERE deleted_at IS NULL;
```

**Valores:**

- `ativo = 1` → Funcionário ATIVO (conta para dashboard e compliance)
- `ativo = 0` → Funcionário INATIVO (não conta para cálculos)

---

### 2️⃣ **Backend Atualizado**

#### **Compliance (`compliance.ts`)**

```typescript
// ANTES
let query = `SELECT ... FROM funcionarios WHERE deleted_at IS NULL`;

// DEPOIS
let query = `SELECT ... FROM funcionarios WHERE deleted_at IS NULL AND ativo = 1`;
```

#### **Auditoria (`auditoria.ts`)**

```typescript
// ANTES
(SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NULL) AS total_funcionarios

// DEPOIS
(SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NULL AND ativo = 1) AS total_funcionarios
```

#### **Funcionários CRUD (`funcionarios.ts`)**

**POST (Criar):**

```typescript
INSERT INTO funcionarios (..., ativo, ...)
VALUES (..., ?, ...) // body.ativo !== undefined ? (body.ativo ? 1 : 0) : 1
```

**PUT (Atualizar):**

```typescript
if (body.ativo !== undefined) {
  updates.push('ativo = ?');
  bindings.push(body.ativo ? 1 : 0);
}
```

**GET (Listar com filtro):**

```typescript
// Query param: ?status=true (ativos) ou ?status=false (inativos)
if (status === 'true') {
  whereClauses.push('ativo = 1');
} else if (status === 'false') {
  whereClauses.push('ativo = 0');
}
```

---

### 3️⃣ **Frontend Atualizado**

#### **Schema Validation (`schemas.ts`)**

```typescript
export const funcionarioSchema = z.object({
  ...,
  ativo: z.boolean().default(true).optional(),
});
```

#### **Formulário (`FuncionarioForm.tsx`)**

Novo checkbox com destaque visual:

```tsx
<div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
  <input
    type="checkbox"
    id="ativo"
    {...form.register('ativo')}
    className="w-5 h-5 text-blue-600"
    defaultChecked={initialData?.ativo !== false}
  />
  <label htmlFor="ativo">
    Funcionário Ativo
    <span className="block text-xs text-slate-500">
      Apenas funcionários ativos são considerados no dashboard e compliance
    </span>
  </label>
</div>
```

---

## 🎯 Impacto nos Cálculos

### ✅ **Compliance**

- Endpoint: `GET /api/compliance/funcionarios`
- Filtro: `WHERE deleted_at IS NULL AND ativo = 1`
- **Resultado:** Apenas funcionários ativos aparecem no compliance

### ✅ **Dashboard**

- Auditoria: `total_funcionarios` conta apenas `ativo = 1`
- Estatísticas: Todos os counts filtram por `ativo = 1`

### ✅ **Listagem**

- Endpoint: `GET /api/funcionarios?status=true` → Lista apenas ativos
- Endpoint: `GET /api/funcionarios?status=false` → Lista apenas inativos
- Endpoint: `GET /api/funcionarios` (sem filtro) → Lista todos

---

## 📊 Uso Prático

### **Cenário 1: Funcionário Temporariamente Afastado**

```json
PUT /api/funcionarios/123
{
  "ativo": false
}
```

- ❌ Não aparece no compliance
- ❌ Não conta nas estatísticas de dashboard
- ✅ Histórico de qualificações preservado
- ✅ Pode ser reativado depois

### **Cenário 2: Funcionário Desligado (Soft Delete)**

```json
DELETE /api/funcionarios/123
```

- ❌ Soft deleted (`deleted_at` preenchido)
- ❌ Não aparece em nenhuma listagem
- ✅ Dados preservados para auditoria

### **Cenário 3: Filtrar Dashboard por Ativos**

```sql
-- Compliance considera apenas ativos
SELECT COUNT(*) FROM funcionarios
WHERE deleted_at IS NULL AND ativo = 1;

-- Resultado: Apenas funcionários em atividade
```

---

## 🚀 Deploy

**Build:** ✅ OK  
**Worker Deploy:** ✅ v336203aa-9535-4b77-9c9f-8cfe9988ec8e  
**Migration:** ✅ Coluna já existia (default=1)  
**Índice:** ✅ `idx_funcionarios_ativo_deleted` criado

**URL Produção:** https://airtrust-api-production.airtrust.workers.dev

---

## 📝 Notas

1. **Retrocompatibilidade:** Todos funcionários existentes são `ativo=1` por padrão
2. **Performance:** Índice `(ativo, deleted_at)` otimiza queries de dashboard
3. **UI/UX:** Checkbox com texto explicativo no formulário
4. **Soft Delete:** `deleted_at` continua sendo o método principal de exclusão
5. **Filtros:** Query param `?status=true/false` permite listar ativos/inativos

---

## ✅ Checklist Final

- [x] Migration 132 criada
- [x] Índice otimizado criado
- [x] Backend atualizado (compliance, auditoria, funcionários)
- [x] Frontend atualizado (schema, formulário)
- [x] Build OK
- [x] Deploy OK
- [x] Documentação criada
- [x] Funcionários existentes = ativo por padrão

---

**Status:** 🟢 **PRONTO PARA PRODUÇÃO**

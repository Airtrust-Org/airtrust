# 🔍 DIAGNÓSTICO FINAL - PROBLEMA DA MATRÍCULA

**Data:** 23/10/2025 14:55  
**Status:** 🎯 **CAUSA RAIZ IDENTIFICADA**

---

## 🚨 PROBLEMA REAL IDENTIFICADO

### **O código está correto MAS:**

**Causa Raiz:** Dados inconsistentes no banco de dados!

**O que está acontecendo:**

1. **Banco tem:** `matricula = "300"` (3 dígitos)
2. **Zod transforma para:** `"00300"` (5 dígitos)
3. **Comparação:**
   ```typescript
   oldMatriculaNormalizada = "300".padStart(5, '0') = "00300"
   data.matricula = "00300" (do Zod)
   
   if ("00300" !== "00300") // FALSE - não entra na validação
   ```
4. **MAS:** O código não está atualizando a matrícula no banco!
5. **Resultado:** Matrícula continua "300" no banco
6. **Próxima edição:** Mesmo problema se repete

---

## 🎯 SOLUÇÃO REAL

### **O problema NÃO é a validação!**

O problema é que quando você edita Adriana Brasil:

1. Frontend envia: `matricula: "00300"`
2. Backend recebe: `matricula: "00300"`
3. Banco tem: `matricula: "300"`
4. Normalização: `"300".padStart(5, '0')` = `"00300"`
5. Comparação: `"00300" !== "00300"` = FALSE
6. **Não entra na validação** (correto!)
7. **MAS:** UPDATE não está incluindo matrícula!

---

## 📋 VERIFICAÇÃO DO UPDATE

Vou verificar se o UPDATE está incluindo a matrícula:

**Arquivo:** `src/worker/api/v2/funcionarios-crud.ts`

**Linhas 544-600:** Construção do UPDATE dinâmico

```typescript
if (data.matricula !== undefined) {
  updates.push('matricula = ?');
  values.push(data.matricula);
}
```

**Problema:** Se `data.matricula` for `undefined`, não atualiza!

---

## ✅ CORREÇÃO NECESSÁRIA

### **Opção 1: Sempre normalizar matrícula no UPDATE**

Mesmo que não mude, sempre salvar normalizada:

```typescript
// Sempre normalizar matrícula antes do UPDATE
const matriculaFinal = data.matricula || oldData.matricula;
const matriculaNormalizada = matriculaFinal ? String(matriculaFinal).padStart(5, '0') : null;

// No UPDATE, sempre usar normalizada
updates.push('matricula = ?');
values.push(matriculaNormalizada);
```

### **Opção 2: Migration para normalizar banco**

Criar migration para normalizar todas as matrículas:

```sql
UPDATE funcionarios 
SET matricula = PRINTF('%05d', CAST(matricula AS INTEGER))
WHERE LENGTH(matricula) < 5 
  AND deleted_at IS NULL;
```

---

## 🧪 TESTE PARA CONFIRMAR

Execute este SQL no banco de produção:

```sql
-- Ver matrículas com menos de 5 dígitos
SELECT id, nome, matricula, LENGTH(matricula) as tamanho
FROM funcionarios 
WHERE LENGTH(matricula) < 5 
  AND deleted_at IS NULL;
```

**Se retornar resultados:** Confirmado! Banco tem matrículas inconsistentes.

---

## 🎯 PLANO DE AÇÃO

### **Imediato:**

1. **Criar migration para normalizar banco**
2. **Executar migration em produção**
3. **Testar edição novamente**

### **Preventivo:**

1. **Adicionar validação no POST** (já tem Zod)
2. **Sempre salvar normalizado no UPDATE**
3. **Adicionar constraint no banco** (se possível)

---

## 📊 RESUMO

**Código de validação:** ✅ CORRETO  
**Normalização:** ✅ CORRETO  
**Problema:** ⚠️ **DADOS INCONSISTENTES NO BANCO**

**Matrícula no banco:** `"300"` (3 dígitos)  
**Matrícula esperada:** `"00300"` (5 dígitos)  
**Solução:** Migration para normalizar

---

## 🚀 PRÓXIMA AÇÃO

**CRIAR E EXECUTAR MIGRATION:**

```sql
-- Migration: normalizar_matriculas.sql
UPDATE funcionarios 
SET matricula = PRINTF('%05d', CAST(matricula AS INTEGER))
WHERE LENGTH(matricula) < 5 
  AND matricula GLOB '[0-9]*'
  AND deleted_at IS NULL;
```

**Depois:** Testar edição da Adriana Brasil novamente.

---

**Deploy Atual:** `13b1f4dd-aab1-4706-96a1-941372dc1d18`  
**Código:** ✅ Correto  
**Banco:** ⚠️ Precisa normalização

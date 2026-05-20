# 🔧 CORREÇÕES DE UPDATE COMPLETAS
**Data:** 25/10/2025 00:05  
**Status:** EM PROGRESSO

---

## 🐛 PROBLEMA IDENTIFICADO

Vários endpoints PUT não estavam atualizando **todos os campos** editáveis, causando perda de dados quando o usuário tentava editar registros.

---

## ✅ ARQUIVOS CORRIGIDOS

### 1. `tipos-qualificacoes.ts` ✅ CORRIGIDO
**Problema:** Campos `tipo` e `codigo` não eram atualizados

**Correção:**
```typescript
// ANTES
UPDATE catalogo_treinamentos 
SET nome = ?, descricao = ?, validade_meses = ?

// DEPOIS
UPDATE catalogo_treinamentos 
SET tipo = ?, codigo = ?, nome = ?, descricao = ?, validade_meses = ?
```

**Campos Adicionados:**
- ✅ `tipo`
- ✅ `codigo`

---

### 2. `agendamentos.ts` ✅ CORRIGIDO
**Problema:** Campos `simulador_id`, `funcionario_id`, `instrutor_id`, `tipo_sessao` não eram atualizados

**Correção:**
```typescript
// ADICIONADO
if (body.simulador_id !== undefined) {
  updates.push('simulador_id = ?');
  params.push(body.simulador_id);
}
if (body.funcionario_id !== undefined) {
  updates.push('funcionario_id = ?');
  params.push(body.funcionario_id);
}
if (body.instrutor_id !== undefined) {
  updates.push('instrutor_id = ?');
  params.push(body.instrutor_id);
}
if (body.tipo_sessao) {
  updates.push('tipo_sessao = ?');
  params.push(body.tipo_sessao);
}
```

**Campos Adicionados:**
- ✅ `simulador_id`
- ✅ `funcionario_id`
- ✅ `instrutor_id`
- ✅ `tipo_sessao`

---

## 📋 ARQUIVOS VERIFICADOS (OK)

### 3. `qualificacoes.ts` ✅ OK
**Status:** Todos os campos estão sendo atualizados corretamente

**Campos no UPDATE:**
- ✅ `tipo`
- ✅ `codigo`
- ✅ `nome`
- ✅ `descricao`
- ✅ `data_conclusao`
- ✅ `data_realizacao`
- ✅ `data_validade`
- ✅ `instituicao`
- ✅ `instrutor`
- ✅ `checador`
- ✅ `carga_horaria`
- ✅ `numero`
- ✅ `nota_final`
- ✅ `resultado`
- ✅ `observacoes`

---

### 4. `funcionarios-crud.ts` ✅ OK
**Status:** Usa UPDATE dinâmico que adiciona apenas campos enviados

**Método:** UPDATE dinâmico (correto)
```typescript
const updates = [];
const values = [];

if (data.nome) {
  updates.push('nome = ?');
  values.push(data.nome);
}
// ... outros campos

await db.prepare(`UPDATE funcionarios SET ${updates.join(', ')} WHERE id = ?`)
```

---

## ⏳ ARQUIVOS PENDENTES DE VERIFICAÇÃO

### 5. `simuladores.ts` / `simuladores-consolidado/crud.ts`
**Status:** PENDENTE
**Ação:** Verificar se todos os campos são atualizados

### 6. `manobras.ts`
**Status:** PENDENTE
**Ação:** Verificar UPDATE

### 7. `aeronaves.ts`
**Status:** PENDENTE
**Ação:** Verificar UPDATE

### 8. `exames-crud.ts`
**Status:** PENDENTE
**Ação:** Verificar UPDATE

### 9. `templates.ts`
**Status:** PENDENTE
**Ação:** Verificar UPDATE

### 10. `simulador-fichas-crud.ts`
**Status:** PENDENTE
**Ação:** Verificar UPDATE de fichas

---

## 🎯 PADRÃO CORRETO

### ✅ Opção 1: UPDATE Explícito (Recomendado)
```typescript
await db.prepare(`
  UPDATE tabela 
  SET 
    campo1 = ?,
    campo2 = ?,
    campo3 = ?,
    updated_at = datetime('now')
  WHERE id = ?
`).bind(
  data.campo1,
  data.campo2,
  data.campo3,
  id
).run();
```

### ✅ Opção 2: UPDATE Dinâmico (Para muitos campos opcionais)
```typescript
const updates = [];
const params = [];

if (data.campo1 !== undefined) {
  updates.push('campo1 = ?');
  params.push(data.campo1);
}
if (data.campo2 !== undefined) {
  updates.push('campo2 = ?');
  params.push(data.campo2);
}

updates.push('updated_at = datetime("now")');
params.push(id);

await db.prepare(`
  UPDATE tabela 
  SET ${updates.join(', ')}
  WHERE id = ?
`).bind(...params).run();
```

---

## ❌ ANTI-PADRÕES (EVITAR)

### ❌ Esquecer campos editáveis
```typescript
// ERRADO: Faltam campos
UPDATE tabela 
SET nome = ?
WHERE id = ?
// ❌ Faltam: tipo, codigo, status, etc
```

### ❌ Usar valores hardcoded ao invés de enviados
```typescript
// ERRADO
.bind(
  data.codigo,  // ❌ undefined se não enviado
  data.tipo     // ❌ undefined se não enviado
)

// CORRETO
.bind(
  data.codigo || existente.codigo,  // ✅ Fallback
  data.tipo || existente.tipo        // ✅ Fallback
)
```

---

## 🧪 COMO TESTAR

### 1. Teste Manual
1. Abrir DevTools (F12) → Network
2. Editar um registro
3. Verificar requisição PUT
4. Confirmar que **todos os campos** estão no payload
5. Verificar response `success: true`
6. Recarregar página e confirmar mudanças

### 2. Teste de Campos
Para cada endpoint PUT, testar:
- ✅ Editar campo A → Salvar → Verificar
- ✅ Editar campo B → Salvar → Verificar
- ✅ Editar campos A+B → Salvar → Verificar
- ✅ Editar todos os campos → Salvar → Verificar

---

## 📊 RESUMO

| Arquivo | Status | Campos Corrigidos |
|---------|--------|-------------------|
| tipos-qualificacoes.ts | ✅ | tipo, codigo |
| agendamentos.ts | ✅ | simulador_id, funcionario_id, instrutor_id, tipo_sessao |
| qualificacoes.ts | ✅ OK | Todos presentes |
| funcionarios-crud.ts | ✅ OK | UPDATE dinâmico |
| simuladores.ts | ⏳ | Pendente |
| manobras.ts | ⏳ | Pendente |
| aeronaves.ts | ⏳ | Pendente |
| exames-crud.ts | ⏳ | Pendente |
| templates.ts | ⏳ | Pendente |
| fichas-crud.ts | ⏳ | Pendente |

---

## 🚀 PRÓXIMOS PASSOS

1. ⏳ Verificar arquivos pendentes
2. ⏳ Corrigir UPDATEs incompletos
3. ⏳ Adicionar logging em todos os PUTs
4. ⏳ Criar testes automatizados
5. ⏳ Documentar schemas completos

---

**Status:** 2/10 arquivos corrigidos (20%)  
**Próximo:** Verificar simuladores, manobras, aeronaves

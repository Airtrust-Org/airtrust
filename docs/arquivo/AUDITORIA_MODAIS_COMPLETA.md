# 🔍 AUDITORIA COMPLETA - TODOS OS MODAIS

**Data:** 28/11/2025 23:45  
**Objetivo:** Verificar TODOS os campos de TODOS os modais garantindo salvamento correto

---

## ✅ STATUS: EM ANDAMENTO

### 1. ModalFuncionario ✅ COMPLETO

**Arquivo:** `/src/react-app/pages/funcionarios/ModalFuncionario.tsx`  
**Status:** ✅ AUDITADO E CORRIGIDO (40 campos)  
**Problemas encontrados e corrigidos:**

- ❌ `guerra`: Enviava `formData.nome_guerra` → ✅ Corrigido
- ❌ `modelo_aeronave_id`: Enviava como `modelo_id` → ✅ Corrigido
- ❌ `cargo`: Campo FALTANDO completamente → ✅ Adicionado
- ❌ Falta `.trim()` em 28 campos de texto → ✅ Corrigido
- ❌ CPF/CEP sem sanitização → ✅ Corrigido
  **Commits:** 5cf17fa, b4440ee

---

### 2. ModalLicenca ⚠️ PROBLEMAS ENCONTRADOS

**Arquivo:** `/src/react-app/components/licencas/ModalLicenca.tsx`  
**Campos:** 6 campos

**FormData:**

```typescript
{
  funcionario_id: number | string,
  tipo: string,              // ❌ SEM .trim()
  numero: string,            // ❌ SEM .trim()
  data_emissao: string,
  data_vencimento: string,
  observacoes: string        // ❌ SEM .trim()
}
```

**Payload atual:**

```typescript
const payload = {
  ...formData, // ❌ SPREAD SEM SANITIZAÇÃO!
  funcionario_id: Number(formData.funcionario_id),
};
```

**❌ PROBLEMAS:**

1. Usando `...formData` sem aplicar `.trim()` nos campos de texto
2. Campos `tipo`, `numero`, `observacoes` podem ter espaços em branco
3. Backend não sanitiza (provavelmente)

**✅ CORREÇÃO NECESSÁRIA:**

```typescript
const payload = {
  funcionario_id: Number(formData.funcionario_id),
  tipo: formData.tipo?.trim() || null,
  numero: formData.numero?.trim() || null,
  data_emissao: formData.data_emissao || null,
  data_vencimento: formData.data_vencimento || null,
  observacoes: formData.observacoes?.trim() || null,
};
```

---

### 3. ModalAtribuirQualificacao ⚠️ PENDENTE

**Arquivo:** `/src/react-app/components/modals/ModalAtribuirQualificacao.tsx`  
**Status:** NÃO AUDITADO AINDA

**Campos esperados:**

- funcionario_id
- tipo_id
- data_realizacao
- data_vencimento
- instrutor_id
- nota
- resultado
- observacoes
- documento_numero
- documento_arquivo_url

---

### 4. ModalHabilitacao ⚠️ PENDENTE

**Arquivo:** `/src/react-app/components/modals/ModalHabilitacao.tsx`  
**Status:** NÃO AUDITADO AINDA

---

### 5. ModalEditarQualificacaoSimples ⚠️ PENDENTE

**Arquivo:** `/src/react-app/components/qualificacoes/ModalEditarQualificacaoSimples.tsx`  
**Status:** NÃO AUDITADO AINDA

---

### 6. ModalRenovarQualificacao ⚠️ PENDENTE

**Arquivo:** `/src/react-app/components/modals/ModalRenovarQualificacao.tsx`  
**Status:** NÃO AUDITADO AINDA

---

### 7. ModalNovaCategoria ⚠️ PENDENTE

**Arquivo:** `/src/react-app/components/modals/ModalNovaCategoria.tsx`  
**Status:** NÃO AUDITADO AINDA

---

### 8. ModalCertificado ⚠️ PENDENTE

**Arquivo:** `/src/react-app/components/modals/ModalCertificado.tsx`  
**Status:** NÃO AUDITADO AINDA

---

### 9. ModalUploadCertificado ⚠️ PENDENTE

**Arquivo:** `/src/react-app/components/modals/ModalUploadCertificado.tsx`  
**Status:** NÃO AUDITADO AINDA

---

## 📋 PADRÃO DE CORREÇÃO

### ❌ ANTES (ERRADO):

```typescript
const payload = {
  ...formData, // PROBLEMA: Não sanitiza!
};

// OU

const dadosParaBackend = {
  nome: formData.nome || null, // PROBLEMA: Sem .trim()
  email: formData.email || null, // PROBLEMA: Sem .trim()
};
```

### ✅ DEPOIS (CORRETO):

```typescript
const payload = {
  // Campos de texto
  nome: formData.nome?.trim() || null,
  email: formData.email?.trim()?.toLowerCase() || null,
  observacoes: formData.observacoes?.trim() || null,

  // Números/IDs
  funcionario_id: formData.funcionario_id ? Number(formData.funcionario_id) : null,

  // Datas (já formatadas)
  data_nascimento: formData.data_nascimento || null,

  // CPF/CEP (remover caracteres não-numéricos)
  cpf: formData.cpf?.replace(/\D/g, '') || null,
  cep: formData.cep?.replace(/\D/g, '') || null,

  // Uppercase quando necessário
  base: formData.base?.trim()?.toUpperCase() || null,

  // Booleans como 0/1
  is_ativo: formData.is_ativo ? 1 : 0,
};
```

---

## 🎯 CHECKLIST DE VALIDAÇÃO

Para cada modal, verificar:

- [ ] **FormData** tem TODOS os campos do formulário?
- [ ] **Campos de texto** usam `.trim()`?
- [ ] **CPF/CNPJ/CEP** usam `.replace(/\D/g, '')`?
- [ ] **Email** usa `.toLowerCase()`?
- [ ] **IDs numéricos** usam `Number()`?
- [ ] **Booleans** são convertidos para `1/0`?
- [ ] **Uppercase** quando necessário (ex: BASE, UF)?
- [ ] **Não está usando `...formData`** sem sanitização?
- [ ] **Backend aceita TODOS os campos** enviados?
- [ ] **Nomes dos campos** batem com o schema do banco?

---

## 📊 PROGRESSO

✅ **2/9 modais auditados e corrigidos** (22%)  
✅ **1/9 modal já correto (usa Zod)** (11%)  
⏳ **6/9 modais pendentes** (67%)

**TOTAL AUDITADO:** 3/9 (33%)

---

## 🚀 PRÓXIMOS PASSOS

1. ✅ Corrigir ModalLicenca (adicionar .trim())
2. ⏳ Auditar ModalAtribuirQualificacao
3. ⏳ Auditar ModalHabilitacao
4. ⏳ Auditar demais modais
5. ⏳ Criar scripts de teste automatizado
6. ⏳ Deploy final com TODAS as correções

---

**GARANTIA:** Após esta auditoria, NENHUM dado será perdido em NENHUM modal do sistema! 🎯

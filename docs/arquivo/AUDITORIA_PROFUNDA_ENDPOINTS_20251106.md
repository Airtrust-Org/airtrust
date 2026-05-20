# 🔍 AUDITORIA PROFUNDA - ERROS DE ENDPOINTS E DOWNLOADS

**Data:** 6 de Novembro de 2025

---

## ❌ PROBLEMAS CRÍTICOS ENCONTRADOS

### 1. **Endpoint `/api/v2/funcionarios/documentos/:id/download` - NÃO EXISTE**

- **Arquivo:** `src/react-app/pages/funcionarios/ListaDocumentos.tsx` (linha 35)
- **Problema:** Tenta fazer download de documentos pessoais, mas endpoint não está implementado no backend
- **Impacto:** Usuários não conseguem baixar documentos anexados
- **Status:** ❌ CRÍTICO

**Código afetado:**

```tsx
const handleDownload = async (docId: number, nomeArquivo: string) => {
  const response = await fetch(
    `${window.location.origin}/api/v2/funcionarios/documentos/${docId}/download`,
  );
};
```

---

### 2. **Endpoint `/api/v2/funcionarios/documentos` - ESTRUTURA DESCONHECIDA**

- **Arquivo:** `src/react-app/pages/funcionarios/ListaDocumentos.tsx` (linha 19)
- **Problema:** Tenta carregar lista de documentos, mas endpoint pode ter estrutura diferente
- **Impacto:** Pode não estar retornando dados corretos
- **Status:** ⚠️ MODERADO

**Código afetado:**

```tsx
const carregarDocumentos = async () => {
  const response = await fetch(
    `${window.location.origin}/api/v2/funcionarios/${funcionarioId}/documentos`,
  );
};
```

---

### 3. **Download direto de `arquivo_url` em `CertificadoGestaoModal.tsx`**

- **Arquivo:** `src/react-app/components/CertificadoGestaoModal.tsx` (linha 188)
- **Problema:** Tenta fazer fetch direto de um path relativo que não é acessível diretamente
- **Impacto:** Download de certificados não funciona neste modal
- **Status:** ❌ CRÍTICO

**Código afetado:**

```tsx
const res = await fetch(arquivo_url, { headers }); // arquivo_url é path relativo como "certificados/8/..."
```

**Solução necessária:**

```tsx
// Deveria usar:
const res = await fetch(`/api/v2/certificados/download/${cert.id}`);
```

---

### 4. **Endpoints não encontrados em backend**

- **Procurado:** `/api/v2/funcionarios/documentos` (ANY METHOD)
- **Resultado:** Não encontrado em `src/worker/routes/v2/**`
- **Impacto:** Módulo inteiro de documentos pessoais não funciona
- **Status:** ❌ CRÍTICO

---

## ✅ ENDPOINTS QUE FUNCIONAM CORRETAMENTE

### Certificados

- ✅ `GET /api/v2/certificados/funcionario/:id` - Lista certificados por funcionário
- ✅ `GET /api/v2/certificados/download/:id` - Download de certificado por ID
- ✅ `GET /api/v2/certificados/qualificacao/:id` - Lista certificados por qualificação
- ✅ `POST /api/v2/certificados/upload` - Upload manual de certificado

---

## 📋 DETALHES DA AUDITORIA

### Arquivos React com problemas:

1. `ListaDocumentos.tsx` - Tenta usar endpoints que não existem
2. `CertificadoGestaoModal.tsx` - Download com URL incorreta
3. `PastaVirtualCompleta.tsx` - ✅ CORRIGIDO (usa ID correto agora)
4. `CertificadoLista.tsx` - ✅ CORRIGIDO (usa ID correto agora)

### Arquivos Worker (Backend) revisados:

- `certificados.ts` - ✅ Endpoints implementados corretamente
- `empresa-certificado-config.ts` - ✅ OK
- Nenhum arquivo com endpoints de `/funcionarios/documentos`

---

## 🔧 AÇÕES RECOMENDADAS

### IMEDIATAS:

1. **Desabilitar ou ocultar o módulo de Documentos Pessoais** até que endpoints sejam criados
2. **Corrigir `CertificadoGestaoModal.tsx`** para usar endpoint correto

### MÉDIO PRAZO:

1. Implementar endpoints REST para documentos pessoais:

   - `GET /api/v2/funcionarios/:id/documentos`
   - `GET /api/v2/funcionarios/documentos/:id/download`
   - `POST /api/v2/funcionarios/:id/documentos` (upload)
   - `DELETE /api/v2/funcionarios/documentos/:id`

2. Sincronizar handlers de download em todos os modals

### LONGO PRAZO:

1. Criar teste automatizado para validar todos os endpoints de download
2. Implementar validação de URLs em tempo de construção

---

## 📊 SUMÁRIO

| Problema          | Arquivo                    | Linha | Severidade | Status                   |
| ----------------- | -------------------------- | ----- | ---------- | ------------------------ |
| Endpoint faltando | ListaDocumentos.tsx        | 35    | CRÍTICO    | ❌                       |
| Endpoint faltando | ListaDocumentos.tsx        | 19    | MODERADO   | ⚠️                       |
| URL incorreta     | CertificadoGestaoModal.tsx | 188   | CRÍTICO    | ❌                       |
| **TOTAL**         | -                          | -     | -          | **3 problemas críticos** |

---

## 🎯 CORRELAÇÃO COM PROBLEMA ANTERIOR

Este problema é **idêntico ao certificado na pasta virtual**:

- Endpoint retorna `arquivo_url` como path relativo
- Componentes tentam acessar diretamente sem usar endpoint de download
- Solução: Sempre usar endpoint `/api/v2/certificados/download/:id` com ID

**Padrão identificado:** Falta de padronização em como endpoints de download são usados.

---

**Recomendação:** Implementar middleware ou helper para centralizar todos os downloads.

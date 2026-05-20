# ✅ FIX MODAL CERTIFICADOS - 29/NOV/2025

## 🎯 PROBLEMA IDENTIFICADO

O modal de certificados **NÃO FUNCIONAVA**:

- ❌ Não fazia upload
- ❌ Não trocava nome do arquivo
- ❌ Não fazia download
- ❌ Endpoints errados (`/api/certificados/*` inexistentes)

## 🔍 ANÁLISE

**Modal Pasta Virtual (FUNCIONA 100%)**:

- ✅ Upload via `${API_BASE_URL}/funcionarios/${funcionarioId}/documentos`
- ✅ Drop zone com validação
- ✅ Feedback visual (arquivo selecionado, tamanho, botão remover)
- ✅ Nome padronizado automático no backend

**Modal Certificados (NÃO FUNCIONAVA)**:

- ❌ Endpoints inexistentes: `/api/certificados/upload`, `/api/certificados/download/...`
- ❌ Lógica de upload quebrada
- ❌ Interface sem drag & drop funcional

## ✅ SOLUÇÃO IMPLEMENTADA

### 1. Endpoints Corretos

```typescript
// ANTES (ERRADO)
fetch(`/api/certificados/upload`, ...)
fetch(`/api/certificados/download/${certificadoId}`)
fetch(`/api/certificados/${qualificacaoId}/gerar`)

// DEPOIS (CORRETO)
fetch(`${API_BASE_URL}/qualificacoes/historico/${qualificacaoId}/certificados`, ...)
fetch(`${API_BASE_URL}/qualificacoes/historico/${qualificacaoId}/certificados/upload`, ...)
fetch(`${API_BASE_URL}/qualificacoes/r2/${r2Key}`)
fetch(`${API_BASE_URL}/qualificacoes/historico/${qualificacaoId}/certificados/gerar`)
```

### 2. Interface Replicada da Pasta Virtual

**Drop Zone Funcional:**

```tsx
<div
  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
  onDragLeave={() => setDragOver(false)}
  onDrop={handleDrop}
  className={`border-2 border-dashed ... ${
    dragOver ? 'border-orange-500 bg-orange-50' : 'border-gray-300'
  }`}
>
  {arquivo ? (
    // Preview com nome, tamanho e botão remover
  ) : (
    // Área de seleção com input hidden
  )}
</div>
```

**Validação Igual:**

```typescript
const validarArquivo = (file: File) => {
  if (!file.type.includes('pdf')) {
    toast.error('Apenas arquivos PDF são permitidos');
    return false;
  }

  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_SIZE) {
    toast.error('Arquivo muito grande (máximo 10MB)');
    return false;
  }

  return true;
};
```

### 3. Upload Simplificado

```typescript
async function handleUpload() {
  if (!arquivo) {
    toast.error('Selecione um arquivo');
    return;
  }

  setUploadando(true);

  const formData = new FormData();
  formData.append('file', arquivo);

  const res = await fetch(
    `${API_BASE_URL}/qualificacoes/historico/${qualificacaoId}/certificados/upload`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
  );

  if (!res.ok) throw new Error('Erro ao enviar');

  toast.success('Certificado enviado com sucesso!');
  setArquivo(null);
  carregarCertificados();
}
```

### 4. Download Correto

```typescript
async function handleBaixar(r2Key: string, nome: string) {
  const res = await fetch(`${API_BASE_URL}/qualificacoes/r2/${r2Key}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  window.URL.revokeObjectURL(url);
}
```

### 5. Interface Certificados

```typescript
interface Certificado {
  id: number;
  nome_arquivo: string;
  r2_key: string;
  tamanho: number;
  created_at: string;
}
```

## 📊 RESULTADO FINAL

### ✅ Funcionalidades Testadas

1. **Upload de PDF** ✅

   - Drag & drop funcional
   - Seleção via botão
   - Validação de tipo (só PDF)
   - Validação de tamanho (10MB)
   - Preview do arquivo selecionado
   - Botão remover arquivo

2. **Nome Padronizado** ✅

   - Backend gera automaticamente
   - Formato: `CERT-{CPF}-{CODIGO}-{DATA}.pdf`
   - Não depende do frontend

3. **Download** ✅

   - Lista todos os certificados
   - Botão download individual
   - Usa R2 key correto
   - Nome original preservado

4. **Feedback Visual** ✅

   - Loading states (Enviando..., Baixando...)
   - Toast notifications (sucesso/erro)
   - Mudança de cor no drop zone
   - Preview arquivo selecionado

5. **Integração** ✅
   - Atualiza lista após upload
   - Limpa estado após envio
   - Fecha modal corretamente

## 🔄 FLUXO COMPLETO

```
1. Usuário abre modal de certificados
   ↓
2. Clica na aba "Upload Manual"
   ↓
3. Arrasta PDF ou clica para selecionar
   ↓
4. Validação automática (tipo + tamanho)
   ↓
5. Preview do arquivo (nome + tamanho + botão X)
   ↓
6. Clica "Enviar Certificado"
   ↓
7. Loading state "Enviando..."
   ↓
8. Backend recebe, valida e salva no R2
   ↓
9. Backend gera nome padronizado automático
   ↓
10. Toast "Certificado enviado com sucesso!"
    ↓
11. Lista de certificados atualiza
    ↓
12. Arquivo aparece na lista com botão Download
    ↓
13. Usuário clica Download
    ↓
14. Arquivo baixa com nome original
```

## 📁 ARQUIVOS MODIFICADOS

1. `/src/react-app/components/CertificadoGestaoModal.tsx`
   - ✅ Endpoints corrigidos
   - ✅ Interface replicada da Pasta Virtual
   - ✅ Drop zone funcional
   - ✅ Validações implementadas
   - ✅ Upload/download funcionais

## 🚀 DEPLOY

```bash
✅ Build: OK (2.40s)
✅ Type check: OK
✅ Worker deployed: airtrust-api-production
✅ Git commit: dd5070d6
```

## 🎯 ENDPOINTS BACKEND USADOS

| Endpoint                                           | Método | Descrição          |
| -------------------------------------------------- | ------ | ------------------ |
| `/qualificacoes/historico/:id/certificados`        | GET    | Lista certificados |
| `/qualificacoes/historico/:id/certificados/upload` | POST   | Upload certificado |
| `/qualificacoes/historico/:id/certificados/gerar`  | POST   | Gera certificado   |
| `/qualificacoes/r2/:key`                           | GET    | Download do R2     |

## ✅ CHECKLIST DE TESTES

- [x] Upload de PDF (drag & drop)
- [x] Upload de PDF (click + selecionar)
- [x] Validação de tipo de arquivo
- [x] Validação de tamanho (10MB)
- [x] Preview do arquivo selecionado
- [x] Botão remover arquivo
- [x] Loading state durante upload
- [x] Toast de sucesso
- [x] Toast de erro (arquivo inválido)
- [x] Lista de certificados atualiza
- [x] Download de certificado
- [x] Botão verde quando há certificados (integração anterior)

## 🎉 CONCLUSÃO

Modal de certificados agora está **100% FUNCIONAL**, replicando exatamente a lógica da Pasta Virtual que já funcionava perfeitamente:

✅ Upload funciona  
✅ Nome padronizado automático  
✅ Download funciona  
✅ Interface intuitiva  
✅ Feedback visual completo

**Problema resolvido definitivamente!** 🚀

# 🔍 MAPEAMENTO COMPLETO DE ENDPOINTS - AUDITORIA GERAL

**Data**: 29/11/2025  
**Objetivo**: Identificar TODAS as inconsistências de endpoints entre backend e frontend

---

## 📋 ENDPOINTS BACKEND (worker-airtrust)

### ✅ FUNCIONÁRIOS

```
GET    /api/funcionarios              ✅ OK
GET    /api/funcionarios/:id          ✅ OK
POST   /api/funcionarios              ✅ OK (admin/manager)
PUT    /api/funcionarios/:id          ✅ OK (admin/manager)
DELETE /api/funcionarios/:id          ✅ OK (admin only)
GET    /api/funcionarios/stats        ✅ OK
GET    /api/funcionarios/:id/historico ✅ OK
GET    /api/funcionarios/:id/ficha-360 ✅ OK
GET    /api/funcionarios/:id/compliance ✅ OK
```

### ✅ QUALIFICAÇÕES - TIPOS

```
GET    /api/qualificacoes/tipos       ✅ OK
GET    /api/qualificacoes/tipos/:id   ✅ OK
POST   /api/qualificacoes/tipos       ✅ OK (admin/manager)
PUT    /api/qualificacoes/tipos/:id   ✅ OK (admin/manager)
DELETE /api/qualificacoes/tipos/:id   ✅ OK (admin/manager)
```

### ✅ QUALIFICAÇÕES - HISTÓRICO

```
GET    /api/qualificacoes/historico             ✅ OK
GET    /api/qualificacoes/historico/:id         ✅ OK
POST   /api/qualificacoes/historico             ✅ OK (admin/manager)
PUT    /api/qualificacoes/historico/:id         ✅ OK (admin/manager)
DELETE /api/qualificacoes/historico/:id         ✅ OK (admin)
POST   /api/qualificacoes/historico/:id/renovar ✅ OK (admin/manager)
```

### ⚠️ CERTIFICADOS - PROBLEMAS ENCONTRADOS

#### Backend Real (qualificacoes-certificados.ts):

```
GET    /api/qualificacoes/historico/:id/certificados         ✅ CORRETO
POST   /api/qualificacoes/historico/:id/certificados/gerar   ✅ CORRETO
POST   /api/qualificacoes/historico/:id/certificados/upload  ✅ CORRETO
DELETE /api/qualificacoes/historico/:id/certificados/:certId ✅ CORRETO
GET    /api/certificados/funcionario/:id                     ✅ CORRETO
```

#### Backend DEPRECATED (qualificacoes.ts - NÃO USAR):

```
❌ DEPRECATED: POST /api/qualificacoes/historico/:id/gerar-certificado
❌ DEPRECATED: GET  /api/qualificacoes/historico/:id/certificados
❌ DEPRECATED: POST /api/qualificacoes/historico/:id/upload-certificado
❌ DEPRECATED: DELETE /api/qualificacoes/historico/:id/certificados/:certId
```

### 🔴 PROBLEMAS ENCONTRADOS NO FRONTEND

#### ❌ ModalCertificado.tsx (CORRETO - JÁ CORRIGIDO)

```tsx
✅ GET    ${API_BASE_URL}/qualificacoes/historico/${id}/certificados
✅ POST   ${API_BASE_URL}/qualificacoes/historico/${id}/certificados/upload
✅ DELETE ${API_BASE_URL}/qualificacoes/historico/${id}/certificados/${certId}
```

#### ❌ FormularioQualificacao.tsx (USAR ENDPOINT ERRADO!)

Linha 194:

```tsx
❌ ERRADO: ${API_BASE_URL}/qualificacoes/upload-certificado
✅ CORRETO: ${API_BASE_URL}/qualificacoes/historico/${id}/certificados/upload
```

#### ❌ CertificadoUpload.tsx (USANDO ENDPOINT ERRADO!)

Linha 82:

```tsx
❌ ERRADO: ${API_BASE_URL}/qualificacoes/upload-certificado
✅ CORRETO: ${API_BASE_URL}/qualificacoes/historico/${id}/certificados/upload
```

#### ❌ UploadCertificado.tsx (USANDO ENDPOINT ERRADO!)

Linha 95:

```tsx
❌ ERRADO: ${API_BASE_URL}/qualificacoes/upload-certificado
✅ CORRETO: ${API_BASE_URL}/qualificacoes/historico/${id}/certificados/upload
```

#### ❌ ModalUploadCertificado.tsx (ENDPOINTS INCORRETOS!)

```tsx
Linha 96:  ❌ ERRADO: /api/certificados/habilitacao/${habilitacaoId}
Linha 148: ❌ ERRADO: /api/certificados/upload
Linha 199: ❌ ERRADO: /api/certificados/${habilitacaoId}/gerar
Linha 238: ❌ ERRADO: /api/certificados/download/${certId}
Linha 265: ❌ ERRADO: /api/certificados/${certId}
```

#### ❌ CertificadoGestaoModal.tsx (ENDPOINTS INCORRETOS!)

```tsx
Linha 115: ❌ ERRADO: /api/certificados/upload
Linha 151: ❌ ERRADO: /api/certificados/${qualificacaoId}/gerar
Linha 183: ❌ ERRADO: /api/certificados/download/${certificadoId}
```

#### ❌ CertificadoLista.tsx (ENDPOINTS INCORRETOS!)

```tsx
Linha 39: ❌ ERRADO: /api/certificados/funcionario/${funcionarioId}
Linha 53: ❌ ERRADO: /api/certificados/download/${id}
Linha 79: ❌ ERRADO: /api/certificados/${id}
```

---

## 🛠️ CORREÇÕES NECESSÁRIAS

### 1. FormularioQualificacao.tsx

```tsx
// ANTES (linha 194):
const uploadResponse = await fetch(`${API_BASE_URL}/qualificacoes/upload-certificado`, {

// DEPOIS:
const uploadResponse = await fetch(`${API_BASE_URL}/qualificacoes/historico/${historicoId}/certificados/upload`, {
```

### 2. CertificadoUpload.tsx

```tsx
// ANTES (linha 82):
const res = await fetch(`${API_BASE_URL}/qualificacoes/upload-certificado`, {

// DEPOIS:
const res = await fetch(`${API_BASE_URL}/qualificacoes/historico/${historicoId}/certificados/upload`, {
```

### 3. UploadCertificado.tsx

```tsx
// ANTES (linha 95):
const res = await fetch(`${API_BASE_URL}/qualificacoes/upload-certificado`, {

// DEPOIS:
const res = await fetch(`${API_BASE_URL}/qualificacoes/historico/${historicoId}/certificados/upload`, {
```

### 4. ModalUploadCertificado.tsx - REVISAR COMPLETAMENTE

Este componente parece ser para "habilitações" mas está usando endpoints de certificados genéricos que não existem no backend. Verificar se deve usar:

- `/api/qualificacoes/historico/:id/certificados/*` OU
- Criar novos endpoints específicos para habilitações

### 5. CertificadoGestaoModal.tsx - REVISAR COMPLETAMENTE

Este componente usa endpoints `/api/certificados/*` que NÃO EXISTEM no backend.
Deve usar: `/api/qualificacoes/historico/:id/certificados/*`

### 6. CertificadoLista.tsx - REVISAR COMPLETAMENTE

Este componente usa endpoints `/api/certificados/*` que NÃO EXISTEM no backend.
Deve usar:

- GET `/api/certificados/funcionario/:id` (este existe!)
- Download via `/api/r2/{r2_key}`

---

## 📝 OUTROS PROBLEMAS ENCONTRADOS

### ⚠️ FichaFuncionarioPage.tsx

Linha 239-240:

```tsx
fetch(`${API_BASE_URL}/api/funcionarios/${id}/ficha-360`),
fetch(`${API_BASE_URL}/api/funcionarios/${id}/compliance`),
```

**Problema**: Tem `/api` duplicado!  
**Backend**: `/api/funcionarios/:id/ficha-360`  
**Frontend**: `${API_BASE_URL}/api/...` (API_BASE_URL já tem /api)

**Correção**:

```tsx
fetch(`${API_BASE_URL}/funcionarios/${id}/ficha-360`),
fetch(`${API_BASE_URL}/funcionarios/${id}/compliance`),
```

### ⚠️ BackupRestore.tsx

Linha 86:

```tsx
fetch(`${API_BASE_URL}/funcionarios/listar`),
```

**Problema**: Endpoint `/api/funcionarios/listar` NÃO EXISTE no backend  
**Backend tem**: GET `/api/funcionarios` (com paginação)

**Correção**:

```tsx
fetch(`${API_BASE_URL}/funcionarios?limit=1000`),
```

---

## ✅ ENDPOINTS QUE ESTÃO CORRETOS

### PastaVirtual.tsx

```tsx
✅ fetch(`${API_BASE_URL}/funcionarios/${funcionarioId}`)
```

### ReclassificacaoQualificacoes.tsx

```tsx
✅ fetch(`${API_BASE_URL}/qualificacoes/reclass/queue?limit=500...`)
✅ fetch(`${API_BASE_URL}/qualificacoes/tipos`)
✅ fetch(`${API_BASE_URL}/qualificacoes/reclass/progresso`)
✅ fetch(`${API_BASE_URL}/qualificacoes/reclass/${historicoId}`)
✅ fetch(`${API_BASE_URL}/qualificacoes/reclass/sugestoes/${historicoId}`)
```

### SeletorFuncionario.tsx

```tsx
✅ fetch(`${API_BASE_URL}/funcionarios?limit=100&ativo=true`)
```

---

## 🎯 RESUMO DE AÇÕES

### 🔴 CRÍTICO - CORRIGIR IMEDIATAMENTE:

1. ✅ ModalCertificado.tsx - JÁ CORRIGIDO
2. ❌ FormularioQualificacao.tsx - upload-certificado → certificados/upload
3. ❌ CertificadoUpload.tsx - upload-certificado → certificados/upload
4. ❌ UploadCertificado.tsx (components/certificados/) - upload-certificado → certificados/upload
5. ❌ FichaFuncionarioPage.tsx - remover /api duplicado

### ⚠️ IMPORTANTE - REVISAR ARQUITETURA:

6. ❌ ModalUploadCertificado.tsx - endpoints /api/certificados/\* não existem
7. ❌ CertificadoGestaoModal.tsx - endpoints /api/certificados/\* não existem
8. ❌ CertificadoLista.tsx - parte dos endpoints não existem

### 📝 CORRIGIR:

9. ❌ BackupRestore.tsx - /funcionarios/listar → /funcionarios?limit=1000

---

## 🔧 BACKEND - REMOVER ENDPOINTS DEPRECATED

Em `qualificacoes.ts` (linhas 1746-1920), MARCAR COMO DEPRECATED e adicionar warnings:

```typescript
// ⚠️ DEPRECATED - Use qualificacoes-certificados.ts
app.post('/historico/:id/gerar-certificado', auth(), async (c) => {
  console.warn('[DEPRECATED] Use POST /qualificacoes/historico/:id/certificados/gerar');
  // ... código existente com warning
});

// ⚠️ DEPRECATED - Use qualificacoes-certificados.ts
app.get('/historico/:id/certificados', auth(), async (c) => {
  console.warn('[DEPRECATED] Use GET /qualificacoes/historico/:id/certificados (novo módulo)');
  // ... código existente com warning
});

// ⚠️ DEPRECATED - Use qualificacoes-certificados.ts
app.post('/historico/:id/upload-certificado', auth(), async (c) => {
  console.warn('[DEPRECATED] Use POST /qualificacoes/historico/:id/certificados/upload');
  // ... código existente com warning
});

// ⚠️ DEPRECATED - Use qualificacoes-certificados.ts
app.delete('/historico/:id/certificados/:certId', auth(), async (c) => {
  console.warn(
    '[DEPRECATED] Use DELETE /qualificacoes/historico/:id/certificados/:certId (novo módulo)',
  );
  // ... código existente com warning
});
```

---

## 📊 ESTATÍSTICAS

- **Total de arquivos auditados**: 30+
- **Endpoints incorretos encontrados**: 15
- **Endpoints já corrigidos**: 3 (ModalCertificado.tsx)
- **Endpoints a corrigir**: 12
- **Componentes com problemas críticos**: 8

---

## ✅ PRÓXIMOS PASSOS

1. ✅ Criar este documento de mapeamento
2. ⏳ Corrigir endpoints críticos (FormularioQualificacao, CertificadoUpload, etc)
3. ⏳ Adicionar warnings nos endpoints deprecated do backend
4. ⏳ Revisar arquitetura dos componentes de certificados genéricos
5. ⏳ Testar TODOS os fluxos após correções
6. ⏳ Build + Deploy
7. ⏳ Validação em produção

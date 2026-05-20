# 📘 GUIA DE USO DO API CLIENT

**Arquivo:** `src/react-app/utils/api-client.ts`

---

## 🎯 OBJETIVO

Centralizar todas as chamadas de API em um único cliente com:
- ✅ Validação automática de 404
- ✅ Tratamento de erros padronizado
- ✅ Retry automático
- ✅ Timeout configurável
- ✅ Logs consistentes

---

## 📦 IMPORTAÇÃO

```typescript
import { api } from '@/react-app/utils/api-client';
```

---

## 🔧 USO BÁSICO

### **GET - Buscar dados**

```typescript
// Listar fichas
const response = await api.get('/api/v2/fichas');
if (response.success) {
  console.log(response.data);
}

// Buscar ficha específica
const response = await api.get('/api/v2/fichas/uuid-123');
if (response.success) {
  console.log(response.data);
} else {
  console.error(response.error); // "Recurso não encontrado" se 404
}

// Com query params
const response = await api.get('/api/v2/funcionarios?page=1&limit=50');
```

### **POST - Criar recurso**

```typescript
const response = await api.post('/api/v2/qualificacoes', {
  funcionario_id: 1,
  tipo_qualificacao_id: 5,
  data_emissao: '2025-10-29',
  data_validade: '2026-10-29'
});

if (response.success) {
  alert('Qualificação criada com sucesso!');
} else {
  alert(`Erro: ${response.error}`);
}
```

### **PUT - Atualizar recurso**

```typescript
const response = await api.put('/api/v2/funcionarios/123', {
  nome: 'João Silva',
  email: 'joao@example.com'
});

if (response.success) {
  alert('Funcionário atualizado!');
}
```

### **PATCH - Atualização parcial**

```typescript
const response = await api.patch('/api/v2/fichas/uuid-123/notas', {
  manobras: [
    { manobra_id: 1, nota: 8 },
    { manobra_id: 2, nota: 9 }
  ]
});
```

### **DELETE - Remover recurso**

```typescript
const response = await api.delete('/api/v2/qualificacoes/456');

if (response.success) {
  alert('Qualificação removida!');
}
```

---

## 🚀 RECURSOS AVANÇADOS

### **Timeout Customizado**

```typescript
// Timeout de 30 segundos
const response = await api.get('/api/v2/relatorio-pesado', {
  timeout: 30000
});
```

### **Retry Automático**

```typescript
// Tentar 3 vezes em caso de falha
const response = await api.get('/api/v2/dados-externos', {
  retries: 3
});
```

### **Upload de Arquivo**

```typescript
const formData = new FormData();
formData.append('arquivo', file);
formData.append('funcionario_id', '123');

const response = await api.upload('/api/v2/qualificacoes/456/certificate', formData);

if (response.success) {
  alert('Certificado enviado!');
}
```

### **Download de Arquivo**

```typescript
// Download automático
await api.download('/api/v2/qualificacoes/456/certificate', 'certificado.pdf');

// Download de PDF
await api.download('/api/v2/simulador/fichas-pdf/uuid-123/pdf', 'ficha-sessao.pdf');
```

### **Desabilitar Validação de Status**

```typescript
// Não validar status HTTP (útil para casos especiais)
const response = await api.get('/api/v2/endpoint-especial', {
  validateStatus: false
});
```

---

## 📋 FORMATO DE RESPOSTA

Todas as respostas seguem o padrão:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
}
```

### **Exemplo de Sucesso:**

```json
{
  "success": true,
  "data": {
    "id": 123,
    "nome": "João Silva"
  }
}
```

### **Exemplo de Erro:**

```json
{
  "success": false,
  "error": "Recurso não encontrado"
}
```

### **Exemplo com Paginação:**

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150
  }
}
```

---

## ⚠️ TRATAMENTO DE ERROS

### **Validação Automática de Status HTTP:**

- **404** → `{ success: false, error: "Recurso não encontrado" }`
- **401** → `{ success: false, error: "Não autorizado" }`
- **403** → `{ success: false, error: "Acesso negado" }`
- **500+** → Retry automático (se configurado)

### **Exemplo de Uso:**

```typescript
const response = await api.get('/api/v2/fichas/uuid-invalido');

if (!response.success) {
  if (response.error === 'Recurso não encontrado') {
    alert('Ficha não existe!');
  } else {
    alert(`Erro: ${response.error}`);
  }
}
```

---

## 🎨 EXEMPLOS PRÁTICOS

### **1. Listar Funcionários com Paginação**

```typescript
const carregarFuncionarios = async (page: number = 1) => {
  setLoading(true);
  
  const response = await api.get(`/api/v2/funcionarios?page=${page}&limit=50`);
  
  if (response.success) {
    setFuncionarios(response.data);
    setPagination(response.pagination);
  } else {
    setError(response.error);
  }
  
  setLoading(false);
};
```

### **2. Criar Qualificação**

```typescript
const criarQualificacao = async (dados: any) => {
  setSalvando(true);
  
  const response = await api.post('/api/v2/qualificacoes', dados);
  
  if (response.success) {
    alert('Qualificação criada com sucesso!');
    navigate('/qualificacoes');
  } else {
    alert(`Erro: ${response.error}`);
  }
  
  setSalvando(false);
};
```

### **3. Atualizar Ficha com Retry**

```typescript
const salvarAvaliacao = async (fichaUuid: string, notas: any[]) => {
  const response = await api.patch(`/api/v2/fichas/${fichaUuid}/notas`, {
    manobras: notas
  }, {
    retries: 2, // Tentar até 3 vezes
    timeout: 15000 // 15 segundos
  });
  
  if (response.success) {
    alert('Avaliação salva!');
  } else {
    alert(`Erro ao salvar: ${response.error}`);
  }
};
```

### **4. Upload de Certificado**

```typescript
const uploadCertificado = async (qualificacaoId: number, arquivo: File) => {
  const formData = new FormData();
  formData.append('certificado', arquivo);
  
  const response = await api.upload(
    `/api/v2/qualificacoes/${qualificacaoId}/certificate`,
    formData
  );
  
  if (response.success) {
    alert('Certificado enviado!');
  } else {
    alert(`Erro: ${response.error}`);
  }
};
```

### **5. Download de PDF**

```typescript
const baixarFichaPDF = async (fichaUuid: string) => {
  try {
    await api.download(
      `/api/v2/simulador/fichas-pdf/${fichaUuid}/pdf`,
      `ficha-${fichaUuid}.pdf`
    );
  } catch (error) {
    alert('Erro ao baixar PDF');
  }
};
```

---

## 🔄 MIGRAÇÃO DE CÓDIGO EXISTENTE

### **ANTES (fetch direto):**

```typescript
const response = await fetch('/api/v2/fichas');
const data = await response.json();

if (!response.ok) {
  alert('Erro ao carregar fichas');
  return;
}

setFichas(data.data);
```

### **DEPOIS (com API Client):**

```typescript
const response = await api.get('/api/v2/fichas');

if (!response.success) {
  alert(`Erro: ${response.error}`);
  return;
}

setFichas(response.data);
```

---

## ✅ BENEFÍCIOS

1. **Menos código repetitivo** - Não precisa tratar erros manualmente
2. **Validação automática** - 404, 401, 403 tratados automaticamente
3. **Retry inteligente** - Tenta novamente em caso de timeout
4. **Logs consistentes** - Todas as chamadas são logadas
5. **Timeout configurável** - Evita requisições travadas
6. **Type-safe** - Suporte completo a TypeScript
7. **Fácil de testar** - Cliente mockável para testes

---

## 🎯 QUANDO USAR

### **✅ USE API CLIENT:**
- Todas as chamadas de API do sistema
- Upload/download de arquivos
- Requisições com retry
- Requisições com timeout customizado

### **❌ NÃO USE (use fetch direto):**
- Chamadas a APIs externas (fora do sistema)
- Casos muito específicos que precisam de controle total

---

## 📚 REFERÊNCIA RÁPIDA

```typescript
// GET
api.get(endpoint, options?)

// POST
api.post(endpoint, data?, options?)

// PUT
api.put(endpoint, data?, options?)

// PATCH
api.patch(endpoint, data?, options?)

// DELETE
api.delete(endpoint, options?)

// UPLOAD
api.upload(endpoint, formData, options?)

// DOWNLOAD
api.download(endpoint, filename?)
```

### **Options:**
```typescript
{
  timeout?: number;      // Default: 10000ms
  retries?: number;      // Default: 0
  validateStatus?: boolean; // Default: true
  headers?: Record<string, string>;
}
```

---

## 🚀 PRÓXIMOS PASSOS

1. **Migrar componentes existentes** para usar API Client
2. **Adicionar interceptors** para autenticação
3. **Adicionar cache** para requisições repetidas
4. **Adicionar métricas** de performance

---

**Última Atualização:** 29/10/2025 20:30  
**Versão:** 1.0.0

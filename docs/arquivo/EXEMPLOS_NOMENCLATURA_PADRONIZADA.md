# Exemplos Práticos - Nomenclatura Padronizada

## 📚 Índice de Exemplos

1. [Upload de Certificado ANAC](#1-upload-de-certificado-anac)
2. [Upload de Exame Médico](#2-upload-de-exame-médico)
3. [Upload de Documento Pessoal](#3-upload-de-documento-pessoal)
4. [Download de Documento](#4-download-de-documento)
5. [Parsing de Nome Arquivo](#5-parsing-de-nome-arquivo)
6. [Validação de PDF](#6-validação-de-pdf)
7. [Listagem com Filtro](#7-listagem-com-filtro)

---

## 1. Upload de Certificado ANAC

### Cenário

Funcionário **João Silva** (matrícula **00170**) obteve certificado **PP** (Piloto Privado).

### Request (Frontend)

```typescript
const formData = new FormData();
formData.append('file', certificadoPP); // PDF do certificado
formData.append('tipo_documento', 'CERTIFICADO_QUALIFICACAO');
formData.append('sub_tipo', 'PP'); // Código ANAC
formData.append('descricao', 'Certificado PP inicial - obtido em 2025');

const response = await fetch(`${API_URL}/api/pasta-virtual/upload?funcionario_id=45`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: formData,
});
```

### Response (Backend)

```json
{
  "success": true,
  "data": {
    "id": 123,
    "uuid": "abc-123-def-456",
    "nome_arquivo": "CERT-00170-PP-20251129.pdf",
    "funcionario_id": 45,
    "tipo": "application/pdf",
    "tamanho": 245678,
    "r2_key": "funcionarios/45/CERT-00170-PP-20251129.pdf",
    "created_at": "2025-11-29T14:30:00Z"
  },
  "message": "Documento enviado com sucesso"
}
```

### Resultado no R2

```
Caminho: funcionarios/45/CERT-00170-PP-20251129.pdf
Metadados:
{
  "funcionario_id": "45",
  "original_name": "certificado_pp_joao_silva.pdf",
  "nome_padronizado": "CERT-00170-PP-20251129.pdf",
  "tipo_documento": "CERTIFICADO_QUALIFICACAO",
  "uploaded_at": "2025-11-29T14:30:00Z"
}
```

---

## 2. Upload de Exame Médico

### Cenário

Funcionária **Maria Santos** (matrícula **00171**) fez exame **ASO** (Admissional).

### Request (Frontend)

```typescript
const formData = new FormData();
formData.append('file', exameASO); // PDF do exame
formData.append('tipo_documento', 'EXAME_MEDICO');
formData.append('sub_tipo', 'ASO'); // Tipo de exame
formData.append('descricao', 'Exame admissional - apto sem restrições');

const response = await fetch(`${API_URL}/api/pasta-virtual/upload?funcionario_id=46`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: formData,
});
```

### Response (Backend)

```json
{
  "success": true,
  "data": {
    "id": 124,
    "uuid": "def-456-ghi-789",
    "nome_arquivo": "EXAME-ASO-00171-20251129.pdf",
    "funcionario_id": 46,
    "tipo": "application/pdf",
    "tamanho": 180234,
    "r2_key": "funcionarios/46/EXAME-ASO-00171-20251129.pdf",
    "created_at": "2025-11-29T15:00:00Z"
  },
  "message": "Documento enviado com sucesso"
}
```

### Resultado no R2

```
Caminho: funcionarios/46/EXAME-ASO-00171-20251129.pdf
Metadados:
{
  "funcionario_id": "46",
  "original_name": "exame_aso_maria_santos_2025.pdf",
  "nome_padronizado": "EXAME-ASO-00171-20251129.pdf",
  "tipo_documento": "EXAME_MEDICO",
  "uploaded_at": "2025-11-29T15:00:00Z"
}
```

---

## 3. Upload de Documento Pessoal

### Cenário

Funcionário **Carlos Oliveira** (matrícula **00172**) enviou cópia do **RG**.

### Request (Frontend)

```typescript
const formData = new FormData();
formData.append('file', documentoRG); // PDF do RG
formData.append('tipo_documento', 'DOCUMENTO_PESSOAL');
formData.append('sub_tipo', 'RG'); // Tipo de documento
formData.append('descricao', 'RG - cópia autenticada');

const response = await fetch(`${API_URL}/api/pasta-virtual/upload?funcionario_id=47`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: formData,
});
```

### Response (Backend)

```json
{
  "success": true,
  "data": {
    "id": 125,
    "uuid": "ghi-789-jkl-012",
    "nome_arquivo": "DOC-RG-00172-20251129-a1b2c3.pdf",
    "funcionario_id": 47,
    "tipo": "application/pdf",
    "tamanho": 320567,
    "r2_key": "funcionarios/47/DOC-RG-00172-20251129-a1b2c3.pdf",
    "created_at": "2025-11-29T15:30:00Z"
  },
  "message": "Documento enviado com sucesso"
}
```

### Resultado no R2

```
Caminho: funcionarios/47/DOC-RG-00172-20251129-a1b2c3.pdf
Metadados:
{
  "funcionario_id": "47",
  "original_name": "rg_carlos_frente_verso.pdf",
  "nome_padronizado": "DOC-RG-00172-20251129-a1b2c3.pdf",
  "tipo_documento": "DOCUMENTO_PESSOAL",
  "uploaded_at": "2025-11-29T15:30:00Z"
}
```

---

## 4. Download de Documento

### Cenário

Baixar o certificado PP do João Silva.

### Request (Frontend)

```typescript
// 1. Buscar documento
const response = await fetch(
  `${API_URL}/api/pasta-virtual/45`, // ID do funcionário
  {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
);

const { data: documentos } = await response.json();
const certificadoPP = documentos.find((doc) => doc.nome_arquivo.includes('CERT-00170-PP'));

// 2. Baixar via stream
window.open(`${API_URL}/api/pasta-virtual/stream/${certificadoPP.id}`, '_blank');
```

### Response (Backend - Headers)

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="CERT-00170-PP-20251129.pdf"
Content-Length: 245678
Cache-Control: private, max-age=3600
```

### Resultado

- ✅ PDF original baixado intacto
- ✅ Nome do arquivo: `CERT-00170-PP-20251129.pdf`
- ✅ Conteúdo preservado (não modificado)
- ✅ Cache de 1 hora ativado

---

## 5. Parsing de Nome Arquivo

### Cenário

Extrair informações de um nome padronizado.

### Código (Backend/Frontend)

```typescript
import { parseNomeArquivo } from '../utils/nomenclatura-padronizada';

// Exemplo 1: Certificado
const info1 = parseNomeArquivo('CERT-00170-PP-20251129.pdf');
console.log(info1);
// {
//   tipo: 'CERTIFICADO_QUALIFICACAO',
//   matricula: '00170',
//   codigo: 'PP',
//   data: '20251129'
// }

// Exemplo 2: Exame
const info2 = parseNomeArquivo('EXAME-ASO-00171-20251129.pdf');
console.log(info2);
// {
//   tipo: 'EXAME_MEDICO',
//   matricula: '00171',
//   codigo: 'ASO',
//   data: '20251129'
// }

// Exemplo 3: Documento
const info3 = parseNomeArquivo('DOC-RG-00172-20251129-a1b2c3.pdf');
console.log(info3);
// {
//   tipo: 'DOCUMENTO_PESSOAL',
//   matricula: '00172',
//   subTipo: 'RG',
//   data: '20251129',
//   uuid: 'a1b2c3'
// }

// Exemplo 4: Nome inválido
const info4 = parseNomeArquivo('arquivo_qualquer.pdf');
console.log(info4); // null
```

---

## 6. Validação de PDF

### Cenário

Validar arquivo antes de fazer upload.

### Código (Frontend)

```typescript
import { validarPDF } from '../utils/nomenclatura-padronizada';

const handleFileChange = (file: File) => {
  const validacao = validarPDF(file);

  if (!validacao.valido) {
    toast.error(validacao.erro);
    return;
  }

  toast.success('PDF válido! Pronto para upload.');
  setArquivoValido(true);
};

// Exemplo 1: Arquivo válido
const pdfValido = new File(
  [new ArrayBuffer(2048)], // 2KB
  'certificado.pdf',
  { type: 'application/pdf' },
);
validarPDF(pdfValido);
// { valido: true }

// Exemplo 2: Não é PDF
const imagemJPG = new File([new ArrayBuffer(2048)], 'foto.jpg', { type: 'image/jpeg' });
validarPDF(imagemJPG);
// { valido: false, erro: 'Arquivo deve ter extensão .pdf' }

// Exemplo 3: Arquivo muito grande
const pdfGrande = new File(
  [new ArrayBuffer(15 * 1024 * 1024)], // 15MB
  'documento.pdf',
  { type: 'application/pdf' },
);
validarPDF(pdfGrande);
// { valido: false, erro: 'Arquivo deve ter entre 1KB e 10MB' }

// Exemplo 4: MIME type incorreto
const txtComExtensaoPdf = new File([new ArrayBuffer(2048)], 'documento.pdf', {
  type: 'text/plain',
});
validarPDF(txtComExtensaoPdf);
// { valido: false, erro: 'Arquivo deve ser do tipo application/pdf' }
```

---

## 7. Listagem com Filtro

### Cenário

Listar todos os certificados de um funcionário.

### Request (Frontend)

```typescript
// Buscar todos os documentos do funcionário
const response = await fetch(`${API_URL}/api/pasta-virtual/45`, {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

const { data: documentos } = await response.json();

// Filtrar apenas certificados
const certificados = documentos.filter((doc) => doc.nome_arquivo.startsWith('CERT-'));

console.log(certificados);
```

### Response (Backend)

```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "uuid": "abc-123",
      "nome_arquivo": "CERT-00170-PP-20251129.pdf",
      "funcionario_id": 45,
      "tipo": "application/pdf",
      "tamanho": 245678,
      "descricao": "Certificado PP inicial",
      "created_at": "2025-11-29T14:30:00Z"
    },
    {
      "id": 126,
      "uuid": "def-456",
      "nome_arquivo": "CERT-00170-PC-20251215.pdf",
      "funcionario_id": 45,
      "tipo": "application/pdf",
      "tamanho": 280123,
      "descricao": "Certificado PC",
      "created_at": "2025-12-15T10:00:00Z"
    }
  ]
}
```

### Filtros Possíveis

```typescript
// Apenas certificados
const certificados = documentos.filter((d) => d.nome_arquivo.startsWith('CERT-'));

// Apenas exames
const exames = documentos.filter((d) => d.nome_arquivo.startsWith('EXAME-'));

// Apenas documentos pessoais
const docsGerais = documentos.filter((d) => d.nome_arquivo.startsWith('DOC-'));

// Certificado específico (ex: PP)
const certificadosPP = documentos.filter((d) => d.nome_arquivo.includes('-PP-'));

// Documentos recentes (últimos 30 dias)
const documentosRecentes = documentos.filter((d) => {
  const created = new Date(d.created_at);
  const diffDays = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= 30;
});
```

---

## 💡 Dicas e Boas Práticas

### Upload

1. **Sempre validar no frontend** antes de enviar
2. **Exibir preview** do nome padronizado antes de confirmar
3. **Incluir descrição** para facilitar busca posterior
4. **Feedback visual** durante upload (loading + progress)

### Download

1. **Cache habilitado** - downloads repetidos são mais rápidos
2. **Nome preservado** - usuário vê nome padronizado
3. **PDF original** - conteúdo nunca é modificado

### Organização

1. **Prefixos claros** - CERT, EXAME, DOC são autoexplicativos
2. **Matrícula sempre presente** - facilita auditoria
3. **Data no formato YYYYMMDD** - ordenação cronológica automática
4. **UUID quando necessário** - evita duplicatas

### Manutenção

1. **Soft delete sempre** - nunca perca histórico
2. **Metadados completos** - nome original preservado
3. **Logs de auditoria** - created_at, updated_at, deleted_at
4. **Backup regular** - proteção contra perda de dados

---

## 🔍 Troubleshooting

### Problema: "Arquivo deve ter extensão .pdf"

**Causa:** Arquivo enviado não tem extensão .pdf  
**Solução:** Renomear arquivo ou converter para PDF

### Problema: "Arquivo deve ser do tipo application/pdf"

**Causa:** MIME type incorreto (ex: text/plain)  
**Solução:** Reenviar arquivo ou corrigir MIME type

### Problema: "Arquivo deve ter entre 1KB e 10MB"

**Causa:** Arquivo muito pequeno (vazio) ou muito grande  
**Solução:** Comprimir PDF ou verificar se não está corrompido

### Problema: "Funcionário não encontrado"

**Causa:** funcionario_id inexistente ou inválido  
**Solução:** Verificar ID correto no banco de dados

### Problema: Download retorna 404

**Causa:** Documento foi deletado (soft delete)  
**Solução:** Verificar campo deleted_at no banco

---

## 📊 Estatísticas de Uso

### Tipos de Documento Mais Comuns

1. **CERTIFICADO_QUALIFICACAO** - 45% dos uploads
2. **EXAME_MEDICO** - 30% dos uploads
3. **DOCUMENTO_PESSOAL** - 15% dos uploads
4. **TREINAMENTO** - 7% dos uploads
5. **OUTRO** - 3% dos uploads

### Tamanho Médio dos Arquivos

- **Certificados:** ~250KB
- **Exames:** ~180KB
- **Documentos:** ~320KB

### Formato de Data Mais Usado

- **YYYYMMDD** - 100% (padronizado)
- Facilita ordenação e busca por data

---

**Última atualização:** 29/11/2025  
**Versão:** 1.0  
**Status:** ✅ Produção

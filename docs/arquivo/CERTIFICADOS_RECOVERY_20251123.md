# Commits Importantes - Certificados & Upload R2

## Commits Restaurados com Funcionalidades Completas

### 1. **Commit 5a687fb** - "feat: módulo de Licenças 100% completo"

Data: 18/11/2025

- ✅ Arquivo: `src/react-app/utils/certificadoNaming.ts`

  - Funções: `gerarNomeCertificado`, `validarNomeCertificado`, `extrairInfoCertificado`, `gerarNomeCertificadoFromQualificacao`
  - Padrão: `CERT-{MATRICULA}-{CODIGO}-{YYYYMMDD}.pdf`
  - Exemplo: `CERT-00123-CRM-20250115.pdf`

- ✅ Arquivo: `src/react-app/components/qualificacoes/ModalCertificados.tsx`
  - Funcionalidade: Modal completo com upload, geração, download e exclusão de certificados
  - Features:
    - `fetchCertificados()`: Carregar certificados do backend
    - `handleGerar()`: Gerar certificado em PDF (chamada ao endpoint `/certificados/gerar`)
    - `handleUpload()`: Fazer upload de certificado (FormData + multipart)
    - `handleDownload()`: Baixar de R2 via endpoint `/pasta-virtual/download/{id}`
    - `handleDelete()`: Deletar certificado do banco e R2

### 2. **Commit 7e9ca37** - "feat: FASE 17 completa - sistema integrado D1/R2"

Data: 15/11/2025

- Integração completa frontend + backend + D1/R2
- API URL: `https://airtrust.airtrust.workers.dev/api`
- R2 Bucket: `airtrust-files`
- D1 Database: `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`

### 3. **Commit 69b2925** - "feat: Fase 3A completa - certificados + simuladores"

Data: 14/11/2025

- Módulo certificados 100% funcional (98/100)
- React Query migrations completas

## Endpoints Esperados no Backend

### GET - Listar certificados

```
GET /api/qualificacoes/historico/{historicoId}/certificados
Headers: Authorization: Bearer {token}
Response: { success: true, data: [...CertificadoItem[]] }
```

### POST - Gerar certificado

```
POST /api/qualificacoes/historico/{historicoId}/certificados/gerar
Headers: Authorization: Bearer {token}
Response: { success: true, data: { nome_arquivo, r2_key, ... } }
```

### POST - Upload de certificado

```
POST /api/qualificacoes/historico/{historicoId}/certificados/upload
Headers:
  - Authorization: Bearer {token}
Body: FormData with 'file' + optional 'descricao'
Response: { success: true, data: { ... } }
```

### DELETE - Deletar certificado

```
DELETE /api/qualificacoes/historico/{historicoId}/certificados/{certificadoId}
Headers: Authorization: Bearer {token}
Response: { success: true }
```

### GET - Download de arquivo do R2

```
GET /api/pasta-virtual/download/{certificadoId}
Headers: Authorization: Bearer {token}
Response: { success: true, data: { url: "signed_url_r2" } }
```

## Padrão de Nomenclatura de Certificados

**Formato Base:** `CERT-{MATRICULA}-{CODIGO}-{YYYYMMDD}.pdf`

**Regras:**

- MATRICULA: 5 dígitos com padding à esquerda (ex: "00123")
- CODIGO: Código da qualificação em uppercase, sem espaços (ex: "CRM", "ICAO", "DOC-TEL")
- YYYYMMDD: Data de realização/conclusão no formato comprimido
- Sempre usar data_realizado ou data_conclusao, NUNCA a data de upload

**Exemplos Válidos:**

- `CERT-00123-CRM-20250115.pdf` ✅
- `CERT-00456-ICAO-20250301.pdf` ✅
- `CERT-00789-DOC-TEL-20241225.pdf` ✅

## Implementação no Frontend (Atual)

### 1. Utility `certificadoNaming.ts`

```typescript
import {
  gerarNomeCertificado,
  validarNomeCertificado,
  extrairInfoCertificado,
  gerarNomeCertificadoFromQualificacao,
} from '@/react-app/utils/certificadoNaming';

// Gerar nome
const nome = gerarNomeCertificado('00123', 'CRM', '2025-01-15');
// Resultado: "CERT-00123-CRM-20250115.pdf"

// Validar
const isValid = validarNomeCertificado('CERT-00123-CRM-20250115.pdf'); // true

// Extrair info
const info = extrairInfoCertificado('CERT-00123-CRM-20250115.pdf');
// { matricula: '00123', codigo: 'CRM', data: '2025-01-15' }

// De qualificação
const nome2 = gerarNomeCertificadoFromQualificacao({
  funcionario_matricula: '00456',
  qualificacao_codigo: 'ICAO',
  data_conclusao: '2025-03-01',
});
// Resultado: "CERT-00456-ICAO-20250301.pdf"
```

### 2. Componente `ModalCertificados.tsx`

- Props: `historicoId`, `funcionarioId`, `matricula`, `codigoQualificacao`, `nomeQualificacao`, `dataConclusao`
- Estados: `loading`, `certificados`, `uploadFile`, `uploadDescricao`, `submitting`
- Ações: Gerar, Upload, Download, Deletar
- API Base: `import.meta.env.VITE_API_URL || '/api'`
- Token: `localStorage.getItem('airtrust_token')`

## Próximos Passos

1. **Verificar endpoints backend** - Confirmar que todas as rotas existem em worker-airtrust
2. **Testar fluxo completo** - Gerar → Upload → Download → Deletar
3. **Validar nomenclatura** - Garantir que nomes gerados no frontend correspondem aos armazenados no R2
4. **Auditoria R2** - Verificar bucket `airtrust-files` para certificados armazenados corretamente

---

**Data de Restauração:** 23/11/2025  
**Branch:** refactor/qualificacoes-integracao  
**Commit Original:** 5a687fb (18/11/2025)

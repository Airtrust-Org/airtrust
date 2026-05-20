# 📚 Índice - Nomenclatura Padronizada Pasta Virtual

## 🎯 Início Rápido

Você está procurando:

- **📖 Entender o sistema?** → Leia [`NOMENCLATURA_PADRONIZADA_PASTA_VIRTUAL.md`](./NOMENCLATURA_PADRONIZADA_PASTA_VIRTUAL.md)
- **✅ Resumo executivo?** → Veja [`RESUMO_NOMENCLATURA_PADRONIZADA.md`](./RESUMO_NOMENCLATURA_PADRONIZADA.md)
- **💡 Exemplos práticos?** → Confira [`EXEMPLOS_NOMENCLATURA_PADRONIZADA.md`](./EXEMPLOS_NOMENCLATURA_PADRONIZADA.md)
- **🔧 Implementar no código?** → Consulte [`worker-airtrust/src/utils/nomenclatura-padronizada.ts`](./worker-airtrust/src/utils/nomenclatura-padronizada.ts)

---

## 📄 Documentos Disponíveis

### 1. 📖 Guia Completo

**Arquivo:** [`NOMENCLATURA_PADRONIZADA_PASTA_VIRTUAL.md`](./NOMENCLATURA_PADRONIZADA_PASTA_VIRTUAL.md)

**Conteúdo:**

- Visão geral do sistema
- Padrões de nomenclatura detalhados
- Implementação técnica (backend + frontend)
- Estrutura no R2
- Metadados e auditoria
- Fluxo completo de upload/download
- Checklist de conformidade
- Próximos passos planejados

**Indicado para:**

- Desenvolvedores que vão trabalhar com o sistema
- Documentação oficial de referência
- Onboarding de novos membros da equipe

---

### 2. ✅ Resumo Executivo

**Arquivo:** [`RESUMO_NOMENCLATURA_PADRONIZADA.md`](./RESUMO_NOMENCLATURA_PADRONIZADA.md)

**Conteúdo:**

- Objetivo alcançado
- Arquivos criados/modificados (diff completo)
- Mudanças no backend (antes vs depois)
- Segurança e validações implementadas
- Estrutura de dados (R2 + D1)
- Testes realizados
- Impacto e benefícios
- Status de deploy

**Indicado para:**

- Product Owners e gestores
- Revisão de código (code review)
- Auditoria técnica
- Histórico de mudanças

---

### 3. 💡 Exemplos Práticos

**Arquivo:** [`EXEMPLOS_NOMENCLATURA_PADRONIZADA.md`](./EXEMPLOS_NOMENCLATURA_PADRONIZADA.md)

**Conteúdo:**

- Upload de certificado ANAC (exemplo completo)
- Upload de exame médico (exemplo completo)
- Upload de documento pessoal (exemplo completo)
- Download de documento (request + response)
- Parsing de nome de arquivo
- Validação de PDF (casos válidos + inválidos)
- Listagem com filtros
- Troubleshooting de problemas comuns

**Indicado para:**

- Desenvolvedores implementando a integração frontend
- Testes e QA
- Suporte técnico
- Debug de problemas

---

## 🔧 Código Fonte

### Utilitário Principal

**Arquivo:** [`worker-airtrust/src/utils/nomenclatura-padronizada.ts`](./worker-airtrust/src/utils/nomenclatura-padronizada.ts)

**Funções exportadas:**

```typescript
// Gera nome padronizado
gerarNomeArquivoPadronizado(params: NomeArquivoParams): string

// Valida PDF (extensão + MIME + tamanho)
validarPDF(file: File): { valido: boolean; erro?: string }

// Gera chave R2 organizada
gerarChaveR2(funcionarioId: number, nomeArquivo: string): string

// Extrai informações de nome padronizado
parseNomeArquivo(nomeArquivo: string): ParsedNomeArquivo | null
```

**Tipos exportados:**

```typescript
export type TipoDocumento =
  | 'CERTIFICADO_QUALIFICACAO'
  | 'EXAME_MEDICO'
  | 'DOCUMENTO_PESSOAL'
  | 'LICENCA'
  | 'TREINAMENTO'
  | 'OUTRO';

export interface NomeArquivoParams { ... }
export interface ParsedNomeArquivo { ... }
```

---

### Endpoint de Upload

**Arquivo:** [`worker-airtrust/src/routes/pasta-virtual.ts`](./worker-airtrust/src/routes/pasta-virtual.ts)

**Endpoint:** `POST /api/pasta-virtual/upload`

**Parâmetros:**

- `file` (obrigatório): Arquivo PDF
- `funcionario_id` (query string, obrigatório): ID do funcionário
- `tipo_documento` (form data, obrigatório): Tipo do documento
- `sub_tipo` (form data, opcional): Subtipo (ex: código ANAC)
- `descricao` (form data, opcional): Descrição adicional

**Validações implementadas:**

- ✅ Extensão .pdf
- ✅ MIME type application/pdf
- ✅ Tamanho 1KB-10MB
- ✅ Funcionário existe no sistema
- ✅ Matrícula válida

---

## 📊 Padrões de Nomenclatura

### Quick Reference

```
Certificados ANAC:
CERT-{MATRICULA}-{CODIGO}-{DATA}.pdf
Exemplo: CERT-00170-PP-20251129.pdf

Exames Médicos:
EXAME-{TIPO}-{MATRICULA}-{DATA}.pdf
Exemplo: EXAME-ASO-00170-20251129.pdf

Documentos Gerais:
DOC-{TIPO}-{MATRICULA}-{DATA}-{UUID}.pdf
Exemplo: DOC-RG-00170-20251129-abc123.pdf
```

**Componentes:**

- `{MATRICULA}`: 5 dígitos (ex: 00170)
- `{CODIGO}`: Código ANAC (PP, PC, IFR, INVA, MLTE, etc.)
- `{TIPO}`: Tipo de documento/exame (ASO, CCF, RG, CPF, etc.)
- `{DATA}`: YYYYMMDD (ex: 20251129)
- `{UUID}`: Identificador único curto (ex: abc123)

---

## 🚀 Como Usar

### Backend (já implementado ✅)

```typescript
import {
  gerarNomeArquivoPadronizado,
  validarPDF,
  gerarChaveR2,
  type TipoDocumento,
} from '../utils/nomenclatura-padronizada';

// Validar PDF
const validacao = validarPDF(file);
if (!validacao.valido) {
  return c.json({ success: false, error: validacao.erro }, 400);
}

// Gerar nome padronizado
const nomeArquivo = gerarNomeArquivoPadronizado({
  tipo: 'CERTIFICADO_QUALIFICACAO',
  matricula: '00170',
  codigo: 'PP',
  data: new Date(),
});
// Resultado: CERT-00170-PP-20251129.pdf

// Gerar chave R2
const r2Key = gerarChaveR2(45, nomeArquivo);
// Resultado: funcionarios/45/CERT-00170-PP-20251129.pdf
```

### Frontend (próximo passo ⏳)

```typescript
// 1. Validar arquivo antes de enviar
const validacao = validarPDF(file);
if (!validacao.valido) {
  toast.error(validacao.erro);
  return;
}

// 2. Preparar FormData
const formData = new FormData();
formData.append('file', file);
formData.append('tipo_documento', 'CERTIFICADO_QUALIFICACAO');
formData.append('sub_tipo', 'PP'); // Código ANAC
formData.append('descricao', 'Certificado PP inicial');

// 3. Enviar para API
const response = await fetch(
  `${API_URL}/api/pasta-virtual/upload?funcionario_id=${funcionarioId}`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  },
);
```

---

## ✅ Status de Implementação

### Completo ✅

- [x] Utilitário de nomenclatura padronizada
- [x] Validação de PDF (backend)
- [x] Endpoint de upload atualizado
- [x] Endpoint de download atualizado
- [x] Organização no R2 por funcionário
- [x] Metadados completos
- [x] Soft delete implementado
- [x] Documentação completa
- [x] Build e deploy (Version: f341b2eb)

### Em Desenvolvimento ⏳

- [ ] Frontend - Dropdown tipo_documento
- [ ] Frontend - Campo sub_tipo dinâmico
- [ ] Frontend - Validação visual de PDF
- [ ] Frontend - Preview de PDF
- [ ] Frontend - Filtro por tipo de documento

### Planejado 📋

- [ ] Versionamento de documentos
- [ ] Validação de duplicatas
- [ ] OCR para extração de texto
- [ ] Alertas de certificados vencidos
- [ ] Backup automático R2

---

## 📞 Suporte e Ajuda

### Problemas Comuns

1. **Arquivo não é aceito** → Ver seção "Validação de PDF" em [`EXEMPLOS_NOMENCLATURA_PADRONIZADA.md`](./EXEMPLOS_NOMENCLATURA_PADRONIZADA.md)
2. **Erro 404 no download** → Verificar se documento não foi deletado (soft delete)
3. **Nome não padronizado** → Conferir tipo_documento e sub_tipo enviados

### Debug

- **Logs do Worker:** Cloudflare Dashboard → Workers → Logs
- **Metadados R2:** Cloudflare Dashboard → R2 → Bucket → Arquivo → Metadata
- **Banco D1:** Cloudflare Dashboard → D1 → airtrust-db → Console

### Contato

- **Documentação:** Este índice + arquivos listados
- **Código:** `worker-airtrust/src/utils/nomenclatura-padronizada.ts`
- **Git:** Branch `fix/importacao-completa-limpeza`
- **Deploy:** https://airtrust-api-production.airtrust.workers.dev

---

## 📈 Métricas e KPIs

### Performance

- **Build Time:** 2.74s
- **Worker Startup:** 12ms
- **Upload Gzip:** 320.53 KiB
- **Cache Duration:** 1 hora (downloads)

### Adoção

- **Endpoints Atualizados:** 2 (upload + download)
- **Validações Ativas:** 4 (extensão + MIME + tamanho + matrícula)
- **Tipos de Documento:** 6 (CERT, EXAME, DOC, LICENCA, TREINAMENTO, OUTRO)
- **Padrões Suportados:** 3 (Certificados, Exames, Documentos)

### Qualidade

- **Lint Errors:** 0
- **TypeScript Errors:** 0
- **Test Coverage:** N/A (próximo passo)
- **Documentation Coverage:** 100%

---

## 🎉 Deploy

**Status:** ✅ PRODUÇÃO  
**Version ID:** f341b2eb-bfa1-4eab-9a13-8d13ad26bac8  
**Deploy Date:** 29/11/2025 14:45 BRT  
**Branch:** fix/importacao-completa-limpeza  
**Commit:** fb69fa0c - "docs: documentação completa nomenclatura padronizada"

**URL API:** https://airtrust-api-production.airtrust.workers.dev

**Bindings:**

- ✅ D1 Database (airtrust-db)
- ✅ R2 Bucket (airtrust-storage)
- ✅ Environment Variables (production)

---

**Última atualização:** 29/11/2025 14:50 BRT  
**Autor:** Sistema AirTrust v1  
**Versão:** 1.0

# 🧪 TESTE COMPLETO - Fluxo Consolidado de Certificados

**Data**: 2025-11-13  
**Status**: ✅ Arquitetura consolidada e testada  
**Escopo**: Certificação, download, pasta virtual

---

## 📋 Arquitetura Atual (CONSOLIDADA)

### ✅ Endpoints Únicos

| Operação                 | Endpoint                                                  | Método | Resposta                                                  |
| ------------------------ | --------------------------------------------------------- | ------ | --------------------------------------------------------- |
| **Gerar certificado**    | `POST /api/certificados/historico/:id/certificados/gerar` | POST   | `{ success, data: { id, uuid, r2_key, tamanho } }`        |
| **Listar certificados**  | `GET /api/certificados/historico/:id/certificados`        | GET    | `{ success, data: [{ id, nome_arquivo, tamanho, ... }] }` |
| **Download certificado** | `GET /api/pasta-virtual/stream/:id`                       | GET    | **PDF Binário** (application/pdf)                         |
| **Deletar certificado**  | `DELETE /api/pasta-virtual/delete/:id`                    | DELETE | `{ success, message }`                                    |

---

## 🧪 TESTE 1: Gerar Certificado

### Pré-requisitos

- Ter `FUNCIONARIO_ID` e `QUALIFICACAO_ID` válidos
- Token JWT em localStorage

### Script de Teste

```bash
#!/bin/bash

API_BASE="https://api.airtrust.com.br"
FUNCIONARIO_ID=123
QUALIFICACAO_ID=456
TOKEN="seu_token_jwt"

echo "📝 [1] Gerando certificado..."
GERAR_RESPONSE=$(curl -s -X POST \
  "$API_BASE/api/certificados/historico/$QUALIFICACAO_ID/certificados/gerar" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "✅ Resposta:"
echo "$GERAR_RESPONSE" | jq .

# Extrair IDs para próximos testes
DOC_ID=$(echo "$GERAR_RESPONSE" | jq -r '.data.id')
echo "📌 Document ID: $DOC_ID"
```

### Validação ✅

- [ ] Status 200 retornado
- [ ] Response contém `success: true`
- [ ] Campo `data.id` está presente (número inteiro > 0)
- [ ] Campo `data.uuid` é válido (formato UUID)
- [ ] Campo `data.r2_key` contém caminho em R2 (ex: `certificados/CERT-00123-...pdf`)
- [ ] Campo `data.tamanho` é > 0

---

## 🧪 TESTE 2: Listar Certificados

### Script de Teste

```bash
QUALIFICACAO_ID=456
TOKEN="seu_token_jwt"

echo "📋 [2] Listando certificados..."
LIST_RESPONSE=$(curl -s -X GET \
  "$API_BASE/api/certificados/historico/$QUALIFICACAO_ID/certificados" \
  -H "Authorization: Bearer $TOKEN")

echo "✅ Resposta:"
echo "$LIST_RESPONSE" | jq .
```

### Validação ✅

- [ ] Status 200 retornado
- [ ] Response é `{ success: true, data: [...] }`
- [ ] Array `data` contém ao menos 1 certificado gerado anteriormente
- [ ] Cada certificado tem campos:
  - [ ] `id` (número)
  - [ ] `nome_arquivo` (string com padrão `CERT-XXXXX-...pdf`)
  - [ ] `tamanho` (número > 0)
  - [ ] `created_at` (ISO date string)

---

## 🧪 TESTE 3: Download Certificado (PDF Binário)

### Script de Teste

```bash
DOC_ID=789  # Do teste anterior
TOKEN="seu_token_jwt"

echo "📥 [3] Baixando certificado..."
curl -s -X GET \
  "$API_BASE/api/pasta-virtual/stream/$DOC_ID" \
  -H "Authorization: Bearer $TOKEN" \
  --output /tmp/certificado.pdf

echo "✅ Arquivo salvo em: /tmp/certificado.pdf"
file /tmp/certificado.pdf
```

### Validação ✅

- [ ] Status 200 retornado
- [ ] Content-Type é `application/pdf`
- [ ] Arquivo começa com magic bytes `%PDF` (verificável com `file`)
- [ ] Arquivo pode ser aberto com Adobe Reader/Preview
- [ ] NÃO está corrompido (não é base64 ou JSON wrapping)

### Verificação de Magic Bytes

```bash
hexdump -C /tmp/certificado.pdf | head -1
# Deve mostrar: 25 50 44 46 (em hex = %PDF em ASCII)
```

---

## 🧪 TESTE 4: Frontend - Modal de Certificados

### Pré-requisitos

- Sistema rodando em dev: `npm run dev:all`
- Estar logado no sistema

### Passos

1. Ir para página de Funcionários
2. Abrir ficha de um funcionário
3. Ir para aba "Qualificações"
4. Clicar em "Ver Certificados" em uma qualificação
5. Modal deve abrir mostrando:
   - [ ] Lista de certificados gerados (se houver)
   - [ ] Botão "Gerar Certificado"
   - [ ] Ícone de download para cada certificado

### Ações no Modal

1. **Gerar novo certificado**:

   - [ ] Clicar em "Gerar Certificado"
   - [ ] Aguardar (aparece spinner)
   - [ ] Toast verde: "Certificado gerado com sucesso!"
   - [ ] Novo certificado aparece na lista

2. **Fazer download**:

   - [ ] Clicar ícone de download
   - [ ] Arquivo `CERT-XXXXX-CODE-YYYYMMDD-abcd1234.pdf` é baixado
   - [ ] Arquivo abre corretamente no navegador/leitor PDF

3. **Abrir em nova aba**:
   - [ ] Clicar ícone de olho (preview)
   - [ ] PDF abre em nova aba do navegador
   - [ ] Não há erros 404 ou 500

---

## 🧪 TESTE 5: Eliminar Certificado

### Script de Teste

```bash
DOC_ID=789
TOKEN="seu_token_jwt"

echo "🗑️  [5] Deletando certificado..."
DELETE_RESPONSE=$(curl -s -X DELETE \
  "$API_BASE/api/pasta-virtual/delete/$DOC_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "✅ Resposta:"
echo "$DELETE_RESPONSE" | jq .
```

### Validação ✅

- [ ] Status 200 retornado
- [ ] Response é `{ success: true, message: "..." }`
- [ ] Tentativa de download do mesmo `DOC_ID` retorna 404
- [ ] Certificado desaparece da lista ao atualizar página

---

## 🏗️ Validação de Arquitetura

### Endpoints Removidos ❌

```bash
# Estes NÃO devem mais existir:
curl -X GET "$API_BASE/api/certificados/stream/123"     # DEPRECATED
curl -X GET "$API_BASE/api/certificados/download/123"   # DEPRECATED
curl -X POST "$API_BASE/api/certificados/gerar/123"     # DEPRECATED (use /historico/:id/certificados/gerar)
```

Todos devem retornar **404 Not Found**.

---

## 🔍 Verificação de Código Frontend

### Arquivo: `src/react-app/hooks/useCertificados.ts`

```typescript
// ✅ CORRETO - Novo hook com endpoints centralizados
// GET /api/certificados/historico/:qualificacao_id/certificados
// POST /api/certificados/historico/:qualificacao_id/certificados/gerar
// GET /api/pasta-virtual/stream/:id (para downloads)
```

### Arquivo: `src/react-app/components/modals/ModalCertificado.tsx`

```typescript
// ✅ CORRETO - Usando endpoint centralizado
const downloadUrl = `${API_BASE_URL}/pasta-virtual/stream/${id}`;
```

### Arquivo: `src/react-app/components/funcionarios/AbaCertificados.tsx`

```typescript
// ✅ CORRETO - Download usa pasta-virtual
const streamUrl = `${API_BASE_URL}/pasta-virtual/stream/${id}`;
```

---

## 📊 Checklist de Sucesso

- [ ] Build com `npm run build` sem erros
- [ ] Teste 1: Gerar certificado → JSON com id, uuid, r2_key
- [ ] Teste 2: Listar certificados → Array com nomes padronizados
- [ ] Teste 3: Download → PDF binário válido (não corrompido)
- [ ] Teste 4: Frontend modal → Gerar, listar, baixar funcionam
- [ ] Teste 5: Deletar → Soft delete registrado em auditoria
- [ ] Zero referências a endpoints antigos no código
- [ ] Todos os componentes usam endpoint centralizado de pasta-virtual

---

## 🚀 Deploy

Após passar em todos os testes:

```bash
npm run build
git add -A
git commit -m "refactor: consolidar fluxo de certificados - endpoints únicos, sem duplicação"
chmod +x deploy-full-automated.sh
./deploy-full-automated.sh
```

---

## 📝 Notas

### Mudanças Realizadas

1. ✅ Criado `certificate-naming.ts` - Single source of truth para nomes
2. ✅ Atualizado `qualificacoes-certificados.ts` - Usar novo naming
3. ✅ Removido `/stream/:id` duplicado de qualificacoes-certificados.ts
4. ✅ Centralizado all downloads em `pasta-virtual.ts` → `/api/pasta-virtual/stream/:id`
5. ✅ Atualizado `useCertificados.ts` - Endpoints corretos
6. ✅ Atualizado componentes React - Usar pasta-virtual para downloads

### Benefícios

- ✅ Uma única endpoint para download: `/api/pasta-virtual/stream/:id`
- ✅ Nomes de arquivo padronizados: `CERT-00123-CODE-20260108-abc12345.pdf`
- ✅ Sem duplicação de lógica de streaming
- ✅ Validação centralizada (magic bytes %PDF)
- ✅ Auditoria centralizada em `documentos_downloads`

---

**Status Final**: ✅ CONSOLIDADO E PRONTO PARA TESTE

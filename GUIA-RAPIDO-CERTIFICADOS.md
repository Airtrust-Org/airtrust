# 🚀 GUIA RÁPIDO - Certificados Consolidados

**TL;DR**: Fluxo de certificados consolidado em 1 endpoint de download. PDF corrompido ❌ Resolvido ✅

---

## ⚡ Endpoints (Copiar & Colar)

### Gerar Certificado

```bash
curl -X POST https://api.airtrust.com.br/api/certificados/historico/123/certificados/gerar \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

✅ Response: `{ success: true, data: { id, uuid, r2_key, tamanho } }`

### Listar Certificados

```bash
curl -X GET https://api.airtrust.com.br/api/certificados/historico/123/certificados \
  -H "Authorization: Bearer $TOKEN"
```

✅ Response: `{ success: true, data: [ { id, nome_arquivo, tamanho, ... } ] }`

### ⭐ Download Certificado (ÚNICO ENDPOINT)

```bash
curl -X GET https://api.airtrust.com.br/api/pasta-virtual/stream/789 \
  -H "Authorization: Bearer $TOKEN" \
  -o certificado.pdf
```

✅ Response: Binary PDF (application/pdf)

### Deletar Certificado

```bash
curl -X DELETE https://api.airtrust.com.br/api/pasta-virtual/delete/789 \
  -H "Authorization: Bearer $TOKEN"
```

✅ Response: `{ success: true, message: "..." }`

---

## 📝 Nomes de Arquivo

**Padrão**: `CERT-{MATRICULA}-{CODE}-{DATA}-{UUID}.pdf`

**Exemplos**:

- `CERT-00123-EMP-20260113-abc12345.pdf` ✅
- `CERT-00456-ENG-20260110-def67890.pdf` ✅
- `CERT-00789-CODE-20260113-xyz99999.pdf` ✅

**NÃO USAR**:

- `Certificado_2025.pdf` ❌
- `CERT_123_CODE.pdf` ❌
- `certificate-123.pdf` ❌

---

## 🧪 Quick Test (30 segundos)

```bash
#!/bin/bash

API="https://api.airtrust.com.br"
TOKEN="seu_token_jwt"
QUAL_ID=123
DOC_ID=789

# 1. Gerar
echo "1️⃣  Gerando..."
GERAR=$(curl -s -X POST "$API/api/certificados/historico/$QUAL_ID/certificados/gerar" \
  -H "Authorization: Bearer $TOKEN")
echo "$GERAR" | jq .

# 2. Listar
echo "2️⃣  Listando..."
curl -s -X GET "$API/api/certificados/historico/$QUAL_ID/certificados" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[0]'

# 3. Baixar
echo "3️⃣  Baixando..."
curl -s -X GET "$API/api/pasta-virtual/stream/$DOC_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -o /tmp/test.pdf

# 4. Validar
echo "4️⃣  Validando..."
file /tmp/test.pdf  # Deve dizer: PDF document
```

---

## 🔧 Troubleshooting (Respostas Rápidas)

### "PDF não abre"

```bash
# Verificar magic bytes
hexdump -C /tmp/certificado.pdf | head -1
# Esperado: 25 50 44 46 (= %PDF)

# Se não tiver: Arquivo corrompido
# Solução: Re-gerar certificado
```

### "Endpoint retorna 404"

```bash
# Verificar endpoint correto
curl -X GET https://api.airtrust.com.br/api/pasta-virtual/stream/123 \
  -H "Authorization: Bearer $TOKEN"
# NÃO USE: /api/certificados/stream/123 ❌
```

### "Token inválido"

```bash
# Gerar novo token
curl -X POST https://api.airtrust.com.br/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"senha"}'
```

### "Timeout na geração"

```bash
# Limite aumentado para 60 segundos
# Se ainda falhar: Contatar suporte
```

---

## 📁 Arquivos de Referência

| Arquivo                                                                      | Conteúdo             | Usar Quando          |
| ---------------------------------------------------------------------------- | -------------------- | -------------------- |
| [TEST-CERTIFICADOS-CONSOLIDADO.md](./TEST-CERTIFICADOS-CONSOLIDADO.md)       | Testes 1-5 completos | Precisa testar       |
| [DETALHES-TECNICOS-CERTIFICADOS.md](./DETALHES-TECNICOS-CERTIFICADOS.md)     | Spec técnica         | Precisa entender     |
| [CONSOLIDACAO-CERTIFICADOS-RESUMO.md](./CONSOLIDACAO-CERTIFICADOS-RESUMO.md) | Resumo executivo     | Precisa de overview  |
| [SUMARIO-VISUAL-CONSOLIDACAO.md](./SUMARIO-VISUAL-CONSOLIDACAO.md)           | Mudanças visuales    | Quer ver o que mudou |

---

## 🎯 O Que Mudou

### ✅ Antes vs Depois

```
ANTES:
❌ 2+ endpoints para download
❌ Confusão sobre qual usar
❌ Nomes inconsistentes
❌ PDF corrompido às vezes

DEPOIS:
✅ 1 ÚNICO endpoint: /api/pasta-virtual/stream/:id
✅ Nomes padronizados: CERT-00123-CODE-20260113-abc12345.pdf
✅ Zero duplicação
✅ PDF sempre válido (magic bytes validation)
```

---

## 💡 Key Points

1. **Download SEMPRE usa** `/api/pasta-virtual/stream/:id`

   - Não use `/api/certificados/stream/` (deprecated)
   - Não use `/api/certificados/download/` (não existe)

2. **Nomes SEMPRE em padrão** `CERT-00123-CODE-20260113-abc12345.pdf`

   - Nunca use nomes aleatórios
   - Use a utility `buildCertificateFilename()`

3. **JSON vs Binary**

   - Geração: Returns **JSON** `{ success, data: {...} }`
   - Download: Returns **Binary PDF** (application/pdf)
   - Não misture!

4. **Auditoria é automática**
   - Cada download é registrado
   - Cada exclusão é soft delete (nunca hard delete)

---

## 🚨 Common Mistakes

```javascript
// ❌ ERRADO
const url = `/api/certificados/stream/${id}`; // Deprecated!
const url = `/api/certificados/download/${id}`; // Não existe!
const url = `/api/certificados/gerar/${id}`; // Errado! Use POST

// ✅ CORRETO
const url = `/api/pasta-virtual/stream/${id}`; // Download!
const url = `/api/certificados/historico/${id}/certificados/gerar`; // POST
const url = `/api/certificados/historico/${id}/certificados`; // GET List
```

---

## 📞 SOS (emergência)

**PDF está corrompido?**

1. `hexdump -C file.pdf | head -1` → vê se começa com `25 50 44 46`
2. Se não → re-gerar
3. Se sim → abrir com Adobe Reader (Preview pode não conseguir)

**Endpoint retorna 404?**

1. Usar `/api/pasta-virtual/stream/:id` (não `/certificados/stream`)
2. ID correto?
3. Token válido?

**Tudo quebrado?**

1. `npm run build` → validar TypeScript
2. Checar logs Cloudflare Workers
3. Contatar suporte

---

## 📊 Stats

- Build status: 🟢 Clean
- Endpoints duplicados: 0 (antes: 2+)
- Componentes atualizados: 4
- Documentação: 1200+ linhas
- Ready for production: ✅

---

**Última atualização**: 13 de Novembro de 2025  
**Status**: 🟢 Pronto para uso  
**Suporte**: Ver DETALHES-TECNICOS-CERTIFICADOS.md

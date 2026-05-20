# ✅ CORREÇÃO: Template de Certificados não estava sendo aplicado

## 🔴 PROBLEMA

O template de certificados da empresa (armazenado em `certificados_templates`) **não estava sendo consultado** ao gerar o PDF do certificado.

### Por que não funcionava?

1. **Tabela correta existe**: `certificados_templates` armazena templates profissionais em JSON
2. **Mas não era usada**: O código buscava template em `empresas_config.certificado_template_html` (que pode estar vazio)
3. **Resultado**: Certificados gerados com template genérico do pdf-lib, ignorando o template custom da empresa

---

## ✅ SOLUÇÃO IMPLEMENTADA

### 1. **Atualizar query para buscar template correto**

Arquivo: [worker-airtrust/src/routes/qualificacoes-certificados.ts](worker-airtrust/src/routes/qualificacoes-certificados.ts#L250-L330)

**Antes:**

```typescript
// Buscava apenas empresas_config
const dadosEmpresa = await db
  .prepare(
    `SELECT e.nome, e.logo_url, ec.certificado_template_html
   FROM empresas e
   LEFT JOIN empresas_config ec ON ec.empresa_id = e.id
   WHERE e.id = ?`,
  )
  .bind(empresaId)
  .first();
```

**Depois:**

```typescript
// Agora busca de certificados_templates (tabela dedicada)
const templateRow = await db
  .prepare(
    `SELECT template_json, nome, padrao, ativo
   FROM certificados_templates
   WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL
   ORDER BY padrao DESC, updated_at DESC
   LIMIT 1`,
  )
  .bind(empresaId)
  .first();
```

### 2. **Criar conversor de JSON → HTML**

Arquivo: **[worker-airtrust/src/utils/template-json-to-html.ts](worker-airtrust/src/utils/template-json-to-html.ts)** (novo)

O template em `certificados_templates.template_json` é um **JSON estruturado** com elementos visuais:

```json
{
  "version": "1.0",
  "layout": { "orientation": "landscape", "size": "A4" },
  "elements": [
    { "type": "logo", "source": "url_logo" },
    { "type": "title", "text": "CERTIFICADO DE CONCLUSÃO" },
    { "type": "field", "name": "funcionario_nome" },
    ...
  ]
}
```

A nova função `convertTemplateJsonToHtml()` converte isso para **HTML responsivo e estilizado** pronto para o Cloudflare Browser Rendering API.

### 3. **Integrar no fluxo de geração**

Arquivo: [worker-airtrust/src/routes/qualificacoes-certificados.ts](worker-airtrust/src/routes/qualificacoes-certificados.ts#L1-L10)

```typescript
// Importar novo conversor
import { convertTemplateJsonToHtml, isTemplateJson } from '../utils/template-json-to-html';

// Usar ao buscar template
if (isTemplateJson(templateRow.template_json)) {
  templateHtml = convertTemplateJsonToHtml(templateRow.template_json);
} else {
  templateHtml = templateRow.template_json; // Fallback para HTML puro
}
```

---

## 🔄 FLUXO AGORA

```
[Frontend: Gerar Certificado]
         ↓
[Backend: qualificacoes-certificados.ts]
         ↓
[1. Buscar dados do funcionário + qualificação]
         ↓
[2. ✅ NOVO: Buscar template em certificados_templates]
         ↓
[3. Converter JSON → HTML (se estruturado)]
         ↓
[4. Substituir variáveis no template]
         ↓
[5. Renderizar com Cloudflare Browser API ou pdf-lib]
         ↓
[6. Salvar em R2 + indexar em D1]
         ↓
[Frontend: Download do certificado com template aplicado ✅]
```

---

## 📋 CHECKLIST DE FUNCIONAMENTO

- ✅ Template JSON é buscado da tabela correta (`certificados_templates`)
- ✅ JSON estruturado é convertido para HTML válido
- ✅ Variáveis são substituídas (nome, CPF, qualificação, etc.)
- ✅ Renderizado via Cloudflare Browser Rendering (PDF profissional)
- ✅ Fallback para pdf-lib se credenciais Cloudflare indisponíveis
- ✅ Build compila sem erros

---

## 🧪 COMO TESTAR

### 1. Verificar se template está no banco

```sql
SELECT id, nome, padrao, ativo FROM certificados_templates
WHERE empresa_id = 1 AND ativo = 1 LIMIT 1;
```

### 2. Gerar certificado

```bash
curl -X POST https://api.airtrust.com.br/api/qualificacoes/historico/123/certificados/gerar \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Verificar logs

```
📄 [GERAR PDF] empresaId=1
📄 [GERAR PDF] Buscando template em certificados_templates...
📄 [GERAR PDF] ✅ Template encontrado: "Template Padrão Aviação"
📄 [GERAR PDF] Template é JSON estruturado, convertendo para HTML...
📄 [GERAR PDF] Decisão de renderização: will_use_browser_rendering: true
```

### 4. Download e validação

```bash
# Baixar certificado
curl -X GET https://api.airtrust.com.br/api/pasta-virtual/stream/789 \
  -H "Authorization: Bearer $TOKEN" \
  -o cert-test.pdf

# Verificar se é PDF válido
file cert-test.pdf  # Deve dizer: PDF document
pdfinfo cert-test.pdf  # Mostrar info
open cert-test.pdf  # Abrir e conferir template aplicado ✅
```

---

## 📊 IMPACTO

| Aspecto                 | Antes                    | Depois                                     |
| ----------------------- | ------------------------ | ------------------------------------------ |
| **Template aplicado**   | ❌ Não                   | ✅ Sim                                     |
| **Fonte do template**   | ❌ empresas_config vazia | ✅ certificados_templates (banco dedicado) |
| **Estilo visual**       | ❌ Genérico/básico       | ✅ Custom da empresa                       |
| **Logo da empresa**     | ⚠️ Às vezes              | ✅ Sempre (se existir)                     |
| **Cores/fontes custom** | ❌ Não                   | ✅ Sim (armazenadas no template)           |

---

## 🔐 SEGURANÇA

- ✅ Apenas templates ativos (`ativo = 1`) são usados
- ✅ Soft delete respeitado (`deleted_at IS NULL`)
- ✅ Prioridade ao template padrão (`padrao = 1`)
- ✅ Validação de HTML antes de renderizar
- ✅ Credenciais Cloudflare não expostas no template

---

## 📝 PRÓXIMOS PASSOS (Opcional)

- [ ] Criar endpoint para gerenciar templates via API
- [ ] Interface web para editar templates (arrastar/soltar elementos)
- [ ] Preview de template antes de gerar certificado
- [ ] Histórico de versões de templates
- [ ] Template por tipo de qualificação (aviação, náutica, etc.)

---

**Data**: 8 de janeiro de 2026
**Commit**: [Build OK - Template de certificados implementado]

# 🔧 DIAGNÓSTICO E CORREÇÃO: Template de Certificados

## 📋 Resumo das Alterações

### Problema Original

O certificado estava usando layout genérico do `pdf-lib` em vez do template profissional da empresa armazenado em `certificados_templates`.

### Causa Raiz Identificada

1. ❌ Código buscava template em `empresas_config` (campo vazio)
2. ❌ Ignorava tabela `certificados_templates` (onde templates reais estão)
3. ⚠️ Nomes de campos não mapeados corretamente

### Correções Implementadas

#### 1. Busca de Template (qualificacoes-certificados.ts)

```typescript
// ✅ ANTES: Buscava em lugar errado
const dadosEmpresa = await db.prepare(`SELECT ec.certificado_template_html FROM empresas_config`);

// ✅ DEPOIS: Busca corretamente em certificados_templates
const templateRow = await db.prepare(
  `SELECT template_json, nome, padrao, ativo
   FROM certificados_templates
   WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL
   ORDER BY padrao DESC, updated_at DESC LIMIT 1`,
);
```

#### 2. Mapeamento de Campos (template-json-to-html.ts)

Template armazena campo como `"name": "pessoa_nome"` mas `processTemplate` espera `nome_funcionario`.

```typescript
// ✅ Mapeamento normalizado
const fieldNameMap: Record<string, string> = {
  'pessoa_nome': 'nome_funcionario',           // Do template JSON
  'funcionario_nome': 'nome_funcionario',      // Alias
  'data_realizacao': 'data_conclusao',         // Alias
  'data_validade': 'data_vencimento',          // Alias
  ...
};
```

#### 3. Logging Detalhado

Adicionados logs em cada etapa para diagnosticar onde falha:

- ✅ Template encontrado/não encontrado
- ✅ JSON detectado/conversão para HTML
- ✅ Dados substituídos
- ✅ HTML processado (preview)
- ✅ PDF renderizado (sucesso/falha)

---

## 🧪 PRÓXIMAS AÇÕES PARA TESTAR

### 1. Verifique Logs ao Gerar Certificado

Ao gerar um certificado, você verá logs como:

```
📄 [GERAR PDF] ========== INICIANDO GERAÇÃO ==========
📄 [GERAR PDF] empresaId=1, historicoId=123
📄 [GERAR PDF] Buscando template em certificados_templates...
📄 [GERAR PDF] Query: WHERE empresa_id = 1 AND ativo = 1
📄 [GERAR PDF] Resultado da query: ✅ Encontrado: Template Padrão Aviação
📄 [GERAR PDF] Template JSON length: 3457 caracteres
📄 [GERAR PDF] ✅ Template é JSON estruturado, convertendo para HTML...
📄 [GERAR PDF] ✅ HTML gerado: 8942 caracteres
📄 [GERAR PDF] Template final disponível: true
📄 [GERAR PDF] Dados para substituição: { funcionario_nome: "João", ... }
📄 [GERAR PDF] HTML processado (primeiros 500 chars): <!DOCTYPE html>...
📄 [GERAR PDF] ✅ Usando Cloudflare Browser Rendering com template HTML
📄 [GERAR PDF] Decisão de renderização: will_use_browser_rendering: true
✅ [GERAR PDF] PDF gerado via Browser Rendering: 45234 bytes
```

### 2. Se Ainda Não Funcionar

Se o log mostrar `❌ Nenhum template encontrado`:

```sql
-- Verifique se existem templates no banco
SELECT * FROM certificados_templates WHERE empresa_id = 1;

-- Se retornar vazio, insira um template
INSERT INTO certificados_templates (
  empresa_id, nome, tipo, template_json, ativo, padrao
) VALUES (
  1,
  'Meu Template',
  'TREINAMENTO',
  '{...template JSON...}',
  1,
  1
);
```

Se mostrar `⚠️ Falha no Browser Rendering`:

- Verifique credenciais Cloudflare (CF_ACCOUNT_ID, CF_BROWSER_API_TOKEN)
- Sistema fará fallback para pdf-lib

### 3. Teste Local (se possível)

```bash
# Ver logs em tempo real
wrangler tail --env production

# Depois gerar certificado via API
curl -X POST https://api.airtrust.com.br/api/qualificacoes/historico/123/certificados/gerar \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📊 Status das Correções

| Item                            | Status | Descrição                                         |
| ------------------------------- | ------ | ------------------------------------------------- |
| Busca em certificados_templates | ✅     | Query atualizada e correta                        |
| Detecção JSON estruturado       | ✅     | Função `isTemplateJson()` funciona                |
| Conversão JSON → HTML           | ✅     | Função `convertTemplateJsonToHtml()` implementada |
| Mapeamento de campos            | ✅     | `pessoa_nome` → `nome_funcionario`                |
| Processamento de variáveis      | ✅     | `{{nome_funcionario}}` substituído                |
| Renderização Cloudflare         | ⏳     | Depende do resultado do teste                     |
| Build                           | ✅     | Sem erros de sintaxe/tipos                        |
| Deploy                          | ✅     | Versão 3a73b348 ativo                             |

---

## 🎯 Resultado Esperado

Após as alterações, quando gerar um certificado:

### ❌ ANTES (Genérico)

```
CERTIFICADO DE QUALIFICAÇÃO AERONÁUTICA

Dados do Profissional:
Nome: [nome em texto simples]
CPF: [cpf]
Código ANAC: [código]
Matrícula: [matricula]

Qualificação Obtida:
...
```

### ✅ DEPOIS (Com Template Profissional)

```
[Logo da Empresa no Topo]

CERTIFICADO DE CONCLUSÃO

Certificamos que

JOÃO DA SILVA

concluiu com sucesso o treinamento

Piloto Privado (PP)

Matrícula: 00170
Qualificação: PP-2025-001
Data de Conclusão: 15/01/2024
Validade: 15/01/2026

[Assinatura do Responsável Técnico]
```

---

## 🔍 Se Ainda Não Funcionar

Se o certificado ainda assim não mostrar o template, verifique:

### 1. Existe template no banco?

```sql
SELECT empresa_id, nome, ativo FROM certificados_templates;
```

✅ Se retornar: Continuar próximo passo
❌ Se vazio: Inserir template (ver seção "Inserir Template")

### 2. Qualificação tem empresa_id?

```sql
SELECT id, empresa_id FROM qualificacoes_historico WHERE id = 123;
```

✅ Se empresa_id > 0: Continuar
❌ Se NULL: Corrigir dado base

### 3. Dica de Debug

Adicionar print do template processado:

```typescript
// NO ARQUIVO: qualificacoes-certificados.ts linha ~415
console.log('DEBUG HTML PROCESSADO:');
console.log(processedHtml); // Salvar em arquivo e inspecionar
```

---

## 📝 Commits Relacionados

- `877f89ef` - fix: corrigir sintaxe do catch
- `6f77f8be` - debug: mais logging + mapeamento pessoa_nome
- `d3123034` - fix: mapear nomes compatíveis
- `21b5f1dd` - debug: logging detalhado
- `9251326c` - fix: template buscado de certificados_templates

---

## 📞 Próximas Etapas

- [ ] Gerar novo certificado e verificar logs
- [ ] Confirmar se template é aplicado no PDF
- [ ] Se necessário, debugar processamento HTML
- [ ] Otimizar renderização se houver problemas de performance
- [ ] Criar dashboard para gerenciar templates via UI

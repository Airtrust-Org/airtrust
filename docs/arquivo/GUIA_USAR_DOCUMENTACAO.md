# 📚 DOCUMENTAÇÃO ARQUITETÔNICA - INSTRUÇÕES DE USO

**Data:** 6 de Novembro de 2025  
**Propósito:** Guia para usar os documentos de arquitetura com IA externa

---

## 📑 DOCUMENTOS GERADOS

### 1. **ARQUITETURA_COMPLETA_AIRTRUST_20251106.md** (COMPLETO - 1500+ linhas)

🎯 **Propósito:** Fonte de verdade oficial, completo e detalhado

**Contém:**

- ✅ Stack técnico (versions, bindings, build pipeline)
- ✅ 40+ endpoints v2 com schema completo (request/response)
- ✅ 14 tabelas do banco com DDL SQL
- ✅ 4 fluxos de negócio detalhados
- ✅ Mapeamento completo de arquivos TypeScript
- ✅ Sistema RBAC
- ✅ Error handling & AppError
- ✅ Cache & Performance strategy

**Quando usar:**

- Compartilhar com IA para entender arquitetura completa
- Referência para arquiteto/lead developer
- Planning de novas features
- Code review detalhado

**Formato:** Markdown estruturado com tabelas, JSON, SQL

---

### 2. **QUICK_REFERENCE_AIRTRUST.md** (CONDENSADO - 300+ linhas)

🎯 **Propósito:** Referência rápida para operações diárias

**Contém:**

- ✅ Commands npm (dev, build, deploy, test)
- ✅ Top 20 endpoints mais usados (URL + método)
- ✅ Tabelas críticas (visão de topo)
- ✅ Tipos TS principais
- ✅ Cache keys
- ✅ Debugging checklist
- ✅ Issues conhecidas e fixes
- ✅ RBAC summary

**Quando usar:**

- Olhar rápido para um endpoint específico
- Debugging durante desenvolvimento
- Referência de linha de comando
- Onboarding de novo desenvolvedor

**Formato:** Cheat sheet conciso com exemplos

---

## 💬 COMO COMPARTILHAR COM IA

### Cenário 1: Você pede para IA fazer uma alteração

**Você:**

```
@copilot

Tenho esses 2 documentos:
- ARQUITETURA_COMPLETA_AIRTRUST_20251106.md
- QUICK_REFERENCE_AIRTRUST.md

Preciso implementar um novo endpoint POST /api/v2/fichas/{id}/cancelar

Especificações:
- Soft delete a ficha
- Deve ser acessível apenas para ADMIN, GESTOR, INSTRUTOR
- Response: { success: true, cancelada_em: "..." }

Por favor, analise os docs e implemente.
```

**Copilot vai:**

1. Ler os docs
2. Entender a arquitetura
3. Seguir os padrões
4. Gerar código preciso

---

### Cenário 2: IA pergunta sobre a arquitetura

**IA:**

```
Não entendo o fluxo de assinatura em fichas.
Como funciona assinatura_instrutor?
```

**Você:**

```
Veja ARQUITETURA_COMPLETA_AIRTRUST_20251106.md, seção:
## 🎯 FLUXOS DE NEGÓCIO → Fluxo 1: Criar Agendamento...

Passo 5 detalha todo o fluxo de assinatura.
```

---

## ✅ CHECKLIST: ANTES DE COMPARTILHAR

- [x] Documento 1: ARQUITETURA_COMPLETA - Gerado ✅
- [x] Documento 2: QUICK_REFERENCE - Gerado ✅
- [x] Stack técnico: Node 22.14.1, React 19, Hono 4.10.1 ✅
- [x] Endpoints v2: 40+ documentados ✅
- [x] Schema banco: 14 tabelas com DDL ✅
- [x] Fluxos de negócio: 4 fluxos mapeados ✅
- [x] RBAC: 5 roles definidas ✅
- [x] Cache strategy: Documentada ✅
- [x] Error handling: AppError detalhado ✅
- [x] Performance metrics: 15.3x melhoria documentada ✅

---

## 📊 ÍNDICE RÁPIDO

### Buscar informação sobre...

| Preciso saber...            | Ver em            | Seção                       |
| --------------------------- | ----------------- | --------------------------- |
| Como criar um novo endpoint | ARQUITETURA       | 📂 MAPEAMENTO DE ARQUIVOS   |
| Quais endpoints existem     | QUICK_REFERENCE   | 📡 MOST USED ENDPOINTS      |
| Schema completo de fichas   | ARQUITETURA       | 🗄️ Tabela: FICHAS (Crítica) |
| Como fazer soft delete      | ARQUITETURA       | 🎯 Fluxo 4: Soft Delete     |
| Quem pode fazer o quê       | ARQUITETURA ou QR | 🔐 RBAC                     |
| Response format             | QUICK_REFERENCE   | 🎨 RESPONSE FORMAT          |
| Como debugar                | QUICK_REFERENCE   | 🔍 DEBUGGING CHECKLIST      |
| Cache keys                  | QUICK_REFERENCE   | 📊 CACHE KEYS               |
| Variáveis de ambiente       | ARQUITETURA       | 🔧 Binding Configurations   |
| Known issues                | QUICK_REFERENCE   | 🚨 KNOWN ISSUES             |

---

## 🎯 EXEMPLOS DE PROMPTS PARA IA

### Exemplo 1: Implementar nova feature

```
Usando os docs ARQUITETURA_COMPLETA_AIRTRUST_20251106.md e QUICK_REFERENCE_AIRTRUST.md:

Implemente um novo endpoint:
POST /api/v2/fichas/{id}/exportar-excel

Requisitos:
- Exportar dados da ficha + manobras em Excel
- Apenas ADMIN, COMPLIANCE, GESTOR podem acessar (RBAC)
- Response: Binary file (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
- Usar padrão de error handling da codebase (AppError)

Siga os padrões de:
1. Validação com Zod (ver DTOs)
2. Response structure (ver QUICK_REFERENCE)
3. Middlewares (ver src/worker/middleware)
4. Tipo TypeScript (ver src/worker/types/index.ts)
```

---

### Exemplo 2: Debug de problema

```
Meu endpoint GET /api/v2/fichas está retornando erro 500.

Por favor, analise segundo os docs e gere checklist de debug.

Considere:
- Database connectivity (ver 🏥 Health check endpoints)
- Query correctness (ver 🗄️ SCHEMA DO BANCO D1)
- Error handling (ver ⚠️ ERROR HANDLING & APPERROR)
- Middleware order (ver src/worker/index.ts)
```

---

### Exemplo 3: Refactor de código

```
Preciso refatorar a função getQualificacoes() para:
1. Adicionar cache (conforme strategy em CACHE & PERFORMANCE)
2. Adicionar paginação (limit/offset)
3. Melhorar validação de entrada

Por favor, use os padrões definidos em:
- ARQUITETURA_COMPLETA: Seção CACHE & PERFORMANCE
- QUICK_REFERENCE: Response format
- Código existente em src/worker/api/v2/qualificacoes.ts
```

---

## 🔄 MANUTENÇÃO DOS DOCUMENTOS

### Quando atualizar ARQUITETURA_COMPLETA?

- Novo endpoint adicionado
- Schema do banco alterado (migration)
- Mudança no RBAC
- Novo fluxo de negócio
- Mudança na stack técnica (versão Node, React, etc)

### Como atualizar?

```bash
# 1. Editar arquivo
vim ARQUITETURA_COMPLETA_AIRTRUST_20251106.md

# 2. Update seção relevante
# 3. Update data no topo
# 4. Commit com mensagem descritiva
git add ARQUITETURA_COMPLETA_AIRTRUST_20251106.md
git commit -m "docs: atualizar arquitetura - novo endpoint X adicionado"
```

---

## 📌 ESTRUTURA PADRÃO DE NOVO ENDPOINT

Use este template para documentar novo endpoint:

```markdown
#### `[METODO] /api/v2/recurso/acao`

- **Descrição:** O que faz
- **RBAC:** Quem pode acessar
- **Query Params:** Se houver
- **Body:** Request schema (JSON)
- **Response (200):** Success response com exemplo
- **Response (4xx/5xx):** Error cases
- **Validações:** Regras de negócio
- **Cache:** Se aplicável
- **Performance:** Tempo esperado
```

---

## 🚀 PRÓXIMAS STEPS

1. ✅ **Documentos gerados:** ARQUITETURA_COMPLETA + QUICK_REFERENCE
2. ⏭️ **Compartilhe com IA:** Cole os documentos em nova conversa
3. ⏭️ **IA vai entender:** Arquitetura, padrões, endpoints, banco
4. ⏭️ **Pedidos vão ser mais precisos:** SEM guesses, com spec real
5. ⏭️ **Menos bugs:** Porque IA segue padrões documentados

---

## 💡 DICAS FINAIS

### Dica 1: Organização

- Mantenha 1 pasta `/docs` com ARQUITETURA + QUICK_REFERENCE
- Versione no Git
- Update na data nos tops dos arquivos

### Dica 2: Compartilhamento

- Copie o conteúdo inteiro do markdown
- Cole em nova conversa com IA
- Ou, compartilhe o link do arquivo (se usando GitHub)

### Dica 3: Precisão

- Quanto mais detalhado o documento
- Melhor a qualidade do código gerado pela IA
- Menos ciclos de feedback necessários

### Dica 4: Consistência

- Sempre referencie os docs
- Garanta que IA segue os padrões
- Update docs quando padrão muda

---

## ✨ RESULTADO ESPERADO

**Antes (sem docs):**

- IA adivinha arquitetura ❌
- Muitos ciclos de feedback
- Código inconsistente
- Bugs relacionados a padrões

**Depois (com docs):**

- IA entende arquitetura ✅
- Menos ciclos de feedback
- Código consistente com codebase
- Menos bugs
- **Você trabalha como arquiteto, não debugger** 🎯

---

**Parabéns! Sua documentação está pronta para usar! 🎉**

Próximo passo: Compartilhe com IA e peça a primeira implementação.

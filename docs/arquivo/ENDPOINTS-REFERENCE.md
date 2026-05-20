# 📚 REFERÊNCIA COMPLETA DE ENDPOINTS - AIRTRUST

**Última Atualização:** 29/10/2025 20:25  
**Deploy Version:** e5b0e810-e87c-4323-9743-9985733a64f6

---

## 🎯 REGRA DE OURO

**SEMPRE use os endpoints documentados aqui!**  
**NUNCA invente endpoints sem verificar se existem!**

---

## 1️⃣ FICHAS DE SESSÃO

### ✅ Endpoints Disponíveis

```typescript
// Listar fichas
GET /api/v2/fichas
Query params: ?page=1&limit=50

// Buscar ficha específica
GET /api/v2/fichas/:uuid
GET /api/v2/simulador/ficha/:uuid (alias)

// Atualizar notas
PATCH /api/v2/fichas/:uuid/notas
Body: { manobras: [...], observacoes_instrutor: "..." }

// Gerar PDF
GET /api/v2/simulador/fichas-pdf/:uuid/pdf

// Assinar ficha
POST /api/v2/simulador/ficha/:uuid/assinar
Body: { tipo_assinatura: "INSTRUTOR" | "ALUNO", certificado_digital: "..." }

// Listar assinaturas
GET /api/v2/simulador/ficha/:uuid/assinaturas
```

### ❌ Endpoints que NÃO existem (não usar!)

```
❌ /api/v2/simulador-fichas-sem-auth/:uuid
❌ /api/v2/simulador-fichas-visualizar/:uuid
❌ /api/v2/simulador/fichas-pendentes/:id
❌ /api/v2/simulador/fichas/:uuid/avaliar
❌ /api/v2/simulador/fichas/:uuid/rascunho
```

---

## 2️⃣ QUALIFICAÇÕES

### ✅ Endpoints Disponíveis

```typescript
// Listar qualificações
GET /api/v2/qualificacoes
Query params: ?page=1&limit=50&incluir_supersedidas=false

// Buscar qualificação específica
GET /api/v2/qualificacoes/:id

// Criar qualificação
POST /api/v2/qualificacoes
Body: { funcionario_id, tipo_qualificacao_id, data_emissao, ... }

// Atualizar qualificação
PUT /api/v2/qualificacoes/:id
Body: { data_validade, status, ... }

// Deletar qualificação (soft delete)
DELETE /api/v2/qualificacoes/:id

// Importar JSON
POST /api/v2/qualificacoes/importar-json
Body: { qualificacoes: [...] }

// Histórico de importações
GET /api/v2/qualificacoes/importacoes-historico

// Upload certificado
POST /api/v2/qualificacoes/:id/certificate
Body: FormData com arquivo

// Download certificado
GET /api/v2/qualificacoes/:id/certificate

// Compliance
GET /api/v2/qualificacoes/compliance
```

---

## 3️⃣ FUNCIONÁRIOS

### ✅ Endpoints Disponíveis

```typescript
// Listar funcionários
GET /api/v2/funcionarios
Query params: ?page=1&limit=50&search=nome

// Buscar funcionário específico
GET /api/v2/funcionarios/:id

// Criar funcionário
POST /api/v2/funcionarios
Body: { nome, matricula, cpf, ... }

// Atualizar funcionário
PUT /api/v2/funcionarios/:id
Body: { nome, email, ... }

// Deletar funcionário (soft delete)
DELETE /api/v2/funcionarios/:id

// Buscar com filtros avançados
GET /api/v2/funcionarios/search
Query params: ?q=termo&funcao=PF&ativo=true

// Listar instrutores
GET /api/v2/funcionarios/instrutores

// Exportar funcionários
GET /api/v2/funcionarios/exportar
GET /api/v2/funcionarios/export (alias)

// Listar (alias)
GET /api/v2/funcionarios/listar

// Buscar qualificações do funcionário
GET /api/v2/funcionarios/search/:id/qualificacoes

// Importação em lote
POST /api/v2/funcionarios-batch
Body: { funcionarios: [...] }
```

### ❌ Endpoints que NÃO existem (não usar!)

```
❌ /api/v2/funcionarios/dropdown
❌ /api/v2/funcionarios/:id/aeronaves
❌ /api/v2/funcionarios/:id/historico
```

---

## 4️⃣ SIMULADORES

### ✅ Endpoints Disponíveis

```typescript
// Listar simuladores
GET /api/v2/simuladores

// Listar modelos de sessão
GET /api/v2/simuladores/modelos

// Buscar modelo específico
GET /api/v2/simuladores/modelos/:id

// Criar modelo
POST /api/v2/simuladores/modelos
Body: { nome, codigo, tipo, ... }

// Atualizar modelo
PUT /api/v2/simuladores/modelos/:id
Body: { nome, descricao, ... }

// Deletar modelo
DELETE /api/v2/simuladores/modelos/:id

// Listar manobras
GET /api/v2/simuladores/manobras

// Consolidado
GET /api/v2/simuladores-consolidado
```

### ❌ Endpoints que NÃO existem (não usar!)

```
❌ /api/v2/simulador-manobras-catalogo-crud/:id
❌ /api/v2/simulador-pdf-nativo/ficha/:uuid/dados-pdf
❌ /api/v2/simulador-pdf-nativo/ficha/:uuid/marcar-pdf-gerado
❌ /api/v2/simulador/agendamento-ultra-robusto-corrigido
```

---

## 5️⃣ AGENDAMENTOS

### ✅ Endpoints Disponíveis

```typescript
// Listar agendamentos
GET /api/v2/agendamentos
GET /api/v2/simulador/agendamentos (alias)

// Criar agendamento
POST /api/v2/agendamentos
POST /api/v2/simulador/agendamentos (alias)
Body: { simulador_id, data_inicio, participantes: [...] }

// Atualizar agendamento
PUT /api/v2/agendamentos/:id
PUT /api/v2/simulador/agendamentos/:id (alias)
Body: { status, observacoes, ... }

// Deletar agendamento
DELETE /api/v2/agendamentos/:id
DELETE /api/v2/simulador/agendamentos/:id (alias)

// Verificar disponibilidade
GET /api/v2/agendamentos/disponibilidade
Query params: ?simulador_id=1&data=2025-10-30

// Listar slots
GET /api/v2/simulador/slots

// Buscar ficha por agendamento
GET /api/v2/simulador/agendamento/:codigo/ficha
```

---

## 6️⃣ TREINAMENTOS

### ✅ Endpoints Disponíveis

```typescript
// Listar treinamentos
GET /api/v2/treinamentos

// Dashboard
GET /api/v2/dashboard-treinamentos/treinamentos-certificacoes
GET /api/v2/dashboard-treinamentos/treinamentos-certificacoes/quick

// Sessões por participante
GET /api/v2/simulador/sessoes-participante/:colaboradorId/:treinamentoId

// Atualizar sessão
PUT /api/v2/treinamentos/:id/sessoes/:sessaoId
```

### ❌ Endpoints que NÃO existem (não usar!)

```
❌ /api/v2/relatorios/treinamentos-categoria
```

---

## 7️⃣ MANOBRAS

### ✅ Endpoints Disponíveis

```typescript
// Listar manobras
GET /api/v2/manobras

// Avaliar manobra
POST /api/v2/manobras/avaliar
Body: { ficha_uuid, manobra_id, nota, observacoes }

// Importar manobras
POST /api/v2/importacoes/manobras/import
Body: FormData com CSV
```

---

## 8️⃣ TEMPLATES

### ✅ Endpoints Disponíveis

```typescript
// Criar template
POST /api/v2/templates
Body: { nome, tipo, manobras: [...] }

// Atualizar template
PUT /api/v2/templates/:id
Body: { nome, manobras: [...] }

// Listar manobras do template
GET /api/v2/templates/:id/manobras
```

---

## 9️⃣ CATEGORIAS DE QUALIFICAÇÕES

### ✅ Endpoints Disponíveis

```typescript
// Listar categorias
GET /api/v2/categorias-qualificacoes

// Buscar categoria
GET /api/v2/categorias-qualificacoes/:id

// Criar categoria
POST /api/v2/categorias-qualificacoes
Body: { nome, codigo, descricao }

// Atualizar categoria
PUT /api/v2/categorias-qualificacoes/:id
Body: { nome, descricao }

// Deletar categoria
DELETE /api/v2/categorias-qualificacoes/:id
```

---

## 🔟 TIPOS DE QUALIFICAÇÕES

### ✅ Endpoints Disponíveis

```typescript
// Listar tipos
GET /api/tipos-qualificacoes

// Buscar tipo específico
GET /api/tipos-qualificacoes/:id

// Listar qualificações do tipo
GET /api/tipos-qualificacoes/:codigo/qualificacoes

// Criar tipo
POST /api/tipos-qualificacoes
Body: { nome, codigo, categoria_id, ... }

// Atualizar tipo
PUT /api/tipos-qualificacoes/:id
Body: { nome, validade_meses, ... }
```

---

## 1️⃣1️⃣ EXAMES

### ✅ Endpoints Disponíveis

```typescript
// Listar exames
GET /api/v2/exames

// Buscar exame específico
GET /api/v2/exames/:id

// Criar exame
POST /api/v2/exames
Body: { funcionario_id, tipo_exame, data_realizacao, ... }

// Atualizar exame
PUT /api/v2/exames/:id
Body: { resultado, data_validade, ... }

// Deletar exame
DELETE /api/v2/exames/:id
```

---

## 1️⃣2️⃣ CHECKS

### ✅ Endpoints Disponíveis

```typescript
// Listar checks
GET /api/v2/checks
```

---

## 1️⃣3️⃣ ALERTAS

### ✅ Endpoints Disponíveis

```typescript
// Listar alertas
GET /api/v2/alertas

// Dashboard de compliance
GET /api/v2/compliance-dashboard/dashboard
GET /api/v2/compliance-dashboard/alertas
```

---

## 1️⃣4️⃣ IMPORTAÇÕES

### ✅ Endpoints Disponíveis

```typescript
// Importar simuladores
POST /api/v2/importacoes/simuladores/import
Body: FormData com CSV

// Importar funções
POST /api/v2/importacoes/funcoes/import
Body: FormData com CSV

// Importar treinamentos
POST /api/v2/importacoes/treinamentos/import
Body: FormData com CSV

// Importar manobras
POST /api/v2/importacoes/manobras/import
Body: FormData com CSV
```

---

## 1️⃣5️⃣ RELAÇÕES (Modelo-Manobra)

### ✅ Endpoints Disponíveis

```typescript
// Importar relações inteligentes
POST /api/v2/relacoes/importar-inteligente
Body: FormData com Excel

// Download template
GET /api/v2/relacoes/template-excel
```

---

## 1️⃣6️⃣ PASTA VIRTUAL

### ✅ Endpoints Disponíveis

```typescript
// Listar arquivos
GET /api/v2/pasta-virtual/listar/:funcionario_id

// Sincronizar
POST /api/v2/pasta-virtual/sync/:funcionario_id

// Download
GET /api/v2/pasta-virtual/download/:sync_id

// Estrutura
GET /api/v2/pasta-virtual/estrutura/:funcionario_id

// Arquivos
GET /api/v2/pasta-virtual/arquivos/:funcionario_id

// Estatísticas
GET /api/v2/pasta-virtual/stats
```

---

## 1️⃣7️⃣ CERTIFICADOS

### ✅ Endpoints Disponíveis

```typescript
// Upload certificado
POST /api/v2/certificados/:id/upload-certificado
Body: FormData com arquivo

// Download certificado
GET /api/v2/certificados/:id/download-certificado

// Download por histórico
GET /api/v2/certificados/by-historico/:historicoId

// Download histórico de certificações
GET /api/v2/certificados/historico-certificacoes/:id/certificado
```

---

## 1️⃣8️⃣ LGPD

### ✅ Endpoints Disponíveis

```typescript
// Exportar dados
POST /api/v2/lgpd/exportar-dados/:id

// Excluir permanentemente
DELETE /api/v2/lgpd/excluir-permanente/:id

// Solicitar
POST /api/v2/lgpd/solicitar
Body: { tipo, funcionario_id, motivo }

// Listar solicitações
GET /api/v2/lgpd/solicitacoes
```

---

## 1️⃣9️⃣ AUDITORIA

### ✅ Endpoints Disponíveis

```typescript
// Executar auditoria de datas
GET /api/v2/auditoria-datas/executar

// Status da auditoria
GET /api/v2/auditoria-datas/status

// Corrigir automaticamente
POST /api/v2/auditoria-datas/corrigir-automatico
```

---

## 2️⃣0️⃣ DASHBOARD & ESTATÍSTICAS

### ✅ Endpoints Disponíveis

```typescript
// Estatísticas gerais
GET /api/v2/dashboard-stats/stats

// Compliance dashboard
GET /api/v2/compliance-dashboard/dashboard
GET /api/v2/compliance-dashboard/alertas

// Treinamentos
GET /api/v2/dashboard-treinamentos/treinamentos-certificacoes
GET /api/v2/dashboard-treinamentos/treinamentos-certificacoes/quick
```

---

## 2️⃣1️⃣ ADMIN

### ✅ Endpoints Disponíveis

```typescript
// Contadores
GET /api/v2/admin/limpar-dados/contadores

// Limpar dados de módulo
POST /api/v2/admin/limpar-dados/:modulo
Body: { confirmar: true }
```

---

## 2️⃣2️⃣ HEALTH & DEBUG

### ✅ Endpoints Disponíveis

```typescript
// Health check
GET /api/v2/health

// Debug certificação
POST /api/debug/test-id-generation
GET /api/debug/validar-ids
```

---

## 📋 CONVENÇÕES

### Padrões de URL

1. **Listagem:** `GET /api/v2/modulo`
2. **Buscar por ID:** `GET /api/v2/modulo/:id`
3. **Criar:** `POST /api/v2/modulo`
4. **Atualizar:** `PUT /api/v2/modulo/:id` ou `PATCH /api/v2/modulo/:id`
5. **Deletar:** `DELETE /api/v2/modulo/:id` (soft delete)

### Query Parameters Comuns

- `?page=1` - Paginação
- `?limit=50` - Limite de resultados
- `?search=termo` - Busca textual
- `?ativo=true` - Filtrar por status
- `?incluir_supersedidas=false` - Incluir registros antigos

### Response Format

```typescript
{
  success: boolean,
  data: any | any[],
  error?: string,
  pagination?: {
    page: number,
    limit: number,
    total: number
  }
}
```

---

## ⚠️ IMPORTANTE

1. **SEMPRE** use `window.location.origin` para URLs dinâmicas
2. **NUNCA** use `localhost:8787` hardcoded
3. **SEMPRE** verifique se o endpoint existe neste documento
4. **NUNCA** invente endpoints sem criar no backend primeiro
5. **SEMPRE** use try/catch em chamadas fetch
6. **SEMPRE** trate erros 404 adequadamente

---

## 🔄 COMO ATUALIZAR ESTE DOCUMENTO

Quando criar um novo endpoint:

1. Adicionar no backend (`src/worker/api/v2/`)
2. Registrar no router (`src/worker/routes/index.ts`)
3. Testar com curl
4. Atualizar este documento
5. Fazer deploy
6. Validar na UI

---

**Última Revisão:** 29/10/2025 20:25  
**Próxima Revisão:** Sempre que criar novos endpoints

# 📋 GUIA PRÁTICO - TESTAR ENDPOINTS AIRTRUST

**Objetivo**: Validar que TODOS os endpoints funcionam  
**Data**: 3 de novembro de 2025  
**Para**: Raico aprender e validar o sistema

---

## 🚀 PARTE 1: SETUP E PREPARAÇÃO

### 1.1 Ambiente Necessário

```bash
# Terminal 1: Verificar que Wrangler está rodando
wrangler dev

# Você verá:
✓ Ready on http://localhost:8787

# Terminal 2: Deixar pra fazer os testes
# (Vamos usar curl ou Postman aqui)
```

### 1.2 URLs Base

**Desenvolvimento Local:**

```
http://localhost:8787
http://localhost:8787/api/v2/habilitacoes
```

**Produção:**

```
https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev
https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/habilitacoes
```

### 1.3 Headers Necessários

```bash
# Para desenvolvimento local (sem auth):
Content-Type: application/json

# Para produção (com JWT):
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN_HERE
```

---

## 🔍 PARTE 2: TESTAR ENDPOINTS HABILITAÇÕES

### 2.1 GET - Listar Todas as Habilitações

#### Comando curl

```bash
curl -X GET "http://localhost:8787/api/v2/habilitacoes" \
  -H "Content-Type: application/json"
```

#### Alternativa com paginação

```bash
# Página 1, 20 registros
curl -X GET "http://localhost:8787/api/v2/habilitacoes?page=1&limit=20" \
  -H "Content-Type: application/json"

# Página 1, 100 registros
curl -X GET "http://localhost:8787/api/v2/habilitacoes?page=1&limit=100" \
  -H "Content-Type: application/json"

# Todas (1036):
curl -X GET "http://localhost:8787/api/v2/habilitacoes?page=1&limit=1036" \
  -H "Content-Type: application/json"
```

#### Filtrar por Funcionário

```bash
curl -X GET "http://localhost:8787/api/v2/habilitacoes?page=1&limit=20&funcionario_id=1" \
  -H "Content-Type: application/json"
```

#### Resposta esperada (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "funcionario_id": 1,
      "qualificacao_id": 1,
      "data_conclusao": "2025-01-01",
      "data_vencimento": "2027-01-01",
      "resultado": "APROVADO",
      "status": "ATIVA",
      "nota_final": 9.5,
      "instrutor": "João Silva",
      "observacoes": "Bom desempenho",
      "qualificacao_nome": "PPL-A",
      "qualificacao_codigo": "PPL-001",
      "qualificacao_categoria": "Piloto",
      "funcionario_nome": "José da Silva",
      "created_at": "2025-01-01T10:00:00Z"
    }
  ],
  "stats": {
    "total": 1036,
    "validas": 850,
    "vencendo": 150,
    "vencidas": 36,
    "renovadas": 0
  },
  "totalPages": 52,
  "page": 1,
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1036,
    "pages": 52
  }
}
```

**✅ Teste**: Execute este comando e verifique se retorna `"success": true`

---

### 2.2 POST - Criar Nova Habilitação

#### Comando curl

```bash
curl -X POST "http://localhost:8787/api/v2/habilitacoes" \
  -H "Content-Type: application/json" \
  -d '{
    "funcionario_id": 1,
    "qualificacao_id": 1,
    "data_conclusao": "2025-11-03",
    "data_vencimento": "2027-11-03",
    "resultado": "APROVADO",
    "status": "ATIVA",
    "nota_final": 8.5,
    "instrutor": "Maria Silva",
    "observacoes": "Teste de criação"
  }'
```

#### Resposta esperada (201 Created)

```json
{
  "success": true,
  "id": 1037
}
```

**✅ Teste**: Execute este comando e anote o ID retornado (1037)

---

### 2.3 PUT - Atualizar Habilitação Existente

#### Comando curl (atualizando ID 1037 do teste anterior)

```bash
curl -X PUT "http://localhost:8787/api/v2/habilitacoes/1037" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "VENCIDA",
    "nota_final": 9.0,
    "observacoes": "Atualizado em teste"
  }'
```

#### Resposta esperada (200 OK)

```json
{
  "success": true,
  "message": "Habilitação atualizada com sucesso"
}
```

**✅ Teste**: Execute este comando e verifique sucesso

---

### 2.4 DELETE - Deletar Habilitação (Soft Delete)

#### Comando curl (deletando ID 1037)

```bash
curl -X DELETE "http://localhost:8787/api/v2/habilitacoes/1037" \
  -H "Content-Type: application/json"
```

#### Resposta esperada (200 OK)

```json
{
  "success": true,
  "message": "Habilitação deletada com sucesso"
}
```

#### Verificar que foi soft delete

```bash
# Listar novamente - o registro 1037 não deve aparecer
curl -X GET "http://localhost:8787/api/v2/habilitacoes?page=1&limit=20" \
  -H "Content-Type: application/json"

# Conferir no banco de dados diretamente:
wrangler d1 execute airtrust-db --local \
  --command "SELECT * FROM habilitacoes WHERE id=1037;"

# Deve retornar um registro com deleted_at preenchido
# (Não é verdadeiro DELETE, é marcação com timestamp)
```

**✅ Teste**: Execute e verifique que deleted_at foi preenchido

---

## 🗂️ PARTE 3: TESTAR ENDPOINTS QUALIFICAÇÕES

### 3.1 GET - Listar Qualificações

```bash
curl -X GET "http://localhost:8787/api/v2/qualificacoes?page=1&limit=20" \
  -H "Content-Type: application/json"
```

**Resposta esperada**: Array de qualificações com:

```json
{
  "id": 1,
  "nome": "PPL-A",
  "codigo": "PPL-001",
  "categoria": "Piloto",
  "carga_horaria": 60,
  "conteudo_programatico": "...",
  "created_at": "2025-01-01T10:00:00Z"
}
```

**✅ Teste**: Verifique que tem CÓDIGO em cada qualificação

---

### 3.2 POST - Criar Nova Qualificação

```bash
curl -X POST "http://localhost:8787/api/v2/qualificacoes" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "CPL-A",
    "codigo": "CPL-001",
    "categoria": "Comercial",
    "carga_horaria": 100,
    "conteudo_programatico": "Certificado de Piloto Comercial"
  }'
```

**✅ Teste**: Execute e verifique que retorna ID

---

## 📊 PARTE 4: VERIFICAR BANCO DE DADOS

### 4.1 Conectar ao Database Local

```bash
# Acessar o database local
wrangler d1 execute airtrust-db --local --command ".tables"

# Deve listar:
# habilitacoes
# qualificacoes
# funcionarios
# categorias
# empresas
# ... e mais
```

### 4.2 Verificar Estrutura de Habilitações

```bash
# Ver schema (colunas)
wrangler d1 execute airtrust-db --local \
  --command "PRAGMA table_info(habilitacoes);"

# Deve retornar:
# id|INTEGER
# funcionario_id|INTEGER
# qualificacao_id|INTEGER
# data_conclusao|TEXT
# data_vencimento|TEXT
# resultado|TEXT
# status|TEXT
# nota_final|REAL
# instrutor|TEXT
# observacoes|TEXT
# certificado_url|TEXT
# created_at|DATETIME
# updated_at|DATETIME
# deleted_at|DATETIME
```

**✅ Teste**: Verifique que TODAS as colunas estão lá

### 4.3 Contar Registros

```bash
# Total de habilitações (incluindo deletadas)
wrangler d1 execute airtrust-db --local \
  --command "SELECT COUNT(*) as total FROM habilitacoes;"

# Resultado: total = 1036+ (inicialmente 1036)

# Total de habilitações ATIVAS (não deletadas)
wrangler d1 execute airtrust-db --local \
  --command "SELECT COUNT(*) as ativas FROM habilitacoes WHERE deleted_at IS NULL;"

# Resultado: ativas = 1036 (menos 1 se deletou em teste anterior)
```

**✅ Teste**: Verifique que contagem bate

### 4.4 Verificar Soft Deletes

```bash
# Ver quantos foram marcados como deletados
wrangler d1 execute airtrust-db --local \
  --command "SELECT COUNT(*) as deletadas FROM habilitacoes WHERE deleted_at IS NOT NULL;"

# Ver quais foram deletados e quando
wrangler d1 execute airtrust-db --local \
  --command "SELECT id, funcionario_id, deleted_at FROM habilitacoes WHERE deleted_at IS NOT NULL LIMIT 5;"
```

**✅ Teste**: Verifique que deleted_at é preenchido com timestamp

---

## 🔐 PARTE 5: TESTAR NO BROWSER (F12 Console)

### 5.1 Abrir Developer Tools

1. Abra http://localhost:8787 no navegador
2. Pressione `F12` (ou Cmd+Option+I no Mac)
3. Vá para a aba **Console**

### 5.2 Testar GET Habilitações

```javascript
// Cole isto no console (F12 > Console):

fetch('/api/v2/habilitacoes')
  .then((r) => r.json())
  .then((d) => console.log('✅ Habilitações:', d))
  .catch((e) => console.error('❌ Erro:', e));
```

**Esperado**: Ver objeto com `success: true` e array de habilitações

### 5.3 Testar GET Qualificações

```javascript
fetch('/api/v2/qualificacoes')
  .then((r) => r.json())
  .then((d) => console.log('✅ Qualificações:', d))
  .catch((e) => console.error('❌ Erro:', e));
```

**Esperado**: Ver objeto com qualificações

### 5.4 Testar POST Habilitação

```javascript
fetch('/api/v2/habilitacoes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    funcionario_id: 1,
    qualificacao_id: 1,
    data_conclusao: '2025-11-03',
    data_vencimento: '2027-11-03',
    resultado: 'APROVADO',
    status: 'ATIVA',
  }),
})
  .then((r) => r.json())
  .then((d) => console.log('✅ Nova habilitação:', d))
  .catch((e) => console.error('❌ Erro:', e));
```

**Esperado**: Ver `success: true` e novo `id`

### 5.5 Testar Performance (Carregar 1036)

```javascript
console.time('Carregar 1036');
fetch('/api/v2/habilitacoes?page=1&limit=1036')
  .then((r) => r.json())
  .then((d) => {
    console.timeEnd('Carregar 1036');
    console.log(`✅ Carregados ${d.data.length} registros`);
    console.log(`Total: ${d.stats.total}`);
  })
  .catch((e) => console.error('❌ Erro:', e));
```

**Esperado**:

- Carregar em < 2 segundos
- Ver 1036 registros carregados
- Total: 1036

---

## ✅ PARTE 6: CHECKLIST FINAL

### Habilitações Backend

- [ ] GET retorna 200 OK com dados
- [ ] GET com page/limit funciona
- [ ] GET com funcionario_id funciona
- [ ] POST cria novo registro
- [ ] PUT atualiza registro existente
- [ ] DELETE faz soft delete (deleted_at)
- [ ] Validação Zod rejeita dados inválidos

### Habilitações Frontend

- [ ] Página carrega em http://localhost:3000
- [ ] Aba "Histórico" mostra registros
- [ ] Aba "Qualificações" mostra com CÓDIGO
- [ ] Aba "Categorias" funciona
- [ ] Filtros funcionam
- [ ] Botões CRUD funcionam
- [ ] Modais abrem/fecham

### Database

- [ ] Tabela habilitacoes existe
- [ ] Todas as colunas presentes
- [ ] Índices existem
- [ ] 1036+ registros
- [ ] Soft delete funciona
- [ ] Queries com WHERE deleted_at IS NULL

### Qualificações

- [ ] GET retorna com CÓDIGO
- [ ] POST cria novo
- [ ] Todas mostram código

### Design System

- [ ] Tokens CSS carregam (F12 > Styles)
- [ ] Componentes têm estilo correto
- [ ] Cores estão certo
- [ ] Tipografia consistente

### Segurança

- [ ] JWT validado em produção
- [ ] Soft delete ativo
- [ ] Validation com Zod
- [ ] XSS prevention

---

## 📝 PARTE 7: TABELA DE RESULTADOS

Preencha isso enquanto testa:

```
TESTE                          STATUS    NOTA
─────────────────────────────────────────────
GET /habilitacoes              ☐ ✅
POST /habilitacoes             ☐ ✅
PUT /habilitacoes/:id          ☐ ✅
DELETE /habilitacoes/:id       ☐ ✅
GET /qualificacoes             ☐ ✅
POST /qualificacoes            ☐ ✅
Paginação (limit=20)           ☐ ✅
Filtro (funcionario_id)        ☐ ✅
Soft delete (deleted_at)       ☐ ✅
Load 1036 registros            ☐ ✅
Validação Zod                  ☐ ✅
Design System                  ☐ ✅
Frontend Habilitacoes          ☐ ✅
Frontend Qualificacoes         ☐ ✅
Códigos nas Qualificações      ☐ ✅
─────────────────────────────────────────────
TOTAL                          __ / 15
```

---

## 🎓 PARTE 8: PRÓXIMOS PASSOS

1. ✅ Execute este guia COMPLETO
2. ✅ Preencha o checklist acima
3. ✅ Anote qualquer erro/problema
4. ✅ Screenshot de cada teste bem-sucedido
5. ✅ Leia o arquivo AUDITORIA_AIRTRUST_20251103.md
6. ✅ Entenda a arquitetura do projeto
7. ✅ Esteja pronto para adicionar novas features

---

**Documento prático para testes**  
**Status**: PRONTO PARA USAR ✅  
**Data**: 3 de novembro de 2025  
**Autor**: Claude (para Raico)

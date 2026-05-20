# 🔍 AUDIT CHECKLIST - AirTrust Sistema Completo

**Verificar TUDO antes de certificados**  
**Data**: 3 de novembro de 2025  
**Versão**: 1.0 FINAL

---

## PARTE 1: ENDPOINTS CONFIGURAÇÕES

### TESTE 1.1: GET /api/v2/empresas/:id/config

```bash
curl -X GET "http://localhost:8787/api/v2/empresas/1/config" \
  -H "Content-Type: application/json"
```

**Esperado (200)**:

```json
{
  "success": true,
  "data": {
    "empresa_id": 1,
    "nome": "Costa do Sol",
    "logo_url": "https://r2.exemplo.com/logo.png",
    "template_certificado": "...",
    "cor_primaria": "#0066cc",
    "cor_secundaria": "#333333"
  },
  "timestamp": "2025-11-03T21:00:00Z"
}
```

**Status**:

- [ ] OK (200)
- [ ] Erro (especificar): ****\_\_\_****

---

### TESTE 1.2: PUT /api/v2/empresas/:id/config

```bash
curl -X PUT "http://localhost:8787/api/v2/empresas/1/config" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Costa do Sol - Táxi Aéreo",
    "cor_primaria": "#FF5722",
    "cor_secundaria": "#333333"
  }'
```

**Esperado (200)**:

```json
{
  "success": true,
  "message": "Configuração salva com sucesso",
  "timestamp": "2025-11-03T21:00:00Z"
}
```

**Status**:

- [ ] OK (200)
- [ ] Erro (especificar): ****\_\_\_****

---

### TESTE 1.3: Verificar Persistência

```bash
# Fazer GET novamente
curl -X GET "http://localhost:8787/api/v2/empresas/1/config"

# Deve retornar valores NOVOS (não os anteriores)
```

**Verificar**:

- [ ] Valores persistem (cor_primaria = #FF5722)
- [ ] Reset ao antigo (volta ao padrão)

**Status**:

- [ ] PASSOU
- [ ] FALHOU

---

## PARTE 2: ENDPOINTS HABILITAÇÕES (APÓS REFACTOR)

### TESTE 2.1: GET /api/v2/habilitacoes

```bash
curl -X GET "http://localhost:8787/api/v2/habilitacoes?page=1&limit=20" \
  -H "Content-Type: application/json"
```

**Esperado (200)**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "funcionario_id": 1,
      "qualificacao_id": 1,
      "status": "ATIVA",
      "data_conclusao": "2025-01-01",
      "data_vencimento": "2027-01-01"
    }
  ],
  "page": 1,
  "total": 1036,
  "timestamp": "2025-11-03T21:00:00Z"
}
```

**Verificar**:

- [ ] Status 200
- [ ] Campo `success` = true
- [ ] Array `data` não vazio
- [ ] Paginação (page, total)
- [ ] Timestamp presente

**Status**:

- [ ] PASSOU
- [ ] FALHOU: ****\_\_\_****

---

### TESTE 2.2: GET /api/v2/qualificacoes

```bash
curl -X GET "http://localhost:8787/api/v2/qualificacoes?page=1&limit=20"
```

**Verificar**:

- [ ] Retorna array com dados
- [ ] Cada item tem `codigo` (PPL-001, etc)
- [ ] Cada item tem `nome`
- [ ] Cada item tem `categoria`
- [ ] Resposta padronizada (success, data, timestamp)

**Status**:

- [ ] Tem codigo
- [ ] Sem codigo
- [ ] Erro ao chamar

---

### TESTE 2.3: POST /api/v2/habilitacoes (criar nova)

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
    "nota_final": 8.5
  }'
```

**Esperado (201)**:

```json
{
  "success": true,
  "data": {
    "id": 1037,
    "funcionario_id": 1,
    "qualificacao_id": 1,
    "status": "ATIVA"
  }
}
```

**Status**:

- [ ] Cria (201)
- [ ] Erro (especificar): ****\_\_\_****

---

### TESTE 2.4: PUT /api/v2/habilitacoes/:id

```bash
curl -X PUT "http://localhost:8787/api/v2/habilitacoes/1037" \
  -H "Content-Type: application/json" \
  -d '{"status": "VENCIDA"}'
```

**Esperado (200)**:

```json
{
  "success": true,
  "data": {
    "id": 1037,
    "status": "VENCIDA"
  }
}
```

**Status**:

- [ ] Atualiza (200)
- [ ] Erro (especificar): ****\_\_\_****

---

### TESTE 2.5: DELETE /api/v2/habilitacoes/:id (Soft Delete)

```bash
curl -X DELETE "http://localhost:8787/api/v2/habilitacoes/1037"
```

**Esperado (200)**:

```json
{
  "success": true
}
```

**Verificar soft delete**:

```bash
# Fazer GET para verificar que ID 1037 não aparece
curl -X GET "http://localhost:8787/api/v2/habilitacoes?page=1&limit=1036"

# ID 1037 NÃO deve aparecer na lista (foi soft deleted)
```

**Status**:

- [ ] Soft delete OK (desaparece da lista)
- [ ] Hard delete (removido do DB)
- [ ] Erro (especificar): ****\_\_\_****

---

## PARTE 3: ENDPOINTS CERTIFICADOS

### TESTE 3.1: GET /api/v2/certificados

```bash
curl -X GET "http://localhost:8787/api/v2/certificados?page=1&limit=20"
```

**Esperado (200)**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "habilitacao_id": 1,
      "funcionario_id": 1,
      "url": "https://r2.exemplo.com/CERT-001-PPL-2025-01-01.pdf",
      "data_emissao": "2025-01-01",
      "data_vencimento": "2027-01-01"
    }
  ],
  "page": 1,
  "total": 50
}
```

**Status**:

- [ ] Retorna dados
- [ ] Erro (especificar): ****\_\_\_****

---

### TESTE 3.2: POST /api/v2/certificados (gerar novo)

```bash
curl -X POST "http://localhost:8787/api/v2/certificados" \
  -H "Content-Type: application/json" \
  -d '{
    "habilitacao_id": 1,
    "funcionario_id": 1,
    "qualificacao_id": 1,
    "empresa_id": 1
  }'
```

**Esperado (201)**:

```json
{
  "success": true,
  "data": {
    "id": 100,
    "url": "https://r2.exemplo.com/CERT-001-PPL-2025-11-03.pdf"
  }
}
```

**Status**:

- [ ] Gera certificado (201)
- [ ] URL retornada válida
- [ ] Erro (especificar): ****\_\_\_****

---

## PARTE 4: FLUXO INTEGRADO (END-TO-END)

### TESTE 4.1: Empresas → Configuração → Certificados

```bash
# PASSO 1: Obter config da empresa
curl -X GET "http://localhost:8787/api/v2/empresas/1/config"
# Response: logo_url, template_certificado, cores

# PASSO 2: Obter habilitação específica
curl -X GET "http://localhost:8787/api/v2/habilitacoes/1"
# Response: funcionario_id, qualificacao_id

# PASSO 3: Gerar certificado (usa logo da empresa)
curl -X POST "http://localhost:8787/api/v2/certificados" \
  -d '{
    "habilitacao_id": 1,
    "empresa_id": 1
  }'
# Response: URL do PDF

# PASSO 4: Baixar e verificar PDF
curl "https://r2.exemplo.com/CERT-001-PPL-2025-11-03.pdf" \
  -o certificado.pdf

# Abrir em navegador: file:///Users/.../certificado.pdf
```

**Verificar no PDF**:

- [ ] Logo da empresa aparece
- [ ] Nome do funcionário correto
- [ ] Qualificação correta
- [ ] Data de emissão correta
- [ ] Data de vencimento correta
- [ ] Cores da empresa aplicadas

**Status**:

- [ ] Fluxo OK (tudo funciona)
- [ ] Algo quebrou (especificar): ****\_\_\_****

---

## PARTE 5: BANCO DE DADOS

### TESTE 5.1: Verificar tabelas

```bash
wrangler d1 execute airtrust-db --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table';"
```

**Deve conter**:

- [ ] empresa_config
- [ ] habilitacoes
- [ ] certificados
- [ ] qualificacoes
- [ ] funcionarios
- [ ] empresas
- [ ] simuladores
- [ ] categorias
- [ ] funcoes
- [ ] auditoria_avancadav2

**Status**:

- [ ] Todas presentes
- [ ] Faltam tabelas (especificar): ****\_\_\_****

---

### TESTE 5.2: Verificar soft deletes

```bash
# Contar habilitações ativas
wrangler d1 execute airtrust-db --remote \
  --command "SELECT COUNT(*) as ativas FROM habilitacoes WHERE deleted_at IS NULL;"

# Contar habilitações deletadas
wrangler d1 execute airtrust-db --remote \
  --command "SELECT COUNT(*) as deletadas FROM habilitacoes WHERE deleted_at IS NOT NULL;"
```

**Esperado**:

- Ativas: ~1035
- Deletadas: ~1 (a que deletamos no teste)

**Status**:

- [ ] Soft delete OK
- [ ] Algo errado (especificar): ****\_\_\_****

---

### TESTE 5.3: Verificar auditoria

```bash
wrangler d1 execute airtrust-db --remote \
  --command "SELECT COUNT(*) as total FROM auditoria_avancadav2;"
```

**Esperado**:

- Total > 0 (deve ter registros de todas operações)

**Verificar últimos registros**:

```bash
wrangler d1 execute airtrust-db --remote \
  --command "SELECT * FROM auditoria_avancadav2 ORDER BY id DESC LIMIT 5;"
```

**Status**:

- [ ] Auditoria sendo registrada
- [ ] Não há registros
- [ ] Erro ao acessar

---

## PARTE 6: FRONTEND

### TESTE 6.1: Página Configuração Empresa

**URL**: `http://localhost:8787/configuracoes/empresa`

**Verificar**:

- [ ] Página carrega
- [ ] Carrega valores atuais (nome, cores)
- [ ] Campo para mudar nome
- [ ] Paleta de cores funciona
- [ ] Botão "Salvar" funciona
- [ ] Após salvar, recarregar página (F5)
- [ ] Valores permanecem (não reset)
- [ ] Toast notification aparece ao salvar

**Status**:

- [ ] Tudo OK
- [ ] Algo não funciona (especificar): ****\_\_\_****

---

### TESTE 6.2: Página Habilitações

**URL**: `http://localhost:8787/habilitacoes`

**Verificar**:

- [ ] Tabela carrega com dados
- [ ] Sem emojis (apenas ícones Font Awesome/Lucide)
- [ ] Design System aplicado (cores, tipografia padrão)
- [ ] Paginação funciona (próxima página carrega mais)
- [ ] Botões (Editar, Deletar, Download) aparecem
- [ ] Modal de edição abre/fecha
- [ ] Toast notification aparece ao deletar
- [ ] Dados correspondem ao backend (GET /api/v2/habilitacoes)

**Status**:

- [ ] Tudo OK
- [ ] Algo está quebrado (especificar): ****\_\_\_****

---

### TESTE 6.3: Página Certificados (Nova)

**URL**: `http://localhost:8787/certificados`

**Verificar**:

- [ ] Página carrega
- [ ] Dropdown seleciona empresa
- [ ] Logo da empresa aparece
- [ ] Preview do certificado mostra (antes de gerar)
- [ ] Botão "Gerar Certificado" funciona
- [ ] PDF é gerado e pode ser baixado
- [ ] PDF tem logo da empresa
- [ ] PDF tem dados corretos (funcionário, qualificação, data)
- [ ] Toast success aparece ao gerar
- [ ] Toast error aparece se falhar
- [ ] Paginação funciona (ver certificados anteriores)

**Status**:

- [ ] Tudo OK
- [ ] Algo não funciona (especificar): ****\_\_\_****

---

## PARTE 7: RESPONSE FORMAT

**Todos os endpoints devem retornar este padrão**:

```json
{
  "success": true/false,
  "data": {...},
  "error": "string se houver erro",
  "code": "ERROR_CODE se houver erro",
  "timestamp": "2025-11-03T21:00:00Z"
}
```

**Verificar**:

- [ ] Habilitações
- [ ] Qualificacões
- [ ] Funcionários
- [ ] Empresas
- [ ] Certificados
- [ ] Simuladores
- [ ] Categorias
- [ ] Funções
- [ ] Configurações

**Status**:

- [ ] Todos endpoints OK
- [ ] Alguns faltam (especificar): ****\_\_\_****

---

## PARTE 8: ERROR HANDLING

### TESTE 8.1: Erro de validação

```bash
curl -X POST "http://localhost:8787/api/v2/habilitacoes" \
  -H "Content-Type: application/json" \
  -d '{"funcionario_id": "abc"}'  # String ao invés de number
```

**Esperado (400)**:

```json
{
  "success": false,
  "error": "Erro de validação",
  "code": "VALIDATION_ERROR",
  "details": [...]
}
```

**Status**:

- [ ] Retorna 400
- [ ] Retorna 500 (erro interno)
- [ ] Outro status: ****\_\_\_****

---

### TESTE 8.2: Recurso não encontrado

```bash
curl -X GET "http://localhost:8787/api/v2/habilitacoes/999999"
```

**Esperado (404)**:

```json
{
  "success": false,
  "error": "Não encontrado",
  "code": "NOT_FOUND"
}
```

**Status**:

- [ ] Retorna 404
- [ ] Retorna 500
- [ ] Outro status: ****\_\_\_****

---

### TESTE 8.3: Sem permissão

```bash
curl -X DELETE "http://localhost:8787/api/v2/habilitacoes/1" \
  -H "Authorization: Bearer token_invalido"
```

**Esperado (401 ou 403)**:

```json
{
  "success": false,
  "error": "Não autorizado",
  "code": "UNAUTHORIZED"
}
```

**Status**:

- [ ] Retorna 401/403
- [ ] Retorna 500
- [ ] Outro status: ****\_\_\_****

---

## PARTE 9: PERFORMANCE

### TESTE 9.1: Tempo de resposta

```bash
time curl -X GET "http://localhost:8787/api/v2/habilitacoes?page=1&limit=20"
```

**Esperado**: < 200ms

**Medição Real**: ******\_****** ms

**Status**:

- [ ] < 200ms ✅
- [ ] 200-500ms ⚠️
- [ ] > 500ms ❌

---

### TESTE 9.2: Cache hits

```bash
# 1ª chamada (miss)
curl -w "\n%{time_total}s\n" \
  "http://localhost:8787/api/v2/habilitacoes"

# 2ª chamada (deveria estar em cache)
curl -w "\n%{time_total}s\n" -i \
  "http://localhost:8787/api/v2/habilitacoes"

# Verificar header "X-Cache: HIT"
```

**Status**:

- [ ] Cache funciona (2ª chamada mais rápida)
- [ ] Cache não ativo (ambas lentas)

---

### TESTE 9.3: Carga simultânea

```bash
# Simular 10 requisições simultâneas
for i in {1..10}; do
  curl -X GET "http://localhost:8787/api/v2/habilitacoes?page=1&limit=20" &
done
wait
```

**Verificar**:

- [ ] Todas retornam sucesso
- [ ] Nenhuma dá timeout
- [ ] Sem erros 500

**Status**:

- [ ] OK sob carga
- [ ] Falha sob carga (especificar): ****\_\_\_****

---

## CHECKLIST FINAL

### ✅ PARTE 1: Endpoints Configurações

- [ ] GET config
- [ ] PUT config
- [ ] Persistência

**Resultado**: **\_** / 3

---

### ✅ PARTE 2: Endpoints Habilitações

- [ ] GET
- [ ] POST
- [ ] PUT
- [ ] DELETE (soft)

**Resultado**: **\_** / 4

---

### ✅ PARTE 3: Endpoints Certificados

- [ ] GET
- [ ] POST (gerar)

**Resultado**: **\_** / 2

---

### ✅ PARTE 4: Fluxo integrado

- [ ] Config → Cert com logo

**Resultado**: **\_** / 1

---

### ✅ PARTE 5: Banco de dados

- [ ] Tabelas OK
- [ ] Soft delete OK
- [ ] Auditoria OK

**Resultado**: **\_** / 3

---

### ✅ PARTE 6: Frontend

- [ ] Configurações
- [ ] Habilitações
- [ ] Certificados

**Resultado**: **\_** / 3

---

### ✅ PARTE 7: Response format

- [ ] Todos endpoints

**Resultado**: **\_** / 1

---

### ✅ PARTE 8: Error handling

- [ ] 400 validation
- [ ] 404 not found
- [ ] 401 unauthorized

**Resultado**: **\_** / 3

---

### ✅ PARTE 9: Performance

- [ ] < 200ms
- [ ] Cache OK
- [ ] Sob carga OK

**Resultado**: **\_** / 3

---

## 📊 RESUMO FINAL

| Parte     | Resultado     | Status |
| --------- | ------------- | ------ |
| 1         | \_\_\_/3      |        |
| 2         | \_\_\_/4      |        |
| 3         | \_\_\_/2      |        |
| 4         | \_\_\_/1      |        |
| 5         | \_\_\_/3      |        |
| 6         | \_\_\_/3      |        |
| 7         | \_\_\_/1      |        |
| 8         | \_\_\_/3      |        |
| 9         | \_\_\_/3      |        |
| **TOTAL** | **\_\_\_/27** |        |

---

## 🎯 APROVAÇÃO FINAL

```
Se tudo marcar ✅, sistema está 100% PRONTO PARA PRODUÇÃO!

Resultado: ___/27

Se ≥ 25/27:  ✅ APROVADO PARA DEPLOY
Se 20-24/27: ⚠️  CORREÇÕES NECESSÁRIAS
Se < 20/27:  ❌ VOLTAR À DEVELOPMENT
```

---

## 📝 NOTAS ADICIONAIS

**Problemas encontrados:**

1. ***
2. ***
3. ***

---

**Data do audit**: ********\_\_\_********  
**Executado por**: ********\_\_\_********  
**Assinatura**: **********\_\_\_**********

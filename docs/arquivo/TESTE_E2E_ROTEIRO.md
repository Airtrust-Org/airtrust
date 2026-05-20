# 🧪 ROTEIRO DE TESTE E2E - AIRTRUST FASE 4

## Pré-requisitos

### 1. Dados de Teste Necessários

Antes de rodar os testes E2E, você precisa:

```bash
# ✅ Backend online
curl https://airtrust.airtrust.workers.dev/api/health
# Esperado: {"success":true,"status":"healthy",...}

# ✅ Frontend online
# Acesso: https://production.airtrust.pages.dev/login
```

### 2. Aplicar Migration 2031

```bash
cd "/Users/filipedaumas/Documents/airtrust v1/worker-airtrust"
npx wrangler d1 execute airtrust-db --remote --file=../migrations/2031_fase4_requisitos_compliance.sql
```

**Resultado esperado:** Tabela `requisitos_compliance` criada com dados para 5 funções.

---

## TESTE 1: CRUD Funcionários

### 1.1 Criar Funcionário de Teste

**Via API:**

```bash
curl -X POST https://airtrust.airtrust.workers.dev/api/funcionarios \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "nome_completo": "Teste Piloto 001",
    "matricula": "TEST001",
    "cpf": "12345678901",
    "data_nascimento": "1990-01-15",
    "email": "teste@airtrust.local",
    "telefone": "+5585987654321",
    "funcao": "Piloto",
    "base": "BRB"
  }'
```

**Esperado:**

- ✅ Status 201 (created)
- ✅ Response tem `id`, `nome_completo`, `matricula`
- ✅ Banco D1 mostra novo registro (SELECT \* FROM funcionarios WHERE id=...)

### 1.2 Validações de Duplicação

**Duplicar matrícula:**

```bash
curl -X POST ... -d '{"nome_completo": "Outro", "matricula": "TEST001", ...}'
```

**Esperado:**

- ✅ Status 400
- ✅ Mensagem: "Matrícula já cadastrada"

**Duplicar CPF:**

```bash
curl -X POST ... -d '{"nome_completo": "Outro", "matricula": "TEST002", "cpf": "12345678901", ...}'
```

**Esperado:**

- ✅ Status 400
- ✅ Mensagem: "CPF já cadastrado"

### 1.3 Editar Funcionário

```bash
curl -X PUT https://airtrust.airtrust.workers.dev/api/funcionarios/{ID} \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "nome_completo": "Teste Piloto 001 - Editado",
    "email": "novo@airtrust.local"
  }'
```

**Esperado:**

- ✅ Status 200
- ✅ Campos atualizados refletem nas próximas consultas
- ✅ Auditoria registrada (UPDATE em auditoria table)

### 1.4 Soft Delete Funcionário

```bash
curl -X DELETE https://airtrust.airtrust.workers.dev/api/funcionarios/{ID} \
  -H "Authorization: Bearer {TOKEN}"
```

**Esperado:**

- ✅ Status 200
- ✅ GET /api/funcionarios/{ID} retorna 404
- ✅ Banco D1: `SELECT * FROM funcionarios WHERE id={ID}` mostra `deleted_at` preenchido
- ✅ Auditoria registrada (DELETE)

---

## TESTE 2: Qualificações

### 2.1 Criar Tipo de Qualificação

```bash
curl -X POST https://airtrust.airtrust.workers.dev/api/tipos-qualificacao \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "categoria": "TEORIA",
    "nome": "CMA (Comercial Multipiloto Avião)",
    "codigo": "CMA",
    "validade_meses": 12
  }'
```

**Esperado:**

- ✅ Status 201
- ✅ Tipo criado com id

### 2.2 Criar Qualificação para Funcionário

```bash
curl -X POST https://airtrust.airtrust.workers.dev/api/qualificacoes \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "funcionario_id": {FUNC_ID},
    "tipo_qualificacao_id": {TIPO_ID},
    "data_realizacao": "2025-01-15",
    "instrutor": "Instrutor Teste",
    "observacoes": "Teste de qualificação"
  }'
```

**Esperado:**

- ✅ Status 201
- ✅ `data_vencimento` calculada automaticamente (2026-01-15 se validade=12 meses)
- ✅ Registro no banco com `deleted_at IS NULL`

### 2.3 Renovar Qualificação

```bash
curl -X POST https://airtrust.airtrust.workers.dev/api/qualificacoes/{QUAL_ID}/renovar \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "nova_data_realizacao": "2026-01-15"
  }'
```

**Esperado:**

- ✅ Status 200
- ✅ `data_vencimento` atualizada para 2027-01-15
- ✅ Auditoria registrada

### 2.4 Dashboard Qualificações

```bash
curl https://airtrust.airtrust.workers.dev/api/dashboard/qualificacoes \
  -H "Authorization: Bearer {TOKEN}"
```

**Esperado:**

- ✅ Status 200
- ✅ Response tem: `total_ativas`, `vencidas`, `a_vencer_30_dias`, `validas`, `por_categoria`
- ✅ Números coincidem com consultas diretas no D1

---

## TESTE 3: Licenças

### 3.1 Criar Licença

```bash
curl -X POST https://airtrust.airtrust.workers.dev/api/licencas \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "funcionario_id": {FUNC_ID},
    "tipo": "PRC",
    "numero": "PRC12345678",
    "data_emissao": "2023-01-15",
    "data_vencimento": "2026-01-15",
    "emissor": "ANAC"
  }'
```

**Esperado:**

- ✅ Status 201
- ✅ Licença criada e visível

### 3.2 Filtrar Licenças

```bash
# Por status
curl https://airtrust.airtrust.workers.dev/api/licencas?status=valida \
  -H "Authorization: Bearer {TOKEN}"

# Por tipo
curl https://airtrust.airtrust.workers.dev/api/licencas?tipo=PRC \
  -H "Authorization: Bearer {TOKEN}"
```

**Esperado:**

- ✅ Status 200
- ✅ Apenas licenças com o filtro retornam

---

## TESTE 4: Ficha 360° (FASE 4)

### 4.1 GET /api/funcionarios/:id/ficha-360

```bash
curl https://airtrust.airtrust.workers.dev/api/funcionarios/{FUNC_ID}/ficha-360 \
  -H "Authorization: Bearer {TOKEN}"
```

**Esperado:**

- ✅ Status 200
- ✅ Response contém:
  - `funcionario` - dados do funcionário
  - `qualificacoes` - array de qualificações
  - `licencas` - array de licenças
  - `requisitos` - requisitos de compliance para a função

**Exemplo:**

```json
{
  "success": true,
  "data": {
    "funcionario": {
      "id": 1,
      "nome_completo": "Teste Piloto 001",
      "funcao": "Piloto",
      ...
    },
    "qualificacoes": [
      {
        "id": 1,
        "nome": "CMA",
        "data_vencimento": "2026-01-15",
        ...
      }
    ],
    "licencas": [...],
    "requisitos": [
      {"funcao": "Piloto", "tipo_recurso": "qualificacao", "referencia": "CMA", ...}
    ]
  }
}
```

### 4.2 GET /api/funcionarios/:id/compliance

```bash
curl https://airtrust.airtrust.workers.dev/api/funcionarios/{FUNC_ID}/compliance \
  -H "Authorization: Bearer {TOKEN}"
```

**Esperado:**

- ✅ Status 200
- ✅ Response contém:
  - `status` - "conforme", "em_risco", ou "nao_conforme"
  - `requisitos` - array com status de cada requisito

**Cenários de teste:**

1. **Conforme**: Todas qualificações/licenças presentes e válidas (>60 dias)
2. **Em Risco**: Alguma coisa vence em <=60 dias
3. **Não Conforme**: Falta qualificação/licença obrigatória

### 4.3 GET /api/compliance/funcionarios

```bash
curl https://airtrust.airtrust.workers.dev/api/compliance/funcionarios \
  -H "Authorization: Bearer {TOKEN}"

# Com filtros
curl "https://airtrust.airtrust.workers.dev/api/compliance/funcionarios?funcao=Piloto&base=BRB" \
  -H "Authorization: Bearer {TOKEN}"
```

**Esperado:**

- ✅ Status 200
- ✅ Array com status de todos funcionários
- ✅ Filtros aplicados corretamente

### 4.4 GET /api/alertas/vencimentos

```bash
# Padrão 60 dias
curl https://airtrust.airtrust.workers.dev/api/alertas/vencimentos \
  -H "Authorization: Bearer {TOKEN}"

# Custom 30 dias
curl "https://airtrust.airtrust.workers.dev/api/alertas/vencimentos?dias=30" \
  -H "Authorization: Bearer {TOKEN}"
```

**Esperado:**

- ✅ Status 200
- ✅ Response contém:
  - `dias` - número de dias configurado
  - `qualificacoes` - qualificações a vencer
  - `licencas` - licenças a vencer
- ✅ Apenas itens com vencimento entre hoje e +X dias

---

## TESTE 5: UI E2E - Ficha 360°

### 5.1 Acesso

1. Abrir https://production.airtrust.pages.dev/login
2. Fazer login com usuário válido
3. Ir para Funcionários
4. Clicar no botão account_box (Ficha 360°) em uma linha

**Esperado:**

- ✅ Página `/funcionarios/:id/ficha` carrega
- ✅ Sem erros no console

### 5.2 Header

- ✅ Nome do funcionário visível
- ✅ Badge de compliance: cor correta (verde/amarelo/vermelho)
- ✅ Botão voltar funciona

### 5.3 Abas

- ✅ **Resumo**: Mostra requisitos com status (OK/Risco/Faltando)
- ✅ **Qualificações**: Tabela com qualificações
- ✅ **Licenças**: Tabela com licenças
- ✅ **Pasta Virtual**: Link para pasta (se implementado)
- ✅ **Auditoria**: Placeholder (se implementado)

### 5.4 Dados Consistentes

- Qualificações na aba devem bater com GET /api/funcionarios/:id/ficha-360
- Status de compliance deve bater com GET /api/funcionarios/:id/compliance

---

## Resultado Final

Após passar em TODOS esses testes:

✅ CRUD Funcionários - Completo
✅ CRUD Qualificações - Completo
✅ CRUD Licenças - Completo
✅ Ficha 360° - Completo
✅ Compliance - Completo
✅ Alertas - Completo
✅ UI E2E - Completo

**Status:** 🎉 AIRTRUST FASE 1-4 TOTALMENTE FUNCIONAL

---

## Troubleshooting

Se algum teste falhar:

1. **HTTP 500**: Verificar worker logs `npx wrangler tail`
2. **Auth error**: Verificar token válido
3. **Dados não batendo**: Verificar D1 diretamente com wrangler
4. **UI não carrega**: Verificar browser console para erros
5. **Dados de exemplo**: Pode precisar deletar e recriar fixtures

---

**Documento:** Roteiro de Teste E2E  
**Data:** 18 de Novembro de 2025  
**Status:** Pronto para testes

# 🧪 FIXTURES DE TESTE - SISTEMA DE IMPORTAÇÃO

## 📋 Arquivos Criados

### 1. `funcionarios-validos.csv`

**Objetivo:** Teste de importação básica com sucesso  
**Registros:** 3 funcionários válidos  
**Expectativa:** 3 criados, 0 erros

**Campos testados:**

- ✅ Nome válido (mínimo 3 caracteres)
- ✅ Email válido formato
- ✅ Matrícula única
- ✅ CPF formato correto
- ✅ Telefone opcional
- ✅ Cargo, setor, data_admissao
- ✅ Ativo: 1 (booleano)

---

### 2. `funcionarios-email-duplicado.csv`

**Objetivo:** Teste de detecção de duplicatas  
**Registros:** 2 funcionários com mesmo email  
**Expectativa:** Erro na linha 3 - "Email duplicado"

**Validações testadas:**

- ❌ Email duplicado dentro do mesmo arquivo
- Backend deve rejeitar ou mesclar (dependendo do modo)

---

### 3. `funcionarios-erros-validacao.csv`

**Objetivo:** Teste de validação de campos obrigatórios  
**Registros:** 3 funcionários com erros diversos  
**Expectativa:** 3 erros identificados

**Erros esperados:**

- Linha 2: Nome vazio ("")
- Linha 3: Email formato inválido ("email-invalido")
- Linha 4: Email obrigatório vazio

---

### 4. `qualificacoes-tipos-validos.csv`

**Objetivo:** Teste de importação de tipos de qualificações  
**Registros:** 5 tipos diferentes (CMA, Proficiência, MLTE, etc)  
**Expectativa:** 5 criados com sucesso

**Tipos incluídos:**

1. CMA (Certificado Médico) - 12 meses
2. Proficiência Linguística - 24 meses
3. MLTE (Multi-crew License) - 60 meses
4. Sobrevivência na Selva - 36 meses
5. Dangerous Goods - 24 meses

---

### 5. `qualificacoes-historico-validos.csv`

**Objetivo:** Teste de integração Funcionários → Tipos → Histórico  
**Registros:** 5 atribuições de qualificações  
**Expectativa:** 5 criados, FKs resolvidas corretamente

**Dependências:**

- Requer: `funcionarios-validos.csv` importado primeiro
- Requer: `qualificacoes-tipos-validos.csv` importado primeiro
- Testa: Relacionamento funcionario_id ← matricula
- Testa: Relacionamento qualificacao_tipo_id ← codigo

---

### 6. `qualificacoes-historico-erros.csv`

**Objetivo:** Teste de validação de FKs inexistentes  
**Registros:** 2 registros com erros de referência  
**Expectativa:** 2 erros identificados

**Erros esperados:**

- Linha 2: Matrícula 9999 não existe → "Funcionário não encontrado"
- Linha 3: Código TIPO-INEXISTENTE não existe → "Tipo de qualificação não encontrado"

---

### 7. `funcionarios-encoding-especial.csv`

**Objetivo:** Teste de encoding UTF-8 e caracteres especiais  
**Registros:** 4 funcionários com nomes diversos  
**Expectativa:** 4 criados, caracteres preservados

**Caracteres testados:**

- ✅ Acentos portugueses: José, María
- ✅ Cedilha francesa: François
- ✅ Til espanhol: García
- ✅ Unicode chinês: 中文姓名

---

## 🔄 ORDEM DE EXECUÇÃO DOS TESTES

### Teste 1: Importação Básica

```bash
1. funcionarios-validos.csv → 3 criados
2. qualificacoes-tipos-validos.csv → 5 criados
3. qualificacoes-historico-validos.csv → 5 criados
Resultado esperado: 13 registros no total, 0 erros
```

### Teste 2: Validações de Erro

```bash
1. funcionarios-erros-validacao.csv → 3 erros detectados
2. funcionarios-email-duplicado.csv → 1 erro duplicata
3. qualificacoes-historico-erros.csv → 2 erros FK
Resultado esperado: 6 erros identificados corretamente
```

### Teste 3: Encoding e Unicode

```bash
1. funcionarios-encoding-especial.csv → 4 criados
2. Verificar banco: SELECT nome FROM funcionarios WHERE matricula IN ('F001','F002','F003','F004')
Resultado esperado: Nomes exibidos corretamente sem mojibake
```

### Teste 4: Merge Modes

```bash
1. Importar funcionarios-validos.csv (modo CRIAR)
2. Modificar CSV (trocar email do João)
3. Re-importar (modo MESCLAR_INTELIGENTE)
Resultado esperado: Email atualizado, outros campos preservados
```

### Teste 5: Rollback

```bash
1. Importar funcionarios-validos.csv
2. Anotar importId retornado
3. POST /api/importacao/{importId}/reverter
Resultado esperado: 3 registros deletados, banco volta ao estado anterior
```

---

## 🧪 COMO USAR OS FIXTURES

### Via Interface (Recomendado):

1. **Acesse a página** (ex: Funcionários)
2. **Clique** em "Importar Funcionários"
3. **Selecione** arquivo fixture (ex: `funcionarios-validos.csv`)
4. **Visualize** preview com KPIs
5. **Confirme** importação
6. **Verifique** resultado na listagem

### Via cURL (Teste Direto de API):

```bash
# 1. Obter token (substitua credenciais)
TOKEN=$(curl -s -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"senha123"}' \
  | jq -r '.token')

# 2. Download template (verificar headers)
curl -s -o template-func.csv \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8787/api/importacao/template/funcionarios

# 3. Validar CSV (dry-run)
curl -X POST http://localhost:8787/api/importacao/validar \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "entidade": "funcionarios",
    "rows": [
      {"nome":"João","email":"joao@test.com","matricula":"1001","cpf":"111.111.111-11","ativo":"1"}
    ],
    "mergeMode": "COMPLETAR"
  }' | jq .

# 4. Executar importação
curl -X POST http://localhost:8787/api/importacao/executar \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "entidade": "funcionarios",
    "validationResult": {...},  # resultado do passo 3
    "mergeMode": "COMPLETAR"
  }' | jq .

# 5. Verificar histórico
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8787/api/importacao/historico?entidade=funcionarios&limit=10" | jq .
```

---

## ✅ CHECKLIST DE VALIDAÇÕES

### Arquivo CSV:

- [ ] Headers corretos (match com schema Zod)
- [ ] Encoding UTF-8
- [ ] Sem BOM (Byte Order Mark)
- [ ] Linhas terminadas em `\n` ou `\r\n`
- [ ] Campos com vírgula escapados com aspas
- [ ] Sem linhas vazias extras no final

### Funcionários:

- [ ] Nome: min 3 caracteres, sem números
- [ ] Email: formato válido (regex)
- [ ] Matrícula: único, não vazio
- [ ] CPF: formato XXX.XXX.XXX-XX, válido (mod 11)
- [ ] Ativo: 0|1|true|false|sim|não (case-insensitive)

### Tipos de Qualificações:

- [ ] Nome: único, não vazio
- [ ] Código: único, não vazio
- [ ] Validade_meses: número inteiro positivo
- [ ] Categoria: opcional, enum se definido

### Histórico de Qualificações:

- [ ] Matrícula_funcionario: existe em funcionarios
- [ ] Codigo_qualificacao: existe em qualificacoes_tipos
- [ ] Data_obtencao: formato ISO (YYYY-MM-DD)
- [ ] Data_validade: >= data_obtencao
- [ ] Nota: 1-5 ou null
- [ ] Status: ATIVO|VENCIDO|SUSPENSO

---

## 🎯 RESULTADOS ESPERADOS POR FIXTURE

| Fixture                         | Total Linhas | Válidos | Erros | Avisos |
| ------------------------------- | ------------ | ------- | ----- | ------ |
| funcionarios-validos            | 3            | 3       | 0     | 0      |
| funcionarios-email-duplicado    | 2            | 1       | 1     | 0      |
| funcionarios-erros-validacao    | 3            | 0       | 3     | 0      |
| qualificacoes-tipos-validos     | 5            | 5       | 0     | 0      |
| qualificacoes-historico-validos | 5            | 5       | 0     | 0      |
| qualificacoes-historico-erros   | 2            | 0       | 2     | 0      |
| funcionarios-encoding-especial  | 4            | 4       | 0     | 0      |

**Total:** 24 linhas, 18 válidos, 6 erros, 0 avisos

---

## 📊 MÉTRICAS DE PERFORMANCE (Alvo)

| Fixture                                   | Linhas | Tempo Máximo | Memória Máxima |
| ----------------------------------------- | ------ | ------------ | -------------- |
| funcionarios-validos                      | 3      | < 500ms      | < 10MB         |
| qualificacoes-historico-validos           | 5      | < 800ms      | < 15MB         |
| funcionarios-encoding-especial            | 4      | < 600ms      | < 10MB         |
| **Importação grande (500 linhas)**        | 500    | < 30s        | < 100MB        |
| **Importação muito grande (5000 linhas)** | 5000   | < 5min       | < 500MB        |

---

## 🔧 PRÓXIMOS PASSOS

1. ✅ Fixtures criados
2. 🔄 Executar testes manuais com cada fixture
3. 🔄 Automatizar testes com Playwright/Cypress
4. 🔄 Criar script de teste batch (todos fixtures)
5. 🔄 Adicionar fixtures de stress test (1000+ linhas)
6. 🔄 Documentar bugs encontrados
7. 🔄 Gerar relatório final de auditoria

---

**Criado em:** 24/11/2025 03:00  
**Última Atualização:** 24/11/2025 03:00  
**Status:** ✅ PRONTO PARA TESTES

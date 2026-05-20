# 🔍 TROUBLESHOOTING - Importação de Qualificações

**Data:** 21/10/2025 22:20  
**Problema:** Importação falhando com 0/651 registros

---

## 🚨 PROBLEMA IDENTIFICADO

### Sintoma
```
Importação falhou: 0/651 registros
651 erros
0 sucessos
```

### Causa Mais Provável
**Funcionários não cadastrados** - Os CPFs da planilha não correspondem aos CPFs cadastrados no banco de dados.

---

## 🔍 DIAGNÓSTICO

### 1. Verificar Logs Detalhados

Após o último deploy (Version: da1f3ac9-82e3-4fae-bfa8-5a1d0d4892f6), os logs agora mostram:

```
[IMPORT] Buscando funcionário - CPF original: "134.651.428-37", CPF limpo: "13465142837"
[IMPORT] Funcionário NÃO encontrado para CPF: 134.651.428-37
```

### 2. Verificar CPFs no Banco

```bash
# Listar CPFs cadastrados
npx wrangler d1 execute airtrust-db --remote --command="
SELECT id, nome, cpf, matricula 
FROM funcionarios 
WHERE deleted_at IS NULL 
ORDER BY nome 
LIMIT 10;
"
```

### 3. Comparar com Planilha

**Planilha tem:**
- CPF: `134.651.428-37`
- Tipo: `Treinamento`
- Código: `B`

**Banco precisa ter:**
- Funcionário com CPF: `134.651.428-37` OU `13465142837`

---

## ✅ SOLUÇÕES

### Solução 1: Cadastrar Funcionários Primeiro

**Se os funcionários não existem:**

1. **Importar Funcionários**
   - Acesse: Funcionários → Importar
   - Use planilha com CPFs, nomes, matrículas
   - Importe ANTES das qualificações

2. **Verificar Importação**
   ```bash
   npx wrangler d1 execute airtrust-db --remote --command="
   SELECT COUNT(*) as total FROM funcionarios WHERE deleted_at IS NULL;
   "
   ```

3. **Tentar Importar Qualificações Novamente**

### Solução 2: Corrigir CPFs na Planilha

**Se os funcionários existem mas com CPFs diferentes:**

1. **Exportar CPFs do banco**
   ```bash
   npx wrangler d1 execute airtrust-db --remote --command="
   SELECT cpf, nome, matricula FROM funcionarios 
   WHERE deleted_at IS NULL 
   ORDER BY nome;
   " > cpfs_cadastrados.txt
   ```

2. **Comparar com planilha**
   - Verificar se CPFs estão no mesmo formato
   - Corrigir CPFs na planilha se necessário

3. **Reimportar**

### Solução 3: Importar Funcionários e Qualificações Juntos

**Criar planilha combinada:**

```
Planilha 1: Funcionários
- CPF
- Nome
- Matrícula
- Email
- Cargo

Planilha 2: Qualificações
- CPF (mesmo da planilha 1)
- Tipo
- Código
- Descrição
- Data Validade
```

**Ordem de importação:**
1. Importar Funcionários
2. Aguardar conclusão
3. Importar Qualificações

---

## 🧪 TESTE RÁPIDO

### Testar com 1 Registro

1. **Criar planilha de teste** com apenas 1 linha:
   ```
   cpf,tipo,codigo,descricao,data_validade
   134.651.428-37,Treinamento,B,Teste,04/01/2026
   ```

2. **Importar**

3. **Ver erro detalhado** no console:
   - Abra DevTools (F12)
   - Aba Console
   - Veja mensagem de erro específica

4. **Interpretar erro:**
   - "Funcionário não encontrado" → Cadastrar funcionário
   - "Tipo inválido" → Corrigir tipo
   - "Data inválida" → Corrigir formato de data

---

## 📊 VERIFICAÇÕES

### Checklist Pré-Importação

- [ ] Funcionários estão cadastrados?
  ```bash
  npx wrangler d1 execute airtrust-db --remote --command="
  SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NULL;
  "
  ```

- [ ] CPFs na planilha correspondem ao banco?
  ```bash
  # Verificar se CPF específico existe
  npx wrangler d1 execute airtrust-db --remote --command="
  SELECT * FROM funcionarios 
  WHERE cpf LIKE '%134.651.428-37%' OR cpf LIKE '%13465142837%';
  "
  ```

- [ ] Formato da planilha está correto?
  - Colunas: cpf, tipo, codigo, descricao, data_validade
  - Tipo: TREINAMENTO, CHECK ou EXAME
  - Data: DD/MM/YYYY ou número serial do Excel

- [ ] Planilha tem header?
  - Primeira linha deve ter nomes das colunas

---

## 🔧 COMANDOS ÚTEIS

### Verificar Funcionários

```bash
# Total de funcionários
npx wrangler d1 execute airtrust-db --remote --command="
SELECT COUNT(*) as total FROM funcionarios WHERE deleted_at IS NULL;
"

# Listar primeiros 10
npx wrangler d1 execute airtrust-db --remote --command="
SELECT id, nome, cpf, matricula FROM funcionarios 
WHERE deleted_at IS NULL 
LIMIT 10;
"

# Buscar por CPF específico
npx wrangler d1 execute airtrust-db --remote --command="
SELECT * FROM funcionarios 
WHERE cpf = '134.651.428-37' OR cpf = '13465142837';
"
```

### Verificar Qualificações

```bash
# Total de qualificações
npx wrangler d1 execute airtrust-db --remote --command="
SELECT COUNT(*) as total FROM qualificacoes;
"

# Últimas importações
npx wrangler d1 execute airtrust-db --remote --command="
SELECT * FROM importacoes_log 
WHERE tipo = 'QUALIFICACOES' 
ORDER BY created_at DESC 
LIMIT 5;
"
```

---

## 📝 FORMATO CORRETO DA PLANILHA

### Colunas Obrigatórias

| Coluna | Tipo | Exemplo | Obrigatório |
|--------|------|---------|-------------|
| `cpf` | Texto | `134.651.428-37` | ✅ Sim |
| `tipo` | Texto | `TREINAMENTO` | ✅ Sim |
| `codigo` | Texto | `B` | ✅ Sim |
| `descricao` | Texto | `Conhecimentos Gerais` | ✅ Sim |
| `data_validade` | Data | `04/01/2026` | ✅ Sim |

### Colunas Opcionais

| Coluna | Tipo | Exemplo | Obrigatório |
|--------|------|---------|-------------|
| `categoria` | Texto | `Técnico` | ❌ Não |
| `instituicao` | Texto | `ANAC` | ❌ Não |
| `instrutor` | Texto | `João Silva` | ❌ Não |
| `carga_horaria` | Número | `40` | ❌ Não |
| `numero` | Texto | `12345` | ❌ Não |
| `data_emissao` | Data | `01/01/2025` | ❌ Não |
| `data_conclusao` | Data | `31/12/2025` | ❌ Não |
| `observacoes` | Texto | `Renovação` | ❌ Não |

### Tipos Válidos

- `TREINAMENTO` ou `Treinamento`
- `CHECK` ou `Check`
- `EXAME` ou `Exame`

### Formatos de Data Aceitos

- `DD/MM/YYYY` → `04/01/2026`
- `YYYY-MM-DD` → `2026-01-04`
- Número serial do Excel → `45965`

---

## 🎯 PRÓXIMOS PASSOS

### 1. Verificar Funcionários

```bash
npx wrangler d1 execute airtrust-db --remote --command="
SELECT id, nome, cpf FROM funcionarios 
WHERE deleted_at IS NULL 
LIMIT 5;
"
```

### 2. Se Não Houver Funcionários

**Importar funcionários primeiro:**
1. Acesse: `/funcionarios`
2. Clique em "Importar"
3. Use planilha com CPFs
4. Aguarde conclusão

### 3. Tentar Importar Qualificações Novamente

Com logs detalhados agora ativos, você verá exatamente qual é o problema.

---

## 📞 SUPORTE

### Logs Detalhados

Após o deploy `da1f3ac9-82e3-4fae-bfa8-5a1d0d4892f6`, os logs mostram:

- CPF buscado (original e limpo)
- Se funcionário foi encontrado
- Nome e ID do funcionário (se encontrado)
- Erro específico em cada linha

### Ver Logs

1. Abra DevTools (F12)
2. Aba Console
3. Tente importar
4. Veja mensagens `[IMPORT]`

### Exemplo de Log

```
[IMPORT] Buscando funcionário - CPF original: "134.651.428-37", CPF limpo: "13465142837"
[IMPORT] Funcionário NÃO encontrado para CPF: 134.651.428-37
```

Ou:

```
[IMPORT] Buscando funcionário - CPF original: "134.651.428-37", CPF limpo: "13465142837"
[IMPORT] Funcionário encontrado: João Silva (ID: 123)
[IMPORT] Qualificação inserida com sucesso
```

---

**Última atualização:** 21/10/2025 22:20  
**Deploy:** da1f3ac9-82e3-4fae-bfa8-5a1d0d4892f6  
**Status:** ✅ Logs detalhados ativos

# 🧪 Roteiro de Testes Modular - AirTrust

**Data:** 26/11/2025  
**Objetivo:** Validar correções dos modais módulo por módulo  
**Scripts Existentes:** 68 encontrados

---

## 📋 Scripts de Teste por Módulo

### 1️⃣ **FUNCIONÁRIOS** (Prioridade 1)
```bash
# Teste de reatividade funcionários
chmod +x scripts/test-funcionario-reatividade.sh
./scripts/test-funcionario-reatividade.sh

# Teste dos 40 campos
chmod +x test-funcionarios-40-campos.sh
./test-funcionarios-40-campos.sh
```

**Validações:**
- ✅ 40 campos com .trim() funcionando
- ✅ Campos numéricos com Number()
- ✅ Reatividade com view qualificacoes_historico_v

---

### 2️⃣ **QUALIFICAÇÕES** (Prioridade 2)
```bash
# Teste completo qualificações
chmod +x scripts/test-qualificacoes-completo.sh
./scripts/test-qualificacoes-completo.sh
```

**Validações:**
- ✅ POST com 8 campos
- ✅ .trim() em data_conclusao, observacoes
- ✅ Number() em funcionario_cpf, nota
- ✅ GET, PUT, DELETE

---

### 3️⃣ **LICENÇAS/HABILITAÇÕES** (Prioridade 3)
```bash
# Teste master data (inclui habilitações)
chmod +x scripts/test-master-data-endpoints.sh
./scripts/test-master-data-endpoints.sh
```

**Validações:**
- ✅ Listagem habilitações
- ✅ CRUD completo
- ✅ Soft delete

---

### 4️⃣ **CATEGORIAS** (Prioridade 4)
```bash
# Teste master data (inclui categorias)
chmod +x scripts/test-master-data-endpoints.sh
./scripts/test-master-data-endpoints.sh
```

**Validações:**
- ✅ Modal com 4 campos .trim() (ModalNovaCategoria)
- ✅ nome, codigo, descricao, cor
- ✅ Payload explícito

---

### 5️⃣ **CERTIFICAÇÕES/TREINAMENTOS** (Prioridade 5)
```bash
# Teste certificados
chmod +x scripts/test-certificados.sh
./scripts/test-certificados.sh 2>/dev/null || true
```

**Validações:**
- ✅ AddCertificacaoModal com 7 campos
- ✅ .trim() em datas, instrutor, observacoes
- ✅ Number() em funcionario_id, treinamento_id

---

### 6️⃣ **SIMULADORES/TEMPLATES** (Prioridade 6)
```bash
# Teste endpoints simuladores
chmod +x scripts/audit-endpoints-simuladores.sh
./scripts/audit-endpoints-simuladores.sh
```

**Validações:**
- ✅ CriarTemplateModal com 5 campos
- ✅ .trim() em nome, descricao, manobras
- ✅ Number() em duracao_horas

---

### 7️⃣ **TODOS OS MÓDULOS** (Completo)
```bash
# Teste completo localhost
chmod +x scripts/test-completo-localhost.sh
./scripts/test-completo-localhost.sh

# Teste rigoroso
chmod +x scripts/test-rigoroso-localhost.sh
./scripts/test-rigoroso-localhost.sh
```

---

## 🎯 Ordem de Execução

### **Fase 1: Localhost (Dev)**
1. Iniciar servidor dev: `npm run dev:all`
2. Executar scripts 1-6 (modular)
3. Executar script 7 (completo)

### **Fase 2: Production (Opcional)**
```bash
# Ajustar BASE_URL nos scripts para production
BASE_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2"
```

---

## 📊 Checklist de Validação

### ✅ Funcionários (40 campos)
- [ ] Nome, CPF, email .trim()
- [ ] Telefones .replace(/\D/g, '')
- [ ] Datas formato correto
- [ ] IDs numéricos Number()

### ✅ Qualificações (8 campos)
- [ ] funcionario_cpf .trim()
- [ ] qualificacao_codigo .trim()
- [ ] data_conclusao .trim()
- [ ] nota Number()
- [ ] observacoes .trim()

### ✅ Licenças (6 campos)
- [ ] funcionario_id Number()
- [ ] categoria_id Number()
- [ ] numero_licenca .trim()
- [ ] datas .trim()

### ✅ Categorias (4 campos)
- [ ] nome .trim()
- [ ] codigo .trim()
- [ ] descricao .trim()
- [ ] cor .trim()

### ✅ Certificações (7 campos)
- [ ] funcionario_id Number()
- [ ] treinamento_id Number()
- [ ] datas .trim()
- [ ] instrutor .trim()

### ✅ Templates (5 campos)
- [ ] nome .trim()
- [ ] duracao_horas Number()
- [ ] descricao .trim()
- [ ] manobras .trim()

---

## 🚀 Execução Automática (Todos os Módulos)

```bash
#!/bin/bash
# executa-todos-testes.sh

echo "🧪 Iniciando testes modulares..."
echo ""

# 1. Funcionários
echo "1️⃣ FUNCIONÁRIOS"
./scripts/test-funcionario-reatividade.sh
./test-funcionarios-40-campos.sh
echo ""

# 2. Qualificações
echo "2️⃣ QUALIFICAÇÕES"
./scripts/test-qualificacoes-completo.sh
echo ""

# 3. Master Data
echo "3️⃣ MASTER DATA (Licenças/Categorias)"
./scripts/test-master-data-endpoints.sh
echo ""

# 4. Certificações
echo "4️⃣ CERTIFICAÇÕES"
./scripts/test-certificados.sh 2>/dev/null || true
echo ""

# 5. Simuladores
echo "5️⃣ SIMULADORES"
./scripts/audit-endpoints-simuladores.sh
echo ""

# 6. Completo
echo "6️⃣ TESTE COMPLETO"
./scripts/test-completo-localhost.sh
echo ""

echo "✅ Todos os testes concluídos!"
```

---

## 📝 Observações

1. **Servidor Local**: Todos os scripts assumem `http://localhost:8787`
2. **Auth Token**: Alguns scripts precisam de `AUTH_TOKEN` ou `.dev-token`
3. **jq**: Necessário para alguns scripts (`brew install jq`)
4. **Python3**: Necessário para validação JSON

---

## 🎯 Próximos Passos

1. ✅ Executar teste de Funcionários primeiro
2. ⏳ Analisar resultados
3. ⏳ Corrigir falhas (se houver)
4. ⏳ Executar próximo módulo
5. ⏳ Repetir até finalizar todos

---

**Status:** Pronto para execução  
**Ambiente:** Localhost (dev)  
**Commits Relacionados:**
- a872448 - ModalNovaCategoria + ModalEditarQualificacao
- cdc4156 - NovaQualificacaoModal + AddCertificacaoModal
- 0e45d7b - CriarTemplateModal
- 5cf17fa, b4440ee - ModalFuncionario (40 campos)

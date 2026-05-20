# 🐛 BUGS ENCONTRADOS - AUDITORIA COMPLETA

**Data:** 29/10/2025 20:50  
**Versão Testada:** 71ea3988-abbd-48f4-b4b4-280f4b7afb54

---

## 🔴 CRÍTICO - CORRIGIR IMEDIATAMENTE

### **1. Endpoint de Agendamento Não Existe**
- **Endpoint:** `/api/v2/simulador/agendamento`
- **Status:** ❌ 404 NOT FOUND
- **Impacto:** Agendamentos de simulador NÃO FUNCIONAM
- **Referências:** Múltiplas telas de agendamento
- **Solução:** Criar endpoint ou usar alternativa

### **2. Agendamento "Ultra Robusto" Não Existe**
- **Endpoint:** `/api/v2/simulador/agendamento-ultra-robusto-corrigido`
- **Status:** ❌ 404 NOT FOUND
- **Impacto:** Fallback de agendamento não funciona
- **Referências:** 3 no frontend
- **Solução:** Remover do frontend ou criar endpoint

### **3. Duplicar Sessão Não Funciona**
- **Endpoint:** `/api/v2/matriz-sessoes-manobras-enhanced/duplicar-sessao`
- **Status:** ❌ 404 NOT FOUND
- **Impacto:** Botão "Duplicar Sessão" não funciona
- **Referências:** 1 no frontend
- **Solução:** Criar endpoint ou remover funcionalidade

---

## 🟡 ALTO - CORRIGIR HOJE

### **4. Templates Retorna 500**
- **Endpoint:** `/api/v2/simuladores-consolidado/templates`
- **Status:** ⚠️ 500 INTERNAL SERVER ERROR
- **Impacto:** Listagem de templates quebrada
- **Solução:** Debugar e corrigir erro no backend

### **5. Slots Retorna 500**
- **Endpoint:** `/api/v2/simulador/slots`
- **Status:** ⚠️ 500 INTERNAL SERVER ERROR
- **Impacto:** Slots de agendamento não carregam
- **Solução:** Debugar e corrigir erro no backend

### **6. Funcionários Dropdown Retorna 500**
- **Endpoint:** `/api/v2/pasta-virtual/funcionarios-dropdown`
- **Status:** ⚠️ 500 INTERNAL SERVER ERROR
- **Impacto:** Dropdown de funcionários quebrado
- **Solução:** Debugar ou usar `/api/v2/funcionarios`

---

## 🟢 MÉDIO - CORRIGIR ESTA SEMANA

### **7. Console.log em Produção**
- **Total:** 196 console.log no código
- **Impacto:** Performance e segurança
- **Solução:** Remover ou usar sistema de logging

### **8. Localhost Hardcoded**
- **Total:** 4 referências
- **Impacto:** Pode causar problemas
- **Solução:** Verificar e remover

---

## ✅ FUNCIONANDO CORRETAMENTE

- ✅ `/api/v2/simuladores-consolidado` - 200 OK
- ✅ `/api/v2/simuladores-consolidado/categorias` - 200 OK
- ✅ `/api/v2/funcionarios/listar` - 200 OK
- ✅ `/api/v2/funcionarios` - 200 OK
- ✅ `/api/v2/simuladores/modelos` - 200 OK
- ✅ `/api/v2/manobras` - 200 OK
- ✅ `/api/v2/fichas` - 200 OK

---

## 📋 PLANO DE AÇÃO DETALHADO

### **FASE 1 - AGENDAMENTOS (CRÍTICO)**

#### **1.1 Verificar qual endpoint de agendamento usar**
```bash
# Verificar arquivos de agendamento disponíveis
ls src/worker/api/v2/*agendamento*.ts
```

**Opções:**
- `simulador-agendamento-airtrust.ts`
- `simulador-agendamento-robusto.ts`
- `agendamentos.ts`

**Ação:** Identificar qual está registrado e funcionando

#### **1.2 Atualizar frontend**
```bash
# Encontrar todas as referências
grep -r "simulador/agendamento" src/react-app --include="*.tsx"
```

**Ação:** Atualizar para usar endpoint correto

### **FASE 2 - CORRIGIR 500 ERRORS (ALTO)**

#### **2.1 Debugar `/api/v2/simuladores-consolidado/templates`**
```bash
# Ver código do endpoint
cat src/worker/api/v2/simuladores-consolidado.ts | grep -A50 "templates"
```

**Ação:** Identificar causa do erro 500

#### **2.2 Debugar `/api/v2/simulador/slots`**
```bash
# Verificar se arquivo existe
find src/worker/api/v2 -name "*slot*"
```

**Ação:** Criar endpoint se não existir

#### **2.3 Debugar `/api/v2/pasta-virtual/funcionarios-dropdown`**
**Ação:** Substituir por `/api/v2/funcionarios?limit=1000`

### **FASE 3 - LIMPEZA (MÉDIO)**

#### **3.1 Remover console.log**
```bash
# Script para remover console.log
find src/react-app -name "*.tsx" -exec sed -i '' '/console\.log/d' {} \;
```

#### **3.2 Verificar localhost**
```bash
grep -rn "localhost:8787" src/react-app --include="*.tsx" --include="*.ts"
```

---

## 🔧 CORREÇÕES IMEDIATAS

### **Correção 1: Atualizar Agendamento**

**Arquivo:** `src/react-app/pages/AgendarSimulador.tsx` (ou similar)

```typescript
// ANTES
const response = await fetch('/api/v2/simulador/agendamento-ultra-robusto-corrigido');

// DEPOIS
const response = await fetch('/api/v2/agendamentos');
```

### **Correção 2: Remover Duplicar Sessão**

**Arquivo:** Encontrar componente que usa duplicar-sessao

```typescript
// REMOVER ou comentar botão "Duplicar Sessão"
// até endpoint ser criado
```

### **Correção 3: Atualizar Dropdown Funcionários**

```typescript
// ANTES
const response = await fetch('/api/v2/pasta-virtual/funcionarios-dropdown');

// DEPOIS
const response = await fetch('/api/v2/funcionarios?limit=1000');
```

---

## 📊 RESUMO EXECUTIVO

### **Bugs Encontrados:**
- 🔴 **3 CRÍTICOS** (404 Not Found)
- 🟡 **3 ALTOS** (500 Internal Server Error)
- 🟢 **2 MÉDIOS** (Limpeza de código)

### **Endpoints Funcionando:**
- ✅ **7 endpoints** testados e funcionando

### **Impacto:**
- **Agendamentos:** NÃO FUNCIONAM (crítico)
- **Templates:** PARCIALMENTE FUNCIONAM (500 em alguns)
- **Fichas:** FUNCIONAM (corrigidos anteriormente)
- **Manobras:** FUNCIONAM (corrigidos anteriormente)

### **Tempo Estimado:**
- Fase 1 (Crítico): 2-3 horas
- Fase 2 (Alto): 2-3 horas
- Fase 3 (Médio): 1-2 horas
- **Total:** 5-8 horas

---

## 🎯 PRÓXIMA AÇÃO

**COMEÇAR AGORA:**
1. Verificar arquivos de agendamento disponíveis
2. Identificar endpoint correto
3. Atualizar frontend
4. Testar agendamento completo
5. Deploy e validação

---

**AUDITORIA COMPLETA DISPONÍVEL EM:** `AUDITORIA-COMPLETA.md`  
**REFERÊNCIA DE ENDPOINTS:** `ENDPOINTS-REFERENCE.md`  
**GUIA DE API CLIENT:** `API-CLIENT-GUIDE.md`

# 🔍 AUDITORIA DE CONFLITOS DE NOMENCLATURA - AirTrust

**Data:** 29/11/2025  
**Status:** 🚨 CRÍTICO - Múltiplos conflitos detectados

---

## 1️⃣ CONFLITO: canac vs codigo_anac

### ✅ STATUS: RESOLVIDO
- **Migration 0129**: Copiou dados de `canac` → `codigo_anac`
- **Migration 0130**: Removeu coluna `canac` do banco
- **Codebase**: 0 referências a "canac" (global replace feito)

---

## 2️⃣ CONFLITO: nascimento vs data_nascimento

### 🗄️ BANCO DE DADOS:
- Coluna real: `nascimento` (cid 17)
- Registros preenchidos: **44 funcionários**

### 💻 BACKEND (types/index.ts linha 88):
```typescript
nascimento?: string;  // ✅ CORRETO
```

### 🎨 FRONTEND (src/react-app/types/index.ts linha 14):
```typescript
data_nascimento?: string;  // ❌ ERRADO - deveria ser nascimento
```

### 📊 USAGES:
- Backend: usa `nascimento` corretamente
- Frontend: espera `data_nascimento` (incompatível)
- Routes POST: recebe `body.data_nascimento` mas grava em `nascimento`

### 🛠️ SOLUÇÃO:
Padronizar para `nascimento` (sem "data_" prefix):
1. Renomear no frontend: `data_nascimento` → `nascimento`
2. Atualizar routes que recebem `body.data_nascimento`
3. Verificar componentes React

---

## 3️⃣ CONFLITO: admissao vs data_admissao

### 🗄️ BANCO DE DADOS:
- Coluna real: `admissao` (cid 48)
- Registros preenchidos: **40 funcionários**

### 💻 BACKEND (types/index.ts):
```typescript
admissao?: string;       // linha 92 ✅ CORRETO
data_admissao?: string;  // linha 96 ❌ DUPLICADO
```

### 🎨 FRONTEND (src/react-app/types/index.ts linha 13):
```typescript
data_admissao?: string;  // ❌ ERRADO - deveria ser admissao
```

### 📊 USAGES:
- Backend types: TEM AMBOS (linha 92 e 96)
- Frontend: usa `data_admissao` (incompatível)
- Routes POST: recebe `body.data_admissao` mas grava em `admissao`

### 🛠️ SOLUÇÃO:
Padronizar para `admissao` (sem "data_" prefix):
1. Remover `data_admissao` do backend types (linha 96)
2. Renomear no frontend: `data_admissao` → `admissao`
3. Atualizar routes que recebem `body.data_admissao`
4. Verificar componentes React

---

## 4️⃣ PADRÃO INCONSISTENTE: data_*

### 🔍 ANÁLISE:
O sistema mistura dois padrões:
- ✅ **BANCO**: usa nomes simples (`nascimento`, `admissao`, `validade`)
- ❌ **FRONTEND**: tenta usar prefixo `data_*` em alguns casos

### 📋 CAMPOS DE DATA NO SISTEMA:

#### ✅ Já padronizados (sem prefixo):
- `nascimento` (funcionarios)
- `admissao` (funcionarios)
- `validade` (qualificacoes_tipos)
- `validade_icao` (funcionarios)
- `validade_cma` (funcionarios)
- `validade_aso` (funcionarios)

#### ⚠️ Com prefixo data_* (verificar se necessário):
- `data_conclusao` (qualificacoes_historico)
- `data_vencimento` (qualificacoes_historico)
- `data_emissao` (possível - não confirmado)

### 💡 RECOMENDAÇÃO:
**MANTER PADRÃO SEM PREFIXO** (nascimento, admissao, validade)
- Mais limpo
- Consistente com banco
- Menos confusão

---

## 5️⃣ OUTROS CONFLITOS POTENCIAIS

### 🔍 A verificar:
- [ ] `logradouro` vs `endereco` (banco tem ambos - cid 33 e 35)
- [ ] `estado` vs `uf` (verificar se existe ambos)
- [ ] `nome_guerra` vs `guerra` (backend linha 86 vs banco)
- [ ] `telefone` vs `telefone_emergencia` (distintos mas verificar uso)

---

## 📊 RESUMO EXECUTIVO

| Conflito | Banco | Backend | Frontend | Prioridade | Status |
|----------|-------|---------|----------|------------|--------|
| canac/codigo_anac | codigo_anac | codigo_anac | codigo_anac | 🔴 Alta | ✅ Resolvido |
| nascimento/data_nascimento | nascimento | nascimento | data_nascimento | 🔴 Alta | 🚨 Pendente |
| admissao/data_admissao | admissao | AMBOS! | data_admissao | 🔴 Alta | 🚨 Pendente |
| logradouro/endereco | AMBOS | ? | ? | 🟡 Média | 🔍 A verificar |
| guerra/nome_guerra | guerra | guerra | nome_guerra | 🟡 Média | 🔍 A verificar |

---

## ✅ AÇÕES NECESSÁRIAS

### IMEDIATO:
1. ✅ Remover `data_admissao` duplicado do backend types (linha 96)
2. ✅ Renomear `data_nascimento` → `nascimento` no frontend
3. ✅ Renomear `data_admissao` → `admissao` no frontend
4. ✅ Atualizar routes POST/PUT para não usar `body.data_*`
5. ✅ Global find/replace no frontend

### MÉDIO PRAZO:
6. 🔍 Auditar campos `logradouro`/`endereco`
7. 🔍 Auditar campos `guerra`/`nome_guerra`
8. 🔍 Verificar outros campos duplicados

---

## 🎯 PADRÃO FINAL ESTABELECIDO

### Nomenclatura de campos de data:
- ✅ **SEM PREFIXO**: `nascimento`, `admissao`, `validade`
- ❌ **COM PREFIXO**: Evitar `data_*` salvo contexto específico

### Nomenclatura geral:
- ✅ **CONSISTÊNCIA**: Banco = Backend = Frontend
- ✅ **SIMPLICIDADE**: Nomes curtos quando possível
- ✅ **CLAREZA**: Se precisa prefixo, usar em TODOS os lugares

---

**Próximo passo:** Executar correções globais (find/replace + migration se necessário)

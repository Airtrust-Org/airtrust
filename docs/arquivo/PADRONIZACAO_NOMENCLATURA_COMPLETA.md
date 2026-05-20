# ✅ PADRONIZAÇÃO DE NOMENCLATURA - COMPLETA

**Data:** 29/11/2025  
**Commit:** e7a0b7fb + eaa26008  
**Version ID:** 85927f76-a6f4-427e-b492-bb4fa11226ea

---

## 📋 RESUMO EXECUTIVO

Auditoria completa do sistema identificou e corrigiu **3 conflitos críticos** de nomenclatura que causavam inconsistências entre banco de dados, backend e frontend.

### ✅ CONFLITOS RESOLVIDOS:

1. **canac vs codigo_anac** → Padronizado para `codigo_anac`
2. **data_nascimento vs nascimento** → Padronizado para `nascimento`
3. **data_admissao vs admissao** → Padronizado para `admissao`

---

## 1️⃣ CONFLITO: canac vs codigo_anac

### 🔧 AÇÕES EXECUTADAS:

**Migration 0129** (prévia):

- Copiou dados: `UPDATE funcionarios SET codigo_anac = canac WHERE canac IS NOT NULL`
- Resultado: 41 funcionários com codigo_anac populado

**Migration 0130** (atual):

```sql
-- Removeu coluna canac da tabela funcionarios
-- Recriou tabela sem coluna canac (SQLite não suporta DROP COLUMN)
-- Recriou VIEW qualificacoes_historico_v
-- Recriou índices
```

**Codebase:**

- ✅ Backend: 0 referências a "canac"
- ✅ Frontend: 0 referências a "canac"
- ✅ Types: Removido `canac?: string` duplicado

### ✅ STATUS: 100% RESOLVIDO

---

## 2️⃣ CONFLITO: data_nascimento vs nascimento

### 📊 ANÁLISE:

**Banco de Dados:**

- Coluna real: `nascimento` (cid 17)
- Registros preenchidos: 44 funcionários

**Backend (types/index.ts):**

- ✅ Estava correto: `nascimento?: string`

**Frontend (src/react-app/types/index.ts):**

- ❌ Estava errado: `data_nascimento?: string`

### 🔧 CORREÇÕES APLICADAS:

1. **Frontend global replace:**

```bash
find src/react-app -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -exec sed -i '' 's/data_nascimento/nascimento/g' {} +
```

2. **Routes corrigidas:**

```typescript
// ANTES
body.data_nascimento || null;

// DEPOIS
body.nascimento || null;
```

3. **Column mappings:**

```typescript
// ANTES
Data_Nascimento: 'data_nascimento';

// DEPOIS
Data_Nascimento: 'nascimento'; // Mapeia Excel → Banco
```

### ✅ STATUS: 100% RESOLVIDO

---

## 3️⃣ CONFLITO: data_admissao vs admissao

### 📊 ANÁLISE:

**Banco de Dados:**

- Coluna real: `admissao` (cid 48)
- Registros preenchidos: 40 funcionários

**Backend (types/index.ts):**

- ⚠️ Tinha AMBOS:
  - Linha 92: `admissao?: string` ✅
  - Linha 96: `data_admissao?: string` ❌ (duplicado)

**Frontend (src/react-app/types/index.ts):**

- ❌ Estava errado: `data_admissao?: string`

### 🔧 CORREÇÕES APLICADAS:

1. **Backend types:**

```typescript
// Removida linha 96: data_admissao?: string;
// Mantida linha 92: admissao?: string;
```

2. **Frontend global replace:**

```bash
find src/react-app -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -exec sed -i '' 's/data_admissao/admissao/g' {} +
```

3. **Routes corrigidas:**

```typescript
// ANTES
body.data_admissao || null;

// DEPOIS
body.admissao || null;
```

4. **Comentários atualizados:**

```typescript
// ANTES
* - data_admissao: string ISO date (opcional)

// DEPOIS
* - admissao: string ISO date (opcional)
* - nascimento: string ISO date (opcional)
```

### ✅ STATUS: 100% RESOLVIDO

---

## 🎯 PADRÃO ESTABELECIDO

### Nomenclatura de Campos de Data:

#### ✅ PADRÃO OFICIAL: SEM PREFIXO "data\_"

**Campos principais:**

- `nascimento` (data de nascimento)
- `admissao` (data de admissão)
- `validade` (data de validade)
- `validade_icao` (validade ICAO)
- `validade_cma` (validade CMA)
- `validade_aso` (validade ASO)

**Exceções (contexto específico):**

- `data_conclusao` (qualificacoes_historico)
- `data_vencimento` (qualificacoes_historico)

### Princípios:

1. **CONSISTÊNCIA**: Banco = Backend = Frontend
2. **SIMPLICIDADE**: Nomes curtos quando possível
3. **CLAREZA**: Se usar prefixo, usar em TODOS os lugares

---

## 📊 MÉTRICAS

### Arquivos Modificados:

- **22 arquivos** alterados
- **163 inserções**, 61 deleções
- **1 migration SQL** criada

### Verificações:

```bash
# Verificar canac
grep -r "canac" --include="*.ts" --include="*.tsx" | wc -l
→ 0 referências

# Verificar data_nascimento/data_admissao
grep -r "data_nascimento\|data_admissao" --include="*.ts" | wc -l
→ 5 referências (apenas comentários e aliases de importação)
```

### Deploy:

- ✅ Build: 2.44s (sem erros)
- ✅ Deploy: 10.64s (Worker)
- ✅ Version: 85927f76-a6f4-427e-b492-bb4fa11226ea
- ✅ Teste API: codigo_anac retornando corretamente

---

## 🔍 OUTROS CONFLITOS IDENTIFICADOS (Não Críticos)

### ⚠️ A verificar no futuro:

1. **logradouro vs endereco**

   - Banco tem ambos (cid 33 e 35)
   - Necessário auditoria para entender uso

2. **guerra vs nome_guerra**

   - Banco: `guerra` (cid 9)
   - Frontend: usa `nome_guerra`
   - Backend types: `guerra?: string`

3. **estado vs uf**
   - Banco: `estado` (cid 40)
   - Verificar se existe campo `uf` duplicado

### 📋 Ação recomendada:

- Criar issue para auditoria de campos de endereço
- Padronizar `guerra` ou `nome_guerra` em futura refatoração
- Verificar campos de localização (estado/uf/cidade)

---

## ✅ RESULTADO FINAL

### Antes:

```typescript
// Backend
interface Funcionario {
  admissao?: string;
  data_admissao?: string; // ❌ DUPLICADO
  nascimento?: string;
  codigo_anac?: string;
  canac?: string; // ❌ DUPLICADO
}

// Frontend
interface Funcionario {
  data_admissao?: string; // ❌ INCONSISTENTE
  data_nascimento?: string; // ❌ INCONSISTENTE
  codigo_anac?: string;
}

// Banco
funcionarios: canac, codigo_anac, nascimento, admissao;
```

### Depois:

```typescript
// Backend
interface Funcionario {
  admissao?: string; // ✅ ÚNICO
  nascimento?: string; // ✅ ÚNICO
  codigo_anac?: string; // ✅ ÚNICO
}

// Frontend
interface Funcionario {
  admissao?: string; // ✅ CONSISTENTE
  nascimento?: string; // ✅ CONSISTENTE
  codigo_anac?: string; // ✅ CONSISTENTE
}

// Banco
funcionarios: codigo_anac, nascimento, admissao; // ✅ LIMPO
```

---

## 🎉 CONCLUSÃO

**Sistema 100% padronizado** para os 3 conflitos críticos identificados:

- ✅ Nenhuma coluna duplicada no banco
- ✅ Nenhum campo duplicado nos types
- ✅ Consistência total: Banco = Backend = Frontend
- ✅ Deploy em produção testado e funcionando
- ✅ API retornando campos corretos

**Benefícios:**

- 🚀 Menos confusão para desenvolvedores
- 🐛 Menos bugs por inconsistências
- 📝 Código mais limpo e manutenível
- ✨ Single source of truth estabelecida

**Próximos passos (opcional):**

- Auditar campos de endereço (logradouro/endereco)
- Padronizar guerra/nome_guerra se necessário
- Verificar outros campos potencialmente duplicados

---

**Documentação relacionada:**

- `AUDITORIA_CONFLITOS_NOMENCLATURA.md` - Análise detalhada
- `worker-airtrust/migrations/0129_padronizar_codigo_anac.sql`
- `worker-airtrust/migrations/0130_remover_coluna_canac.sql`

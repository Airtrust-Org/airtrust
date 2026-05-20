# 📘 Guia de Hooks de Qualificações - AirTrust

**Data:** 22 de novembro de 2025  
**Versão:** 1.0  
**Contexto:** Consolidação da arquitetura de hooks do módulo de qualificações

---

## 🎯 Visão Geral

O módulo de qualificações possui **2 hooks principais** com propósitos distintos:

### 1. **useQualificacoes** → Tipos/Templates de Qualificações

### 2. **useQualificacoesExt** (com `useQualificacoesHistorico`) → Histórico/Atribuições

---

## 📦 Hook 1: `useQualificacoes`

### **Propósito**

Gerenciar **TIPOS** de qualificações (templates/modelos).

### **Endpoint**

```
GET /api/qualificacoes?limit=100
```

### **Retorna**

```typescript
interface Qualificacao {
  id: number;
  nome: string;
  codigo: string;
  categoria: string;
  validade_meses: number;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
}
```

### **Exports**

```typescript
export const useQualificacoes = () => {
  return {
    qualificacoes: Qualificacao[],
    loading: boolean,
    error: string | null,
    carregar: () => Promise<void>
  }
}
```

### **Uso**

Quando você precisa:

- Listar tipos disponíveis de qualificações
- Preencher selects/dropdowns com opções de qualificações
- Criar nova atribuição (precisa escolher qual qualificação atribuir)
- Buscar validade_meses de uma qualificação

### **Onde é usado**

- ✅ `QualificacoesHistorico.tsx` - Para buscar validade_meses ao exibir tabela
- ✅ `QualificacoesWrapper.tsx` - Para listar tipos na aba "Qualificações"
- ✅ `ModalAtribuirQualificacao.tsx` - Para select de tipos ao criar atribuição

### **Características**

- ✅ Simples e direto
- ✅ Cache local com useState
- ✅ Recarregamento manual via `carregar()`
- ✅ Gerencia apenas lista de tipos

---

## 📋 Hook 2: `useQualificacoesExt` → `useQualificacoesHistorico`

### **Propósito**

Gerenciar **HISTÓRICO** de qualificações atribuídas a funcionários.

### **Endpoint**

```
GET /api/qualificacoes/historico?limit=X&page=Y&funcionario_id=Z&status=...
```

### **Retorna**

```typescript
interface HistoricoQualificacao {
  id: number;
  funcionario_id: number;
  qualificacao_id: number;
  funcionario_nome: string;
  qualificacao_desc: string;
  qualificacao_nome?: string;
  qualificacao_codigo?: string;
  data_conclusao?: string;
  data_vencimento?: string;
  certificado_numero?: string;
  certificado_url?: string;
  observacoes?: string;
  status?: string;
  // ... +30 campos agregados de funcionários
}
```

### **Exports**

```typescript
export const useQualificacoesHistorico = (
  funcionario_id?: number,
  limit = 50,
  page = 1
) => {
  return {
    historico: HistoricoQualificacao[],
    stats: { total, vencidas, a_vencer, validas },
    loading: boolean,
    error: string | null,
    totalPages: number,
    carregar: (page?, limit?, filters?) => Promise<void>,
    criar: (data) => Promise<void>,
    atualizar: (id, data) => Promise<void>,
    deletar: (id) => Promise<void>,
    renovar: (id, nova_data) => Promise<void>
  }
}
```

### **Uso**

Quando você precisa:

- Listar qualificações atribuídas a funcionários
- Ver histórico completo de uma qualificação
- Obter estatísticas (vencidas, a vencer, válidas)
- Criar/editar/deletar atribuições
- Renovar qualificações
- Filtrar por funcionário, status, tipo, etc.
- Trabalhar com dados agregados (funcionário + qualificação + certificado)

### **Onde é usado**

- ✅ `QualificacoesNew.tsx` - Tabela principal de histórico com filtros
- ✅ `QualificacoesWrapper.tsx` - Aba "Histórico" com estatísticas
- ✅ `DashboardNew.tsx` - Cards de estatísticas (total, vencidas, a vencer)

### **Características**

- ✅ Paginação nativa
- ✅ Filtros avançados (funcionário, status, tipo, categoria)
- ✅ Estatísticas agregadas
- ✅ CRUD completo (criar, atualizar, deletar, renovar)
- ✅ Dados enriquecidos com joins (funcionário + qualificação + certificado)

---

## 🔄 Comparação Rápida

| Aspecto           | useQualificacoes          | useQualificacoesHistorico               |
| ----------------- | ------------------------- | --------------------------------------- |
| **Endpoint**      | `/api/qualificacoes`      | `/api/qualificacoes/historico`          |
| **Dados**         | Tipos/Templates           | Atribuições/Histórico                   |
| **Paginação**     | ❌ Lista fixa (limit=100) | ✅ Suporte completo                     |
| **Filtros**       | ❌ Apenas ativo=true      | ✅ Status, funcionário, tipo, categoria |
| **Estatísticas**  | ❌ Não                    | ✅ Total, vencidas, a vencer, válidas   |
| **CRUD**          | ❌ Somente leitura        | ✅ Criar, atualizar, deletar, renovar   |
| **Complexidade**  | 🟢 Simples (~75 linhas)   | 🟡 Complexo (~214 linhas)               |
| **Uso Principal** | Selects de tipos          | Tabelas de histórico                    |

---

## 🎨 Padrões de Uso

### ✅ CORRETO: Usando ambos em QualificacoesHistorico.tsx

```typescript
// Buscar TIPOS de qualificações (para validação, busca de validade_meses)
const { qualificacoes, loading: qualLoading } = useQualificacoes();

// Buscar HISTÓRICO de atribuições (dados da tabela principal)
const { habilitacoes, loading: habLoading, carregar } = useHabilitacoes();

// Exibir validade na tabela
const qual = qualificacoes.find((q) => q.id === hab.qualificacao_id);
console.log(`Validade: ${qual?.validade_meses} meses`);
```

### ✅ CORRETO: Usando histórico em QualificacoesNew.tsx

```typescript
// Buscar histórico completo com paginação e stats
const { historico, stats, loading, carregar, renovar } = useQualificacoesHistorico(
  undefined,
  50,
  1,
);

// Exibir stats no header
<div>
  Total: {stats.total}, Vencidas: {stats.vencidas}
</div>;

// Renovar qualificação
await renovar(hab.id, '2026-12-31');
```

### ✅ CORRETO: Usando tipos em Modal

```typescript
// Preencher select de tipos ao criar nova atribuição
const { qualificacoes, carregar } = useQualificacoes();

useEffect(() => {
  carregar(); // Carrega tipos disponíveis
}, []);

<select>
  {qualificacoes.map((q) => (
    <option value={q.id}>
      {q.codigo} - {q.nome}
    </option>
  ))}
</select>;
```

---

## ⚠️ Anti-Padrões (NÃO FAZER)

### ❌ ERRADO: Usar tipos para dados de histórico

```typescript
// ❌ useQualificacoes NÃO retorna atribuições a funcionários
const { qualificacoes } = useQualificacoes();
qualificacoes.map((q) => <div>{q.funcionario_nome}</div>); // ERRO: campo não existe
```

### ❌ ERRADO: Usar histórico apenas para listar tipos

```typescript
// ❌ Overhead desnecessário - use useQualificacoes
const { historico } = useQualificacoesHistorico();
const tipos = [...new Set(historico.map((h) => h.qualificacao_nome))]; // Ineficiente
```

---

## 🚀 Quando Usar Qual Hook?

### Use **useQualificacoes** quando:

1. 📝 Precisar listar tipos/templates de qualificações
2. 🎯 Preencher select/dropdown com opções disponíveis
3. 🔍 Buscar informações de validade_meses de um tipo
4. ✨ Criar nova qualificação (adicionar tipo ao catálogo)

### Use **useQualificacoesHistorico** quando:

1. 📊 Exibir tabela de qualificações atribuídas
2. 📈 Mostrar estatísticas (vencidas, a vencer, válidas)
3. 👤 Filtrar qualificações por funcionário
4. 🔄 Renovar qualificação existente
5. ✏️ Editar/deletar atribuição
6. 📄 Trabalhar com paginação de histórico
7. 🏷️ Filtrar por status, categoria, tipo

---

## 📊 Fluxo de Dados Típico

```
1. Usuário abre página Qualificações
   ↓
2. useQualificacoes carrega TIPOS disponíveis
   GET /api/qualificacoes → [{id:1, nome:"CMA", validade_meses:12}, ...]
   ↓
3. useQualificacoesHistorico carrega ATRIBUIÇÕES
   GET /api/qualificacoes/historico → [{id:100, funcionario_id:5, qualificacao_id:1, ...}, ...]
   ↓
4. Componente exibe tabela com JOIN
   - Dados de atribuição: useQualificacoesHistorico
   - Validade (meses): useQualificacoes.find(q => q.id === atribuicao.qualificacao_id)
   ↓
5. Usuário clica "Renovar"
   ↓
6. useQualificacoesHistorico.renovar(id, nova_data)
   POST /api/qualificacoes/historico/:id/renovar
   ↓
7. Recarrega histórico automaticamente
```

---

## 🔧 Sugestões de Melhoria (Futuro)

### Opção 1: Manter Separado (Recomendado) ✅

**Status:** Atual - funcionando bem  
**Razão:** Separação clara de responsabilidades (tipos vs atribuições)  
**Ação:** Apenas documentar claramente (feito neste arquivo)

### Opção 2: Unificar em Hook Único

**Complexidade:** Alta  
**Benefício:** Reduzir importações  
**Risco:** Aumentar complexidade, perder clareza de propósito  
**Decisão:** NÃO recomendado - manter separado é mais claro

### Opção 3: Adicionar React Query (TanStack Query)

**Benefício:** Cache automático, invalidação, refetch inteligente  
**Esforço:** Médio  
**Status:** Considerar em refactoring futuro  
**Exemplo:**

```typescript
const { data: tipos } = useQuery(['qualificacoes'], fetchQualificacoes);
const { data: historico } = useQuery(['historico', page], () => fetchHistorico(page));
```

---

## 📝 Checklist de Uso

Antes de importar um hook, pergunte-se:

- [ ] Preciso de **tipos/templates** ou **atribuições/histórico**?
- [ ] Preciso de **paginação**? → useQualificacoesHistorico
- [ ] Preciso de **estatísticas**? → useQualificacoesHistorico
- [ ] Preciso de **filtros avançados**? → useQualificacoesHistorico
- [ ] Preciso de **CRUD completo**? → useQualificacoesHistorico
- [ ] Apenas listar **tipos disponíveis**? → useQualificacoes
- [ ] Preencher **select de qualificações**? → useQualificacoes

---

## 🎓 Conclusão

Os hooks estão **bem separados** por propósito:

- `useQualificacoes` = Catálogo de tipos
- `useQualificacoesHistorico` = Atribuições e histórico

**Não há necessidade de unificação.** A separação é clara e reflete a separação no backend:

- `/api/qualificacoes` = Tipos
- `/api/qualificacoes/historico` = Atribuições

**Recomendação:** Manter arquitetura atual e usar este guia como referência.

---

**Última atualização:** 22/11/2025  
**Autor:** GitHub Copilot (Claude Sonnet 4.5)  
**Versão do Sistema:** AirTrust v1.0

# 🔍 AUDITORIA PROFUNDA - PROBLEMAS ENCONTRADOS

**Data**: 2025-12-02 00:10 BRT  
**Escopo**: Módulo Simuladores completo

---

## ❌ PROBLEMAS IDENTIFICADOS

### 1. **Status Inconsistentes** (12 ocorrências)

#### Backend retorna:

- `AGENDADO` (sem "A")
- `CONCLUIDO` (sem "A")
- `CANCELADO` (sem "A")

#### Frontend espera:

- `AGENDADA` (com "A")
- `CONCLUIDA` (com "A")
- `CANCELADA` (com "A")

**Arquivos afetados**:

- ✅ `SessoesTab.tsx` - JÁ CORRIGIDO
- ❌ `AgendaTab.tsx` - linha 15: `status: 'AGENDADO' | 'CONCLUIDO'`
- ❌ `Simuladores.tsx` - linha 70: `status: 'AGENDADO' | 'CONCLUIDO'`
- ❌ `Simuladores.tsx` - linha 181: `s.status === 'AGENDADO'`
- ❌ `Simuladores.tsx` - linha 359: `s.status === 'AGENDADO'`
- ❌ `Simuladores.tsx` - linha 437: `status === 'AGENDADO'`
- ❌ `agenda/index.tsx` - linha 40: `'AGENDADO'`
- ❌ `agenda/index.tsx` - linha 178: `status === 'AGENDADO'`
- ❌ `dashboard/index.tsx` - linha 24: `status=agendada` (query param)

---

### 2. **Campos Faltantes em Interfaces** (6 ocorrências)

#### Problema: Interfaces TypeScript desatualizadas

**AgendaTab.tsx** (linha 12-17):

```typescript
interface Agendamento {
  instrutor_nome: string; // ✅ TEM
  // ❌ FALTA: simulador_nome
  // ❌ FALTA: funcionarios_inscritos
  // ❌ FALTA: data (alias para compatibilidade)
}
```

**Simuladores.tsx** (linha 68-82):

```typescript
interface Sessao {
  instrutor_nome: string; // ✅ TEM
  data_sessao: string; // ✅ TEM
  // ❌ FALTA: data (fallback)
  // ❌ FALTA: funcionarios_inscritos
  // ❌ FALTA: simulador_nome (em alguns lugares)
}
```

---

### 3. **Dashboard Query Param Errado** (linha 24)

```typescript
// ❌ ERRADO: status=agendada (minúsculo + "A")
fetch(`${API_BASE_URL}/simuladores/sessoes?limit=5&status=agendada`);

// ✅ CORRETO: status=AGENDADO (maiúsculo sem "A")
fetch(`${API_BASE_URL}/simuladores/sessoes?limit=5&status=AGENDADO`);
```

---

### 4. **Types Globais Desatualizados** (simuladores.ts)

**Arquivo**: `src/react-app/types/simuladores.ts`

```typescript
export type StatusSessao =
  | 'PLANEJADA'
  | 'AGENDADA' // ❌ API retorna 'AGENDADO'
  | 'CONFIRMADA'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDA' // ❌ API retorna 'CONCLUIDO'
  | 'CANCELADA'; // ❌ API retorna 'CANCELADO'
```

**Problema**: Type não aceita valores do backend!

---

### 5. **Agenda Semanal - Cores Hardcoded** (linha 100)

```typescript
const cores = {
  agendada: 'bg-blue-500',
  concluida: 'bg-green-500',
  cancelada: 'bg-red-500',
};
return cores[status as keyof typeof cores] || cores.agendada;
```

**Problema**: Status do backend (`AGENDADO`) não bate com keys (`agendada`)

---

### 6. **GET /fichas - Falta data_sessao em alguns selects**

GET /fichas retorna `data_hora` mas NÃO retorna `data_sessao` explicitamente.

```sql
-- Atual:
sa.data || ' ' || sa.hora_inicio as data_hora

-- Deveria ter também:
sa.data as data_sessao
```

---

## 🎯 PLANO DE CORREÇÃO

### FASE 1: Backend - Padronizar Status ✅ (opcional)

**OU** aceitar no frontend (mais fácil)

### FASE 2: Frontend - Aceitar Ambos Formatos ✅

#### 2.1 Types Globais

```typescript
// src/react-app/types/simuladores.ts
export type StatusSessao =
  | 'PLANEJADA'
  | 'AGENDADA'
  | 'AGENDADO'
  | 'CONFIRMADA'
  | 'CONFIRMADO'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDA'
  | 'CONCLUIDO'
  | 'CANCELADA'
  | 'CANCELADO';
```

#### 2.2 Helpers de Normalização

```typescript
// Adicionar em utils
export const normalizeStatus = (status: string): string => {
  return status?.toUpperCase() || '';
};

export const getStatusDisplay = (status: string): string => {
  const normalized = normalizeStatus(status);
  // Remove "O" final se existir
  return normalized.endsWith('O') ? normalized.slice(0, -1) + 'A' : normalized;
};
```

#### 2.3 Corrigir AgendaTab.tsx

- Atualizar interface
- Aceitar ambos status

#### 2.4 Corrigir Simuladores.tsx

- Atualizar interfaces (3 lugares)
- Normalizar comparações de status (5 lugares)

#### 2.5 Corrigir dashboard/index.tsx

- Query param: `status=AGENDADO`

#### 2.6 Corrigir agenda/semanal.tsx

- Normalizar status antes de buscar cor

#### 2.7 Corrigir agenda/index.tsx

- Normalizar status

### FASE 3: Backend - Adicionar data_sessao em GET /fichas

```sql
SELECT
  f.*,
  aluno.nome as aluno_nome,
  instrutor.nome as instrutor_nome,
  sa.data as data_sessao,  -- ✅ ADICIONAR
  sa.data || ' ' || sa.hora_inicio as data_hora
FROM fichas_sessao f
...
```

---

## 📊 PRIORIDADES

1. ✅ **CRÍTICO** (2 horas): Types + Helpers + Dashboard
2. ✅ **ALTO** (1 hora): AgendaTab + Simuladores.tsx
3. ✅ **MÉDIO** (30 min): agenda/semanal + agenda/index
4. ✅ **BAIXO** (15 min): Backend data_sessao

**Total estimado**: 3h45min

---

**Criado**: 2025-12-02 00:10 BRT  
**Status**: Planejamento  
**Próximo passo**: Implementar correções

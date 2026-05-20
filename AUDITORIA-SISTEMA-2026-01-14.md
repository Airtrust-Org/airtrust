# Auditoria Completa do Sistema AirTrust

**Data:** 14 de Janeiro de 2026  
**Versão:** 3aff361a  
**Objetivo:** Identificar duplicações, otimizações e garantir escalabilidade

---

## 📊 Estatísticas Gerais

- **Backend Routes:** 21.355 linhas de código
- **Total de Endpoints:** 165+ endpoints mapeados
- **Arquivos de Routes:** 25 arquivos

---

## ✅ CORREÇÕES IMPLEMENTADAS

### 1. ❌ CRÍTICO: Endpoints Duplicados (sessoes vs agendamentos)

**Status:** ✅ RESOLVIDO

**Problema Encontrado:**

- `/api/simuladores/sessoes` - retornava TODAS as sessões
- `/api/simuladores/agendamentos` - retornava sessões filtradas por período
- Causava discrepância entre tela de Sessões e Calendário

**Solução Implementada:**

- Unificado para usar APENAS `/api/simuladores/sessoes`
- Adicionado parâmetros opcionais `data_inicio` e `data_fim`
- Calendário agora usa `/sessoes` com filtros
- Tela Sessões usa `/sessoes` sem filtros
- **Garantia:** Mesma query = mesmos dados = sem discrepâncias

**Arquivo Modificado:**

- `worker-airtrust/src/routes/simuladores.ts` (linhas 1438-1488)
- `src/react-app/pages/simuladores/agenda/CalendarioAgendamentos.tsx`

---

### 2. ❌ CRÍTICO: Endpoint de Validação de Certificados Incompleto

**Status:** ✅ RESOLVIDO

**Problema Encontrado:**

- Endpoint `/api/certificados/validar/:hash` não retornava dados do instrutor
- Frontend esperava `instrutor_nome` e `instrutor_codigo_anac`
- Tela de validação mostrava campos vazios

**Solução Implementada:**

- Adicionado LEFT JOIN com tabela `funcionarios` (alias `instrutor`)
- Incluído `instrutor.nome` e `instrutor.codigo_anac` no SELECT
- Adicionado campos no JSON de resposta

**Arquivo Modificado:**

- `worker-airtrust/src/routes/certificados/validacao.ts` (linhas 30-125)

---

## 🔍 OPORTUNIDADES DE OTIMIZAÇÃO IDENTIFICADAS

### 1. ⚠️ Endpoints de Debug/Admin em Produção

**Localização:** `worker-airtrust/src/routes/qualificacoes-certificados.ts`

**Endpoints Identificados:**

```typescript
/admin/debug-certificado-data/:historicoId     (linha 1766)
/admin/debug-template/:historicoId             (linha 1872)
/admin/debug-query/:historicoId                (linha 1952)
/debug/template/:id                            (linha 1220)
```

**Recomendação:**

- [ ] Mover para arquivo separado `debug-certificados.ts`
- [ ] Adicionar flag de ambiente `ENABLE_DEBUG_ENDPOINTS`
- [ ] Desabilitar em produção via variável de ambiente

---

### 2. ⚠️ Queries SQL sem Prepared Statements em Loops

**Localização:** Várias rotas de simuladores

**Exemplo Problemático:**

```typescript
// worker-airtrust/src/routes/simuladores.ts (linha ~1475)
for (const sessao of sessoes.results) {
  const participantes = await db.prepare(`SELECT ...`).bind(sessao.id).all();
  const fichas = await db.prepare(`SELECT ...`).bind(sessao.id).all();
}
```

**Problema:**

- N+1 queries (1 query principal + N queries adicionais)
- Performance degradada com muitos registros

**Recomendação:**

- [ ] Usar LEFT JOIN com GROUP_CONCAT ou JSON_GROUP_ARRAY
- [ ] Fazer 1 query única ao invés de múltiplas
- [ ] Reduzir round-trips ao banco

---

### 3. ⚠️ Limite LIMIT 100 sem Paginação

**Localização:** Múltiplos endpoints

**Exemplos:**

```typescript
/api/simuladores/sessoes        → LIMIT 100
/api/funcionarios               → Sem limit explícito
/certificados/validar/:hash     → LIMIT 1000 (!)
```

**Problema:**

- Pode retornar dados incompletos
- Usuário não sabe que há mais registros
- Performance ruim com muitos dados

**Recomendação:**

- [ ] Implementar paginação padrão (page, pageSize)
- [ ] Retornar metadata: `{ data: [], total: X, page: 1, pageSize: 100 }`
- [ ] Usar cursor-based pagination para melhor performance

---

### 4. ⚠️ Duplicação de Lógica de Cores

**Localização:** Componentes de simuladores

**Arquivos com Código Duplicado:**

```
src/react-app/pages/simuladores/agenda/CalendarioAgendamentos.tsx (linhas 58-95)
src/react-app/components/simuladores/SessaoCard.tsx (linhas 157-189)
```

**Código Duplicado:**

```typescript
const PALETTE_CORES = [ ... ];  // Mesma paleta em 2 arquivos
const MAPEAMENTO_CORES_EXPLICITO = { ... };  // Mesmo mapeamento
function getCorSimulador() { ... }  // Mesma função
```

**Recomendação:**

- [ ] Criar arquivo `src/react-app/utils/simulador-cores.ts`
- [ ] Exportar constantes e funções
- [ ] Importar nos componentes

**Exemplo de Implementação:**

```typescript
// src/react-app/utils/simulador-cores.ts
export const PALETTE_CORES = [ ... ];
export const MAPEAMENTO_CORES_EXPLICITO = { ... };
export function getCorSimulador(sessao: { simulador_tipo?: string, ... }) { ... }
```

---

### 5. ⚠️ Falta de Índices no Banco de Dados

**Localização:** Tabelas principais

**Queries Lentas Identificadas:**

```sql
-- Busca por deleted_at em todas as queries
WHERE deleted_at IS NULL

-- Busca por data em sessões
WHERE sa.data >= ? AND sa.data <= ?

-- Busca por funcionario_id em histórico
WHERE funcionario_id = ?
```

**Recomendação:**

- [ ] Criar índice: `CREATE INDEX idx_deleted_at ON qualificacoes_historico(deleted_at)`
- [ ] Criar índice: `CREATE INDEX idx_sessoes_data ON simulador_agendamentos(data)`
- [ ] Criar índice composto: `CREATE INDEX idx_hist_func_deleted ON qualificacoes_historico(funcionario_id, deleted_at)`

---

### 6. ⚠️ Falta de Tratamento de Erros Consistente

**Localização:** Várias rotas

**Problema:**

```typescript
// Alguns endpoints retornam:
{ success: false, error: "mensagem" }

// Outros retornam:
{ success: false, mensagem: "mensagem" }

// Outros apenas HTTP status code
```

**Recomendação:**

- [ ] Padronizar formato de erro:

```typescript
{
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    message: "Mensagem amigável",
    details: { ... } // Opcional
  }
}
```

---

### 7. ✅ Status de Labels no Feminino

**Status:** ✅ RESOLVIDO

**Mudanças Implementadas:**

- "Agendado" → "Agendada"
- "Concluído" → "Concluída"
- "Cancelado" → "Cancelada"
- "Agendados" → "Agendadas" (estatísticas)

**Arquivos Modificados:**

- `src/react-app/components/simuladores/SessaoCard.tsx`
- `src/react-app/pages/simuladores/agenda/CalendarioAgendamentos.tsx`

---

### 8. ✅ Mapeamento de Cores AW139

**Status:** ✅ RESOLVIDO

**Problema:** AW139 aparecia em rosa ao invés de verde

**Solução:**

- Adicionado mapeamento explícito: `AW139 → verde (emerald)`
- Aplicado em ambos componentes (Calendário e Card de Sessão)

---

## 📈 MÉTRICAS DE ESCALABILIDADE

### Endpoints por Categoria:

```
Simuladores:        85 endpoints
Qualificações:      22 endpoints
Certificados:       14 endpoints
Funcionários:       6 endpoints
Dashboard:          11 endpoints
Importação:         9 endpoints
Admin/Debug:        18+ endpoints
```

### Queries Pesadas Identificadas:

1. `/api/simuladores/sessoes` - múltiplos JOINs + subqueries em loop
2. `/api/certificados/validar/:hash` - itera 1000 certificados para validar hash
3. `/api/funcionarios` - sem paginação, pode crescer indefinidamente

---

## 🚀 PLANO DE AÇÃO PRIORITÁRIO

### Alta Prioridade (Fazer Agora):

- [x] ✅ Unificar endpoints sessoes/agendamentos
- [x] ✅ Corrigir validação de certificados (instrutor)
- [x] ✅ Labels femininos para sessões
- [x] ✅ Mapeamento de cores AW139

### Média Prioridade (Próximas Sprints):

- [ ] Consolidar lógica de cores em arquivo utils
- [ ] Adicionar índices no banco de dados
- [ ] Implementar paginação em endpoints principais
- [ ] Otimizar queries N+1 para JOINs únicos

### Baixa Prioridade (Backlog):

- [ ] Mover endpoints de debug para arquivo separado
- [ ] Padronizar formato de erros
- [ ] Adicionar cache em endpoints de leitura
- [ ] Implementar rate limiting

---

## 🔒 PREVENÇÃO DE BUGS FUTUROS

### Regras Estabelecidas:

1. **UM endpoint por funcionalidade** - evitar duplicações como sessoes/agendamentos
2. **Mesma query = mesmo endpoint** - se a query é igual, reutilizar endpoint
3. **Sempre incluir campos relacionados** - se frontend precisa, backend deve retornar
4. **Testes de integração** - validar que telas diferentes mostram dados idênticos

### Checklist para Novos Endpoints:

- [ ] Query inclui TODOS os campos necessários pelo frontend?
- [ ] LEFT JOIN para dados opcionais (não usar INNER JOIN)?
- [ ] Filtros são opcionais (via query params)?
- [ ] Retorna metadata de paginação?
- [ ] Tratamento de erro padronizado?
- [ ] Índices existem para WHERE clauses?

---

## 📝 CONCLUSÃO

O sistema está **funcionalmente correto** após as correções implementadas, mas há **oportunidades significativas de otimização** especialmente em:

- Redução de queries N+1
- Implementação de paginação
- Consolidação de código duplicado
- Melhoria de índices no banco

**Próximo passo recomendado:** Implementar paginação e otimizar queries N+1 para garantir escalabilidade a longo prazo.

---

**Auditado por:** GitHub Copilot  
**Data:** 14/01/2026  
**Versão do Sistema:** 3aff361a

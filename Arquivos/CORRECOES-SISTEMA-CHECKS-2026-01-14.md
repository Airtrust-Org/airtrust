# 🛠️ CORREÇÕES SISTEMA DE CHECKS - 14/01/2026

**Deploy:** d3a644de  
**Worker Version:** d6701ab9-f64f-44fe-ba45-189f4ce073be

---

## 🐛 PROBLEMA REPORTADO

Após completar todo o processo de uma ficha de check (escolher examinador, instrutor assinar e aprovar), a qualificação correspondente **NÃO estava sendo gerada** no histórico de qualificações.

---

## 🔍 DIAGNÓSTICO

### Problema 1: ID da Sessão Incorreto no Frontend

O frontend estava usando o `id` da **ficha** ao invés do `id` da **sessão** para:

- Carregar checks: `GET /simuladores/sessoes/:id/checks`
- Salvar resultados: `POST /simuladores/sessoes/:id/checks/resultados`

**Impacto:** Endpoints retornavam 404 ou dados incorretos.

### Problema 2: Nome de Coluna Incorreto no Backend

O código de geração de qualificações estava tentando inserir em `qualificacao_tipo_id`, mas a tabela `qualificacoes_historico` usa **`qualificacao_id`**.

```typescript
// ❌ CÓDIGO ANTIGO (ERRADO)
if (qhColSet.has('qualificacao_tipo_id')) {
  cols.push('qualificacao_tipo_id');
  vals.push('?');
  binds.push(qualificacaoTipoId);
}

// ✅ CÓDIGO NOVO (CORRETO)
if (qhColSet.has('qualificacao_id')) {
  cols.push('qualificacao_id');
  vals.push('?');
  binds.push(qualificacaoTipoId);
} else if (qhColSet.has('qualificacao_tipo_id')) {
  cols.push('qualificacao_tipo_id');
  vals.push('?');
  binds.push(qualificacaoTipoId);
}
```

**Impacto:** A qualificação era criada SEM o `qualificacao_id`, tornando-a inválida/inútil.

---

## ✅ CORREÇÕES APLICADAS

### 1. Backend - Retornar `sessao_id` na Ficha

**Arquivo:** `worker-airtrust/src/routes/simuladores.ts`

```typescript
// GET /api/simuladores/fichas/:id

// SELECT com agendamento_slot_id
const f = await c.env.DB.prepare(`SELECT
  fs.id,
  fs.uuid,
  fs.agendamento_slot_id,  // ← ADICIONADO
  ...
`);

// Response incluindo sessao_id
return c.json({
  success: true,
  data: {
    id: f.id,
    sessao_id: f.agendamento_slot_id || null,  // ← ADICIONADO
    is_check: f.is_check || 0,
    examinador_nome: f.examinador_nome || null,
    ...
  }
});
```

### 2. Frontend - Usar `sessao_id` ao Invés de `id` da Ficha

**Arquivo:** `src/react-app/pages/simuladores/fichas/[id]/index.tsx`

```typescript
// Interface atualizada
interface FichaDetalhada {
  id: number;
  sessao_id?: number | null;  // ← ADICIONADO
  is_check?: number;
  examinador_nome?: string | null;
  ...
}

// Carregar checks com sessao_id correto
const carregarChecks = async (sessaoId: number) => {
  if (!sessaoId) return;
  const response = await fetch(
    `${API_BASE_URL}/simuladores/sessoes/${sessaoId}/checks`  // ← CORRETO
  );
  ...
};

// Salvar resultados com sessao_id correto
if (!ficha?.sessao_id) {
  toast.error('ID da sessão não encontrado');
  return;
}

const responseChecks = await fetch(
  `${API_BASE_URL}/simuladores/sessoes/${ficha.sessao_id}/checks/resultados`,  // ← CORRETO
  {
    method: 'POST',
    body: JSON.stringify({ resultados }),
  }
);
```

### 3. Backend - Usar `qualificacao_id` Corretamente

**Arquivo:** `worker-airtrust/src/routes/simuladores.ts`

```typescript
// POST /api/simuladores/sessoes/:id/checks/resultados

// Verificar e usar o nome correto da coluna
if (qhColSet.has('qualificacao_id')) {
  cols.push('qualificacao_id');
  vals.push('?');
  binds.push(qualificacaoTipoId);
} else if (qhColSet.has('qualificacao_tipo_id')) {
  cols.push('qualificacao_tipo_id');
  vals.push('?');
  binds.push(qualificacaoTipoId);
}

// Adicionar tipo_check_id para rastreabilidade
if (qhColSet.has('tipo_check_id')) {
  cols.push('tipo_check_id');
  vals.push('?');
  binds.push(sessao_check_id);
}
```

### 4. Backend - Corrigir Query de Duplicados

```typescript
// Usar nome correto da coluna dinamicamente
const colQualificacao = qhColSet.has('qualificacao_id')
  ? 'qualificacao_id'
  : 'qualificacao_tipo_id';

const dup = await c.env.DB.prepare(
  `
  SELECT id FROM qualificacoes_historico
  WHERE sessao_id = ?
    AND ${colQualificacao} = ?
    AND ${hasFuncionarioCpf ? 'funcionario_cpf' : 'cpf'} = ?
    AND deleted_at IS NULL
  LIMIT 1
`,
)
  .bind(sessao_id, qualificacaoTipoId, alunoCpf)
  .first();
```

---

## 🧪 VALIDAÇÃO

### Estrutura da Tabela `qualificacoes_historico`

```sql
-- Campos relevantes:
- id (INTEGER, PK)
- funcionario_cpf (TEXT)
- qualificacao_id (INTEGER)  ← CAMPO CORRETO
- tipo_check_id (INTEGER)    ← RASTREABILIDADE
- sessao_id (INTEGER)         ← RASTREABILIDADE
- data_conclusao (TEXT)
- data_vencimento (TEXT)
- status (TEXT)
- observacoes (TEXT)
```

### Teste Manual

```bash
# 1. Verificar endpoint de ficha retorna sessao_id
curl -s "https://airtrust-api-production.airtrust.workers.dev/api/simuladores/fichas/58" \
  | jq '{id, sessao_id, is_check, examinador_nome}'
# Esperado: { id: 58, sessao_id: 29, is_check: 1, examinador_nome: "..." }

# 2. Verificar checks da sessão
curl -s "https://airtrust-api-production.airtrust.workers.dev/api/simuladores/sessoes/29/checks"
# Esperado: Lista de checks vinculados

# 3. Após assinar e aprovar no frontend, verificar qualificação gerada
npx wrangler d1 execute airtrust-db --remote --command="
  SELECT id, funcionario_cpf, qualificacao_id, tipo_check_id, sessao_id,
         data_conclusao, data_vencimento, status
  FROM qualificacoes_historico
  WHERE sessao_id = 29 AND deleted_at IS NULL
"
# Esperado: 1 registro com qualificacao_id preenchido
```

---

## 📊 RESUMO DAS MUDANÇAS

| Arquivo                                                 | Linha | Mudança                                                   |
| ------------------------------------------------------- | ----- | --------------------------------------------------------- |
| `worker-airtrust/src/routes/simuladores.ts`             | ~2270 | Adicionar `fs.agendamento_slot_id` no SELECT              |
| `worker-airtrust/src/routes/simuladores.ts`             | ~2522 | Retornar `sessao_id: f.agendamento_slot_id`               |
| `src/react-app/pages/simuladores/fichas/[id]/index.tsx` | ~62   | Adicionar `sessao_id?: number` na interface               |
| `src/react-app/pages/simuladores/fichas/[id]/index.tsx` | ~152  | Passar `sessaoId` como parâmetro                          |
| `src/react-app/pages/simuladores/fichas/[id]/index.tsx` | ~285  | Usar `ficha.sessao_id` ao invés de `id`                   |
| `worker-airtrust/src/routes/simuladores.ts`             | ~3923 | Usar `qualificacao_id` ao invés de `qualificacao_tipo_id` |
| `worker-airtrust/src/routes/simuladores.ts`             | ~3930 | Adicionar `tipo_check_id` no INSERT                       |
| `worker-airtrust/src/routes/simuladores.ts`             | ~3890 | Corrigir query de duplicados com coluna dinâmica          |

---

## 🎯 RESULTADO ESPERADO

Agora, ao completar o fluxo de check:

1. ✅ Frontend carrega checks da sessão corretamente
2. ✅ Instrutor avalia aprovado/reprovado para cada check
3. ✅ Backend salva resultados em `sessoes_checks_resultados`
4. ✅ **Backend gera qualificação em `qualificacoes_historico` com:**
   - `qualificacao_id` (ID do tipo de qualificação)
   - `tipo_check_id` (ID do sessao_check para rastreabilidade)
   - `sessao_id` (ID da sessão para rastreabilidade)
   - `funcionario_cpf` (CPF do aluno)
   - `data_conclusao` (data da sessão)
   - `data_vencimento` (data + validade em meses)
   - `status` = 'CONCLUIDA'
   - `observacoes` (do check, se houver)

---

## 📝 PRÓXIMAS AÇÕES

### P0 - CRÍTICO

- [ ] Testar fluxo completo end-to-end em produção
- [ ] Verificar qualificação sendo gerada corretamente
- [ ] Validar que não há duplicação de qualificações

### P1 - IMPORTANTE

- [ ] Documentar processo completo de check no manual do usuário
- [ ] Criar testes automatizados para o fluxo de checks
- [ ] Adicionar logs mais detalhados no backend

---

**Status:** ✅ CORREÇÕES APLICADAS E DEPLOYADAS  
**Versão:** d3a644de  
**Data:** 14/01/2026 14:07:38

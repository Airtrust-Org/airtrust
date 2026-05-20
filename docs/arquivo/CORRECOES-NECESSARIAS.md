# 🔧 CORREÇÕES NECESSÁRIAS - GUIA PASSO A PASSO

**Data:** 2025-11-03  
**Objetivo:** Corrigir os 3 problemas críticos identificados  
**Tempo estimado:** 30-40 minutos  
**Resultado esperado:** Sistema totalmente funcional

---

## 🚨 PROBLEMA 1: API Response Format Mismatch

### Arquivo a editar: `src/worker/routes/qualificacoes.ts`

**Problema:** GET `/qualificacoes` retorna `{ data }` mas frontend espera `{ success, data, stats, totalPages }`

**Solução:**

**ANTES (Linha 39-40):**

```typescript
const result = await(c.env.DB as any)
  .prepare(query)
  .bind(...params)
  .all();
return c.json({ data: result.results || [] });
```

**DEPOIS:**

```typescript
const result = await(c.env.DB as any)
  .prepare(query)
  .bind(...params)
  .all();
const qualificacoes = result.results || [];

// Calcular stats
const stats = {
  total: qualificacoes.length,
  validas: 0,
  vencendo: 0,
  vencidas: 0,
  renovadas: 0,
};

return c.json({
  success: true,
  data: qualificacoes,
  stats,
  totalPages: 1,
  page: 1,
});
```

---

## 🚨 PROBLEMA 2: Frontend Strings - Texto Antigo

### Arquivo a editar: `src/react-app/pages/Qualificacoes.tsx`

**Problema:** Página mostra "Nenhum tipo cadastrado" (nomenclatura antiga)

**Localização:** Linha ~1178

**ANTES:**

```typescript
) : tipos.length === 0 ? (
  <div className="text-center py-12 text-gray-500">Nenhum tipo cadastrado</div>
```

**DEPOIS:**

```typescript
) : tipos.length === 0 ? (
  <div className="text-center py-12 text-gray-500">Nenhuma qualificação cadastrada</div>
```

---

**Problema 2B:** Ao lado "Tipos de Qualificações"

**Localização:** Linha ~800 (header da aba)

**ANTES:**

```typescript
onClick={() => setAbaAtiva('tipos')}
className={...}
>Tipos de Qualificações</button>
```

**DEPOIS:**

```typescript
onClick={() => setAbaAtiva('tipos')}
className={...}
>Gerenciar Qualificações</button>
```

---

## 🚨 PROBLEMA 3: Qualificacao_id NULL

### Arquivo a editar/criar: `migrations/2019_fix_qualificacao_id_null.sql`

**Problema:** Campo `qualificacao_id` está NULL em todas as habilitações

**Diagnóstico necessário primeiro:**

```bash
wrangler d1 execute airtrust-db --remote --command "
SELECT DISTINCT tipo, COUNT(*)
FROM habilitacoes
GROUP BY tipo;"
```

**Se retornar:**

- TREINAMENTO: 200
- EXAME: 500
- etc.

**Então a solução é:** Copiar qualificações correspondentes para habilitações

**Migração:**

```sql
-- 2019_fix_qualificacao_id_null.sql
-- Associar habilitações com qualificações baseado no nome

BEGIN TRANSACTION;

-- Atualizar habilitações com qualificacao_id correspondente
UPDATE habilitacoes h
SET qualificacao_id = (
  SELECT id FROM qualificacoes q
  WHERE q.nome = h.nome
  LIMIT 1
)
WHERE h.qualificacao_id IS NULL
  AND h.tipo = 'TREINAMENTO';

-- Fazer o mesmo para outros tipos
UPDATE habilitacoes h
SET qualificacao_id = (
  SELECT id FROM qualificacoes q
  WHERE q.codigo = h.codigo
  LIMIT 1
)
WHERE h.qualificacao_id IS NULL
  AND h.tipo = 'EXAME';

-- Verificar quantos ficaram NULL ainda
SELECT COUNT(*) as ainda_null FROM habilitacoes WHERE qualificacao_id IS NULL;

-- Se ainda houver NULLs, atribuir à qualificação genérica ou deixar em branco conforme política
-- Por enquanto, deixar como está se não conseguir encontrar match

COMMIT;
```

---

## 📋 CHECKLIST DE EXECUÇÃO

### Passo 1: Entender o problema

- [ ] Ler `DIAGNOSE-FALSO-POSITIVO.md`
- [ ] Ler `STATUS-REAL-SISTEMA.md`

### Passo 2: Fazer as correções

- [ ] Abrir `src/worker/routes/qualificacoes.ts`
- [ ] Atualizar endpoint GET `/` para retornar novo formato
- [ ] Salvar arquivo

- [ ] Abrir `src/react-app/pages/Qualificacoes.tsx`
- [ ] Atualizar string "Nenhum tipo cadastrado" → "Nenhuma qualificação cadastrada"
- [ ] Atualizar botão/aba "Tipos de Qualificações" → "Gerenciar Qualificações"
- [ ] Salvar arquivo

- [ ] Criar arquivo `migrations/2019_fix_qualificacao_id_null.sql`
- [ ] Adicionar conteúdo da migração
- [ ] Salvar arquivo

### Passo 3: Build local

- [ ] Executar `npm run build`
- [ ] Confirmar que compila sem erros críticos

### Passo 4: Deploy

- [ ] Executar `wrangler deploy`
- [ ] Confirmar que faz deploy com sucesso

### Passo 5: Aplicar migração

- [ ] Executar `wrangler d1 migrations apply airtrust-db --remote`
- [ ] Confirmar que migração foi aplicada

### Passo 6: Teste no navegador

- [ ] Abrir `https://[production-url]/qualificacoes`
- [ ] Abrir DevTools (F12)
- [ ] Ir à aba "Network"
- [ ] Dar refresh na página
- [ ] Procurar request para `/api/v2/qualificacoes`
- [ ] Ver resposta - deve ter `{ success: true, data: [...], stats, totalPages }`
- [ ] Conferir se tabela mostra dados
- [ ] Conferir strings da página

### Passo 7: Validação

- [ ] [ ] Página mostra "Gerenciar Qualificações"
- [ ] [ ] Tabela não está vazia
- [ ] [ ] Pode ver os 47 registros
- [ ] [ ] Strings não dizem "Tipos de"
- [ ] [ ] Pagination funciona
- [ ] [ ] Pode clicar em registros

---

## 🎯 COMANDOS EXATOS

### Build

```bash
npm run build
```

### Deploy

```bash
wrangler deploy
```

### Aplicar migração

```bash
wrangler d1 migrations apply airtrust-db --remote
```

### Verificar qualificacao_id

```bash
wrangler d1 execute airtrust-db --remote --command "
SELECT COUNT(*) as total_null_qualificacao_id
FROM habilitacoes
WHERE qualificacao_id IS NULL;"
```

### Teste do endpoint (depois de deploy)

```bash
curl -s "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes?page=1&limit=2" | jq '.'
```

**Resposta esperada:**

```json
{
  "success": true,
  "data": [...array com 2 items...],
  "stats": {
    "total": 47,
    "validas": 0,
    "vencendo": 0,
    "vencidas": 0,
    "renovadas": 0
  },
  "totalPages": 24,
  "page": 1
}
```

---

## ⚠️ POSSÍVEIS PROBLEMAS

### Se página ainda mostra vazio após correções:

1. **Cache do navegador**

   - Fazer Hard Refresh: `Cmd+Shift+R` (Mac) ou `Ctrl+Shift+R` (Windows)

2. **Deploy não foi aplicado**

   - Verificar: `wrangler tail` para ver logs
   - Redeploy se necessário

3. **Migração não aplicada**

   - Verificar: `SELECT * FROM d1_migrations;`
   - Aplicar novamente se necessário

4. **Formato ainda está errado**
   - Verificar: `curl` do endpoint
   - Conferir `jq` para ver estrutura
   - Adicionar logs no endpoint se necessário

---

## ✅ CONFIRMAÇÃO DE SUCESSO

Quando tudo estiver funcionando:

```bash
# 1. Endpoint retorna novo formato
curl "https://.../api/v2/qualificacoes" | jq '.success'
# Deve retornar: true

# 2. Banco tem dados
wrangler d1 execute airtrust-db --remote --command "SELECT COUNT(*) FROM qualificacoes;"
# Deve retornar: 47

# 3. Página mostra dados (teste no navegador)
# Deve ver tabela com 47 linhas
```

---

**Próximo passo:** Começar com Passo 1 do checklist acima! 🚀

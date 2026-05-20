# 🔧 CHECKLIST DE VERIFICAÇÃO TÉCNICA - HABILITAÇÕES

**Data:** 4 de Novembro de 2025  
**Objetivo:** Verificação sistemática de cada descoberta da auditoria

---

## ✅ VERIFICAÇÕES POR CATEGORIA

### 1️⃣ INCOMPATIBILIDADES DE NOMES

#### Check #1: qualificacaoId vs habilitacao_id

```bash
# Procurar por qualificacaoId
grep -rn "qualificacaoId" src/react-app/components/modals/ModalUploadCertificado.tsx
# Expected: 5-10 menções (prop, interface, etc)
# Status: ANTES DA FIX = ⚠️ CONFUSO | DEPOIS = ✅ OK

# Procurar por habilitacaoId
grep -rn "habilitacaoId" src/react-app/
# Expected: Após fix = 10+ menções
```

**Status:** [ ] Verificado

---

#### Check #2: Status em 3 formatos

```bash
# Procurar VÁLIDO/VENCENDO/VENCIDA
grep -rn "VÁLIDO\|VENCENDO\|VENCIDA" src/worker/
# Expected: 5+ menções em queries

# Procurar ATIVA/VENCIDA/SUSPENSA
grep -rn "ATIVA\|SUSPENSA" src/worker/types/
# Expected: Em types/qualificacoes.ts

# Procurar APROVADO/REPROVADO/PENDENTE
grep -rn "APROVADO\|REPROVADO\|PENDENTE" src/worker/dtos/
# Expected: Em DTOs

# Verificar são valores diferentes
echo "VÁLIDO vs ATIVA vs APROVADO"
# Expected: 3 enums diferentes - NÃO DEVERIA!
```

**Status:** [ ] Verificado | [ ] Padronizado

---

### 2️⃣ ENDPOINTS E ROTAS

#### Check #3: Rotas registradas

```bash
# Verificar importação
grep -n "habilitacoesRoutes" src/worker/routes/index.ts
# Expected: Linha 36 (import) e linha 257 (app.route)

# Verificar função retorna router
grep -n "export function habilitacoesRoutes" src/worker/routes/habilitacoes.ts
# Expected: Linha 4-5

# Verificar endpoints definidos
grep -n "router\\.get\|router\\.post\|router\\.put\|router\\.delete" src/worker/routes/habilitacoes.ts | wc -l
# Expected: 8+ rotas
```

**Status:** [ ] Verificado

---

#### Check #4: Rota /stats vs :id

```bash
# Verificar ordem em habilitacoes.ts
grep -n "router\\.get" src/worker/routes/habilitacoes.ts | head -5
# Expected: /stats ANTES de /:id (ou será catch-all)

# Testar GET /stats
curl -s http://localhost:8787/api/v2/habilitacoes/stats | jq .
# Expected: { success: true, data: { total: X, validas: X, ... } }

# Testar GET /1 (não deve retornar stats)
curl -s http://localhost:8787/api/v2/habilitacoes/1 | jq .
# Expected: { success: true, data: { id: 1, ... } } OU 404
```

**Status:** [ ] Verificado | [ ] Testado

---

#### Check #5: Duplicatas de rotas

```bash
# Procurar duplicatas de GET /
grep -c "router\\.get.*'/'," src/worker/routes/habilitacoes.ts
# Expected: 1

# Procurar duplicatas de POST /
grep -c "router\\.post.*'/'," src/worker/routes/habilitacoes.ts
# Expected: 1

# Procurar habilitacoesFilters importado
grep -n "habilitacoesFilters" src/worker/routes/index.ts
# Expected: 0 (não importado)
```

**Status:** [ ] Verificado

---

### 3️⃣ BANCO DE DADOS

#### Check #6: Colunas do banco

```bash
# Verificar quais colunas existem (via query D1)
# Testar em test/dev:
D1 SQL: PRAGMA table_info(habilitacoes);

# Colunas que devem existir:
# id, funcionario_id, qualificacao_id, data_conclusao, data_vencimento,
# resultado, observacoes, certificado_url, timezone, eh_renovada,
# renovada_em, habilitacao_anterior_id, created_at, updated_at, deleted_at
```

**Status:** [ ] Verificado

---

#### Check #7: Colunas em DTOs

```bash
# Ler DTOs
cat src/worker/dtos/habilitacoes.ts | grep -A 20 "CreateHabilitacaoDTO"

# Verificar que menciona:
# - funcionario_id ✓
# - qualificacao_id ✓
# - data_conclusao ✓
# - data_vencimento ✓
# - resultado ✓
# - FALTA: timezone ✗
# - FALTA: eh_renovada ✗
# - FALTA: renovada_em ✗
# - FALTA: habilitacao_anterior_id ✗
```

**Status:** [ ] Verificado | [ ] Corrigido

---

#### Check #8: Soft delete verificado

```bash
# Verificar que queries usam deleted_at IS NULL
grep -c "deleted_at IS NULL" src/worker/services/habilitacoesService.ts
# Expected: 5+ menções

# Verificar que DELETE usa soft delete
grep -A 3 "async deletar" src/worker/services/habilitacoesService.ts | grep -c "UPDATE.*deleted_at"
# Expected: 1
```

**Status:** [ ] Verificado

---

#### Check #9: Índices no banco

```bash
# Verificar se índices existem:
D1 SQL: SELECT name FROM sqlite_master WHERE type='index'
        AND tbl_name='habilitacoes';

# Esperado:
# - idx_habilitacoes_deleted_at (ou similar)
# - idx_habilitacoes_funcionario_id (ou similar)
# - idx_habilitacoes_qualificacao_id (ou similar)

# Se não existem, criar:
D1 SQL: CREATE INDEX idx_habilitacoes_deleted_at
        ON habilitacoes(deleted_at);
```

**Status:** [ ] Verificado | [ ] Criado

---

### 4️⃣ SCHEMAS E TIPOS

#### Check #10: Interfaces Habilitacao

```bash
# Contar quantas interface Habilitacao existem
grep -r "^export interface Habilitacao" src/
# Expected: Antes = 3 | Depois = 1

# Listar locais
grep -rn "^export interface Habilitacao" src/
# Expected:
# src/worker/types/index.ts (MANTER)
# src/worker/types/qualificacoes.ts (REMOVER - usar export de index.ts)
# src/react-app/hooks/useHabilitacoes.ts (REMOVER - usar de types/index)
```

**Status:** [ ] Verificado | [ ] Consolidado

---

#### Check #11: DTOs duplicados

```bash
# Procurar CreateHabilitacaoDTO
grep -rn "^export.*CreateHabilitacaoDTO" src/worker/
# Expected: Antes = 2 | Depois = 1

# Listar
# src/worker/dtos/habilitacoes.ts (MANTER)
# src/worker/schemas/habilitacaoSchemas.ts (REMOVER OU unificar)
```

**Status:** [ ] Verificado | [ ] Unificado

---

#### Check #12: Enums status

```bash
# Procurar por z.enum com status
grep -rn "z\\.enum.*status\\|z\\.enum.*VÁLIDO\\|z\\.enum.*APROVADO" src/worker/
# Expected: Após fix = 1 enum consistente

# Verificar tipos importados corretamente
grep -n "enum.*Status\\|enum.*Resultado" src/worker/types/
# Expected: Definições centralizadas
```

**Status:** [ ] Verificado | [ ] Padronizado

---

### 5️⃣ COMUNICAÇÃO E FLUXO

#### Check #13: Flow data transformation

```typescript
// Testar que dados fluem corretamente:
// 1. Frontend envia: { funcionario_id, qualificacao_id, data_vencimento }
// 2. Backend valida com DTO
// 3. Service recebe dados validados
// 4. Query insere no DB
// 5. Service retorna com ID
// 6. Frontend exibe

// Verificar em habilitacoesService.ts criar():
grep -A 20 "async criar" src/worker/services/habilitacoesService.ts | grep -E "INSERT|VALIDATION|return"
# Expected: Validação → INSERT → return
```

**Status:** [ ] Verificado | [ ] Testado

---

#### Check #14: Timezone returned

```bash
# Verificar que timezone é retornado em SELECT
grep -n "SELECT" src/worker/services/habilitacoesService.ts | head -1
# Expected: Deve mencionar timezone

# Se não menciona, adicionar em SELECT:
# h.timezone,
```

**Status:** [ ] Verificado | [ ] Corrigido

---

#### Check #15: Renovações via endpoint

```bash
# Verificar endpoint de renovações
grep -n "renovacoes" src/worker/routes/habilitacoes.ts
# Expected: 1 rota GET /:funcionarioId/:qualificacaoId/renovacoes

# Testar endpoint
curl -s http://localhost:8787/api/v2/habilitacoes/1/1/renovacoes | jq .
# Expected: { success: true, data: [...] }
```

**Status:** [ ] Verificado | [ ] Testado

---

### 6️⃣ DUPLICIDADE

#### Check #16: Services duplicados

```bash
# Contar services
ls -la src/worker/services/habilitacoes*.ts
# Expected: Antes = 2 | Depois = 1

# Verificar qual é usado
grep -rn "HabilitacoesService[^F]" src/worker/routes/
# Expected: Apenas "HabilitacoesService" (sem Fixed)

# Verificar que Fixed não é importado
grep -rn "HabilitacoesServiceFixed" src/worker/routes/
# Expected: 0 resultados
```

**Status:** [ ] Verificado | [ ] Deletado

---

#### Check #17: Testes órfãos

```bash
# Verificar testes do service deletado
ls src/worker/services/__tests__/habilitacoes*.test.ts
# Expected: Antes = 2 | Depois = 1

# Apenas um deve existir:
# src/worker/services/__tests__/habilitacoesServiceFixed.test.ts ← DELETAR
```

**Status:** [ ] Verificado | [ ] Deletado

---

#### Check #18: Componentes upload

```bash
# Listar componentes de upload
find src/react-app -name "*Upload*" -o -name "*Certificado*" | grep -i upload
# Expected: Antes = 3+ | Depois = 1

# Arquivos encontrados:
# - ModalUploadCertificado.tsx (MANTER)
# - CertificadoUpload.tsx (DELETAR)
# - certificados/UploadCertificado.tsx (DELETAR)
```

**Status:** [ ] Verificado | [ ] Deletado

---

### 7️⃣ OPERAÇÕES CRUD

#### Check #19: CREATE valida

```bash
# Testar POST /habilitacoes
curl -X POST http://localhost:8787/api/v2/habilitacoes \
  -H "Content-Type: application/json" \
  -d '{
    "funcionario_id": 1,
    "qualificacao_id": 1,
    "data_conclusao": "2025-01-01",
    "data_vencimento": "2026-01-01"
  }'

# Expected: 201 { success: true, data: { id: X, ... } }
```

**Status:** [ ] Verificado

---

#### Check #20: CREATE marca anterior

```bash
# Testar se anterior é marcada como renovada:
D1 SQL: SELECT id, eh_renovada FROM habilitacoes
        WHERE funcionario_id = 1 AND qualificacao_id = 1
        ORDER BY created_at DESC LIMIT 2;

# Expected:
# id: 2, eh_renovada: false (nova)
# id: 1, eh_renovada: true  (anterior)
```

**Status:** [ ] Verificado

---

#### Check #21: READ retorna status computado

```bash
# Testar GET /habilitacoes
curl -s http://localhost:8787/api/v2/habilitacoes?limit=1 | jq '.data[0]'

# Expected: { ..., status: "VÁLIDO" ou "VENCENDO" ou "VENCIDA", ... }
```

**Status:** [ ] Verificado

---

#### Check #22: UPDATE completo

```bash
# Testar PUT /habilitacoes/1
curl -X PUT http://localhost:8787/api/v2/habilitacoes/1 \
  -H "Content-Type: application/json" \
  -d '{
    "data_vencimento": "2027-01-01",
    "observacoes": "Atualizado"
  }'

# Expected: 200 { success: true, data: { id: 1, ... } }

# Verificar no banco
D1 SQL: SELECT updated_at FROM habilitacoes WHERE id = 1;
# Expected: updated_at deve ser agora
```

**Status:** [ ] Verificado

---

#### Check #23: DELETE soft

```bash
# Testar DELETE /habilitacoes/1
curl -X DELETE http://localhost:8787/api/v2/habilitacoes/1

# Expected: 200 { success: true, data: { id: 1, deletado: true } }

# Verificar no banco
D1 SQL: SELECT deleted_at FROM habilitacoes WHERE id = 1;
# Expected: deleted_at != NULL

# Verificar que não aparece mais em listagem
curl -s http://localhost:8787/api/v2/habilitacoes | jq '.data[] | select(.id==1)'
# Expected: (vazio - não encontrado)
```

**Status:** [ ] Verificado

---

### 8️⃣ ERROS HTTP

#### Check #24: 400 detalhado

```bash
# Testar POST /habilitacoes sem campos obrigatórios
curl -X POST http://localhost:8787/api/v2/habilitacoes \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected ANTES: 400 { success: false, error: "Campos obrigatórios: ..." }
# Expected DEPOIS: 400 { success: false, error: "...", details: { funcionario_id: "Obrigatório", ... } }
```

**Status:** [ ] Verificado | [ ] Melhorado

---

#### Check #25: 404 preciso

```bash
# Testar PUT /habilitacoes/999999
curl -X PUT http://localhost:8787/api/v2/habilitacoes/999999 \
  -H "Content-Type: application/json" \
  -d '{ "observacoes": "teste" }'

# Expected: 404 { success: false, error: "Habilitação não encontrada" }
```

**Status:** [ ] Verificado

---

#### Check #26: Diferença 404 vs 500

```bash
# Testar quando DB falha
# (parar DB ou simular erro)

# Expected ANTES: 500 genérico
# Expected DEPOIS: Diferenciar DB unavailable (503) vs not found (404)
```

**Status:** [ ] Verificado | [ ] Melhorado

---

### 9️⃣ CAMPOS ESPECÍFICOS

#### Check #27: eh_renovada funciona

```bash
# Criar duas habilitações para mesmo funcionário/qualificação
# 1. POST primeira
# 2. POST segunda
# 3. Verificar eh_renovada

D1 SQL: SELECT id, eh_renovada, renovada_em FROM habilitacoes
        WHERE funcionario_id = 1 AND qualificacao_id = 1
        ORDER BY created_at;

# Expected:
# Primeira: eh_renovada = 0 (false)
# Segunda: eh_renovada = 1 (true), renovada_em = NOW()
```

**Status:** [ ] Verificado

---

#### Check #28: certificado_url

```bash
# Verificar que PUT pode atualizar certificado_url
curl -X PUT http://localhost:8787/api/v2/habilitacoes/1 \
  -H "Content-Type: application/json" \
  -d '{ "certificado_url": "https://example.com/cert.pdf" }'

# Expected ANTES: Erro ou silent ignore
# Expected DEPOIS: 200 OK, certificado_url atualizado
```

**Status:** [ ] Verificado | [ ] Corrigido

---

#### Check #29: timezone armazenado

```bash
# Verificar que timezone é armazenado e retornado
curl -X POST http://localhost:8787/api/v2/habilitacoes \
  -H "Content-Type: application/json" \
  -d '{
    "funcionario_id": 1,
    "qualificacao_id": 1,
    "data_conclusao": "2025-01-01",
    "data_vencimento": "2026-01-01",
    "timezone": "America/Sao_Paulo"
  }'

# Expected: 201, timezone = "America/Sao_Paulo"

curl -s http://localhost:8787/api/v2/habilitacoes/1 | jq '.data[0].timezone'
# Expected: "America/Sao_Paulo"
```

**Status:** [ ] Verificado | [ ] Corrigido

---

### 🔟 PERFORMANCE

#### Check #30: Índices criados

```bash
D1 SQL: SELECT name, sql FROM sqlite_master
        WHERE type='index' AND tbl_name='habilitacoes'
        ORDER BY name;

# Esperados:
# idx_habilitacoes_deleted_at
# idx_habilitacoes_funcionario_id
# idx_habilitacoes_qualificacao_id
# idx_habilitacoes_data_vencimento (opcional)
```

**Status:** [ ] Verificado | [ ] Criados

---

#### Check #31: Query performance

```bash
# Medir tempo de query
time D1 SQL: SELECT h.*, f.nome, q.nome
             FROM habilitacoes h
             LEFT JOIN funcionarios f ON f.id = h.funcionario_id
             LEFT JOIN qualificacoes q ON q.id = h.qualificacao_id
             WHERE h.deleted_at IS NULL
             LIMIT 100;

# Expected: < 100ms com índices
```

**Status:** [ ] Verificado

---

#### Check #32: N+1 queries

```bash
# Monitorar network requests ao listar habilitações
# No DevTools → Network → XHR

# Expected ANTES:
# 1x GET /api/v2/habilitacoes (retorna 100)
# 100x GET /api/v2/habilitacoes/:id/renovacoes (N+1 ✗)

# Expected DEPOIS:
# 1x GET /api/v2/habilitacoes (include=renovacoes)
# 0x requests adicionais (✓)
```

**Status:** [ ] Verificado

---

## 📝 SUMMARY CHECKLIST

```
INCOMPATIBILIDADES DE NOMES
- [ ] qualificacaoId vs habilitacao_id
- [ ] Status em 3 formatos
- [ ] tipos_qualificacoes vs qualificacoes

ENDPOINTS E ROTAS
- [ ] Rotas registradas corretamente
- [ ] /stats não conflita com :id
- [ ] Sem duplicatas de rotas
- [ ] habilitacoesFilters deletado

BANCO DE DADOS
- [ ] Colunas verificadas
- [ ] Soft delete funcionando
- [ ] Índices criados
- [ ] Constraint FKs OK

SCHEMAS E TIPOS
- [ ] Interface unificada
- [ ] DTOs consolidados
- [ ] Enums padronizados
- [ ] Sem duplicatas

COMUNICAÇÃO E FLUXO
- [ ] Data flow completo
- [ ] Timezone retornado
- [ ] Renovações acessíveis
- [ ] Erros claros

DUPLICIDADE
- [ ] Services: apenas 1
- [ ] Upload components: apenas 1
- [ ] Filtros deletados
- [ ] Testes órfãos deletados

OPERAÇÕES CRUD
- [ ] CREATE funciona
- [ ] READ retorna dados corretos
- [ ] UPDATE persiste
- [ ] DELETE soft-deleta

ERROS HTTP
- [ ] 400 detalhado
- [ ] 404 preciso
- [ ] 500 diferenciado
- [ ] Sem silent failures

CAMPOS ESPECÍFICOS
- [ ] eh_renovada funciona
- [ ] certificado_url atualiza
- [ ] timezone armazenado
- [ ] status calculado corretamente

PERFORMANCE
- [ ] Índices criados
- [ ] Queries rápidas
- [ ] Sem N+1 queries
- [ ] LIMIT/OFFSET OK
```

---

**Total de Checks:** 32  
**Tempo Estimado:** 4-6 horas (testing completo)

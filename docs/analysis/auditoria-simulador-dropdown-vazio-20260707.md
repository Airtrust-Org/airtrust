# Auditoria Read-Only: Dropdown de Simulador Vazio ao Selecionar AW139

**Data**: 2026-07-07  
**Escopo**: Produção, empresa 6, somente SELECTs  
**Status**: NO-GO para implementação — auditoria concluída  

---

## Tarefa 1 — SELECT aeronaves (tabela `aeronaves`)

```sql
SELECT id, codigo, modelo, fabricante, empresa_id, status, deleted_at
FROM aeronaves
WHERE empresa_id = 6
  AND (modelo LIKE '%AW139%' OR modelo LIKE '%SK76%' OR modelo LIKE '%S76%'
       OR codigo LIKE '%AW139%' OR codigo LIKE '%SK76%' OR codigo LIKE '%S76%');
```

| id | codigo | modelo | fabricante | status | deleted_at |
|----|--------|--------|------------|--------|------------|
| 4 | S76 | s76 | sss | ATIVO | 2025-10-24 ← soft-deleted |
| 15 | AER1761247797114 | S76 | null | ATIVO | 2026-06-06 ← soft-deleted |
| 18 | SK76 | SK76 | Sikorsky | ATIVO | 2026-06-06 ← soft-deleted |
| **19** | **AW139** | **AW139** | **Leonardo** | **ATIVO** | **2026-06-06 ← soft-deleted** |
| 24 | N N N N | AW139 | null | ATIVO | null |
| 25 | PR-BGE | SK76 | null | ATIVO | null |
| 26 | PR-SEC | SK76 | null | ATIVO | null |
| 27 | PR-CDU | AW139 | null | ATIVO | null |
| 31 | PR-CHD | SK76 | null | ATIVO | null |

**Achado crítico**: O registro canônico AW139 (id=19, codigo="AW139") está **soft-deleted** desde 2026-06-06. Os registros ativos são instâncias de aeronave real (PR-CDU, etc.) com `codigo` que não é "AW139".

---

## Tarefa 2 — SELECT simuladores (tabela `simuladores`)

```sql
SELECT id, nome, modelo, tipo, fabricante, codigo_aeronave, aeronave_codigo, status, deleted_at
FROM simuladores WHERE deleted_at IS NULL;
```

| id | nome | modelo | tipo | aeronave_codigo | status |
|----|------|--------|------|-----------------|--------|
| 11 | FFS-A139-006 | AW139 | AW139 | AW139 | ATIVO |
| 16 | FFS-SK76-007 | SK76 | SK76 | **NULL** | ATIVO |

**Schema da tabela**: A tabela `simuladores` **NÃO possui coluna `empresa_id`** — é uma tabela global, sem tenant isolation. Possui duas colunas de vínculo: `codigo_aeronave` e `aeronave_codigo`.

**Achados**:
- Simulador AW139 (id=11): `aeronave_codigo = "AW139"` → vínculo existe no banco
- Simulador SK76 (id=16): `aeronave_codigo = NULL` → **sem vínculo nenhum**

---

## Tarefa 3 — JOIN simuladores ↔ aeronaves

```sql
SELECT s.id AS simulador_id, s.nome, s.aeronave_codigo,
       a.codigo AS aeronave_codigo_col, a.modelo, a.fabricante, a.deleted_at
FROM simuladores s
LEFT JOIN aeronaves a ON s.aeronave_codigo = a.codigo
WHERE s.deleted_at IS NULL;
```

| sim_id | aeronave_codigo | a.codigo | a.modelo | a.fabricante | a.deleted_at |
|--------|-----------------|----------|----------|-------------|-------------|
| 11 | AW139 | AW139 | AW139 | Leonardo | **2026-06-06 ← soft-deleted** |
| 16 | NULL | NULL | NULL | NULL | NULL |

**Achado**: O JOIN do simulador AW139 funciona, mas aponta para `aeronaves.id=19` que está **soft-deleted**.  
O simulador SK76 não tem vínculo nenhum (`aeronave_codigo = NULL`).

---

## Tarefa 4 — SELECT modelos_sessao (tabela `modelos_sessao`)

```sql
SELECT id, codigo, nome, tipo_aeronave, codigo_aeronave, modelo_aeronave, ativo
FROM modelos_sessao
WHERE empresa_id = 6 AND deleted_at IS NULL AND ativo = 1
  AND (modelo_aeronave IN ('AW139', 'SK76') ...);
```

**AW139**: 23 modelos ativos. Modelos antigos (ids 16-34) têm `tipo_aeronave`, `codigo_aeronave`, e `modelo_aeronave` preenchidos. Modelos novos (ids 51+) têm **apenas `modelo_aeronave`** — `tipo_aeronave` e `codigo_aeronave` são NULL.

**SK76**: 21 modelos ativos. **Todos** têm `tipo_aeronave = NULL` e `codigo_aeronave = NULL`. Apenas `modelo_aeronave = "SK76"` está populado.

**Confirma que `modelo_aeronave` é o campo canônico da migração atual.**

---

## Tabela auxiliar: `modelos_aeronave` (usada pelo endpoint /api/modelos-aeronave)

| id | codigo | nome | modelo | fabricante | ativo |
|----|--------|------|--------|------------|-------|
| 5 | AW139 | AW139 | AW139 | Leonardo | 1 |
| 6 | SK76 | SK76 | SK76 | Sikorsky | 1 |

**Nota**: O endpoint normaliza `S76` → `SK76` via CASE WHEN.

---

## Tarefa 5 — Respostas objetivas

### 1. Existe simulador AW139 ativo na empresa 6?
**SIM.** `simuladores.id=11` (FFS-A139-006), status=ATIVO, deleted_at=NULL.  
Porém, a tabela `simuladores` é **global** (sem `empresa_id`). Não é da empresa 6 — é de todas.

### 2. Existe simulador SK76 ativo na empresa 6?
**SIM.** `simuladores.id=16` (FFS-SK76-007), status=ATIVO, deleted_at=NULL.  
Mesma observação: tabela global.

### 3. O simulador AW139 está vinculado a alguma aeronave/equipamento?
**SIM, mas o vínculo está quebrado.**  
`simuladores.aeronave_codigo = "AW139"` → JOIN com `aeronaves.codigo = "AW139"` (id=19) funciona, mas o registro `aeronaves.id=19` está **soft-deleted** desde 2026-06-06.

Os registros ativos de aeronave AW139 (id=24 "N N N N", id=27 "PR-CDU") têm `codigo` diferente de "AW139", então o JOIN não os alcançaria.

### 4. O campo `aeronave_codigo` aponta para código interno `AER...` ou para `AW139`?
Para **AW139** — é o nome do modelo, não um código interno. Coincide com `aeronaves.codigo` do registro canônico (id=19).  
**Não** é código interno `AER...` neste caso.

### 5. O endpoint `/api/simuladores` hoje retorna dados suficientes para o frontend filtrar corretamente?
**NÃO.**

O endpoint retorna apenas: `id, nome, modelo, tipo, fabricante, localizacao, status, created_at, updated_at`.

**Não retorna**: `aeronave_codigo` (existe na tabela mas não está no SELECT), `codigo_aeronave` (idem), `modelo_aeronave` (não existe como coluna na tabela `simuladores`).

O frontend tenta 4 campos no filtro (OR):
```typescript
s.modelo_aeronave === modelo  // undefined → sempre false
s.aeronave_codigo === modelo  // undefined → sempre false
s.tipo === modelo             // "AW139" === "AW139" → true (coincidência)
s.modelo === modelo           // "AW139" === "AW139" → true (coincidência)
```

Os dois primeiros checks **sempre falham** porque os campos não vêm no payload.  
Os dois últimos **coincidentemente funcionam** porque o `tipo` e `modelo` do simulador foram cadastrados com o mesmo valor do modelo de aeronave.

### 6. SK76 funciona por vínculo correto ou por coincidência textual?
**POR COINCIDÊNCIA TEXTUAL.**

- `simuladores.aeronave_codigo = NULL` para id=16 → **sem vínculo real**
- O filtro funciona porque `s.tipo = "SK76"` e `s.modelo = "SK76"` coincidem com o `modelo` selecionado no dropdown

Se amanhã alguém cadastrar um simulador SK76 com `tipo = "FFS-Nível-D"`, o filtro quebra.

### 7. O erro é: dados ausentes, backend payload incompleto, frontend filtro frágil, ou combinação?
**COMBINAÇÃO dos 3 fatores:**

| Camada | Problema |
|--------|----------|
| **Dados** | `simuladores.aeronave_codigo` do AW139 aponta para aeronave soft-deleted; SK76 não tem vínculo |
| **Backend** | Payload do `/api/simuladores` não inclui `aeronave_codigo` (existe na tabela mas não no SELECT) nem `modelo_aeronave` (não existe como coluna) |
| **Frontend** | Filtro frágil: tenta 4 campos, 2 sempre falham, 2 funcionam por coincidência de cadastro |

---

## Tarefa 6 — Correção proposta

### Causa raiz confirmada

O dropdown **provavelmente funciona hoje** por coincidência (`s.tipo` e `s.modelo` batem com o modelo de aeronave para ambos AW139 e SK76). Mas o código é **frágil e quebrará** quando:

1. Um novo simulador for cadastrado com `tipo` diferente do modelo de aeronave
2. O campo `tipo` for normalizado/alterado em produção
3. Um simulador existente tiver seu `modelo` alterado

Se o dropdown está realmente vazio para AW139 **hoje**, a causa mais provável é uma **race condition**: `fetchSimuladores()` é assíncrono e o usuário pode selecionar o equipamento antes da resposta chegar, quando `simuladores` ainda é `[]`.

### Correção recomendada (NÃO implementar ainda — NO-GO)

**Backend** (`simuladores-equipamentos.ts`):
1. Adicionar `aerowave_codigo` ao SELECT (já existe na tabela)
2. Adicionar JOIN com `modelos_aeronave` para obter `modelo_aeronave` canônico:
   ```sql
   SELECT s.id, s.nome, s.modelo, s.tipo, s.fabricante, s.localizacao, s.status,
          s.created_at, s.updated_at,
          s.aeronave_codigo,
          COALESCE(ma.modelo, s.aeronave_codigo, s.tipo, s.modelo) AS modelo_aeronave
   FROM simuladores s
   LEFT JOIN modelos_aeronave ma ON ma.empresa_id = ? AND ma.deleted_at IS NULL
     AND (ma.codigo = s.aeronave_codigo OR ma.modelo = s.aeronave_codigo)
   WHERE s.deleted_at IS NULL
   ```
3. Retornar `modelo_aeronave` normalizado no payload

**Frontend** (`ModalNovaSessao.tsx`):
1. Simplificar o filtro para usar **apenas** `modelo_aeronave` como campo primário:
   ```typescript
   const filtrados = simuladores.filter(
     (s) => s.modelo_aeronave === modelo || s.aeronave_codigo === modelo
   );
   ```
2. Remover fallback para `s.tipo` e `s.modelo` (são semanticamente errados)

**DML** (requer autorização separada):
- Corrigir `simuladores.aeronave_codigo = NULL` para SK76 (id=16)
- Opcional: corrigir o soft-delete do `aeronaves.id=19` ou recriar o vínculo para um registro ativo

### GO / NO-GO

**NO-GO para implementação.** Auditoria concluída. Correção requer:
1. Aprovação do plano de backend (JOIN com `modelos_aeronave`)
2. Aprovação do plano de frontend (simplificar filtro)
3. Decisão sobre DML de correção de vínculos (separado, com backup)

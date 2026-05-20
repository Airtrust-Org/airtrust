# 🎯 Padronização de Aeronaves - AirTrust v1

**Data:** 02/12/2025  
**Status:** ✅ Implementado e em produção  
**Migration:** 0158

---

## 📋 Decisão Arquitetural

### **Padrão Único:** `aeronaves.codigo` como FK

Todos os módulos que referenciam aeronaves DEVEM usar `aeronaves.codigo` como chave estrangeira.

### ✅ Por que `codigo` e não `modelo`?

| Critério             | `codigo`              | `modelo`                |
| -------------------- | --------------------- | ----------------------- |
| **Unicidade**        | ✅ UNIQUE constraint  | ❌ Pode repetir         |
| **Integridade**      | ✅ FK real possível   | ❌ Dados duplicados     |
| **Manutenibilidade** | ✅ Mudança em 1 lugar | ❌ Mudança em N lugares |
| **Exemplo**          | `AER1761266027229`    | `AW139`                 |

---

## 🗄️ Estrutura do Banco

### Tabela `aeronaves`

```sql
CREATE TABLE aeronaves (
    id INTEGER PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL,  -- ⭐ Chave natural única
    modelo TEXT NOT NULL,          -- Ex: AW139, S76
    fabricante TEXT,               -- Ex: Leonardo, Sikorsky
    prefixo TEXT,
    ano_fabricacao INTEGER,
    status TEXT DEFAULT 'ATIVO',
    observacoes TEXT,
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT
);
```

### Tabela `simuladores`

```sql
CREATE TABLE simuladores (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    modelo TEXT,                   -- ⚠️ Mantido para compatibilidade
    tipo TEXT,
    fabricante TEXT,
    aeronave_codigo TEXT,          -- ⭐ FK para aeronaves.codigo
    localizacao TEXT,
    status TEXT,
    observacoes TEXT,
    ...
);

-- Índice para performance
CREATE INDEX idx_simuladores_aeronave_codigo ON simuladores(aeronave_codigo);
```

### Tabela `modelos_sessao`

```sql
CREATE TABLE modelos_sessao (
    id INTEGER PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    tipo_sessao_id INTEGER,
    codigo_aeronave TEXT,          -- ⭐ FK para aeronaves.codigo
    tipo_aeronave TEXT,            -- ⚠️ Deprecated (manter por compatibilidade)
    descricao TEXT,
    duracao_estimada INTEGER,
    ...
);

-- Índice para performance
CREATE INDEX idx_modelos_sessao_aeronave_codigo ON modelos_sessao(codigo_aeronave);
```

---

## 🔌 API - Endpoints Padronizados

### GET `/api/aeronaves`

Retorna lista completa de aeronaves com `codigo` como identificador principal.

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "codigo": "AER1761266027229",
      "modelo": "AW139",
      "fabricante": "Leonardo"
    }
  ]
}
```

### GET `/api/simuladores`

Retorna simuladores com `aeronave_codigo` populado.

```json
{
  "success": true,
  "data": [
    {
      "id": 11,
      "nome": "Simulador AW139 - CAE GRU",
      "modelo": "AW139",
      "aeronave_codigo": "AER1761266027229"
    }
  ]
}
```

### GET `/api/simuladores/modelos-sessao`

Filtra por `codigo_aeronave` (não mais `tipo_aeronave`).

**Query params:**

- `tipo_sessao_id`: number
- `codigo_aeronave`: string (ex: "AER1761266027229")

```bash
curl "https://api.airtrust.com/simuladores/modelos-sessao?tipo_sessao_id=14&codigo_aeronave=AER1761266027229"
```

### POST `/api/simuladores/modelos-sessao`

```json
{
  "codigo": "A139-I-01/12",
  "nome": "SESSÃO 1: FAMILIARIZAÇÃO",
  "tipo_sessao_id": 14,
  "codigo_aeronave": "AER1761266027229",  // ⭐ Usar codigo
  "descricao": "...",
  "manobras": [...]
}
```

---

## 🎨 Frontend - Componentes Padronizados

### Interface TypeScript

```typescript
interface Aeronave {
  id: number;
  codigo: string; // ⭐ Chave única
  modelo: string;
  fabricante?: string;
}

interface Simulador {
  id: number;
  nome: string;
  modelo: string;
  aeronave_codigo?: string; // ⭐ FK para aeronaves.codigo
}
```

### Dropdown de Aeronaves

```tsx
<select
  onChange={(e) => {
    const aeronave = aeronaves.find((a) => a.id === Number(e.target.value));
    if (aeronave) handleAeronaveChange(aeronave.id, aeronave.codigo); // ⭐ Passa codigo
  }}
>
  {aeronaves.map((aer) => (
    <option key={aer.id} value={aer.id}>
      {aer.codigo} - {aer.modelo} ({aer.fabricante})
    </option>
  ))}
</select>
```

### Filtro de Simuladores

```typescript
function handleAeronaveChange(id: number, codigo: string) {
  setAeronaveId(id);
  setAeronaveCodigo(codigo); // ⭐ Armazena codigo

  // Filtrar simuladores por codigo da aeronave
  const filtrados = simuladores.filter((s) => s.aeronave_codigo === codigo);
  setSimuladoresFiltrados(filtrados);
}
```

### Busca de Modelos

```typescript
const url = `${API_BASE_URL}/simuladores/modelos-sessao?tipo_sessao_id=${id}&codigo_aeronave=${codigo}`;
```

---

## 🔄 Migration 0158 - Aplicada

```sql
-- 1. Adicionar coluna em simuladores
ALTER TABLE simuladores ADD COLUMN aeronave_codigo TEXT;

-- 2. Popular aeronave_codigo dos simuladores
UPDATE simuladores
SET aeronave_codigo = (
    SELECT codigo
    FROM aeronaves
    WHERE aeronaves.modelo = simuladores.modelo
    AND aeronaves.deleted_at IS NULL
    LIMIT 1
)
WHERE deleted_at IS NULL
AND aeronave_codigo IS NULL;

-- 3. Popular codigo_aeronave em modelos_sessao
UPDATE modelos_sessao
SET codigo_aeronave = (
    SELECT codigo
    FROM aeronaves
    WHERE aeronaves.modelo = modelos_sessao.tipo_aeronave
    AND aeronaves.deleted_at IS NULL
    LIMIT 1
)
WHERE deleted_at IS NULL
AND tipo_aeronave IS NOT NULL
AND codigo_aeronave IS NULL;

-- 4. Criar índices
CREATE INDEX IF NOT EXISTS idx_simuladores_aeronave_codigo ON simuladores(aeronave_codigo);
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_aeronave_codigo ON modelos_sessao(codigo_aeronave);
```

**Resultado:**

- 18 linhas atualizadas
- 474 linhas lidas
- 59 linhas escritas

---

## ✅ Checklist de Implementação

### Backend ✅

- [x] GET `/aeronaves` retorna `codigo`
- [x] GET `/simuladores` retorna `aeronave_codigo`
- [x] GET `/modelos-sessao` filtra por `codigo_aeronave`
- [x] POST `/modelos-sessao` aceita `codigo_aeronave`
- [x] PUT `/modelos-sessao` aceita `codigo_aeronave`

### Frontend ✅

- [x] Interface `Aeronave` tem `codigo`
- [x] Interface `Simulador` tem `aeronave_codigo`
- [x] Dropdown exibe: `codigo - modelo (fabricante)`
- [x] `handleAeronaveChange` recebe `codigo`
- [x] Filtro simuladores usa `aeronave_codigo`
- [x] Busca modelos usa `codigo_aeronave`

### Database ✅

- [x] Migration 0158 aplicada
- [x] `simuladores.aeronave_codigo` populado
- [x] `modelos_sessao.codigo_aeronave` populado
- [x] Índices criados

---

## 🧪 Testes de Validação

### 1. Buscar aeronaves

```bash
curl "https://airtrust-api-production.airtrust.workers.dev/api/aeronaves"
# ✅ Retorna codigo: "AER1761266027229"
```

### 2. Buscar simuladores

```bash
curl "https://airtrust-api-production.airtrust.workers.dev/api/simuladores"
# ✅ Retorna aeronave_codigo: "AER1761266027229"
```

### 3. Buscar modelos por codigo_aeronave

```bash
curl "https://airtrust-api-production.airtrust.workers.dev/api/simuladores/modelos-sessao?codigo_aeronave=AER1761266027229"
# ✅ Retorna 12 modelos
```

### 4. Validar relacionamento

```sql
SELECT
  a.codigo AS aeronave_codigo,
  s.nome AS simulador_nome,
  m.nome AS modelo_nome
FROM aeronaves a
LEFT JOIN simuladores s ON s.aeronave_codigo = a.codigo
LEFT JOIN modelos_sessao m ON m.codigo_aeronave = a.codigo
WHERE a.deleted_at IS NULL;
```

---

## 📊 Resultados

### Dados Antes

```
simuladores.aeronave_codigo: NULL (todos)
modelos_sessao.codigo_aeronave: NULL (todos)
```

### Dados Depois

```
simuladores.aeronave_codigo: "AER1761266027229" (AW139)
modelos_sessao.codigo_aeronave: "AER1761266027229" (12 modelos)
```

---

## 🚨 Breaking Changes

### ⚠️ Deprecated

- `tipo_aeronave` em requisições (usar `codigo_aeronave`)
- Filtro por `modelo` string (usar `aeronave_codigo`)

### ✅ Compatibilidade

Campos antigos mantidos por compatibilidade:

- `simuladores.modelo` (ainda existe)
- `modelos_sessao.tipo_aeronave` (ainda existe)

---

## 📝 Boas Práticas

### ✅ Sempre use `codigo` como FK

```typescript
// ✅ CORRETO
const aeronave = await fetch(`/api/aeronaves/${codigo}`);
const simuladores = await fetch(`/api/simuladores?aeronave_codigo=${codigo}`);

// ❌ EVITAR
const simuladores = await fetch(`/api/simuladores?modelo=AW139`);
```

### ✅ Display formatado

```tsx
{aeronave.codigo} - {aeronave.modelo} ({aeronave.fabricante})
// Ex: AER1761266027229 - AW139 (Leonardo)
```

---

## 🎯 Próximos Passos

1. ✅ **Padronização completa** (concluída)
2. ⏳ **Documentar APIs** em Swagger/OpenAPI
3. ⏳ **Criar testes automatizados** para FKs
4. ⏳ **Remover campos deprecated** (fase 2)

---

## 📚 Referências

- **Migration:** `worker-airtrust/migrations/0158_padronizar_aeronaves_fk.sql`
- **Backend:** `worker-airtrust/src/routes/simuladores.ts`
- **Frontend:** `src/react-app/components/modals/ModalNovaSessao.tsx`
- **API Docs:** `/api/aeronaves`, `/api/simuladores`, `/api/simuladores/modelos-sessao`

---

**Status:** ✅ Implementação completa  
**Deploy:** 37458cc2-96d0-4809-b553-9b23538932df  
**Data:** 02/12/2025

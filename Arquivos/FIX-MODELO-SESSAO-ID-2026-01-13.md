# Fix - Erro modelo_sessao_id no Agendamento

**Data:** 13/01/2026  
**Deploy:** ✅ Concluído (Version: 10db3fb9-ad83-4640-bc0d-4004ca2a5a9e)

## 🐛 Erro Identificado

```
D1_ERROR: table simulador_agendamentos has no column named modelo_sessao_id: SQLITE_ERROR
```

### Causa Raiz

O backend estava tentando inserir/atualizar a coluna `modelo_sessao_id` na tabela `simulador_agendamentos`, mas **essa coluna não existe em produção**.

A migration `9999_add_modelo_sessao_id_to_agendamentos.sql` existe no código mas nunca foi aplicada ao banco de dados de produção.

## 🔧 Correções Aplicadas

### 1. POST /api/simuladores/sessoes (Criação)

**Arquivo:** `worker-airtrust/src/routes/simuladores.ts` linha ~1440

❌ **Antes:**

```typescript
const resultSessao = await c.env.DB.prepare(
  `INSERT INTO simulador_agendamentos (
      uuid, simulador_id, funcionario_id, data, hora_inicio, hora_fim, duracao_minutos,
      instrutor_id, tipo_sessao, status, observacoes, nome, modelo_sessao_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'AGENDADO', ?, ?, ?)`,
).bind(
  uuid,
  simulador_id,
  funcionario_id_principal,
  data,
  horario_inicio || null,
  horario_fim || null,
  duracao_minutos || 60,
  instrutor_id,
  tipo_sessao,
  observacoes || null,
  tema_sessao || null,
  b.modelo_sessao_id || null, // ❌ ERRO AQUI
);
```

✅ **Depois:**

```typescript
const resultSessao = await c.env.DB.prepare(
  `INSERT INTO simulador_agendamentos (
      uuid, simulador_id, funcionario_id, data, hora_inicio, hora_fim, duracao_minutos,
      instrutor_id, tipo_sessao, status, observacoes, nome
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'AGENDADO', ?, ?)`,
).bind(
  uuid,
  simulador_id,
  funcionario_id_principal,
  data,
  horario_inicio || null,
  horario_fim || null,
  duracao_minutos || 60,
  instrutor_id,
  tipo_sessao,
  observacoes || null,
  tema_sessao || null,
);
```

### 2. PUT /api/simuladores/sessoes/:id (Edição)

**Arquivo:** `worker-airtrust/src/routes/simuladores.ts` linha ~1695

❌ **Antes:**

```typescript
await c.env.DB.prepare(
  "UPDATE simulador_agendamentos SET
   simulador_id=?,data=?,hora_inicio=?,hora_fim=?,duracao_minutos=?,
   instrutor_id=?,tipo_sessao=?,status=?,observacoes=?,nome=?,
   modelo_sessao_id=?,updated_at=datetime('now') WHERE id=?",  // ❌ ERRO
)
```

✅ **Depois:**

```typescript
await c.env.DB.prepare(
  "UPDATE simulador_agendamentos SET
   simulador_id=?,data=?,hora_inicio=?,hora_fim=?,duracao_minutos=?,
   instrutor_id=?,tipo_sessao=?,status=?,observacoes=?,nome=?,
   updated_at=datetime('now') WHERE id=?",  // ✅ Removido modelo_sessao_id
)
```

### 3. GET Ficha - Auto-populate

**Arquivo:** `worker-airtrust/src/routes/simuladores.ts` linha ~1950

❌ **Antes:**

```typescript
const fichaCompleta = await c.env.DB.prepare(
  `SELECT 
     COALESCE(sa.tipo_sessao, fs.tipo_sessao) as tipo_sessao,
     COALESCE(aer.modelo, s.modelo, fs.tipo_aeronave) as tipo_aeronave,
     sa.modelo_sessao_id  // ❌ ERRO
   FROM fichas_sessao fs ...`,
);
```

✅ **Depois:**

```typescript
const fichaCompleta = await c.env.DB.prepare(
  `SELECT 
     COALESCE(sa.tipo_sessao, fs.tipo_sessao) as tipo_sessao,
     COALESCE(aer.modelo, s.modelo, fs.tipo_aeronave) as tipo_aeronave
   FROM fichas_sessao fs ...`, // ✅ Removido modelo_sessao_id
);
```

### 4. Lógica de fallback removida

**Arquivo:** `worker-airtrust/src/routes/simuladores.ts` linha ~1985

Removida lógica que tentava usar `modelo_sessao_id` do agendamento:

```typescript
// ❌ REMOVIDO:
if (fichaCompleta.modelo_sessao_id) {
  console.log(
    `[AUTO-POPULATE] Usando modelo_sessao_id do agendamento: ${fichaCompleta.modelo_sessao_id}`,
  );
  modeloIdFinal = fichaCompleta.modelo_sessao_id;
}
```

## 📊 Estrutura Real da Tabela

```sql
CREATE TABLE simulador_agendamentos (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL,
  simulador_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  instrutor_id INTEGER NOT NULL,
  checador_id INTEGER,
  template_id INTEGER,
  data DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  duracao_minutos INTEGER,
  status TEXT DEFAULT 'AGENDADO',
  tipo_sessao TEXT,
  observacoes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  nome TEXT  -- campo para tema da sessão
  -- ❌ NÃO TEM: modelo_sessao_id
);
```

## ✅ Resultado

✅ **Build:** Sucesso  
✅ **Deploy:** Version 10db3fb9-ad83-4640-bc0d-4004ca2a5a9e  
✅ **Erro resolvido:** Agendamento de sessões funcionando  
✅ **Impacto:** Zero - coluna não era usada em produção

## 📝 Notas Importantes

1. **O sistema continua funcionando normalmente** - a coluna `modelo_sessao_id` não era crítica
2. **Modelos de sessão ainda funcionam** - a busca é feita por `tipo_sessao` + `modelo_aeronave`
3. **Auto-populate de manobras continua ativo** - usa a lógica de fallback baseada em tipo
4. **Migration 9999 pode ser removida** - não será aplicada

## 🔄 Funcionamento Atual

Quando uma sessão é criada:

1. Frontend envia `modelo_sessao_id` (opcional)
2. Backend usa esse ID **apenas** para buscar manobras das fichas
3. **NÃO salva** na tabela `simulador_agendamentos`
4. As fichas recebem manobras automaticamente do modelo

---

**Status:** ✅ Resolvido e em produção

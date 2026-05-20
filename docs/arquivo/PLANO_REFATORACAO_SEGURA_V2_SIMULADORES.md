# 🎯 PLANO DE REFATORAÇÃO SEGURA V2 - SIMULADORES

**Baseado em**: AUDITORIA_ARQUITETURA_SIMULADORES_ATUAL.md  
**Data**: 30/11/2025  
**Estratégia**: Incremental, testada, com rollback

---

## 📋 ÍNDICE

1. [Princípios de Refatoração](#1-princípios-de-refatoração)
2. [Estrutura Alvo](#2-estrutura-alvo)
3. [Etapas de Execução](#3-etapas-de-execução)
4. [Checklist de Testes](#4-checklist-de-testes)
5. [Rollback Strategy](#5-rollback-strategy)
6. [Monitoramento](#6-monitoramento)

---

## 1. PRINCÍPIOS DE REFATORAÇÃO

### ✅ DO's (Fazer)
- ✅ Extrair código, NÃO reescrever
- ✅ Testar após CADA etapa
- ✅ Commit separado por etapa
- ✅ Preservar lógica exata (especialmente queries)
- ✅ Manter responses iguais (frontend não muda)
- ✅ Deploy incremental (staging → produção)

### ❌ DON'Ts (Não Fazer)
- ❌ Modificar lógica durante refatoração
- ❌ Fazer múltiplas etapas de uma vez
- ❌ Pular testes
- ❌ Deploy direto em produção
- ❌ Mudar estrutura de response da API

### 🔑 Princípio Fundamental
> **"Se funciona, não quebre. Se quebrou, volte atrás."**

---

## 2. ESTRUTURA ALVO

### 2.1. Antes (Atual)
```
worker-airtrust/src/routes/
└── simuladores.ts                      (2.587 linhas)
```

### 2.2. Depois (Alvo)
```
worker-airtrust/src/routes/simuladores/
├── index.ts                            (~50 linhas) - Router agregador
├── shared.ts                           (~200 linhas) - Tipos + helpers + schemas
├── crud.ts                             (~300 linhas) - CRUD simuladores (5 endpoints)
├── sessoes.ts                          (~400 linhas) - Sessões + participantes (9 endpoints)
├── fichas.ts                           (~500 linhas) - Fichas + assinaturas (10 endpoints)
├── relatorios.ts                       (~350 linhas) - Relatórios (3 endpoints)
├── manobras.ts                         (~200 linhas) - CRUD manobras (4 endpoints)
├── modelos.ts                          (~150 linhas) - CRUD modelos (3 endpoints)
└── validacao.ts                        (~300 linhas) - Regras de negócio (funções puras)
```

**Total**: 9 arquivos (~2.450 linhas) - redução de complexidade sem perder código

---

## 3. ETAPAS DE EXECUÇÃO

---

### 📦 ETAPA 0: PREPARAÇÃO (30 min)

#### Objetivo
Preparar ambiente e fazer backup completo antes de qualquer mudança.

#### Tarefas

**0.1. Backup Completo**
```bash
cd /Users/filipedaumas/Documents/airtrust\ v1

# Criar backup do arquivo original
cp worker-airtrust/src/routes/simuladores.ts \
   worker-airtrust/src/routes/simuladores.ts.BACKUP_20251130

# Commit
git add .
git commit -m "backup: simuladores.ts monolítico antes de refatoração [2025-11-30]"
git push
```

**0.2. Criar Estrutura de Pastas**
```bash
mkdir -p worker-airtrust/src/routes/simuladores

# Criar arquivos vazios
touch worker-airtrust/src/routes/simuladores/index.ts
touch worker-airtrust/src/routes/simuladores/shared.ts
touch worker-airtrust/src/routes/simuladores/crud.ts
touch worker-airtrust/src/routes/simuladores/sessoes.ts
touch worker-airtrust/src/routes/simuladores/fichas.ts
touch worker-airtrust/src/routes/simuladores/relatorios.ts
touch worker-airtrust/src/routes/simuladores/manobras.ts
touch worker-airtrust/src/routes/simuladores/modelos.ts
touch worker-airtrust/src/routes/simuladores/validacao.ts
```

**0.3. Criar Índices Faltantes (Performance)**
```bash
# Criar migration
cat > worker-airtrust/migrations/0140_add_simuladores_indexes.sql << 'EOF'
-- Performance indexes for simuladores module

-- Simuladores
CREATE INDEX IF NOT EXISTS idx_simuladores_status ON simuladores(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_simuladores_tipo ON simuladores(tipo) WHERE deleted_at IS NULL;

-- Sessões
CREATE INDEX IF NOT EXISTS idx_simulador_agendamentos_simulador ON simulador_agendamentos(simulador_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_simulador_agendamentos_data ON simulador_agendamentos(data) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_simulador_agendamentos_instrutor ON simulador_agendamentos(instrutor_id) WHERE deleted_at IS NULL;

-- Participantes
CREATE INDEX IF NOT EXISTS idx_sessoes_participantes_sessao ON sessoes_participantes(sessao_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessoes_participantes_funcionario ON sessoes_participantes(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessoes_participantes_funcao ON sessoes_participantes(funcao) WHERE deleted_at IS NULL;

-- Fichas
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_agendamento ON fichas_sessao(agendamento_slot_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_aluno ON fichas_sessao(colaborador_id_aluno) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_instrutor ON fichas_sessao(instrutor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_status ON fichas_sessao(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_data ON fichas_sessao(data_sessao) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_tipo ON fichas_sessao(tipo_sessao) WHERE deleted_at IS NULL;

-- Manobras
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_manobras_ficha ON fichas_sessao_manobras(ficha_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cadastro_manobras_tipo_aero ON cadastro_manobras(tipo_sessao, tipo_aeronave) WHERE deleted_at IS NULL;
EOF

# Aplicar migration
cd worker-airtrust
npx wrangler d1 execute airtrust-db \
  --remote \
  --file=./migrations/0140_add_simuladores_indexes.sql
```

**0.4. Commit**
```bash
git add .
git commit -m "chore: criar estrutura para refatoração simuladores + indexes performance [2025-11-30]"
git push
```

#### Critério de Sucesso
- ✅ Backup criado
- ✅ Estrutura de pastas criada
- ✅ Índices aplicados
- ✅ Commit feito

---

### 📘 ETAPA 1: SHARED (1h)

#### Objetivo
Extrair tipos, helpers e criar schemas Zod.

#### Tarefas

**1.1. Criar shared.ts**

Extrair do `simuladores.ts`:
- Linhas 1-15: Imports + type Env
- Linhas 24-83: Função `audit()`
- Criar schemas Zod novos

**Arquivo**: `worker-airtrust/src/routes/simuladores/shared.ts`

```typescript
/**
 * SHARED - Tipos, Helpers e Schemas Zod
 */

import { z } from 'zod';

// ==================== TYPES ====================

export type Env = {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
};

export type CadastroManobra = {
  id: number;
  codigo: string;
  descricao: string;
  categoria: string;
  tipo_sessao: string;
  tipo_aeronave: string;
  ordem: number;
};

// ==================== SCHEMAS ZOD ====================

export const createSimuladorSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  modelo: z.string().optional(),
  tipo: z.string().min(1, 'Tipo é obrigatório'),
  fabricante: z.string().optional(),
  localizacao: z.string().optional(),
  capacidade: z.number().int().positive().optional(),
  status: z.enum(['ATIVO', 'INATIVO', 'MANUTENCAO']).default('ATIVO'),
  observacoes: z.string().optional(),
});

export const updateSimuladorSchema = createSimuladorSchema.partial();

export const createSessaoSchema = z.object({
  simulador_id: z.number().int().positive(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  duracao_minutos: z.number().int().positive().default(60),
  instrutor_id: z.number().int().positive().optional(),
  tipo_sessao: z.string(),
  observacoes: z.string().optional(),
  alunos: z.array(z.number().int().positive()).min(1),
});

export const updateSessaoSchema = createSessaoSchema.partial();

export const assinaturaSchema = z.object({
  tipo: z.enum(['ALUNO', 'INSTRUTOR']),
});

// ==================== HELPERS ====================

/**
 * Registra auditoria em auditoria_avancada_v2
 */
export async function audit(
  db: D1Database,
  p: {
    tabela: string;
    acao: 'INSERT' | 'UPDATE' | 'DELETE';
    registro_id: string | number;
    dados_anteriores?: unknown;
    dados_novos?: unknown;
  },
) {
  try {
    // Verificar se tabela existe (lazy create)
    const pragma = await db.prepare("PRAGMA table_info('auditoria_avancada_v2')").all();
    if (!pragma.results || pragma.results.length === 0) {
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS auditoria_avancada_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tabela TEXT NOT NULL,
          acao TEXT NOT NULL,
          registro_id TEXT NOT NULL,
          dados_anteriores TEXT,
          dados_novos TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_auditoria_v2_tabela ON auditoria_avancada_v2(tabela)`,
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_auditoria_v2_registro ON auditoria_avancada_v2(registro_id)`,
        )
        .run();
    }
    await db
      .prepare(
        `INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_anteriores, dados_novos)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        p.tabela,
        p.acao,
        String(p.registro_id),
        p.dados_anteriores ? JSON.stringify(p.dados_anteriores) : null,
        p.dados_novos ? JSON.stringify(p.dados_novos) : null,
      )
      .run();
  } catch (err) {
    console.warn('[AUDIT] Falha ao registrar auditoria:', err);
  }
}

/**
 * Detecta coluna de tipo aeronave dinamicamente
 */
export async function getTipoAeronaveExpr(db: D1Database): Promise<string> {
  const pragma = await db.prepare(`PRAGMA table_info(simuladores)`).all<{ name: string }>();
  const cols = new Set((pragma.results || []).map((r) => r.name));
  
  if (cols.has('tipo_aeronave')) return 'sim.tipo_aeronave';
  if (cols.has('tipo')) return 'sim.tipo';
  return "''";
}
```

**1.2. Build e Teste**
```bash
cd worker-airtrust
npm run build
# Deve compilar sem erros
```

**1.3. Commit**
```bash
git add .
git commit -m "refactor(simuladores): extrair shared.ts com types, schemas Zod e helpers [2025-11-30]"
git push
```

#### Critério de Sucesso
- ✅ `shared.ts` criado
- ✅ Build sem erros
- ✅ Commit feito

---

### 🔧 ETAPA 2: CRUD BÁSICO (1h30)

#### Objetivo
Extrair 5 endpoints CRUD básicos de simuladores.

#### Tarefas

**2.1. Criar crud.ts**

**Arquivo**: `worker-airtrust/src/routes/simuladores/crud.ts`

```typescript
/**
 * CRUD BÁSICO - Simuladores
 * 5 endpoints: GET /, POST /, GET /:id, PUT /:id, DELETE /:id
 */

import { Hono } from 'hono';
import { auth } from '../../middleware/auth';
import { audit, createSimuladorSchema, updateSimuladorSchema, type Env } from './shared';

const app = new Hono<{ Bindings: Env }>();

// ==================== GET / - Lista simuladores ====================
app.get('/', auth, async (c) => {
  const { limit = '50', offset = '0', status } = c.req.query();
  
  let query = `SELECT * FROM simuladores WHERE deleted_at IS NULL`;
  const params: any[] = [];
  
  if (status) {
    query += ` AND status = ?`;
    params.push(status);
  }
  
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));
  
  const result = await c.env.DB.prepare(query).bind(...params).all();
  
  return c.json({
    success: true,
    data: result.results,
    total: result.results.length,
  });
});

// ==================== GET /:id - Busca simulador por ID ====================
app.get('/:id', auth, async (c) => {
  const id = parseInt(c.req.param('id'));
  
  const simulador = await c.env.DB.prepare(
    `SELECT * FROM simuladores WHERE id = ? AND deleted_at IS NULL`
  ).bind(id).first();
  
  if (!simulador) {
    return c.json({ success: false, error: 'Simulador não encontrado' }, 404);
  }
  
  return c.json({ success: true, data: simulador });
});

// ==================== POST / - Cria simulador ====================
app.post('/', auth, async (c) => {
  const body = createSimuladorSchema.parse(await c.req.json());
  
  const result = await c.env.DB.prepare(`
    INSERT INTO simuladores (nome, modelo, tipo, fabricante, localizacao, capacidade, status, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.nome,
    body.modelo || null,
    body.tipo,
    body.fabricante || null,
    body.localizacao || null,
    body.capacidade || 1,
    body.status || 'ATIVO',
    body.observacoes || null,
  ).run();
  
  const id = result.meta.last_row_id;
  const created = await c.env.DB.prepare(`SELECT * FROM simuladores WHERE id = ?`)
    .bind(id).first();
  
  await audit(c.env.DB, {
    tabela: 'simuladores',
    acao: 'INSERT',
    registro_id: id,
    dados_novos: created,
  });
  
  return c.json({ success: true, data: created }, 201);
});

// ==================== PUT /:id - Atualiza simulador ====================
app.put('/:id', auth, async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = updateSimuladorSchema.parse(await c.req.json());
  
  const anterior = await c.env.DB.prepare(`SELECT * FROM simuladores WHERE id = ?`)
    .bind(id).first();
  
  if (!anterior) {
    return c.json({ success: false, error: 'Simulador não encontrado' }, 404);
  }
  
  const sets: string[] = [];
  const params: any[] = [];
  
  if (body.nome !== undefined) { sets.push('nome = ?'); params.push(body.nome); }
  if (body.modelo !== undefined) { sets.push('modelo = ?'); params.push(body.modelo); }
  if (body.tipo !== undefined) { sets.push('tipo = ?'); params.push(body.tipo); }
  if (body.fabricante !== undefined) { sets.push('fabricante = ?'); params.push(body.fabricante); }
  if (body.localizacao !== undefined) { sets.push('localizacao = ?'); params.push(body.localizacao); }
  if (body.capacidade !== undefined) { sets.push('capacidade = ?'); params.push(body.capacidade); }
  if (body.status !== undefined) { sets.push('status = ?'); params.push(body.status); }
  if (body.observacoes !== undefined) { sets.push('observacoes = ?'); params.push(body.observacoes); }
  
  sets.push('updated_at = CURRENT_TIMESTAMP');
  
  await c.env.DB.prepare(`UPDATE simuladores SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...params, id).run();
  
  const novo = await c.env.DB.prepare(`SELECT * FROM simuladores WHERE id = ?`)
    .bind(id).first();
  
  await audit(c.env.DB, {
    tabela: 'simuladores',
    acao: 'UPDATE',
    registro_id: id,
    dados_anteriores: anterior,
    dados_novos: novo,
  });
  
  return c.json({ success: true, data: novo });
});

// ==================== DELETE /:id - Soft delete ====================
app.delete('/:id', auth, async (c) => {
  const id = parseInt(c.req.param('id'));
  
  const anterior = await c.env.DB.prepare(`SELECT * FROM simuladores WHERE id = ?`)
    .bind(id).first();
  
  if (!anterior) {
    return c.json({ success: false, error: 'Simulador não encontrado' }, 404);
  }
  
  await c.env.DB.prepare(`UPDATE simuladores SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(id).run();
  
  await audit(c.env.DB, {
    tabela: 'simuladores',
    acao: 'DELETE',
    registro_id: id,
    dados_anteriores: anterior,
  });
  
  return c.json({ success: true, message: 'Simulador removido' });
});

export default app;
```

**2.2. Atualizar index.ts**

**Arquivo**: `worker-airtrust/src/routes/simuladores/index.ts`

```typescript
/**
 * SIMULADORES - Router Agregador
 */

import { Hono } from 'hono';
import crud from './crud';

type Env = {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
};

const app = new Hono<{ Bindings: Env }>();

// Montar submódulos
app.route('/', crud);

export default app;
```

**2.3. Atualizar src/index.ts para usar novo router**

```typescript
// Substituir:
// import simuladores from './routes/simuladores';

// Por:
import simuladores from './routes/simuladores/index';

// Resto igual
```

**2.4. Build, Deploy e Teste**
```bash
cd worker-airtrust
npm run build

# Deploy staging
wrangler deploy

# Testar endpoints
curl https://airtrust-api-production.airtrust.workers.dev/api/simuladores
curl https://airtrust-api-production.airtrust.workers.dev/api/simuladores/1

# Testar POST
curl -X POST https://airtrust-api-production.airtrust.workers.dev/api/simuladores \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"nome": "SIM-TEST", "tipo": "B737"}'
```

**2.5. Commit**
```bash
git add .
git commit -m "refactor(simuladores): extrair crud.ts (5 endpoints) + integrar no router [2025-11-30]"
git push
```

#### Critério de Sucesso
- ✅ `crud.ts` criado e funcionando
- ✅ Build sem erros
- ✅ Deploy bem-sucedido
- ✅ 5 endpoints testados (GET /, GET /:id, POST, PUT, DELETE)
- ✅ Frontend carrega lista de simuladores
- ✅ Commit feito

---

### 🎯 ETAPA 3, 4, 5, 6, 7 - RESUMO

**Etapa 3**: Sessões (2h) - `sessoes.ts` + `validacao.ts` (criarFichasParaSessao)  
**Etapa 4**: Fichas (2h) - `fichas.ts` (assinaturas + geração qualificação)  
**Etapa 5**: Relatórios (1h) - `relatorios.ts` (uso, tripulantes, desempenho)  
**Etapa 6**: Manobras + Modelos (1h) - `manobras.ts` + `modelos.ts`  
**Etapa 7**: Finalização (30min) - Remover `simuladores.ts` original + testes E2E

**Processo igual para cada etapa**:
1. Criar arquivo
2. Extrair código (copiar exato)
3. Atualizar `index.ts` (adicionar route)
4. Build + deploy
5. Testar endpoints
6. Commit

---

## 4. CHECKLIST DE TESTES

### Por Etapa

```bash
# 1. Build
npm run build
# ✅ Sem erros TypeScript

# 2. Deploy
wrangler deploy
# ✅ Deploy bem-sucedido

# 3. Health
curl https://.../api/health
# ✅ {"status": "ok"}

# 4. Endpoint específico
curl https://.../api/simuladores/...
# ✅ Response esperado

# 5. Frontend
open http://localhost:3000/simuladores
# ✅ Tela carrega
# ✅ Dados exibidos
# ✅ CRUD funciona
```

### Teste E2E Completo (Etapa 7)

```bash
# 1. Criar simulador
curl -X POST .../api/simuladores \
  -d '{"nome": "SIM-01", "tipo": "B737"}'
# ✅ Criado

# 2. Criar sessão + auto-gerar fichas
curl -X POST .../api/simuladores/sessoes \
  -d '{"simulador_id": 1, "data": "2025-12-01", "alunos": [1,2,3]}'
# ✅ 3 fichas criadas

# 3. Assinar ficha (aluno)
curl -X POST .../api/simuladores/fichas/1/assinar \
  -d '{"tipo": "ALUNO"}'
# ✅ status = ASSINADA_ALUNO

# 4. Assinar ficha (instrutor)
curl -X POST .../api/simuladores/fichas/1/assinar \
  -d '{"tipo": "INSTRUTOR"}'
# ✅ status = ASSINADA_TOTAL

# 5. Gerar qualificação
curl -X POST .../api/simuladores/fichas/1/gerar-qualificacao
# ✅ Qualificação criada

# 6. Relatórios
curl '.../api/simuladores/relatorios/uso?dataInicio=2025-01-01&dataFim=2025-12-31'
# ✅ Dados retornados
```

---

## 5. ROLLBACK STRATEGY

### Se algo quebrar durante refatoração:

```bash
# 1. Identificar commit problemático
git log --oneline -10

# 2. Reverter
git revert <commit-hash>

# 3. Deploy rollback
wrangler deploy

# 4. Verificar
curl https://.../api/health
curl https://.../api/simuladores
```

### Backup sempre disponível:
```
worker-airtrust/src/routes/simuladores.ts.BACKUP_20251130
```

---

## 6. MONITORAMENTO

### Durante Refatoração

```bash
# Logs em tempo real
wrangler tail

# Erros no Cloudflare Dashboard
# https://dash.cloudflare.com → Workers → airtrust-api-production → Logs
```

### Métricas

| Métrica | Meta |
|---------|------|
| Build Time | < 10s |
| Deploy Time | < 30s |
| Endpoint Response Time | < 300ms |
| Erro Rate | 0% |

---

## ✅ CONCLUSÃO

### Tempo Total Estimado
- **Preparação**: 30 min
- **Etapa 1**: 1h
- **Etapa 2**: 1h30
- **Etapa 3**: 2h
- **Etapa 4**: 2h
- **Etapa 5**: 1h
- **Etapa 6**: 1h
- **Etapa 7**: 30min
- **Total**: ~10h (pode ser feito em 2-3 dias)

### Sucesso Significa
- ✅ 9 arquivos modulares (< 500 linhas cada)
- ✅ Schemas Zod implementados
- ✅ Todos endpoints funcionando
- ✅ Frontend sem alterações
- ✅ Performance igual ou melhor
- ✅ Zero downtime

### Próximo Passo
**Executar Etapa 0** - Preparação e Backup

---

**Data**: 30/11/2025  
**Status**: ✅ PLANO COMPLETO - PRONTO PARA EXECUÇÃO

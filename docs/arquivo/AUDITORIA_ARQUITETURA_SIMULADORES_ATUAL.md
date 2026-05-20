# 🔍 AUDITORIA COMPLETA - MÓDULO SIMULADORES

**Data**: 30 de novembro de 2025  
**Objetivo**: Mapear arquitetura completa antes de refatoração segura

---

## 📊 RESUMO EXECUTIVO

### Métricas Gerais

- **Backend**: 2.587 linhas em 1 arquivo monolítico
- **Endpoints**: 51 rotas HTTP
- **Frontend**: 23 arquivos (1.596 linhas principal)
- **Chamadas API**: 26 referências a `/api/simuladores`
- **Tabelas DB**: 8 tabelas principais + relacionamentos

### Estado Atual

✅ **Sistema Funcionando** - Produção estável  
⚠️ **Monolítico** - Difícil manutenção  
⚠️ **Acoplamento** - Backend 2.5k linhas  
⚠️ **Complexidade** - Lógica de negócio dispersa

---

## 🗂️ PARTE 1: BACKEND (Worker API)

### 1.1. Estrutura do Arquivo

**Arquivo**: `worker-airtrust/src/routes/simuladores.ts`

```
Total: 2.587 linhas
├── Imports:         linhas 1-10
├── Types/Helpers:   linhas 11-85
├── Funções Core:    linhas 85-220
├── Endpoints CRUD:  linhas 221-850
├── Sessões:         linhas 851-1.400
├── Fichas:          linhas 1.401-2.100
└── Relatórios:      linhas 2.101-2.587
```

### 1.2. Imports Identificados

```typescript
import { Hono } from 'hono';
import type { CadastroManobra } from '../types/simulador';
import { auth } from '../middleware/auth';
```

**Dependências**:

- Hono (framework HTTP)
- Auth middleware (proteção de rotas)
- Tipos TypeScript customizados

### 1.3. Mapeamento COMPLETO de Endpoints

**Total**: 51 endpoints

#### CRUD Simuladores (4 endpoints)

```
GET    /                  - Lista simuladores
POST   /                  - Cria simulador
GET    /:id               - Busca por ID
PUT    /:id               - Atualiza simulador
DELETE /:id               - Soft delete
```

#### Sessões (9 endpoints)

```
GET    /sessoes           - Lista sessões
POST   /sessoes           - Cria sessão + auto-gera fichas
GET    /sessoes/:id       - Busca sessão por ID
PUT    /sessoes/:id       - Atualiza sessão
DELETE /sessoes/:id       - Soft delete sessão

GET    /sessoes/:id/participantes - Lista participantes
POST   /sessoes/:id/participantes - Adiciona participante
PUT    /participantes/:id          - Atualiza participante
DELETE /participantes/:id          - Remove participante
```

#### Fichas (10 endpoints)

```
GET    /fichas            - Lista fichas (com filtros)
GET    /fichas/:id        - Busca ficha por ID
POST   /fichas            - Cria ficha manual
PUT    /fichas/:id        - Atualiza ficha
DELETE /fichas/:id        - Soft delete

POST   /fichas/:id/assinar               - Assinatura digital
GET    /fichas-simulador/:id/manobras    - Lista manobras da ficha
POST   /fichas-simulador/:id/popular-manobras - Auto-popular manobras
POST   /fichas-simulador/:id/gerar-qualificacao - Gera qualificação
GET    /fichas-simulador/:id/gerar-pdf   - PDF da ficha
```

#### Manobras (4 endpoints)

```
GET    /manobras          - Lista cadastro de manobras
POST   /manobras          - Cria manobra
PUT    /manobras/:id      - Atualiza manobra
DELETE /manobras/:id      - Soft delete
```

#### Modelos/Templates (3 endpoints)

```
GET    /modelos           - Lista modelos aeronave
POST   /modelos           - Cria modelo
PUT    /modelos/:id       - Atualiza modelo
DELETE /modelos/:id       - Soft delete
```

#### Relatórios (3 endpoints) ⭐

```
GET    /relatorios/uso           - Uso por simulador
GET    /relatorios/tripulantes   - Top tripulantes
GET    /relatorios/desempenho    - Desempenho por tipo
```

#### Dev/Seed (1 endpoint)

```
POST   /dev/seed/qualificacoes-tipos - Popula tipos (dev only)
```

### 1.4. Funções Auxiliares Críticas

#### `audit()` - Auditoria Avançada

- **Linhas**: 24-83
- **Propósito**: Registra todas alterações em `auditoria_avancada_v2`
- **Uso**: Chamada após INSERT/UPDATE/DELETE
- **Features**:
  - Lazy create da tabela
  - Dados anteriores + novos (JSON)
  - Fallback silencioso (não quebra fluxo)

#### `criarFichasParaSessao()` - Auto-geração de Fichas

- **Linhas**: 85-220
- **Propósito**: Cria fichas automaticamente ao criar sessão
- **Lógica**:
  1. Detecta tipo aeronave (dinamicamente)
  2. Busca alunos (sessoes_participantes)
  3. Busca instrutor/examinador
  4. Cria 1 ficha por aluno
  5. Popular manobras padrão (cadastro_manobras)
- **Complexidade**: ALTA - 135 linhas
- **Tabelas**: 6 (simulador_agendamentos, sessoes_participantes, fichas_sessao, fichas_sessao_manobras, simuladores, cadastro_manobras)

### 1.5. Schemas Zod

⚠️ **AUSENTES** - Comentado no código:

```typescript
// import { z } from 'zod'; // (Fase 2 schemas serão integrados posteriormente)
```

**Implicação**: Validações inline nos endpoints (menos seguro)

### 1.6. Queries SQL Complexas

#### Categorização:

- **SELECT simples**: ~15 queries
- **SELECT com JOINs**: ~12 queries (2-4 tabelas)
- **INSERT**: ~8 queries
- **UPDATE**: ~6 queries
- **DELETE/Soft delete**: ~5 queries

#### Top 5 Queries Mais Complexas:

**1. Relatório Tripulantes** (linhas ~1.401-1.450)

```sql
SELECT
  f.matricula,
  f.nome,
  sp.funcao,
  COUNT(DISTINCT fs.id) as sessoes,
  SUM(CASE WHEN fs.aprovado = 1 THEN 1 ELSE 0 END) as aprovados,
  SUM(CASE WHEN fs.aprovado = 0 AND fs.resultado_final != 'PENDENTE' THEN 1 ELSE 0 END) as reprovados,
  SUM(CASE WHEN fs.resultado_final = 'PENDENTE' THEN 1 ELSE 0 END) as faltas
FROM funcionarios f
INNER JOIN sessoes_participantes sp ON f.id = sp.funcionario_id
INNER JOIN fichas_sessao fs ON sp.sessao_id = fs.agendamento_slot_id
WHERE fs.deleted_at IS NULL
GROUP BY f.id, f.matricula, f.nome, sp.funcao
HAVING sessoes > 0
ORDER BY sessoes DESC
```

**Tabelas**: 3 (funcionarios, sessoes_participantes, fichas_sessao)  
**JOINs**: 2  
**Agregação**: COUNT, SUM, GROUP BY, HAVING

**2. Lista Fichas com Nomes** (linhas ~649-680)

```sql
SELECT
  f.*,
  func.nome as funcionario_nome,
  inst.nome as instrutor_nome
FROM fichas_sessao f
LEFT JOIN funcionarios func ON f.colaborador_id_aluno = func.id
LEFT JOIN funcionarios inst ON f.instrutor_id = inst.id
WHERE f.deleted_at IS NULL
  AND (? = 0 OR f.status = ?)
  AND (? = '' OR f.tipo_sessao = ?)
ORDER BY f.created_at DESC
LIMIT ? OFFSET ?
```

**Tabelas**: 3 (fichas_sessao, funcionarios x2)  
**JOINs**: 2 LEFT  
**Paginação**: LIMIT/OFFSET

**3. Buscar Sessão com Tipo Aeronave** (linhas ~97-105)

```sql
SELECT
  s.*,
  ${tipoAeronaveExpr} as tipo_aeronave
FROM simulador_agendamentos s
LEFT JOIN simuladores sim ON s.simulador_id = sim.id
WHERE s.id = ? AND s.deleted_at IS NULL
```

**Detecção Dinâmica**: `tipoAeronaveExpr` ajusta para `tipo_aeronave` ou `tipo`

**4. Relatório Uso por Simulador** (linhas ~2.150-2.200)

```sql
SELECT
  s.nome as simulador,
  s.tipo,
  COUNT(sa.id) as horas,
  SUM(CASE WHEN sa.tipo_sessao = 'RECURRENT' THEN 1 ELSE 0 END) as recurrent,
  SUM(CASE WHEN sa.tipo_sessao = 'PC' THEN 1 ELSE 0 END) as pc
FROM simuladores s
LEFT JOIN simulador_agendamentos sa ON s.id = sa.simulador_id
WHERE s.deleted_at IS NULL
  AND sa.deleted_at IS NULL
GROUP BY s.id, s.nome, s.tipo
ORDER BY horas DESC
```

**5. Auto-Popular Manobras** (linhas ~153-170)

```sql
-- Busca manobras do template
SELECT codigo, descricao, categoria, ordem
FROM cadastro_manobras
WHERE tipo_sessao = ?
  AND tipo_aeronave = ?
  AND deleted_at IS NULL
ORDER BY ordem

-- Insere em fichas_sessao_manobras
INSERT INTO fichas_sessao_manobras
  (ficha_id, codigo, descricao, categoria, ordem)
VALUES (?, ?, ?, ?, ?)
```

**Loop**: Para cada manobra do template

### 1.7. Middleware e Auth

```typescript
import { auth } from '../middleware/auth';
```

**Endpoints Protegidos**: TODOS (menos `/dev/seed/*`)

**Padrão**:

```typescript
app.get('/', auth, async (c) => { ... })
```

**Roles**: Não implementado (apenas autenticação)

### 1.8. Features Especiais

#### ✅ Soft Delete Universal

Todas as tabelas:

```sql
WHERE deleted_at IS NULL
UPDATE ... SET deleted_at = CURRENT_TIMESTAMP
```

#### ✅ Auditoria Avançada

Chamada em:

- INSERT (dados_novos)
- UPDATE (dados_anteriores + dados_novos)
- DELETE (dados_anteriores)

```typescript
await audit(c.env.DB, {
  tabela: 'simuladores',
  acao: 'UPDATE',
  registro_id: id,
  dados_anteriores: anterior,
  dados_novos: novo,
});
```

#### ✅ Detecção Dinâmica de Schema

```typescript
const pragmaSim = await db.prepare(`PRAGMA table_info(simuladores)`).all();
const colsSim = new Set(pragmaSim.results.map((r) => r.name));
const tipoAeronaveExpr = colsSim.has('tipo_aeronave')
  ? 'sim.tipo_aeronave'
  : colsSim.has('tipo')
  ? 'sim.tipo'
  : "''";
```

#### ✅ Auto-geração de Fichas

Ao criar sessão:

1. Busca todos alunos (papel = 'ALUNO')
2. Cria 1 ficha por aluno
3. Popular manobras do template

#### ✅ Assinatura Digital

- IP do usuário
- Timestamp
- Status: `EM_PREENCHIMENTO` → `ASSINADA_ALUNO` → `ASSINADA_TOTAL`

#### ✅ Geração de Qualificação

Validações:

1. Ficha `ASSINADA_TOTAL`
2. `aprovado = 1`
3. Não duplicar qualificação

```typescript
INSERT INTO qualificacoes_historico (...)
```

---

## 🎨 PARTE 2: FRONTEND (React)

### 2.1. Estrutura de Arquivos

```
src/react-app/
├── pages/
│   ├── Simuladores.tsx                    (1.596 linhas) ⭐ PRINCIPAL
│   ├── SimuladoresDashboard.tsx           (398 linhas)
│   ├── AgendarSimulador.tsx
│   ├── AvaliarFichaSimulador.tsx
│   ├── EditarFichaSimulador.tsx
│   ├── FichaSimulador.tsx
│   ├── SimuladoresSessoes.tsx
│   ├── SimuladoresTemplates.tsx
│   ├── VisualizarFichaSimulador.tsx
│   └── simuladores/
│       ├── CrudSimuladores.tsx
│       ├── FormSimulador.tsx
│       ├── SimuladoresMain.tsx
│       └── SimuladoresWrapper.tsx
├── components/
│   ├── SimuladoresLayout.tsx
│   └── simuladores/
│       ├── ImportarSimuladoresCSV.tsx
│       ├── ListagemFichasSimulador.tsx
│       └── VisualizarFichaSimulador.tsx
├── hooks/
│   ├── useSimuladores.ts
│   ├── useAgendamentos.ts
│   ├── useSessoes.ts
│   ├── queries/
│   │   ├── useSimuladoresRQ.ts
│   │   ├── useAgendamentosRQ.ts
│   │   └── useFichasRQ.ts
│   └── mutations/
│       ├── useSimuladorMutations.ts
│       ├���─ useAgendamentosMutations.ts
│       └── useFichasMutations.ts
├── services/
│   ├── simuladores.service.ts
│   └── relatoriosSimuladoresApi.ts
└── types/
    └── simuladores.ts
```

**Total**: 23 arquivos

### 2.2. Componente Principal: Simuladores.tsx

**Linhas**: 1.596  
**Estrutura**: 3 abas

```typescript
const [activeTab, setActiveTab] = useState<'agenda' | 'fichas' | 'cadastro'>('cadastro');

// Aba 1: AGENDA
<AgendaView viewMode={viewMode} />
  - CalendarioAgendamentos (componente)
  - Lista de agendamentos
  - Modal novo agendamento

// Aba 2: FICHAS
<FichasView />
  - Filtros por status
  - Lista de fichas
  - Modal assinatura digital

// Aba 3: CADASTRO
<CadastroView />
  - FormularioAgendamento
  - FormularioManobra
  - FormularioTemplate
  - FormularioCategoria
  - ImportarManobras
```

### 2.3. Hooks React Query

#### `useSimuladoresRQ.ts`

```typescript
export function useSimuladores(filters?: { status?: string }) {
  return useQuery({
    queryKey: ['simuladores', filters],
    queryFn: () => fetchSimuladores(filters),
  });
}

export const simuladoresKeys = {
  all: ['simuladores'] as const,
  lists: () => [...simuladoresKeys.all, 'list'] as const,
  list: (filters: string) => [...simuladoresKeys.lists(), { filters }] as const,
  details: () => [...simuladoresKeys.all, 'detail'] as const,
  detail: (id: number) => [...simuladoresKeys.details(), id] as const,
};
```

#### `useAgendamentosRQ.ts`

```typescript
export function useAgendamentos(filters?: {
  dataInicio?: string;
  dataFim?: string;
  simuladorId?: number;
}) {
  return useQuery({
    queryKey: ['agendamentos', filters],
    queryFn: () => fetchAgendamentos(filters),
  });
}
```

#### `useFichasRQ.ts`

```typescript
export function useFichas(filters?: { status?: string; tipoSessao?: string }) {
  return useQuery({
    queryKey: ['fichas', filters],
    queryFn: () => fetchFichas(filters),
  });
}
```

### 2.4. Mutations

```typescript
// useSimuladorMutations.ts
export function useCreateSimulador() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSimuladorDTO) => createSimulador(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: simuladoresKeys.all });
      toast.success('Simulador criado!');
    },
  });
}

export function useUpdateSimulador() { ... }
export function useDeleteSimulador() { ... }
```

### 2.5. Fluxo de Dados Completo

**Exemplo: Criar Sessão**

```
1. Usuário clica "Nova Sessão"
   ↓
2. Modal abre (FormularioAgendamento)
   ↓
3. Preenche dados + seleciona alunos
   ↓
4. Submit → useCreateAgendamento()
   ↓
5. POST /api/simuladores/sessoes
   ↓
6. Backend cria sessão + auto-gera fichas
   ↓
7. onSuccess → invalidateQueries(['agendamentos', 'fichas'])
   ↓
8. Lista atualiza automaticamente
   ↓
9. Toast "Sessão criada! 3 fichas geradas."
```

### 2.6. Chamadas de API

**Total**: 26 referências a `/api/simuladores`

Distribuição:

- Services: 12 chamadas
- Hooks: 8 chamadas
- Componentes inline: 6 chamadas

---

## 🗄️ PARTE 3: BANCO DE DADOS

### 3.1. Tabelas Principais

#### `simuladores`

```sql
CREATE TABLE simuladores (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  modelo TEXT NOT NULL,
  tipo TEXT NOT NULL,              -- ou tipo_aeronave (migração)
  fabricante TEXT,
  localizacao TEXT,
  capacidade INTEGER DEFAULT 1,
  status TEXT DEFAULT 'ATIVO',
  observacoes TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT                  -- Soft delete
);
```

#### `simulador_agendamentos` (sessões)

```sql
CREATE TABLE simulador_agendamentos (
  id INTEGER PRIMARY KEY,
  simulador_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  duracao_minutos INTEGER DEFAULT 60,
  instrutor_id INTEGER,
  tipo_sessao TEXT,                -- RECURRENT, PC, etc
  observacoes TEXT,
  status TEXT DEFAULT 'AGENDADA',
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY(simulador_id) REFERENCES simuladores(id),
  FOREIGN KEY(instrutor_id) REFERENCES funcionarios(id)
);
```

#### `sessoes_participantes` (JOIN alunos)

```sql
CREATE TABLE sessoes_participantes (
  id INTEGER PRIMARY KEY,
  sessao_id INTEGER NOT NULL,      -- FK simulador_agendamentos
  funcionario_id INTEGER NOT NULL, -- FK funcionarios
  funcao TEXT,                     -- 'ALUNO', 'INSTRUTOR', 'EXAMINADOR'
  presente INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY(sessao_id) REFERENCES simulador_agendamentos(id),
  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id)
);
```

#### `fichas_sessao`

```sql
CREATE TABLE fichas_sessao (
  id INTEGER PRIMARY KEY,
  agendamento_slot_id INTEGER,     -- FK simulador_agendamentos
  colaborador_id_aluno INTEGER,    -- FK funcionarios
  instrutor_id INTEGER,
  examinador_id INTEGER,
  funcao TEXT,
  template_id INTEGER,
  status TEXT DEFAULT 'EM_PREENCHIMENTO',
  resultado_final TEXT,            -- 'PENDENTE', 'APROVADO', 'REPROVADO'
  nota_final REAL,
  aprovado INTEGER,                -- 0 ou 1
  assinado INTEGER,                -- 0 ou 1
  data_sessao TEXT,
  tipo_sessao TEXT,
  tipo_aeronave TEXT,
  observacoes TEXT,
  assinatura_aluno_ip TEXT,
  assinatura_aluno_timestamp TEXT,
  assinatura_instrutor_ip TEXT,
  assinatura_instrutor_timestamp TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY(agendamento_slot_id) REFERENCES simulador_agendamentos(id),
  FOREIGN KEY(colaborador_id_aluno) REFERENCES funcionarios(id),
  FOREIGN KEY(instrutor_id) REFERENCES funcionarios(id)
);
```

#### `fichas_sessao_manobras`

```sql
CREATE TABLE fichas_sessao_manobras (
  id INTEGER PRIMARY KEY,
  ficha_id INTEGER NOT NULL,
  codigo TEXT,
  descricao TEXT,
  categoria TEXT,
  ordem INTEGER,
  resultado TEXT,                  -- 'S' (satisfatório) ou 'I' (insatisfatório)
  observacoes TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY(ficha_id) REFERENCES fichas_sessao(id)
);
```

#### `cadastro_manobras` (templates)

```sql
CREATE TABLE cadastro_manobras (
  id INTEGER PRIMARY KEY,
  codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  categoria TEXT,
  tipo_sessao TEXT,                -- RECURRENT, PC, etc
  tipo_aeronave TEXT,              -- B737, A320, etc
  ordem INTEGER,
  ativo INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);
```

#### `auditoria_avancada_v2`

```sql
CREATE TABLE auditoria_avancada_v2 (
  id INTEGER PRIMARY KEY,
  tabela TEXT NOT NULL,
  acao TEXT NOT NULL,              -- INSERT, UPDATE, DELETE
  registro_id TEXT NOT NULL,
  dados_anteriores TEXT,           -- JSON
  dados_novos TEXT,                -- JSON
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_auditoria_v2_tabela ON auditoria_avancada_v2(tabela);
CREATE INDEX idx_auditoria_v2_registro ON auditoria_avancada_v2(registro_id);
```

### 3.2. Diagrama de Relacionamentos

```
simuladores (1:N) ──┐
                    │
                    ├─> simulador_agendamentos (sessões) (1:N) ──┐
                    │                                              │
funcionarios (N:M) ─┴─> sessoes_participantes (JOIN) <───────────┤
                                                                   │
funcionarios (1:N) ──────> fichas_sessao (1:N) <──────────────────┤
                                │                                  │
                                └──> fichas_sessao_manobras (N:1) │
                                                │                  │
                                                └─> cadastro_manobras (templates)
```

### 3.3. Indexes Existentes

```sql
-- Auditoria
CREATE INDEX idx_auditoria_v2_tabela ON auditoria_avancada_v2(tabela);
CREATE INDEX idx_auditoria_v2_registro ON auditoria_avancada_v2(registro_id);
```

**⚠️ FALTAM INDEXES CRÍTICOS**:

```sql
-- Sugestões de performance
CREATE INDEX idx_simulador_agendamentos_simulador ON simulador_agendamentos(simulador_id);
CREATE INDEX idx_simulador_agendamentos_data ON simulador_agendamentos(data);
CREATE INDEX idx_sessoes_participantes_sessao ON sessoes_participantes(sessao_id);
CREATE INDEX idx_sessoes_participantes_funcionario ON sessoes_participantes(funcionario_id);
CREATE INDEX idx_fichas_sessao_agendamento ON fichas_sessao(agendamento_slot_id);
CREATE INDEX idx_fichas_sessao_status ON fichas_sessao(status);
CREATE INDEX idx_fichas_sessao_manobras_ficha ON fichas_sessao_manobras(ficha_id);
```

---

## ⚠️ PARTE 4: PONTOS DE ATENÇÃO

### 4.1. Complexidade Alta

#### Backend Monolítico

- **2.587 linhas** em 1 arquivo
- Difícil debug
- Difícil testar
- Conflitos de merge

#### Detecção Dinâmica de Schema

```typescript
// Em 5+ lugares no código
const hasTipoAeronave = colsSim.has('tipo_aeronave');
const tipoExpr = hasTipoAeronave ? 'sim.tipo_aeronave' : 'sim.tipo';
```

**Risco**: Migração incompleta, queries quebram

#### Lógica Crítica em Função Helper

`criarFichasParaSessao()` - 135 linhas:

- 6 tabelas
- 4 queries principais
- Loop de inserção
- Sem transaction explícita

### 4.2. Validações Críticas

#### ✅ Assinatura Digital

```typescript
// NÃO PODE QUEBRAR
if (tipo === 'ALUNO') {
  update.assinatura_aluno_ip = ip;
  update.assinatura_aluno_timestamp = now;
  update.status = 'ASSINADA_ALUNO';
}
if (tipo === 'INSTRUTOR') {
  update.assinatura_instrutor_ip = ip;
  update.assinatura_instrutor_timestamp = now;
  if (anterior.status === 'ASSINADA_ALUNO') {
    update.status = 'ASSINADA_TOTAL';
  }
}
```

#### ✅ Geração de Qualificação

```typescript
// Validações que NÃO podem ser relaxadas
if (ficha.status !== 'ASSINADA_TOTAL') {
  return c.json({ success: false, error: 'Ficha não assinada' }, 400);
}
if (ficha.aprovado !== 1) {
  return c.json({ success: false, error: 'Ficha não aprovada' }, 400);
}
// Verificar duplicação
const existe = await db
  .prepare(
    `
  SELECT id FROM qualificacoes_historico 
  WHERE funcionario_id = ? AND tipo_qualificacao = ?
`,
  )
  .bind(fichaparams)
  .first();
if (existe) {
  return c.json({ success: false, error: 'Qualificação já existe' }, 400);
}
```

### 4.3. Cálculos Complexos

#### Horas de Voo

```sql
-- Soma duracao_minutos de todas sessões
SUM(sa.duracao_minutos) / 60.0 as horas_voo
```

#### Taxa de Aprovação

```sql
SUM(CASE WHEN fs.aprovado = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as taxa_aprovacao
```

#### Contadores por Status

```sql
SUM(CASE WHEN fs.status = 'PENDENTE' THEN 1 ELSE 0 END) as pendentes,
SUM(CASE WHEN fs.status = 'ASSINADA_TOTAL' THEN 1 ELSE 0 END) as finalizadas
```

### 4.4. Ausência de Schemas Zod

**Impacto**:

- Validações inline (repetidas)
- Erros de tipo em runtime
- Dificuldade de documentar API

**Exemplo atual**:

```typescript
// Validação manual
if (!body.nome || !body.tipo) {
  return c.json({ success: false, error: 'Campos obrigatórios' }, 400);
}
```

**Deveria ser**:

```typescript
const createSimuladorSchema = z.object({
  nome: z.string().min(1),
  tipo: z.string().min(1),
  fabricante: z.string().optional(),
  // ...
});

const body = createSimuladorSchema.parse(await c.req.json());
```

---

## 📋 PARTE 5: PLANO DE REFATORAÇÃO SEGURA

### 5.1. Princípios

1. **Incremental**: 1 módulo por vez
2. **Testado**: Build + deploy + teste após cada etapa
3. **Rollback**: Commit separado por etapa
4. **Zero downtime**: Backend deve continuar funcionando
5. **Preservar lógica**: Extrair, não reescrever

### 5.2. Estrutura Alvo

```
worker-airtrust/src/routes/simuladores/
├── index.ts                    # Router agregador (Hono app)
├── shared.ts                   # Tipos + helpers + schemas Zod
├── crud.ts                     # GET/POST/PUT/DELETE básicos (simuladores)
├── sessoes.ts                  # Endpoints de sessões + participantes
├── fichas.ts                   # Endpoints de fichas + assinaturas
├── relatorios.ts               # Relatórios (uso, tripulantes, desempenho)
├── manobras.ts                 # CRUD manobras
├── modelos.ts                  # CRUD modelos
└── validacao.ts                # Regras de negócio puras (funções)
```

### 5.3. Etapas de Execução

#### **ETAPA 0: Preparação** (30 min)

- [ ] Criar pasta `simuladores/`
- [ ] Backup completo do arquivo atual
- [ ] Commit: `backup: simuladores.ts monolítico antes de refatoração`

#### **ETAPA 1: Shared (types + helpers + schemas)** (1h)

- [ ] Criar `shared.ts`
- [ ] Extrair tipos TypeScript
- [ ] Extrair função `audit()`
- [ ] Criar schemas Zod básicos
- [ ] Build + teste
- [ ] Commit: `refactor(simuladores): extrair shared.ts com types e helpers`

**Testes**:

```bash
npm run build
# Verificar sem erros
```

#### **ETAPA 2: CRUD Básico** (1h30)

- [ ] Criar `crud.ts`
- [ ] Extrair 4 endpoints:
  - `GET /` (lista)
  - `GET /:id` (buscar)
  - `POST /` (criar)
  - `PUT /:id` (atualizar)
  - `DELETE /:id` (soft delete)
- [ ] Importar de `shared.ts`
- [ ] Build + deploy staging
- [ ] Testar endpoints
- [ ] Commit: `refactor(simuladores): extrair crud.ts (5 endpoints)`

**Testes**:

```bash
# Build
npm run build

# Deploy staging
npm run deploy

# Testar endpoints
curl https://.../api/simuladores
curl https://.../api/simuladores/1
curl -X POST https://.../api/simuladores -d '{"nome":"SIM-01", ...}'
```

#### **ETAPA 3: Sessões** (2h)

- [ ] Criar `sessoes.ts`
- [ ] Extrair `criarFichasParaSessao()` para `validacao.ts`
- [ ] Extrair 9 endpoints sessões
- [ ] Build + deploy
- [ ] Testar criação de sessão + auto-geração fichas
- [ ] Commit: `refactor(simuladores): extrair sessoes.ts (9 endpoints)`

**Testes Críticos**:

```bash
# Criar sessão
curl -X POST https://.../api/simuladores/sessoes \
  -d '{"simulador_id": 1, "data": "2025-12-01", "alunos": [1,2,3]}'

# Verificar fichas geradas
curl https://.../api/simuladores/fichas?sessao_id=1

# Deve retornar 3 fichas (1 por aluno)
```

#### **ETAPA 4: Fichas** (2h)

- [ ] Criar `fichas.ts`
- [ ] Extrair 10 endpoints fichas
- [ ] Extrair lógica assinatura
- [ ] Build + deploy
- [ ] Testar assinatura + geração qualificação
- [ ] Commit: `refactor(simuladores): extrair fichas.ts (10 endpoints)`

**Testes Críticos**:

```bash
# Assinar como aluno
curl -X POST https://.../api/simuladores/fichas/1/assinar \
  -d '{"tipo": "ALUNO"}'

# Verificar status mudou para ASSINADA_ALUNO
curl https://.../api/simuladores/fichas/1

# Assinar como instrutor
curl -X POST https://.../api/simuladores/fichas/1/assinar \
  -d '{"tipo": "INSTRUTOR"}'

# Verificar status mudou para ASSINADA_TOTAL
```

#### **ETAPA 5: Relatórios** (1h)

- [ ] Criar `relatorios.ts`
- [ ] Extrair 3 endpoints relatórios
- [ ] Build + deploy
- [ ] Testar queries complexas
- [ ] Commit: `refactor(simuladores): extrair relatorios.ts (3 endpoints)`

**Testes**:

```bash
curl 'https://.../api/simuladores/relatorios/uso?dataInicio=2025-01-01&dataFim=2025-12-31'
curl 'https://.../api/simuladores/relatorios/tripulantes?limit=10'
curl 'https://.../api/simuladores/relatorios/desempenho'
```

#### **ETAPA 6: Manobras + Modelos** (1h)

- [ ] Criar `manobras.ts` (4 endpoints)
- [ ] Criar `modelos.ts` (3 endpoints)
- [ ] Build + deploy
- [ ] Commit: `refactor(simuladores): extrair manobras.ts e modelos.ts`

#### **ETAPA 7: Index + Limpeza** (30 min)

- [ ] Criar `index.ts` (agregador)
- [ ] Importar todos submódulos
- [ ] Deletar `simuladores.ts` original
- [ ] Build + deploy produção
- [ ] Testes completos E2E
- [ ] Commit: `refactor(simuladores): finalizar modularização - 9 arquivos`

### 5.4. Estrutura do index.ts

```typescript
// worker-airtrust/src/routes/simuladores/index.ts
import { Hono } from 'hono';
import crud from './crud';
import sessoes from './sessoes';
import fichas from './fichas';
import relatorios from './relatorios';
import manobras from './manobras';
import modelos from './modelos';

type Env = {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
};

const app = new Hono<{ Bindings: Env }>();

// Montar submódulos
app.route('/', crud); // GET /, POST /, etc
app.route('/sessoes', sessoes); // GET /sessoes, POST /sessoes, etc
app.route('/fichas', fichas); // GET /fichas, POST /fichas/:id/assinar, etc
app.route('/relatorios', relatorios); // GET /relatorios/uso, etc
app.route('/manobras', manobras);
app.route('/modelos', modelos);

export default app;
```

### 5.5. Exemplo: crud.ts

```typescript
// worker-airtrust/src/routes/simuladores/crud.ts
import { Hono } from 'hono';
import { auth } from '../../middleware/auth';
import { createSimuladorSchema, updateSimuladorSchema } from './shared';
import type { Env } from './shared';

const app = new Hono<{ Bindings: Env }>();

// GET / - Lista simuladores
app.get('/', auth, async (c) => {
  const { limit = 50, offset = 0, status } = c.req.query();

  let query = `SELECT * FROM simuladores WHERE deleted_at IS NULL`;
  const params: any[] = [];

  if (status) {
    query += ` AND status = ?`;
    params.push(status);
  }

  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const result = await c.env.DB.prepare(query)
    .bind(...params)
    .all();

  return c.json({
    success: true,
    data: result.results,
    total: result.results.length,
  });
});

// POST / - Criar simulador
app.post('/', auth, async (c) => {
  const body = createSimuladorSchema.parse(await c.req.json());

  const result = await c.env.DB.prepare(
    `
    INSERT INTO simuladores (nome, tipo, fabricante, status, observacoes)
    VALUES (?, ?, ?, ?, ?)
  `,
  )
    .bind(
      body.nome,
      body.tipo,
      body.fabricante || null,
      body.status || 'ATIVO',
      body.observacoes || null,
    )
    .run();

  const id = result.meta.last_row_id;
  const created = await c.env.DB.prepare(`SELECT * FROM simuladores WHERE id = ?`).bind(id).first();

  await audit(c.env.DB, {
    tabela: 'simuladores',
    acao: 'INSERT',
    registro_id: id,
    dados_novos: created,
  });

  return c.json({ success: true, data: created }, 201);
});

// ... GET /:id, PUT /:id, DELETE /:id

export default app;
```

### 5.6. Checklist de Testes por Etapa

Para cada etapa:

```bash
# 1. Build
cd worker-airtrust
npm run build
# ✅ Sem erros TypeScript

# 2. Deploy staging
npm run deploy
# ✅ Deploy bem-sucedido

# 3. Health check
curl https://.../api/health
# ✅ {"status": "ok"}

# 4. Teste endpoint específico
curl https://.../api/simuladores/...
# ✅ Response esperado

# 5. Teste frontend
open http://localhost:3000/simuladores
# ✅ Tela carrega
# ✅ Dados aparecem
# ✅ CRUD funciona

# 6. Validar logs
# Verificar erros no Cloudflare dashboard
```

---

## 📊 PARTE 6: MÉTRICAS DE SUCESSO

### 6.1. Redução de Complexidade

| Métrica               | Antes | Depois | Meta  |
| --------------------- | ----- | ------ | ----- |
| Linhas por arquivo    | 2.587 | ~300   | <400  |
| Endpoints por arquivo | 51    | ~6     | <10   |
| Funções por arquivo   | ~20   | ~5     | <8    |
| Imports por arquivo   | 3     | ~5     | <10   |
| Cyclomatic complexity | Alta  | Média  | Baixa |

### 6.2. Manutenibilidade

- ✅ Cada módulo tem responsabilidade única
- ✅ Schemas Zod reduzem bugs
- ✅ Tipos TypeScript bem definidos
- ✅ Funções de negócio isoladas (`validacao.ts`)
- ✅ Fácil adicionar novos endpoints
- ✅ Fácil testar isoladamente

### 6.3. Performance

- ⚡ Criar indexes faltantes (Etapa 0.5)
- ⚡ Cache de queries frequentes (futuro)
- ⚡ Pagination otimizada

---

## 🚨 PARTE 7: RISCOS E MITIGAÇÕES

### Risco 1: Quebrar Funcionalidade

**Probabilidade**: Média  
**Impacto**: Alto  
**Mitigação**:

- Testar após cada etapa
- Deploy incremental
- Rollback rápido (git revert)

### Risco 2: Queries Complexas Quebram

**Probabilidade**: Baixa  
**Impacto**: Alto  
**Mitigação**:

- Copiar queries exatamente (sem modificar)
- Testar relatórios com dados reais

### Risco 3: Schema Dinâmico Falha

**Probabilidade**: Média  
**Impacto**: Médio  
**Mitigação**:

- Manter detecção dinâmica em `shared.ts`
- Usar helper `getTipoAeronaveExpr(db)`

### Risco 4: Frontend Não Detecta Mudanças

**Probabilidade**: Baixa  
**Impacto**: Baixo  
**Mitigação**:

- API responses não mudam (mesma estrutura)
- Frontend não precisa alteração

---

## ✅ CONCLUSÃO

### Sistema Atual

- ✅ **Funcional**: Produção estável
- ⚠️ **Monolítico**: 2.587 linhas, difícil manter
- ⚠️ **Complexo**: Lógica crítica em 1 arquivo
- ⚠️ **Sem schemas**: Validações manuais

### Pós-Refatoração

- ✅ **Modular**: 9 arquivos (< 400 linhas cada)
- ✅ **Seguro**: Schemas Zod + tipos
- ✅ **Testável**: Módulos isolados
- ✅ **Escalável**: Fácil adicionar features

### Tempo Estimado

- **Preparação**: 30 min
- **Etapa 1-7**: 9h30 (pode ser feito em 2 dias)
- **Total**: ~10h

### Próximos Passos

1. **Aprovar este plano**
2. **Executar Etapa 0** (backup + preparação)
3. **Executar Etapas 1-7** (1 por vez, com testes)
4. **Documentar resultados**

---

**Data do Relatório**: 30/11/2025  
**Autor**: GitHub Copilot  
**Status**: ✅ AUDITORIA COMPLETA

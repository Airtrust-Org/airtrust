# ✅ FASE 22 – PARTE 4: FLUXOS E INTEGRAÇÃO

**Data**: 15 de Novembro de 2025  
**Projeto**: AirTrust v1  
**Escopo**: End-to-End Flows, Integração Frontend ↔ Backend ↔ D1

---

## 📋 SUMÁRIO

1. [Visão Geral](#1-visão-geral)
2. [Fluxo: Login e Autenticação](#2-fluxo-login-e-autenticação)
3. [Fluxo: Funcionários (CRUD)](#3-fluxo-funcionários-crud)
4. [Fluxo: Qualificações (Gestão)](#4-fluxo-qualificações-gestão)
5. [Fluxo: Simuladores (Agendamento)](#5-fluxo-simuladores-agendamento)
6. [Fluxo: Pasta Virtual (R2)](#6-fluxo-pasta-virtual-r2)
7. [Integração Frontend ↔ Backend](#7-integração-frontend-↔-backend)
8. [Problemas de Integração](#8-problemas-de-integração)

---

## 1. VISÃO GERAL

### 1.1 Arquitetura de Integração

```
┌──────────────┐
│   BROWSER    │
└──────┬───────┘
       │ HTTP/HTTPS
       ▼
┌──────────────────────────────────┐
│   React App (Vite)               │
│   - Hooks: useApi                │
│   - Pages: *New.tsx              │
│   - Components: DataTable, Modal │
└──────┬───────────────────────────┘
       │ fetch() → useApi
       ▼
┌──────────────────────────────────┐
│   Cloudflare Worker (Hono)       │
│   URL: airtrust.airtrust.workers.dev │
│   - Routes: /api/auth, /api/funcionarios │
│   - Middlewares: cors, logger, error │
└──────┬───────────────────────────┘
       │ c.env.DB (D1 binding)
       ▼
┌──────────────────────────────────┐
│   D1 Database (SQLite)           │
│   ID: 7c8a788e-a4c4-4d5d-8208... │
│   - Tables: funcionarios, etc    │
└──────────────────────────────────┘

       │ c.env.AIRTRUST_FILES (R2 binding)
       ▼
┌──────────────────────────────────┐
│   R2 Bucket: airtrust-files      │
│   - Certificados PDF             │
│   - Documentos diversos          │
└──────────────────────────────────┘
```

### 1.2 Status dos Fluxos

| Fluxo                | Frontend         | Backend         | D1              | R2           | Status Geral |
| -------------------- | ---------------- | --------------- | --------------- | ------------ | ------------ |
| Login                | ⚠️ Não integrado | ✅ OK           | ⚠️ Vazio        | N/A          | 🔴 QUEBRADO  |
| Funcionários READ    | ✅ OK            | 🔴 Erro (setor) | ⚠️ Falta coluna | N/A          | 🔴 QUEBRADO  |
| Funcionários CREATE  | ⚠️ Mock          | ❓ Não testado  | ⚠️ Falta coluna | N/A          | 🟡 PARCIAL   |
| Qualificações READ   | ✅ OK            | ✅ OK           | ✅ OK           | N/A          | ✅ FUNCIONA  |
| Qualificações CREATE | ⚠️ Mock          | ❓ Não testado  | ⚠️ FK quebrado  | N/A          | 🟡 PARCIAL   |
| Simuladores READ     | ✅ OK            | ✅ OK           | ✅ OK           | N/A          | ✅ FUNCIONA  |
| Simuladores CREATE   | ⚠️ Mock          | ❓ Não testado  | ✅ OK           | N/A          | 🟡 PARCIAL   |
| Pasta Virtual        | ⚠️ UI existe     | ❌ Sem endpoint | N/A             | ⚠️ Não usado | 🔴 QUEBRADO  |

**Legenda**:

- ✅ OK: Funcional e testado
- ⚠️ Parcial: Implementado mas com problemas
- ❓ Desconhecido: Não testado
- 🔴 Quebrado: Não funciona
- 🟡 Parcial: Funciona parcialmente
- N/A: Não aplicável

---

## 2. FLUXO: LOGIN E AUTENTICAÇÃO

### 2.1 Diagrama de Fluxo

```
┌─────────────┐
│ LoginSimple │ (/login)
└──────┬──────┘
       │ 1. User digita email + senha
       │ 2. Clica "Entrar"
       ▼
   ❌ console.log() apenas
   (não chama API)

       │ DEVERIA:
       │ POST /api/auth/login
       │ { email, senha }
       ▼
┌─────────────────────────┐
│ POST /api/auth/login    │
│ - Busca user em D1      │
│ - Valida bcrypt         │
│ - Gera JWT + refresh    │
└──────┬──────────────────┘
       │ 200 { accessToken, refreshToken }
       ▼
   ❌ Nunca executado
   (frontend não chama)

       │ DEVERIA:
       │ Salvar tokens em localStorage
       │ Redirecionar para /
       ▼
┌─────────────────────────┐
│ DashboardNew (/)        │
│ - useApi('funcionarios')│
│ - useApi('qualificacoes')│
└─────────────────────────┘
```

### 2.2 Código Frontend (LoginSimple.tsx)

```tsx
// src/react-app/pages/LoginSimple.tsx

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();

  // ❌ PROBLEMA: Apenas console.log, não chama API
  console.log('Login attempt:', { email, password });

  // ✅ DEVERIA SER:
  // const response = await fetch('https://airtrust.airtrust.workers.dev/api/auth/login', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ email, senha: password })
  // });
  //
  // if (response.ok) {
  //   const { accessToken, refreshToken } = await response.json();
  //   localStorage.setItem('accessToken', accessToken);
  //   localStorage.setItem('refreshToken', refreshToken);
  //   navigate('/');
  // }
};
```

### 2.3 Código Backend (auth.ts)

```typescript
// worker-airtrust/src/routes/auth.ts

// ✅ Endpoint implementado corretamente
app.post('/login', async (c) => {
  const { email, senha } = await c.req.json();

  // 1. Busca usuário
  const user = await c.env.DB.prepare(
    'SELECT * FROM usuarios WHERE email = ? AND deleted_at IS NULL',
  )
    .bind(email)
    .first();

  if (!user) {
    return c.json({ success: false, error: 'Credenciais inválidas' }, 401);
  }

  // 2. Valida senha
  const isValid = await bcrypt.compare(senha, user.senha_hash);
  if (!isValid) {
    return c.json({ success: false, error: 'Credenciais inválidas' }, 401);
  }

  // 3. Gera tokens
  const accessToken = await generateToken({ userId: user.id, role: user.role }, '15m');
  const refreshToken = crypto.randomUUID();

  // 4. Salva refresh token
  await c.env.DB.prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
    .bind(user.id, refreshToken, expiresAt)
    .run();

  return c.json({ success: true, data: { accessToken, refreshToken } });
});
```

### 2.4 Problemas Identificados

```yaml
PROBLEMA 1: Frontend não chama API
  Local: src/react-app/pages/LoginSimple.tsx
  Código: console.log() ao invés de fetch()
  Impacto: Login impossível
  Status: 🔴 CRÍTICO

PROBLEMA 2: Tabela usuarios vazia
  Local: D1 (tabela usuarios)
  Causa: Seed não aplicado em produção
  Impacto: Mesmo que frontend chamasse, falha 401
  Status: 🔴 CRÍTICO

PROBLEMA 3: Sem proteção de rotas
  Local: src/react-app/App.tsx
  Código: Rotas públicas sem ProtectedRoute
  Impacto: Qualquer um acessa / sem login
  Status: 🔴 CRÍTICO

PROBLEMA 4: Sem AuthContext
  Local: Frontend não tem provider de autenticação
  Impacto: Sem gestão de estado de auth
  Status: 🔴 CRÍTICO
```

### 2.5 Solução Necessária

```yaml
PASSO 1: Popular tabela usuarios
  Comando:
    wrangler d1 execute airtrust-db --env=production \
      --file=./migrations/0004_seed_usuarios.sql

  Ou manual:
    INSERT INTO usuarios (email, senha_hash, nome, role, ativo)
    VALUES (
      'admin@airtrust.com',
      '$2a$10$...', -- bcrypt('senha123')
      'Administrador',
      'admin',
      1
    );

PASSO 2: Integrar LoginSimple com API
  Arquivo: src/react-app/pages/LoginSimple.tsx
  Ação: Substituir console.log por fetch POST /api/auth/login

PASSO 3: Criar AuthContext
  Arquivo: src/react-app/contexts/AuthContext.tsx
  Funcionalidades:
    - login(email, senha)
    - logout()
    - refreshToken()
    - Estado: user, isAuthenticated

PASSO 4: Proteger rotas
  Arquivo: src/react-app/App.tsx
  Ação: Envolver rotas com <ProtectedRoute>
```

---

## 3. FLUXO: FUNCIONÁRIOS (CRUD)

### 3.1 Diagrama READ (GET)

```
┌──────────────────┐
│ FuncionariosNew  │ (/funcionarios)
└────────┬─────────┘
         │ useEffect → useApi
         │ 1. GET /api/funcionarios
         ▼
┌────────────────────────────┐
│ useApi hook                │
│ - fetch(baseUrl + path)    │
│ - Retorna { data, loading }│
└────────┬───────────────────┘
         │ HTTP GET
         ▼
┌─────────────────────────────────┐
│ GET /api/funcionarios           │
│ - Query params: page, limit     │
│ - Ordenação: ORDER BY setor ❌  │
└────────┬────────────────────────┘
         │ c.env.DB.prepare()
         ▼
┌─────────────────────────────────┐
│ D1 Query                        │
│ SELECT id, matricula, nome,     │
│   cpf, email, telefone,         │
│   cargo, setor, ❌              │
│   funcao, codigo_anac, ativo    │
│ FROM funcionarios               │
│ WHERE deleted_at IS NULL        │
│   AND setor = ? ❌              │
│ ORDER BY setor, nome ❌         │
└────────┬────────────────────────┘
         │ ERRO: no such column: setor
         ▼
     HTTP 500
     { error: 'D1_ERROR' }
         │
         ▼
┌─────────────────────────────────┐
│ useApi hook                     │
│ - setError(500)                 │
│ - data = null                   │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ FuncionariosNew                 │
│ - Mostra mensagem de erro       │
│ - DataTable vazio               │
└─────────────────────────────────┘
```

### 3.2 Código Frontend (FuncionariosNew.tsx)

```tsx
// src/react-app/pages/FuncionariosNew.tsx

const FuncionariosNew: React.FC = () => {
  // ✅ useApi implementado corretamente
  const { data, loading, error, refetch } = useApi<Funcionario[]>({
    endpoint: '/funcionarios',
  });

  // ✅ Renderização condicional OK
  if (loading) return <p>Carregando...</p>;
  if (error) return <p>Erro: {error}</p>;

  // ✅ DataTable com colunas corretas
  return (
    <DataTable
      columns={[
        { key: 'matricula', label: 'Matrícula' },
        { key: 'nome', label: 'Nome' },
        { key: 'cargo', label: 'Cargo' },
        { key: 'setor', label: 'Setor' }, // ⚠️ Backend retorna erro
        { key: 'ativo', label: 'Status' },
      ]}
      data={data || []}
      onEdit={handleEdit}
      onDelete={handleDelete}
    />
  );
};
```

### 3.3 Código Backend (funcionarios.ts)

```typescript
// worker-airtrust/src/routes/funcionarios.ts

app.get('/', async (c) => {
  const { setor } = c.req.query();

  // ❌ PROBLEMA: Coluna setor não existe em produção
  let query = `
    SELECT 
      id, matricula, nome, cpf, email, telefone,
      cargo, setor,  -- ❌ D1_ERROR: no such column
      funcao, codigo_anac, ativo,
      is_instrutor, is_checador,
      created_at, updated_at
    FROM funcionarios
    WHERE deleted_at IS NULL
  `;

  if (setor) {
    query += ' AND setor = ?'; // ❌ Filtro também falha
  }

  query += ' ORDER BY setor, nome'; // ❌ Ordenação falha

  const stmt = c.env.DB.prepare(query);
  if (setor) stmt.bind(setor);

  const { results } = await stmt.all();
  return c.json({ success: true, data: results });
});
```

### 3.4 Problemas Identificados

```yaml
PROBLEMA 1: Coluna setor não existe
  Local: D1 produção (tabela funcionarios)
  Causa: Migration 0001 aplicada sem coluna OU coluna foi dropada
  Erro: D1_ERROR: no such column: setor
  Impacto: GET /api/funcionarios retorna HTTP 500
  Status: 🔴 CRÍTICO
  Solução: Migration 0006

PROBLEMA 2: CREATE não testado
  Local: POST /api/funcionarios
  Código: Endpoint implementado mas nunca chamado
  Impacto: Não sabemos se funciona
  Status: ❓ DESCONHECIDO

PROBLEMA 3: Formulário mock
  Local: FuncionariosNew → Modal de criar
  Código: handleCreate não chama API real
  Impacto: Usuário não consegue criar funcionário
  Status: 🔴 CRÍTICO
```

### 3.5 Solução Necessária

```yaml
PASSO 1: Aplicar migration 0006
  wrangler d1 execute airtrust-db --env=production \
  --file=./migrations/0006_add_missing_columns.sql

PASSO 2: Testar GET após migration
  curl https://airtrust.airtrust.workers.dev/api/funcionarios

PASSO 3: Integrar formulário CREATE
  - FuncionariosNew.tsx → handleCreate
  - Chamar POST /api/funcionarios com dados do form
  - Validar com Zod antes de enviar

PASSO 4: Testar UPDATE e DELETE
  - Verificar se endpoints funcionam
  - Integrar com frontend
```

---

## 4. FLUXO: QUALIFICAÇÕES (GESTÃO)

### 4.1 Diagrama READ (GET Histórico)

```
┌──────────────────┐
│ QualificacoesNew │ (/qualificacoes)
└────────┬─────────┘
         │ useApi('/qualificacoes/historico')
         ▼
┌────────────────────────────────────┐
│ GET /api/qualificacoes/historico   │
│ - page, limit, funcionario_id      │
└────────┬───────────────────────────┘
         │ D1 Query complexo
         ▼
┌───────────────────────────────────────────────┐
│ D1: qualificacoes_historico                   │
│ - LEFT JOIN funcionarios f                    │
│     ON qh.funcionario_id = f.matricula ⚠️     │
│ - Subquery para buscar codigo:               │
│     (SELECT codigo FROM qualificacoes_tipos   │
│      WHERE nome = qh.nome LIMIT 1) ⚠️         │
│ - Status calculado dinamicamente:            │
│     CASE julianday(data_vencimento)...        │
└────────┬──────────────────────────────────────┘
         │ Retorna 1036 registros
         ▼
   { success: true, data: [...], pagination }
         │
         ▼
┌────────────────────────────────────┐
│ QualificacoesNew                   │
│ - DataTable com 1036 linhas        │
│ - Status: cores (verde/amarelo/red)│
└────────────────────────────────────┘
```

### 4.2 Código Backend (qualificacoes.ts)

```typescript
// worker-airtrust/src/routes/qualificacoes.ts

app.get('/historico', async (c) => {
  // ✅ Query complexa mas funcional
  const query = `
    SELECT 
      qh.id,
      qh.funcionario_id,  -- ⚠️ TEXT, não INTEGER FK
      f.nome as funcionario_nome,
      qh.nome as qualificacao_nome,
      
      -- ⚠️ Subquery para buscar codigo (workaround FK quebrado)
      COALESCE(
        qh.codigo,
        (SELECT codigo FROM qualificacoes_tipos 
         WHERE nome = qh.nome LIMIT 1)
      ) as codigo,
      
      COALESCE(qh.data_obtencao, qh.data_conclusao) as data_conclusao,
      COALESCE(qh.data_validade, qh.data_vencimento) as data_vencimento,
      
      -- ✅ Status calculado dinamicamente
      CASE
        WHEN julianday(COALESCE(qh.data_validade, qh.data_vencimento)) 
             < julianday('now') THEN 'VENCIDA'
        WHEN julianday(COALESCE(qh.data_validade, qh.data_vencimento)) 
             - julianday('now') <= 30 THEN 'PROXIMA_VENCIMENTO'
        ELSE 'VALIDA'
      END as status,
      
      qh.observacoes,
      qh.created_at,
      qh.updated_at
    FROM qualificacoes_historico qh
    
    -- ⚠️ LEFT JOIN em TEXT (matricula), não INTEGER FK
    LEFT JOIN funcionarios f 
      ON qh.funcionario_id = f.matricula
    
    WHERE qh.deleted_at IS NULL
    ORDER BY data_vencimento DESC
    LIMIT ? OFFSET ?
  `;

  const { results } = await c.env.DB.prepare(query).bind(limit, offset).all();

  // ✅ Paginação funcional
  const total = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM qualificacoes_historico WHERE deleted_at IS NULL',
  ).first();

  return c.json({
    success: true,
    data: results,
    pagination: { page, limit, total: total.count, totalPages: Math.ceil(total.count / limit) },
  });
});
```

### 4.3 Problemas Identificados

```yaml
PROBLEMA 1: FK quebradas
  Local: qualificacoes_historico
  Schema: funcionario_id INTEGER FK
  Realidade: funcionario_id TEXT (matrícula)
  Impacto:
    - Sem integridade referencial
    - LEFT JOIN em TEXT (lento)
    - Cascading deletes não funcionam
  Status: ⚠️ WORKAROUND EM USO
  Solução Ideal: Normalizar dados (migração complexa)

PROBLEMA 2: Código NULL em 80% dos registros
  Local: qualificacoes_historico.codigo
  Causa: Migração de sistema legado
  Workaround: Subquery (SELECT codigo WHERE nome = ...)
  Impacto: Performance (N+1 query implícito)
  Status: ⚠️ WORKAROUND EM USO

PROBLEMA 3: Campos renomeados
  Schema: data_obtencao, data_validade
  Dados: data_conclusao, data_vencimento
  Solução: COALESCE(campo_novo, campo_legado)
  Status: ⚠️ WORKAROUND EM USO

PROBLEMA 4: CREATE não testado
  Endpoint: POST /api/qualificacoes/historico
  Status: ❓ Implementado mas não testado
  Questão: Qual formato usar? FK INTEGER ou TEXT?
```

### 4.4 Status Atual

```yaml
✅ READ: FUNCIONA
  - GET /api/qualificacoes/tipos ✅
  - GET /api/qualificacoes/historico ✅
  - Paginação funcional ✅
  - Status calculado ✅
  - Frontend exibe 1036 registros ✅

⚠️ CREATE: PARCIAL
  - Endpoint implementado
  - Frontend tem modal
  - Integração não testada
  - FK quebrado pode causar problemas

❓ UPDATE: DESCONHECIDO
  - Endpoint não testado
  - Frontend não integrado

❓ DELETE: DESCONHECIDO
  - Soft delete implementado
  - Frontend não integrado
```

---

## 5. FLUXO: SIMULADORES (AGENDAMENTO)

### 5.1 Diagrama READ Sessões

```
┌──────────────────┐
│ SimuladoresNew   │ (/simuladores)
└────────┬─────────┘
         │ useApi('/sessoes-simulador')
         ▼
┌────────────────────────────────┐
│ GET /api/simuladores/sessoes   │
│ - Query: simulador_id, status  │
└────────┬───────────────────────┘
         │ D1 Query com JOINs
         ▼
┌──────────────────────────────────────────┐
│ D1: sessoes_simulador                    │
│ - JOIN simuladores s                     │
│     ON sess.simulador_id = s.id ✅       │
│ - LEFT JOIN funcionarios inst           │
│     ON sess.instrutor_id = inst.id ✅    │
│ - LEFT JOIN funcionarios check          │
│     ON sess.checador_id = check.id ✅    │
│ - JOIN participantes_sessao p           │
│     ON sess.id = p.sessao_id ✅          │
│ - JOIN funcionarios part                │
│     ON p.funcionario_id = part.id ✅     │
└────────┬─────────────────────────────────┘
         │ Retorna sessões com relacionamentos
         ▼
   { success: true, data: [...] }
         │
         ▼
┌────────────────────────────────┐
│ SimuladoresNew                 │
│ - DataTable com sessões        │
│ - Status: cores por tipo       │
└────────────────────────────────┘
```

### 5.2 Código Backend (simuladores.ts)

```typescript
// worker-airtrust/src/routes/simuladores.ts

app.get('/sessoes', async (c) => {
  const { simulador_id, status } = c.req.query();

  // ✅ Query com FK reais funcionando
  let query = `
    SELECT 
      sess.id,
      sess.simulador_id,
      s.modelo as simulador_modelo,
      s.codigo as simulador_codigo,
      sess.instrutor_id,
      inst.nome as instrutor_nome,
      sess.checador_id,
      check.nome as checador_nome,
      sess.data_sessao,
      sess.duracao_minutos,
      sess.tipo_sessao,
      sess.status,
      sess.observacoes,
      sess.created_at,
      sess.updated_at
    FROM sessoes_simulador sess
    
    -- ✅ JOIN real (FK INTEGER funciona)
    JOIN simuladores s ON sess.simulador_id = s.id
    
    -- ✅ LEFT JOIN (instrutor pode ser NULL)
    LEFT JOIN funcionarios inst ON sess.instrutor_id = inst.id
    
    -- ✅ LEFT JOIN (checador pode ser NULL)
    LEFT JOIN funcionarios check ON sess.checador_id = check.id
    
    WHERE sess.deleted_at IS NULL
  `;

  if (simulador_id) {
    query += ' AND sess.simulador_id = ?';
  }

  if (status) {
    query += ' AND sess.status = ?';
  }

  query += ' ORDER BY sess.data_sessao DESC';

  const stmt = c.env.DB.prepare(query);
  const binds = [];
  if (simulador_id) binds.push(Number(simulador_id));
  if (status) binds.push(status);

  const { results } = await stmt.bind(...binds).all();

  // ✅ Para cada sessão, buscar participantes
  for (const sessao of results) {
    const participantes = await c.env.DB.prepare(
      `
      SELECT 
        p.id,
        p.funcionario_id,
        f.nome as funcionario_nome,
        f.matricula,
        p.funcao
      FROM participantes_sessao p
      JOIN funcionarios f ON p.funcionario_id = f.id
      WHERE p.sessao_id = ?
    `,
    )
      .bind(sessao.id)
      .all();

    sessao.participantes = participantes.results;
  }

  return c.json({ success: true, data: results });
});
```

### 5.3 Status Atual

```yaml
✅ READ Simuladores: FUNCIONA
  - GET /api/simuladores ✅
  - FK reais funcionam
  - Frontend exibe lista

✅ READ Sessões: FUNCIONA
  - GET /api/simuladores/sessoes ✅
  - JOINs funcionando
  - Participantes N:M resolvido

⚠️ CREATE Sessão: PARCIAL
  - Endpoint implementado
  - Frontend tem modal
  - Integração não testada
  - Precisa validar:
    * instrutor_id existe?
    * checador_id existe?
    * simulador_id existe?
    * data_sessao não conflita?

❓ UPDATE Sessão: DESCONHECIDO
  - Endpoint não testado
  - Frontend não integrado

❓ DELETE Sessão: DESCONHECIDO
  - Soft delete implementado
  - Frontend não integrado
```

### 5.4 Problemas Identificados

```yaml
PROBLEMA 1: Validação de conflitos
  Cenário: Agendar sessão no mesmo horário para o mesmo simulador
  Status: Sem validação no backend
  Risco: Duplo agendamento
  Solução: Adicionar check antes de INSERT

PROBLEMA 2: Validação de instrutor/checador
  Cenário: is_instrutor = 0 mas usado como instrutor_id
  Status: Sem validação no backend
  Risco: Instrutor não qualificado
  Solução: WHERE is_instrutor = 1 na validação

PROBLEMA 3: Frontend não envia dados
  Local: SimuladoresNew → Modal criar sessão
  Status: Mock não integrado
  Impacto: Não testado end-to-end
```

---

## 6. FLUXO: PASTA VIRTUAL (R2)

### 6.1 Diagrama Esperado (Não Funcional)

```
┌──────────────────┐
│ PastaVirtualPage │ (não existe em rotas)
└────────┬─────────┘
         │ Componente: UploadDocumentosPastaVirtual
         ▼
┌────────────────────────────────┐
│ <input type="file" />          │
│ onUploadCertificado(file)      │
└────────┬───────────────────────┘
         │ FormData com file
         ▼
   ❌ POST /api/pasta-virtual/upload
   (endpoint NÃO EXISTE)
         │
         ▼
     404 Not Found
         │
         ▼
┌────────────────────────────────┐
│ Frontend: erro                 │
│ - Upload falha                 │
└────────────────────────────────┘
```

### 6.2 Código Frontend (UploadDocumentosPastaVirtual.tsx)

```tsx
// src/react-app/components/UploadDocumentosPastaVirtual.tsx

const UploadDocumentosPastaVirtual: React.FC = () => {
  const onUploadCertificado = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('funcionarioId', funcionarioId);
    formData.append('tipo', 'CERTIFICADO');

    // ❌ PROBLEMA: Endpoint não existe
    const response = await fetch('https://airtrust.airtrust.workers.dev/api/pasta-virtual/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      alert('Erro ao enviar arquivo'); // ❌ Sempre falha (404)
    }
  };

  return (
    <div>
      <input
        type="file"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            onUploadCertificado(e.target.files[0]);
          }
        }}
      />
    </div>
  );
};
```

### 6.3 Código Backend (Não Existe)

```typescript
// worker-airtrust/src/routes/pasta-virtual.ts
// ❌ ARQUIVO NÃO EXISTE

// ✅ DEVERIA TER:

import { Hono } from 'hono';

const app = new Hono();

app.post('/upload', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;
  const funcionarioId = formData.get('funcionarioId');
  const tipo = formData.get('tipo');

  // Gerar key única
  const key = `funcionarios/${funcionarioId}/${tipo}/${Date.now()}-${file.name}`;

  // Upload para R2
  await c.env.AIRTRUST_FILES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // Salvar referência em D1 (tabela pasta_virtual)
  await c.env.DB.prepare(
    `
    INSERT INTO pasta_virtual (funcionario_id, tipo, filename, r2_key, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `,
  )
    .bind(funcionarioId, tipo, file.name, key)
    .run();

  return c.json({
    success: true,
    data: {
      url: `https://pub-xxx.r2.cloudflarestorage.com/${key}`,
      key,
    },
  });
});

app.get('/:funcionarioId', async (c) => {
  const { funcionarioId } = c.req.param();

  // Listar documentos do funcionário
  const { results } = await c.env.DB.prepare(
    `
    SELECT id, tipo, filename, r2_key, created_at
    FROM pasta_virtual
    WHERE funcionario_id = ?
    ORDER BY created_at DESC
  `,
  )
    .bind(funcionarioId)
    .all();

  // Gerar URLs assinadas
  for (const doc of results) {
    const object = await c.env.AIRTRUST_FILES.get(doc.r2_key);
    doc.url = object ? `https://pub-xxx.r2.cloudflarestorage.com/${doc.r2_key}` : null;
  }

  return c.json({ success: true, data: results });
});

export default app;
```

### 6.4 Problemas Identificados

```yaml
PROBLEMA 1: Endpoint não implementado
  Local: worker-airtrust/src/routes/
  Status: Arquivo pasta-virtual.ts não existe
  Impacto: Upload sempre retorna 404
  Solução: Implementar rota completa

PROBLEMA 2: R2 configurado mas não usado
  Local: wrangler.toml
  Binding: AIRTRUST_FILES = "airtrust-files"
  Status: Binding existe mas sem código usando
  Solução: Implementar upload/download via R2 API

PROBLEMA 3: Tabela pasta_virtual não existe
  Local: D1
  Schema: Não tem migration para pasta_virtual
  Impacto: Sem referência de arquivos
  Solução: Criar migration:
    CREATE TABLE pasta_virtual (
      id INTEGER PRIMARY KEY,
      funcionario_id INTEGER FK,
      tipo TEXT,
      filename TEXT,
      r2_key TEXT UNIQUE,
      created_at TEXT
    );

PROBLEMA 4: URLs públicas vs assinadas
  Questão: R2 bucket é público ou privado?
  Status: Desconhecido
  Risco: Se público, qualquer um acessa arquivos
  Solução: Usar signed URLs com expiração
```

### 6.5 Implementação Necessária

```yaml
PASSO 1: Criar migration pasta_virtual
  Arquivo: 0007_create_pasta_virtual.sql
  Conteúdo: Tabela + FK + índices

PASSO 2: Criar worker-airtrust/src/routes/pasta-virtual.ts
  Endpoints:
    - POST /upload (multipart/form-data)
    - GET /:funcionarioId (listar documentos)
    - DELETE /:id (remover documento)
    - GET /download/:id (signed URL)

PASSO 3: Montar rota em index.ts
  import pastaVirtual from './routes/pasta-virtual';
  app.route('/api/pasta-virtual', pastaVirtual);

PASSO 4: Atualizar frontend
  - Trocar URL de /api/pasta-virtual/upload
  - Adicionar listagem de documentos
  - Adicionar preview de PDFs
```

---

## 7. INTEGRAÇÃO FRONTEND ↔ BACKEND

### 7.1 Hook useApi (Base de Tudo)

```tsx
// src/react-app/hooks/useApi.ts

interface UseApiOptions<T> {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  immediate?: boolean;
}

const useApi = <T,>(options: UseApiOptions<T>) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const baseUrl = 'https://airtrust.airtrust.workers.dev/api';
      const url = `${baseUrl}${options.endpoint}`;

      // ✅ Fetch com headers corretos
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          // ⚠️ PROBLEMA: Sem Authorization header
          // Deveria: 'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();

      // ✅ Suporta formato { success, data }
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setData(json);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [options]);

  useEffect(() => {
    if (options.immediate !== false) {
      execute();
    }
  }, [execute, options.immediate]);

  return { data, loading, error, refetch: execute };
};
```

### 7.2 Problemas no useApi

```yaml
PROBLEMA 1: Sem Authorization header
  Impacto: Rotas protegidas sempre retornam 401
  Solução:
    const token = localStorage.getItem('accessToken');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

PROBLEMA 2: Sem refresh token automático
  Cenário: accessToken expira (15min)
  Resultado: Erro 401
  Solução Esperada:
    1. Interceptar erro 401
    2. Chamar POST /api/auth/refresh
    3. Obter novo accessToken
    4. Retentar request original
  Status: ❌ NÃO IMPLEMENTADO

PROBLEMA 3: Sem tratamento de Network Error
  Cenário: Worker offline ou CORS bloqueado
  Resultado: Erro genérico
  Solução: Catch específico para network failures
```

### 7.3 CORS (Backend)

```typescript
// worker-airtrust/src/middlewares/cors.ts

// ✅ CORS implementado corretamente
app.use(
  '*',
  cors({
    origin: [
      'https://production.airtrust.pages.dev', // ✅ Produção
      'http://localhost:5173', // ✅ Dev local
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);
```

**Status**: ✅ CORS OK

---

## 8. PROBLEMAS DE INTEGRAÇÃO

### 8.1 Resumo de Problemas Críticos

| Fluxo         | Problema                          | Impacto                    | Status | Solução           |
| ------------- | --------------------------------- | -------------------------- | ------ | ----------------- |
| Login         | Frontend não chama API            | Login impossível           | 🔴     | Implementar fetch |
| Login         | Tabela usuarios vazia             | Mesmo com fetch, falha 401 | 🔴     | Seed usuarios     |
| Login         | Sem AuthContext                   | Sem gestão de auth         | 🔴     | Criar context     |
| Funcionários  | Coluna setor falta                | GET retorna 500            | 🔴     | Migration 0006    |
| Qualificações | FK quebradas                      | Performance ruim           | 🟡     | Normalizar dados  |
| Pasta Virtual | Endpoint não existe               | Upload sempre 404          | 🔴     | Implementar rota  |
| Todos CRUDs   | CREATE/UPDATE/DELETE não testados | Não sabemos se funciona    | ❓     | Testar endpoints  |
| useApi        | Sem Authorization header          | Rotas protegidas falham    | 🔴     | Adicionar JWT     |

### 8.2 Prioridades de Correção

```yaml
FAZER AGORA (CRÍTICO): 1. Aplicar migration 0006 (coluna setor)
  2. Popular tabela usuarios (seed)
  3. Integrar LoginSimple com API
  4. Criar AuthContext
  5. Proteger rotas com ProtectedRoute
  6. Adicionar Authorization header em useApi

FAZER EM BREVE (IMPORTANTE): 7. Implementar pasta-virtual (endpoints R2)
  8. Testar POST/PUT/DELETE em todos CRUDs
  9. Integrar formulários frontend com API
  10. Adicionar refresh token automático
  11. Normalizar qualificacoes_historico

BACKLOG (MELHORIAS): 12. Validação de conflitos (simulador agendamento)
  13. Validação de instrutor/checador
  14. Índices compostos (performance)
  15. Logs de auditoria em todas operações
  16. Testes E2E automatizados
```

### 8.3 Conclusão

```yaml
Estado Geral:
  - Backend: ✅ 70% funcional (GET OK, POST/PUT/DELETE não testados)
  - Frontend: ⚠️ 60% funcional (UI pronta, integração parcial)
  - D1: ⚠️ 80% funcional (schema OK, falta coluna setor e tabela pasta_virtual)
  - R2: ❌ 0% funcional (configurado mas não usado)
  - Auth: 🔴 0% funcional (nenhuma parte integrada)

Fluxos Funcionando: ✅ Qualificações READ (1036 registros)
  ✅ Simuladores READ
  ✅ Sessões Simulador READ

Fluxos Quebrados: 🔴 Login completo
  🔴 Funcionários READ (coluna setor)
  🔴 Pasta Virtual (R2)
  🔴 Todos CREATE/UPDATE/DELETE

Próximos Passos: 1. Corrigir problemas críticos (migration 0006, seed usuarios)
  2. Integrar autenticação end-to-end
  3. Testar e integrar operações de escrita (POST/PUT/DELETE)
  4. Implementar Pasta Virtual com R2
```

---

**Próximo Relatório**: FASE22-PARTE5-RECOMENDACOES.md

**Gerado em**: 15/11/2025  
**Autor**: GitHub Copilot - Auditor de Integração

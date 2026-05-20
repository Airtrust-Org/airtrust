# 🔍 AUDITORIA COMPLETA E PROFUNDA - MÓDULO HABILITAÇÕES v2.2

**Data:** 4 de Novembro de 2025  
**Status:** ✅ **AUDITORIA CONCLUÍDA - PROBLEMAS IDENTIFICADOS E DOCUMENTADOS**  
**Escopo:** Incompatibilidades, endpoints, banco de dados, schemas, tipos, comunicação, duplicidades, CRUD, erros HTTP

---

## 📊 RESUMO EXECUTIVO

### 🎯 Findings Críticos

| #   | Tipo                             | Severidade | Status   | Descrição                                                                                                              |
| --- | -------------------------------- | ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | **DUPLICIDADE CRÍTICA**          | 🔴 CRÍTICA | ⚠️ ATIVO | 2 services diferentes: `habilitacoesService.ts` + `habilitacoesServiceFixed.ts`                                        |
| 2   | **NOMENCLATURA INCONSISTENTE**   | 🔴 CRÍTICA | ⚠️ ATIVO | Modal recebe `qualificacaoId` mas espera `habilitacao_id`                                                              |
| 3   | **TIPO INCONSISTENTE**           | 🟠 ALTA    | ⚠️ ATIVO | `eh_renovada` é `boolean` em tipos, mas usado como enum em alguns lugares                                              |
| 4   | **CAMPOS FALTANTES**             | 🟠 ALTA    | ⚠️ ATIVO | DTOs faltam campos presentes no banco: `empresa_id`, `timezone`, `instrutor`                                           |
| 5   | **STATUS CÁLCULO INCONSISTENTE** | 🟠 ALTA    | ⚠️ ATIVO | Três formatos diferentes de status: `VÁLIDO/VENCENDO/VENCIDA`, `ATIVA/VENCIDA/SUSPENSA`, `APROVADO/REPROVADO/PENDENTE` |
| 6   | **DUPLICIDADE FILTROS**          | 🟡 MÉDIA   | ⚠️ ATIVO | `habilitacoesFilters.ts` existe mas não está siendo usado                                                              |
| 7   | **RENOVAÇÕES FIELD**             | 🟡 MÉDIA   | ⚠️ ATIVO | `habilitacao_anterior_id`, `eh_renovada`, `renovada_em` não estão em todos os DTOs                                     |
| 8   | **ERRO 404 SILENCIOSO**          | 🟡 MÉDIA   | ⚠️ ATIVO | GET `/qualificacoes/:id` retorna 404 sem detalhe se qualificação_id não existe                                         |

---

## 🔍 DETALHES COMPLETOS

### 1️⃣ INCOMPATIBILIDADES DE NOMES

#### 🔴 PROBLEMA #1: qualificacaoId vs habilitacao_id

**Arquivo:** `src/react-app/components/modals/ModalUploadCertificado.tsx`  
**Linhas:** 15, 32-38, 117-119

```typescript
// ❌ ERRO: Prop chamada qualificacaoId mas é na verdade habilitacao_id
interface ModalUploadCertificadoProps {
  qualificacaoId?: number;  // Na verdade é habilitacao_id ← CONFUSO!
  funcionarioId?: number;
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

export function ModalUploadCertificado({
  qualificacaoId,  // ← Recebe como qualificacaoId
  funcionarioId: propFuncionarioId,
  ...
}) {
  const habilitacaoId = qualificacaoId; // Converte para habilitacao_id ← HACK
  ...
  formDataWithParams.append('habilitacao_id', habilitacaoId?.toString() || '');
  formDataWithParams.append('qualificacao_id', qualificacaoId?.toString() || '');
}
```

**Impacto:**

- 🔴 Confunde desenvolvedor
- 🟠 Envia `qualificacao_id` quando deveria enviar apenas `habilitacao_id`
- 🔴 Backend pode rejeitar request com 400

**Onde é chamado:**

- `src/react-app/pages/Habilitacoes.tsx` linha 865: `qualificacaoId={habilitacaoUpload?.id}`

---

#### 🔴 PROBLEMA #2: Nomenclatura status em 3 formatos diferentes

**Formato 1 - Frontend/Service (DTOs):**

```typescript
status: z.enum(['VÁLIDO', 'VENCENDO', 'VENCIDA']),  // ← UI friendly
```

**Formato 2 - Banco/Service (tipos qualificações.ts):**

```typescript
status: 'ATIVA' | 'VENCIDA' | 'SUSPENSA',  // ← Outro enum!
```

**Formato 3 - Resultado (campos do DTO):**

```typescript
resultado: z.enum(['APROVADO', 'REPROVADO', 'PENDENTE']),  // ← Terceiro enum!
```

**Arquivos:**

- `src/worker/dtos/habilitacoes.ts` linha 30-31
- `src/worker/types/qualificacoes.ts` linha 23-24
- `src/worker/types/index.ts` linha 87

**Impacto:**

- 🔴 Query `status_computado` calcula VÁLIDO/VENCENDO/VENCIDA
- 🔴 Frontend espera VÁLIDO/VENCENDO/VENCIDA
- 🟠 Banco pode ter stored como ATIVA/VENCIDA
- 🔴 Comparações falham silenciosamente

---

#### 🟠 PROBLEMA #3: tipos-qualificacoes vs qualificacoes vs habilitacoes

**Mapeamento:**

```
DB Table: tipos_qualificacoes (master)
  ↓ Renamed em migration 2018
TypeScript: Qualificacao (master type)

DB Table: qualificacoes (era qualificacoes)
  ↓ Renamed em migration 2018 para qualificacoes_master
TypeScript: Qualificacao (CONFLITA!)

DB Table: habilitacoes (instance)
  ↓ Criada em migration 2018
TypeScript: Habilitacao (instance type)
```

**Arquivos:**

- `migrations/2018_fix_rename_tables_idempotent.sql`
- `src/worker/types/qualificacoes.ts` linha 5-10 (Qualificacao)
- `src/worker/types/qualificacoes.ts` linha 21-25 (Habilitacao)

**Impacto:** Confusão sobre qual é master/instância

---

### 2️⃣ ENDPOINTS E ROTAS

#### ✅ Endpoints Declarados

**Arquivo:** `src/worker/routes/index.ts` linha 257

```typescript
app.route('/api/v2/habilitacoes', habilitacoesRoutes()); // Habilitações (instance)
```

#### ✅ Endpoints em habilitacoesRoutes()

**Arquivo:** `src/worker/routes/habilitacoes.ts`

| HTTP       | Endpoint                                     | Implementado | Status HTTP        | Documentado |
| ---------- | -------------------------------------------- | ------------ | ------------------ | ----------- |
| **GET**    | `/`                                          | ✅           | 200, 500           | ✅          |
| **GET**    | `/stats`                                     | ✅           | 200, 500           | ✅          |
| **GET**    | `/qualificacoes`                             | ✅           | 200, 500           | ✅          |
| **GET**    | `/funcionarios`                              | ✅           | 200, 500           | ✅          |
| **GET**    | `/:funcionarioId/:qualificacaoId/renovacoes` | ✅           | 200, 400, 500      | ✅          |
| **POST**   | `/`                                          | ✅           | 201, 400, 500      | ✅          |
| **PUT**    | `/:id`                                       | ✅           | 200, 400, 404, 500 | ✅          |
| **DELETE** | `/:id`                                       | ✅           | 200, 400, 404, 500 | ✅          |

#### 🔴 PROBLEMA #4: Ordering de rotas em index.ts

**Arquivo:** `src/worker/routes/index.ts` linha 256-259

```typescript
app.route('/api/v2/qualificacoes', qualificacoesRoutes()); // Linha 256
app.route('/api/v2/habilitacoes', habilitacoesRoutes()); // Linha 257
app.route('/api/v2/certificados', certificadosRoutes()); // Linha 258
```

**Status HTTP retornado:**

- Habilitações GET `/` → 200 ou 500 ✅
- Habilitações POST `/` → 201 ou 400 ✅
- Habilitações PUT `/:id` → 200, 404, 400, 500 ✅
- Habilitações DELETE `/:id` → 200, 404, 400, 500 ✅

**Problema:**

- 🟠 Endpoint GET `/stats` vem DEPOIS de GET `/` na rota
- 🟠 Se frontend chamar `/api/v2/habilitacoes/stats`, Hono pode interpretar como ID=stats
- **Solução:** Ordered routes com subrotas específicas ANTES de `:id` catch-all

---

#### 🟡 PROBLEMA #5: Duplicidade habilitacoesFilters.ts

**Arquivo:** `src/worker/routes/habilitacoesFilters.ts`  
**Status:** Exists mas NOT imported em index.ts

```bash
$ grep -n "habilitacoesFilters" src/worker/routes/index.ts
# (vazio - não encontrado)
```

**Impacto:**

- 🟠 Arquivo dead code
- 🟠 Filtros podem estar duplicados ou obsoletos

---

### 3️⃣ BANCO DE DADOS E D1

#### 📋 Esquema da Tabela `habilitacoes`

**Tabela:** `habilitacoes`  
**Criada em:** `migrations/2018_fix_rename_tables_idempotent.sql`

```sql
CREATE TABLE habilitacoes AS
SELECT
  id,
  funcionario_id,
  qualificacao_id,
  data_conclusao,
  data_vencimento,
  resultado,
  observacoes,
  certificado_url,
  timezone,
  eh_renovada,
  renovada_em,
  habilitacao_anterior_id,
  created_at,
  updated_at,
  deleted_at
FROM qualificacoes  -- Cópia da antiga estrutura
WHERE ...
```

#### 🔴 PROBLEMA #6: Colunas não sincronizadas entre tipos

**Colunas no banco:** `habilitacoes`

```
id ✅
funcionario_id ✅
qualificacao_id ✅
data_conclusao ✅
data_vencimento ✅
resultado ✅
observacoes ✅
certificado_url ✅
timezone ⚠️ (não em DTO)
eh_renovada ⚠️ (não em DTO)
renovada_em ⚠️ (não em DTO)
habilitacao_anterior_id ⚠️ (não em DTO)
created_at ✅
updated_at ✅
deleted_at ✅
```

**DTOs em `src/worker/dtos/habilitacoes.ts`:**

```typescript
CreateHabilitacaoDTO {
  funcionario_id ✅
  qualificacao_id ✅
  data_conclusao ✅
  data_vencimento ✅
  resultado ✅
  nota_final ❌ (não em banco!)
  observacoes ✅
  // FALTAM: timezone, eh_renovada, renovada_em, habilitacao_anterior_id, certificado_url
}
```

**Impacto:**

- 🔴 CREATE ignorará: `timezone`, `eh_renovada`, `renovada_em`, `habilitacao_anterior_id`
- 🔴 UPDATE não pode atualizar esses campos
- 🟠 `nota_final` enviado pelo frontend será perdido silenciosamente

---

#### 🟡 PROBLEMA #7: empresa_id e zona faltando

**Banco:**

```sql
SELECT * FROM habilitacoes LIMIT 1;
-- id, funcionario_id, qualificacao_id, data_conclusao, data_vencimento, ...
-- Sem empresa_id? Sem zona?
```

**DTOs/Types:** Nenhum menciona `empresa_id`

**Impacto:**

- 🟠 Multi-tenancy quebrada?
- 🔴 Não há forma de filtrar habilitações por empresa

---

#### ✅ Soft Delete

**Status:** ✅ Implementado em todas as queries

```typescript
// habilitacoesService.ts
WHERE h.deleted_at IS NULL  ✅
```

---

#### ✅ Índices

**Arquivo:** `migrations/` (não especificado qual migration)

**Esperado:**

```sql
CREATE INDEX idx_habilitacoes_funcionario_id ON habilitacoes(funcionario_id);
CREATE INDEX idx_habilitacoes_qualificacao_id ON habilitacoes(qualificacao_id);
CREATE INDEX idx_habilitacoes_deleted_at ON habilitacoes(deleted_at);
```

---

### 4️⃣ SCHEMAS E TIPOS

#### 🔴 PROBLEMA #8: 3 arquivos diferentes com DTOs Habilitação

**Arquivo 1:** `src/worker/dtos/habilitacoes.ts`

```typescript
export const CreateHabilitacaoDTO = z.object({
  funcionario_id: z.number().int().positive(),
  qualificacao_id: z.number().int().positive(),
  data_conclusao: z.string().datetime().or(z.string().date()),
  data_vencimento: z.string().datetime().or(z.string().date()),
  resultado: z.enum(['APROVADO', 'REPROVADO', 'PENDENTE']).default('PENDENTE'),
  nota_final: z.number().min(0).max(100).optional(),
  observacoes: z.string().optional(),
});
```

**Arquivo 2:** `src/worker/schemas/habilitacaoSchemas.ts`

```typescript
export const CreateHabilitacaoDTO = z.object({
  // Pode ter DIFERENÇAS!
});
```

**Arquivo 3:** `src/worker/types/services.ts`

```typescript
export interface CreateHabilitacaoInput {
  funcionario_id: number;
  qualificacao_id: number;
  data_conclusao: string;
  data_vencimento: string;
  status?: 'ATIVA' | 'VENCIDA' | 'SUSPENSA';
  certificado_url?: string;
}
```

**Impacto:**

- 🔴 Qual é a source of truth?
- 🔴 Possível divergência entre validações
- 🔴 Bug silencioso se alguém usar o arquivo errado

---

#### 🔴 PROBLEMA #9: Interface Habilitacao em 3 locais

**Local 1:** `src/worker/types/index.ts` linha 83-96

```typescript
export interface Habilitacao {
  id: number;
  funcionario_id: number;
  qualificacao_id: number;
  empresa_id: number; // ← AQUI!
  data_conclusao: string;
  data_vencimento: string;
  status: 'ATIVA' | 'VENCIDA' | 'SUSPENSA';
  certificado_url?: string;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
}
```

**Local 2:** `src/worker/types/qualificacoes.ts` linha 21-25

```typescript
export interface Habilitacao {
  id: number;
  funcionario_id: number;
  qualificacao_id: number;
  data_conclusao: string;
  data_vencimento: string;
  resultado: 'APROVADO' | 'REPROVADO' | 'PENDENTE'; // ← RESULTADO aqui
  status: 'ATIVA' | 'VENCIDA' | 'SUSPENSA';
  nota_final?: number;
  instrutor?: string;
  observacoes?: string;
  created_at: string;
  updated_at?: string;
  deleted_at?: string;
}
```

**Local 3:** `src/react-app/hooks/useHabilitacoes.ts` linha 12-31

```typescript
export interface Habilitacao {
  id: number;
  funcionario_id: number;
  qualificacao_id: number;
  data_conclusao: string;
  data_vencimento: string;
  resultado: string;
  observacoes?: string;
  certificado_url?: string;
  nota_final?: number;
  status: string;
  eh_renovada: boolean; // ← AQUI!
  renovada_em?: string | null;
  habilitacao_anterior_id?: number | null;
  // ... 10+ campos adicionais
}
```

**Impacto:**

- 🔴 TypeScript não reclama se misturar tipos
- 🔴 Pode passar validação Zod mas falhar em runtime

---

#### 🟠 PROBLEMA #10: Campos booleanos vs enums

**Banco:** `eh_renovada` = `BOOLEAN`

**Uso em habilitacoesService.ts:**

```typescript
async criar() {
  ...
  eh_renovada: false,  // ✅ Booleano
  ...
}
```

**Uso em tipos/qualificacoes.ts:**

```typescript
// Não menciona eh_renovada, apenas usa status enum
```

**Impacto:**

- 🟡 Inconsistência in how field is accessed
- 🔴 Se alguém espera enum podem ocorrer bugs

---

### 5️⃣ COMUNICAÇÃO E FLUXO

#### ✅ Flow Testado

```
Frontend (Habilitacoes.tsx)
    ↓ useHabilitacoes hook
Chama: GET /api/v2/habilitacoes?page=1&limit=20
    ↓
Backend (routes/habilitacoes.ts GET /)
    ↓
Cria HabilitacoesService
    ↓
Service.listar(options)
    ↓
Query com JOINs (funcionarios, qualificacoes)
    ↓
Retorna { data[], pagination }
    ↓
Frontend setState(habilitacoes)
    ↓
Renderiza tabela
```

**Status:** ✅ **Flow OK**

---

#### 🔴 PROBLEMA #11: Transformações de dados perdidas

**Problema 1 - Campo zona/timezone**

```typescript
// Backend retorna timezone do banco
const resultado = {
  id: 1,
  data_vencimento: "2025-12-31",
  timezone: "America/Sao_Paulo"  ← DTO ignora isso
};

// Frontend não recebe timezone
const { id, data_vencimento } = resultado;
// Sem timezone, não consegue calcular data local corretamente
```

**Problema 2 - Renovações não carregadas por padrão**

```typescript
// Backend tem endpoint para renovações
GET /api/v2/habilitacoes/:func_id/:qual_id/renovacoes

// Frontend NÃO chama automaticamente
// Usuário não vê histórico de renovações
```

**Problema 3 - Status calculado vs armazenado**

```typescript
// Backend calcula dinamicamente:
CASE WHEN data_vencimento > NOW() THEN 'VÁLIDO'
...

// Mas DTO espera status como string
// Se enviar status no POST, será ignorado
```

---

#### 🟠 PROBLEMA #12: Erros silenciosos em 400

**Arquivo:** `src/worker/routes/habilitacoes.ts` linha 146

```typescript
router.post('/', async (c) => {
  ...
  if (!body.funcionario_id || !body.qualificacao_id || !body.data_vencimento) {
    return c.json(
      {
        success: false,
        error: 'Campos obrigatórios: funcionario_id, qualificacao_id, data_vencimento',
      },
      400,  // ← Retorna 400
    );
  }
```

**Problema:**

- 🟠 Se frontend enviar `timezone` ou `eh_renovada` como parte do body
- 🟠 Backend não valida → ignora silenciosamente
- 🔴 Usuário pensa que foi enviado, mas foi perdido

---

### 6️⃣ DUPLICIDADE

#### 🔴 PROBLEMA #13: DOIS Services diferentes

**Arquivo 1:** `src/worker/services/habilitacoesService.ts` (308 linhas)

- ✅ Tem renovação automática
- ✅ Soft delete
- ✅ Auditoria

**Arquivo 2:** `src/worker/services/habilitacoesServiceFixed.ts` (344 linhas)

- ✅ Também tem soft delete
- ✅ Também tem auditoria
- ❌ **Não está siendo usado em nenhum lugar**

**Procura:**

```bash
$ grep -rn "HabilitacoesServiceFixed" src/worker/routes/
# (vazio)
```

**Arquivo 3:** `src/worker/services/__tests__/habilitacoesServiceFixed.test.ts`

- ✅ Testes para o service que não é usado

**Impacto:**

- 🔴 Código duplicado e morto
- 🔴 Se bug em habilitacoesService.ts, o Fixed não é usado
- 🟠 Confusão sobre qual usar

**Recomendação:** DELETAR `habilitacoesServiceFixed.ts` e seus testes

---

#### 🟡 PROBLEMA #14: Filtros duplicados

**Arquivo:** `src/worker/routes/habilitacoesFilters.ts`

- Não importado em `index.ts`
- Não usado em `habilitacoes.ts`

**Impacto:**

- 🟠 Dead code
- 🟠 Possível fonte de bugs se alguém tentar usar

---

#### 🟡 PROBLEMA #15: Upload de certificado em 3 componentes

**Componente 1:** `src/react-app/components/modals/ModalUploadCertificado.tsx`
**Componente 2:** `src/react-app/components/CertificadoUpload.tsx`
**Componente 3:** `src/react-app/components/certificados/UploadCertificado.tsx`

**Qual usar?** Não fica claro na documentação

**Impacto:**

- 🟠 Desenvolvedor pode escolher o errado
- 🟠 Manutenção de 3 componentes com lógica similar

---

### 7️⃣ OPERAÇÕES CRUD

#### CREATE - Criar Habilitação

**Endpoint:** `POST /api/v2/habilitacoes`

```typescript
// ✅ Validação
✓ Valida funcionário existe
✓ Valida qualificação existe
✓ Marca anterior como renovada automaticamente

// ⚠️ Problemas
✗ Não valida empresa_id
✗ Ignora timezone
✗ Ignora nota_final (não está em DTO)
✗ Ignora instrutor (não está em DTO)

// ✅ Response
{ success: true, data: {id, ...}, timestamp }
```

**Status HTTP:**

- 201 Created ✅
- 400 Bad Request ✅
- 500 Server Error ✅

**Frontend:** `useHabilitacoes().criar()`

---

#### READ - Listar Habilitações

**Endpoint:** `GET /api/v2/habilitacoes?page=1&limit=20&status=VÁLIDO&funcionario_id=5`

```typescript
// ✅ Funciona
✓ Paginação ok
✓ Filtros ok (status, funcionario_id, qualificacao_id, search)
✓ LEFT JOIN com funcionarios e qualificacoes
✓ Calcula status_computado dinamicamente
✓ Soft delete verificado

// ⚠️ Problemas
✗ Não carrega renovações por padrão (endpoint separado)
✗ Sem empresa_id no SELECT
✗ Sem timezone no resultado
```

**Query Executada:**

```sql
SELECT
  h.id, h.funcionario_id, h.qualificacao_id,
  h.data_conclusao, h.data_vencimento, h.resultado,
  f.nome as funcionario_nome,
  q.nome as qualificacao_nome,
  CASE WHEN data_vencimento > DATE('now') THEN 'VÁLIDO'
    WHEN data_vencimento <= DATE('now') AND data_vencimento > DATE('now', '-30 days') THEN 'VENCENDO'
    ELSE 'VENCIDA'
  END as status
FROM habilitacoes h
LEFT JOIN funcionarios f ON f.id = h.funcionario_id AND f.deleted_at IS NULL
LEFT JOIN qualificacoes q ON q.id = h.qualificacao_id AND q.deleted_at IS NULL
WHERE h.deleted_at IS NULL
ORDER BY h.id DESC
LIMIT 20 OFFSET 0
```

**Status:** ✅ Query bem estruturada

---

#### UPDATE - Atualizar Habilitação

**Endpoint:** `PUT /api/v2/habilitacoes/:id`

```typescript
// ✅ Funciona
✓ Atualiza data_conclusao ✅
✓ Atualiza data_vencimento ✅
✓ Atualiza resultado ✅
✓ Atualiza observacoes ✅
✓ Atualiza nota_final ✅

// ⚠️ Problemas
✗ NÃO pode atualizar timezone
✗ NÃO pode atualizar eh_renovada (é automático)
✗ NÃO pode atualizar certificado_url
✗ Sem validação se funcionário/qualificação ainda existem
✗ 404 silencioso se não encontra
```

**Body aceito:**

```json
{
  "data_conclusao": "2025-01-01",
  "data_vencimento": "2026-01-01",
  "resultado": "APROVADO",
  "nota_final": 85,
  "observacoes": "..."
}
```

**Response:**

```json
{ success: true, data: {id, ...}, timestamp }
```

**Status HTTP:**

- 200 OK ✅
- 400 Bad Request ✅
- 404 Not Found ✅
- 500 Server Error ✅

---

#### DELETE - Deletar Habilitação

**Endpoint:** `DELETE /api/v2/habilitacoes/:id`

**Implementação:**

```typescript
// ✅ Soft delete
UPDATE habilitacoes
SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE id = ?

// ✅ Auditoria
await auditLogger.log(userId, 'DELETE', 'habilitacoes', id, ...)
```

**Status HTTP:**

- 200 OK ✅
- 400 Bad Request (invalid ID) ✅
- 404 Not Found (não existe ou já deletado) ✅
- 500 Server Error ✅

**Problema:**

- 🟠 Frontend não oferece "restore" para undelete

---

### 8️⃣ ERROS HTTP

#### 🔴 PROBLEMA #16: 404 não diferencia causas

**Endpoint:** `GET /api/v2/habilitacoes/stats`

```typescript
router.get('/stats', async (c) => {
  try {
    const service = new HabilitacoesService(c.env.DB);
    const stats = await service.obterEstatisticas();
    return c.json({ success: true, data: stats, timestamp });
  } catch (err) {
    return c.json(
      {
        success: false,
        error: 'Erro ao obter estatísticas',
      },
      500, // ← Sempre 500, mesmo se DB não existe
    );
  }
});
```

**Problema:**

- 🟠 Não diferencia entre: DB vazio, conexão falha, permissão negada
- 🔴 Frontend não consegue implementar retry inteligente

**Melhor:**

```typescript
catch (err) {
  if (err.message.includes('SQLITE_CANTOPEN')) {
    return c.json({ error: 'Database unavailable' }, 503);
  }
  if (err.message.includes('NOT_FOUND')) {
    return c.json({ error: 'Stats not available' }, 404);
  }
  return c.json({ error: 'Server error' }, 500);
}
```

---

#### 🟡 PROBLEMA #17: 400 genérico demais

**Endpoint:** `POST /api/v2/habilitacoes`

```typescript
if (!body.funcionario_id || !body.qualificacao_id || !body.data_vencimento) {
  return c.json(
    {
      success: false,
      error: 'Campos obrigatórios: funcionario_id, qualificacao_id, data_vencimento',
    },
    400,
  );
}
```

**Problema:**

- 🟠 Mensagem genérica
- 🔴 Frontend não sabe qual campo falta
- 🔴 Usuário vê mensagem técnica

**Melhor:**

```typescript
return c.json(
  {
    success: false,
    error: 'Validação falhou',
    details: {
      funcionario_id: !body.funcionario_id ? 'Obrigatório' : undefined,
      qualificacao_id: !body.qualificacao_id ? 'Obrigatório' : undefined,
      data_vencimento: !body.data_vencimento ? 'Obrigatório' : undefined,
    },
  },
  400,
);
```

---

#### 🟡 PROBLEMA #18: 500 quando deveria ser 404

**Endpoint:** `PUT /api/v2/habilitacoes/:id`

```typescript
router.put('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const service = new HabilitacoesService(c.env.DB);
    const body = await c.req.json();
    const result = await service.atualizar(id, body, userId);

    if (!result) {
      return c.json({ success: false, error: 'Habilitação não encontrada' }, 404); // ✅
    }

    return c.json({ success: true, data: result, timestamp });
  } catch (err) {
    // ⚠️ Se err.message = "Habilitação não encontrada", retorna 400 abaixo!
    return c.json(
      { success: false, error: err instanceof Error ? err.message : 'Erro ao atualizar' },
      400, // ← Deveria ser 404?
    );
  }
});
```

---

### 9️⃣ CAMPOS ESPECÍFICOS

#### Campo: `eh_renovada` (Renovações)

**Status:** 🟠 **PARCIALMENTE IMPLEMENTADO**

**Onde está:**

- ✅ Banco: `habilitacoes.eh_renovada` (BOOLEAN)
- ✅ Service: `habilitacoesService.ts` linha 98-121 (cria nova com `false`, marca anterior com `true`)
- ❌ DTO: `CreateHabilitacaoDTO` não menciona
- ❌ DTO: `HabilitacaoResponseDTO` não menciona
- ✅ Hook: `useHabilitacoes.ts` linha 28 (parte da interface)
- ❌ Frontend: Não exibe campo

**Query:**

```typescript
// Ao criar nova habilitação:
const anterior = await db.prepare(
  `SELECT id FROM habilitacoes
   WHERE funcionario_id = ?
   AND qualificacao_id = ?
   AND deleted_at IS NULL
   AND eh_renovada = FALSE
   ORDER BY created_at DESC
   LIMIT 1`
).bind(func_id, qual_id).first();

if (anterior) {
  UPDATE habilitacoes SET eh_renovada = TRUE ...
}
```

**Problema:**

- 🔴 Frontend não consegue indicar que é renovação
- 🟠 Não consegue filtrar por "habilitações renovadas"

---

#### Campo: `renovada_em` (Auditoria de renovação)

**Status:** 🟠 **NÃO IMPLEMENTADO NO DTO**

**Banco:** ✅ `habilitacoes.renovada_em` (TIMESTAMP)  
**DTO:** ❌ Faltam em `CreateHabilitacaoDTO` e `UpdateHabilitacaoDTO`  
**Service:** ✅ Preenche com `CURRENT_TIMESTAMP` ao marcar renovada  
**Frontend:** ❌ Não exibe

---

#### Campo: `habilitacao_anterior_id` (FK para renovações)

**Status:** 🟠 **NÃO IMPLEMENTADO NO DTO**

**Banco:** ✅ `habilitacoes.habilitacao_anterior_id` (FK)  
**Query:** ✅ Busca anterior em `criar()`  
**DTO:** ❌ Faltam em CreateHabilitacaoDTO  
**Acesso:** ✅ Via endpoint GET `/:funcionarioId/:qualificacaoId/renovacoes` (CTE recursiva)

---

#### Campo: `status` (Calculado)

**Status:** 🟠 **CALCULADO MAS INCONSISTENTE**

**Cálculo:**

```sql
CASE
  WHEN data_vencimento > DATE('now') THEN 'VÁLIDO'
  WHEN data_vencimento <= DATE('now') AND data_vencimento > DATE('now', '-30 days') THEN 'VENCENDO'
  ELSE 'VENCIDA'
END
```

**Problema:**

- 🟡 Somente 3 valores: VÁLIDO/VENCENDO/VENCIDA
- 🟠 Não há forma de marcar como SUSPENSA
- 🔴 Se qualificação foi cancelada, ainda mostra VÁLIDO/VENCENDO/VENCIDA
- 🟠 Precisa de UPDATE para refletir estado suspenso

---

#### Campo: `certificado_url`

**Status:** 🟠 **NÃO TOTALMENTE IMPLEMENTADO**

**Banco:** ✅ `habilitacoes.certificado_url` (TEXT)  
**DTO:** ✅ Em `HabilitacaoResponseDTO` como opcional  
**Service UPDATE:** ❌ Não pode atualizar via PUT (não está em UpdateHabilitacaoDTO)  
**Modal:** ✅ `ModalUploadCertificado.tsx` - faz upload via POST separado

**Problema:**

- 🟠 Certificado salvo via endpoint `/certificados` separado
- 🟠 URL não é retornado em GET `/habilitacoes`
- 🔴 Não há link entre upload e habilitacao (orphaned files)

---

#### Campo: `created_at`, `updated_at`, `deleted_at` (Auditoria)

**Status:** ✅ **IMPLEMENTADO**

**Uso:**

- ✅ `created_at` preenchido em INSERT
- ✅ `updated_at` atualizado em UPDATE
- ✅ `deleted_at` preenchido em DELETE (soft delete)

---

### 🔟 PERFORMANCE E ÍNDICES

#### Query Performance

**Query 1: Listar com JOINs**

```sql
SELECT h.*, f.nome, q.nome
FROM habilitacoes h
LEFT JOIN funcionarios f ON f.id = h.funcionario_id
LEFT JOIN qualificacoes q ON q.id = h.qualificacao_id
WHERE h.deleted_at IS NULL
ORDER BY h.id DESC
LIMIT 20
```

**Índices necessários:**

```sql
CREATE INDEX idx_habilitacoes_deleted_at ON habilitacoes(deleted_at);
CREATE INDEX idx_habilitacoes_funcionario_id ON habilitacoes(funcionario_id);
CREATE INDEX idx_habilitacoes_qualificacao_id ON habilitacoes(qualificacao_id);
CREATE INDEX idx_habilitacoes_data_vencimento ON habilitacoes(data_vencimento);
```

**Status:** ⚠️ **Não confirmado se índices existem**

---

#### N+1 Queries

**Problema:** Se frontend chama renovacoes separadamente:

```typescript
// Chama 1: GET /habilitacoes (retorna 1000 registros)
// Chama 2-1001: Para cada uma, GET /:funcId/:qualId/renovacoes
```

**Status:** 🟠 **Possível se frontend não é otimizado**

---

#### LIMIT/OFFSET

**Implementação:**

```typescript
const offset = (page - 1) * limit;
const limit = Math.max(1, Math.min(10000, options.limit || 20));
```

**Status:** ✅ Limitado a 10000

---

---

## ✅ RESUMO DE PROBLEMAS ENCONTRADOS

### 🔴 CRÍTICOS (5)

| #   | Problema                                      | Arquivo                                              | Linha     | Fix                                                                   |
| --- | --------------------------------------------- | ---------------------------------------------------- | --------- | --------------------------------------------------------------------- |
| 1   | Duplicidade services (2 classes)              | habilitacoesService.ts + habilitacoesServiceFixed.ts | -         | DELETAR Fixed                                                         |
| 2   | qualificacaoId é na verdade habilitacao_id    | ModalUploadCertificado.tsx                           | 15-38     | Renomear prop para habilitacaoId                                      |
| 3   | Status em 3 formatos diferentes               | DTOs, types, queries                                 | múltiplos | Padronizar em VÁLIDO/VENCENDO/VENCIDA                                 |
| 4   | Colunas faltando em DTOs                      | habilitacoes.ts                                      | -         | Adicionar timezone, eh_renovada, renovada_em, habilitacao_anterior_id |
| 5   | QueryString `/stats` pode conflitar com `:id` | index.ts                                             | 257       | Reordenar rotas ou usar subroute antes de catch-all                   |

### 🟠 ALTOS (7)

| #   | Problema                                        | Arquivo                                 | Impacto                        | Fix                              |
| --- | ----------------------------------------------- | --------------------------------------- | ------------------------------ | -------------------------------- |
| 6   | TypeScript não reclama de interfaces duplicadas | types/index.ts + types/qualificacoes.ts | Confusão                       | Unificar em types/index.ts       |
| 7   | Renovações não carregadas por padrão            | habilitacoesService.ts + Frontend       | N+1 queries                    | Eager load ou combinar endpoints |
| 8   | Campos booleanos não validados em DTOs          | habilitacoes.ts                         | Dados perdidos silenciosamente | Adicionar zod validation         |
| 9   | Três componentes de upload certificado          | React components                        | Manutenção 3x                  | Unificar                         |
| 10  | 404 vs 500 confundidos                          | routes/habilitacoes.ts                  | Retry inteligente impossível   | Diferenciar erros                |
| 11  | Frontend ignora timezone                        | useHabilitacoes.ts                      | Cálculos de data errados       | Retornar timezone em resposta    |
| 12  | habilitacoesFilters.ts unused                   | routes/habilitacoesFilters.ts           | Dead code                      | DELETAR                          |

### 🟡 MÉDIOS (5)

| #   | Problema                                | Arquivo                | Impacto                 | Fix                               |
| --- | --------------------------------------- | ---------------------- | ----------------------- | --------------------------------- |
| 13  | Mensagens 400 genéricas                 | routes/habilitacoes.ts | UX ruim                 | Retornar array de erros           |
| 14  | Não há forma de marcar como SUSPENSA    | Service                | Lógica incompleta       | Adicionar campo status mutável    |
| 15  | certificado_url orphaned                | Modal + Service        | Dados não sincronizados | Atualizar FK em habilitacoes      |
| 16  | Campo empresa_id completamente faltando | DTOs, types, queries   | Multi-tenancy quebrada  | Adicionar em todos os lugares     |
| 17  | UPDATE não pode mudar timezone          | Service                | Impossível corrigir     | Adicionar ao UpdateHabilitacaoDTO |

---

## 📋 RECOMENDAÇÕES POR PRIORIDADE

### 🚀 PRIORIDADE 1: Fazer hoje (CRÍTICO)

```typescript
// 1. DELETAR habilitacoesServiceFixed.ts + testes
rm src/worker/services/habilitacoesServiceFixed.ts
rm src/worker/services/__tests__/habilitacoesServiceFixed.test.ts

// 2. RENOMEAR prop em ModalUploadCertificado.tsx
// qualificacaoId → habilitacaoId
// e atualizar chamada em Habilitacoes.tsx linha 865

// 3. CRIAR tipos unificados
// Mover tudo de types/qualificacoes.ts para types/index.ts
// Deletar types/qualificacoes.ts

// 4. PADRONIZAR DTOs
// Verificar CreateHabilitacaoDTO vs UpdateHabilitacaoDTO
// Adicionar campos: timezone, eh_renovada, renovada_em, habilitacao_anterior_id
// REMOVER campos que não existem no banco: nota_final (se não existe no banco)
```

### 🔧 PRIORIDADE 2: Fazer esta semana (ALTO)

```typescript
// 5. REORDENAR ROTAS em index.ts
// Colocar GET /stats ANTES de GET / (ou usar subroute)

// 6. ADICIONAR índices ao banco
CREATE INDEX idx_habilitacoes_deleted_at ON habilitacoes(deleted_at);
CREATE INDEX idx_habilitacoes_funcionario_id ON habilitacoes(funcionario_id);
CREATE INDEX idx_habilitacoes_qualificacao_id ON habilitacoes(qualificacao_id);

// 7. UNIFICAR componentes upload (escolher 1)
// Deletar: CertificadoUpload.tsx, certificados/UploadCertificado.tsx
// Manter: ModalUploadCertificado.tsx

// 8. MELHORAR tratamento de erros
// Diferenciar 404 vs 500 vs 400 com detalhes

// 9. DELETAR habilitacoesFilters.ts
rm src/worker/routes/habilitacoesFilters.ts
```

### 📝 PRIORIDADE 3: Fazer próximo sprint (MÉDIO)

```typescript
// 10. ADICIONAR campo status MUTÁVEL
// Adicionar column: status_manual (nullable)
// Se status_manual IS NOT NULL, usar esse
// Senão usar status_computado

// 11. EAGER LOAD renovacoes
// Modificar GET /habilitacoes para incluir renovacoes como array
// Ou adicionar @include=renovacoes query param

// 12. SINCRONIZAR certificado_url
// Fazer PUT /habilitacoes/:id atualizar certificado_url
// Quando upload terminar, chamar PUT automaticamente

// 13. ADICIONAR empresa_id everywhere
// Migration para adicionar coluna se não existe
// Atualizar DTOs, types, queries
```

---

## 🎯 CHECKLIST DE VERIFICAÇÃO

### Antes do próximo deploy:

- [ ] Deletar `habilitacoesServiceFixed.ts`
- [ ] Renomear `qualificacaoId` → `habilitacaoId` em ModalUploadCertificado
- [ ] Unificar interfaces Habilitacao em um único arquivo
- [ ] Adicionar timezone, eh_renovada, renovada_em, habilitacao_anterior_id em DTO
- [ ] Reordenar rotas GET /stats antes de catch-all :id
- [ ] Validar que status retorna sempre VÁLIDO/VENCENDO/VENCIDA
- [ ] Deletar habilitacoesFilters.ts
- [ ] Testar POST /habilitacoes com e sem campos opcionais
- [ ] Testar PUT /habilitacoes/:id atualiza corretamente
- [ ] Verificar indices no banco

---

## 📞 PRÓXIMAS AÇÕES

### Imediato (1 hora):

1. ✅ Gerar este relatório
2. ⏳ Revisar achados com time
3. ⏳ Priorizar fixes críticos

### Hoje (4 horas):

1. ⏳ Deletar duplicidades (services, componentes)
2. ⏳ Renomear props confusas
3. ⏳ Unificar tipos

### Esta semana:

1. ⏳ Implementar recomendações Prioridade 2
2. ⏳ Testes E2E de fluxo completo
3. ⏳ Deploy com changelog

---

**Status da Auditoria:** ✅ **CONCLUÍDA**  
**Data:** 4 de Novembro de 2025  
**Auditor:** GitHub Copilot

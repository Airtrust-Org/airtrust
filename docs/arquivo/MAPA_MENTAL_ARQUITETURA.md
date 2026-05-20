# 🗺️ MAPA MENTAL - ARQUITETURA AIRTRUST

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AIRTRUST v2 - ARQUITETURA COMPLETA                 │
└─────────────────────────────────────────────────────────────────────────────┘

                                   NAVEGADOR
                                   ════════════
                                       │
                ┌──────────────────────┼──────────────────────┐
                │                      │                      │
         Habilitacoes.tsx      Qualificacoes.tsx      Configuracao.tsx
         (783 linhas)           (500+ linhas)         (100+ linhas)
                │                      │                      │
                └──────────────────────┼──────────────────────┘
                                       │
                    ┌──────────────────▼─────────────────┐
                    │   REACT HOOKS (Custom)             │
                    │  ══════════════════════════════    │
                    │  useHabilitacoes()                 │
                    │  useQualificacoes()                │
                    │  useConfiguracao()                 │
                    │  useApi() - genérico               │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼─────────────────┐
                    │   API CLIENT (utils/api-client)    │
                    │  ══════════════════════════════    │
                    │  fetch() wrapper                   │
                    │  Error handling                    │
                    │  JSON serialization                │
                    └──────────────────┬──────────────────┘
                                       │
                                    HTTP
                                    ════
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            │                          │                          │
      GET /api/v2/             POST /api/v2/              PUT /api/v2/
      habilitacoes             habilitacoes               habilitacoes/:id
      (LIST)                   (CREATE)                   (UPDATE)
            │                          │                          │
            └──────────────────────────┼──────────────────────────┘
                                       │
                    ┌──────────────────▼─────────────────┐
                    │   CLOUDFLARE WORKERS (Hono)        │
                    │  ══════════════════════════════    │
                    │  src/worker/routes/                │
                    │    - habilitacoes.ts               │
                    │    - qualificacoes.ts              │
                    │    - etc...                        │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼─────────────────┐
                    │   MIDDLEWARE                       │
                    │  ══════════════════════════════    │
                    │  ✓ Authentication (JWT)            │
                    │  ✓ CORS                            │
                    │  ✓ Security headers                │
                    │  ✓ Request logging                 │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼─────────────────┐
                    │   VALIDATION (Zod)                 │
                    │  ══════════════════════════════    │
                    │  Schema validation                 │
                    │  Type checking                     │
                    │  Error messages                    │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼─────────────────┐
                    │   SERVICES (Business Logic)        │
                    │  ══════════════════════════════    │
                    │  habilitacoesService.ts            │
                    │  qualificacoesService.ts           │
                    │  Etc...                            │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼─────────────────┐
                    │   REPOSITORIES (Data Access)       │
                    │  ══════════════════════════════    │
                    │  habilitacoesRepository.ts         │
                    │  - findById(id)                    │
                    │  - findAll()                       │
                    │  - create(data)                    │
                    │  - update(id, data)                │
                    │  - delete(id)  [soft]              │
                    └──────────────────┬──────────────────┘
                                       │
                                    SQL
                                    ════
                                       │
                    ┌──────────────────▼─────────────────┐
                    │   D1 DATABASE (SQLite)             │
                    │  ══════════════════════════════    │
                    │  Tabelas:                          │
                    │  ├─ habilitacoes (1036 registros)  │
                    │  ├─ qualificacoes (~100 registros) │
                    │  ├─ funcionarios (~50 registros)   │
                    │  ├─ categorias (4 registros)       │
                    │  ├─ empresas (1+ registros)        │
                    │  └─ ... (30+ tabelas total)        │
                    └────────────────────────────────────┘


═════════════════════════════════════════════════════════════════════════════
                            FLUXO DE DADOS
═════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ CENÁRIO 1: LISTAR HABILITAÇÕES                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. USUÁRIO                                                                 │
│     └─ Clica em "Habilitações" no menu                                     │
│                                                                              │
│  2. FRONTEND (Habilitacoes.tsx)                                             │
│     └─ useEffect() → carregar(1, 1036)                                      │
│                                                                              │
│  3. HOOK (useHabilitacoes)                                                  │
│     └─ Faz fetch('/api/v2/habilitacoes?page=1&limit=1036')                 │
│                                                                              │
│  4. BROWSER                                                                 │
│     └─ GET http://localhost:8787/api/v2/habilitacoes?page=1&limit=1036     │
│                                                                              │
│  5. WORKER (Hono server)                                                    │
│     └─ router.get('/') em habilitacoes.ts                                   │
│                                                                              │
│  6. MIDDLEWARE                                                              │
│     ├─ Valida JWT (se produção)                                            │
│     ├─ Verifica CORS                                                       │
│     └─ Logging                                                             │
│                                                                              │
│  7. ENDPOINT HANDLER                                                        │
│     ├─ Parse query: page=1, limit=1036                                     │
│     ├─ Calcula: skip = (1-1) * 1036 = 0                                    │
│     └─ Monta SQL query                                                      │
│                                                                              │
│  8. DATABASE QUERY                                                          │
│     ├─ SELECT * FROM habilitacoes                                          │
│     │   WHERE deleted_at IS NULL                                           │
│     │   ORDER BY data_vencimento ASC                                        │
│     │   LIMIT 1036 OFFSET 0                                                │
│     └─ JOIN com qualificacoes e funcionarios                               │
│                                                                              │
│  9. D1 DATABASE (SQLite)                                                    │
│     ├─ Executa query                                                       │
│     ├─ Retorna 1036 registros                                              │
│     └─ Calcula total: COUNT(*) = 1036                                      │
│                                                                              │
│  10. RESPONSE (JSON)                                                        │
│      ├─ success: true                                                      │
│      ├─ data: [ {...}, {...}, ... ]  (1036 registros)                     │
│      ├─ stats: { total: 1036, validas: 850, ... }                         │
│      └─ pagination: { page: 1, limit: 1036, total: 1036, pages: 1 }      │
│                                                                              │
│  11. HOOK (useHabilitacoes)                                                 │
│      └─ Armazena em state: setHabilitacoes(data)                           │
│                                                                              │
│  12. FRONTEND (Habilitacoes.tsx)                                            │
│      └─ Re-render com 1036 registros na tabela                             │
│                                                                              │
│  13. USUÁRIO                                                                │
│      └─ Vê tabela com habilitações listadas                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│ CENÁRIO 2: CRIAR NOVA HABILITAÇÃO                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. USUÁRIO                                                                 │
│     └─ Clica "Nova Habilitação" button                                     │
│                                                                              │
│  2. FRONTEND                                                                │
│     └─ Modal abre (ModalHabilitacao)                                        │
│     └─ Preenche campos: funcionario_id, qualificacao_id, datas, etc        │
│     └─ Clica "Salvar"                                                       │
│                                                                              │
│  3. HOOK (useHabilitacoes)                                                  │
│     └─ criar({ funcionario_id, qualificacao_id, ... })                     │
│                                                                              │
│  4. VALIDATION (Zod Schema)                                                 │
│     ├─ Valida: funcionario_id é número ✓                                   │
│     ├─ Valida: qualificacao_id é número ✓                                  │
│     ├─ Valida: data_conclusao é YYYY-MM-DD ✓                              │
│     ├─ Valida: data_vencimento é YYYY-MM-DD ✓                             │
│     ├─ Valida: resultado é enum ✓                                          │
│     └─ ✓ Passou em todas validações                                        │
│                                                                              │
│  5. API CLIENT                                                              │
│     └─ fetch('/api/v2/habilitacoes', {                                     │
│        method: 'POST',                                                     │
│        headers: { 'Content-Type': 'application/json' },                    │
│        body: JSON.stringify(validatedData)                                 │
│        })                                                                   │
│                                                                              │
│  6. WORKER (Hono)                                                           │
│     └─ router.post('/') em habilitacoes.ts                                  │
│                                                                              │
│  7. HANDLER LOGIC                                                           │
│     ├─ Parse request body                                                  │
│     ├─ Validate com Zod (novamente)                                        │
│     ├─ Prepara SQL INSERT:                                                 │
│     │   INSERT INTO habilitacoes (                                          │
│     │     funcionario_id, qualificacao_id, data_conclusao, ...             │
│     │   ) VALUES (?, ?, ?, ...)                                             │
│     └─ Executa query                                                       │
│                                                                              │
│  8. D1 DATABASE                                                             │
│     ├─ INSERT nova linha                                                   │
│     ├─ Retorna last_row_id = 1037                                          │
│     └─ Registra created_at = NOW()                                         │
│                                                                              │
│  9. RESPONSE (JSON)                                                         │
│      {                                                                     │
│        "success": true,                                                    │
│        "id": 1037                                                          │
│      }                                                                     │
│                                                                              │
│  10. FRONTEND                                                               │
│      ├─ Fecha modal                                                        │
│      ├─ Toast: "✓ Habilitação criada com sucesso!"                        │
│      ├─ Recarrega lista: carregar(1, 1036)                                │
│      └─ Novo registro aparece na tabela                                   │
│                                                                              │
│  11. USUÁRIO                                                                │
│      └─ Vê novo registro (ID 1037) listado                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│ CENÁRIO 3: DELETAR HABILITAÇÃO (SOFT DELETE)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. USUÁRIO                                                                 │
│     └─ Clica botão "Deletar" para registro ID 1037                         │
│                                                                              │
│  2. FRONTEND                                                                │
│     └─ Confirma: "Tem certeza que deseja deletar?"                         │
│     └─ Usuário clica "SIM"                                                  │
│                                                                              │
│  3. HOOK                                                                    │
│     └─ deletar(1037)                                                        │
│                                                                              │
│  4. API CLIENT                                                              │
│     └─ DELETE /api/v2/habilitacoes/1037                                    │
│                                                                              │
│  5. WORKER                                                                  │
│     └─ router.delete('/:id') em habilitacoes.ts                            │
│                                                                              │
│  6. HANDLER LOGIC                                                           │
│     ├─ Parse :id = 1037                                                    │
│     ├─ Prepara SQL UPDATE (NÃO DELETE):                                    │
│     │   UPDATE habilitacoes                                                │
│     │   SET deleted_at = datetime('now')                                   │
│     │   WHERE id = 1037                                                    │
│     └─ Executa query                                                       │
│                                                                              │
│  7. D1 DATABASE                                                             │
│     ├─ UPDATE registro ID 1037                                             │
│     ├─ Coluna deleted_at = "2025-11-03 20:35:42"                          │
│     ├─ Registro PERMANECE no banco                                         │
│     └─ ✓ Pronto para auditoria/recovery                                    │
│                                                                              │
│  8. RESPONSE                                                                │
│      {                                                                     │
│        "success": true,                                                    │
│        "message": "Habilitação deletada com sucesso"                      │
│      }                                                                     │
│                                                                              │
│  9. FRONTEND                                                                │
│     ├─ Toast: "✓ Deletado!"                                               │
│     ├─ Remove registro da tabela (UI)                                      │
│     └─ Recarrega lista                                                     │
│                                                                              │
│  10. PRÓXIMA VEZ que fazer GET                                             │
│      └─ WHERE deleted_at IS NULL                                          │
│      └─ Registro 1037 NÃO aparece                                         │
│                                                                              │
│  11. ADMIN - RECUPERAR                                                      │
│      └─ Pode consultar banco direto                                        │
│      └─ Ver: deleted_at IS NOT NULL                                       │
│      └─ UPDATE deleted_at = NULL para reverter                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘


═════════════════════════════════════════════════════════════════════════════
                         COMPONENTES-CHAVE
═════════════════════════════════════════════════════════════════════════════

FRONTEND
────────

src/react-app/pages/Habilitacoes.tsx (783 linhas)
├─ useState: modals, filtros, dados
├─ useEffect: carrega dados ao montar
├─ useHabilitacoes: hook custom
├─ useQualificacoes: hook custom
├─ 3 abas: histórico, qualificações, categorias
├─ Tabela: 1036 registros
├─ Modais: criar, editar, upload certificado
└─ Ações: edit, delete, download, upload

src/react-app/hooks/useHabilitacoes.ts
├─ Estado: habilitacoes, loading, erro
├─ Métodos:
│  ├─ carregar(page, limit)
│  ├─ criar(dados)
│  ├─ atualizar(id, dados)
│  └─ deletar(id)
└─ Chama API via fetch()

src/react-app/components/UI/ (10 componentes)
├─ PageHeader
├─ SectionCard
├─ FormGroup
├─ Input
├─ Select
├─ Button
├─ Badge
├─ Breadcrumb
├─ Alert
└─ Loading


BACKEND
───────

src/worker/routes/habilitacoes.ts (184 linhas)
├─ GET / (lista com paginação)
├─ POST / (cria novo)
├─ PUT /:id (atualiza)
├─ DELETE /:id (soft delete)
└─ Zod validation em cada método

src/worker/middleware/
├─ auth.ts (valida JWT)
├─ cors.ts (controla CORS)
├─ security.ts (headers de segurança)
└─ logging.ts (registra requisições)

src/worker/services/
├─ habilitacoesService.ts
├─ qualificacoesService.ts
└─ ... mais services

src/worker/repositories/
├─ habilitacoesRepository.ts
└─ Acesso direto ao D1


DATABASE
────────

D1 (SQLite)
├─ Tabela habilitacoes
│  ├─ id (INT PRIMARY KEY)
│  ├─ funcionario_id (FK)
│  ├─ qualificacao_id (FK)
│  ├─ data_conclusao (TEXT)
│  ├─ data_vencimento (TEXT)
│  ├─ resultado (TEXT)
│  ├─ status (TEXT)
│  ├─ nota_final (REAL)
│  ├─ instrutor (TEXT)
│  ├─ observacoes (TEXT)
│  ├─ certificado_url (TEXT)
│  ├─ created_at (DATETIME)
│  ├─ updated_at (DATETIME)
│  └─ deleted_at (DATETIME) ← Soft delete
│
└─ Índices:
   ├─ PRIMARY (id)
   ├─ FOREIGN (funcionario_id)
   ├─ FOREIGN (qualificacao_id)
   └─ DELETE MARKER (deleted_at IS NULL)


═════════════════════════════════════════════════════════════════════════════
                         DESIGN SYSTEM
═════════════════════════════════════════════════════════════════════════════

Tokens CSS
──────────

:root {
  /* Cores Primárias */
  --color-primary: #0066cc
  --color-primary-dark: #004a99
  --color-primary-light: #3385dd

  /* Status */
  --color-success: #10b981
  --color-error: #ef4444
  --color-warning: #f59e0b
  --color-info: #3b82f6

  /* Grayscale */
  --color-gray-50: #f9fafb
  --color-gray-100: #f3f4f6
  ... até
  --color-gray-900: #111827

  /* Tipografia */
  --text-xs: 0.75rem       (12px)
  --text-sm: 0.875rem      (14px)
  --text-base: 1rem        (16px)
  --text-lg: 1.125rem      (18px)
  --text-xl: 1.25rem       (20px)
  --text-2xl: 1.5rem       (24px)
  --text-3xl: 1.875rem     (30px)
  --text-4xl: 2.25rem      (36px)

  /* Espaçamento */
  --spacing-1: 0.25rem     (4px)
  --spacing-2: 0.5rem      (8px)
  --spacing-3: 0.75rem     (12px)
  --spacing-4: 1rem        (16px)
  --spacing-6: 1.5rem      (24px)
  --spacing-8: 2rem        (32px)

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05)
  --shadow-base: 0 1px 3px rgba(0,0,0,0.1)
  --shadow-md: 0 4px 6px rgba(0,0,0,0.1)
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1)
  --shadow-xl: 0 20px 25px rgba(0,0,0,0.1)
}


Componentes UI
──────────────

export const PageHeader = (props)
export const SectionCard = (props)
export const FormGroup = (props)
export const Input = (props)
export const Select = (props)
export const Button = (props)  // 4 variants × 3 sizes = 12 combinações
export const Badge = (props)   // 4 cores
export const Breadcrumb = (props)
export const Alert = (props)   // 4 variantes
export const Loading = (props)

Uso:
────

import { Button, PageHeader, Badge } from '@/components/UI';

<PageHeader title="Habilitações" subtitle="Gestão completa" />
<Button variant="primary" size="md">Criar</Button>
<Badge variant="success">Ativa</Badge>


═════════════════════════════════════════════════════════════════════════════
                         PERMISSÕES E SEGURANÇA
═════════════════════════════════════════════════════════════════════════════

JWT (Token)
───────────
Header: { Authorization: "Bearer eyJhbGc..." }
  ├─ user_id: 1
  ├─ empresa_id: 1
  ├─ roles: ['admin', 'gerente']
  └─ permissions: ['read_habilitacoes', 'write_habilitacoes', ...]


Middleware de Autenticação
──────────────────────────
const authMiddleware = (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  const decoded = verify(token, SECRET);
  c.set('user', decoded);
  return next();
};


Validação (Zod)
───────────────
const habilitacaoSchema = z.object({
  funcionario_id: z.number().int().min(1),
  qualificacao_id: z.number().int().min(1),
  data_conclusao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data_vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  resultado: z.enum(['APROVADO', 'REPROVADO', 'PENDENTE']),
  status: z.enum(['ATIVA', 'VENCIDA', 'SUSPENSA']),
  nota_final: z.number().min(0).max(10).optional(),
  instrutor: z.string().max(200).optional(),
  observacoes: z.string().max(1000).optional(),
});


Auditoria
─────────
Cada operação registra em audit_logs:
  {
    id: 123,
    usuario_id: 1,
    acao: 'CREATE_HABILITACAO',
    tabela: 'habilitacoes',
    registro_id: 1037,
    dados_antes: null,
    dados_depois: {...},
    timestamp: '2025-11-03 20:35:42',
    ip_address: '192.168.1.1',
    status: 'sucesso'
  }


═════════════════════════════════════════════════════════════════════════════
                         PERFORMANCE
═════════════════════════════════════════════════════════════════════════════

Build Time:        3.40 segundos ✅
Bundle Size:       Habilitacoes.js: 44.38 KB (gzip: 9.21 KB) ✅
Worker Startup:    28 ms ✅
Deploy Time:       22.32 segundos ✅

Database Query:    < 100ms para 1036 registros
Frontend Render:   < 500ms para 1036 registros
Total Page Load:   < 2 segundos


═════════════════════════════════════════════════════════════════════════════
                         AMBIENTE LOCAL vs PRODUÇÃO
═════════════════════════════════════════════════════════════════════════════

LOCAL (Development)
───────────────────
URL:        http://localhost:8787
Auth:       Opcional (pode desabilitar)
Database:   SQLite local
Storage:    /tmp/d1
Logging:    Completo
Testing:    Fácil

COMANDO:    npm run dev
            wrangler dev


PRODUÇÃO
────────
URL:        https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev
Auth:       JWT obrigatório
Database:   D1 (Cloudflare)
Storage:    R2 (Cloudflare)
Logging:    Estruturado
Testing:    CI/CD

COMANDO:    wrangler deploy
```

---

**Mapa Mental Visual**  
**Status**: REFERÊNCIA RÁPIDA ✅  
**Data**: 3 de novembro de 2025  
**Para entender**: Fluxos, componentes, e como tudo se conecta

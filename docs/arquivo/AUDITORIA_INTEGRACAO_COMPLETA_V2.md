# 🔍 Auditoria Profunda de Integração Frontend ↔ Backend (v2)
**Data:** 13/11/2025  
**Branch:** `refactor/remove-v2-structure`

---

## 1. Objetivo e Escopo

Esta auditoria revisa **em profundidade** toda a integração da aplicação AirTrust v1 após a remoção da estrutura `/api/v2`, cobrindo:

1. Rotas do **backend** (`src/worker`) e mapeamento para tabelas D1
2. Serviços, hooks e páginas do **frontend novo** (`src/react-app`)
3. Middlewares de segurança, rate-limit e cache
4. Resquícios de `/api/v2` e módulos legacy
5. Validação de compilação TypeScript

O foco é garantir que **tudo que está em uso hoje** esteja consistente com o novo padrão `/api/*` e com o banco D1 clonado de produção.

---

## 2. Estado Atual do Banco D1 (Local)

Arquivo D1 detectado:
- `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/db.sqlite`

Tabelas relevantes para esta auditoria:

```text
funcionarios
funcionarios_aeronaves
qualificacoes
qualificacoes_categorias
qualificacoes_historico
certificados
certificados_templates
habilitacoes                  (legacy)
empresa_certificado_config
sessao_manobras
sessoes
sessoes_fichas
sessoes_manobras
sessoes_participantes
sessoes_template
sessoes_treinamento
simulador_agendamentos
simuladores
fichas
fichas_manobras_historico
fichas_sessao
manobras
manobras_categorias
```

**Conclusão:** O banco local contém todas as tabelas necessárias para Funcionários, Qualificações (tipos + histórico), Certificados, Simuladores e Treinamentos.

---

## 3. Backend – Rotas e Mapeamento para Tabelas

Arquivo central de rotas: `src/worker/routes/index.ts`.

### 3.1. Funcionários

- **Rota principal:**
  - `app.route('/api/funcionarios', funcionariosRoutes());`
- **Implementação:**
  - `src/worker/api/funcionarios-crud.ts`
- **Tabela(s) usadas:**
  - `funcionarios`
  - `funcionarios_aeronaves`

Trechos relevantes (simplificado):
```sql
FROM funcionarios
...
JOIN funcionarios_aeronaves ...
```

**Situação:**
- Listagem, filtros, busca por ID, importação e vínculos com aeronaves estão todos em cima das tabelas corretas.
- Não há mais nenhuma rota ativa `/api/v2/funcionarios`.

✅ **Status:** `/api/funcionarios` ↔ `funcionarios` (+ `funcionarios_aeronaves`) – CONSISTENTE

---

### 3.2. Qualificações (Tipos)

- **Rota principal:**
  - `app.route('/api/qualificacoes', qualificacoes);`
- **Implementação:**
  - `src/worker/api/qualificacoes.ts`
- **Tabelas usadas:**
  - `qualificacoes`
  - `qualificacoes_categorias`

Uso típico:
```sql
FROM qualificacoes
WHERE deleted_at IS NULL
```

- Endpoint auxiliar:
  - `app.route('/api/qualificacoes-list', qualificacoesList);` – lista simplificada para dropdowns.

✅ **Status:** `/api/qualificacoes` ↔ `qualificacoes` – CONSISTENTE

---

### 3.3. Histórico de Qualificações

- **Rota principal:**
  - `app.route('/api/historico', historico);`
- **Implementação:**
  - `src/worker/api/historico.ts`
- **Tabela usada:**
  - `qualificacoes_historico`

Exemplos:
```sql
FROM qualificacoes_historico ...
.prepare('SELECT * FROM qualificacoes_historico WHERE id = ?')
```

- Rota de compatibilidade:
  - `app.route('/api/habilitacoes', habilitacoesEndpoint); // redirect 301 → /historico`

✅ **Status:** `/api/historico` ↔ `qualificacoes_historico` – CONSISTENTE

---

### 3.4. Certificados

- **Rotas principais:**
  - `app.route('/api/certificados', certificadosSimplificado);`  
    → implementado em `src/worker/api/certificados.ts`
  - Rota legacy: `app.route('/api/certificados-v2-old', certificadosV2);`  
    → mantém compatibilidade com a versão antiga, mas o frontend novo não depende dela.

- **Tabelas usadas:**
  - `certificados`
  - `certificados_templates`
  - integração com R2 para storage de PDFs.

✅ **Status:** `/api/certificados` ↔ `certificados` – CONSISTENTE

---

### 3.5. Simuladores, Sessoes e Fichas

- **Rotas principais (resumo):**
  - `app.route('/api/simuladores', simuladoresCrud);`
  - `app.route('/api/simuladores-consolidado', simuladoresConsolidado);`
  - `app.route('/api/simulador/ficha', fichasAssinatura);`
  - `app.route('/api/simulador/fichas', simuladorFichasCrud);`
  - `app.route('/api/simulador/slots', simuladorSlots);`
  - `app.route('/api/sessoes', sessoesSimplificado);`
  - `app.route('/api/agendamentos', agendamentos);`

- **Tabelas usadas (conforme nomes no D1):**
  - `simuladores`
  - `simulador_agendamentos`
  - `sessoes`, `sessoes_fichas`, `sessoes_manobras`, `sessoes_participantes`, `sessoes_treinamento`, `sessoes_template`
  - `fichas`, `fichas_sessao`, `fichas_manobras_historico`
  - `manobras`, `manobras_categorias`, `sessao_manobras`

✅ **Status:** Rotas de simuladores/fichas/sessões usam tabelas coerentes com a modelagem atual.

---

### 3.6. Importações e Auditoria

- **Importações:**
  - `app.route('/api/import', importRouter);`
  - Middleware atualizado:
    - `app.use('/api/import', checkRole(['ADMIN']));`
    - `app.use('/api/import', rateLimiter({ windowMs: 3600000, maxRequests: 10 }));`

- **Auditoria:**
  - `app.route('/api/auditoria', auditoria);`
  - RBAC atualizado:
    - `app.use('/api/auditoria', checkRole(['ADMIN', 'AUDITOR']));`

✅ **Status:** Import e auditoria protegidos e alinhados com `/api/*`.

---

## 4. Middlewares e Utilitários

### 4.1. RBAC e Segurança

- **LGPD:**
  - Antes: `app.use('/api/v2/lgpd', ...)`  
  - Agora: `app.use('/api/lgpd', checkRole(['ADMIN', 'DPO']));`
  - Rota: `app.route('/api/lgpd', lgpd);`

- **Auditoria:**
  - Antes: `app.use('/api/v2/auditoria', ...)`  
  - Agora: `app.use('/api/auditoria', checkRole(['ADMIN', 'AUDITOR']));`
  - Rota: `app.route('/api/auditoria', auditoria);`

- **Import:**
  - Antes: `app.use('/api/v2/import', ...)`  
  - Agora:
    ```ts
    app.use('/api/import', checkRole(['ADMIN']));
    app.use('/api/import', rateLimiter({ windowMs: 3600000, maxRequests: 10 }));
    app.route('/api/import', importRouter);
    ```

✅ **Status:** Todas as rotas críticas de segurança/privacidade estão consistentes com o prefixo `/api`.

### 4.2. Cache (kvCacheMiddleware)

Antes os middlewares estavam pendurados em `/api/v2/*`. Agora:

```ts
// Lightweight KV/in-memory cache for list GET endpoints
app.use('/api/qualificacoes', kvCacheMiddleware(120));
app.use('/api/qualificacoes-list', kvCacheMiddleware(300));
app.use('/api/funcionarios', kvCacheMiddleware(60));
app.use('/api/funcoes', kvCacheMiddleware(600));
app.use('/api/setores', kvCacheMiddleware(600));
app.use('/api/empresas', kvCacheMiddleware(600));
app.use('/api/categorias', kvCacheMiddleware(600));
```

✅ **Status:** Cache está alinhado com as rotas atuais `/api/*`.

### 4.3. Health e Version

- Health:
  - `app.get('/api/health', ...)` – ok.
- Version:
  - Atualizado para `app.get('/api/version', ...)` com payload:
    ```ts
    {
      version: Date.now(),
      deployed_at: new Date().toISOString(),
      environment: c.env?.ENVIRONMENT || 'production',
    }
    ```

✅ **Status:** endpoints de health/version consistentes e úteis para debug.

---

## 5. Frontend Novo (`src/react-app`) – Serviços, Hooks e Páginas

### 5.1. Configuração de API

Arquivo: `src/react-app/config/api.ts`

- `resolveApiBase()`:
  - Em produção (Workers):
    - `https://0199d03e-fe13-77d7-a6e7-7d94d446894b-production.airtrust.workers.dev/api`
  - Em dev (sem VITE_API_URL):
    - `${origin}/api`
- `API_ENDPOINTS`:
  - `LOGIN`, `LOGOUT`, `REFRESH_TOKEN`, etc. → `${API_BASE_URL}/auth/...`
  - `FUNCIONARIOS` → `${API_BASE_URL}/funcionarios`
  - `CERTIFICACOES` → `${API_BASE_URL}/qualificacoes`
  - `PASTA_VIRTUAL`, `SIMULADORES`, etc. – todos em `/api/*`.
  - `HEALTH`/`AUDIT_LOGS` usam `API_BASE_URL.replace('/api', '')` + `/api/...` (corrigido do antigo `/api/v2`).

✅ **Status:** Base de URL totalmente migrada para `/api`.

### 5.2. Hook `useApi`

Arquivo: `src/react-app/hooks/useApi.ts`

Regra de construção de URL (simplificado):

```ts
const API_ORIGIN = API_BASE_URL.replace(/\/api$/, '');

if (url.startsWith('http')) {
  fullUrl = url;
} else if (url.startsWith('/api/')) {
  fullUrl = API_ORIGIN + url;
} else if (url.startsWith('/')) {
  const needsPrefix = !url.startsWith('/api');
  fullUrl = API_ORIGIN + (needsPrefix ? '/api' : '') + url;
} else {
  fullUrl = `${API_ORIGIN}/api/${url}`;
}
```

✅ **Status:** `useApi` está consistente com o novo padrão `/api` e evita duplicações.

### 5.3. Services principais

#### Funcionários – `src/react-app/services/funcionarios.service.ts`

- `listar` → `api.get('/funcionarios?...')`
- `buscarPorId` → `api.get('/funcionarios/${id}')`
- Import/export, filtros, cache interno – todos em `/funcionarios`.

#### Qualificações – `src/react-app/services/qualificacoes.service.ts`

- `listar` → `api.get('/qualificacoes?...')`
- `dashboard` → `api.get('/qualificacoes/dashboard')`
- CRUD e import/export – tudo em `/qualificacoes`.

#### API Client – `src/react-app/services/api.ts`

- Usa `API_BASE_URL` e injeta headers, token, CSRF; todos endpoints são relativos (`/funcionarios`, `/qualificacoes`, etc.).

✅ **Status:** Services React novos estão totalmente alinhados com `/api/*`.

### 5.4. Páginas que tinham URLs hardcoded

Corrigidos para remover `/api/v2`:

- `src/react-app/pages/FuncionariosNew.tsx`
- `src/react-app/pages/QualificacoesNew.tsx`
- `src/react-app/main.tsx` (normalização de `fetch`):
  - `API_BASE` agora termina em `/api` e não mais `/api/v2`.

✅ **Status:** Nenhuma página nova usa mais `/api/v2`.

---

## 6. Código Legacy e Referências a `/api/v2`

Ainda existem referências a `/api/v2` em **código legacy** ou **arquivos de backup/documentação**, por exemplo:

- `src/worker/routes/index.ts.bak`
- `src/worker/routes/index.ts.backup-pre-optimization`
- `src/services/api.ts` (camada anterior de serviços)
- `src/client/hooks/useQualificacoes.ts`
- Documentos: `PHASE_3_FRONTEND_INTEGRATION_COMPLETE.md`, `FINAL_SETUP_REPORT.md`, etc.

Esses arquivos **não são usados** pelo frontend novo em `src/react-app` nem pelas rotas atuais `/api/*`. Foram mantidos apenas como histórico.

Sugestão futura:
- Mover esses arquivos para uma pasta `_legacy/` ou `_archive/` para ficar explícito que não fazem parte da arquitetura ativa.

---

## 7. Validação de Compilação e Consistência

- Comando executado:

```bash
npx tsc --noEmit
```

- Resultado:
  - **0 erros** de compilação TypeScript.

Isso confirma que:
- Todos os imports estão resolvidos.
- Não há mais referências quebradas a arquivos `api/v2/*` no código ativo.
- As alterações de rota/middleware (LGPD, auditoria, import, cache) são sintaticamente e tipicamente válidas.

---

## 8. Conclusões Finais

### 8.1. Backend

- Todas as rotas ativas relevantes foram migradas para `/api/*`:
  - Funcionários: `/api/funcionarios`
  - Qualificações: `/api/qualificacoes`
  - Histórico: `/api/historico`
  - Certificados: `/api/certificados`
  - Simuladores/sessões/fichas: `/api/simuladores`, `/api/sessoes`, `/api/simulador/*`, etc.
- Middlewares de segurança (RBAC), importação e cache foram atualizados para o novo prefixo `/api`.
- Mapeamento para tabelas D1 foi verificado para todos os modules críticos.

### 8.2. Frontend

- O frontend novo (`src/react-app`) consome **apenas** `/api/*`.
- `API_BASE_URL`, `useApi` e os services (`funcionarios`, `qualificacoes`, etc.) estão consistentes com o backend.
- URLs hardcoded antigas (`/api/v2`) foram removidas das páginas novas.

### 8.3. Legacy

- Código e docs antigos ainda mencionam `/api/v2`, mas estão claramente isolados e não impactam o comportamento atual.
- Podem ser movidos para `_legacy/` em um próximo passo, se você quiser uma limpeza ainda mais agressiva.

---

## 9. Próximos Passos Recomendados

1. **Opcional – Arquivar legacy:**
   - Criar pasta `_legacy/` e mover `src/services/*`, `src/client/*`, `src/pages/*` antigos e `index.ts.*.bak` para lá.

2. **Teste manual ponta-a-ponta:**
   - Subir backend local (porta 8788) e frontend (porta 3000/3010) usando `VITE_API_URL=http://localhost:8788/api`.
   - Validar visualmente:
     - Lista de funcionários
     - Tela de qualificações (tipos + histórico)
     - Pasta virtual / certificados
     - Simuladores / sessões.

3. **Merge para `main`** assim que os testes manuais confirmarem o funcionamento.

---

**Status final da auditoria:**  
✅ Backend e frontend alinhados em `/api/*`  
✅ Rotas críticas protegidas e com cache ajustado  
✅ Banco D1 local espelhando corretamente a modelagem de produção  
✅ 0 erros de compilação TypeScript


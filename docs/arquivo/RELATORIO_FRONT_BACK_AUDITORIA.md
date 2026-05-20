# Relatório de Auditoria Completa (Frontend + Backend + DB)

Data: 2025-11-14 (BRT)
Base de verdade: commit 85d146a (frontend 100% refatorado; worker antigo)

## Escopo oficial

- Módulos: Funcionários, Qualificações (tipos + histórico), Simuladores
- Banco: D1 com soft delete (created_at, updated_at, deleted_at)
- Nota de nomenclatura: tabela de tipos deve ser qualificacoes_tipos; histórico deve ser qualificacoes_historico

---

## 1) Backend (Workers + Hono + D1 + R2)

### 1.1 Mapeamento de módulos e rotas

Arquivos-chave (src/worker):

- Rotas agregadas: `src/worker/routes/index.ts`
  - Funcionários: `app.route('/api/funcionarios', funcionariosRoutes())`
  - Qualificações (tipos/histórico):
    - `app.route('/api/qualificacoes', qualificacoes)`
    - `app.route('/api/qualificacoes-list', qualificacoesList)`
    - `app.route('/api/historico', historico)`
    - `app.route('/api/qualificacoes-historico', qualificacoesHistoricoEndpoint)`
    - `app.route('/api/categorias', categoriasEndpoint)`
  - Simuladores:
    - `app.get('/api/simuladores', ...)` (lista simples)
    - `app.route('/api/sessoes', sessoesSimplificado)` (sessões de simulador)
  - Não oficial (fora de escopo):
    - `app.route('/api/treinamentos', treinamentosApi)`

APIs específicas (presentes):

- `src/worker/api/qualificacoes.ts` (usa qualificacoes_historico e qualificacoes_tipos)
- `src/worker/api/qualificacoes-list.ts` (lista de tipos)
- `src/worker/api/qualificacoes-historico.ts` (histórico)
- `src/worker/routes/qualificacoes-historico.ts` (legacy compat)
- `src/worker/api/sessoes.ts` (sessões de simulador)
- `src/worker/api/certificados.ts` (R2 download)
- Não oficiais: `src/worker/api/treinamentos.ts`, `src/worker/api/treinamentos-sessoes.ts`, `src/worker/api/treinamentos/sessoes.ts`

### 1.2 Esquema D1 e uso real nas consultas

Referências no código (confirmadas por busca):

- Tipos: `qualificacoes_tipos`
- Histórico: `qualificacoes_historico`
- Funcionários: `funcionarios`
- Simuladores: `simuladores`

Soft delete: presente e utilizado nas queries (ex.: `WHERE deleted_at IS NULL`).

Diferença encontrada no seed local:

- `seed-local-minimal.sql` ainda cria a tabela `qualificacoes` (modelo antigo misto), sem `qualificacoes_tipos` e `qualificacoes_historico`.

Proposta de migração (D1) para alinhar nomenclatura e dados:

1. Criar tabela de tipos (se não existir):

```sql
CREATE TABLE IF NOT EXISTS qualificacoes_tipos (
  id TEXT PRIMARY KEY,
  codigo TEXT UNIQUE,
  nome TEXT NOT NULL,
  categoria TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
```

2. Criar tabela de histórico (se não existir):

```sql
CREATE TABLE IF NOT EXISTS qualificacoes_historico (
  id TEXT PRIMARY KEY,
  funcionario_id TEXT NOT NULL,
  qualificacao_id TEXT NOT NULL, -- FK para qualificacoes_tipos.id
  data_conclusao TEXT,
  data_vencimento TEXT,
  status TEXT,
  observacoes TEXT,
  certificado_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes_tipos(id)
);
```

3. Migração de dados (se somente `qualificacoes` existir):

```sql
-- Popular tipos pela combinação (codigo, nome, categoria)
INSERT OR IGNORE INTO qualificacoes_tipos (id, codigo, nome, categoria)
SELECT DISTINCT
  COALESCE(codigo, lower(replace(nome,' ', '_'))) AS id,
  codigo,
  nome,
  categoria
FROM qualificacoes
WHERE deleted_at IS NULL;

-- Popular histórico referenciando o tipo
INSERT OR IGNORE INTO qualificacoes_historico (
  id, funcionario_id, qualificacao_id, data_conclusao, data_vencimento, status, observacoes
)
SELECT
  id,
  funcionario_id,
  COALESCE(codigo, lower(replace(nome,' ', '_'))) AS qualificacao_id,
  data_emissao,
  data_validade,
  status,
  observacoes
FROM qualificacoes
WHERE deleted_at IS NULL;
```

4. Opcional: manter `qualificacoes` apenas como view de compatibilidade.

```sql
CREATE VIEW IF NOT EXISTS qualificacoes AS
SELECT
  h.id,
  h.funcionario_id,
  t.codigo,
  t.nome,
  t.categoria,
  h.data_conclusao AS data_emissao,
  h.data_vencimento,
  h.status,
  h.observacoes,
  h.created_at,
  h.updated_at,
  h.deleted_at
FROM qualificacoes_historico h
JOIN qualificacoes_tipos t ON t.id = h.qualificacao_id
WHERE h.deleted_at IS NULL;
```

### 1.3 Segurança e middleware

- JWT: atualmente em `src/worker/services/auth-service.ts` com `hono/jwt`.
  - Recomendação: migrar para `jose` (jwtVerify) com validação de iss, aud, exp, alg.
- CORS: configurado apenas para localhost em `src/worker/index.ts`.
  - Recomendação: parametrizar via ENV e whitelist de domínios de produção.
- RBAC: há trechos comentados; confirmar reativação nos endpoints críticos (auditoria, backup, import).
- Error handling: `worker.onError` implementado corretamente com formato `{ success, error, code? }`.

### 1.4 Divergências críticas (backend)

- Rota não oficial: `/api/treinamentos` (e sub-recursos) – fora do escopo; manter desativada/remover.
- Sombra de nomenclatura: seed local usa `qualificacoes`; código usa `qualificacoes_tipos` e `qualificacoes_historico`.
- Endpoints de simuladores: frontend usa `/api/simuladores/sessoes` em alguns pontos; backend expõe `/api/sessoes`.

---

## 2) Frontend (React 19 + Vite + Tailwind)

### 2.1 Rotas e páginas

- Router principal: `src/react-app/App.tsx`
  - Rotas presentes: `/`, `/funcionarios`, `/qualificacoes`
  - Divergência: página `Simuladores.tsx` existe, mas rota `/simuladores` NÃO está registrada.

Páginas relevantes existentes (confirmadas):

- Funcionários: `pages/Funcionarios.tsx`, `pages/FuncionariosNew.tsx`, `pages/FuncionariosSimples.tsx`
- Qualificações: `pages/Qualificacoes.tsx` (wrapper), `pages/qualificacoes/*`, `pages/qualificacoes-historico/*`
- Simuladores: `pages/Simuladores.tsx`, `pages/SimuladoresTemplates.tsx`, componentes em `components/simuladores/*`
- NÃO OFICIAL: `pages/Treinamentos.tsx` e `components/treinamentos/*`

### 2.2 Integração com backend

- Qualificações: usa `/api/qualificacoes` e `/api/qualificacoes-historico` – OK.
- Simuladores: há usos de `/api/simuladores` (lista) e de `/api/simuladores/sessoes` (inexistente no backend atual).
  - Correção: substituir por `/api/sessoes` onde aplicável.
- Treinamentos (não oficial): múltiplos componentes chamam `/api/treinamentos/*`.
  - Decisão: remover/ocultar essas telas e chamadas até o escopo ser aprovado.

### 2.3 Estados e erros

- Padrão de UI: wrapper de Qualificações padronizado (Tabs, PageHeader) – consistente.
- Ações destrutivas: DELETE em `/api/qualificacoes-historico/:id` e `/api/qualificacoes/:id` – confirmadas.
- Recomendações: adicionar estados vazios/erro nos módulos de simuladores (alguns componentes já possuem).

---

## 3) Integração ponta a ponta (fluxos sugeridos para E2E)

1. Login (AuthService) → obter JWT válido
2. Funcionários → criar funcionário → listar → soft delete
3. Qualificações Tipos → criar tipo → listar
4. Qualificações Histórico → atribuir tipo a funcionário → renovar → remover
5. Simuladores → listar simuladores → listar sessões (`/api/sessoes`) → visualizar ficha

Critérios de sucesso:

- 0 chamadas 404/500
- Dados coerentes com D1 (colunas corretas)
- Respostas no formato `{ success, data|error, code? }`

---

## 4) Limpeza de escopo (o que remover/ajustar)

Backend (arquivos a desativar/remover):

- `src/worker/api/treinamentos.ts`
- `src/worker/api/treinamentos-sessoes.ts`
- `src/worker/api/treinamentos/sessoes.ts`
- Linha de rota em `src/worker/routes/index.ts`: `app.route('/api/treinamentos', treinamentosApi);`

Frontend (arquivos a desativar/remover):

- `src/react-app/pages/Treinamentos.tsx`
- Componentes (treinamentos):
  - `src/react-app/components/treinamentos/StatusCertificacoes.tsx`
  - `src/react-app/components/treinamentos/DashboardTreinamentosAtualizado.tsx`
  - `src/react-app/components/treinamentos/TreinamentosCriticos.tsx`
  - `src/react-app/components/treinamentos/QuickUploadModal.tsx`
  - `src/react-app/components/treinamentos/CatalogoManagement.tsx`
  - `src/react-app/components/treinamentos/CertificacoesList.tsx`
  - `src/react-app/components/treinamentos/DashboardTreinamentos.tsx`
  - `src/react-app/components/treinamentos/RastreabilidadeDocumental.tsx`
  - `src/react-app/components/treinamentos/GestaoSessoesTreinamento.tsx`
  - `src/react-app/components/treinamentos/EditCertificacaoModal.tsx`
- Ajustes de integração:
  - `src/react-app/components/compliance/ComplianceMatrix.tsx` (usa `/api/treinamentos/catalogo-treinamentos/:id`)
  - `src/react-app/pages/DebugPanel.tsx` (usar `/api/sessoes` no lugar de `/api/simuladores/sessoes`)
- Ajustar chamadas `/api/simuladores/sessoes` → `/api/sessoes`
- Registrar rota `/simuladores` em `App.tsx` apontando para `pages/Simuladores.tsx`

DB/Seed:

- Atualizar `seed-local-minimal.sql` para criar `qualificacoes_tipos` e `qualificacoes_historico` (ver migração acima) ou adicionar script de migração específico.

---

## 5) Correções propostas (passo a passo)

1. DB: aplicar migração para criar `qualificacoes_tipos` e `qualificacoes_historico` e migrar dados de `qualificacoes`.
2. Backend: remover rota `/api/treinamentos` e APIs relacionadas; manter somente módulos oficiais.
3. Frontend:
   - Registrar rota `/simuladores` no `App.tsx`.
   - Refatorar chamadas para sessões de simuladores para `/api/sessoes`.
   - Remover componentes e telas de `treinamentos` (ou feature-flag com ocultação total do menu).
4. Segurança:
   - Migrar `auth-service` para `jose` com `jwtVerify`, validação de `iss`, `aud`, `exp` e algoritmo.
   - Parametrizar CORS via ENV para produção.

---

## 6) Riscos e impactos

- Migração de dados: garantir backup antes de alterar esquema; usar transação quando possível.
- Remoção de módulos não oficiais: revisar importações para evitar dead code/imports quebrados.
- Rota `/simuladores`: pequena alteração no roteamento do SPA (baixo risco).

---

## 7) Conclusão

O estado atual (85d146a) está próximo do escopo desejado. As principais pendências são de nomenclatura no banco (seed desatualizado), remoção do módulo não oficial de “treinamentos” e pequenos acertos de rotas no frontend (incluir `/simuladores` e ajustar `/api/sessoes`). Aplicando as correções acima, o sistema fica coerente, limpo e pronto para comitê/produção.

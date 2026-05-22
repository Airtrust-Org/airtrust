# AIRTRUST — Repository Health Audit
## v0.3-A · Auditoria Somente Leitura
**Data:** 2026-05-20  
**Auditor:** Claude Sonnet 4.6 (auditoria automatizada)  
**Branch:** `main`  
**HEAD:** `757be1bcd4476d7bdeb433b21ce53a64bfe50f87`  
**origin/main:** `757be1bcd4476d7bdeb433b21ce53a64bfe50f87`  

---

## Sumário Executivo

O repositório Airtrust está operacional e compilável, mas acumula problemas sérios de higiene que aumentam risco, custo de manutenção e degradação de performance do Git ao longo do tempo. Os achados mais críticos são:

1. **Credenciais de produção rastreadas em Git** — R2, D1 e JWT secret em `.env.local.production` commitado.
2. **315 MB de conteúdo binário de cursos** versionado desnecessariamente (vídeos, áudios, imagens).
3. **37 MB de dumps SQL de produção** versionados (dados reais de usuários).
4. **67 erros TypeScript no worker** não detectados pelo build de produção (build usa `tsc --noEmit false`).
5. **Conflito de migração**: dois arquivos `0367_` com nomes distintos.

O repositório **não foi alterado** durante esta auditoria. Nenhum arquivo foi editado, movido, deletado ou renomeado.

---

## 1. Estado Git Inicial

| Item | Valor |
|---|---|
| Branch atual | `main` |
| HEAD | `757be1b` |
| origin/main | `757be1b` (idêntico — sync) |
| `git status` | Limpo (sem alterações uncommitted) |
| Arquivos rastreados | **4.608** |
| Arquivos não rastreados | **0** |

---

## 2. Mapa Estrutural do Repositório

```
/Airtrust
├── src/
│   └── react-app/          → Frontend React (Vite + TS)
│       ├── pages/          → 239 arquivos .tsx, 40+ subpastas
│       ├── components/     → 188 componentes
│       ├── hooks/          → 65 hooks
│       ├── services/, utils/, i18n/, types/…
│   ├── __tests__/          → Testes de integração frontend
│   └── (outros módulos compartilhados)
├── worker-airtrust/        → Backend Cloudflare Worker (Hono)
│   ├── src/
│   │   ├── routes/         → 119 arquivos de rotas
│   │   ├── services/       → Serviços de domínio
│   │   ├── middleware/     → Auth, CORS, rate-limit, tenant…
│   │   ├── cron/           → Jobs agendados
│   │   ├── __tests__/      → Testes unitários/integração
│   └── migrations/         → 342 arquivos de migração SQL
├── worker-frontend/        → Worker de frontend (Cloudflare Pages)
├── e2e/                    → Testes Playwright (4 módulos)
├── docs/                   → 975 arquivos .md de documentação
├── scripts/                → Scripts de build, deploy, manutenção
├── sql/                    → Scripts SQL de manutenção
├── fixtures/, public/      → Dados de teste e assets públicos
│
├── CGA - Conhecimentos Gerais de Aeronaves/   ⚠️ 46 MB binários rastreados
├── Emergências Gerais/                         ⚠️ 57 MB binários rastreados
├── Operações Offshore/                         ⚠️ 143 MB binários rastreados
├── Operações PBN/                              ⚠️ 69 MB binários rastreados
├── __Arquivos - Upload/                        ⚠️ 15 MB PDFs rastreados
├── _arquivos_nao_usados/                       ⚠️ 631 arquivos rastreados (28 MB)
│
├── .env.local.production   🔴 CRÍTICO: credenciais rastreadas
├── .env.production         ⚠️ env file rastreado
├── .env.test               ⚠️ TEST_PASSWORD rastreado
├── scripts/seed-local.sql  ⚠️ 19 MB dump SQL rastreado
├── scripts/legacy/d1-prod-20260315-193839.sql  ⚠️ 18 MB dump produção
├── backup-*.tar.gz (4 arquivos)  ⚠️ 6.4 MB arquivos rastreados
├── eng.traineddata         ⚠️ 5 MB OCR binary rastreado
├── por.traineddata         ⚠️ 2.3 MB OCR binary rastreado
└── .wrangler-dry/, worker-airtrust/.tmp-worker-bundle/  ⚠️ build artifacts rastreados
```

---

## 3. Maiores Arquivos e Pastas Rastreadas

### Top 20 maiores arquivos rastreados

| Arquivo | Tamanho |
|---|---|
| `scripts/seed-local.sql` | 19 MB |
| `scripts/legacy/d1-prod-20260315-193839.sql` | 18 MB |
| `.wrangler-dry/index.js.map` | 11 MB |
| `__Arquivos - Upload/PRG-OPS-001(PTO)rev09.pdf` | 9.6 MB |
| `CGA - Conhecimentos Gerais de Aeronaves/fit_content_assets/*.jpg` | 8.8 MB |
| `worker-airtrust/.tmp-worker-bundle/index.js.map` | 8.6 MB |
| `CGA - .../modules.473fbbfd66fb5923.js.map` | 6.8 MB |
| `worker-airtrust/.tmp-worker-bundle/index.js` | 5 MB |
| `eng.traineddata` | 5 MB |
| `scripts/legacy/backup_pre_multitenant_20251207_142032.sql` | 4.7 MB |
| `__Arquivos - Upload/PRG-OPS-001_PTOrev08_20251029_084908.pdf` | 3.1 MB |
| `por.traineddata` | 2.3 MB |
| `CGA - .../fit_content_assets/aerial_helicopter_qyilee.jpg` | 2.2 MB |
| `_arquivos_nao_usados/sql_backups/prod_backup_20251122_*.sql` (5 arquivos) | 1.7 MB cada |
| `backup-fase1-final-*.tar.gz` (2 arquivos) | 1.6 MB cada |
| `backup-airtrust-fase1-*.tar.gz` (2 arquivos) | 1.6 MB cada |

### Maiores pastas rastreadas (além de node_modules)

| Pasta | Tamanho |
|---|---|
| `Operações Offshore/` | 143 MB |
| `Emergências Gerais/` | 57 MB |
| `Operações PBN/` | 69 MB |
| `CGA - Conhecimentos Gerais de Aeronaves/` | 46 MB |
| `_arquivos_nao_usados/` | 28 MB |
| `worker-airtrust/.tmp-worker-bundle/` | 14 MB |
| `.wrangler-dry/` | 11 MB |
| `__Arquivos - Upload/` | 15 MB |
| `scripts/` (SQL pesados) | ~22 MB |
| `src/react-app/pages/` | 5 MB |
| `worker-airtrust/src/routes/` | 2.7 MB |

---

## 4. Segurança e Higiene

### 🔴 P0 — Credenciais de Produção em Git

#### Arquivo: `.env.local.production` (rastreado)
**Risco: CRÍTICO.** Este arquivo contém chaves de produção ativas:
- `R2_ACCESS_KEY_ID` — Credencial de acesso ao bucket Cloudflare R2
- `R2_SECRET_ACCESS_KEY` — Chave secreta R2
- `D1_AUTH_TOKEN` — Token de autenticação do banco D1
- `JWT_SECRET` — Segredo de assinatura de tokens de sessão
- `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `D1_DB_ID`

**Recomendação:** Revogar e rotacionar **imediatamente** todos os segredos listados acima. Remover o arquivo do histórico Git com `git filter-repo` ou BFG Repo Cleaner. Garantir que segredos futuros nunca sejam commitados.

#### Arquivo: `.env.production` (rastreado)
Contém: `CORS_ALLOWED_ORIGINS`, `VITE_API_URL`, `ENVIRONMENT`. Não contém chaves de acesso, mas `.env.*` não deveriam ser rastreados por princípio.

#### Arquivo: `.env.test` (rastreado)
Contém `TEST_EMAIL` e `TEST_PASSWORD`. Dependendo da senha, pode ser uma credencial de conta real usada em testes de staging/produção.

#### Arquivo: `src/.env.production` (rastreado)
Contém apenas `VITE_API_URL`. Risco baixo, mas contraria boas práticas.

### ⚠️ Dados de Produção em SQL Dumps Rastreados

| Arquivo | Tamanho | Risco |
|---|---|---|
| `scripts/legacy/d1-prod-20260315-193839.sql` | 18 MB | Dump completo de produção com dados de usuários |
| `scripts/seed-local.sql` | 19 MB | Seed potencialmente derivado de dados reais |
| `scripts/legacy/backup_pre_multitenant_20251207_142032.sql` | 4.7 MB | Backup de produção pré-multitenant |
| `_arquivos_nao_usados/sql_backups/prod_backup_*.sql` (5 arquivos) | ~1.7 MB cada | Backups diretos de produção |

**Risco:** Exposição de dados pessoais de tripulantes (nomes, CPFs, licenças, qualificações). Violação potencial da LGPD se o repositório for acessado por terceiros.

### ⚠️ Arquivos que Deveriam Estar no .gitignore

Apesar de algumas regras já existirem no `.gitignore`, os arquivos abaixo estão rastreados porque foram adicionados ao Git **antes** da regra de exclusão ser criada. O `.gitignore` não remove arquivos já rastreados:

| Arquivo/Pasta | Status no .gitignore |
|---|---|
| `.env.local.production` | Não coberto explicitamente |
| `.env.production` | Não coberto (só `.env.*` exclui `.env` sem sufixo) |
| `_arquivos_nao_usados/` | Coberto mas 631 arquivos ainda rastreados |
| `backup-*.tar.gz` | `*.gz` está no gitignore mas arquivos estão rastreados |
| `eng.traineddata`, `por.traineddata` | Não cobertos |
| `.wrangler-dry/` | Coberto mas 2 arquivos ainda rastreados |
| `worker-airtrust/.tmp-worker-bundle/` | Não coberto explicitamente |
| `.tmp-deploy-edapp-20260408195248/` | `.tmp-deploy*/` está no gitignore mas 11 arquivos rastreados |

---

## 5. Eficiência do Repositório

### Binários Pesados Versionados

**Total estimado de binários desnecessários no Git:** ~350 MB

| Categoria | Tamanho | Arquivos |
|---|---|---|
| Conteúdo de cursos (vídeo, áudio, imagens, H5P) | ~315 MB | 576 arquivos (4 diretórios) |
| Build artifacts (source maps, bundles) | ~25 MB | 5 arquivos |
| OCR training data | 7.3 MB | 2 arquivos |
| Backups .tar.gz | 6.4 MB | 4 arquivos |
| PDFs operacionais | 15 MB | 6 arquivos |

**Impacto:** Cada `git clone` baixa ~370 MB de dados que não contribuem para o desenvolvimento. Isso degrada:
- Velocidade de clonagem e checkout
- Performance de `git status`, `git log`, `git grep`
- Experiência de agentes de código (contexto poluído)
- Custo de armazenamento remoto

### Duplicações Relevantes

1. **SQL dumps de produção** existem em `scripts/legacy/`, `scripts/seed-local.sql`, `_arquivos_nao_usados/sql_backups/` — múltiplas cópias do mesmo dado histórico.
2. **672 arquivos .sql** no total no repositório — concentração extrema de SQL fora das migrações formais.
3. **975 documentos .md** — 881 em `docs/arquivo/` (diretório de arquivamento, mas ainda rastreados).
4. **perplexity_airtrust_sources/** (8 arquivos, 1.7 MB) — contexto gerado para LLMs, sem valor para o projeto.

---

## 6. Integridade do Source Tree

### Build / TypeScript

#### Frontend (Vite + React)
- **`npx tsc --noEmit`:** Nenhum erro encontrado. Frontend typesafe.

#### Worker (Cloudflare Worker / Hono)
- **`npx tsc -p worker-airtrust/tsconfig.json --noEmit`:** **67 erros TypeScript** encontrados.

| Arquivo | Erros |
|---|---|
| `worker-airtrust/src/routes/frms.ts` | ~35 erros (string | undefined) |
| `worker-airtrust/src/routes/frms-fira.ts` | 6 erros |
| `worker-airtrust/src/routes/frms-relatorios-config.ts` | 3 erros |
| `worker-airtrust/src/routes/alertas.ts` | 1 erro |
| `worker-airtrust/src/routes/importacao.ts` | erros |
| `worker-airtrust/src/routes/qualificacoes/historico-write.ts` | erros |
| `worker-airtrust/src/services/html-to-pdf.ts` | erros |
| `worker-airtrust/src/services/pdf-generator.ts` | erros |
| `worker-airtrust/src/utils/security.ts` | erros |

**Padrão dominante:** `Argument of type 'string | undefined' is not assignable to parameter of type 'string'`. Indica query params de URL sem validação de nullability — risco de runtime error em requisições malformadas.

**Nota:** O build de produção usa `tsc --noEmit false` (via `vite build`), que não para com erros de tipo. Os erros existem silenciosamente em produção.

### Migrações

- **342 migrações** no total (`worker-airtrust/migrations/`)
- **Conflito detectado:** Dois arquivos com prefixo `0367_`:
  - `0367_classificar_dificuldade_sk76_restantes.sql`
  - `0367_sk76_reaquisicao_experiencia_recente.sql`
  - Isso pode causar comportamento não determinístico no runner de migrações dependendo de ordenação alfabética.
- **Arquivo fora de sequência:** `132_add_funcionario_ativo.sql` (sem zero-padding), `9999_add_modelo_sessao_id_to_agendamentos.sql` (número reservado especial), `purge-soft-deleted-qualificacoes.sql` (sem numeração — não será detectado como migração sequencial).
- **Arquivo com extensão inválida:** `0020_simuladores_final.sql.bkp` — não é SQL, não é migração, mas está na pasta de migrações.

---

## 7. Frontend (src/react-app)

### Estrutura

| Métrica | Valor |
|---|---|
| Total de arquivos .tsx | 239 |
| Total de componentes | 188 |
| Total de hooks | 65 |
| Páginas na raiz de `/pages/` | 54 |
| Módulos com pasta própria | escalas, frms, funcionarios, lms, qualificacoes, relatorios, sgso, simuladores, admin, compliance, Configuracoes |

### Páginas Possivelmente Órfãs (não referenciadas em App.tsx)

As seguintes páginas existem no diretório `pages/` mas **não foram encontradas como importações ou rotas em `App.tsx`**:

| Página | Observação |
|---|---|
| `DashboardNew.tsx` | Provavelmente substituído por `DashboardPrincipal.tsx` |
| `Agendamento.tsx` | Sem rota registrada |
| `AuditoriaDatas.tsx` | Sem rota registrada |
| `BackupRestore.tsx` | Sem rota registrada |
| `Certificacoes.tsx` | Pode ter sido absorvido por Qualificacoes |
| `Empresas.tsx` | Sem rota registrada |
| `Funcoes.tsx` | Sem rota registrada |
| `TesteApiPuro.tsx` | Debug/teste — não deve estar em produção |
| `ManutencaoDados.tsx` | Sem rota registrada |

> Nota: Algumas dessas páginas podem ser acessadas via links internos não passando pelo roteador principal. Verificação manual recomendada antes de remover.

### Duplicações de Páginas

| Grupo | Arquivos |
|---|---|
| Dashboards | `DashboardPrincipal.tsx`, `DashboardNew.tsx` (órfã?), `DashboardQualificacoes.tsx` |
| Configurações | `Configuracoes.tsx`, `ConfiguracoesLayout.tsx`, `ConfiguracoesFuncoes.tsx`, `ConfiguracoesPage.tsx` |
| Pasta Virtual | `PastaVirtual.tsx` (38 KB), `PastaVirtualGeral.tsx`, `PastaVirtualLanding.tsx` |
| Importação | `ImportacaoPageV2.tsx` (nome indica V2, versão V1 pode estar em _arquivos_nao_usados) |

### Arquivos de Página Muito Grandes

| Arquivo | Tamanho | Risco |
|---|---|---|
| `Qualificacoes.tsx` | 194 KB | Muito grande — dificulta manutenção e LLM context |
| `TreinamentosPlanejadosPage.tsx` | 92 KB | Muito grande |
| `DashboardPrincipal.tsx` | 90 KB | Muito grande |
| `Sgso.tsx` | 72 KB | Muito grande |
| `FichaFuncionarioPage.tsx` | 71 KB | Muito grande |
| `SgsoRelato.tsx` | 53 KB | Grande |

---

## 8. Worker / Backend

### Estrutura de Rotas

| Métrica | Valor |
|---|---|
| Total de arquivos de rotas | 119 |
| Importados diretamente em `index.ts` | 67 |
| Arquivos de rota NÃO diretamente importados | 52 |

Os 52 arquivos não importados diretamente em `index.ts` são em sua maioria **helpers, sub-módulos e schemas** importados por outros arquivos de rota (não por `index.ts`). Exemplos:
- `escalas-alocacoes-engine.ts`, `escalas-alocacoes-helpers-internal.ts` → usados por `escalas-alocacoes.ts`
- `qualificacoes/historico-helpers.ts`, `qualificacoes/shared.ts` → usados por rotas de qualificacoes
- `frms-shared.ts`, `frms-fadiga-checkin.schema.ts` → compartilhados entre rotas FRMS

Este padrão é aceitável mas indica que o módulo `escalas` e `qualificacoes` cresceram além do que `index.ts` consegue gerenciar com um import por arquivo — a refatoração por sub-router já foi iniciada (ver `escalas/index.ts`, `qualificacoes/index.ts`).

### Rotas de Diagnóstico/Manutenção em Produção

| Rota | Arquivo | Observação |
|---|---|---|
| `POST /api/qualificacoes-historico/fix-renovadas` | `fix-renovadas.ts` | Operação de correção pontual — ainda ativa |
| `POST /api/qualificacoes-historico/deduplicate` | `deduplicate.ts` | Remove duplicatas — ainda ativa |
| `POST /debug-purge/purge-qualificacoes` | `debug-purge.ts` | Bloqueada em produção por env guard, mas presente no bundle |
| `admin-apply-migration.ts` | Não importado em index | Arquivo de migração manual — não registrado como rota ativa |
| `admin-manual-migrations.ts` | Não importado em index | Idem |
| `admin-migrate.ts` (sem prefixo `admin-`) | Não importado em index | Existência confusa junto a `admin-migration.ts` |

### Arquivos de Rota com Nomenclatura Ambígua

- `admin-migrate.ts` vs `admin-migration.ts` vs `admin-manual-migrations.ts` vs `admin-apply-migration.ts` — 4 arquivos com propósito aparentemente similar, nenhum deles importado em `index.ts`. Risco de confusão sobre qual usar.

### worker-airtrust/src/index.ts

- **1276 linhas** com 119 chamadas `app.*`. Arquivo extremamente longo.
- Importa 67 rotas diretamente — mantém coesão mas dificulta leitura.

---

## 9. Configuração e Deploy

### Scripts

Scripts disponíveis em `package.json` incluem proteções razoáveis:
- `prebuild` exibe aviso de banco de produção ativo
- `lint` inclui `guard:tracked-secrets` e `guard:auth-boundaries`
- Scripts de deploy separados por camadas (pages vs worker-only)

### Problemas Identificados

| Script | Problema |
|---|---|
| `db:qualificacoes:legacy-safe` | Script npm que executa SQL direto em produção remoto — nome "safe" pode dar falsa sensação de segurança |
| `db:qualificacoes:fap14-sk76` | Script de dados específicos de empresa em produção via npm script |
| `deploy:all` | Usa `build-and-deploy.sh` — script separado, menor visibilidade |
| `sync:prod:local:safe` / `sync:prod:dev:safe` | Requer flag `AIRTRUST_ALLOW_PROD_SYNC=1` — proteção adequada, mas requer atenção |

### Configurações Wrangler

| Arquivo | Propósito |
|---|---|
| `worker-airtrust/wrangler.toml` | Produção e staging |
| `worker-airtrust/wrangler.dev.toml` | Desenvolvimento local |
| `worker-frontend/wrangler.toml` | Worker de frontend |

Estrutura adequada para separação de ambientes.

### TSConfigs Múltiplos

| Arquivo | Propósito |
|---|---|
| `tsconfig.json` | Base |
| `tsconfig.app.json` | Frontend app |
| `tsconfig.node.json` | Node scripts |
| `tsconfig.worker.json` | Worker |
| `tsconfig.escalas.json` | Módulo escalas (raiz) |
| `worker-airtrust/tsconfig.json` | Worker TS |
| `worker-airtrust/tsconfig.escalas.json` | Escalas no worker |
| `worker-frontend/tsconfig.json` | Frontend worker |

8 arquivos tsconfig — elevado mas justificável para um monorepo com múltiplos targets.

---

## 10. Documentação

### Visão Geral

| Métrica | Valor |
|---|---|
| Total de .md rastreados em `/docs` | 975 |
| Em `docs/arquivo/` | 881 |
| Em `docs/` raiz | ~70 |
| Em subpastas de docs/ | ~24 |

### Problema Central

A pasta `docs/arquivo/` contém **881 arquivos** — o equivalente a anos de relatórios de auditoria, smoke tests, deploy reports, e histórico de fases do projeto. Eles têm valor histórico mas tornam a pasta `docs/` inutilizável como referência corrente porque:
- Qualquer busca retorna dezenas de resultados irrelevantes
- Não há índice nem categorização
- Documentos recentes e obsoletos coexistem sem distinção

### Documentos Essenciais Identificados

| Arquivo | Propósito |
|---|---|
| `docs/RUNBOOK.md` | Runbook operacional |
| `docs/database-schema.md` | Esquema do banco |
| `docs/API_REFERENCE.md` / `API_ENDPOINTS.md` | Referência de API |
| `docs/MIGRATION_GOVERNANCE_PLAN.md` | Governança de migrações |
| `docs/PRE_DEPLOYMENT_CHECKLIST.md` | Checklist de deploy |
| `docs/CI-CD.md` | Pipeline CI/CD |
| `docs/FRMS_DAILY_FATIGUE_v0.1.md` | Spec do módulo de fadiga (recente) |

### Documentação do Worker

- `worker-airtrust/docs/` existe com documentação específica do worker.
- `worker-airtrust/relatorios-auditoria/` — relatórios de auditoria dentro do worker (deveria estar em docs raiz).

---

## 11. Testes

### Visão Geral

| Categoria | Arquivos |
|---|---|
| Testes unitários frontend (`src/react-app/__tests__`) | ~12 |
| Testes unitários worker (`worker-airtrust/src/__tests__`) | ~35 |
| Testes E2E Playwright (`e2e/`) | 8 specs |
| Testes em `src/__tests__/` | 6 |
| Testes dentro de rotas (`routes/*.test.ts`) | 1 |
| Testes em `_arquivos_nao_usados/` (obsoletos) | ~15 (ignorar) |

**Total de arquivos de teste ativos:** ~62

### Observações

- Cobertura concentrada em: FRMS, escalas, qualificacoes, LMS, auth, RBAC, utils.
- **Gaps visíveis:** SGSO, simuladores, importação, dashboard, configurações.
- O módulo **FRMS** tem a maior densidade de testes (`frms.ts` tem 35+ erros TS mas testes dedicados).
- `e2e/frms/frms.spec.ts` e `e2e/escalas/escalas.spec.ts` cobrem fluxos críticos mas dependem de ambiente configurado.
- Testes em `_arquivos_nao_usados/` (15 arquivos) são obsoletos e não executam no CI.

---

## 12. Arquivos Possivelmente Órfãos ou Não Referenciados

### Pastas sem propósito claro no source tree atual

| Pasta/Arquivo | Observação |
|---|---|
| `.audit/` (14 arquivos rastreados) | Evidências de auditoria antigas — não são código |
| `.dev-logs/` (1 arquivo rastreado) | Log de desenvolvimento |
| `.windsurf/` (não rastreado, existe localmente) | Configuração de IDE Windsurf |
| `perplexity_airtrust_sources/` (8 arquivos) | Documentos gerados para alimentar LLMs — não são código |
| `.tmp-deploy-edapp-20260408195248/` (11 arquivos) | Deploy temporário — deveria ter sido excluído |
| `worker-airtrust/logos/` | Assets de logo no worker — propósito incerto |
| `fixtures/lms/` | Fixtures de teste LMS — verificar se ainda usados |

### Arquivos de rota potencialmente obsoletos

| Arquivo | Motivo de Suspeita |
|---|---|
| `debug-purge.ts` | Comentário interno: "USAR APENAS EM DEV/DEBUG". Bloqueado em produção mas presente no bundle. |
| `fix-renovadas.ts` | Operação de correção pontual pós-importação — pode ser permanente ou one-shot. |
| `deduplicate.ts` | Remove duplicatas — pode ser necessário manter para operações occasionais. |
| `admin-apply-migration.ts` | Não registrado em index. Propósito: execução manual de migrations — deveria ser script, não rota. |
| `admin-manual-migrations.ts` | Idem. |
| `frms-fira.ts` | 6 erros TypeScript — pode indicar implementação incompleta. |

---

## 13. Tabela de Recomendações P0/P1/P2/P3

### 🔴 P0 — Risco Crítico (Segurança/Produção)

| # | Achado | Ação |
|---|---|---|
| P0-01 | `.env.local.production` com R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, D1_AUTH_TOKEN, JWT_SECRET rastreados em Git | **Revogar credenciais imediatamente.** Remover arquivo do histórico Git com BFG/filter-repo. Mover segredos para Wrangler Secrets. |
| P0-02 | 67 erros TypeScript no worker silenciosos em produção (build usa noEmit:false) | Ativar `strict` ou ao menos corrigir erros de `string | undefined` nos arquivos afetados. Considerar adicionar `tsc --noEmit` no CI. |
| P0-03 | Dois arquivos `0367_` de migração com nomes diferentes | Renomear um deles com próximo número disponível (0370+) para evitar conflito não determinístico. |

### 🟠 P1 — Limpeza Estrutural Urgente

| # | Achado | Ação |
|---|---|---|
| P1-01 | 315 MB de conteúdo binário de cursos rastreados (4 pastas de cursos) | Mover para armazenamento externo (R2 ou CDN). Remover do Git com filter-repo. Adicionar ao `.gitignore`. |
| P1-02 | 37 MB de dumps SQL de produção rastreados (`scripts/legacy/`, `_arquivos_nao_usados/sql_backups/`) | Remover do Git. Manter backups em R2 ou storage seguro fora do repo. |
| P1-03 | `.env.production` e `.env.test` rastreados | Remover do Git. Manter apenas `.env.example` e `.env.test.example`. |
| P1-04 | 631 arquivos em `_arquivos_nao_usados/` rastreados apesar de `.gitignore` | Executar `git rm -r --cached _arquivos_nao_usados/` para desrastrear (os arquivos permanecem localmente). |
| P1-05 | Build artifacts rastreados: `.wrangler-dry/` (2 arquivos), `worker-airtrust/.tmp-worker-bundle/` (3 arquivos) | `git rm --cached` nos arquivos específicos. Garantir que regras de gitignore cubram futuros arquivos. |
| P1-06 | 4 backups `.tar.gz` rastreados (total 6.4 MB) | `git rm --cached backup-*.tar.gz`. |
| P1-07 | OCR training data `eng.traineddata` (5 MB) e `por.traineddata` (2.3 MB) rastreados | Avaliar se ainda usados. Se sim, mover para R2. Se não, remover. |
| P1-08 | `purge-soft-deleted-qualificacoes.sql` na pasta de migrações sem numeração | Mover para `sql/maintenance/` ou remover se operação já concluída. |
| P1-09 | `0020_simuladores_final.sql.bkp` na pasta de migrações | Remover — não é uma migração válida. |
| P1-10 | `.tmp-deploy-edapp-20260408195248/` (11 arquivos) rastreado | `git rm -r --cached .tmp-deploy-edapp-20260408195248/`. |

### 🟡 P2 — Melhoria de Organização e Manutenção

| # | Achado | Ação |
|---|---|---|
| P2-01 | 975 docs com 881 em `docs/arquivo/` sem índice | Criar `docs/INDICE.md` com links para os 10-15 documentos operacionais essenciais. Manter arquivo como está mas torná-lo explicitamente "arquivo histórico". |
| P2-02 | 9 páginas frontend possivelmente órfãs | Auditar manualmente se são acessíveis via link. Remover ou roteá-las formalmente. |
| P2-03 | `DashboardNew.tsx` não referenciado em App.tsx | Verificar se é candidato a substituir `DashboardPrincipal` ou se pode ser removido. |
| P2-04 | 4 arquivos `Configuracoes*.tsx` competindo | Consolidar para `ConfiguracoesLayout.tsx` como container e subpáginas nomeadas claramente. |
| P2-05 | `debug-purge.ts` ativo no bundle de produção | Mover para script avulso fora das rotas HTTP ou garantir que não está registrado em production. |
| P2-06 | `fix-renovadas.ts` e `deduplicate.ts` como rotas permanentes | Se são operações de manutenção ocasional, mover para scripts CLI ou proteger com um flag de feature. |
| P2-07 | `perplexity_airtrust_sources/` rastreado | Desrastrear com `git rm --cached` — é conteúdo gerado para LLMs, não faz parte do produto. |
| P2-08 | `.audit/` (14 arquivos) e `.dev-logs/` rastreados | Desrastrear. São artefatos de desenvolvimento. |
| P2-09 | `__Arquivos - Upload/` (15 MB de PDFs operacionais) rastreado | Mover para documentação online (Notion, Google Drive, ou pasta `docs/regulatorio/` sem PDFs grandes). |
| P2-10 | Gaps de cobertura de testes em SGSO, simuladores, dashboard | Planejar testes mínimos para fluxos críticos desses módulos. |
| P2-11 | `worker-airtrust/src/index.ts` com 1276 linhas | Refatorar para sub-routers agrupados por domínio. |
| P2-12 | Migração `132_add_funcionario_ativo.sql` fora de sequência numérica esperada | Verificar se foi aplicada; renomear para sequência correta se necessário. |
| P2-13 | Migração `9999_add_modelo_sessao_id_to_agendamentos.sql` com número reservado | Verificar status; renomear para próximo número sequencial. |

### 🔵 P3 — Melhoria Cosmética / Futura

| # | Achado | Ação |
|---|---|---|
| P3-01 | `Qualificacoes.tsx` com 194 KB | Considerar divisão em sub-componentes e lazy loading por tab. |
| P3-02 | `TreinamentosPlanejadosPage.tsx` (92 KB), `DashboardPrincipal.tsx` (90 KB) | Idem — decomposição progressiva. |
| P3-03 | 4608 arquivos rastreados — elevado para navegação e agentes de código | Implementar P1 reduzirá significativamente. |
| P3-04 | `DESIGN_SYSTEM_REFACTORING_GUIDE.md` dentro de `src/react-app/` | Mover para `docs/`. |
| P3-05 | `worker-airtrust/relatorios-auditoria/` dentro do worker | Consolidar em `docs/auditorias/`. |
| P3-06 | 8 arquivos `tsconfig*.json` no projeto | Documentar propósito de cada um em `CLAUDE.md` ou `docs/`. |
| P3-07 | `TesteApiPuro.tsx` e `DebugPanel.tsx` visíveis para qualquer build | Garantir que páginas de debug são acessíveis apenas com role admin ou removê-las da build. |

---

## 14. Plano de Limpeza Recomendado (Fases Futuras)

### Fase A — Segurança (1-2 dias)
1. Revogar e rotacionar todas as credenciais do `.env.local.production`.
2. Remover `.env.local.production`, `.env.production`, `.env.test` do histórico Git com BFG Repo Cleaner.
3. Adicionar regras explícitas no `.gitignore`: `.env.local.*`, `.env.production`, `.env.test`.
4. Corrigir os 67 erros TypeScript no worker, começando por `frms.ts` (35 erros).
5. Adicionar `npx tsc -p worker-airtrust/tsconfig.json --noEmit` ao CI.

### Fase B — Remoção de Binários e Dados (2-3 dias)
1. Desrastrear `_arquivos_nao_usados/` com `git rm -r --cached`.
2. Desrastrear os 4 diretórios de cursos (315 MB) — mover referências para R2 se necessário.
3. Remover SQL dumps de produção do histórico (BFG por tamanho > 1 MB no `scripts/`).
4. Desrastrear `.wrangler-dry/`, `.tmp-worker-bundle/`, `.tmp-deploy-edapp-*/`, `backup-*.tar.gz`.
5. Desrastrear `perplexity_airtrust_sources/`, `.audit/`, `.dev-logs/`.
6. Executar `git gc --aggressive` para compactar o repositório após as remoções.

### Fase C — Migrações e Organização (1 dia)
1. Resolver conflito `0367_` renomeando um arquivo.
2. Mover `purge-soft-deleted-qualificacoes.sql` e `0020_.sql.bkp` para local adequado.
3. Verificar status de `132_` e `9999_` no banco.

### Fase D — Frontend (incremental)
1. Auditar e remover/rotear páginas órfãs.
2. Iniciar decomposição de `Qualificacoes.tsx` em componentes menores.
3. Consolidar páginas `Configuracoes*.tsx`.

### Fase E — Documentação (incremental)
1. Criar `docs/INDICE.md` com links para documentos operacionais essenciais.
2. Mover `docs/arquivo/` para uma branch de arquivo ou branch separada de documentação histórica.

---

## 15. Avaliação por Área

| Área | Estado | Criticidade |
|---|---|---|
| Segurança (credenciais) | 🔴 Crítico | P0 |
| TypeScript / Build | 🟠 Com erros silenciosos (worker) | P0/P1 |
| Migrações | 🟠 Conflito de numeração | P0/P1 |
| Eficiência do Git | 🟠 Repositório muito pesado | P1 |
| Frontend estrutura | 🟡 Organizado, com páginas órfãs | P2 |
| Worker estrutura | 🟡 Bem organizado, index.ts longo | P2 |
| Documentação | 🟡 Extensa demais, sem índice | P2 |
| Testes | 🟡 Cobertura parcial | P2 |
| Deploy/Config | 🟢 Scripts razoáveis | P3 |

---

## 16. Lista Explícita do que NÃO foi Alterado

Esta auditoria foi **exclusivamente de leitura**. Os seguintes tipos de ação **não foram realizados**:

- ❌ Nenhum arquivo foi editado, criado além deste relatório, movido ou renomeado.
- ❌ Nenhum arquivo foi deletado.
- ❌ Nenhum `git add`, `git commit`, `git push` foi executado.
- ❌ Nenhum `git reset`, `git clean`, `git checkout`, `git restore` foi executado.
- ❌ Nenhum `wrangler deploy` ou comando de deploy foi executado.
- ❌ Nenhuma migration foi aplicada.
- ❌ Nenhum script de escrita remota em banco de dados foi executado.
- ❌ Nenhum dado de produção foi acessado além do conteúdo de arquivos rastreados no repositório.

**Único arquivo criado:** `docs/AIRTRUST_REPOSITORY_HEALTH_AUDIT_v0.3-A.md` (este relatório).

---

## Estado Git Final

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `757be1b` (inalterado) |
| Arquivos modificados | 0 (apenas novo arquivo de relatório, ainda não commitado) |
| Deploy executado | Não |
| Push executado | Não |

---

*Gerado em 2026-05-20 · Airtrust Repository Health Audit v0.3-A*

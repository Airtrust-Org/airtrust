# SGSO — Instruções de Integração com o AirTrust Existente

## 1. Adicionar ao `worker-airtrust/src/index.ts`

Localizar o bloco de importações de rotas (próximo às outras rotas)
e adicionar:

```typescript
// ─── Importação do módulo SGSO ────────────────────────────────
import sgsoRouter from './routes/sgso';
```

No bloco de montagem de routers (após os outros `app.route()`):

```typescript
// Módulo SGSO — Sistema de Gerenciamento de Segurança Operacional
app.route('/api/sgso', sgsoRouter);
```

---

## 2. Executar as Migrations (em ordem)

```bash
# Sprint 1 — Tabelas base (obrigatório primeiro)
printf 'y\n' | npx wrangler d1 execute airtrust-db --remote --env production \
  --file worker-airtrust/migrations/0271_sgso_tabelas_base.sql

# Sprint 1/2 — Fatores humanos e protocolo
printf 'y\n' | npx wrangler d1 execute airtrust-db --remote --env production \
  --file worker-airtrust/migrations/0272_sgso_fatores_humanos_e_protocolo.sql

# Sprint 3/4 — Auditorias e KPI
printf 'y\n' | npx wrangler d1 execute airtrust-db --remote --env production \
  --file worker-airtrust/migrations/0273_sgso_auditorias_e_kpi.sql

# Seed de dados iniciais (ADREP + SPIs default para empresa_id=6)
printf 'y\n' | npx wrangler d1 execute airtrust-db --remote --env production \
  --file worker-airtrust/migrations/0274_sgso_seed_dados_iniciais.sql

# Sprint 5 — RELPREV next-gen, bowtie, matriz de risco configuravel e FRAT
printf 'y\n' | npx wrangler d1 execute airtrust-db --remote --env production \
  --file worker-airtrust/migrations/0281_sgso_relprev_bowtie_frat.sql

# Seed multi-tenant dos templates SGSO next-gen por empresa ativa
printf 'y\n' | npx wrangler d1 execute airtrust-db --remote --env production \
  --file worker-airtrust/migrations/0282_sgso_seed_por_empresa.sql
```

---

## 3. Verificar integração após deploy

```bash
# Health check do novo módulo
curl -H "Authorization: Bearer SEU_TOKEN" \
  https://api.airtrust.online/api/sgso/resumo

# Listar categorias ADREP (sem autenticação em dev)
curl https://api.airtrust.online/api/sgso/categorias-adrep

# SPIs
curl -H "Authorization: Bearer SEU_TOKEN" \
  https://api.airtrust.online/api/sgso/kpi/spi
```

---

## 4. Estrutura de arquivos gerados

```
worker-airtrust/
├── migrations/
│   ├── 0271_sgso_tabelas_base.sql              ← Sprint 1
│   ├── 0272_sgso_fatores_humanos_e_protocolo.sql ← Sprint 2
│   ├── 0273_sgso_auditorias_e_kpi.sql           ← Sprint 3/4
│   ├── 0274_sgso_seed_dados_iniciais.sql         ← Seed inicial
│   ├── 0281_sgso_relprev_bowtie_frat.sql         ← Sprint 5
│   └── 0282_sgso_seed_por_empresa.sql            ← Seed multi-tenant
└── src/
    ├── lib/
    │   └── sgso/
    │       ├── types.ts        ← Tipos, interfaces, MATRIZ_RISCO, funções puras
    │       └── db-service.ts   ← Toda a SQL do módulo
    └── routes/
        └── sgso.ts             ← Router Hono com todos os endpoints
```

---

## 5. Endpoints disponíveis

| Método | Endpoint                                 | Descrição                          |
| ------ | ---------------------------------------- | ---------------------------------- |
| GET    | /api/sgso/resumo                         | Dashboard summary do GSO           |
| GET    | /api/sgso/relatos                        | Listar relatos (paginado, filtros) |
| POST   | /api/sgso/relatos                        | Criar novo relato                  |
| GET    | /api/sgso/relatos/:id                    | Detalhe completo (+ relacionados)  |
| PATCH  | /api/sgso/relatos/:id/status             | Atualizar status do fluxo          |
| DELETE | /api/sgso/relatos/:id                    | Soft delete                        |
| POST   | /api/sgso/relatos/:id/avaliacao-risco    | Criar avaliação de risco 5×5       |
| POST   | /api/sgso/relatos/:id/plano-acao         | Criar ação CAPA                    |
| PATCH  | /api/sgso/relatos/:id/plano-acao/:acaoId | Atualizar progresso da ação        |
| POST   | /api/sgso/relatos/:id/comentario         | Comentário interno do GSO          |
| GET    | /api/sgso/kpi/spi                        | Safety Performance Indicators      |
| GET    | /api/sgso/kpi/tendencias                 | Tendências históricas mensais      |
| GET    | /api/sgso/categorias-adrep               | Catálogo ADREP (dropdown)          |
| GET    | /api/sgso/exportar/csv                   | Export CSV para ANAC               |

---

## 6. Notas de negócio críticas

- **Relatos anônimos**: `relator_id = NULL` — sistema jamais grava o autor.
  Nem a tabela de auditoria registra quem enviou.
- **Auto-contexto operacional**: ao criar um relato, o sistema busca
  automaticamente escala vigente, score FRMS e qualificações do piloto.
- **Elevação por fadiga**: se `efetividade_cognitiva < 70`, a probabilidade
  na Matriz de Risco é elevada 1 nível automaticamente, com justificativa gravada.
- **Promoção de status**: ao criar uma avaliação CRITICO/ALTO, o relato é
  promovido automaticamente para EM_ANALISE.
- **Protocolo sequencial**: usa UPDATE atômico para evitar race conditions.
  Formato: REL-YYYY-NNNN.
- **RELPREV offline-first**: `sgso_relato_capturas` guarda `client_submission_id`,
  telemetria de sync e o espelho do intake "o que/onde/quando" para conciliacao.
- **Just Culture / NSCA 3-17**: `sgso_relato_privacidade` isola campos sensiveis
  cifrados e hash de busca; o relato operacional continua desacoplado do autor.
- **Bowtie dinamico**: `sgso_perigos`, `sgso_bowtie_cenarios`, `sgso_bowtie_nos`
  e `sgso_bowtie_barreiras` permitem refletir barreiras degradadas/inoperantes.
- **Matriz configuravel**: `sgso_matriz_risco_perfis` e `sgso_matriz_risco_celulas`
  desacoplam a politica 5x5 da infraestrutura e sustentam risco inicial/residual.
- **FRAT integrado a despacho**: `sgso_frat_avaliacoes` e `sgso_frat_aprovacoes`
  sustentam bloqueio de despacho e aprovacao obrigatoria para risco alto/critico.

---

## 7. Próximo passo — Frontend

Criar as seguintes páginas em `src/react-app/pages/sgso/`:

```
sgso/
├── SgsoPage.tsx              ← Dashboard do GSO (/sgso)
├── SgsoRelatos.tsx           ← Lista de relatos (/sgso/relatos)
├── SgsoNovoRelato.tsx        ← Formulário de relato (/sgso/relatos/novo)
├── SgsoDetalheRelato.tsx     ← Detalhe + análise (/sgso/relatos/:id)
├── SgsoKpi.tsx               ← Dashboard SPIs (/sgso/kpi)
└── SgsoAuditorias.tsx        ← Auditorias (/sgso/auditorias) [Sprint 4]
```

Adicionar ao `navigation.config.ts`:

```typescript
{
  label: 'Segurança (SGSO)',
  icon: ShieldCheckIcon,
  path: '/sgso',
  children: [
    { label: 'Dashboard', path: '/sgso' },
    { label: 'Relatos', path: '/sgso/relatos' },
    { label: 'Indicadores (KPI)', path: '/sgso/kpi' },
    { label: 'Auditorias', path: '/sgso/auditorias' },
  ]
}
```

E adicionar as rotas ao `App.tsx` com lazyWithRetry().

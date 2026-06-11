# AIRTRUST — Auditoria de Saúde Sistêmica

> **Data:** 2026-06-08 · **Modo:** read-only (nenhum arquivo modificado, nenhum commit/deploy/migration/escrita em dados) · **Modelo:** Opus 4.8
> Convenção: **[CONFIRMADO]** = verificado em código/comando · **[HIPÓTESE]** = inferência que exige confirmação (forma de confirmar indicada).

---

## 1. Sumário executivo

**Estado geral:** o sistema está **operacional e tecnicamente saudável na superfície** — build, type-check, lint e ambas as suítes de teste passam (707 + 1018 testes), frontend e worker estão **alinhados no mesmo commit `acaa3e2`** em produção, e a infraestrutura de tenant/deploy/cache tem guardrails bem desenhados. Porém a auditoria encontrou **uma falha crítica e confirmada de isolamento de tenant** em escritas de funcionários e **exposição de PII real** (dumps de produção) no working tree, que precisam ser tratadas antes de qualquer evolução.

**Principais riscos (ordenados):**

1. **[CONFIRMADO · CRÍTICO] Escrita/exclusão cross-tenant em funcionários.** `PUT /api/funcionarios/:id` e `DELETE /api/funcionarios/:id` localizam e gravam o registro **apenas por `id`, sem `empresa_id`**. Um admin/manager de qualquer empresa pode editar ou soft-deletar funcionário de **outra empresa** (IDs sequenciais e enumeráveis). Viola a regra central do `CLAUDE.md`.
2. **[CONFIRMADO · ALTO/segurança] PII de produção no working tree.** `artifacts/db-backups/*.sql` = 4 dumps completos de produção (~400 MB, com CPF/e-mail) **não cobertos pelo `.gitignore`** — a um `git add -A` de serem commitados. Mais `artifacts/sanitization/*.csv` com dados reais.
3. **[CONFIRMADO · MÉDIO] Padrão "fail-open" de tenant.** Filtro de empresa **condicional** (`if (empresaId)`) na listagem de funcionários e `getEmpresaIdSafe()` que engole erro e retorna `undefined` → risco de listagem sem filtro e de `INSERT` com `empresa_id = NULL` (órfão).
4. **[CONFIRMADO · operacional] Drift local↔produção.** Há 2 arquivos de UI modificados e não commitados (renome de abas para "Treinamentos Planejados", botões só-ícone) que **não estão em produção** (prod = `acaa3e2`).
5. **[A VERIFICAR · dados] Reconciliação Costa do Sol (`empresa_id` 1→6).** Lotes 1–3 moveram 324+8+45+60+76 registros de `empresa_id=1` para `6`. É preciso confirmar por SQL read-only que **não restaram resíduos** operacionais em `empresa_id=1`.

**Módulos mais frágeis:** Funcionários (isolamento de tenant em mutations), Qualificações/Treinamentos Planejados e Simuladores (complexidade alta, muitas correções recentes, sincronizações cruzadas), e a higiene de artefatos/dados (PII no repo, resíduos de lote).

**Sequência de correção recomendada:** Lote A (tenant funcionários + .gitignore PII) → Lote B (fail-open/órfãos) → Lote D (testes-guarda dos itens acima) → confirmação de dados (resíduos `empresa_id=1`) → Lotes C/E/F.

**Classificação final (ver §15): OPERACIONAL COM RISCO ALTO** — funcional, mas com falha de isolamento de tenant confirmada que deve ser sanada antes de evoluir.

---

## 2. Estado do repositório e produção

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `acaa3e23058fdb0aaa1b1de58c541fba73970891` |
| origin/main | `acaa3e23058fdb0aaa1b1de58c541fba73970891` (**sincronizado**) |
| Working tree | 2 arquivos tracked modificados + artefatos/docs/test untracked |
| API version (`/api/version`) | `2026-06-08T13:26:32Z-acaa3e2` · environment `production` |
| API health | `healthy` · DB 346ms · storage 185ms · region BR |
| Frontend `build-version` (airtrust.online) | `2026-06-08T13:25:27Z-acaa3e2` |
| Alinhamento front↔worker | **OK** (mesmo commit `acaa3e2`) |

**Modificações não commitadas (não deployadas):**
- `src/react-app/pages/Qualificacoes.tsx` — rótulos de aba: "Histórico" → "Histórico de Qualificações", "Planejadas" → "Treinamentos Planejados".
- `src/react-app/pages/TreinamentosPlanejadosPage.tsx` — botões de ação só-ícone (Eye/Edit2), `formatDateRange`, preferência por nome de guerra, remoção dos chips de participantes na tabela.

**Observações de deploy/cache:**
- `deploy:pages` usa `--branch=production` explícito (correto, não preview).
- `scripts/preflight-clean-deploy.sh` **bloqueia** deploy se: não estiver em `main`, houver diff staged/unstaged, `HEAD != origin/main`, ou existirem untracked. Guard forte contra deploy sujo.
- Service worker (`public/sw.js`, `airtrust-v9`): API → network-only, navegação/HTML → network-first, assets com hash → cache-first, `skipWaiting` + `clients.claim` + mensagem `AIRTRUST_UPDATE_AVAILABLE`. Risco de servir build antigo é **baixo**.

---

## 3. Achados críticos

| ID | Módulo | Sev | Evidência | Arquivo/Endpoint | Impacto | Risco de dados | Recomendação | Correção | Migration? | Lote de dados? | Patch simples? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **C-01** | Funcionários | CRÍTICO | `SELECT ... WHERE id = ? AND deleted_at IS NULL` (263) e `UPDATE funcionarios SET ... WHERE id = ?` (561) **sem `empresa_id`**; nenhum check de ownership entre eles | `worker-airtrust/src/routes/funcionarios-mutations.ts:252-566` · `PUT /api/funcionarios/:id` | Admin/manager de empresa A edita funcionário da empresa B (nome, CPF, e-mail, cargo, status, endereço) | Alteração cross-tenant de PII | Adicionar `AND empresa_id = ?` no SELECT e no UPDATE (ou `verifyRecordOwnership`) e retornar 404 se não pertencer | API patch | Não | Não | **Sim (API)** |
| **C-02** | Funcionários | CRÍTICO | `SELECT ... WHERE id = ?` (624) + `softDelete(db,'funcionarios',id)` (632) **sem `empresa_id`** | `funcionarios-mutations.ts:614-636` · `DELETE /api/funcionarios/:id` | Admin de empresa A soft-deleta funcionário da empresa B (destrutivo) | Exclusão cross-tenant | Validar ownership por `empresa_id` antes do soft-delete | API patch | Não | Não | **Sim (API)** |
| **C-03** | Segurança/Infra | CRÍTICO (exposição) | 4 dumps `~100 MB` de produção, `git check-ignore` retorna **NOT IGNORED**; 58.878 ocorrências de funcionarios/cpf/email no lote1 | `artifacts/db-backups/*.sql` (não tracked, **não ignorado**) | PII real (CPF/e-mail/LGPD) a um `git add -A` de virar histórico público do repo | Vazamento de PII se commitado/pushado | Adicionar `artifacts/` (ou `artifacts/db-backups/` + `artifacts/sanitization/`) ao `.gitignore`; mover dumps para fora do repo | `.gitignore` patch | Não | Não | **Sim** |

> **Nota sobre C-01/C-02:** a memória do projeto registra "Lote -1 tenant write path fix — 24 write paths fixed". As mutations de `funcionarios` aparentemente **não** entraram nesse lote. As **leituras** (`funcionarios.ts` GET) filtram por `f.empresa_id` (linhas 158-161, 390, 441) e o `dashboard.ts` filtra por `f.empresa_id` em todos os JOINs — o gap está isolado nas **escritas** de `funcionarios-mutations.ts`.

---

## 4. Achados altos

| ID | Módulo | Evidência | Arquivo | Impacto | Recomendação |
|---|---|---|---|---|---|
| **A-01** | Tenant/fail-open | Filtro condicional `if (empresaId) { whereClauses.push('f.empresa_id = ?') }` — se `empresaId` for `undefined`, **lista todas as empresas** | `funcionarios.ts:158-161` (e padrão repetido em 360/413/441) | Listagem sem isolamento caso o contexto de tenant falhe (fail-open em vez de fail-closed) | Tornar `empresa_id` obrigatório; abortar 4xx se ausente em vez de omitir o filtro |
| **A-02** | Tenant/órfãos | `getEmpresaIdSafe` engole exceção e retorna `undefined`; INSERT usa `insertEmpresaId = getEmpresaIdSafe(c) ?? null` | `funcionarios-mutations.ts:36-42, 136, 195` | Criação de funcionário com `empresa_id = NULL` → registro órfão invisível a qualquer tenant | Não permitir INSERT sem `empresa_id`; falhar explicitamente |
| **A-03** | Dados/Costa do Sol | Lotes 1–3 moveram dados `empresa_id=1→6` (CSVs e rollback explícito presentes) | `artifacts/sanitization/*` | Resíduos operacionais ainda em `empresa_id=1` causariam dados "sumidos" do tenant 6 | Rodar SQL read-only de resíduo (ver §7) antes de declarar reconciliação concluída |

---

## 5. Achados médios

| ID | Módulo | Evidência | Arquivo | Observação |
|---|---|---|---|---|
| **M-01** | Simuladores | `SELECT id, nome, matricula FROM funcionarios WHERE id=? AND deleted_at IS NULL` **sem `empresa_id`** ao enriquecer participantes | `simuladores-sessoes.ts:1202` | **[HIPÓTESE]** Pode revelar nome/matrícula de funcionário de outro tenant se um `participante.funcionario_id` externo for injetado. Confirmar se o `funcionario_id` é sempre derivado de dados já filtrados por empresa. |
| **M-02** | Licenças | `SELECT id FROM funcionarios WHERE id = ? AND deleted_at IS NULL` **sem `empresa_id`** como check de FK | `licencas.ts:158` | **[HIPÓTESE]** Permitiria anexar licença a funcionário de outro tenant (gerando registro inconsistente). Confirmar o INSERT subsequente. |
| **M-03** | Drift/deploy | 2 arquivos de UI modificados, não commitados nem deployados | working tree | Decidir: commitar+deployar ou descartar. Enquanto isso, prod mostra rótulos/botões antigos. |
| **M-04** | Treinamentos | `DELETE FROM treinamentos_participantes WHERE treinamento_id = ?` e `DELETE FROM treinamentos_presencas ... WHERE treinamento_dia_id IN (...)` sem `empresa_id` (em rollback de criação) | `treinamentos-planejados.ts:2003-2015` | Defense-in-depth: escopado por `treinamento_id` recém-criado no próprio tenant. Baixo risco prático, mas inconsistente com o padrão. |

---

## 6. Achados baixos / polish

| ID | Evidência | Arquivo | Observação |
|---|---|---|---|
| **B-01** | `SELECT * FROM simulador_agendamentos WHERE id=? AND deleted_at IS NULL` sem `empresa_id` | `simuladores-sessoes-update.ts:622` | **Gated a montante**: o handler `PUT /sessoes/:id` já validou ownership por `empresa_id` (linha 54-59, 404 se não pertence). Apenas defense-in-depth. |
| **B-02** | Escopo de child tables de escala por `escala_id` (não `empresa_id`) | `escalas-situacoes.ts:456`, `escalas-crud.ts:456`, `escalas-eventos.ts:353` | Aceitável **se** o `escala_id` foi validado contra a empresa no handler. Confirmar guard do pai. |
| **B-03** | `CACHE_VERSION = 'airtrust-v9'` bumpado manualmente | `public/sw.js:17` | Dívida de manutenção: esquecer de bumpar não quebra (index.html é network-first), mas o versionamento manual é frágil. |
| **B-04** | Bundles grandes: `pdf` (387/393 KB), `excel` (429 KB), `charts` (432 KB), `index` (435 KB) | `dist/client/assets/*` | Já há code-splitting; avaliar lazy-load adicional dos mais pesados. |
| **B-05** | `docs/`, `artifacts/`, `src/__tests__/auth-tenant-cache.test.ts` untracked acumulando | working tree | Higiene: decidir o que versionar. |

---

## 7. Auditoria de tenant e dados

**Riscos confirmados:**
- **C-01 / C-02** (escrita e exclusão cross-tenant de funcionários) — ver §3.
- **A-01 / A-02** (fail-open e órfão por `empresa_id` NULL) — ver §4.
- Middleware de tenant (`tenant.ts`) em si é robusto: extrai `empresa_id` do JWT, valida vínculo em `usuarios_empresas`, monta `tenantContext`. **Porém** há um **fallback de "platform admin"** (`userId === 1` legado, ou tenant `codigo='airtrust'`) que recebe `role: 'admin'` na primeira empresa ativa (`tenant.ts:270-353`). Isso é por design para a conta de plataforma, mas é poderoso — qualquer regressão que trate `empresa_id=1` como "airtrust" amplia o raio de acesso. `empresa_id=1` é, muito provavelmente, o tenant de plataforma `airtrust` — **[HIPÓTESE]** confirmar.

**Hipóteses (confirmar por SQL read-only):**
- M-01 / M-02 (leitura cross-tenant de funcionário em simuladores/licenças).
- Resíduos de Costa do Sol em `empresa_id=1`.

**Queries read-only recomendadas** (executar via `wrangler d1 execute airtrust-db --env production --remote --command "..."` — **somente SELECT**):

```sql
-- 0) Identidade dos tenants envolvidos
SELECT id, codigo, nome, ativo FROM empresas WHERE id IN (1,6) OR codigo='airtrust';

-- 1) Registros órfãos (empresa_id NULL) por tabela-chave
SELECT 'funcionarios' t, COUNT(*) n FROM funcionarios WHERE empresa_id IS NULL AND deleted_at IS NULL
UNION ALL SELECT 'qualificacoes_historico', COUNT(*) FROM qualificacoes_historico WHERE empresa_id IS NULL AND deleted_at IS NULL
UNION ALL SELECT 'simulador_agendamentos', COUNT(*) FROM simulador_agendamentos WHERE empresa_id IS NULL AND deleted_at IS NULL
UNION ALL SELECT 'documentos', COUNT(*) FROM documentos WHERE empresa_id IS NULL AND deleted_at IS NULL
UNION ALL SELECT 'pasta_virtual', COUNT(*) FROM pasta_virtual WHERE empresa_id IS NULL AND deleted_at IS NULL
UNION ALL SELECT 'treinamentos_planejados', COUNT(*) FROM treinamentos_planejados WHERE empresa_id IS NULL AND deleted_at IS NULL
UNION ALL SELECT 'frms_jornada', COUNT(*) FROM frms_jornada WHERE empresa_id IS NULL;

-- 2) Resíduo Costa do Sol em empresa_id=1: funcionários do tenant 1 que aparecem
--    como participantes/donos de registros que deveriam estar em 6
SELECT COUNT(*) AS hist_em_1 FROM qualificacoes_historico WHERE empresa_id = 1 AND deleted_at IS NULL;
SELECT COUNT(*) AS func_em_1 FROM funcionarios WHERE empresa_id = 1 AND deleted_at IS NULL;
SELECT COUNT(*) AS sim_em_1 FROM simulador_agendamentos WHERE empresa_id = 1 AND deleted_at IS NULL;
SELECT COUNT(*) AS docs_em_1 FROM documentos WHERE empresa_id = 1 AND deleted_at IS NULL;
SELECT COUNT(*) AS frms_em_1 FROM frms_jornada WHERE empresa_id = 1;

-- 3) Cross-tenant join leak: histórico cuja empresa difere da empresa do funcionário
SELECT qh.empresa_id AS hist_emp, f.empresa_id AS func_emp, COUNT(*) n
FROM qualificacoes_historico qh
JOIN funcionarios f ON f.id = qh.funcionario_id
WHERE qh.deleted_at IS NULL AND f.deleted_at IS NULL AND qh.empresa_id <> f.empresa_id
GROUP BY qh.empresa_id, f.empresa_id;

-- 4) Mesmo cross-check para simulador_agendamentos x participantes x funcionários
SELECT sa.empresa_id sa_emp, f.empresa_id f_emp, COUNT(*) n
FROM sessoes_participantes sp
JOIN simulador_agendamentos sa ON sa.id = sp.sessao_id
JOIN funcionarios f ON f.id = sp.funcionario_id
WHERE sp.deleted_at IS NULL AND sa.deleted_at IS NULL AND f.deleted_at IS NULL
  AND sa.empresa_id <> f.empresa_id
GROUP BY sa.empresa_id, f.empresa_id;

-- 5) Duplicidades de CPF/matrícula (checks de duplicata na API são GLOBAIS, não por empresa)
SELECT cpf, COUNT(*) n FROM funcionarios WHERE deleted_at IS NULL AND cpf IS NOT NULL GROUP BY cpf HAVING n > 1;

-- 6) Status inválidos em qualificações planejadas/histórico
SELECT status, COUNT(*) n FROM qualificacoes_historico WHERE deleted_at IS NULL GROUP BY status ORDER BY n DESC;
```

**Dados suspeitos / pontos que exigem Lote de Saneamento:** qualquer resultado > 0 nas queries (1)–(4) indica órfãos, resíduo `empresa_id=1` ou vazamento de join e demanda lote dedicado com backup + dry-run.

---

## 8. Auditoria funcional por módulo

> Foco em código (read-only). Itens que dependem de inspeção visual em produção estão marcados **[HIPÓTESE]**.

### A) Qualificações & Certificações / Treinamentos Planejados
- Rotas: `qualificacoes*.ts`, `treinamentos-planejados.ts` (**3062 linhas** — arquivo muito grande, 58 refs a `empresa_id`, 109 a tenant/getEmpresaId — filtragem de tenant **presente e densa**).
- Mutations principais (`DELETE/UPDATE treinamentos_planejados`) corretamente filtradas por `empresa_id` (`:2021, :2379, :2625, :2693, :3015`).
- Rollback de criação tem deletes escopados por `treinamento_id` sem `empresa_id` (M-04) — baixo risco.
- UI: drift não deployado (renome de abas, botões só-ícone, range de datas) — M-03.
- `no-cache` aplicado a `/api/qualificacoes/historico*` e `/api/matriz-treinamento*` (`index.ts:168-169, 475-476`) — bom para evitar dado velho.
- **[HIPÓTESE]** Integração pasta 360 / `certificacao_id` (`qualificacoes-certificados-helpers.ts:299`): helper interno escopado por `funcionario_id`; confirmar que `certificadoArquivoId` nunca vem cru do cliente.

### B) Simuladores & Voo
- `simuladores-sessoes*.ts` filtram tenant nos handlers (PUT/DELETE validam `empresa_id`, 404 se não pertence).
- B-01 (SELECT interno sem `empresa_id`) — gated a montante.
- M-01 (enriquecimento de participante sem `empresa_id`) — **[HIPÓTESE]** a confirmar.
- Geração de qualificações planejadas a partir de sessão: `criarQualificacoesPlanejadas(...)` recebe `empresaId` explícito (`simuladores-sessoes-update.ts:524-531`) — correto.
- Timezone/`formatDate` em horário local foi alvo de correção recente (commit `acaa3e2`) — sem nova regressão detectada em código.

### C) Escala
- Muitos arquivos (`escalas-*.ts`); child tables (`escala_alocacoes`, `escala_eventos`) escopadas por `escala_id` (B-02) — depende de validação do pai por `empresa_id`.
- `escala-mensal-integrada.ts` usa `getTenantContext` (4 refs) e delega — sem SQL direto.
- Eventos sintéticos vs reais e clique em CURSO/SIM foram tema das correções recentes (`53bbb68`, `acaa3e2`); ModalDetalhesEvento integra eventos sintéticos. Sem regressão óbvia em código, mas **[HIPÓTESE]** validar visualmente em produção.

### D) Funcionários
- **Falha crítica C-01/C-02** (escrita/exclusão cross-tenant) e A-01/A-02 (fail-open / órfão).
- Checks de duplicata de CPF/matrícula são **globais** (`:282, :294, :92, :102`), não por empresa — pode bloquear cadastro legítimo entre tenants ou mascarar colisão. Médio.
- Nome completo vs nome de guerra: UI agora prefere `funcionario_guerra` (diff não deployado).

### E) LMS
- Rotas `lms-*.ts` numerosas; assets públicos whitelistados (`index.ts:256-261`). Não auditado em profundidade nesta passada — **lacuna desta auditoria** (recomendado follow-up focado em matrícula/status e isolamento de tenant).

### F) FRMS
- `frms-*.ts`; `frms_jornada` foi alvo do Lote 3 (76 registros `empresa_id` NULL→6). `frms-fira.ts:700-712` faz `UPDATE frms_jornada` — confirmar `empresa_id` na cláusula (linha de continuação não capturada pelo grep).
- `no-cache` aplicado a `/api/frms*` (`index.ts:173-174`).

### G) SGSO
- `sgso*.ts` usam `empresaId` nas mutations (`sgso.ts:985`, `sgso-next-gen.ts:674`, `sgso-auditorias-ncs.ts:575` — todos com `empresaId` no bind). Aparência de isolamento correto. Não auditado a fundo.

### H) Dashboard / Painel
- `dashboard.ts` (466 linhas) filtra por `f.empresa_id` em todos os JOINs auditados (`:116, :149, :209-272`). **Tenant-correto.** Risco de contagem cross-tenant: **baixo**.

---

## 9. Auditoria UI/UX

- **[CONFIRMADO]** Inconsistência de padrão de botão em Treinamentos Planejados: a versão deployada usa `<Button>` com texto ("Detalhes"/"Editar"); o working tree migra para botões só-ícone (Eye/Edit2). Enquanto o diff não for deployado, há **divergência entre o que está no código e o que o usuário vê**. (M-03)
- **[CONFIRMADO]** Remoção dos chips de participantes na linha da tabela (diff) — reduz ruído visual; verificar se a informação ainda está acessível no detalhe.
- **[CONFIRMADO]** Renome de abas ("Histórico de Qualificações", "Treinamentos Planejados") melhora clareza — mas só após deploy.
- **[HIPÓTESE]** Ações destrutivas (excluir turma/sessão/funcionário) — confirmar visualmente que há diálogo de confirmação; no backend o soft-delete existe, mas a confirmação é responsabilidade da UI.
- **Severidade:** nenhum achado UI crítico em código; os itens são **médios/polish** e dependentes de deploy.

---

## 10. Auditoria de testes

**Resultados (todos PASS):**

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0) |
| `npm run lint` (api-base + tracked-secrets + auth-boundaries) | **PASS** (exit 0) |
| `npm run test:run` (frontend) | **PASS** — 71 files, **707 testes**, 3 skipped |
| `npm run test:worker` | **PASS** — 150 files, **1018 testes** |
| `npm run build` | **PASS** (exit 0, 16.3s) |

**Lacunas de cobertura / testes recomendados:**
- **Nenhum teste cobre o isolamento de tenant em `PUT/DELETE /api/funcionarios/:id`** (C-01/C-02) — é exatamente o tipo de regressão que um teste de "admin do tenant A não pode editar funcionário do tenant B" pegaria. **Recomendado como guardrail prioritário.**
- Existe `src/__tests__/auth-tenant-cache.test.ts` **untracked** (não versionado) — decidir incluir.
- Testes baseados em string/label (ex.: abas renomeadas) podem ser frágeis frente ao diff de UI não deployado.
- Recomendado smoke read-only: script que, para cada tabela-chave, conta órfãos (`empresa_id IS NULL`) e cross-tenant joins (queries da §7) e falha se > 0.

---

## 11. Auditoria de performance

- **[CONFIRMADO]** Arquivos de rota muito grandes: `treinamentos-planejados.ts` (3062), `simuladores-sessoes.ts` (1636), `simuladores-sessoes-update.ts` (1101) — complexidade alta, risco de manutenção e de queries repetidas.
- **[HIPÓTESE]** Loops com query por item (N+1): `simuladores-sessoes-update.ts` faz `UPDATE`/`INSERT` por participante em loop (`:657-689`) — aceitável para N pequeno; confirmar limites.
- **[CONFIRMADO]** Bundles grandes (B-04): pdf/excel/charts/index ~400 KB cada (gzip 115–142 KB). Já há split; avaliar lazy-load.
- **[HIPÓTESE]** `hasUsuariosEmpresasTable(db)` é chamado em **toda requisição** no tenant middleware (`tenant.ts:122, 219`). Se não houver cache, é um PRAGMA/SELECT de schema por request. Confirmar se `db-schema.ts` memoiza — se não, é overhead por request.
- Dashboard executa várias queries agregadas independentes (não N+1), aceitável.

---

## 12. Auditoria de segurança

- **Segredos:** `guard:tracked-secrets` passa; apenas `*.example` e relatórios de rotação versionados. `.dev.vars`/`.env*` cobertos pelo `.gitignore`. **OK.**
- **PII no repo (C-03):** `artifacts/db-backups/*.sql` (~400 MB, CPF/e-mail) e `artifacts/sanitization/*.csv` **não ignorados** — risco real de commit acidental. **Corrigir `.gitignore`.**
- **Endpoints sem auth:** whitelist de rotas públicas em `index.ts:251-268` é explícita e revisável (health, version, assets LMS/SCORM, validação de certificado, webhooks, manutenção FRMS/sigvoos). Webhooks têm rate-limit (`index.ts:380-381`). **Atenção:** `/api/integracoes/sigvoos/maintenance/sincronizar-frms`, `/api/frms/maintenance/reprocessar-lote` e `.../reprocessar-faixa` são **públicas** (`index.ts:266-268`) — **[HIPÓTESE]** confirmar que exigem secret próprio no handler; senão são endpoints de manutenção abusáveis sem auth.
- **RBAC:** hierarquia `admin>manager>instructor>editor>student>viewer`; `requireRole` aplicado em admin/migrations (`index.ts:837, 845`) e em funcionários (`requireRole('admin','manager')`). **Falha:** RBAC presente mas **sem escopo de tenant** nas mutations de funcionários (C-01/C-02) — "admin" de qualquer empresa basta.
- **Logs:** `[CLIENT_TELEMETRY]` loga `userId/empresaId/message` (truncado 1500) — sem PII evidente. `[TENANT]` loga `empresa/user/role` — aceitável.
- **Backups/arquivos temporários:** ver C-03. Também `sql/maintenance/*` e diversos `scripts/*cleanup*.sql` versionados — revisar se algum embute dados.

---

## 13. Plano de saneamento em lotes

### Lote A — Tenant/dados crítico (BLOQUEANTE)
- **Escopo:** corrigir C-01, C-02 (ownership por `empresa_id` em PUT/DELETE funcionários) e C-03 (`.gitignore` para `artifacts/` + remover dumps do working tree).
- **Arquivos prováveis:** `worker-airtrust/src/routes/funcionarios-mutations.ts`, `.gitignore`.
- **Risco:** baixo (adiciona filtro restritivo); o `.gitignore` não afeta runtime.
- **Validações:** novo teste worker "tenant A não edita/deleta funcionário de B"; `git check-ignore artifacts/...` deve passar a ignorar.
- **Critério de aceite:** PUT/DELETE retornam 404 para id de outra empresa; dumps não rastreáveis por `git add`.
- **Deploy:** sim (worker). **Migration:** não. **Backup/dry-run:** não (só código).

### Lote B — Fail-open / órfãos
- **Escopo:** A-01 (filtro obrigatório de `empresa_id`), A-02 (proibir INSERT com `empresa_id` NULL), M-01/M-02 (confirmar e fechar leituras cross-tenant).
- **Arquivos:** `funcionarios.ts`, `funcionarios-mutations.ts`, `simuladores-sessoes.ts`, `licencas.ts`, `tenant.ts` (helper).
- **Risco:** médio (mudança de fail-open→fail-closed pode expor dependências ocultas no contexto de plataforma-admin).
- **Validações:** testes de listagem sem contexto; teste de INSERT sem empresa → erro.
- **Deploy:** sim. **Migration:** não. **Backup/dry-run:** não.

### Lote C — Confirmação e saneamento de dados (Costa do Sol / órfãos)
- **Escopo:** rodar queries read-only da §7; se houver resíduo `empresa_id=1`, órfãos ou cross-tenant joins, planejar lote de UPDATE.
- **Arquivos:** novo `sql/maintenance/*` + snapshot CSV.
- **Risco:** alto (escreve em dados reais) — **somente** após confirmação.
- **Validações:** dry-run + diff de contagem.
- **Deploy:** não. **Migration:** não (DML de saneamento). **Backup/dry-run:** **SIM, obrigatório.**

### Lote D — Testes e guardrails
- **Escopo:** testes de isolamento de tenant para funcionários/simuladores/licenças; smoke read-only de integridade (órfãos/cross-tenant); versionar `auth-tenant-cache.test.ts` se válido.
- **Risco:** baixo.
- **Deploy:** não (CI). **Migration:** não.

### Lote E — UI consistente + deploy do drift
- **Escopo:** decidir sobre os 2 arquivos não commitados (M-03); padronizar botões só-ícone; confirmar confirmação em ações destrutivas.
- **Risco:** baixo.
- **Deploy:** sim (Pages + Worker via `deploy`).

### Lote F — Limpeza técnica / performance
- **Escopo:** memoizar `hasUsuariosEmpresasTable` (se não houver cache); avaliar split dos arquivos de rota gigantes; lazy-load de bundles pesados; bump automático de `CACHE_VERSION`.
- **Risco:** médio (refactor).
- **Deploy:** sim (worker/frontend), após testes.

---

## 14. Lista "não mexer sem autorização"

1. **Dados de produção** — nenhum INSERT/UPDATE/DELETE em `airtrust-db` (`--env production --remote`) sem autorização explícita + backup + dry-run.
2. **Migrations** (`worker-airtrust/migrations/`) — não aplicar automaticamente (atual ~0391).
3. **Reconciliação `empresa_id` 1↔6** — qualquer movimentação de tenant exige lote dedicado (Lote C) com snapshot.
4. **`tenant.ts` platform-admin fallback** (`:270-353`) — alterar com cuidado; afeta acesso da conta de plataforma.
5. **Whitelist de rotas públicas** (`index.ts:251-268`) — não ampliar sem revisão de auth.
6. **Scripts de deploy** (`deploy:pages --branch=production`, `preflight-clean-deploy.sh`) — não relaxar os guards.
7. **Dumps `artifacts/db-backups/*.sql`** — não commitar; mover para fora do repo (não apagar sem confirmar que há cópia segura).

---

## 15. Conclusão

**Classificação: OPERACIONAL COM RISCO ALTO.**

O AirTrust está **funcional, bem testado (707+1018 testes verdes) e com infraestrutura de deploy/cache/tenant em grande parte sólida** — frontend e worker alinhados, dashboard e leituras de funcionários corretamente isoladas por tenant, service worker bem desenhado, guards de deploy fortes. **Porém**, dois achados confirmados elevam o risco: (1) **escrita e exclusão cross-tenant de funcionários** (`PUT`/`DELETE /api/funcionarios/:id` sem `empresa_id`), que viola a regra central de multi-tenancy e é explorável por qualquer admin/manager autenticado; e (2) **dumps de produção com PII reais não cobertos pelo `.gitignore`**, a um `git add` de exposição.

**Recomendação:** executar **Lote A antes de qualquer nova evolução funcional**, seguido de Lote B e dos testes-guarda (Lote D), e confirmar por SQL read-only (§7) que a reconciliação Costa do Sol não deixou resíduos em `empresa_id=1`. Resolvidos A/B/D e confirmada a integridade de dados, o sistema migra para **FUNCIONAL, MAS COM DÍVIDA TÉCNICA RELEVANTE** e fica apto a evoluir.

---

*Relatório gerado em modo read-only. Nenhum arquivo do repositório foi modificado, nenhum commit/deploy/migration executado, nenhum dado real alterado. Os comandos `tsc`, `lint`, `test:run`, `test:worker` e `build` foram executados localmente (sem efeito em produção); `build` apenas regravou `dist/` (gitignored).*

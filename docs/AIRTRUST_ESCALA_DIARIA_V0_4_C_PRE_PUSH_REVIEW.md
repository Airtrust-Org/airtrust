# AirTrust — Escala Diária: Revisão Pré-Push v0.4-C

Data: 2026-05-21
Fase: AIRTRUST v0.4-C — Consolidação pré-push da Escala Diária
Auditor: Claude Sonnet 4.6 (revisão automatizada)

---

## 1. Estado Git

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `268654e16411de4b62680b5d76356cc5974fdfc2` |
| origin/main | `95699e0b4de02bfda9ff1169e08e57c47dc4c36e` |
| Ahead | **7 commits** (esperado: 6 escala + 1 fix FRMS; ver nota) |
| Behind | 0 |
| Staged | nenhum |
| Tracked modificados | nenhum |
| Untracked | 7 arquivos `docs/*.md` (relatórios de auditoria anteriores) |

> **Nota sobre o 7.º commit:** O commit `ec9e208` (`fix(frms): inject JWT token in useFadigaCheckin fetchJson`) é uma correção do hook de check-in de fadiga (fase v0.3-C/FRMS), não da Escala Diária. Pertence funcionalmente à série de FRMS, mas foi desenvolvido nesta branch. Não representa risco; o arquivo alterado (`useFadigaCheckin.ts`) é isolado e a correção é de 4 linhas (injeção de JWT).

---

## 2. Commits Locais Revisados

| Hash | Mensagem | Arquivos | Avaliação |
|---|---|---|---|
| `ec9e208` | fix(frms): inject JWT token in useFadigaCheckin fetchJson | `useFadigaCheckin.ts` (+4/-1) | OK — fix isolado FRMS; sem SIGVOOS/cron |
| `6158165` | feat(escalas): harmonize evd as daily flight roster | `App.tsx`, `navigation.config.ts`, `EvdPage.tsx`, doc | OK — harmonização de nomenclatura EVD→Diária |
| `2b79219` | feat(escalas): add daily roster frms warnings and hard validations | `EvdPage.tsx`, `escalas-evd.ts`, doc | OK — alertas FRMS resumidos; sem calc FRMS |
| `3de4e11` | feat(escalas): add structured daily roster justifications | `EvdPage.tsx`, `escalas-evd.ts`, migration `0370`, doc | OK — migration apenas DDL, sem dados |
| `7194742` | feat(escalas): validate daily roster qualifications and availability | `EvdPage.tsx`, `escalas-evd.ts`, doc | OK — validação aeronave/habilitação/disponibilidade |
| `4ae9e15` | feat(escalas): add versioned daily roster publication | `escalas-evd.ts`, migration `0371`, doc | OK — publicação versionada; migration apenas DDL |
| `268654e` | feat(escalas): add daily roster publication UI and export | `EvdPage.tsx`, doc | OK — UI publicação/histórico/print |

**Verificações cruzadas:**
- Nenhum arquivo de SIGVOOS ou cron foi alterado.
- Nenhuma alteração em cálculo FRMS (fadiga, jornada, limites).
- Nenhuma alteração em config de deploy (`wrangler.toml`, CI, secrets).
- Migrations presentes: apenas `0370` e `0371` — confirmado.

---

## 3. Migrations Locais Revisadas

### 0370 — `escala_voo_diaria_justificativas`

- Sintaxe SQLite/D1: válida (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`)
- Sem `DROP`, `DELETE`, `UPDATE` destrutivo
- Não altera tabelas existentes
- Cria apenas tabela nova + 3 índices parciais (`WHERE deleted_at IS NULL`)
- `id` gerado via `lower(hex(randomblob(16)))` — compatível com D1
- Soft delete via `deleted_at TEXT`
- Sem dados reais embutidos

**Status: APROVADA**

### 0371 — `escala_voo_diaria_publicacoes`

- Sintaxe SQLite/D1: válida
- Sem `DROP`, `DELETE`, `UPDATE` destrutivo
- Não altera tabelas existentes
- Cria tabela nova + 3 índices + constraint `UNIQUE (empresa_id, data_ref, revisao)`
- `id TEXT PRIMARY KEY` (UUID gerado no worker)
- `payload_json TEXT NOT NULL` — snapshot serializado
- `checksum TEXT NOT NULL` — SHA-256 determinístico via `crypto.subtle`
- Soft delete via `deleted_at TEXT`
- Sem dados reais embutidos

**Status: APROVADA**

---

## 4. Auditoria de Endpoints — `escalas-evd.ts`

| Endpoint | Presente | Observação |
|---|---|---|
| `GET /api/evd?data=` | Sim | Funcionamento inalterado |
| `GET /api/evd/:id` | Sim | Funcionamento inalterado |
| `GET /api/evd/semana?inicio=` | Sim | Funcionamento inalterado |
| `GET /api/evd/:id/justificativas` | Sim | Novo; usa tabela `0370` |
| `POST /api/evd/:id/justificativas` | Sim | Novo; `requireRole('admin','manager')` |
| `POST /api/evd/:id/publicar` | Sim | Mantida; agora com validações operacionais |
| `GET /api/evd/publicacoes?data=` | Sim | Novo; usa tabela `0371` |
| `GET /api/evd/publicacoes/:id` | Sim | Novo; retorna `payload_json` desserializado |
| `POST /api/evd/publicacoes` | Sim | Novo; `requireRole('admin','manager')` |
| `POST /api/evd` | Sim | Funcionamento inalterado |
| `PUT /api/evd/:id` | Sim | Funcionamento inalterado |
| `DELETE /api/evd/:id` | Sim | Soft delete inalterado |

**Snapshot de publicação:**
- Não inclui dados sensíveis FRMS (scores, KSS, biométricos)
- Campo `frms_resumo.included = false` explícito no payload
- Checksum SHA-256 via `crypto.subtle.digest` — determinístico
- Todos os endpoints novos com isolamento `empresa_id` via `getEmpresaId(c)`

**Build-time safety:** Nenhum endpoint depende das migrations `0370`/`0371` durante build. Worker compila sem acesso ao banco D1; as queries só executam em runtime. Build OK.

---

## 5. Auditoria de Frontend

| Verificação | Status |
|---|---|
| Rota `/escalas/diaria` criada | OK (`App.tsx:676`) |
| Rota `/escalas/evd` mantida (compatibilidade) | OK (`App.tsx:683`) |
| Menu aponta para `Escala Diária de Voo` | OK (`navigation.config.ts:99-103`, path `/escalas/diaria`) |
| `FrmsTripulanteSignal` sem scores/KSS/biométricos | OK — apenas `status`, `statusLabel`, `requiresReview`, `hasAlert` |
| Print/export não expõe dados sensíveis FRMS | OK — seção HTML explicita: *"Dados sensíveis do check-in FRMS não são incluídos"* |
| Histórico de publicações lida com tabela ausente | OK — `publicacoesRaw?.data \|\| []` com state vazio renderizado graciosamente |
| UI de publicação não quebra fluxo antigo | OK — fluxo por voo (`/publicar`) mantido em paralelo ao fluxo por data |

---

## 6. Validações Executadas

| Validação | Resultado |
|---|---|
| `npm run build` | ✅ Passou — `built in 5.95s`, sem erros |
| `npx tsc --noEmit` (frontend) | ✅ Passou — sem output de erro |
| `npx tsc -p worker-airtrust/tsconfig.json --noEmit` | ✅ Passou — sem output de erro |
| Migration remota aplicada | ❌ NÃO aplicada (proposital — fora do escopo desta fase) |
| Deploy | ❌ NÃO realizado (proposital) |

---

## 7. Riscos Remanescentes

| Risco | Severidade | Mitigação |
|---|---|---|
| Migrations `0370`/`0371` ainda não aplicadas no D1 remoto | Alta (funcional, não de segurança) | Endpoints novos retornam erro D1 até migration; frontend lida com array vazio no histórico; endpoints antigos não são afetados |
| `ec9e208` (FRMS JWT fix) é um commit "orphan" da fase v0.3-C nesta branch | Baixa | Correção válida e isolada; sem side effects; será enviado junto neste push |
| `calcRepouso` usa `frms_jornada` — tabela existente | Nenhum | Tabela existe em produção desde v0.3; consulta é `SELECT` read-only |
| Publicação em lote (`POST /api/evd/publicacoes`) faz `UPDATE escala_voo_diaria SET status='PUBLICADA'` para todos os voos do dia | Médio (operacional) | Comportamento intencional e documentado; reversível manualmente até implementação de unpublish |
| Snapshot não inclui FRMS — decisão arquitetural explícita | Nenhum | Documentado no campo `frms_resumo.included=false` do payload |

---

## 8. Checklist de Segurança

- [x] Nenhuma query SQL dinâmica sem binding parametrizado
- [x] Todos os endpoints novos isolados por `empresa_id`
- [x] RBAC aplicado: endpoints de escrita exigem `requireRole('admin','manager')`
- [x] Dados sensíveis FRMS ausentes do snapshot e do print
- [x] Sem hard-coded credentials, tokens ou dados de produção
- [x] Migrations são DDL puro — sem dados reais
- [x] `stableStringify` determinístico para checksum
- [x] SHA-256 via Web Crypto API nativa — sem dependências externas
- [x] Soft delete em ambas as tabelas novas
- [x] Frontend: `FrmsTripulanteSignal` não expõe scores/KSS/biométricos

---

## 9. Recomendação

**PUSH LIBERADO** — condicionado às etapas pós-push abaixo.

Todos os checks passaram. O código está correto, seguro, buildado e tipado. Os 7 commits são coerentes e não afetam SIGVOOS, cron, cálculo FRMS nem configuração de deploy.

**Observação explícita:** As migrations `0370` e `0371` **não foram aplicadas remotamente**. Os novos endpoints (`/api/evd/publicacoes`, `/api/evd/:id/justificativas`) retornarão erro D1 até que as migrations sejam aplicadas em ambiente controlado (passo separado, após push).

---

## 10. Plano Pós-Push

### Fase 1 — Push (autorizado após revisão humana)
```bash
git push origin main
```

### Fase 2 — Aplicar Migrations (ambiente controlado, separado do push)
Aplicar via Wrangler em staging primeiro, depois produção:
```bash
# Staging
npx wrangler d1 migrations apply airtrust-d1 --env staging --remote

# Produção (após validação em staging)
npx wrangler d1 migrations apply airtrust-d1 --env production --remote
```
Migrations a aplicar: `0370_create_escala_voo_diaria_justificativas.sql`, `0371_create_escala_voo_diaria_publicacoes.sql`

### Fase 3 — Deploy Controlado
```bash
npx wrangler deploy --env production
```
Fazer deploy incremental; manter versão anterior disponível para rollback.

### Fase 4 — Teste Funcional
- [ ] Criar voo diário via UI
- [ ] Adicionar justificativa estruturada
- [ ] Publicar escala diária por data
- [ ] Verificar histórico de revisões
- [ ] Testar print/export
- [ ] Confirmar que FRMS alerts aparecem como status resumido (não scores)
- [ ] Confirmar que endpoints antigos (`/api/evd`, `/api/evd/:id/publicar`) continuam funcionando

---

*Relatório gerado automaticamente em 2026-05-21. Nenhum deploy, push, migration remota ou alteração de produção foi realizado durante esta auditoria.*

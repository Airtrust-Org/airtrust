# AirTrust Layout/UX/Operational Audit — N-01…N-11 Closure Reconciliation

- Date: 2026-09-07
- Branch reconciled against: `main`
- `main` SHA at reconciliation: `f8ede1e73e41542b9d087181ffc35a3714849f4b`
- Production / staging changed by this reconciliation: **no**
- Code changes in this reconciliation: **none** (all executable frontend residuals were already integrated on `main` with focused regression tests; this document is the administrative closure record)

## Method

Each finding of the Layout/UX/Operational audit (Controle de Voos + MRO + related
modules) was reconciled by delta against current `main`: source code, merged
PRs/commits, issues, focused tests, workflows and existing operational evidence.
"PR merged" alone was not accepted as proof of a visual fix — the reconciliation
checked the actual component state and the regression test that guards it.

Precedence: the 2026-09-06 handoff prevails over the 2026-09-02 baseline where
concrete evidence exists. MRO technical front is closed except a real regression;
N-03 is treated (final regression only); N-05/#378, N-11/#380, #122 and #201 are
closed. A baseline label of PARCIAL / NÃO CORRIGIDO alone did not reopen a closed
front.

## Status legend

`CORRIGIDO` · `PARCIAL` · `NÃO CORRIGIDO` · `REGRESSÃO` · `NÃO VERIFICADO`
(+ `BLOQUEADO POR VALIDAÇÃO OPERACIONAL` for items whose only residual is an
authenticated staging/production run).

## Matrix — N-01…N-11

| ID | Area | Baseline (02/09) | Estado em `main` | Evidência (PR / SHA / issue) | Teste | Correção nesta execução | Validação visual/operacional | Blocker residual |
|---|---|---|---|---|---|---|---|---|
| **N-01** (MRO-05) | MRO — tabela de OS com sistemas cromáticos concorrentes | NÃO CORRIGIDO | **CORRIGIDO** | PR #266 (`104ddb40`) + rebase `cd192605`: `MroStatusBadge` passa a ter um único mapa `STATUS_STYLES`; classificações de tipo (`preventiva…alteracao`) usam `NEUTRAL_CLASSIFICATION_STYLE`, cor semântica reservada a estado/prioridade. `MroOrdensServico.tsx` renderiza tipo/status/prioridade só via `MroStatusBadge`. | `src/react-app/pages/__tests__/layout-audit-regressions.test.ts` → "uses neutral styling for MRO classification/type badges" (PASS) | — | Renderização real de `/mro/os` em desktop/mobile pendente de QA autenticado | `staging-mro-mobile-qa.yml` (workflow_dispatch) não executado |
| **N-02** (MRO-04) | MRO — banner redundante + validação mobile incompleta | PARCIAL | **PARCIAL** — banner: CORRIGIDO; mobile: pendente de validação | Banner: PR #266 + `cd192605` → `ModuleGovernanceBanner` compacto (`const chips = [maturityLevel, evidenceLevel]`, sem "Protótipo"/"Regulado" redundantes); um único banner via `MroPageShell`. | `layout-audit-regressions.test.ts` → "keeps module governance metadata compact and non-redundant" (PASS) | — | Banner não redundante confirmado no código. `MroSubnav` mantém padrão de scroll horizontal (`overflow-x-auto` + `min-w-max`, alvo de toque `py-1.5` ≈ 32px), diferente do padrão aprovado em `ControleVoosSubnav` (PR #297). Front MRO congelado por precedência 2026-09-06 (não é regressão) → não reaberto nesta execução. | `staging-mro-mobile-qa.yml` não executado; paridade mobile do `MroSubnav` fica como follow-up fora do escopo congelado |
| **N-03** | Controle de Voos — subnav horizontal em mobile (clipping, touch target, a11y) | Tratado → só regressão final | **CORRIGIDO** | PR #297 via consolidação PR #304 (`c78f7dbc`): `ControleVoosSubnav` passa a ter `sm:hidden` `<select>` nativo `min-h-[44px]` + tab strip `hidden sm:block` com `min-h-[44px]`, `aria-label`, `aria-current`, preservando `search`. | `src/react-app/pages/controle-voos/__tests__/ControleVoosSubnav.test.tsx` (PASS) | — | Regressão final em 390×844 / 375×812 pendente de QA autenticado | `staging-frontend-pr-ui-qa.yml` / audit-closure spec não re-executado neste SHA |
| **N-04** | FRMS — loading | CORRIGIDO | **CORRIGIDO** — sem regressão | Baseline; páginas FRMS mantêm estados de carregamento (skeleton/spinner). Backend FRMS fora de escopo (agentes paralelos). | — | — | — | — |
| **N-05** | Controle de Voos — `/rdv/fila` erro interno / 5xx | **FECHADO** | **CORRIGIDO / FECHADO** | Issue #378 (CLOSED 2026-09-06). Schema V2 0438 aplicado em produção de forma governada; smoke autenticado: `GET /api/controle-voos/rdv/fila?limit=1` HTTP 200, tenant 6, PASS=13 FAIL=0, zero writes. | Smoke governado de produção (issue #378) | — | Validado em produção (issue #378) | Nenhum. Não reabrir sem regressão real; não reaplicar 0438. |
| **N-06** | Controle de Voos — banners contextuais duplicados | NÃO CORRIGIDO | **CORRIGIDO** | PR #266 (`104ddb40`): `ControleVoosPageShell` renderiza **uma** camada de governança (`demoRoute ? <ModuleGovernanceBanner/> : <ControleVoosPrototypeBanner/>`). PR #287 via #304: remove rótulos "— Preview"/"— Em desenvolvimento" redundantes dos PageHeaders, preservando a limitação específica. Nenhuma página CV renderiza banner próprio além do shell. | `layout-audit-regressions.test.ts` → "renders only one governance layer…" + "keeps Controle de Voos preview PageHeaders free of redundant preview labels (N-06)" (PASS) | — | Confirmado no código | — |
| **N-07** | Funcionários — Pasta 360 com documentos duplicados e/ou artefatos 0 KB | NÃO CORRIGIDO | **NÃO VERIFICADO** | Correções posteriores de confiabilidade/tenant tocaram pasta-virtual (`7341a7b2` RBAC de documentos; `d15dc4c7` #773; `70f8fe7f` #763), mas nenhuma prova direta de que "duplicado / 0 KB" foi eliminado. Causa raiz é de armazenamento/dados (R2/versionamento), reproduzível apenas com sessão autenticada. Observação menor: `PastaVirtual.tsx` mostra `arquivo.tamanho` cru enquanto `PastaVirtualGeral.tsx` usa `formatBytes()` — inconsistência de formatação, não regressão comprovada. | — | — | Requer inspeção autenticada da Pasta 360 (upload + listagem + tamanho de artefato) | Sem browser autenticado / dados reais → BLOQUEADO POR VALIDAÇÃO OPERACIONAL |
| **N-08** | Escalas — competências/meses fora de ordem ou misturados | NÃO CORRIGIDO | **CORRIGIDO** | Etapa 1 — PR #269 (`a81d35d3`): separa visualmente "Próximas competências" (criação) da grade existente. Etapa 2 — PR #283 via #304 (`c78f7dbc`): `ordenarEscalas.ts` — `ordenarEscalasCronologicamente` ordena por `ano` e depois `mes` (nunca lexicográfico); `classificarCompetencia` compara ano+mês; consumido em `EscalasListagemView.tsx`. | `src/react-app/pages/escalas/__tests__/ordenarEscalas.test.ts` + `EscalasListagemView.test.tsx` (PASS) | — | Confirmado no código; lista multi-ano ordena dez/2025 antes de jan/2026 | — |
| **N-09** | SGSO — relato listado abria "Relato não encontrado" | NÃO CORRIGIDO / P1 | **CORRIGIDO (código)** | Front — PR #450 (`226d7fe0`, MERGED 2026-09-07): `resolveSgsoRelatoLoadError` mostra "Relato não encontrado" só em 404 / `SGSO_RELATO_NOT_FOUND`; 5xx mostra o erro real; `carregar()` limpa estado antes de recarregar. Causa raiz de dados (`a.matricula → a.prefixo` no detalhe SGSO) corrigida no backend em 03/09 (fora do escopo deste fechamento). | `src/react-app/pages/__tests__/SgsoRelato.error-contract.test.ts` (404 vs 500) (PASS) | — | Semântica de erro confirmada no código | Fluxo real lista→detalhe em tenant com dados reais pendente de QA autenticado |
| **N-10** | Funcionários — "FRMS/Fadiga" parecia aba mas abria página externa/inconsistente | NÃO CORRIGIDO / P3 | **CORRIGIDO** | PR #284 via #304 (`c78f7dbc`): em `FichaFuncionarioPage.tsx` o acesso "FRMS / Fadiga" sai da barra de abas para o header, com ícone `ExternalLink`, `aria-label` explícito e `?origem=ficha`; `FrmsFichaTripulante` usa `resolveFrmsFichaBack` para o "Voltar" sensível à origem (volta à ficha só quando veio dela). | `src/react-app/pages/frms/__tests__/resolveFrmsFichaBack.test.ts` (PASS) | — | Confirmado no código | — |
| **N-11** | FRMS — resíduos/fixtures sintéticos | **FECHADO** | **CORRIGIDO / FECHADO** | Issues #380 / #390 (`5cb7606c`). `funcionario_id=129` / `user_id=108` tratado de forma governada por IDs exatos, com recovery point e pós-condições. Candidato 128 preservado como INDETERMINADO. | Workflows n11 governados (readonly inventory / structural remediation) | — | Executado de forma governada (issues #380/#390) | Nenhum. Não reabrir sem regressão real; não voltar a filtro por display-name. |

## MRO / CV — residuais anteriores

| Item | Estado em `main` | Evidência | Nota |
|---|---|---|---|
| MRO-01, MRO-02, MRO-03, MRO-06, MRO-08 | CORRIGIDO (baseline) | Front MRO fechado por precedência 2026-09-06 | Não reaberto — sem regressão observada |
| MRO-07 | PARCIAL (baseline) | Front MRO congelado por precedência | Sem regressão observada; não reaberto |
| CV-01, CV-02 | CORRIGIDO na landing desktop | `feat(ui): make flight control landing action-first` (`3c60ed14`) + `test(ui): guard action-first flight control landing` (`89f33e64`) | Guardado por teste |
| Ações destrutivas inline (P0 #281) | CORRIGIDO | PRs #282 / #285 / #288 / #295 / #296 via #304; `RowActionsMenu` + testes `*destructive-actions*` | Fora do catálogo N mas na checklist operacional |

## Outras áreas do relatório

| Área | Baseline | Reconciliação | Estado |
|---|---|---|---|
| Painel | PARCIAL | Programa amplo #122 / #196 / #200 / #201 fechado; sem sub-achado específico aberto fornecido; nenhum residual executável identificado por delta | NÃO VERIFICADO (sem item acionável) |
| Simuladores | PARCIAL | Correções pós-auditoria integradas (#143, #288, cadastros destrutivos); sem sub-achado de layout aberto | NÃO VERIFICADO (sem item acionável) |
| Qualificações | PARCIAL | #196 (métricas), #193 (operacional-first), #285/#295 (ações destrutivas) integrados | NÃO VERIFICADO (sem item acionável) |
| LMS / EAD — upload/progresso SCORM real | NÃO VERIFICADO | Coberto por `lms-smoke` no heavy CI; nenhuma nova falha conhecida no baseline; prova de runtime real permanece pendente | BLOQUEADO POR VALIDAÇÃO OPERACIONAL |

## Conclusão

**Todos os resíduos de código executáveis da Auditoria Layout/UX estão resolvidos em `main` e guardados por testes focados.** Nenhuma alteração de código foi necessária nesta execução.

A auditoria Layout/UX/Operacional N-01…N-11 é **encerrada administrativamente na dimensão de código**. Permanecem apenas dependências de validação autenticada / staging / produção, que não são corrigíveis por alteração de código autônoma:

1. **N-01 / N-02 (mobile) / N-03** — QA mobile autenticado do mesmo SHA: `staging-mro-mobile-qa.yml` e `staging-frontend-pr-ui-qa.yml` (workflow_dispatch em `main` por identidade autorizada).
2. **N-07** — inspeção autenticada da Pasta 360 (upload → listagem → tamanho de artefato) para confirmar ausência de duplicados / artefatos 0 KB.
3. **N-09** — fluxo real lista→detalhe do SGSO em tenant com dados reais.
4. **LMS/EAD** — evidência de runtime real de upload/progresso SCORM além do `lms-smoke`.
5. **N-05 / N-11** — fechados; reabrir só com regressão real.

Nenhum deploy, migration remota, escrita em D1/R2 ou mudança de produção foi executada.

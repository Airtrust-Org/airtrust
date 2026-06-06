# AIRTRUST — Execução da Remediação (Escalas + Treinamentos + Integrações)
Data: 2026-06-06 · Modelo: Claude Code — Opus 4.8 (esforço máximo) · Auditoria-base: `docs/AIRTRUST_ESCALAS_INTEGRATIONS_*_20260606.md`

> Este documento registra a execução iterativa da remediação. Status honesto por achado, com commit, teste e evidência. **Nada foi publicado em produção** nesta iteração (ver §"Gate de publicação" abaixo).

## Estado git
- Branch base: `main` @ `83f3fb5` (= `origin/main`, 0/0 no início).
- Branch de trabalho: `fix/escalas-treinamentos-remediation` @ `0c145f9` (commit do Bloco 1).
- **Sem push, sem deploy, sem migration** nesta iteração. Trabalho preservado em branch reversível.

## Gate de publicação (por que ainda NÃO publicado)
O próprio prompt (§31/§40) só permite publicar quando, entre outros, "EVD considera treinamentos" (A1) e a UI estiver consistente (A5/M2/B3). Esses itens são de frontend/integração maiores e **ainda não foram implementados**. Publicar apenas o bloco de backend deixaria a feature incoerente (EVD ainda não exibiria treinamento) e mudaria semântica de emissão (A3) num sistema de produção real **sem validação ponta-a-ponta contra D1 real**. Decisão conservadora: concluir o conjunto coeso (Bloco 2/3) e validar em D1 local/staging antes de publicar.

---

## Bloco 1 — Correção de backend (CONCLUÍDO e TESTADO) — commit `0c145f9`

| ID | Severidade | Status | Correção (arquivo) | Teste |
|---|---|---|---|---|
| A2 | ALTO | ✅ CORRIGIDO | `services/escala-mensal-integrada.ts` — subquery do "registro mais recente" filtra `empresa_id` e agrupa por `empresa_id`; bind extra | contrato `A2: seleção ... isolada por empresa` |
| A3 | ALTO | ✅ CORRIGIDO | `services/treinamentos-planejados-integration.ts` — `sincronizarSolicitacaoConcluida...` preenche `resultado='APROVADO'`+`data_conclusao_efetiva`, fluindo pelo mesmo `concluirHistoricoPlanejado` | contrato A3 + behavioral existente de conclusão |
| A4 | ALTO | ✅ CORRIGIDO | `ensureGeneratedQualificationLink` vira upsert pela chave estável `qualificacao_historico_id`; recalcula data/vencimento do histórico já CONCLUIDA | behavioral `A4: reconcluir com data corrigida ...` |
| M1 | MÉDIO | ✅ CORRIGIDO | `employeeFilterSql`/`bindEmployeeFilters` aplicam `funcaoId` de fato | contrato `M1` |
| M3 | MÉDIO | ✅ CORRIGIDO | ciclo de vida: turma → CONCLUIDO/EM_ANDAMENTO conforme resultados finais (sem rebaixar CONCLUIDO) | behavioral `M3: ...CONCLUIDO` e `...EM_ANDAMENTO` |
| M5 | MÉDIO | ✅ CORRIGIDO | só renova histórico com `data_conclusao < nova` | behavioral `M5: conclusão retroativa ...` |
| M6 | MÉDIO | ✅ CORRIGIDO | dedupe + conflito honram `canonicalDedupKey` (colapsa turma↔sessão, inclui instrutor) | pure `M6/B1: dedupe colapsa ...` e `... não conflitam` |
| M7 | MÉDIO | ✅ CORRIGIDO | conflito ESCALA×ESCALA suprimido (representações do mesmo compromisso) | pure `M7: duas linhas de ESCALA ...` |
| M10 | MÉDIO | ✅ CORRIGIDO | FRMS expõe `dateReliable`/`dateSource` (jornada vs created_at) | contrato `M10` |
| B1 | BAIXO | ✅ CORRIGIDO | `canonicalDedupKey` agora é usada (dedupe/conflito) | coberto por M6 |
| B4 | BAIXO | ✅ CORRIGIDO | filtro de severidade preserva eventos referenciados por conflitos | contrato `B4` |

**Validação local do Bloco 1:** `tsc` root limpo · `tsc` worker limpo (exceto 8 erros FRMS pré-existentes) · `lint` (3 guardas) OK · worker **953 testes** OK · frontend **550 testes** OK. +25 testes adicionados.

---

## Pendente (próximas iterações) — NÃO concluído nesta sessão

| ID | Severidade | Natureza | Observação |
|---|---|---|---|
| A1 | ALTO | EVD↔treinamento (backend + UI) | exige fonte de disponibilidade na EVD + exibição; política centralizada. **Maior item.** |
| A5 | ALTO | frontend (RQ + parcialidade) | migrar Visão Mensal para React Query + render de `diagnostics`/parcialidade + multi-aba |
| M2 | MÉDIO | UI de presença por dia | consumir `/dias/:diaId/presencas`; diferenciar presença/aprovação/conclusão |
| M4 | MÉDIO | órfãos na remoção | limpar `treinamentos_presencas` ao remover participante; preservar `geradas`/qualificação emitida para rastreio (sem `deleted_at` em participantes → usar limpeza explícita) |
| M8 | MÉDIO | join `qualificacoes_tipos` | mitigado de fato por A2; filtro de igualdade por tenant intencionalmente NÃO adicionado (codigo é UNIQUE global; igualdade causaria falso-negativo em tenants não-primários). **Decisão conservadora documentada.** |
| M9 | MÉDIO | política de cancelamento pós-emissão | definir ação explícita de revogação (permissão + auditoria); hoje qualificação CONCLUIDA permanece (comportamento conservador correto, falta UI/ação) |
| M11 | MÉDIO | performance | medir 25/100/300 tripulantes; filtros server-side; virtualização |
| M12 | MÉDIO | atomicidade/duplo-submit criar turma | D1 não tem transação interativa (id dependente); plano: idempotency-key + dedupe por chave natural + guarda de duplo-clique no frontend |
| B2 | BAIXO | tenant de recursos de `dias` | validar `simulador_id`/`aeronave_id`/`sessao_id` em `validateTrainingReferences` |
| B3 | BAIXO | "+N itens" expansível | popover/painel acessível |

Itens transversais pendentes: UX (linguagem de estados), acessibilidade em tela, e2e/Playwright, smoke autenticado com escrita controlada em produção, reauditoria pós-deploy, correção dos 8 erros TypeScript FRMS (deferidos — código FRMS/SIGVOOS sensível, fora do escopo escalas/treinamentos; risco operacional de tocá-los nesta missão).

## Decisão dos 8 erros TypeScript FRMS (pré-existentes)
Estão em `frms/*` (testes), `cron/frms-daily-check.ts` e `routes/frms-fadiga-acumulada.ts`. São anteriores a esta missão e tocam cálculo/cron de fadiga (base SIGVOOS canônica recém-reconstruída). Corrigi-los mid-missão, sem reauditoria FRMS dedicada, traz risco operacional concreto — exatamente a exceção prevista no prompt (§28). **Deferidos com justificativa**, a tratar em frente FRMS própria. Nenhum dos meus arquivos introduz erro novo.

## Confirmações de segurança desta iteração
- Sem `git add .`, sem `git push`, sem `--force`, sem reset/clean.
- Sem deploy, sem migration, sem escrita em produção, sem backfill.
- Sem alteração de secrets/cron.
- Documentos da auditoria original preservados (untracked) e referenciados.

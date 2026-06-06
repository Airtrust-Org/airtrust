# AIRTRUST — Auditoria Independente, Adversarial e Completa
## Escala Diária (EVD), Escala Mensal Integrada, Treinamentos (Class Management) e Integrações

- **Modelo / modo:** Claude Code — Opus 4.8, esforço máximo / análise profunda.
- **Data:** 2026-06-06
- **Natureza:** Auditoria independente, somente leitura. **Nenhum** código, dado, migration, commit, push ou deploy foi alterado.
- **Branch:** `main`
- **HEAD local:** `83f3fb51041b9336a3e7f3f0bf64f9c10388feda` (em sincronia com `origin/main`, 0 ahead / 0 behind)
- **Código funcional publicado:** `274250c1e232463e858135af3d6a22502fe3a41d`
- **Produção (read-only):** `https://api.airtrust.online` — `/api/version` = `2026-06-06T18:38:55Z-274250c`, `/api/health` = `healthy` (DB latency 318 ms, storage 159 ms).

---

## 1. Sumário executivo

A entrega `274250c` adiciona um módulo de **gestão de turmas multi-dia** (migration `0390`, tabelas `treinamentos_dias`, `treinamentos_instrutores`, `treinamentos_presencas`, `treinamentos_qualificacoes_geradas`) e uma **Visão Mensal Integrada** (`escala-mensal-integrada`) que agrega ESCALA + TREINAMENTO + SIMULADOR + QUALIFICAÇÃO + FRMS por tripulante/mês, com detecção de conflitos por sobreposição e dedup turma↔sessão de simulador.

A arquitetura do agregador mensal é boa: cada fonte é isolada em `runSource()` com captura de erro e diagnóstico de parcialidade, o dedup turma/simulador é feito em SQL, a idempotência de emissão de qualificação é protegida por `UNIQUE` em `treinamentos_qualificacoes_geradas`, e a regra de adjacência (fim == início) **não** gera conflito (correto). Type-check passa (`tsc --noEmit`, exit 0) e as 4 suítes de teste do pacote passam.

**Porém, a confiança operacional não pode ser declarada plena.** Os achados mais relevantes são integrações ausentes/frágeis e inconsistências de fluxo que só apareceriam no uso diário:

1. **A EVD (escala diária) é completamente cega aos treinamentos.** O arquivo `escalas-evd.ts` não referencia nenhuma das tabelas de treinamento. Um planejador pode alocar um tripulante num voo durante uma turma confirmada de 5 dias e a ferramenta **não emite aviso nem bloqueio**. A nova visão mensal integrada mostra o conflito, mas só para `admin`/`manager` e só após recarregar manualmente — não na ferramenta operacional onde a escala é montada.
2. **Concluir treinamento pela rota de solicitações deixa a qualificação em `PLANEJADA`** (não emitida). Os dois caminhos de conclusão divergem: só o endpoint novo `/participantes/conclusao` emite; o caminho legado (`solicitacoes-treinamento` → `sincronizarSolicitacaoConcluidaComTreinamentoPlanejado`) seta `aprovado=1` mas não preenche `resultado`/`data_conclusao_efetiva`, então `shouldCompleteParticipante` retorna falso e a emissão não ocorre.
3. **Acoplamento cross-tenant na fonte de qualificações:** a subquery `MAX(id) … GROUP BY COALESCE(funcionario_cpf, funcionario_id), qualificacao_codigo` **não filtra `empresa_id`**. Se a mesma pessoa (mesmo CPF) existir em dois tenants, o registro "mais recente" pode pertencer a outro tenant e suprimir o alerta de vencimento do tenant correto (falso negativo).
4. **Frescor de dados:** a Visão Mensal Integrada usa `useApi` (fetch próprio com `bypassGetCache`) e **não é invalidada** pelas mutações de treinamento/escala (que são React Query). Após criar/concluir/cancelar uma turma, a visão integrada permanece desatualizada até o usuário clicar "Recarregar".
5. **Funcionalidades de backend inacessíveis na UI:** o endpoint de presença por dia (`/dias/:diaId/presencas`) e a tabela `treinamentos_presencas` existem, mas **não há mutação no frontend** para registrar presença diária; e a conclusão por participante **não transiciona o status da turma** para `CONCLUIDO`.

**Decisão final:** ver §20. Em resumo: **APROVADO COM RESTRIÇÕES** — utilizável pelo gestor de treinamento e como consulta mensal, com workarounds e monitoramento definidos, mas **a escala diária (EVD) não pode ser usada como fonte única de verdade de disponibilidade enquanto não enxergar treinamentos**, e dois fluxos de conclusão precisam ser unificados antes de ampliar o uso.

---

## 2. Escopo efetivamente auditado

| Área | Arquivos lidos integralmente | Profundidade |
|---|---|---|
| Migration de turmas | `migrations/0390_training_class_management.sql` | DDL completa, índices, triggers, constraints |
| Agregador mensal | `services/escala-mensal-integrada.ts` (978 ln), `routes/escala-mensal-integrada.ts` | Integral |
| Treinamentos | `routes/treinamentos-planejados.ts` (2206 ln), `services/treinamentos-planejados-integration.ts` (1105 ln) | Integral |
| Frontend | `pages/escalas/VisaoMensalIntegradaPage.tsx`, `hooks/useTreinamentosPlanejados.ts`; spot-check `pages/TreinamentosPlanejadosPage.tsx` | Hook integral; páginas parcial |
| EVD / disponibilidade | `routes/escalas-evd.ts` (2039 ln, mapeado por grep de fontes de disponibilidade/conflito), inventário `routes/escalas-*` | Mapa de fontes |
| Esquemas correlatos | `qualificacoes_tipos`, `qualificacoes_historico`, `escala_situacao_tipos`, `frms_alerta` (via migrations) | Colunas-chave / tenant |
| Solicitações | `routes/solicitacoes-treinamento.ts` (caminho de conclusão) | Trecho de conclusão |
| Produção | `/api/version`, `/api/health` (públicos, read-only) | Confirmação de versão/saúde |

**Não auditado em profundidade (limitações, §4):** smoke autenticado em produção (sem credenciais), navegação real no browser local (servidor não iniciado nesta passagem), todas as 2566 linhas do `TreinamentosPlanejadosPage.tsx`, módulos LMS/SGSO, e o caminho completo de e-mail de convocação.

---

## 3. Métodos e comandos executados

- `git status/branch/rev-parse/rev-list/log/show --stat` para rastreabilidade.
- Leitura integral dos arquivos centrais (Read).
- `grep` estrutural para mapear endpoints, RBAC, consumidores das novas tabelas e fontes de disponibilidade da EVD.
- `grep` em migrations para confirmar colunas de tenant (`qualificacoes_tipos.empresa_id` existe; `qualificacoes_tipos.codigo` é UNIQUE global; `escala_situacao_tipos.codigo` UNIQUE global; `frms_alerta.tripulante_id REFERENCES funcionarios(id)`).
- `npx tsc --noEmit` → **exit 0**.
- `npx vitest run` nas 4 suítes do pacote (escala-mensal-integrada, treinamentos-planejados route, integration, schema) → **todas passaram**.
- `curl` read-only em `/api/version` e `/api/health` de produção.

---

## 4. Limitações da auditoria

1. **Smoke autenticado em produção não executado** — sem credenciais fornecidas no ambiente. Os comportamentos verificados são código + testes + endpoints públicos. Os riscos abaixo marcados como "altamente provável" não foram observados em produção autenticada.
2. **Sem validação em banco com dados reais** — não houve execução de queries no D1 remoto (proibido). Casos como o acoplamento cross-tenant de qualificações (A2) são confirmados por leitura de SQL, não por dados.
3. **Browser local não exercitado nesta passagem** — UI avaliada por leitura de código (estrutura, query keys, freshness). Avaliação de zoom/leitor de tela/mobile é parcial.
4. **Enforcement de FK no D1** — a leitura indica `ON DELETE CASCADE` no DDL; o D1 em runtime tipicamente não força FK fora de migrations. O impacto (órfãos) é tratado como "altamente provável", não confirmado por execução.

---

## 5. Arquitetura observada

- **Dois runtimes** (SPA React + Worker Hono/D1) conforme `CLAUDE.md`.
- **Agregador mensal** (`buildIntegratedMonthlyView`): carrega refs de funcionários ativos do tenant; dispara 5 fontes em paralelo via `Promise.all(runSource(...))`; cada fonte tenta/captura erro e devolve `{events, partialSources, warnings}`; gera conflitos por sobreposição (`buildConflictEvents`), dedup (`dedupeIntegratedEvents`), agrupa por tripulante/dia em quatro baldes (`operationalAssignments`, `commitments`, `alerts`, `conflicts`).
- **Modelo de leitura de treinamento:** UNION de `treinamentos_dias` (dias efetivos) com fallback para `treinamentos_planejados` quando a turma não tem dias; `people` = participantes ∪ instrutores (tabela nova) ∪ `instrutor_id` legado; conflito de recurso (sala/simulador/aeronave) calculado em SQL.
- **Dedup turma↔simulador:** `loadSimuladorEvents` exclui sessões cuja `sessao_id` está vinculada a um dia de turma **e** o funcionário consta em `treinamentos_participantes`.
- **Emissão de qualificação:** `syncTreinamentoPlanejadoIntegration` cria/atualiza histórico `PLANEJADA` por participante; quando `shouldCompleteParticipante` (aprovado=1 ∧ resultado='APROVADO' ∧ data_conclusao_efetiva), conclui o histórico (`CONCLUIDA`), marca anterior como `RENOVADA`, registra vínculo idempotente em `treinamentos_qualificacoes_geradas` e publica evento.
- **EVD** (`escalas-evd.ts`): disponibilidade derivada de `funcionario_ferias` (hard block), conflito com outras escalas mensais (soft), fonte confiável de qualificação para habilitação de modelo (hard block) e FRMS jornada (repouso/corte motor). **Sem** consulta a treinamentos/simuladores planejados.

---

## 6. Mapa de integrações (resumo; matriz completa no BUG_REGISTER)

| Ação de origem | Reflexo esperado | Reflexo observado | Status |
|---|---|---|---|
| Criar turma | Calendário treino, Visão Mensal, conflitos | Aparece na Visão Mensal e calendário de treino. Conflito só na Visão Mensal (read-time). **EVD não vê.** | PARCIAL |
| Adicionar participante | Turma, calendário, Visão Mensal, **disponibilidade** | Aparece na Visão Mensal. **EVD não considera para disponibilidade.** | PARCIAL |
| Remover participante | Turma, calendário, conflitos, qualificação planejada cancelada | `replaceParticipantes` faz DELETE físico; histórico PLANEJADA é cancelado por marcador. Órfãos prováveis (FK off). | PARCIAL |
| Alterar dia da turma | Calendário, Visão Mensal, conflitos | `replaceDias` revive dia soft-deleted via `ON CONFLICT`. OK. | OK |
| Cancelar turma | Calendário, Visão Mensal, disponibilidade, histórico | Histórico **PLANEJADA** é cancelado; **histórico já CONCLUIDA permanece** (qualificação emitida não é revogada). | PARCIAL |
| Vincular sessão à turma | Dedup, calendário, Visão Mensal | Dedup OK para participantes; **instrutor da sessão aparece duplicado**. | PARCIAL |
| Concluir participante (novo) | Histórico, qualificação, elegibilidade, escala | Emite qualificação CONCLUIDA. **Não muda status da turma.** Não invalida Visão Mensal automaticamente. | PARCIAL |
| Concluir via solicitação (legado) | Qualificação emitida | **Qualificação permanece PLANEJADA** (não emitida). | QUEBRADO |
| Qualificação vencer | Alertas, bloqueios, escala, Visão Mensal | Visão Mensal classifica BLOCKING/WARNING. **EVD usa fonte própria de habilitação, não esta.** Acoplamento cross-tenant na seleção do registro mais recente. | FRÁGIL |
| Criar indisponibilidade (FRMS/situação) | EVD, Visão Mensal, conflitos | Visão Mensal mostra; EVD mostra férias/FRMS por fontes próprias. | OK/PARCIAL |
| Mudar mês na Visão Mensal | Dados do novo mês | `useApi` refetch por mudança de URL. OK. | OK |
| Após mutação de treino, abrir Visão Mensal | Dados frescos | **Stale até "Recarregar"** (não é React Query). | FRÁGIL |

---

## 7–10. Achados (CRÍTICO / ALTO / MÉDIO / BAIXO)

> Detalhe completo, com passos, evidência (arquivo:linha), impacto e correção, no documento `AIRTRUST_ESCALAS_INTEGRATIONS_BUG_REGISTER_20260606.md`. Resumo:

### CRÍTICO
- Nenhum achado classificado como CRÍTICO foi **confirmado**. O candidato mais próximo (EVD cega a treinamentos, A1) é classificado **ALTO** porque há uma visão mensal compensatória e porque a EVD nunca enxergou treinamentos (lacuna, não regressão). Ver justificativa em A1.

### ALTO
- **A1 — EVD não enxerga treinamentos** (integração ausente; risco operacional de duplo-agendamento sem aviso).
- **A2 — Acoplamento cross-tenant na fonte de qualificações** (falso negativo de alerta entre tenants com mesmo CPF).
- **A3 — Conclusão via solicitações não emite qualificação** (dois caminhos divergentes; qualificação fica PLANEJADA).
- **A4 — Reconcluir com data corrigida lança erro 500** (conflito `UNIQUE(qualificacao_historico_id)` em `treinamentos_qualificacoes_geradas`).
- **A5 — Visão Mensal Integrada não invalida com mutações** (dados desatualizados; só "Recarregar" manual).

### MÉDIO
- **M1** — Filtro `funcao_id`/`base_id` aceito na rota mas `funcaoId` nunca aplicado no SQL (no-op silencioso); frontend também não envia.
- **M2** — Presença por dia (`/dias/:diaId/presencas`, `treinamentos_presencas`) sem UI para registro.
- **M3** — Conclusão por participante não transiciona status da turma para `CONCLUIDO`.
- **M4** — FK off em runtime: `replaceParticipantes` (DELETE físico) deixa órfãos em `treinamentos_presencas`/`treinamentos_qualificacoes_geradas`; órfão em `geradas` com `UNIQUE(historico_id)` pode bloquear reemissão.
- **M5** — Conclusão retroativa marca a qualificação **mais recente** como `RENOVADA` sem comparar datas.
- **M6** — Instrutor de sessão de simulador vinculada a turma aparece **duplicado** (dedup só cobre participantes).
- **M7** — Duas linhas de alocação de escala no mesmo dia para o mesmo tripulante geram conflito interno (allDay×allDay) — possível falso positivo (situação + alocação).
- **M8** — Join `qualificacoes_tipos` na fonte de qualificação sem filtro `empresa_id` (defesa em profundidade; limitado por `codigo` UNIQUE global).
- **M9** — Cancelar turma não sinaliza qualificações já `CONCLUIDA` (Jornada E parcial; possivelmente intencional, mas não documentado).
- **M10** — Data do alerta FRMS cai em `a.created_at` quando falta `jornada.data` → pode cair no mês errado.
- **M11** — Visão Mensal busca payload do mês inteiro e filtra no cliente; admin/manager apenas; risco de performance em tenants grandes.
- **M12** — Criação de turma sem transação/idempotency; multi-statement não-atômico; duplo-submit cria turmas duplicadas.

### BAIXO
- **B1** — `canonicalDedupKey` calculado em metadata mas nunca usado por `dedupeIntegratedEvents` (lógica morta/confusa).
- **B2** — `simulador_id`/`aeronave_id`/`sessao_id` em `dias` não validados por tenant em `validateTrainingReferences`.
- **B3** — Célula de dia trunca em 4 eventos com "+N itens" sem affordance de expandir.
- **B4** — Filtro de severidade no servidor pode orfanar eventos referenciados por um conflito (inócuo: frontend não envia `severidade`).

---

## 11. Análise de dados desatualizados (stale)

- **Visão Mensal Integrada:** `useApi(..., { bypassGetCache: true })` + `_r` (refreshKey) + botão "Recarregar". **Não** participa do cache do React Query, portanto `invalidateTreinamentosPlanejados()` (que invalida `treinamentos-planejados`, `solicitacoes-treinamento`, `qualificacoes-historico`) **não a atinge**. Sequência problemática real: usuário conclui um treinamento na aba A → abre a Visão Mensal na aba B → vê dados antigos até clicar Recarregar. **A5.**
- **Página de treinamentos:** mutações invalidam corretamente as três famílias de chave; `staleTime` 30–60 s. OK dentro do módulo.
- **EVD:** independente; usa suas próprias fontes. Mudança em treinamento **nunca** se reflete na EVD (A1) — não é stale, é ausência de integração.
- **generatedAt** é exibido ("atualizado em …"), o que ajuda o usuário a perceber idade do dado — bom. Porém `diagnostics.partialSources/warnings` **não** parecem ser renderizados na UI (verificar): se uma fonte cair, o usuário pode ver "menos eventos" sem aviso de parcialidade — risco de falso negativo silencioso.

---

## 12. Falsos positivos

- **M7** — alocações duplas no mesmo dia (situação + alocação operacional, ambas `allDay`) geram conflito interno. Como escala é sempre `allDay`, qualquer par de linhas distintas no mesmo dia se sobrepõe.
- **M6** — instrutor contado em turma **e** em simulador vinculado (duplicidade de compromisso).
- Conflito turma×turma por recurso usa `local`/`sala` normalizados; salas com nomes equivalentes mas grafias diferentes não conflitam (falso negativo), e salas homônimas em contextos distintos podem conflitar (falso positivo) — depende de dados.

## 13. Falsos negativos

- **A1** — conflito real escala×treinamento **nunca** aparece na EVD.
- **A2** — alerta de qualificação suprimido entre tenants com mesmo CPF.
- **A3** — qualificação concluída (via solicitação) não emitida → tripulante segue "inelegível"/sem registro.
- **Parcialidade silenciosa** — se `runSource` captura erro de uma fonte e a UI não mostra `partialSources`, "0 eventos" pode significar "fonte caiu".
- Qualificação vencida **não bloqueia** alocação na EVD (a EVD valida habilitação de modelo por fonte própria, não pelo histórico de vencimento desta visão).

---

## 14. Segurança e tenant

- Rotas de treinamento: `auth()` global + `requireRole('admin','manager')` em todas as mutações. `validateTrainingReferences` valida tenant de `qualificacao_tipo`, participantes e instrutores. **Bom.**
- `escala-mensal-integrada`: `requireRole('admin','manager')` + `getEmpresaIdSafe`. Todas as fontes filtram `empresa_id`. **Bom**, exceto:
  - **A2** (subquery `MAX(id)` sem `empresa_id`) — acoplamento/falso-negativo cross-tenant.
  - **M8** (join `qualificacoes_tipos` sem `empresa_id`) — defesa em profundidade.
  - **B2** (recursos de `dias` sem validação de tenant).
- Não foram encontrados IDOR óbvios: ids de turma sempre filtrados por `empresa_id`. `frms_alerta.tripulante_id` referencia `funcionarios(id)` — join da fonte FRMS está correto (não é id de outra entidade).

## 15. Performance

- **M11** — Visão Mensal: para 300 tripulantes × 31 dias × 5 fontes, o `buildConflictEvents` é O(n²) por tripulante e o payload completo vai ao cliente para filtragem. A fonte de qualificação faz join com `OR` (`f.cpf = qh.funcionario_cpf OR f.id = qh.funcionario_id`) e subquery de agregação sem `empresa_id` — ineficiente e sem índice ideal. Medir com volume real antes de ampliar.
- Criação/edição de turma: múltiplos `await` sequenciais por dia/participante/instrutor — N statements; aceitável para turmas pequenas, custoso para turmas grandes.

## 16. UI / UX (detalhe em UX_REVIEW)

- Visão Mensal: bom cabeçalho com `generatedAt`, navegação de mês, filtros client-side. Pontos fracos: sem expandir "+N itens" (B3), sem render de parcialidade, sem deep-link de filtro, admin/manager apenas.
- Treinamentos: dois conceitos de "aprovação" (toggle de presença legado vs conclusão por participante) podem confundir; presença por dia sem UI (M2); status da turma não fecha (M3).

## 17. Observabilidade

- `runSource` produz `diagnostics.partialSources/warnings` — ótimo para diagnóstico de "treino que não apareceu". Recomenda-se **exibir** na UI e **logar** no servidor.
- `publishQualificacaoEvent` em try/catch com `console.error` — emissão de qualificação é rastreável via `treinamentos_qualificacoes_geradas` + auditoria. Bom.
- Lacuna: não há correlação request-id explícita entre falha parcial e o tripulante afetado nos logs.

## 18. Testes

- 4 suítes passam. Cobrem schema, rota, integração e agregação. **Lacunas** (detalhe em TEST_GAPS): cross-tenant CPF (A2), emissão via solicitações (A3), reconclusão com data corrigida (A4), órfãos após remoção (M4), duplicidade de instrutor (M6), conflito escala×treinamento na EVD (A1 — inexistente), concorrência/duplo-submit (M12).

## 19. Produção

- Versão e saúde confirmadas (`274250c`, healthy). **Smoke autenticado não executado** (sem credenciais) — lacuna relevante: nenhum dos fluxos de turma foi exercido em produção com usuário real. Risco residual de comportamento dependente de dados (A2, M5, M9, M10).

---

## 20. Decisão final

### APROVADO COM RESTRIÇÕES

Justificativa: não há achado **crítico confirmado** de vazamento de dados entre tenants nem de emissão de qualificação indevida (a idempotência protege contra duplicidade). Porém há **5 achados ALTO** que tornam arriscado tratar a EVD como verdade única de disponibilidade e o fluxo de conclusão como uniforme.

**Restrições / condições de uso:**
1. **Não confiar na EVD para detectar conflito com treinamento.** Até A1 ser resolvido, o planejador deve consultar a Visão Mensal Integrada (ou o calendário de treinos) antes de alocar. Monitorar duplo-agendamentos.
2. **Usar exclusivamente o fluxo novo** ("Concluir participante") para emitir qualificação. Evitar concluir treinamento pela tela de solicitações até A3 ser corrigido.
3. **Não corrigir data de conclusão reconcluindo** (A4) — risco de erro 500 — até a correção idempotente.
4. **Recarregar a Visão Mensal manualmente** após qualquer alteração (A5).
5. **Tenants com CPFs compartilhados:** validar alertas de qualificação manualmente (A2) — risco de supressão.

A classificação anterior "**PUBLICADO COM LIMITAÇÕES NÃO CRÍTICAS**" **não é totalmente defensável**: A1 (risco operacional) e A3 (regressão funcional confirmada de emissão) são limitações **funcionais relevantes**, não meramente cosméticas. A correção prioritária de A1–A5 é recomendada antes de ampliar o uso para além de admin/manager.

---

## 21. Respostas às 25 questões obrigatórias (§27 do prompt)

1. **Escala diária com confiança?** Parcial — sim para o que ela cobre (férias, habilitação de modelo, FRMS, conflito de escala), **não** para treinamentos (A1).
2. **Escala mensal mostra o estado real e atual?** Mostra o estado real **no momento do carregamento**; não auto-atualiza (A5).
3. **Dados que só atualizam após reload?** Sim — Visão Mensal Integrada (A5).
4. **Integrações ausentes?** Sim — EVD↔treinamento (A1).
5. **Cancelamentos que não propagam?** Parcial — turma cancelada não revoga qualificação já CONCLUIDA (M9); órfãos por FK off (M4).
6. **Qualificações que não atualizam elegibilidade?** Sim — A3 (via solicitações fica PLANEJADA).
7. **Conflitos falsos?** Sim — M6 (instrutor duplicado), M7 (dupla alocação allDay).
8. **Conflitos omitidos?** Sim — A1 (EVD).
9. **Bloqueios excessivos?** Não evidenciados além de M7.
10. **Risco cross-tenant?** Sim — A2 (falso negativo), M8/B2 (defesa em profundidade).
11. **Qualificação duplicada/indevida?** Protegida por `UNIQUE` (idempotente). Risco inverso: **não emitida** (A3).
12. **Turma e simulador duplicados?** Para participantes não; **para instrutor sim** (M6).
13. **Fluxo de treinamento utilizável pelo gestor?** Sim, com lacunas (M2 presença por dia, M3 fechar turma).
14. **Fluxo de escala utilizável pelo planejador?** Sim para escala; incompleto para visão integrada de treinamento na ferramenta diária (A1).
15. **UI fornece as ações necessárias?** Quase — falta UI de presença diária (M2) e fechamento de turma (M3).
16. **Funciona em notebook/mobile?** Não verificado em browser nesta passagem (limitação); layout usa grid responsivo com min-widths que podem causar scroll horizontal no calendário em telas pequenas.
17. **Mensagens transmitem sucesso/parcialidade/erro?** Sucesso/erro sim; **parcialidade não é exibida** (diagnostics ignorado na UI).
18. **Resiste a múltiplas abas e retries?** Abas: não (A5). Retry de criação: risco de duplicidade (M12). Reconclusão: erro (A4).
19. **Testes suficientes?** Não — lacunas em cross-tenant, emissão via solicitações, reconclusão, concorrência (TEST_GAPS).
20. **Sistema observável?** Parcialmente — diagnósticos existem mas subutilizados.
21. **Problemas que apareceriam no uso diário?** A1 (duplo-agendamento), A5 (dados velhos), A3 (qualificação não emitida), M2/M3 (fluxo incompleto).
22. **Corrigir antes de ampliar uso?** A1, A2, A3, A4, A5.
23. **Podem esperar?** M5–M12 (com monitoramento), B1–B4.
24. **Risco residual real?** Médio-alto operacional enquanto A1/A3 abertos; baixo de segurança (A2 é falso-negativo, não vazamento).
25. **"Publicado com limitações não críticas" defensável?** Não plenamente — ver §20.

---

## 22. Documentos gerados (sem commit)

- `docs/AIRTRUST_ESCALAS_INTEGRATIONS_OPUS_AUDIT_20260606.md` (este)
- `docs/AIRTRUST_ESCALAS_INTEGRATIONS_BUG_REGISTER_20260606.md`
- `docs/AIRTRUST_ESCALAS_INTEGRATIONS_TEST_GAPS_20260606.md`
- `docs/AIRTRUST_ESCALAS_INTEGRATIONS_UX_REVIEW_20260606.md`
- `docs/AIRTRUST_ESCALAS_INTEGRATIONS_REMEDIATION_PLAN_20260606.md`

**Confirmação:** nenhum código, teste, dado, migration, configuração, secret, cron, commit, push ou deploy foi alterado durante esta auditoria.

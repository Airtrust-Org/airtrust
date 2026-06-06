# AIRTRUST — Registro de Bugs / Achados (Escalas + Treinamentos + Integrações)
Data: 2026-06-06 · Branch `main` · Código `274250c` · Auditoria read-only (nada alterado)

Contagem por severidade: **CRÍTICO 0 · ALTO 5 · MÉDIO 12 · BAIXO 4** (total 21).

---

## ALTO

### A1 — EVD (escala diária) é cega aos treinamentos
- **Severidade:** ALTO (limítrofe CRÍTICO)
- **Módulo:** EVD / Integração
- **Tipo:** integração ausente
- **Status:** confirmado
- **Cenário operacional:** planejador monta a escala do dia e aloca um tripulante a um voo; o tripulante está numa turma confirmada de treinamento naquele dia.
- **Pré-condições:** turma com `treinamentos_dias` ATIVO no dia X; tripulante participante; planejador na EVD.
- **Passos:** criar turma 5 dias com participante → ir à EVD no dia coberto → alocar o mesmo tripulante.
- **Resultado esperado:** aviso/bloqueio de "tripulante em treinamento".
- **Resultado observado:** nenhum aviso. `escalas-evd.ts` não referencia `treinamentos_*` (grep "treinamento" em `escalas-evd.ts` → 0 ocorrências).
- **Evidência:** `worker-airtrust/src/routes/escalas-evd.ts` (fontes de disponibilidade: `funcionario_ferias` L439, conflito escala mensal L459, habilitação L552, FRMS jornada L711 — sem treinamentos). Apenas `services/escala-mensal-integrada.ts` consome as tabelas novas.
- **Tabelas:** `treinamentos_dias`, `treinamentos_planejados`.
- **Impacto operacional:** duplo-agendamento de tripulação sem alerta; decisão de escala com informação incompleta.
- **Falso negativo relacionado:** conflito real escala×treinamento omitido na ferramenta de montagem.
- **Frequência provável:** alta em operações com treinamento recorrente.
- **Usuários afetados:** todos os planejadores.
- **Workaround atual:** consultar Visão Mensal Integrada / calendário de treinos antes de alocar.
- **Causa raiz:** a EVD foi construída antes do módulo de turmas; nenhuma fonte de disponibilidade adicionada.
- **Correção recomendada:** adicionar fonte de indisponibilidade por treinamento na verificação de disponibilidade da EVD (consultar `treinamentos_dias` ATIVO + participantes para a data), classificada como soft conflict (aviso) ou hard block conforme política.
- **Teste de regressão:** unit na função de disponibilidade da EVD com tripulante em turma no dia.
- **Risco da correção:** médio (toca caminho crítico da EVD).
- **Prioridade:** P0.

### A2 — Acoplamento cross-tenant na fonte de qualificações (registro "mais recente" global)
- **Severidade:** ALTO
- **Módulo:** Escala Mensal Integrada / Qualificações
- **Tipo:** dados / segurança (tenant)
- **Status:** confirmado (por leitura de SQL)
- **Cenário:** mesma pessoa (mesmo CPF) cadastrada como funcionário em dois tenants; ambos têm histórico de qualificação para o mesmo `qualificacao_codigo`.
- **Passos:** tenant A possui histórico mais antigo; tenant B insere histórico mais novo (id maior) para o mesmo CPF+código → abrir Visão Mensal do tenant A.
- **Resultado esperado:** alerta de vencimento do tenant A baseado no histórico do tenant A.
- **Resultado observado:** o filtro `qh.id IN (SELECT MAX(id) … GROUP BY COALESCE(funcionario_cpf, funcionario_id), qualificacao_codigo)` **não tem `empresa_id`**; o `MAX(id)` global pode ser o do tenant B → o registro do tenant A é excluído do conjunto → alerta suprimido.
- **Evidência:** `services/escala-mensal-integrada.ts` L731-736 (subquery sem `empresa_id`); join `f ON (f.cpf = qh.funcionario_cpf OR f.id = qh.funcionario_id)` L723.
- **Tabelas:** `qualificacoes_historico` (tem `empresa_id`), `qualificacoes_tipos` (`codigo` UNIQUE global).
- **Impacto:** falso negativo de vencimento (tripulante vencido não alertado) entre tenants com CPF compartilhado.
- **Frequência:** baixa-média (depende de CPF compartilhado), mas alto impacto onde ocorre.
- **Workaround:** validação manual de vencimentos.
- **Causa raiz:** subquery de "última versão" não escopada por tenant.
- **Correção recomendada:** adicionar `WHERE empresa_id = ?` e `GROUP BY empresa_id, COALESCE(...), qualificacao_codigo` na subquery; trocar o join `OR` por chave única consistente (preferir `funcionario_id` quando presente).
- **Teste de regressão:** fixture com dois tenants, mesmo CPF, datas diferentes; assert que cada tenant vê o próprio registro.
- **Risco da correção:** baixo.
- **Prioridade:** P0.

### A3 — Conclusão via solicitações não emite a qualificação
- **Severidade:** ALTO
- **Módulo:** Treinamentos / Solicitações / Qualificações
- **Tipo:** bug / integração (regressão funcional)
- **Status:** confirmado
- **Cenário:** gestor conclui uma solicitação de treinamento vinculada a uma turma planejada.
- **Passos:** `POST /solicitacoes-treinamento/:id/concluir` → `sincronizarSolicitacaoConcluidaComTreinamentoPlanejado`.
- **Resultado esperado:** qualificação `CONCLUIDA` emitida para o participante.
- **Resultado observado:** a função seta `confirmado=1, presente=1, aprovado=1` mas **não** `resultado='APROVADO'` nem `data_conclusao_efetiva`. `shouldCompleteParticipante` exige os três → retorna falso → histórico permanece `PLANEJADA`. O fallback em `solicitacoes-treinamento.ts` que geraria a qualificação é **pulado** porque `trainingSync.qualificacaoHistoricoId` já está preenchido (com o histórico PLANEJADA).
- **Evidência:** `services/treinamentos-planejados-integration.ts` L1052-1062 (set sem resultado/data), L127-135 (`shouldCompleteParticipante`); `routes/solicitacoes-treinamento.ts` L362-371 (chamada) e bloco condicional `!trainingSync.qualificacaoHistoricoId`.
- **Tabelas:** `treinamentos_participantes`, `qualificacoes_historico`.
- **Impacto:** tripulante concluiu treinamento mas continua sem qualificação válida/elegibilidade (falso negativo de emissão).
- **Frequência:** alta para quem usa o fluxo de solicitações.
- **Workaround:** concluir pelo endpoint novo `/participantes/conclusao`.
- **Causa raiz:** gate de conclusão mudou para exigir os novos campos; o caminho legado não foi atualizado.
- **Correção recomendada:** no caminho legado, preencher `resultado='APROVADO'` e `data_conclusao_efetiva = dataRealizada` antes de `syncTreinamentoPlanejadoIntegration`, **ou** unificar os dois caminhos numa única função de conclusão.
- **Teste de regressão:** concluir via solicitação e assertar histórico `CONCLUIDA` + linha em `treinamentos_qualificacoes_geradas`.
- **Risco da correção:** médio.
- **Prioridade:** P0.

### A4 — Reconcluir participante com data corrigida lança erro
- **Severidade:** ALTO
- **Módulo:** Treinamentos / Qualificações
- **Tipo:** bug (concorrência/idempotência)
- **Status:** altamente provável (por leitura)
- **Cenário:** gestor concluiu participante com data X, percebe erro e reconclui com data Y.
- **Passos:** `PATCH /participantes/conclusao` com data X (gera histórico H e linha geradas com data X) → `PATCH` novamente com data Y.
- **Resultado esperado:** atualização para data Y.
- **Resultado observado:** `upsertHistoricoPlanejadoForParticipante` reaproveita o **mesmo** histórico H; `ensureGeneratedQualificationLink` busca por (treino, participante, tipo, **data Y**) → não acha → INSERT com `qualificacao_historico_id=H` → viola `UNIQUE(qualificacao_historico_id)` → catch recarrega por data Y → não acha → `throw` → 500.
- **Evidência:** `migrations/0390` L94-95 (dois UNIQUE); `services/treinamentos-planejados-integration.ts` L263-324 (`ensureGeneratedQualificationLink`).
- **Tabelas:** `treinamentos_qualificacoes_geradas`.
- **Impacto:** impossível corrigir data de conclusão; erro 500.
- **Frequência:** média (correções de data são comuns).
- **Workaround:** nenhum limpo via UI.
- **Causa raiz:** `data_conclusao_efetiva` faz parte da chave de idempotência **e** existe `UNIQUE(qualificacao_historico_id)`; mudar a data com o mesmo histórico colide.
- **Correção recomendada:** ao reconcluir, atualizar a linha existente em `geradas` (por `qualificacao_historico_id`) em vez de inserir; ou remover `data_conclusao_efetiva` da chave composta.
- **Teste de regressão:** concluir, reconcluir com data diferente, assertar 200 e linha única.
- **Risco da correção:** baixo-médio.
- **Prioridade:** P1.

### A5 — Visão Mensal Integrada não é invalidada por mutações
- **Severidade:** ALTO
- **Módulo:** Frontend / Frescor de dados
- **Tipo:** dados (stale)
- **Status:** confirmado
- **Cenário:** usuário altera treino/escala e consulta a Visão Mensal.
- **Resultado observado:** a página usa `useApi('/escalas/visao-mensal-integrada', { bypassGetCache: true })` com `_r` manual; não é React Query; `invalidateTreinamentosPlanejados` não a alcança.
- **Evidência:** `pages/escalas/VisaoMensalIntegradaPage.tsx` L219-223, L257-260; `hooks/useTreinamentosPlanejados.ts` L341-347.
- **Impacto:** decisão sobre dados desatualizados até "Recarregar".
- **Workaround:** clicar "Recarregar".
- **Correção recomendada:** migrar a página para React Query com a mesma família de chaves invalidada pelas mutações, ou disparar `refetch` via evento global após mutações.
- **Teste de regressão:** e2e — mutar treino e verificar atualização sem reload.
- **Prioridade:** P1.

---

## MÉDIO

### M1 — Filtro `funcao_id`/`base_id` não aplicado
- **Tipo:** bug (filtro no-op) · **Status:** confirmado.
- A rota aceita `funcao_id`/`base_id` e o service recebe `funcaoId`/`baseId`, mas `employeeFilterSql` só usa `employeeId` e `baseId`; **`funcaoId` nunca entra em SQL**. Além disso, o frontend só envia `mes` + `incluir_frms`, então ambos os filtros server-side são inertes.
- **Evidência:** `services/escala-mensal-integrada.ts` L339-344 (`employeeFilterSql` ignora funcaoId), L89-96 (filtro definido); `routes/escala-mensal-integrada.ts` L18,57.
- **Correção:** aplicar `funcaoId` no SQL (`COALESCE(f.funcao,f.cargo) = ?`) ou remover do contrato; alinhar com o frontend.
- **Prioridade:** P2.

### M2 — Presença por dia sem UI
- **Tipo:** integração (UI parcial) · **Status:** confirmado.
- Endpoint `PATCH /planejados/:id/dias/:diaId/presencas` e tabela `treinamentos_presencas` existem; o frontend só **exibe** contagem (`dia.presencas`), não há mutação para registrar.
- **Evidência:** `routes/treinamentos-planejados.ts` L2073-2144; `pages/TreinamentosPlanejadosPage.tsx` L1979-1980 (somente leitura); grep de mutação por `presencas` → ausente.
- **Impacto:** controle de presença diária inacessível ao gestor.
- **Prioridade:** P2.

### M3 — Conclusão por participante não fecha a turma
- **Tipo:** bug (status lifecycle) · **Status:** confirmado.
- `/participantes/conclusao` não transiciona `treinamentos_planejados.status` para `CONCLUIDO`. Único lugar que seta `CONCLUIDO` é o caminho legado de solicitações (quando não há pendentes).
- **Evidência:** `routes/treinamentos-planejados.ts` L1967-2071 (sem update de status); `services/...integration.ts` L1074-1084.
- **Impacto:** turma totalmente concluída pelo fluxo novo permanece `PLANEJADO/EM_ANDAMENTO`.
- **Prioridade:** P2.

### M4 — Órfãos por FK desabilitada em runtime (DELETE físico)
- **Tipo:** dados · **Status:** altamente provável.
- `replaceParticipantes` faz `DELETE FROM treinamentos_participantes`. `treinamentos_presencas` e `treinamentos_qualificacoes_geradas` referenciam `participante_id ON DELETE CASCADE`, mas o D1 normalmente não força FK em runtime → órfãos. Órfão em `geradas` (com `UNIQUE(qualificacao_historico_id)`) pode bloquear futura reemissão para o mesmo histórico.
- **Evidência:** `routes/treinamentos-planejados.ts` L361-398; `migrations/0390` L73,90,95.
- **Correção:** soft-delete de participantes ou DELETE explícito em cascata na aplicação; confirmar pragma de FK do D1.
- **Prioridade:** P2.

### M5 — Conclusão retroativa marca a qualificação mais recente como RENOVADA
- **Tipo:** dados · **Status:** altamente provável.
- `concluirHistoricoPlanejado` seleciona `anterior` por `ORDER BY data_conclusao DESC` e marca como `RENOVADA`, sem comparar com a data da nova conclusão. Concluir um treino com data retroativa marca a qualificação **mais nova** como renovada.
- **Evidência:** `services/...integration.ts` L644-672.
- **Correção:** só marcar como renovada registros com `data_conclusao < nova data`.
- **Prioridade:** P2.

### M6 — Instrutor duplicado (turma + sessão de simulador vinculada)
- **Tipo:** integração (falso positivo/duplicidade) · **Status:** confirmado.
- O dedup de `loadSimuladorEvents` exige `tp.funcionario_id` em `treinamentos_participantes`. Instrutor (em `treinamentos_instrutores` ou `instrutor_id`) atendendo a sessão vinculada não é deduplicado → aparece como evento de simulador **e** de treinamento.
- **Evidência:** `services/escala-mensal-integrada.ts` L654-660 (NOT EXISTS só em participantes); L493-515 (people inclui instrutores).
- **Correção:** incluir instrutores na condição de dedup.
- **Prioridade:** P2.

### M7 — Conflito falso entre duas alocações no mesmo dia
- **Tipo:** integração (falso positivo) · **Status:** provável.
- Escala é sempre `allDay`; duas linhas de `escala_alocacoes` distintas no mesmo dia (ex.: situação + alocação operacional) se sobrepõem e geram conflito interno.
- **Evidência:** `services/escala-mensal-integrada.ts` L419 (allDay true), L278-316 (par distinto → conflito).
- **Correção:** suprimir conflito entre dois eventos `ESCALA` do mesmo tripulante (são modelo de leitura, não compromissos independentes).
- **Prioridade:** P2.

### M8 — Join `qualificacoes_tipos` sem `empresa_id`
- **Tipo:** segurança (defesa em profundidade) · **Status:** confirmado.
- `INNER JOIN qualificacoes_tipos qt ON (qt.codigo = qh.qualificacao_codigo OR qt.id = qh.qualificacao_id)` sem `qt.empresa_id = ?`. Limitado por `codigo` UNIQUE global, mas frágil.
- **Evidência:** `services/escala-mensal-integrada.ts` L724.
- **Prioridade:** P3.

### M9 — Cancelar turma não revoga qualificação CONCLUIDA
- **Tipo:** dados · **Status:** confirmado (possivelmente intencional).
- `cancelManagedHistoricoForParticipante` só cancela histórico em status planejado. Qualificação já emitida permanece após cancelar a turma.
- **Evidência:** `services/...integration.ts` L561-572.
- **Correção:** documentar a regra ou oferecer ação explícita de revogação.
- **Prioridade:** P2/P3.

### M10 — Data do alerta FRMS via `created_at`
- **Tipo:** dados (timezone/janela) · **Status:** provável.
- `COALESCE(j.data, a.created_at)` — quando falta `jornada.data`, usa o timestamp de criação do alerta para situar no mês, podendo cair no mês errado.
- **Evidência:** `services/escala-mensal-integrada.ts` L810,819,838.
- **Prioridade:** P3.

### M11 — Performance da Visão Mensal em escala
- **Tipo:** performance · **Status:** hipótese a validar.
- Payload do mês inteiro filtrado no cliente; `buildConflictEvents` O(n²) por tripulante; fonte de qualificação com join `OR` e subquery de agregação sem `empresa_id`.
- **Evidência:** `services/escala-mensal-integrada.ts` L269-318, L711-742; `pages/...VisaoMensalIntegradaPage.tsx` L225-249.
- **Correção:** medir com 300 tripulantes/31 dias; considerar filtros server-side e paginação por tripulante.
- **Prioridade:** P2 (validar antes de ampliar).

### M12 — Criação de turma sem atomicidade/idempotência
- **Tipo:** concorrência · **Status:** confirmado.
- INSERT + loops de dias/participantes/instrutores + sync em statements separados; sem transação nem idempotency key. Duplo-submit cria turmas duplicadas; falha no meio deixa estado parcial.
- **Evidência:** `routes/treinamentos-planejados.ts` L1132-1181.
- **Correção:** `db.batch()`/transação; idempotency key opcional; desabilitar botão no frontend.
- **Prioridade:** P2.

---

## BAIXO

### B1 — `canonicalDedupKey` morto
`dedupeIntegratedEvents` chaveia por source/sourceId/employee/date/time/type; o `canonicalDedupKey` em metadata nunca é usado. Remover ou usar de fato. `services/escala-mensal-integrada.ts` L238-258, L603-605, L690. **P3.**

### B2 — Recursos de `dias` sem validação de tenant
`validateTrainingReferences` não checa `simulador_id`/`aeronave_id`/`sessao_id`. `routes/treinamentos-planejados.ts` L295-340 vs `diaSchema` L42-52. **P3.**

### B3 — Truncamento "+N itens" sem expandir
`DayCell` mostra só 4 eventos. `pages/...VisaoMensalIntegradaPage.tsx` L197-205. **P3.**

### B4 — Filtro de severidade server-side pode orfanar conflitos
`buildIntegratedMonthlyView` filtra por severidade após gerar conflitos que referenciam ids removidos. Inócuo hoje (frontend não envia `severidade`). `services/escala-mensal-integrada.ts` L952-954. **P3.**

---

## Matriz de integração detalhada (caminho do dado)

| Ação | Tabela oficial | Escrita | Leitura | Mecanismo de atualização | Reflete em | Reload? | Cache | Teste | Risco stale | Observado |
|---|---|---|---|---|---|---|---|---|---|---|
| Criar turma | `treinamentos_planejados` + `treinamentos_dias` | POST `/planejados` | `escala-mensal-integrada`, `/calendario` | RQ invalidate (treino) | Visão Mensal, calendário | Visão Mensal: sim (A5) | RQ + useApi | sim | A5 | PARCIAL (EVD não vê) |
| Adicionar participante | `treinamentos_participantes` | POST `/participantes` | idem | RQ invalidate | Visão Mensal | A5 | RQ | sim | A5 | PARCIAL |
| Remover participante | idem (DELETE físico) | PATCH `/planejados/:id` | idem | sync cancela PLANEJADA | Visão Mensal, qualif. planejada | A5 | RQ | parcial | M4 | PARCIAL (órfãos) |
| Concluir participante | `treinamentos_participantes`, `qualificacoes_historico`, `geradas` | PATCH `/participantes/conclusao` | qualif., Visão Mensal | sync emite CONCLUIDA | qualificações, elegibilidade | A5 | RQ | sim | A5 | OK (turma não fecha M3) |
| Concluir via solicitação | idem | POST solicitação concluir | idem | sync (sem resultado/data) | — | — | RQ | não | A3 | QUEBRADO |
| Vincular sessão↔turma | `treinamentos_dias.sessao_id` | PATCH dias | `escala-mensal-integrada` | dedup SQL | Visão Mensal | A5 | useApi | parcial | M6 | PARCIAL (instrutor dup) |
| Qualificação vencer | `qualificacoes_historico` | — | fonte qualif. | leitura | Visão Mensal | — | useApi | parcial | A2 | FRÁGIL (cross-tenant) |
| Alocar na EVD durante treino | `escala_alocacoes` | POST EVD | EVD | — | EVD não consulta treino | — | — | não | A1 | SEM INTEGRAÇÃO |

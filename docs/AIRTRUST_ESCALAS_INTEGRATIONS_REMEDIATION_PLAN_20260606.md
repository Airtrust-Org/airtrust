# AIRTRUST — Plano de Remediação (Escalas + Treinamentos + Integrações)
Data: 2026-06-06 · Código `274250c` · Auditoria read-only · **Nenhuma alteração aplicada**

Princípio: agrupar correções em **blocos coerentes**, não em microfases. Ordem por dependência e risco. Modelo recomendado por bloco: **Opus 4.8, esforço alto**, com testes antes do deploy e plano de rollback.

---

## Bloco 1 — Integridade de emissão de qualificação (P0/P1)
**Achados:** A3 (conclusão via solicitações não emite), A4 (reconclusão lança erro), M3 (turma não fecha), M5 (renovada retroativa).

- **Escopo:**
  - Unificar conclusão num único caminho: no fluxo de solicitações, preencher `resultado='APROVADO'` + `data_conclusao_efetiva = dataRealizada` antes de `syncTreinamentoPlanejadoIntegration` (A3).
  - Tornar `ensureGeneratedQualificationLink` tolerante a mudança de data: atualizar a linha por `qualificacao_historico_id` em vez de inserir nova (A4); ou remover `data_conclusao_efetiva` da chave composta.
  - Transicionar `treinamentos_planejados.status` para `CONCLUIDO` quando todos os participantes ativos estiverem concluídos (M3).
  - Marcar como `RENOVADA` apenas histórico com `data_conclusao < nova data` (M5).
- **Dependências:** nenhuma externa. Toca `treinamentos-planejados-integration.ts` e `solicitacoes-treinamento.ts`.
- **Testes:** #3, #4, #11, #13 (TEST_GAPS). Regressão das 4 suítes existentes.
- **Deploy:** sem migration. Deploy de worker.
- **Rollback:** revert do commit; nenhum efeito de dados (não há DDL). Verificar se reconclusões geraram linhas extras em `geradas` durante janela — limpar se necessário.
- **Risco:** médio (caminho de emissão). Prioridade **P0** (A3) + **P1** (A4).

## Bloco 2 — Isolamento de tenant na fonte de qualificações (P0)
**Achados:** A2 (subquery cross-tenant), M8 (join sem empresa_id).

- **Escopo:** adicionar `empresa_id` à subquery `MAX(id)` e ao `GROUP BY`; filtrar `qt.empresa_id = ?`; substituir join `OR (cpf/id)` por chave determinística (preferir `funcionario_id`, fallback CPF dentro do tenant).
- **Dependências:** nenhuma. Toca `escala-mensal-integrada.ts` (`loadQualificacaoEvents`).
- **Testes:** #2 (multi-tenant CPF compartilhado).
- **Deploy:** sem migration. Worker.
- **Rollback:** revert (apenas SQL de leitura).
- **Risco:** baixo. **P0** (correção de falso negativo e acoplamento).

## Bloco 3 — Integração EVD ↔ treinamento (P0)
**Achado:** A1.

- **Escopo:** adicionar fonte de indisponibilidade por treinamento na verificação de disponibilidade da EVD: consultar `treinamentos_dias` ATIVO (∪ fallback `treinamentos_planejados`) por funcionário e data, retornando soft conflict (aviso) e/ou hard block conforme política operacional. Reutilizar a lógica de leitura já existente em `escala-mensal-integrada.ts` (extrair helper compartilhado para evitar regra duplicada frontend/backend).
- **Dependências:** Bloco 1/2 não obrigatórios, mas reaproveitar helper de leitura consolidada é desejável.
- **Testes:** #1 (disponibilidade bloqueia/avisa treinamento).
- **Deploy:** sem migration. Worker. Validar em staging com smoke autenticado.
- **Rollback:** revert; a EVD volta ao comportamento atual (sem regressão de dados).
- **Risco:** médio-alto (caminho crítico da EVD) — exige teste cuidadoso e, idealmente, atrás de flag de política (aviso antes de bloqueio).
- **Prioridade:** **P0**.

## Bloco 4 — Frescor e parcialidade na Visão Mensal (P1)
**Achados:** A5 (sem invalidação), UX-2 (parcialidade não exibida), B3/UX-3 (+N itens), B1 (dedup key morto).

- **Escopo:** migrar a página para React Query (chave `['escala-mensal-integrada', mes, filtros]`) e invalidá-la nas mutações de treino/escala/qualificação; renderizar `diagnostics.partialSources/warnings`; tornar "+N itens" expansível; remover/usar `canonicalDedupKey`.
- **Dependências:** alinhar família de chaves com `useTreinamentosPlanejados`.
- **Testes:** #5 (e2e), #15 (parcialidade).
- **Deploy:** frontend.
- **Rollback:** revert (somente UI/cache).
- **Risco:** baixo. **P1**.

## Bloco 5 — Conflitos e dedup corretos (P2)
**Achados:** M6 (instrutor duplicado), M7 (dupla alocação ESCALA), M10 (data FRMS).

- **Escopo:** incluir instrutores na condição de dedup turma↔simulador; suprimir conflito entre dois eventos `ESCALA` do mesmo tripulante; usar data operacional correta para alerta FRMS (preferir `jornada.data`, descartar quando ausente em vez de usar `created_at`).
- **Testes:** #6, #7.
- **Deploy:** worker. **Rollback:** revert. **Risco:** baixo. **P2**.

## Bloco 6 — Ciclo de vida de dados e UI parcial (P2)
**Achados:** M2 (presença por dia sem UI), M4 (órfãos por FK off), M12 (criar turma sem atomicidade), M1 (filtro funcao no-op).

- **Escopo:** expor UI de presença por dia (consumir `/dias/:diaId/presencas`); converter remoção de participante para soft-delete OU DELETE explícito em cascata (presenças/geradas) confirmando pragma FK do D1; envolver criação de turma em `db.batch()`/transação + idempotency e desabilitar duplo-submit; aplicar `funcaoId` no SQL (ou remover do contrato + alinhar frontend).
- **Testes:** #9, #10, #12, #1-filtro.
- **Deploy:** worker + frontend. **Rollback:** revert. **Risco:** médio (toca DELETE de participantes). **P2**.

## Bloco 7 — Performance e política de cancelamento (P2/P3)
**Achados:** M11 (perf Visão Mensal), M9 (cancelar não revoga CONCLUIDA), B2/B4.

- **Escopo:** medir Visão Mensal com 300 tripulantes/31 dias; introduzir filtros server-side (`funcao`/`base`/`employee`) e paginação por tripulante; otimizar join `OR` da fonte de qualificação; definir e documentar (ou tornar acionável) a regra de cancelamento de turma para qualificações já emitidas; validar tenant de recursos em `dias` (B2); remover filtro de severidade server-side órfão (B4).
- **Testes:** #8; benchmark de carga.
- **Deploy:** worker + frontend. **Rollback:** revert. **Risco:** baixo-médio. **P2/P3**.

---

## Ordem recomendada e gating
1. **Bloco 2** (tenant, baixo risco, P0) e **Bloco 1** (emissão, P0) primeiro — correções de correção funcional/segurança sem DDL.
2. **Bloco 3** (EVD) com smoke autenticado em staging — maior risco operacional.
3. **Bloco 4** (frescor/UX) em paralelo (frontend).
4. **Blocos 5–7** conforme capacidade, com monitoramento.

## Pré-condições de deploy (todos os blocos)
- `npm run lint` (api-base + tracked-secrets + auth-boundaries) verde.
- `npx tsc --noEmit` verde.
- `npm run test:all` verde + novos testes do bloco.
- **Smoke autenticado em staging** (lacuna atual) cobrindo: criar turma → adicionar participante → concluir → ver qualificação → ver EVD/Visão Mensal.
- Backup pré-apply se houver qualquer DDL (nenhum bloco exige DDL no momento; A4 pode ser resolvido sem migration).

## Rollback geral
- Todos os blocos são revertíveis por `git revert` (sem migrations destrutivas previstas).
- Para Bloco 1/6, verificar `treinamentos_qualificacoes_geradas`/`treinamentos_presencas` por linhas criadas durante a janela e reconciliar se necessário (read-only diff antes/depois).

## Monitoramento pós-deploy
- Logar `diagnostics.partialSources` da Visão Mensal e taxa de erro 5xx em `/participantes/conclusao`.
- Alertar duplicidade de turmas (mesmo `qualificacao_tipo_id` + data + participantes) como proxy de M12.
- Acompanhar discrepância entre `treinamentos_qualificacoes_geradas` e `qualificacoes_historico` (CONCLUIDA) como proxy de A3.

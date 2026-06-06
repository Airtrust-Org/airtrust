# AIRTRUST — Lacunas de Teste (Escalas + Treinamentos + Integrações)
Data: 2026-06-06 · Código `274250c` · Auditoria read-only

## Estado atual
- `tsc --noEmit` → exit 0.
- Suítes que passam: `services/escala-mensal-integrada.test.ts`, `routes/treinamentos-planejados.test.ts`, `integration/treinamentos-planejados-integration.test.ts`, `migrations/training-class-management-schema.test.ts`.
- Avaliação: cobertura de **caminho feliz** boa (schema, criação, conclusão pelo endpoint novo, dedup turma↔simulador, agregação). Faltam **caminhos negativos, multi-tenant, concorrência, stale e a integração com a EVD**.

## Matriz regra crítica × cobertura

| Regra crítica | Teste existente | Qualidade | Lacuna |
|---|---|---|---|
| Dedup turma↔sessão simulador (participante) | sim (integração) | média | não cobre **instrutor** (M6) |
| Idempotência de emissão de qualificação | sim (schema/UNIQUE) | boa | não cobre **reconclusão com data diferente** (A4) |
| Conclusão emite CONCLUIDA | sim (endpoint novo) | boa | não cobre **caminho de solicitações** (A3) |
| Seleção do histórico "mais recente" | parcial | fraca | **sem fixture multi-tenant / CPF compartilhado** (A2) |
| Cancelamento de turma propaga | parcial | média | não distingue PLANEJADA vs CONCLUIDA (M9); não cobre órfãos (M4) |
| Conflito por sobreposição | sim | média | não cobre **dupla alocação ESCALA allDay** (M7) nem adjacência multi-fonte |
| Filtros (funcao/base/employee) | não | — | **`funcaoId` no-op** (M1) sem teste |
| Disponibilidade EVD × treinamento | não | — | **inexistente** (A1) |
| Frescor após mutação (Visão Mensal) | não | — | **A5** sem e2e |
| Concorrência criar turma (duplo-submit) | não | — | **M12** |
| Status lifecycle da turma | parcial | fraca | **conclusão não fecha turma** (M3) |
| Presença por dia | rota testada? parcial | fraca | **sem UI** (M2); sem e2e |
| Timezone/limites de mês | sim (parse) | média | fevereiro/bissexto/virada de ano explícitos faltam asserts dedicados |

## Testes propostos (nome · objetivo · fixture · esperado · prioridade)

1. **evd_disponibilidade_bloqueia_treinamento** — objetivo: EVD deve avisar/bloquear tripulante em turma no dia. Fixture: turma 1 dia ATIVO + participante + tentativa de alocação. Esperado: warning/hard block. **P0** (A1).
2. **qualificacao_alerta_isolado_por_tenant** — objetivo: alerta de vencimento não suprimido por outro tenant. Fixture: 2 empresas, mesmo CPF, históricos com ids/datas distintas. Esperado: cada empresa vê seu registro. **P0** (A2).
3. **conclusao_via_solicitacao_emite_qualificacao** — objetivo: caminho legado emite CONCLUIDA. Fixture: solicitação vinculada a turma + concluir. Esperado: histórico CONCLUIDA + linha em `geradas`. **P0** (A3).
4. **reconcluir_participante_com_data_corrigida** — objetivo: reconclusão não lança erro. Fixture: concluir data X, reconcluir data Y. Esperado: 200, 1 linha em `geradas`, histórico com data Y. **P1** (A4).
5. **visao_mensal_atualiza_apos_mutacao** (e2e) — objetivo: sem reload manual. Fixture: criar turma, abrir visão. Esperado: turma visível. **P1** (A5).
6. **instrutor_nao_duplica_em_sessao_vinculada** — objetivo: dedup cobre instrutor. Fixture: turma com sessão + instrutor participando da sessão. Esperado: 1 evento. **P2** (M6).
7. **dupla_alocacao_escala_nao_gera_conflito** — objetivo: dois eventos ESCALA do mesmo tripulante/dia não conflitam. Fixture: situação + alocação. Esperado: 0 conflitos internos. **P2** (M7).
8. **cancelar_turma_nao_revoga_concluida / revoga_planejada** — objetivo: regra de cancelamento explícita. **P2** (M9).
9. **remover_participante_nao_deixa_orfaos** — objetivo: presenças/geradas removidas junto. Fixture: participante com presença + geradas → remover. Esperado: sem órfãos. **P2** (M4).
10. **criar_turma_duplo_submit** — objetivo: não duplicar. **P2** (M12).
11. **conclusao_fecha_turma_quando_todos_concluidos** — objetivo: status `CONCLUIDO`. **P2** (M3).
12. **filtro_funcao_id_aplica** — objetivo: `funcaoId` filtra de fato. **P2** (M1).
13. **conclusao_retroativa_nao_renova_registro_mais_novo** — objetivo: RENOVADA só em registro mais antigo. **P2** (M5).
14. **timezone_fevereiro_bissexto_virada_de_ano** — asserts de `parseIntegratedMonth` para 2024-02 (29 dias), 2026-02 (28), dezembro→janeiro. **P3**.
15. **fonte_parcial_propaga_diagnostics** — objetivo: falha de uma fonte aparece em `partialSources` e a UI distingue de "0 eventos". **P2**.

## Observações sobre qualidade dos testes existentes
- Tendem a tenant único e datas "fáceis"; não há fixtures multi-tenant nem volume.
- Sem testes de concorrência/retry.
- Sem teste de browser para a Visão Mensal e para presença por dia.
- Recomendado adicionar asserts de **parcialidade** (diagnostics) e de **classificação de severidade** (WARNING vs BLOCKING) por cenário.

# Issue #1492: plano somente leitura das inconsistências matrícula LMS x qualificação (empresa 6)

Estado: **nenhuma escrita executada**. Evidência obtida por SELECT agregado/opaco em 10/11/2026.
Reprodutível com `node scripts/production/lms-qualification-consistency-plan-readonly.mjs --live` (somente SELECT, sem modo apply).
Qualquer reparo exige decisão registrada da Gestão de Treinamento, workflow governado, Time Travel e autorização exata de SHA/escopo.

Regras vinculantes respeitadas: não criar obrigação/evidência por ausência; EAD não substitui presencial/prático; cancelar matrícula não invalida qualificação válida; conclusão não cria evidência inexistente.

## Grupo 1: 7 matrículas CONCLUIDO com ciclo atual EM_ANDAMENTO (ids 323, 328, 331, 344, 394, 396, 398)

Causa técnica: **escrita fora do código**. Nenhum caminho do Worker conclui matrícula sem ciclo: `completeLmsMatricula` (`services/lms-completion.ts`) atualiza matrícula, ciclo, histórico e `audit_logs` no mesmo `D1.batch`. Evidência: nenhuma das 7 tem `LMS_MATRICULA_CONCLUIDA`/`SCORM_COMPLETION_ACCEPTED` no `audit_logs`; as matrículas têm `data_conclusao=2026-06-27`; os históricos (origem LMS) foram criados em 27/06 07:58 (3) e 03/07 20:49 (4), sem auditoria e com `lms_matricula_ciclo_id` nulo; ciclos seguem EM_ANDAMENTO com progresso 1 (e 63 em um caso). SCORM dessas matrículas está `passed` com score 95/100. É o incidente de conclusão administrativa de 27/06.

| Estado atual | Evidência | Tratamento proposto | Risco | Decisão Gestão |
|---|---|---|---|---|
| matrícula CONCLUIDO, ciclo EM_ANDAMENTO, histórico vivo CONCLUIDA | SCORM passed, histórico vivo, sem trilha de auditoria | Ratificar: alinhar o ciclo atual a CONCLUIDO (data, `qualificacao_historico_id`) e religar `lms_matricula_ciclo_id` do histórico, em batch atômico | médio (ratifica conclusão administrativa) | **Sim** |
| idem | idem | Alternativa: reverter pelo fluxo governado de reversão (preserva progresso/SCORM) | médio | **Sim** |

## Grupo 2: 6 matrículas CONCLUIDO apontando para histórico soft-deleted (ids 699, 867, 947, 1135, 1333, 2061)

Causa técnica: **defeito de código já corrigido em #1920** (`DELETE /historico/:id` só marcava `deleted_at` e deixava `lms_matriculas`/`lms_matricula_ciclos.qualificacao_historico_id` apontando). Evidência: as 6 conclusões ocorreram em 02/11 pelo caminho normal (`LMS_MATRICULA_FINALIZADA_MANUAL`, `SCORM_COMPLETION_ACCEPTED`, `SCORM_QUALIFICATION_TRIGGERED`, por 2 usuários internos); os 6 históricos foram excluídos via API em 03/11 01:26 e 01:30 UTC (`auditoria_avancada_v2`, origem api, DELETE), ~9h antes do merge de #1920 (03/11 10:39 -03). Os ciclos atuais (CONCLUIDO) apontam para o mesmo histórico excluído; nenhum outro histórico vivo do mesmo tipo existe para esses funcionários.

Mais um caminho latente foi encontrado e corrigido nesta PR: `routes/deduplicate.ts` soft-deletava o duplicado mais antigo (que pode ser o histórico derivado do LMS) sem religar matrícula/ciclo.

| Estado atual | Evidência | Tratamento proposto | Risco | Decisão Gestão |
|---|---|---|---|---|
| CONCLUIDO, ponteiro para histórico excluído, sem outro histórico vivo | exclusão auditada em 03/11 | Opção A (padrão #1920): limpar o ponteiro na matrícula e no ciclo; a matrícula permanece CONCLUIDO, sem qualificação | baixo | **Sim**: confirmar que a exclusão foi intencional (limpeza de teste) |
| idem | idem | Opção B: se foram conclusões de teste, reverter a matrícula pelo fluxo governado. Nunca recriar o histórico excluído | médio | **Sim** |

## Grupo 3: 27 matrículas CANCELADO com histórico CONCLUIDA/RENOVADA vivo (ids 25, 26, 45, 72, 300, 301, 302, 311, 409, 432, 455, 478, 501, 524, 561, 564, 566, 567, 568, 670, 671, 672, 673, 721, 1107, 1142, 1162)

Causa técnica: **versão antiga do script de reconciliação da matriz** (`scripts/production/training-compliance-matrix-enrollment-repair.mjs`) cancelou matrículas **já CONCLUIDO** com a razão `not_mandatory_ead_in_current_matrix` (`audit_logs`, `LMS_MATRICULA_COMPLIANCE_MATRIX_REPAIR`, `user_id` nulo): 24 em 05/10 17:16 UTC (antes das guardas `034693162`/`0dbc36f67`) e 3 em 10/10 19:10 UTC. Todas estavam CONCLUIDO antes (campo `old_values.status`), todas têm ciclo CANCELADO e histórico de origem LMS vivo e vinculado ao ciclo; nenhuma tem matrícula substituta ativa. A guarda `isProvablyUnstartedEnrollment` (#1375, 10/10 19:50 UTC) impede recorrência no script; #2154 e esta PR fecham os caminhos de API (`PATCH /:id/status` e `DELETE /:id`). Os 24 de 05/10 nunca entraram no conjunto de 81 restaurados; os 3 de 10/10 estão entre os 15 "não obrigatórios" preservados canceladas de propósito.

| Estado atual | Evidência | Tratamento proposto | Risco | Decisão Gestão |
|---|---|---|---|---|
| CANCELADO (ciclo CANCELADO), histórico válido | cancelamento lógico auditado; histórico, SCORM e xAPI intactos | Restaurar matrícula e ciclo para CONCLUIDO pelo workflow governado de restauração (mesmo desenho de `restore-compliance-81-cancellations`); sem tocar histórico | baixo | **Sim** (os 3 do curso 52, cancelados em 10/10, foram classificados como não obrigatórios pela auditoria #1379: decidir se a matrícula deve voltar) |
| idem | idem | Alternativa: manter cancelada; o histórico segue válido e exime a obrigação | baixo | **Sim** |

Lista por id e classificação: saída de `--live`, campo `groups.cancelled_with_live_history`.

## Grupo 4: 1 matrícula CONCLUIDO sem histórico (id 1, curso 2, abril/2026)

Causa técnica: **não é defeito**. O curso é o legado "Emergências Gerais - Legado" com `gerar_qualificacao_ao_concluir=0` e sem tipo de qualificação; `completeLmsMatricula` não cria histórico nesses cursos (`qualification_not_required`). Ciclo CONCLUIDO coerente, SCORM com score 1. Nenhum audit_log (anterior à auditoria). Das outras 547 conclusões do tenant, 537 têm histórico vivo vinculado, 4 apontam para histórico vivo não-LMS (ids 8, 9, 10, 582) e 6 são o grupo 2.

| Estado atual | Evidência | Tratamento proposto | Risco | Decisão Gestão |
|---|---|---|---|---|
| CONCLUIDO, curso sem tipo | curso legado | Nenhuma ação. Não criar evidência | nenhum | Não (apenas ciência) |

## Verificação do lado Compliance (sem alteração de comportamento)

- Histórico válido exime matrícula desnecessária (`suppressed_by_valid_evidence`, `requirementSuppressesEnrollment`) e funcionário sem nenhuma evidência continua `NAO_REALIZADO`.
- `loadQualificationEvidence` e `loadLmsEvidence` não têm `try/catch`: falha de D1 propaga (cron registra falha e não grava snapshot; rotas respondem erro). Teste novo `compliance-evidence-load-fail-closed.test.ts`. Os `catch` existentes em `compliance-treinamentos-intelligence.ts` tratam apenas estatísticas de notificação e tendência histórica, nunca conformidade.
- Observação: tabela de evidência ausente no schema devolve mapa vazio (leitura como "sem evidência", direção segura para conformidade). Em produção as tabelas existem.

# AirTrust — NOTECHS: notas individuais, suficiência e histórico (12/11/2026)

## Fonte operacional e decisão

PTO Rev.10 V18 aprovado, hash SHA-256 `040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912`. O conjunto NOTECHS compreende 15 elementos avaliados separadamente e nota mínima individual 6. Não é válido compensar elemento insuficiente com média de outros. `NR` ou `NAO_REALIZADA` é evidência de avaliação não concluída e não é nota suficiente para aprovar a ficha.

## Evidência existente em D1 produção (consulta read-only; nenhuma escrita)

Tenant Costa do Sol empresa 6: 110 fichas, 21 funcionários; 35 fichas com 15 NOTECHS cada, abrangendo 7 funcionários, 525 itens no total: 450 `NAO_REALIZADA`, 31 `NR`, 30 `NULL`, 9 notas `9.0`, 5 notas `8.0`. Uma ficha histórica tinha status e resultado `APROVADO` embora um dos 15 NOTECHS estivesse marcado `NR`; o motivo da excepcionalidade (se existir) precisa ser comprovado antes de qualquer retificação. Históricos assinados permanecem intactos.

## Correções implementadas

- Validador fail-closed `evaluateNotechsApproval`: os 15 códigos canônicos, inclusive aliases legados controlados, devem ocorrer exatamente uma vez, sem desconhecidos/duplicações; as 15 notas individuais precisam ser inteiras de 1 a 10 e **todas >= 6** para aprovação. `NR`, `NAO_REALIZADA`, ausente e inválido bloqueiam. Reprovação continua possível, sem inventar notas.
- `POST /fichas/:id/assinar`: o instrutor só pode confirmar `aprovado=true` quando o validador aprova as 15 linhas da ficha do funcionário. O SQL de UPDATE valida no D1, **no mesmo comando de escrita**, a permanência exata do conjunto de códigos/notas lido antes; caso mude durante o processo, retorna 409. Assinatura já finalizada não pode ser repetida/reescrita.
- `POST /fichas`: recusa criação de ficha já aprovada (`APROVADO`, `APROVADA`, `ASSINADA_TOTAL` ou `aprovado=1`); grava `aprovado=0` em fichas novas. `PUT /fichas/:id`: bloqueia `APROVADO`, `NAO_APROVADO`, `CONCLUIDA`, `APROVADA`, `ASSINADA_TOTAL` diretamente sem assinatura formal. A validação não pode ser contornada mudando apenas o campo `status`.
- `GET /fichas/:id`: inclui `notechs_avaliacao`, com contagem suficiente, ausências, notas insuficientes, valores inválidos, códigos duplicados ou inesperados.
- `GET /fichas/notechs/historico/:funcionarioId`: consolida fichas e notas por funcionário de forma read-only, sob RBAC do tenant e escopo setorial já usados no módulo, com limite fail-closed da consulta. Aluno pode consultar apenas o próprio histórico; gestor com acesso válido consulta o funcionário autorizado. Contém resumo de aprovadas com evidência NOTECHS insuficiente, para revisão formal sem alterações silenciosas.
- Ficha web: indica a suficiência individual, aponta deficiências e permite abrir um histórico de NOTECHS do funcionário, mantendo notas históricas intactas.

## Não feito / aceitação pendente

Nenhuma nota histórica foi alterada, nenhuma aprovação foi fabricada, nenhuma ficha assinada foi reaberta. O achado histórico deve passar por revisão do responsável técnico, incluindo a regra de admissibilidade de `NR` naquela sessão e a documentação de retificação se necessária. Os guias PTO e os demais currículos da issue #2232 são frente distinta e **não estão homologados** por este PR. Conferir os 8 gates oficiais, fazer merge isolado de NOTECHS, publicar Worker+Pages no mesmo SHA e comprovar fluxo de aprovar/reprovar no readback. Este documento não constitui homologação de 100% do PTO.

# FRMS / Fadiga Diaria - Auditoria de Calculo 2026-06-05

## Escopo

Auditoria read-only do pipeline FRMS/Fadiga Diaria e Fadiga Acumulada Legal para divergencias observadas em 2026-06-01, 2026-06-02 e 2026-06-03.

Regras cumpridas:
- Nenhuma migration executada.
- Nenhum `UPDATE`, `INSERT` ou `DELETE` executado.
- Consultas D1 remotas foram somente `SELECT`/`PRAGMA`; metadados retornaram `changed_db=false` e `rows_written=0`.
- Nenhum dado real foi alterado.

## Causa raiz

Foram encontrados dois problemas distintos.

1. Mistura de escopo diario e mensal na tela de detalhe da Fadiga Acumulada:
   - A coluna por dia mostrava percentual mensal/acumulado contra 90h/176h, embora o usuario lesse como FAT.HV% e FAT.JORNADA% diarios.
   - Exemplo: 282 min (04h42) / 90h = 5.222%, mas 282 min / 8h = 58.75%.

2. Uso de schema legado na rota `frms-fadiga-acumulada`:
   - A rota usava `duracao_minutos`, `hora_encerramento`, `repouso_anterior_minutos` e `dia_ciclo_embarcado`.
   - O schema atual de `frms_jornada` usa `duracao_jornada_minutos`, `hora_termino` e repouso em `frms_acumulo_rolling`.
   - Isso podia quebrar endpoint individual/projecao ou gerar jornada zerada/incoerente.

Problema de dado bruto separado:
- Em producao, 2026-06-01 contem jornadas com `horas_voo_minutos > duracao_jornada_minutos`.
- Caso critico: tripulante 7, jornada 09h55 (595 min) e HV 25h37 (1537 min). Isso e inconsistencia operacional, nao erro visual.
- Tambem existem casos reais com `duracao_jornada_minutos = 0` e `horas_voo_minutos > 0`, que precisam ser tratados como a mesma inconsistencia e nao podem sair como `OK`.

## Arquivos afetados

- `worker-airtrust/src/lib/frms/fadiga-acumulada-legal.ts`
- `worker-airtrust/src/routes/frms-fadiga-acumulada.ts`
- `worker-airtrust/src/cron/frms-daily-check.ts`
- `worker-airtrust/src/__tests__/frms/fadiga-acumulada-legal.test.ts`
- `src/react-app/pages/frms/FrmsFadigaAcumulada.tsx`

## Formulas antigas

Detalhe diario da Fadiga Acumulada:
- `% jornada = (jornada acumulada no mes / 176h) * 100 + fatores acumulados`
- `% voo = (HV acumulada no mes / 90h) * 100 + fatores acumulados`

Rota/projecao:
- `SUM(duracao_minutos)` em `frms_jornada`

## Formulas corrigidas

Linha diaria:
- `FAT.HV% dia = horas_voo_minutos / (8h * 60) * 100`
- `FAT.JORNADA% dia = duracao_jornada_minutos / (11h * 60) * 100`

Uso mensal explicito:
- `Uso mes HV = HV acumulada no mes / (90h * 60) * 100`
- `Uso mes jornada = jornada acumulada no mes / (176h * 60) * 100`

Integridade:
- Se `horas_voo_minutos > duracao_jornada_minutos`, a linha retorna `integridade_status = INCONSISTENTE` com `HV_MAIOR_QUE_JORNADA`.
- Isso vale inclusive quando `duracao_jornada_minutos = 0` e `horas_voo_minutos > 0`.

Contrato `data.resumo`:
- Os campos genericos `jornada_horas`, `voo_horas`, `pct_jornada` e `pct_voo` permanecem com escopo mensal/acumulado por compatibilidade com o significado historico do endpoint.
- Foram adicionados campos explicitos para escopo: `jornada_dia_horas`, `voo_dia_horas`, `jornada_mes_horas`, `voo_mes_horas`, `pct_jornada_dia`, `pct_voo_dia`, `pct_jornada_mes` e `pct_voo_mes`.
- A UI continua lendo `evolucao`; nao houve breaking change silencioso para o consumidor atual.

## Evidencias dos dias auditados

Consultas read-only em producao retornaram 14 jornadas entre 2026-06-01 e 2026-06-03.

Exemplos:
- 2026-06-03, tripulante 7: HV 282 min (04h42). Antigo mensal: 5.222%. Corrigido diario: 58.75%.
- 2026-06-02, tripulante 7: HV 189 min (03h09). Antigo mensal: 3.5%. Corrigido diario: 39.375%.
- 2026-06-01, tripulante 7: jornada 595 min (09h55), HV 1537 min (25h37). Corrigido diario: 320.208% de HV e `INCONSISTENTE`.
- 2026-06-01 tambem tem HV > jornada para tripulantes 3, 22 e 38.
- 2026-05-23, tripulante 1: jornada 0 min, HV 18 min. Deve marcar `HV_MAIOR_QUE_JORNADA`.
- 2026-01-30 e 2026-01-03 tambem possuem linhas FIRA com jornada 0 min e HV positiva.

Alertas persistidos ja usavam o limite diario correto para `HV_DIARIA` e `FDP_DIARIO`; a divergencia principal era exibicao/rota acumulada.

## Testes adicionados

`worker-airtrust/src/__tests__/frms/fadiga-acumulada-legal.test.ts` cobre:
- jornada 0 min com HV positiva gera `HV_MAIOR_QUE_JORNADA`.
- jornada 0 min com HV 0 nao gera inconsistencia.
- 04h42 / 8h = 58.75%.
- 03h09 / 8h = 39.375%.
- 25h37 / 8h = 320.208% e inconsistencia quando HV > jornada.
- 09h55 / 11h = 90.152%.
- Tabela diaria nao usa divisor mensal de 90h.
- Campo mensal explicito continua usando 90h.

`worker-airtrust/src/__tests__/routes/frms-fadiga-acumulada-contract.test.ts` cobre:
- contrato do `data.resumo` com campos diarios explicitos e campos legacy mantidos como mensal/acumulado.

## Escopo nao alterado

- Nenhum dado FRMS foi corrigido no banco.
- Nao houve mudanca em migrations.
- Nao houve mudanca de layout fora da tabela de detalhe da Fadiga Acumulada.
- Cards de frota mensal continuam usando limite mensal 176h/90h.
- Alertas persistidos nao foram removidos nem reclassificados.

## Auditoria adicional

Achado corrigido:
- `worker-airtrust/src/cron/frms-daily-check.ts` tambem usava `SUM(duracao_minutos)` para fadiga acumulada mensal. Foi alterado para `SUM(duracao_jornada_minutos)`.

Achados revisados sem alteracao:
- `duracao_minutos` restante em simuladores/agenda representa outro dominio.
- `frms.ts` usa `duracao_minutos` apenas no corpo de simulador para criar jornada de simulador, convertido em `duracao_jornada_minutos`.
- Percentuais de dashboard principal, qualificacoes, LMS e simuladores encontrados na busca usam numeradores/denominadores do proprio dominio; nao foi identificado erro analogo obvio dentro do escopo desta correcao.

## Riscos remanescentes

- Dados brutos impossiveis de 2026-06-01 permanecem no D1 e exigem auditoria operacional de origem FIRA/SIGVOOS.
- A origem aparece como `origem='FIRA'` e `registrado_por='SIGVOOS'`, indicando possivel mistura de pipelines/importadores.
- A importacao precisa de hardening para rejeitar ou quarentenar `HV > jornada` antes de persistir ou recalcular acumulados.
- `frms_acumulo_rolling` historico pode conter linhas geradas antes da correcao de dados; nao foi reprocessado.

## Recomendacoes

- Adicionar validacao no importador FIRA/SIGVOOS: `horas_voo_minutos <= duracao_jornada_minutos`, salvo justificativa tecnica documentada.
- Registrar inconsistencias operacionais em fila/auditoria read-ack em vez de exibir como numero normal.
- Reprocessar acumulados somente apos revisao dos dados brutos e autorizacao explicita.
- Separar nomes de colunas UI: `FAT.HV% dia`, `Uso mes HV`, `FAT.JORNADA% dia`, `Uso mes jornada`.

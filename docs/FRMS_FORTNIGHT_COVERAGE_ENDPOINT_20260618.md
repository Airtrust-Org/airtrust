# FRMS Fortnight Coverage Endpoint

## Objetivo

Medir a cobertura atual de `dia_periodo_embarcado` e `total_dias_periodo` no FRMS quinzenal sem alterar dados e sem executar reprocessamento.

## Endpoint

- Path: `GET /api/frms/maintenance/fortnight-coverage`
- Escopo: diagnostico read-only
- Protecao: mesmo guard de maintenance FRMS existente
  - `MAINTENANCE_SECRET` configurado
  - header `x-maintenance-secret` ou `x-airtrust-maintenance`
  - rota restrita ao contexto local/maintenance controlado

## Parametros

- `data_inicio` obrigatorio, formato `YYYY-MM-DD`
- `data_fim` obrigatorio, formato `YYYY-MM-DD`
- `empresa_id` opcional quando o contexto ja resolve a empresa
- `origem` opcional, lista CSV em uppercase, por exemplo `SIGVOOS,FIRA`
- `status` opcional, lista CSV em uppercase, por exemplo `ES,FE`

Limite de janela:

- maximo de 31 dias por chamada

## Interpretacao

- `resumo.pct_cobertura`: percentual de fatorizacoes com `dia_periodo_embarcado` preenchido no recorte.
- `por_origem`: mostra onde a cobertura esta melhor ou pior por fonte de jornada.
- `por_status_jornada`: ajuda a localizar lacunas por tipo de jornada.
- `por_fonte_periodo`: classifica o estado quinzenal agregado no recorte consultado.

## O que significa recuperavel

- `com_frms_escala_quinzenal`: ha escala FRMS cobrindo a data da jornada e o preenchimento tende a depender de reprocessamento/backfill controlado.
- `com_escala_alocacoes`: nao houve match em `frms_escala_quinzenal`, mas existe sinal operacional em `escala_alocacoes`.
- `sem_escala_detectada`: nao foi encontrado suporte de escala suficiente para inferencia segura.

Observacao:

- os buckets de recuperabilidade priorizam `frms_escala_quinzenal` antes de `escala_alocacoes`.

## O que nao significa

- nao corrige cobertura historica
- nao executa reprocessamento
- nao comprova compliance regulatorio
- nao retorna lista nominal de tripulantes

## Limitacoes

- o endpoint mede apenas o estado atual persistido
- a leitura depende do recorte temporal consultado
- o bucket `por_fonte_periodo` reflete a janela pedida, nao um backfill retroativo
- registros sem escala seguem dependendo de cadastro operacional antes de qualquer Onda 2-C

## Proximos passos

- executar chamadas curtas e auditaveis em producao
- consolidar um plano de reprocessamento/backfill controlado para a Onda 2-C
- separar cobertura recuperavel por escala nativa e por alocacao antes de qualquer write

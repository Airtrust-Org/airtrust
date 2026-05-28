# FRMS D0 — Neutralizacao de Semantica Decisoria Legada

Data: 2026-05-28

## 1) Objetivo

Neutralizar legados que poderiam fazer o FRMS parecer uma decisao automatica de aptidao ou de risco antes da Fase D1 read/ack.

## 2) Fontes auditadas

- `worker-airtrust/src/routes/sgso.ts`
- `worker-airtrust/src/routes/sgso-kpi.ts`
- `worker-airtrust/src/routes/frms.ts`
- `src/react-app/pages/Sgso.tsx`
- `src/react-app/pages/SgsoRelato.tsx`
- testes de rotas SGSO/FRMS

## 3) Regra SGSO FRMS < 70%

Antes da D0, `POST /api/sgso/relatos/:id/avaliacao-risco` lia `sgso_relatos.efetividade_cognitiva` e, quando o valor era menor que 70, elevava a probabilidade SGSO em um nivel.

Esse comportamento foi neutralizado:

- a probabilidade informada pelo avaliador nao e mais alterada pelo indice FRMS;
- `elevado_por_fadiga` passa a ser `false` em novas avaliacoes;
- `justificativa_elevacao` passa a ser `null` em novas avaliacoes;
- o indice FRMS permanece no response como `frms_context_indicator`;
- o snapshot da avaliacao inclui o contexto FRMS apenas como dado informativo.

Registros historicos antigos podem continuar exibindo `elevado_por_fadiga` se ja existirem no banco. A D0 nao altera banco e nao faz backfill.

## 4) Endpoint legado `/api/frms/score-atual/:funcionarioid`

O endpoint continua retornando `apto_para_voo` por compatibilidade, mas agora tambem retorna:

- `status_triagem_operacional`;
- `fit_for_duty_indicator: null`;
- `interpretation_warning`;
- `legacy_fields.apto_para_voo`.

Leitura correta:

- `status_triagem_operacional` e informativo.
- `apto_para_voo` e campo legado e nao deve ser usado como decisao automatica.
- nenhuma regra nova de aptidao foi criada.

## 5) UI SGSO

A UI foi ajustada para:

- chamar o dado de `Indice FRMS estimado` ou `FRMS contexto`;
- remover texto dizendo que a probabilidade sera elevada automaticamente;
- explicar que o dado deve ser considerado pelo avaliador sem alterar probabilidade sozinho;
- manter sinalizacao de registros historicos como ajuste legado, quando existente.

## 6) Compatibilidade

- Nenhum endpoint foi removido.
- Nenhuma coluna foi renomeada.
- Nenhum contrato existente foi quebrado.
- Campos legados foram preservados onde consumidores antigos podem depender deles.
- Novos campos sao aditivos.

## 7) Limites da D0

- Nao cria formula nova.
- Nao cria threshold novo.
- Nao implementa D1.
- Nao cria alerta persistente.
- Nao cria mitigacao.
- Nao cria migration.
- Nao altera banco.
- Nao usa quinzena, setores ou sit periods como gatilho.

## 8) Prontidao para D1

Depois da D0, D1 pode avancar apenas como read/ack, desde que:

- use eventos/snapshot existentes como informacao;
- nao crie decisao automatica;
- nao use quinzena ou setores como gatilho;
- nao use `apto_para_voo` como criterio;
- nao reative elevacao automatica SGSO por FRMS.

## 9) Quando usar Opus

Opus continua necessario antes de:

- definir formula de risco;
- definir thresholds persistentes;
- transformar FRMS, quinzena, setores ou sit periods em gatilho;
- automatizar mitigacao;
- classificar tripulante como apto/inapto;
- alterar politica SGSO baseada em indice FRMS.

# FRMS D2 - Governanca de Lifecycle dos Eventos Read/Ack

Data: 2026-05-28

## 1) Objetivo

Definir ciclo de vida operacional para eventos FRMS read/ack sem transformar o fluxo em mitigacao, decisao automatica ou acao corretiva.

## 2) Status permitidos

- `PENDING`: evento dentro da janela operacional, ainda sem ciencia.
- `ACKED`: evento com ciencia registrada.
- `STALE`: evento pendente fora da janela operacional padrao (derivado em runtime).
- `ALL`: filtro de consulta para exibir todos os estados.

`ARCHIVED_VIEW_ONLY` permanece reservado para evolucao futura e nao e persistido na D2.

## 3) O que e pendente

Evento `FRMS_READ_ACK_EVENT` com payload `status = PENDING` e idade dentro da janela operacional.

## 4) O que e ciente

Evento `FRMS_READ_ACK_EVENT` com payload `status = ACKED` apos `POST /api/frms/read-ack/events/:id/ack`.

## 5) O que e antigo (stale)

`STALE` e derivado em leitura para eventos pendentes com `data_operacional` anterior a 7 dias da data corrente.

- Nao muda payload.
- Nao cria escrita adicional.
- Nao altera escala, SGSO ou mitigacao.

## 6) Filtros da D2

`GET /api/frms/read-ack/events` aceita:

- `status=PENDING|ACKED|ALL|STALE`
- `data_inicio`
- `data_fim`
- `funcionario_id`
- `event_type`
- `severity`

## 7) Summary da D2

Retorno inclui:

- `total`
- `displayed`
- `pending`
- `acked`
- `stale`
- `by_type`
- `by_severity`

## 8) Limitacoes

- D2 continua dependente de payload em `frms_fadiga_evento`.
- Nao existe estado de arquivo persistido por coluna dedicada.
- `ARCHIVED_VIEW_ONLY` nao foi implementado como escrita para evitar acoplamento fragil sem schema proprio.

## 9) Por que nao e mitigacao

D2 melhora leitura, filtro e governanca visual de eventos. Nao cria plano de acao, nao gera recomendacao de retirada e nao executa decisao automatica.

## 10) Quando tabela dedicada sera necessaria

Uma tabela dedicada (`frms_read_ack_events`) deve ser considerada quando houver necessidade de:

- lifecycle persistido com estados adicionais;
- arquivamento/log retention formal;
- consulta historica de alto volume sem parse intensivo de `payload_json`;
- politicas de auditoria com campos normalizados.

Essa evolucao exige migration separada, revisao de impacto e rollback explicito.

## 11) Status da Fase D completa

A Fase D completa continua bloqueada para:

- mitigacao automatica;
- thresholds persistentes novos;
- gatilhos por quinzena/setores/sit periods;
- qualquer decisao automatica de aptidao operacional.

## 12) Evolucao D3

A D3 estabelece politica de retencao/arquivamento e recomenda migracao futura para schema dedicado de read/ack, sem aplicar migration nesta etapa.

Referencia: `docs/FRMS_D3_READ_ACK_RETENTION_AND_ARCHIVING.md`.

## 13) Evolucao D3-B/D4

A D3-B/D4 cria migration local e runtime para `frms_read_ack_events`, preservando leitura legado e mantendo `STALE` derivado sem acao operacional.

Referencia: `docs/FRMS_D3B_D4_READ_ACK_DEDICATED_STORAGE.md`.

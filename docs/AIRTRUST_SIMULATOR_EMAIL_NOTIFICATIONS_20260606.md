# AIRTRUST - Simulator Email Notification Preview - 2026-06-06

## Resultado

Classificacao final de notificacao: `DRY-RUN CONCLUÍDO — ESCRITA NÃO EXECUTADA`.

Nenhum email real foi enviado.

## Escopo do preview

Periodo: `2026-06-01` a `2026-07-31`.

Regra aplicada no preview:

- incluir apenas participantes ativos de sessoes planejadas/agendadas;
- excluir sessoes canceladas ou soft-deleted;
- excluir sessoes cross-tenant;
- excluir participantes removidos/cancelados;
- nao enviar para email vazio ou invalido;
- nao reenviar se houver log de envio bem-sucedido;
- nao enviar nada sem idempotencia persistente por sessao e participante.

## Totais de destinatarios

| Grupo | Destinatarios participantes | Sem email | Invalidos |
| --- | ---: | ---: | ---: |
| `PRONTA_PARA_SINCRONIZAR` | 2 | 0 | 0 |
| `SEM_QUALIFICACAO_ASSOCIADA` | 52 | 0 | 0 |
| Total ativo | 54 | 0 | 0 |

Participantes unicos no periodo ativo: `5`.

## Logs existentes

Tabelas de log encontradas:

- `treinamentos_convocacoes_email`
- `treinamentos_convocacoes_email_itens`

Nao foi encontrada tabela especifica de log para email de simulador por sessao.
Tambem nao ha turmas vinculadas (`treinamentos_planejados.sessao_id`) para as sessoes ativas
do periodo. O dry-run retornou `0` itens de log de convocacao para as sessoes analisadas.

Conclusao: `ja_enviados` por log persistente = `0`, mas o sistema nao consegue provar
idempotencia de email direto de simulador porque o servico atual apenas chama o provedor e
retorna status em memoria.

## Destinatarios da sessao pronta

Somente a sessao `75` ficou `PRONTA_PARA_SINCRONIZAR` no dry-run.

| Sessao | Data | Hora | Participante | Funcao | Email mascarado | Envio |
| ---: | --- | --- | ---: | --- | --- | --- |
| 75 | 2026-06-25 | 11:00-13:00 | 3 | PIC | `a***@voecostadosol.com.br` | bloqueado por idempotencia/log |
| 75 | 2026-06-25 | 11:00-13:00 | 66 | SIC | `v***@voecostadosol.com.br` | bloqueado por idempotencia/log |

As outras 52 relacoes participante-sessao estao bloqueadas porque as sessoes foram
classificadas como `SEM_QUALIFICACAO_ASSOCIADA`; o pedido proibe escrita para essa
classificacao.

## Servico de email atual

Arquivo auditado: `worker-airtrust/src/services/simuladores-session-notifications.ts`.

Comportamento observado:

- monta destinatarios a partir de instrutor, examinador e participantes;
- nao limita automaticamente a participantes;
- nao consulta log persistente por `sessao_id + funcionario_id`;
- chama `sendEmail` e retorna `sent`, `skipped` ou `failed` apenas em memoria;
- nao grava provider message id, timestamp, status ou hash de convocacao.

Isso nao satisfaz a regra de idempotencia do pedido para envio real.

## Assunto e corpo previstos

Assunto sugerido pelo pedido:

```text
Convocacao para sessao de simulador - [data]
```

Corpo minimo previsto:

```text
Ola, [nome].

Voce esta convocado(a) para a seguinte sessao de simulador:

Treinamento/sessao: [modelo]
Data: [data]
Horario: [hora inicio] as [hora fim]
Equipamento: [equipamento]
Local: [local, se houver]
Instrutor: [instrutor, se houver]

Acesse o AirTrust para consultar os detalhes e eventuais atualizacoes.

Esta e uma mensagem automatica do AirTrust.
```

O servico atual usa outro assunto (`Sessao de simulador - ...`) e outra redacao
(`Voce esta designado(a)...`). Antes de envio real, a diferenca deve ser aceita ou ajustada.

## Resultado por destinatario

| Resultado | Total |
| --- | ---: |
| ENVIADO | 0 |
| JA_ENVIADO | 0 |
| SEM_EMAIL | 0 |
| EMAIL_INVALIDO | 0 |
| FALHOU | 0 |
| IGNORADO_CANCELADO | 0 |
| IGNORADO_CROSS_TENANT | 0 |
| BLOQUEADO_SEM_QUALIFICACAO_ASSOCIADA | 52 |
| BLOQUEADO_IDEMPOTENCIA_NAO_COMPROVADA | 2 |

## Decisao

Emails enviados: `0`.

A execucao de email real foi bloqueada porque:

1. 52 destinatarios pertencem a sessoes `SEM_QUALIFICACAO_ASSOCIADA`;
2. os 2 destinatarios restantes nao possuem log persistente de idempotencia por sessao;
3. o servico direto inclui instrutor/examinador por regra propria, divergindo do escopo do pedido;
4. nao ha reconciliacao pos-envio possivel sem gravacao persistente de resultado.

Nenhum email duplicado foi enviado. Nenhum email foi enviado para sessao cancelada. Nenhum
email foi enviado para cross-tenant. Nenhum endereco completo foi registrado neste documento.

# FRMS D1 — Eventos Read/Ack Operacionais sem Mitigacao

Data: 2026-05-28

## 1) Objetivo

Implementar o primeiro fluxo operacional de leitura e ciencia do FRMS, limitado a eventos derivados do snapshot operacional.

A D1 permite que a coordenacao visualize eventos, gere registros persistentes e marque ciencia, mantendo trilha minima de auditoria.

## 2) Escopo permitido

- Gerar eventos a partir do `operational-snapshot`.
- Persistir eventos em estrutura FRMS existente.
- Marcar ciencia de evento.
- Registrar usuario, horario e observacao curta opcional.
- Listar pendentes e cientes.
- Preservar tenant safety por `empresa_id`.

## 3) Escopo proibido

- Mitigacao.
- Plano de acao.
- Substituicao ou retirada de escala.
- Decisao automatica.
- Nova formula de risco.
- Novo threshold cientifico.
- Uso de quinzena, setores ou sit periods como gatilho.
- Uso de `apto_para_voo` como criterio.
- Integracao automatica com SGSO.

## 4) Contrato de evento

Contrato logico `FrmsReadAckEvent`:

- `id`
- `empresa_id`
- `data_operacional`
- `funcionario_id`
- `funcionario_nome`
- `event_type`
- `severity`
- `status`: `PENDING` ou `ACKED`
- `source`: `OPERATIONAL_SNAPSHOT`
- `snapshot_status`
- `snapshot_alertas`
- `checkin_status`
- `sleep_data_source`
- `wake_data_source`
- `jornada_data_source`
- `fortnight_status`
- `created_at`
- `acknowledged_at`
- `acknowledged_by`
- `acknowledged_by_name`
- `ack_note`
- `limitations`

Tipos implementados na D1:

- `CHECKIN_PENDENTE`
- `CHECKIN_CRITICO`
- `DADO_ESTIMADO`
- `DADO_INCONSISTENTE`
- `JORNADA_SEM_FATORIZACAO`
- `EFETIVIDADE_BAIXA`
- `OUTRO_CONTEXTUAL`

`QUINZENA_INCOMPLETA` permanece reservado no contrato, mas a D1 nao usa quinzena como gatilho.

## 5) Persistencia

A D1 reutiliza a tabela existente `frms_fadiga_evento`.

Eventos principais usam:

- `tipo = 'FRMS_READ_ACK_EVENT'`
- `payload_json` com o contrato logico acima
- `id` deterministico por empresa, data, funcionario e tipo de evento

Eventos de ciencia usam:

- `tipo = 'FRMS_READ_ACK_ACK'`
- `payload_json` com `event_id`, usuario, timestamp e nota opcional

Nao foi criada migration.

## 6) Regras de geracao

`POST /api/frms/read-ack/events/generate` consulta o snapshot operacional e cria eventos idempotentes.

A geracao nao:

- consulta `/api/frms/score-atual/:funcionarioid`;
- usa `apto_para_voo`;
- altera escala;
- chama SGSO;
- envia notificacao;
- cria mitigacao.

## 7) Regras de ciencia

`POST /api/frms/read-ack/events/:id/ack` marca o evento como `ACKED` e grava um evento de auditoria separado.

O ack:

- registra usuario;
- registra timestamp;
- aceita `ack_note` opcional curta;
- e idempotente quando o evento ja esta ciente;
- nao registra acao operacional.

## 8) Rollback

Como nao ha schema novo, o rollback tecnico e remover:

- rota `frms-read-ack`;
- hook `useFrmsReadAckEvents`;
- painel de ciencia operacional na tela de coordenacao.

Registros historicos com `tipo = 'FRMS_READ_ACK_EVENT'` e `tipo = 'FRMS_READ_ACK_ACK'` podem permanecer como trilha historica inerte. Se for exigida limpeza futura, deve ser feita por migration/rotina explicitamente aprovada.

## 9) Por que nao e mitigacao

A D1 registra apenas leitura e ciencia. Ela nao recomenda acao, nao atribui responsabilidade operacional, nao cria plano, nao muda probabilidade SGSO e nao altera disponibilidade de tripulante.

## 10) Proximos passos bloqueados por Opus

Opus continua obrigatorio antes de:

- definir formula de risco;
- definir thresholds persistentes;
- transformar quinzena, setores ou sit periods em gatilho;
- automatizar mitigacao;
- classificar tripulante como apto/inapto;
- conectar read/ack a qualquer consequencia operacional automatica.

## 11) Evolucao D2

A D2 adiciona governanca de lifecycle sem mudar a natureza do fluxo:

- filtros `PENDING`, `ACKED`, `STALE`, `ALL`;
- `STALE` derivado em runtime (sem escrita nova);
- summary por tipo e severidade;
- separacao visual entre pendentes e cientes.

Referencia: `docs/FRMS_D2_READ_ACK_LIFECYCLE.md`.

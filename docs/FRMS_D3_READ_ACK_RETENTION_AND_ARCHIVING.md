# FRMS D3 - Retencao, Arquivamento e Schema Dedicado para Read/Ack

Data: 2026-05-28

## 1) Objetivo

Definir governanca de ciclo de vida de medio/longo prazo para eventos FRMS de read/ack sem introduzir mitigacao, decisao automatica, score novo ou threshold novo.

## 2) Situacao atual (D1/D2)

- D1/D2 estao funcionais e publicados.
- Persistencia atual reutiliza `frms_fadiga_evento`.
- Eventos principais usam `tipo = 'FRMS_READ_ACK_EVENT'`.
- Trilha de ciencia usa `tipo = 'FRMS_READ_ACK_ACK'`.
- Ack atualiza o payload do evento original (`status = ACKED`) e tambem grava registro de auditoria separado.

## 3) Por que `frms_fadiga_evento` foi aceitavel em D1/D2

- Permitiu entrega rapida sem migration.
- Manteve compatibilidade com padrao de eventos FRMS existente.
- Cobriu idempotencia, tenant isolation e trilha minima de auditoria.
- Foi suficiente para volume inicial e validacao funcional.

## 4) Por que tabela dedicada sera melhor para retencao

Uso indefinido de `frms_fadiga_evento` para read/ack tende a gerar fragilidade:

- consultas dependem de `json_extract(payload_json, ...)` para filtros centrais;
- indice atual (`empresa_id`, `tipo`, `created_at`) nao cobre filtros por `status`, `event_type`, `severity`, `funcionario_id`, `data_operacional`;
- estado do evento fica dentro de JSON, dificultando politicas de arquivamento por coluna;
- alto volume aumenta custo de parse JSON e manutencao de queries;
- auditoria e exportacao estruturada ficam mais caras.

## 5) Politica recomendada (sem exclusao automatica nesta fase)

### 5.1 Janela operacional

- `PENDING` visivel por padrao na UI para os ultimos 7 dias.
- `STALE` continua derivado em runtime; nao persistir estado novo nesta fase.

### 5.2 Janela de historico na UI

- `ACKED` exibivel por padrao por 30 dias.
- Filtro expandido (ex.: 90 dias) apenas em visao historica/auditoria.

### 5.3 Retencao auditavel

- Manter historico read/ack por prazo maior definido pela empresa/compliance (recomendacao inicial: 12 meses).
- Sem purge automatico na D3.
- Qualquer purge futuro exige politica operacional aprovada e rotina dedicada.

### 5.4 Criterios de arquivamento logico (futuro)

- Elegivel para arquivamento logico quando `ACKED` e fora da janela de historico operacional.
- Arquivamento deve preservar rastreabilidade de `event_id`, ator, horario e nota.
- Nao deve remover trilha de auditoria.

### 5.5 Visibilidade de arquivados

- Arquivados devem ficar visiveis para perfis de coordenacao/gestao/admin em tela de historico.
- Usuario comum deve continuar restrito ao proprio escopo.

### 5.6 Exportacao futura

- Exportar no minimo: `empresa_id`, `data_operacional`, `funcionario_id`, `event_type`, `severity`, `lifecycle_status`, `created_at`, `acknowledged_at`, `acknowledged_by`, `ack_note`, `archive_reason`.

## 6) Schema dedicado futuro proposto

### 6.1 Tabela principal `frms_read_ack_events`

Campos propostos:

- `id TEXT PRIMARY KEY`
- `empresa_id INTEGER NOT NULL`
- `data_operacional TEXT NOT NULL`
- `funcionario_id INTEGER NOT NULL`
- `event_type TEXT NOT NULL`
- `severity TEXT NOT NULL`
- `source TEXT NOT NULL`
- `lifecycle_status TEXT NOT NULL DEFAULT 'PENDING'`
- `snapshot_status TEXT`
- `snapshot_alertas_json TEXT`
- `data_sources_json TEXT`
- `limitations_json TEXT`
- `event_hash TEXT`
- `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `created_by INTEGER`
- `acknowledged_at TEXT`
- `acknowledged_by INTEGER`
- `ack_note TEXT`
- `archived_at TEXT`
- `archived_by INTEGER`
- `archive_reason TEXT`
- `schema_version INTEGER NOT NULL DEFAULT 1`

Indices propostos:

- `(empresa_id, data_operacional)`
- `(empresa_id, lifecycle_status)`
- `(empresa_id, funcionario_id, data_operacional)`
- `(empresa_id, event_type, severity)`
- indice unico de deduplicacao por hash/evento-dia, se adotado (ex.: `(empresa_id, event_hash, data_operacional)`).

### 6.2 Tabela opcional de auditoria `frms_read_ack_event_audit`

Campos propostos:

- `id TEXT PRIMARY KEY`
- `empresa_id INTEGER NOT NULL`
- `event_id TEXT NOT NULL`
- `action TEXT NOT NULL`
- `actor_user_id INTEGER`
- `action_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `note TEXT`
- `payload_before_json TEXT`
- `payload_after_json TEXT`

Indices propostos:

- `(empresa_id, event_id, action_at)`
- `(empresa_id, action, action_at)`

## 7) Rollback conceitual

Para migracao futura dedicada:

- rollback logico deve manter tabela legada intacta;
- sem `DROP` da `frms_fadiga_evento` na primeira fase;
- desativacao por feature flag/roteamento de leitura para legado em caso de problema;
- rollback operacional documentado antes de qualquer aplicacao em producao.

## 8) Estrategia de migracao futura (D3-B)

Recomendacao de fases:

1. Criar tabela dedicada + indices (sem backfill).
2. Escrita dupla opcional controlada (legado + novo) por janela curta.
3. Migrar leitura da UI/API para tabela dedicada.
4. Congelar escrita legado para novos eventos D1/D2.
5. Avaliar backfill historico com job especifico aprovado.

## 9) Estrategia de backfill futura (somente proposta)

- Backfill em lotes por `empresa_id` e faixa de data.
- Validacao por contagem, hash e amostragem.
- Sem alteracao destrutiva no legado durante backfill.
- Rotina pausavel e reentrante.

## 10) Impacto em UI

- Filtros D2 permanecem os mesmos (`PENDING`, `ACKED`, `ALL`, `STALE`).
- Mudanca principal fica na fonte de dados e desempenho de consulta.
- Historico/arquivados pode ganhar aba dedicada sem mudar semantica de "ciencia operacional".

## 11) Impacto em auditoria

- Melhora rastreabilidade com campos normalizados de lifecycle/arquivo.
- Reduz dependencia de parse JSON para relatorios.
- Facilita exportacao e verificacao de integridade.

## 12) O que continua proibido

- Mitigacao automatica.
- Decisao automatica de escala/aptidao.
- Uso de `apto_para_voo` como decisao.
- Gatilho por quinzena/setores/sit periods.
- Formula nova de risco ou threshold novo.
- Integracao automatica com SGSO para acao operacional.

## 13) Status da Fase D completa

A Fase D completa continua bloqueada. D1/D2 permanecem limitadas a leitura/ciencia operacional.

## 14) Opus

Opus nao e necessario para D3 de governanca/schema.
Opus continua obrigatorio antes de formula de risco, thresholds persistentes, automacao decisoria ou mitigacao automatica.

## 15) Decisao desta fase

- D3 entregue como **documento + schema proposto**.
- **Sem migration criada** nesta fase.
- Recomendado abrir D3-B apenas para migration dedicada revisada, com plano de rollout e rollback antes de qualquer aplicacao.

## 16) Evolucao D3-B/D4

A D3-B/D4 materializa o desenho em migration local e runtime para tabela dedicada, mantendo leitura compativel do legado e sem backfill automatico inicial.

Referencia: `docs/FRMS_D3B_D4_READ_ACK_DEDICATED_STORAGE.md`.

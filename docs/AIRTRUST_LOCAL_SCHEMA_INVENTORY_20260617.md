# AirTrust Local Schema Inventory

Data: 2026-06-17

Fonte:

- snapshot D1 local: `worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite`

Escopo:

- somente inventario estrutural;
- sem leitura de payloads sensiveis;
- sem DML;
- sem migration;
- sem acesso a producao.

## Resumo

- `198` tabelas
- `9` views
- artefatos residuais detectados no snapshot: `_backup_qh_tmp`, `qualificacoes_tipos_backup_0063`, `qualificacoes_tipos_backup_20251128`, `qualificacoes_historico_v`

## Drift confirmado contra nomes usados por validacoes antigas

| Referencia antiga | Status local | Nome confirmado |
| --- | --- | --- |
| `frms_jornadas` | inexistente | `frms_jornada` |
| `simulador_sessoes` | inexistente | `sessoes_simulador` (`VIEW`) |
| `simulador_sessao_participantes` | inexistente | `sessoes_participantes` |
| `cadastro_manobras` | inexistente | `manobras` |
| `lms_cursos` | nao encontrado no snapshot | `SKIPPED_SCHEMA_UNCONFIRMED` |
| `lms_matriculas` | nao encontrado no snapshot | `SKIPPED_SCHEMA_UNCONFIRMED` |

## Objetos principais para Onda 0/1

### `modelos_sessao`

Colunas relevantes:

- `id`
- `codigo`
- `ativo`
- `deleted_at`
- `empresa_id`

Total de linhas no snapshot: `35`

### `modelos_sessao_manobras`

Colunas relevantes:

- `id`
- `modelo_id`
- `manobra_id`
- `ordem`
- `deleted_at`

Observacoes:

- existe `UNIQUE(modelo_id, manobra_id)`
- nao existe `UNIQUE(modelo_id, ordem)`

Total de linhas no snapshot: `676`

### `manobras`

Colunas relevantes:

- `id`
- `codigo`
- `nome`
- `categoria`
- `deleted_at`

Observacao:

- o snapshot local nao contem `empresa_id`; por isso o check cross-tenant `I4` fica `SKIPPED_SCHEMA_UNCONFIRMED`

### `fichas_sessao`

Colunas relevantes:

- `id`
- `template_id`
- `status`
- `data_conclusao`
- `empresa_id`
- `deleted_at`

Total de linhas no snapshot: `78`

### `fichas_sessao_manobras`

Colunas relevantes:

- `id`
- `ficha_id`
- `codigo`
- `ordem`
- `resultado`
- `deleted_at`

Total de linhas no snapshot: `1252`

### `qualificacoes_historico`

Colunas relevantes:

- `id`
- `funcionario_id`
- `qualificacao_id`
- `qualificacao_codigo`
- `empresa_id`
- `status`
- `data_conclusao`
- `deleted_at`

Total de linhas no snapshot: `579`

### `funcionarios`

Colunas relevantes:

- `id`
- `empresa_id`
- `status`
- `ativo`
- `deleted_at`

### `frms_jornada`

Colunas relevantes:

- `id`
- `tripulante_id`
- `data`
- `origem`
- `status`
- `deleted_at`

Total de linhas no snapshot: `337`

### `escalas_mensais`

Colunas relevantes:

- `id`
- `empresa_id`
- `status`
- `deleted_at`

Total de linhas no snapshot: `38`

### `escala_alocacoes`

Colunas relevantes:

- `id`
- `escala_id`
- `funcionario_id`
- `data_inicio`
- `data_fim`
- `deleted_at`

Total de linhas no snapshot: `116`

### `sessoes_simulador` e `sessoes_participantes`

`sessoes_simulador` e uma `VIEW` sobre `simulador_agendamentos`.

Colunas relevantes da view:

- `id`
- `data_sessao`
- `hora_inicio`
- `status`
- `aluno_id`
- `instrutor_id`

Colunas relevantes de `sessoes_participantes`:

- `id`
- `sessao_id`
- `funcionario_id`
- `funcao`
- `status`
- `deleted_at`

Total de linhas em `sessoes_participantes`: `120`

## Conclusao operacional

O fixture local e suficiente para validar Simuladores, Qualificacoes, FRMS e Escalas em modo read-only. LMS permanece inconclusivo neste snapshot e deve seguir como `SKIPPED_SCHEMA_UNCONFIRMED` ate existir fixture local confiavel com essas tabelas.

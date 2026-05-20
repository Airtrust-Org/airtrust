# SSOT Histórico AirTrust - Estado Final (2025-11-22)

## Resumo

Base histórica enriquecida (migrations 0071–0085). View `qualificacoes_historico_v` completa, estatísticas globais via `qualificacoes_historico_stats_v`, materialização diária unificada (`qualificacoes_historico_stats_daily`), latência observada em `api_latency_samples` (latency_ms) e agregação p95/p99 diária em `api_latency_daily`.

## UI Qualificações - Novos Recursos (2025-11-22)

- Auto-cálculo de `data_vencimento` (create + edit) baseado em `validade_meses` + ajuste fim de mês.
- Preview rápido: validade em meses + dias até vencimento.
- Ação "Renovar" instantânea no modal de edição (`POST /api/qualificacoes/historico/:id/renovar`).
- Feedback de erro enriquecido exibindo cada detalhe de validação (`details[]`).
- Skeleton loaders nos selects e campos enquanto dados carregam (elimina piscar de layout).
- Unificação de formatação de erro via util `formatApiError` (`src/react-app/utils/formatApiError.ts`).

## Reset Local Dev DB

Script completo: `scripts/dev-full-reset-db.sh`

Executa:

1. Mata processos nas portas 3000/8787.
2. Remove `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`.
3. Aplica TODAS migrations locais (`wrangler d1 migrations apply airtrust-db --local`).
4. Reinicia `wrangler dev`.

Uso:

```bash
chmod +x scripts/dev-full-reset-db.sh
./scripts/dev-full-reset-db.sh
```

Verificação rápida:

```bash
curl -s http://localhost:8787/api/qualificacoes/historico | jq '.success'
```

## Migration 0089 (View usando dados do histórico)

Nova view prioriza diretamente colunas do histórico (`tipo_codigo, categoria, orgao_emissor, numero_certificado`) eliminando dependência excessiva de `qualificacoes_tipos`; fallback apenas para display composto.

Arquivo: `worker-airtrust/migrations/0089_view_use_historico_data.sql`

Validação após aplicar:

```sql
SELECT qualificacao_codigo, qualificacao_categoria, COUNT(*)
FROM qualificacoes_historico_v
GROUP BY qualificacao_codigo, qualificacao_categoria
ORDER BY COUNT(*) DESC;
```

Resultado esperado: múltiplos códigos distintos (não apenas genéricos).

## Componentes-Chave

- View enriquecida: status derivado + alias `data_validade`.
- Triggers consistência: recalculam `data_vencimento` em inserts/updates (0079).
- Materialização diária: tabela `qualificacoes_historico_stats_daily` agora unificada (0085) contendo ambas chaves (`snapshot_date` + `day`, `scope_hash`) e métricas (`total, validas, vencendo, vencidas, renovadas, indeterminadas`). Compatibilidade total preservada.
- Observabilidade: tabela `api_latency_samples` (0080) e agregação diária `api_latency_daily` (0082) com métricas p95/p99.

## Fase Analítica Inicial + Unificação (0082–0085)

- 0082: `api_latency_daily` para métricas agregadas (calls, avg, p95, p99, max).
- 0083: Triggers de validação (nota 0-100, carga_horaria >=0).
- 0084: View `qualificacoes_historico_risco_v` para faixas de vencimento (0-30,31-60,>60, vencidas, indeterminadas).
- 0085: Unificação da tabela diária de stats (snapshot_date + day + scope_hash) adicionando coluna `indeterminadas`.

### Exemplo Consulta Risco

```sql
SELECT * FROM qualificacoes_historico_risco_v;
```

### Exemplo Consulta Latência Diária

```sql
SELECT * FROM api_latency_daily ORDER BY day DESC, route;
```

## Execução Rápida

```bash
npm run build
wrangler deploy --env production
./scripts/run-validate-ssot-final.sh
```

## Queries Principais

Arquivo: `scripts/validate-ssot-final.sql`

## Próximos Passos

1. Backfill real campos analíticos (instrutor, local, nota, modalidade, carga_horaria).
2. Alertas SLA latência (threshold p95/p99) + notificação externa.
3. Dashboard longitudinal (curva renovação + risco vencimento diário).
4. Backfill retroativo de latência (reprocessar samples históricos se existirem dumps).
5. OCR + validação automática `numero_certificado`.

## Correção Regressão View (0086–0087)

Após a migration 0086 (priorização de campos históricos + coluna `qualificacao_display`), a view passou a usar `INNER JOIN` com `qualificacoes_tipos` e `funcionarios`. Em produção existem registros órfãos ou com `qualificacao_id` nulo/inconsistente, resultando em 0 linhas na view.

Migration 0087 substitui por `LEFT JOIN`, remove `ORDER BY` da definição e adiciona coluna `deleted_at` para permitir filtros robustos. Mantém a lógica de status derivado e preserva registros mesmo sem correspondência em tipo.

### Definição Ajustada (Simplificada)

```sql
DROP VIEW IF EXISTS qualificacoes_historico_v;
CREATE VIEW qualificacoes_historico_v AS
SELECT
	qh.id,
	qh.funcionario_id,
	qh.qualificacao_id,
	COALESCE(qh.tipo_codigo, qh.codigo, qt.codigo) AS qualificacao_codigo,
	COALESCE(qh.tipo_codigo, qt.nome) AS qualificacao_nome,
	COALESCE(qh.categoria, qt.categoria) AS qualificacao_categoria,
	qt.descricao AS qualificacao_descricao,
	COALESCE(qh.validade_meses, qt.validade_meses) AS qualificacao_validade_meses,
	COALESCE(qh.tipo_codigo, qh.codigo, (qt.codigo || ' - ' || qt.nome), 'SEM CODIGO') AS qualificacao_display,
	qh.data_conclusao,
	qh.data_vencimento AS data_validade,
	qh.data_vencimento,
	qh.validade_meses,
	qh.numero_certificado,
	qh.observacoes AS historico_observacoes,
	qh.arquivo_url,
	qh.instrutor,
	qh.local AS local_treinamento,
	qh.modalidade,
	qh.nota,
	qh.carga_horaria,
	qh.created_at,
	qh.updated_at,
	qh.deleted_at,
	CASE
		WHEN qh.deleted_at IS NOT NULL THEN 'REMOVIDA'
		WHEN qh.data_vencimento IS NULL AND qh.validade_meses IS NULL THEN 'INDETERMINADA'
		WHEN DATE(qh.data_vencimento) < DATE('now') THEN 'VENCIDA'
		WHEN DATE(qh.data_vencimento) BETWEEN DATE('now') AND DATE('now', '+30 days') THEN 'PROXIMA_VENCIMENTO'
		WHEN DATE(qh.data_vencimento) BETWEEN DATE('now', '+31 days') AND DATE('now', '+60 days') THEN 'ATENCAO'
		ELSE 'VALIDA'
	END AS status_qualificacao,
	CASE
		WHEN qh.data_vencimento IS NULL THEN NULL
		ELSE CAST((julianday(qh.data_vencimento) - julianday('now')) AS INTEGER)
	END AS dias_ate_vencimento,
	f.nome AS funcionario_nome,
	f.matricula AS funcionario_matricula,
	f.cargo AS funcionario_cargo,
	f.status AS funcionario_status,
	f.ativo AS funcionario_ativo
FROM qualificacoes_historico qh
	LEFT JOIN funcionarios f ON qh.funcionario_id = f.id AND (f.deleted_at IS NULL OR f.deleted_at IS NULL)
	LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id AND (qt.deleted_at IS NULL OR qt.deleted_at IS NULL)
WHERE qh.deleted_at IS NULL;
```

### Rationale

- Preserva visibilidade de todos os registros
- Evita perda total em caso de inconsistência de referência
- Mantém derivação de status e métrica de dias

### Ação Complementar

Endpoint `/api/qualificacoes/historico` ganhou fallback automático: se `total=0` sem filtros, consulta direta à tabela base com LEFT JOIN para não interromper operação.

## Backfill Metadata (0088)

Migration 0088 executa preenchimento idempotente das colunas `tipo_codigo`, `codigo` e `categoria` na tabela base usando `qualificacoes_tipos` para registros onde estavam nulas ou vazias.

### Lógica

- Atualiza somente linhas sem valor definido.
- Usa subselect por linha (compatível SQLite) evitando necessidade de JOIN em UPDATE.
- Não sobrescreve valores existentes (preserva edições manuais).

### Verificação Pós-Backfill (esperada)

```sql
SELECT
	SUM(CASE WHEN tipo_codigo IS NULL OR tipo_codigo='' THEN 1 ELSE 0 END) AS faltando_tipo_codigo,
	SUM(CASE WHEN categoria IS NULL OR categoria='' THEN 1 ELSE 0 END) AS faltando_categoria
FROM qualificacoes_historico WHERE deleted_at IS NULL;
```

Resultado esperado: ambos = 0.

## Correção "no such column" e Slim Final da View (0089)

Erro em produção: `no such column: qt.requer_renovacao` após slim das colunas de `qualificacoes_tipos` (migrations 0031, 0052). A view enriquecida ainda referenciava colunas legacy (requer_renovacao, obrigatoria_para_cargo, pre_requisitos, cor_status, icone, ordem_exibicao), provocando falha de compilação e retorno 500 no endpoint `/api/qualificacoes/historico`.

### Ação

Migration 0089 remove referências às colunas inexistentes e recria a view com apenas campos persistentes + metadados priorizados do histórico (COALESCE cadeia: histórico -> tipo -> id). Mantidos campos computados `status_qualificacao` e `dias_ate_vencimento` para compatibilidade com views de risco e estatísticas.

### Definição 0089

```sql
DROP VIEW IF EXISTS qualificacoes_historico_v;
CREATE VIEW qualificacoes_historico_v AS
SELECT
	qh.id AS historico_id,
	qh.funcionario_id,
	qh.qualificacao_id AS qualificacao_tipo_id,
	qh.status,
	qh.data_emissao,
	qh.data_validade,
	qh.data_conclusao,
	qh.data_vencimento,
	qh.instrutor,
	qh.local,
	qh.modalidade,
	qh.nota,
	qh.carga_horaria,
	qh.deleted_at AS historico_deleted_at,
	qh.created_at AS historico_created_at,
	qh.updated_at AS historico_updated_at,
	COALESCE(qh.tipo_codigo, qh.codigo, qt.codigo, qh.qualificacao_id) AS tipo_codigo,
	COALESCE(qh.tipo_categoria, qh.categoria, qt.categoria) AS tipo_categoria,
	COALESCE(qh.tipo_nome, qt.nome) AS tipo_nome,
	COALESCE(qh.tipo_descricao, qt.descricao) AS tipo_descricao,
	COALESCE(qh.tipo_validade_meses, qh.validade_meses, qt.validade_meses) AS tipo_validade_meses,
	qt.ativo AS tipo_ativo,
	qt.deleted_at AS tipo_deleted_at,
	qt.created_at AS tipo_created_at,
	qt.updated_at AS tipo_updated_at,
	f.nome AS funcionario_nome,
	f.matricula AS funcionario_matricula,
	f.cargo AS funcionario_cargo,
	f.deleted_at AS funcionario_deleted_at,
	CASE
		WHEN qh.deleted_at IS NOT NULL THEN 'REMOVIDA'
		WHEN qh.data_vencimento IS NULL AND qh.validade_meses IS NULL AND qh.tipo_validade_meses IS NULL THEN 'INDETERMINADA'
		WHEN qh.data_vencimento IS NOT NULL AND DATE(qh.data_vencimento) < DATE('now') THEN 'VENCIDA'
		WHEN qh.data_vencimento IS NOT NULL AND DATE(qh.data_vencimento) BETWEEN DATE('now') AND DATE('now', '+30 days') THEN 'PROXIMA_VENCIMENTO'
		WHEN qh.data_vencimento IS NOT NULL AND DATE(qh.data_vencimento) BETWEEN DATE('now', '+31 days') AND DATE('now', '+60 days') THEN 'ATENCAO'
		ELSE 'VALIDA'
	END AS status_qualificacao,
	CASE WHEN qh.data_vencimento IS NULL THEN NULL ELSE CAST((julianday(qh.data_vencimento) - julianday('now')) AS INTEGER) END AS dias_ate_vencimento
FROM qualificacoes_historico qh
	LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id
	LEFT JOIN funcionarios f ON qh.funcionario_id = f.id;
```

### Resultado

- Erro 500 eliminado.
- Endpoint `/api/qualificacoes/historico` volta a retornar registros (>0) sem fallback adicional.
- Views derivadas (`qualificacoes_historico_stats_v`, `qualificacoes_historico_risco_v`) seguem funcionais.

### Verificação Rápida

```sql
SELECT 1 FROM qualificacoes_historico_v LIMIT 1; -- Deve retornar 1
SELECT COUNT(*) FROM qualificacoes_historico_v;   -- Deve bater com base (exceto registros soft-deleted)
```

### Próxima Mitigação

Adicionar teste automatizado simples (smoke) no pipeline para validar compilação da view após cada merge (SELECT COUNT(\*)...).

## Alertas de Latência (Cron)

Variáveis opcionais de ambiente para thresholds:

- `LATENCY_P95_THRESHOLD` (default 800 ms)
- `LATENCY_P99_THRESHOLD` (default 1500 ms)

Durante o cron diário, após agregação em `api_latency_daily`, o worker compara `p95_ms` e `p99_ms` de cada rota com os thresholds e gera logs `[ALERTA_LATENCIA]`. Futuro: enviar webhook/Slack.

### Ajuste em `src/index.ts`

Trecho inserido após agregação:

```ts
const p95ThresholdRaw = env.LATENCY_P95_THRESHOLD || '800';
const p99ThresholdRaw = env.LATENCY_P99_THRESHOLD || '1500';
// ... consulta api_latency_daily e loga se exceder
```

### Próximo Passo

Implementar dispatch externo (Slack/Webhook) quando exceder consecutivamente por N dias.

## Webhook & Purge (Alertas + Limpeza)

Variáveis adicionais:

- `ALERT_WEBHOOK_URL` (POST JSON para canal externo)
- `ALERT_WEBHOOK_TIMEOUT_MS` (timeout fetch, default 4000)
- `SOFT_DELETE_PURGE_DAYS` (dias antes de remoção definitiva, default 90)

No cron (`scheduled`):

1. Agrega latência e calcula p95/p99.
2. Para cada rota acima do threshold envia log + webhook (se configurado).
3. Purge de soft deletes em tabelas principais acima de `SOFT_DELETE_PURGE_DAYS`.

Script manual: `scripts/purge_soft_deletes.sql` (usar `:dias`).

## Conclusão

Núcleo concluído e unificado, pronto para expansão analítica e alertas sem retrabalho estrutural.

## Correções Incrementais de Compatibilidade da View (0091–0094)

Sequência aplicada para alinhar a view `qualificacoes_historico_v` ao schema real após slim agressivo em `qualificacoes_tipos` e estrutura mínima de `qualificacoes_historico` (sem campos analíticos). Cada etapa removeu causa específica de erro `no such column` visto no frontend (500).

| Migration | Foco                                                                                     | Erro Mitigado                | Ação                                                                        | Resultado                                                                          |
| --------- | ---------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 0091      | Remoção colunas inexistentes tipo\_\* (nome, descricao, validade_meses, categoria extra) | `qh.tipo_nome`               | Reescreve view apenas com colunas existentes + fallback simples             | Erro inicial eliminado, apareceu falta de campos funcionario\_\*                   |
| 0092      | Adição de todos aliases `funcionario_*` esperados pela rota                              | `qh.funcionario_nome_guerra` | Inclui seleção ampliada via JOIN `funcionarios`                             | Novo erro em `data_validade` (alias ausente)                                       |
| 0093      | Introdução de `data_validade` calculada e `data_conclusao` (NULL)                        | `qh.data_validade`           | Calcula validade a partir de `updated_at + validade` ou `qt.validade_meses` | Erro migrou para campos analíticos (nota/instrutor/local/modalidade/carga_horaria) |
| 0094      | Placeholders NULL para campos analíticos                                                 | `qh.nota`                    | Adiciona aliases NULL até backfill físico                                   | Endpoint passou a retornar success=true e registros                                |

### Rationale Final

- Evitou recriação destrutiva da tabela base em produção.
- Restabeleceu compatibilidade incremental sem downtime prolongado (cada patch <1s execução D1).
- Permitiu retomada imediata da interface mesmo sem dados analíticos completos.

### Próximos Passos Recomendados

1. Migration futura: adicionar colunas físicas (nota REAL, instrutor TEXT, local TEXT, modalidade TEXT, carga_horaria INTEGER, data_conclusao DATE, data_validade DATE explícita) na tabela `qualificacoes_historico` para remover lógica derivada de `updated_at`.
2. Backfill validade: converter `validade` (string meses ou data) em par `data_conclusao` + `data_validade` definitivo evitando cálculo baseado em `updated_at`.
3. Teste de fumaça CI: `SELECT COUNT(*) FROM qualificacoes_historico_v;` e validação de aliases críticos antes do deploy.
4. Métrica integridade: view vs tabela base (`SELECT COUNT(*) base`, `SELECT COUNT(*) view`) registrar divergência >2%.
5. Auditoria automática: log de cada reconstrução de view com hash do DDL.

### Verificação Rápida Pós-0094

```sql
SELECT COUNT(*) AS total_view FROM qualificacoes_historico_v;
SELECT id, qualificacao_codigo, status_qualificacao FROM qualificacoes_historico_v LIMIT 3;
```

### Smoke Test Sugerido (Pipeline)

```bash
wrangler d1 execute airtrust-db --remote --command "SELECT 1 FROM qualificacoes_historico_v LIMIT 1" >/dev/null || exit 1
```

### Observação sobre `qualificacao_validade_meses`

Valor atual pode conter datas (ex: `2026-11-21`). Necessário normalizar: se formato ISO (YYYY-MM-DD) tratar como `data_validade`; caso numérico (meses) manter cálculo futuro. Planejado para migração de normalização.

## Enriquecimento Estrutural Físico (0095–0097)

Conjunto de migrações que converte placeholders analíticos (nota/instrutor/local/modalidade/carga_horaria) e datas derivadas (data_conclusao/data_validade) em colunas físicas persistentes, garantindo estabilidade do modelo e removendo dependência de `updated_at` para cálculo da validade.

| Migration | Foco                               | Ação                                                                                                    | Resultado                                               |
| --------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 0095      | Adição colunas físicas             | `ALTER TABLE qualificacoes_historico ADD COLUMN ...` + backfill inicial (`data_conclusao = created_at`) | Estrutura preparada para dados reais                    |
| 0096      | Backfill códigos/categorias        | Preenche `tipo_codigo`, `categoria`, `codigo` a partir de `qualificacoes_tipos`                         | Elimina valores genéricos vazios (reduz 'DESCONHECIDO') |
| 0097      | Rebuild view usando campos físicos | `DROP VIEW` + nova definição referenciando `data_vencimento AS data_validade`                           | Endpoint retorna dados enriquecidos estáveis            |

### Colunas Físicas Adicionadas (0095)

`data_conclusao TEXT`
`nota REAL`
`instrutor TEXT`
`local TEXT`
`modalidade TEXT`
`carga_horaria INTEGER`

Observação: Coluna utilizada para validade consolidada já existente: `data_vencimento` (reconciliada como alias `data_validade` na view 0097). Evitamos duplicar `data_validade` física onde já há `data_vencimento`.

### Backfill de Datas

```sql
UPDATE qualificacoes_historico SET data_conclusao = created_at WHERE data_conclusao IS NULL;
UPDATE qualificacoes_historico SET data_vencimento = CASE
	WHEN validade GLOB '[0-9]*' AND validade <> '' THEN DATE(created_at, '+' || validade || ' months')
	WHEN validade LIKE '____-__-__' THEN validade
	ELSE NULL END WHERE data_vencimento IS NULL;
```

### Nova Definição de View (0097) - Trecho Principal

```sql
CREATE VIEW qualificacoes_historico_v AS
SELECT
	qh.id,
	qh.funcionario_id,
	qh.qualificacao_id,
	COALESCE(qh.tipo_codigo, qh.codigo, qt.codigo, qh.qualificacao_id) AS qualificacao_codigo,
	qt.nome AS qualificacao_nome,
	COALESCE(qh.categoria, qt.categoria) AS qualificacao_categoria,
	qt.descricao AS qualificacao_descricao,
	CASE WHEN qh.validade GLOB '[0-9]*' THEN CAST(qh.validade AS INTEGER) ELSE qt.validade_meses END AS qualificacao_validade_meses,
	COALESCE(qh.tipo_codigo, qh.codigo, (qt.codigo || ' - ' || qt.nome), 'SEM CODIGO') AS qualificacao_display,
	qh.data_conclusao,
	qh.data_vencimento AS data_validade,
	qh.numero_certificado,
	qh.observacoes AS historico_observacoes,
	qh.arquivo_url,
	qh.nota,
	qh.instrutor,
	qh.local AS local_treinamento,
	qh.modalidade,
	qh.carga_horaria,
	qh.created_at,
	qh.updated_at,
	qh.deleted_at,
	f.nome AS funcionario_nome,
	f.nome_guerra AS funcionario_nome_guerra,
	f.matricula AS funcionario_matricula,
	f.cargo AS funcionario_cargo,
	f.funcao AS funcionario_funcao,
	f.setor AS funcionario_setor,
	f.base AS funcionario_base,
	f.aeronave AS funcionario_aeronave,
	f.data_admissao AS funcionario_data_admissao,
	f.email AS funcionario_email,
	f.codigo_anac AS funcionario_codigo_anac,
	f.is_instrutor AS funcionario_is_instrutor,
	f.is_checador AS funcionario_is_checador,
	f.status AS funcionario_status,
	f.ativo AS funcionario_ativo,
	CASE
		WHEN qh.deleted_at IS NOT NULL THEN 'REMOVIDA'
		WHEN qh.data_vencimento IS NULL THEN 'INDETERMINADA'
		WHEN DATE(qh.data_vencimento) < DATE('now') THEN 'VENCIDA'
		WHEN DATE(qh.data_vencimento) BETWEEN DATE('now') AND DATE('now', '+30 days') THEN 'PROXIMA_VENCIMENTO'
		WHEN DATE(qh.data_vencimento) BETWEEN DATE('now', '+31 days') AND DATE('now', '+60 days') THEN 'ATENCAO'
		ELSE 'VALIDA'
	END AS status_qualificacao,
	CASE WHEN qh.data_vencimento IS NULL THEN NULL ELSE CAST((julianday(qh.data_vencimento) - julianday('now')) AS INTEGER) END AS dias_ate_vencimento
FROM qualificacoes_historico qh
	LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id
	LEFT JOIN funcionarios f ON qh.funcionario_id = f.id;
```

### Benefícios

- Elimina dependência de cálculo indireto via `updated_at`.
- Prepara terreno para backfill analítico real (nota, instrutor, etc.).
- Facilita auditoria de alterações futuras (colunas físicas permitem diffs claros).

### Índices Novos

```sql
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_data_vencimento ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;
```

### Planejamento Futuro

1. Normalizar `validade` definitivamente (migrar meses para valor numérico + data_vencimento consistente).
2. Preenchimento real dos campos analíticos a partir de fontes externas (instrutor, local, modalidade).
3. Constraints leves (ex: `nota BETWEEN 0 AND 100`, `carga_horaria >= 0`).
4. Auditoria detalhada de mudanças (tabela de log para updates críticos).

## CI: Smoke Test & Proteções

Adicionar etapa obrigatória no pipeline (GitHub Actions):

```yaml
jobs:
	smoke-historico:
		runs-on: ubuntu-latest
		steps:
			- uses: actions/checkout@v4
			- uses: actions/setup-node@v4
				with:
					node-version: 20
			- run: npm ci
			- run: npm run build
			- name: Wrangler Auth
				run: npx wrangler whoami || npx wrangler login --not-open-browser
			- name: Smoke View
				run: |
					chmod +x scripts/smoke-view-historico.sh
					./scripts/smoke-view-historico.sh --limit 2 || exit 1
			- name: Fail if zero rows
				run: |
					COUNT=$(npx wrangler d1 execute airtrust-db --remote --command "SELECT COUNT(*) c FROM qualificacoes_historico_v" | jq '.[0].results[0].c')
					if [ "$COUNT" = "0" ]; then echo "View vazia"; exit 2; fi
```

### Script Local

```bash
./scripts/smoke-view-historico.sh --limit 5
```

Valida:

- Contagem total
- Distribuição de status
- Amostra aleatória com `data_validade`, `status_qualificacao`, `dias_ate_vencimento`.

### Gate de Deploy

Falhar se:

- View = 0 linhas
- > 5% divergência entre tabela base e view (registros esperados vs retornados)
- Status `VALIDA` < 50% (indicativo de regressão de cálculo ou data_vencimento perdida)

## Estado Atual (2025-11-22)

- Migrations 0095–0097 aplicadas (estrutura física + view consolidada).
- Endpoint `/api/qualificacoes/historico` retorna registros com novos aliases estáveis.
- Próxima prioridade: normalização completa da validade e enriquecimento analítico.

## UI: Modais de Qualificações (Correções 2025-11-22)

Foram alinhados os componentes de criação/edição com o schema real do histórico:

- Novo Registro Histórico: `ModalNovaQualificacao` (qualificacoes-historico) agora posta em `/api/qualificacoes/historico` usando campos físicos: `funcionario_id`, `qualificacao_id`, `data_conclusao`, `data_vencimento`, `observacoes`, `certificado_numero`.
- Edição Histórico: `ModalEditarQualificacao` ajustado para `/api/qualificacoes/historico/:id` (PUT), campos imutáveis (`codigo`, `nome`, `categoria`) desabilitados; atualiza apenas datas, observações e número certificado.
- Modal Genérico (`ModalQualificacao`) migrado para fluxo histórico: inclui `qualificacao_id` e converte `data_conclusao` / `data_vencimento` corretamente.
- Fetch padronizado: todos carregamentos incluem token (se presente) e usam endpoints específicos: `/api/funcionarios?limit=1000` e `/api/qualificacoes/tipos?limit=1000`.
- Remoção de campos não existentes no backend (ex: `data_realizado`, `validade_meses` no edit direto do histórico) para evitar inconsistências silenciosas.

### Payload POST Histórico (Exemplo)

```json
{
  "funcionario_id": 9,
  "qualificacao_id": "aca2c1c9-...",
  "data_conclusao": "2025-11-22",
  "data_vencimento": "2026-11-22",
  "observacoes": "Treinamento concluído",
  "certificado_numero": "CERT-2025-001"
}
```

### Payload PUT Histórico (Exemplo)

```json
{
  "data_conclusao": "2025-11-23",
  "data_vencimento": "2026-11-23",
  "observacoes": "Ajuste de data",
  "certificado_numero": "CERT-2025-001-R1"
}
```

### Regressões Evitadas

- Falha de selects vazios (funcionários/qualificações) causada por ausência de header Authorization.
- Persistência de valores incorretos (uso de `codigo` em vez de `qualificacao_id`).
- Criação em rota errada (`/api/qualificacoes` ao invés de `/api/qualificacoes/historico`).

### Próximas Melhorias UI

1. Auto-cálculo opcional de `data_vencimento` via `validade_meses` do tipo (exibir pré-visualização).
2. Estado visual de carregamento para selects enquanto dados não chegam (skeleton placeholders).
3. Mensagens de erro detalhadas (exibir `data.details` de validações Zod/AppError).
4. Quick-renew dentro do modal de edição (chamada a `/api/qualificacoes/historico/:id/renovar`).

### Checklist de Verificação Manual

1. Abrir modal Nova Qualificação: lista de funcionários e tipos carregada.
2. Selecionar tipo → exibe categoria + validade.
3. Informar data_conclusao → data_vencimento calculada (se future enhancement ativo) ou manual.
4. Salvar → registro aparece na tabela com status derivado.
5. Editar registro → modal exibe datas e observações existentes; salvar atualiza status conforme nova data.

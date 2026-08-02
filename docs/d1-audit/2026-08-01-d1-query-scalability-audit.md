# AirTrust — Auditoria D1, queries, índices e escalabilidade

Data: 2026-08-01 (BRT)

Repositório: `airtrustsystem-alt/airtrust`

`origin/main` revisada: `ecc37ec94f1a53533eb6f5f74bcbc3282d7e91d8`

PR documental: `#667`

PR relacionada: `#664`

Candidato final da #664: `d10d93d571d04f34c1fcaacaf1ef8dd5a6d53951`

## Escopo e guardrails

Esta PR é exclusivamente documental. A análise cobre queries D1, paginação,
binds, jobs, relatórios, exportações e candidatos conceituais a índices.

Não houve:

- consulta ou escrita em D1 ou R2 remoto;
- migration, backfill ou alteração de schema;
- criação ou remoção real de índice;
- deploy, publicação ou mudança de produção;
- merge de PR.

O SQL proposto permanece fora de `worker-airtrust/migrations`. O arquivo de
propostas contém somente comentários e nenhum statement executável.

## Efeito real da PR #664

O candidato da #664 resolve somente a rota de hospedagem:

- substitui `SELECT *` por colunas explícitas;
- preserva o payload do `GET /:id`;
- preserva `empresa_id` e `deleted_at`;
- limita joins de funcionários ao mesmo tenant;
- exclui funcionários apagados dos joins;
- usa `deleted_at IS NULL` nas leituras;
- inclui tenant nos predicados de escrita;
- inclui soft delete nos predicados de escrita;
- ordena por `data_checkin DESC, id DESC`;
- valida número e ordem dos binds;
- bloqueia acesso e escrita cross-tenant;
- não altera schema e não inclui migration.

A #664 não implementa paginação navegável nem índice composto.

## Achados prioritários

### P0 — excesso de binds em Treinamentos Planejados

Categoria: correção sem migration.

Evidência: `worker-airtrust/src/routes/treinamentos-planejados.ts` pode reunir
até 400 IDs. Loaders de participantes, dias, instrutores e auditoria constroem
um placeholder por ID em cláusulas `IN (...)`.

Risco: exceder o limite de parâmetros antes de considerar binds fixos.

Follow-up: criar helper de chunking com orçamento explícito de binds. Testar
0, 1, 90, 91, 180 e 400 IDs.

### P1 — auditoria carrega histórico antes do top-N

Categoria: correção sem migration. Um índice posterior é opcional.

Evidência: `loadAuditoriaByTreinamento` acumula todos os registros retornados
sem top-N por `registro_id` no SQL.

Risco: crescimento de `rows_read`, memória e latência.

Follow-up: aplicar `ROW_NUMBER()` por `registro_id`, combinado com chunking.

### P1 — consolidação faz expand-before-limit

Categoria: correção sem migration.

Evidência: turma, qualificação planejada e simulador podem retornar até 400
itens cada. O consolidado é reduzido somente depois do carregamento de relações.

Risco: processar aproximadamente 1.200 itens para devolver no máximo 400.

Follow-up: consolidar e limitar antes de carregar relações.

### P1 — loops sequenciais nos crons

Categoria: correção sem migration e mudança arquitetural posterior.

Evidência: `worker-airtrust/src/cron/scheduled-handler.ts` percorre lembretes e
candidatos EAD com operações D1 aguardadas por item. O mesmo handler agrega LMS,
EAD e SIGVOOS ou FRMS.

Risco: N+1, duração crescente e repetição de efeitos após falha parcial.

Follow-up: caps, checkpoint, lease por job e tenant, idempotência e lotes
separados.

### P1 — exportações em memória

Categoria: mudança arquitetural.

Evidência: `worker-airtrust/src/routes/exportacao.ts` e
`worker-airtrust/src/routes/horas-voo.ts` materializam workbook e buffer no
Worker.

Risco: memória e CPU proporcionais ao volume e acopladas ao request.

Follow-up: job idempotente, paginação keyset, escrita incremental para R2 e
publicação apenas do artefato final.

### P1 — idempotência de criação de treinamento

Categoria: contrato com migration própria.

Evidência: a proteção atual depende de janela temporal, sem chave persistida e
constraint que feche a corrida concorrente.

Follow-up: `Idempotency-Key` por tenant e operação, hash do payload, resultado
persistido e constraint única.

### P2 — funções em filtros e ordenações

Categoria: correção sem migration antes de avaliar índice.

Evidência: consultas usam `date(...)`, `COALESCE(...)`, `UPPER(...)` e
`TRIM(...)`. O experimento local registra B-tree temporária em casos
representativos.

Follow-up: simplificar somente após provar os contratos de dados.

### P2 — paginação e listas administrativas

Categoria: correção sem migration.

Evidência: existem endpoints com limites fixos ou offset. Hospedagem permanece
limitada a 500 sem cursor navegável.

Follow-up: caps validados e keyset por data e ID.

## Correções futuras sem migration

1. Chunking de binds em Treinamentos Planejados.
2. Top-N de auditoria no SQL.
3. Fetch-before-expand da consolidação.
4. Caps, checkpoint e lease nos crons.
5. Cursor e pré-filtro para inconsistências SCORM.
6. Paginação keyset da hospedagem.
7. Simplificação comprovada de expressões sobre datas ISO.

## Propostas futuras com migration

1. Índice de auditoria após top-N e chunking.
2. Índice de treinamentos após estabilizar filtros e ordenação.
3. Índice de hospedagem após paginação e métricas.
4. Índice LMS por expiração após cardinalidade real.
5. Tabela ou constraint de idempotência persistida.

Nenhuma proposta desta seção foi implementada.

## Mudanças arquiteturais futuras

1. Exportações assíncronas e incrementais para R2.
2. Separação dos jobs LMS ou EAD e SIGVOOS ou FRMS.
3. Relatórios pré-calculados onde métricas justificarem.
4. Avaliação de database-per-tenant somente com dados operacionais.

## Follow-ups priorizados

1. P0: chunking de binds em Treinamentos Planejados.
2. P1: auditoria top-N por registro.
3. P1: fetch-before-expand da consolidação.
4. P1: cron LMS ou EAD com cap, checkpoint e lease.
5. P1: SIGVOOS ou FRMS em lote separado.
6. P1: contrato persistido de idempotência.
7. P1: exportações assíncronas.
8. P2: SCORM com cursor e pré-filtro.
9. P2: hospedagem com paginação keyset.
10. P2: índices somente após query final, EXPLAIN e staging.
11. P3: remoção de índices redundantes após observação e rollback.

## Evidência local de plano

`docs/d1-audit/explain-query-plan-local.txt` registra experimento em SQLite
efêmero. A evidência é direcional e não substitui cardinalidade, estatísticas ou
métricas autorizadas de staging.

A conclusão é corrigir limite de binds, overfetch e expressões da query antes de
promover índices.

## Segurança documental

- nenhum arquivo em `worker-airtrust/migrations` foi alterado;
- não existe SQL executável acidental;
- não existe instrução de deploy automático;
- não existe comando remoto de D1 ou R2;
- as propostas conceituais estão integralmente comentadas;
- a #664 é tratada como candidata pendente de integração.

## Ordem recomendada

1. Integrar e observar a correção sem migration da #664.
2. Corrigir o P0 de binds.
3. Corrigir top-N e fetch-before-expand.
4. Separar e limitar crons.
5. Implementar idempotência em PR própria.
6. Redesenhar exportações.
7. Avaliar migrations de índices pelo processo oficial.

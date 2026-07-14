# Produção — Schema Snapshot e Auditoria de Drift

Data local: 2026-07-14

Modo de execução:
- produção consultada somente com `SELECT` e `PRAGMA` via D1 remoto read-only;
- API consultada somente com `GET /api/version` e `GET /api/health`;
- nenhuma migration executada;
- nenhum ledger alterado.

Artefatos:
- snapshot estrutural versionado: [structural-snapshot.json](/Users/filipedaumas/SAAS/Airtrust/docs/database/production-schema-snapshot-20260714/structural-snapshot.json)
- snapshot sanitizado fora do repositório: `~/.airtrust-prod-ops/schema-audit-20260714/production-schema-snapshot-sanitized.json`
- matriz auxiliar de migrations: [migration-ledger-audit-0408-0429.json](/Users/filipedaumas/SAAS/Airtrust/docs/database/production-schema-snapshot-20260714/migration-ledger-audit-0408-0429.json)

Marcador metodológico:
- `COMPARACAO_ESTATICA_NAO_EXECUTADA`: a reconciliação com o corpus de migrations foi feita por inspeção estática do repositório, sem replay local do chain completo.

## Fonte A — Schema real de produção

Achados confirmados em produção:
- `simuladores` existe sem coluna `empresa_id`;
- `sessoes_participantes` existe sem coluna `empresa_id`;
- `modelos_sessao` existe com `empresa_id`;
- `modelos_sessao` não tem `tipo_sessao_codigo`; tem `tipo_sessao_id`;
- `simuladores` expõe colunas legadas/reais `modelo`, `tipo`, `codigo_aeronave` e `aeronave_codigo`;
- `fichas_sessao` tem `atribuicao_curricular_id` e `segmento_atribuicao_id`;
- `manobras` tem `referencias_json`;
- `notificacoes_log` tem `empresa_id`;
- `qualificacoes_tipos` tem `formato_id`, `categoria_id` e `classe_requisito`;
- `qualificacoes_historico_v` existe em produção;
- `lms_cursos_setores`, `cv_voos`, `cv_voo_etapas`, `modelos_sessao_requisitos` e `fichas_sessao_instrutor_meta` existem em produção.

Achado crítico:
- o ledger termina, nesta janela, em `0424_examiner_universal_training_fichas.sql`;
- não há nenhuma entrada `0425`, `0428` ou `0429` no ledger;
- mesmo assim, produção já contém evidência estrutural e/ou de dados compatível com `0425`, `0428` e pelo menos parte de `0429`.

## Fonte B — Corpus de migrations do repositório

Limitação deliberada:
- a instrução operacional foi `Não executar migrations`;
- por isso, a comparação com a fonte B foi feita por inspeção estática do corpus `worker-airtrust/migrations/*.sql`, do artefato local [scripts/schema-local.sql](/Users/filipedaumas/SAAS/Airtrust/scripts/schema-local.sql) e das migrations-alvo `0151`, `0408`–`0429`;
- `COMPARACAO_ESTATICA_NAO_EXECUTADA`: não houve replay local do chain completo.

Conclusões da fonte B:
- `0151_add_empresa_id_incremental.sql` tentaria adicionar `simuladores.empresa_id`, mas produção real não tem essa coluna;
- `0421`–`0424` descrevem exatamente a estrutura compartilhada observada em produção;
- `0428` explica os códigos atuais `A139-P-01/04-C2` e `A139-P-02/04-C2`;
- `0429` descreve `INST-E01`, `INST-E02`, a inativação de `TRE-INST` e três novas colunas em `fichas_sessao`.

## Fonte C — Documentação

Divergências objetivas em [DATABASE_SCHEMA.md](/Users/filipedaumas/SAAS/Airtrust/DATABASE_SCHEMA.md):
- a seção de simuladores lista apenas `simuladores`, `simulador_sessoes`, `simulador_agendamentos`, `fichas_sessao`, `fichas_sessao_edicoes`, `modelos_sessao`, `manobras` e `modelos_aeronave`;
- a documentação não reflete `sessoes_participantes`, `simulador_atribuicoes_curriculares`, `simulador_agendamento_segmentos`, `simulador_segmento_atribuicoes`, `simulador_segmento_participantes`, `modelos_sessao_requisitos` nem `fichas_sessao_instrutor_meta`;
- o texto afirma padrão universal de `empresa_id` e `deleted_at` em todas as tabelas, o que é falso para `simuladores` e `sessoes_participantes` na produção real;
- o recorte de “migrations recentes” termina em `0398` e não documenta a cadeia `0408`–`0429`.

## Fonte D — Código atual de `origin/main`

Compatibilidades explícitas observadas no código:
- `origin/main:worker-airtrust/src/routes/simuladores-shared.ts` usa `PRAGMA table_info(simuladores)` para detectar ausência de `simuladores.empresa_id`;
- o mesmo arquivo resolve modelo do simulador por `COALESCE(aeronave_codigo, codigo_aeronave, tipo, modelo, '')`;
- `origin/main:worker-airtrust/src/routes/simuladores-shared.ts` já protege leituras de `modelos_sessao_requisitos` com fallback para `no such table`;
- `origin/main:worker-airtrust/src/routes/simuladores-fichas.ts` usa `sessoes_participantes` por `sessao_id` e dados derivados de `equipamento_utilizado`, `dispositivo_identificacao` e `assento_instrucao_utilizado`;
- `origin/main:src/react-app/components/modals/ModalNovaSessao.tsx` trabalha com `tipo_sessao_id` e `tipo_sessao_codigo` no payload, e também aceita os legados `aeronave_codigo`, `codigo_aeronave`, `tipo` e `modelo`.

Leitura objetiva:
- a `main` já incorpora tolerância ao schema real de produção;
- essa tolerância existe porque o schema real diverge tanto do ledger quanto da documentação.

## Drift principal

1. `simuladores.empresa_id`
- esperado por `0151` e por parte da documentação;
- ausente na produção real;
- o código já trata essa ausência em runtime.

2. `sessoes_participantes.empresa_id`
- esperado pelo padrão documental de tenant em todas as tabelas;
- ausente na produção real;
- o código usa joins por `sessao_id` e `funcionario_id`, não por `empresa_id` nessa tabela.

3. `modelos_sessao.tipo_sessao_codigo`
- inexistente no schema real;
- `modelos_sessao.tipo_sessao_id` existe;
- frontend e backend fazem fallback entre id e código.

4. Colunas do simulador
- produção real combina `modelo`, `tipo`, `codigo_aeronave` e `aeronave_codigo`;
- o código atual trata explicitamente essa multiplicidade;
- a documentação não descreve esse estado híbrido com precisão.

5. `0429` fora do ledger
- produção tem `INST-E01`, `INST-E02`, `TRE-INST` inativo, 36 manobras `INST-E01-*`/`INST-E02-*` e tabela `fichas_sessao_instrutor_meta`;
- o ledger não registra nenhuma `0429`;
- as três colunas novas em `fichas_sessao` previstas por `0429` não aparecem no schema real;
- classificação operacional: `0429` está `PARCIALMENTE APLICADA` e `FORA DO LEDGER`.

## Ledger — matriz 0408–0429

| Migration | Registrada no ledger | Evidência estrutural | Evidência de dados | Estado real | Risco de reexecução | Ação proposta |
|---|---|---|---|---|---|---|
| 0408 | Não | `lms_cursos_setores` existe | sem checagem de linhas | APLICADA FORA DO LEDGER | Alto | não reexecutar sem reconciliação |
| 0409 | Não | tabela alvo existe | backfill não auditado | INCONCLUSIVA | Médio | validar somente se houver necessidade operacional |
| 0410 | Não | `cv_voos` existe | n/a | APLICADA FORA DO LEDGER | Alto | registrar origem fora do ledger |
| 0411 | Não | `cv_voo_etapas` existe | n/a | APLICADA FORA DO LEDGER | Alto | registrar origem fora do ledger |
| 0412 | Não | `qualificacoes_tipos.formato_id/categoria_id/classe_requisito` existem | n/a | APLICADA FORA DO LEDGER | Alto | não reaplicar; reconciliar ledger |
| 0413 | Sim | compatível com produção | ledger presente | APLICADA E REGISTRADA | Baixo | nenhuma |
| 0414 | Sim | `manobras.referencias_json` existe | ledger presente por 0416 | APLICADA E REGISTRADA | Baixo | nenhuma |
| 0415 | Não | `qualificacoes_historico_v` contém `tipo_treinamento` | n/a | APLICADA FORA DO LEDGER | Alto | registrar drift do ledger |
| 0416 | Sim | entrada presente | ledger de reconciliação | APLICADA E REGISTRADA | Baixo | nenhuma |
| 0417 | Sim | `modelos_sessao_manobras.tripulante` existe | ledger presente | APLICADA E REGISTRADA | Baixo | nenhuma |
| 0418 | Sim | ledger presente | n/a | APLICADA E REGISTRADA | Baixo | nenhuma |
| 0418 rollback | Não | arquivo de rollback | n/a | NÃO APLICADA | Alto | não executar |
| 0419 | Sim | nomes/códigos normalizados compatíveis | ledger presente | APLICADA E REGISTRADA | Baixo | nenhuma |
| 0419 rollback | Não | arquivo de rollback | n/a | NÃO APLICADA | Alto | não executar |
| 0420 | Não | `notificacoes_log.empresa_id` existe | n/a | APLICADA FORA DO LEDGER | Alto | não reaplicar sem reconciliação |
| 0420 preflight | Não | arquivo read-only | n/a | SUBSTITUÍDA | Baixo | nenhuma |
| 0420 rollback | Não | arquivo de rollback | n/a | NÃO APLICADA | Alto | não executar |
| 0421 | Sim | tabelas/colunas compartilhadas existem | ledger presente | APLICADA E REGISTRADA | Baixo | nenhuma |
| 0422 | Sim | `modelos_sessao_requisitos` existe | ledger presente | APLICADA E REGISTRADA | Baixo | nenhuma |
| 0423 | Sim | `fichas_sessao.atribuicao_curricular_id` existe | fichas 237–240 usam ids 10–13 | APLICADA E REGISTRADA | Baixo | nenhuma |
| 0424 | Sim | estrutura compatível | modelos `EXA-01/02` e `EXA-02/02` ativos nas fichas auditadas | APLICADA E REGISTRADA | Baixo | nenhuma |
| 0425 | Não | atribuições curriculares existem | fichas 237–240 referenciam atribuições 10–13 | APLICADA FORA DO LEDGER | Alto | não reaplicar sem reconciliação |
| 0426 | Não | sem evidência exigida no escopo | n/a | INCONCLUSIVA | Médio | adiar |
| 0427 | Não | sem evidência exigida no escopo | n/a | INCONCLUSIVA | Médio | adiar |
| 0428 | Não | códigos AW139 atuais são pós-0428 | fichas 238 e 240 usam códigos pós-0428 | APLICADA FORA DO LEDGER | Alto | não reaplicar sem reconciliação |
| 0429 | Não | `fichas_sessao_instrutor_meta` existe; colunas de `fichas_sessao` não | `INST-E01`, `INST-E02`, `TRE-INST` inativo e 36 manobras `INST-*` existem | PARCIALMENTE APLICADA | Crítico | bloquear reexecução e reconciliar manualmente |

## Migration 0151

Achado específico:
- [0151_add_empresa_id_incremental.sql](/Users/filipedaumas/SAAS/Airtrust/worker-airtrust/migrations/0151_add_empresa_id_incremental.sql) tenta adicionar `empresa_id` em `simuladores`;
- produção real continua sem `simuladores.empresa_id`;
- portanto, `0151` não é uma descrição confiável do schema real de produção para esta tabela;
- isso reforça que não se pode inferir produção apenas pelo corpus de migrations.

## Veredito

Veredito da auditoria de 2026-07-14:
- o schema real de produção diverge materialmente do ledger e da documentação;
- a `main` atual já contém defesas explícitas para esse drift;
- há múltiplas evidências de aplicação seletiva fora do ledger;
- a `0429` está em estado mais perigoso: evidência estrutural e de dados existe, mas a migration não está registrada e não está totalmente refletida no `CREATE TABLE fichas_sessao`.

Ação segura nesta etapa:
- não executar migrations;
- não corrigir `d1_migrations` manualmente;
- tratar o estado atual como drift confirmado;
- preparar uma reconciliação formal do ledger antes de qualquer replay de chain;
- congelar migrations históricas em produção e promover o schema real auditado a baseline V2.

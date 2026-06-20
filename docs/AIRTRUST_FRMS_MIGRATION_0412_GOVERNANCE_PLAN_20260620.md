# AirTrust FRMS — Plano de Governança da Migration 0412

Data: 2026-06-20  
Status: **BLOQUEADO / PLANO FUTURO / NÃO EXECUTAR**  
Artefato analisado: `docs/migration-0412-draft.sql`  
Destino canônico futuro, se aprovado: `worker-airtrust/migrations/0412_*.sql`

## 1. Decisão executiva

A migration 0412 **não está autorizada**. O arquivo atual é um draft documental, deve permanecer em `docs/` e não pode ser movido, promovido, aplicado ou usado por automação. Este plano também não autoriza banco remoto, deploy, criação de tabela, backfill ou mudança de dados.

O contrato PR-1 usa temporariamente `frms_read_ack_events.ack_note` para armazenar JSON estruturado `_override_schema = 1`. A tabela `frms_decisao_override` é uma evolução futura para separar o override operacional do ciclo de leitura/ack, com trilha tenant-scoped e append-only.

Decisões de rollout:

- multiempresa: **PILOTO CONTROLADO**, com tenants explicitamente allowlisted e expansão manual;
- SIGVOOS: **NO-GO**; não habilitar, consultar, importar, reconciliar nem alterar integração SIGVOOS como parte desta migration;
- produção: **NO-GO** até todos os gates deste documento estarem cumpridos e houver autorização escrita específica.

## 2. Objetivo futuro

Materializar overrides de decisão operacional FRMS em armazenamento dedicado, preservando:

- isolamento por `empresa_id` em toda leitura, escrita, backfill, auditoria e validação;
- vínculo verificável com o evento de origem em `frms_read_ack_events`;
- responsável, justificativa sanitizada, referência técnica de evidência e instante do override;
- histórico append-only, sem converter uma decisão operacional em simples atualização destrutiva;
- compatibilidade temporária de leitura com os overrides já persistidos em `ack_note`;
- possibilidade de interromper o rollout sem perder o registro legado.

O objetivo não inclui alterar a semântica da política FRMS, ativar bloqueio regulatório, integrar SIGVOOS ou migrar outros tipos de `ack_note`.

## 3. Por que não aplicar agora

O draft foi revisado integralmente. Ele é aditivo e não contém `DROP`, `UPDATE`, `DELETE` ou backfill, mas ainda não é uma migration pronta para execução:

1. `CREATE TABLE IF NOT EXISTS` e `CREATE INDEX IF NOT EXISTS` podem mascarar objetos preexistentes com schema divergente; falta uma verificação explícita de drift.
2. `event_id` e `empresa_id` expressam o vínculo lógico, mas o draft não impõe no banco que o evento pertença ao mesmo tenant.
3. A intenção append-only está somente em comentário; não há contrato de escrita ou proteção contra `UPDATE`/`DELETE` definido e testado.
4. Ainda deve ser decidido se múltiplos overrides por `(empresa_id, event_id)` são permitidos e como sua ordem/histórico será representada.
5. Não há constraints documentadas para `schema_version`, códigos de decisão, identificadores de usuário ou timestamps.
6. Não existe backfill idempotente, relatório de rejeições nem reconciliação com `frms_read_ack_event_audit`.
7. O runtime atual ainda grava o JSON temporário em `frms_read_ack_events.ack_note`; promover o DDL sem uma estratégia de compatibilidade criaria duas fontes concorrentes.
8. O estado real do ledger D1, o prefixo disponível e a equivalência de schema entre ambientes precisam ser reauditados na janela futura. A presença atual de `0411` não autoriza automaticamente `0412`.
9. Não houve ensaio em clone restaurável com volume e distribuição representativos por tenant.

Consequentemente, o draft **não deve ser promovido sem revisão e reescrita controlada**, mesmo que o SQL atual pareça somente aditivo.

## 4. Pré-requisitos e autorização explícita

Todos os itens abaixo são obrigatórios:

- [ ] escopo funcional e semântica de múltiplos overrides aprovados pelo owner FRMS;
- [ ] revisão obrigatória descrita na seção 5 concluída sem blocker aberto;
- [ ] inventário read-only do schema e do ledger D1 em staging e produção;
- [ ] confirmação de que `0412` continua livre no diretório canônico e no ledger real;
- [ ] migration real criada em PR separado, sem reutilizar diretamente o draft;
- [ ] diff final do SQL, código, testes, plano de backfill e plano de rollback congelado por hash/commit;
- [ ] clone restaurável de produção ou ambiente equivalente preparado para ensaio;
- [ ] testes tenant positivo e cross-tenant negativo, inclusive para IDs coincidentes ou manipulados;
- [ ] volume de candidatos, inválidos, duplicados e conflitos levantado por tenant sem expor PII;
- [ ] backup concluído, cifrado, com acesso restrito, checksum, retenção e teste de restauração;
- [ ] owner da mudança, executor, observador, owner de rollback e janela definidos;
- [ ] alertas, métricas e critérios de parada disponíveis antes da aplicação;
- [ ] autorização escrita do responsável AirTrust contendo ambiente, commit/hash exato, tenant(s) do piloto, janela e frase inequívoca de **GO para aplicar a migration 0412**.

Merge de PR, aprovação de código, existência deste plano, aprovação anterior de outra migration ou autorização genérica de deploy **não constituem autorização**.

## 5. Revisão futura obrigatória por modelo de alta capacidade

Antes de qualquer promoção, a migration real, o backfill e o código consumidor devem passar por revisão independente usando:

- **Opus 4.8**, ou
- **Sonnet 4.6 com esforço alto**.

A revisão deve cobrir, no mínimo:

- integridade tenant-aware entre override, evento e usuário;
- modelo append-only e semântica de repetição/supersessão;
- idempotência da aplicação e do backfill;
- concorrência entre escrita antiga, dual-write e backfill;
- compatibilidade forward/backward durante deploy e rollback;
- schema drift, constraints, índices e plano de consulta;
- preservação de auditoria e tratamento de linhas inválidas;
- risco de PII em justificativa, evidência, logs, relatórios e backup;
- blast radius multiempresa e testes cross-tenant;
- rollback ensaiado e critérios objetivos de GO/NO-GO.

Saída exigida: parecer versionado com achados, severidade, evidência, blockers e decisão final. Blocker ou achado alto sem mitigação mantém **NO-GO**.

## 6. Backup e restauração

Na janela futura, antes de qualquer escrita:

1. identificar formalmente a base e o ambiente alvo;
2. capturar estado do ledger e schema de forma read-only;
3. gerar backup consistente da base pelo mecanismo D1 aprovado para o ambiente, incluindo dados necessários à restauração;
4. armazenar o artefato fora do repositório, cifrado e com acesso mínimo;
5. registrar horário, tamanho, checksum, executor, retenção e vínculo com o change ticket;
6. restaurar o backup em ambiente isolado e executar smoke de leitura; backup sem teste de restauração não satisfaz o gate;
7. registrar RPO/RTO aceitos e o ponto limite para decisão de rollback.

Comandos, nomes de base e credenciais devem ser obtidos do runbook vigente na data da execução. Este documento deliberadamente não fornece um comando pronto contra produção.

## 7. Validação pré-aplicação

Executar primeiro no clone restaurável e depois, de forma read-only, no ambiente candidato:

### 7.1 Schema e ledger

- confirmar existência e formato esperado de `frms_read_ack_events` e `frms_read_ack_event_audit`;
- confirmar ausência de `frms_decisao_override` e de índices homônimos; se houver qualquer objeto, parar por schema drift;
- conferir migrations aplicadas versus diretório canônico e investigar gaps/duplicidades;
- validar suporte e comportamento D1/SQLite para constraints, índices, transação e estratégia de rollback escolhida;
- obter plano de consulta para acessos por `(empresa_id, event_id)` e `(empresa_id, created_at)`.

### 7.2 Candidatos de `ack_note`

Classificar por tenant, sem imprimir justificativas ou evidências:

- total de eventos com `ack_note` nulo, texto comum, JSON inválido e JSON válido;
- total com `_override_schema = 1`;
- campos ausentes ou inválidos: `responsavel_user_id`, `justificativa`, `override_at`, `evidencia_ref`;
- timestamps inválidos ou fora de faixa;
- usuários ausentes ou pertencentes a outro tenant;
- ações `OVERRIDE_APPLIED` ausentes, duplicadas ou conflitantes na auditoria;
- repetição lógica por `(empresa_id, event_id)`;
- candidatos por tenant e período, para estimar tempo e blast radius.

Nenhuma linha inválida deve ser corrigida automaticamente. Ela vai para relatório sanitizado de rejeição e exige decisão humana.

### 7.3 Aplicação e segurança

- validar testes unitários/integração do parser `_override_schema = 1`;
- validar RBAC de gestor/administrador e rejeição dos demais papéis;
- validar `empresa_id` obrigatório, sem fallback e sem uso do tenant recebido no body;
- provar que evento de outro tenant retorna resultado indistinguível de inexistente;
- validar limites, sanitização e ausência de conteúdo sensível inline;
- executar carga e concorrência controladas entre override novo e backfill;
- confirmar feature flag/allowlist do piloto e kill switch testado.

## 8. Plano futuro de aplicação controlada — não executar nesta fase

Esta sequência é apenas um runbook futuro:

1. abrir change ticket e congelar commit/hash aprovado;
2. concluir backup e validação prévia;
3. ativar janela de mudança, observadores e freeze de alterações FRMS concorrentes;
4. aplicar a migration em clone restaurável e executar validação completa;
5. aplicar em staging compatível com o ledger real e repetir smoke, carga e rollback ensaiado;
6. obter uma segunda autorização escrita para produção após evidências de staging;
7. aplicar somente o DDL aprovado em produção, sem backfill no mesmo passo se isso reduzir a reversibilidade;
8. validar imediatamente objetos, constraints, índices, latência e ausência de erros;
9. liberar leitura da tabela nova em shadow mode para um tenant interno/allowlisted, mantendo `ack_note` como fallback;
10. executar backfill em lotes pequenos e tenant-scoped conforme a seção 9;
11. reconciliar cada lote antes do próximo; parar automaticamente ao atingir qualquer critério de NO-GO;
12. liberar escrita nova somente para o tenant piloto, com observação reforçada;
13. manter compatibilidade de leitura antiga durante o período definido de estabilização;
14. expandir para outro tenant apenas por decisão manual após relatório do piloto.

Não combinar no mesmo evento operacional: DDL, backfill total, remoção do fallback, limpeza de `ack_note`, ativação para todos os tenants e deploy de SIGVOOS.

## 9. Migração dos overrides temporários de `ack_note`

### 9.1 Fonte elegível

Somente é candidato o `ack_note` que:

- seja JSON válido;
- tenha `_override_schema` exatamente igual a `1`;
- passe pelo mesmo parser e sanitizadores aprovados no runtime;
- pertença a evento e tenant válidos;
- tenha responsável e timestamp válidos;
- seja conciliável com a trilha `OVERRIDE_APPLIED`, conforme regra aprovada na revisão futura.

Texto comum, JSON de outro schema e JSON parcialmente válido não podem ser interpretados por heurística como override.

### 9.2 Mapeamento proposto para revisão

| Destino futuro | Origem temporária |
|---|---|
| `empresa_id` | `frms_read_ack_events.empresa_id` |
| `event_id` | `frms_read_ack_events.id` |
| `responsavel_user_id` | JSON `responsavel_user_id` |
| `justificativa` | JSON `justificativa`, após validação |
| `evidencia_ref` | JSON `evidencia_ref`, após validação |
| `created_at` | JSON `override_at`, normalizado e validado |
| `schema_version` | `1` |
| `decisao_original` | somente se recuperável de fonte canônica/auditoria; caso contrário `NULL` explícito |
| `decisao_final` | somente se definido pelo contrato aprovado; não inferir silenciosamente |

O `id` precisa ser estável e idempotente. A estratégia final — ID determinístico ou ledger explícito de backfill — deve ser aprovada na revisão. Não gerar novos IDs aleatórios a cada reexecução.

### 9.3 Execução do backfill

- operar por um único `empresa_id` allowlisted por vez;
- paginar por chave estável, com tamanho de lote previamente ensaiado;
- usar inserção idempotente sem sobrescrever um override existente;
- registrar apenas contagens e IDs técnicos necessários, nunca justificativas em log;
- reconciliar `lidos = inseridos + já existentes idênticos + rejeitados + conflitos` em cada lote;
- abortar em conflito de mesmo ID/chave com conteúdo diferente;
- preservar `ack_note` original durante todo o piloto; a primeira fase é cópia verificada, não move/delete;
- produzir manifesto sanitizado e checksum por lote;
- só alterar o writer após o backfill e a leitura shadow demonstrarem equivalência.

Limpeza futura de JSON legado, se algum dia necessária, exige migration/change ticket separado, política de retenção, parecer de auditoria e novo backup.

## 10. Rollback

Rollback deve priorizar segurança de dados e compatibilidade, não remoção imediata do objeto.

### 10.1 Antes de habilitar escrita nova

- desativar feature flag/allowlist;
- reverter o código para leitura/escrita exclusiva no caminho temporário compatível;
- manter a tabela aditiva vazia ou somente com cópias verificadas;
- não executar `DROP TABLE` em produção como reação automática.

### 10.2 Durante backfill ou piloto

- parar novos lotes e escrita na tabela nova;
- preservar manifesto, auditoria e linhas já inseridas para análise;
- voltar a leitura para `ack_note`, que não terá sido limpo;
- reconciliar o último lote e classificar qualquer divergência;
- restaurar backup somente se houver corrupção, impacto amplo ou se o owner de rollback acionar o critério previamente aprovado.

### 10.3 Rollback físico

Se a remoção do schema for realmente necessária, ela deve ocorrer por migration compensatória separada, revisada e autorizada. Antes disso, exportar/preservar os registros e provar que nenhum writer ou reader depende da tabela. O draft atual não é um script de rollback.

## 11. Validação pós-aplicação

Após cada ambiente e cada lote:

- confirmar migration/ledger e assinatura exata do schema;
- confirmar índices e planos de consulta esperados;
- verificar contagens por tenant e reconciliação total do lote;
- comparar semanticamente tabela nova versus parser de `ack_note`, sem expor texto sensível;
- confirmar zero linhas com `empresa_id` inválido/nulo e zero vínculos cross-tenant;
- confirmar zero duplicidade não explicada e zero conflito silenciosamente ignorado;
- confirmar auditoria completa e ordem temporal coerente;
- executar testes de RBAC e cross-tenant em ambos os sentidos entre tenants do piloto;
- medir erros, latência, lock/contention e taxa de rejeição;
- executar smoke de criação, leitura, repetição e fallback;
- registrar decisão de manter, pausar, reverter ou expandir.

O período de estabilização deve ser definido antes da execução e concluir sem blocker antes de remover qualquer fallback.

## 12. Matriz GO/NO-GO

### GO

GO só existe quando **todos** os requisitos forem verdadeiros:

- revisão Opus 4.8 ou Sonnet 4.6 esforço alto aprovada;
- autorização escrita específica e evidência do backup restaurável;
- zero schema drift e prefixo/ledger confirmados;
- ensaio e rollback aprovados em clone e staging;
- zero falha de isolamento tenant ou RBAC;
- backfill idempotente e reconciliação exata;
- observabilidade, kill switch e owners presentes;
- tenant piloto explicitamente allowlisted;
- SIGVOOS continua desabilitado e fora do change set.

### NO-GO imediato

Qualquer item abaixo interrompe aplicação, lote ou expansão:

- ausência ou ambiguidade de autorização;
- backup sem restauração testada;
- objeto 0412/tabela/índice preexistente divergente;
- diferença não explicada entre ledger e schema;
- achado blocker/alto sem mitigação;
- vínculo cross-tenant, tenant nulo ou fallback de empresa;
- perda, sobrescrita, duplicidade conflitante ou reconciliação inexata;
- taxa de JSON inválido/rejeição acima do limite aprovado;
- regressão de RBAC, auditoria, latência ou disponibilidade;
- impossibilidade de retornar ao reader de `ack_note`;
- tentativa de ativar para todos os tenants ou de incluir SIGVOOS na mudança.

## 13. Riscos e controles

| Risco | Impacto | Controle obrigatório |
|---|---|---|
| vínculo de evento com tenant incorreto | vazamento/contaminação multiempresa | validação estrutural tenant-aware e testes cross-tenant |
| duas fontes concorrentes | decisão divergente | shadow read, regra explícita de precedência e janela limitada de compatibilidade |
| reexecução do backfill | duplicidade | ID/ledger determinístico, inserção idempotente e reconciliação |
| sobrescrita de `ack_note` legado | perda de auditabilidade | preservar fonte durante piloto; limpeza em mudança separada |
| JSON legado inválido | migração silenciosamente incorreta | parser estrito e fila de rejeição sem heurística |
| PII/segredo em justificativa, evidência ou log | incidente LGPD/segurança | sanitização, referência técnica, logs sem payload e acesso mínimo |
| append-only apenas nominal | alteração de histórico | contrato de storage, testes e proteção decidida na revisão |
| `IF NOT EXISTS` mascarar drift | falsa aplicação bem-sucedida | preflight de assinatura e abortar se objeto já existir |
| índice insuficiente ou lote grande | latência/lock | plano de consulta, benchmark e lotes pequenos |
| rollback destrutivo | perda de dados | rollback lógico primeiro; compensatória separada para DDL |
| expansão multiempresa precoce | blast radius sistêmico | allowlist, um tenant por vez e aprovação manual |
| acoplamento indevido a SIGVOOS | mudança de fonte/escopo crítico | SIGVOOS NO-GO e change set sem código/configuração SIGVOOS |

## 14. Governança multiempresa — PILOTO CONTROLADO

A criação do schema é global, mas a adoção funcional e o backfill devem ser controlados por tenant:

1. iniciar em tenant interno ou explicitamente aprovado;
2. usar allowlist server-side e kill switch, sem parâmetro de cliente capaz de ampliar escopo;
3. executar backfill, validação positiva e ataques cross-tenant com pelo menos dois tenants de teste;
4. observar o período definido e emitir relatório por tenant;
5. adicionar no máximo um novo tenant por decisão manual;
6. limitar o piloto comercial ao conjunto aprovado de 1–3 empresas, com acompanhamento AirTrust;
7. proibir rollout aberto/self-service até nova auditoria de prontidão.

Nenhum sucesso em um tenant prova segurança nos demais. Toda expansão reabre o gate de capacidade, dados legados, RBAC e observabilidade.

## 15. SIGVOOS — NO-GO

Esta migration não autoriza nenhuma atividade SIGVOOS. Permanecem proibidos nesta mudança:

- leitura ou uso de credenciais reais;
- chamada de API, importação, sincronização ou backfill SIGVOOS;
- alteração de fonte canônica, tabelas `cv_*`, migrations 0410/0411 ou jobs relacionados;
- associação de override FRMS a IDs ou payloads SIGVOOS;
- deploy ou feature flag que habilite integração SIGVOOS.

Qualquer necessidade futura de SIGVOOS exige trilha, revisão, autorização e plano próprios. A decisão desta fase é **SIGVOOS NO-GO**.

## 16. Estado final desta fase

- `docs/migration-0412-draft.sql`: permanece draft documental e bloqueado;
- migration real em `worker-airtrust/migrations/`: **não criada**;
- tabela `frms_decisao_override`: **não criada**;
- banco remoto/local, deploy e backfill: **não executados**;
- próximo passo permitido: revisão documental e preparação futura dos artefatos sob novo escopo e autorização.

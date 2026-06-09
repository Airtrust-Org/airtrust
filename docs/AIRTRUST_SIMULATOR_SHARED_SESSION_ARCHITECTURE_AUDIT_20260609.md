# AirTrust — Auditoria Técnica e Desenho da Sessão Compartilhada de Simulador (2026-06-09)

## 1. Sumário executivo

- Esta auditoria foi executada em modo read-only, sem alteração de código funcional, sem migration e sem escrita em produção.
- O runtime real de simuladores usa `simulador_agendamentos` como reserva física principal, `sessoes_participantes` para tripulação e `fichas_sessao` para avaliação por participante.
- O sistema atual já cria duas fichas quando há dois participantes, porém sem diferenciação curricular por participante e sem suporte nativo a segmentos PF/PM por faixa horária.
- O bloqueio de conflito é hoje por `simulador_id + intervalo de horário` entre agendamentos distintos, sem exceção de “mesma reserva-pai”.
- Sessões simples atuais dependem fortemente do contrato atual (`POST/PUT /simuladores/sessoes` + auto-criação de fichas); qualquer mudança deve ser opt-in e aditiva.
- Recomendação única: manter `simulador_agendamentos` como pai e estender com **atribuições curriculares por participante** + **segmentos de função PF/PM** em modelo aditivo, preservando fluxo legacy.

## 2. Contrato funcional validado

O contrato funcional informado foi validado como alvo correto de negócio:

- Uma reserva física única (simulador + instrutor + período total + tripulação compartilhada).
- Segmentos internos com PF/PM por intervalo.
- Cada participante pode ter ou não atribuição curricular.
- Participante curricular: ficha + progressão + horas/função.
- Participante apoio: horas/função sem ficha e sem progressão.
- Conflito interno permitido apenas dentro da mesma reserva compartilhada; conflito externo continua bloqueado.
- Compatibilidade integral com sessões simples existentes.

## 3. Estado atual

- Git base:
  - `HEAD == origin/main` confirmado.
  - Sem mudanças tracked (`git diff --stat` e `git diff --name-status` vazios).
  - Há apenas arquivos untracked de auditoria/documentação já existentes no workspace.
- API produção:
  - `/api/version`: `2026-06-09T14:22:01Z-f6b3159b`.
  - `/api/health`: `healthy` com DB e storage ok.
- Migrações:
  - Ledger remoto reporta pendências: `0401_add_cor_column_tipos_sessao.sql`, `0403_reconcile_wave4_d1_ledger.sql`, `0404_desativar_empresa_teste.sql`.
  - Observação: isso não impacta a conclusão de arquitetura desta auditoria, mas precisa ser controlado em governança de deploy.

## 4. Modelo de dados atual

### 4.1 Tabelas do domínio identificadas

Confirmadas no D1 remoto:

- `simulador_agendamentos`
- `sessoes_participantes`
- `fichas_sessao`
- `ficha_manobras_avaliacao`
- `modelos_sessao`
- `tipos_sessao`
- `treinamentos_planejados`
- `qualificacoes_historico`
- `sessoes` (legacy)

### 4.2 Estrutura lógica atual (resumo textual)

1) `simulador_agendamentos` (reserva operacional)
- PK: `id`
- Chaves funcionais: `uuid`
- Campos-chave: `simulador_id`, `instrutor_id`, `data`, `hora_inicio`, `hora_fim`, `duracao_minutos`, `tipo_sessao`, `template_id`, `status`, `nome` (tema), `empresa_id`, `tipo_dispositivo`, `aeronave_id`
- FK explícita em schema: `empresa_id -> empresas.id`, `aeronave_id -> aeronaves.id`
- Papel atual: reserva física principal + payload de calendário/sessão.

2) `sessoes_participantes` (tripulação da sessão)
- PK: `id`
- Campos-chave: `sessao_id`, `funcionario_id`, `funcao`, `status`, `deleted_at`
- Índices em `sessao_id` e `funcionario_id`
- Papel atual: participantes por sessão com função macro (`PIC/SIC`).
- Lacuna: sem `empresa_id` próprio e sem vínculo curricular individual.

3) `fichas_sessao` (avaliação por participante)
- PK: `id`
- Campos-chave: `agendamento_slot_id`, `colaborador_id_aluno`, `instrutor_id`, `funcao_na_sessao`, `carga_horaria_total`, `carga_horaria_pf`, `carga_horaria_pm`, `status`, `resultado_final`, `aprovado`, `template_id`, `tipo_sessao`, `empresa_id`
- Papel atual: ficha individual vinculada ao agendamento.
- Não há constraint de unicidade para `(agendamento_slot_id, colaborador_id_aluno)`; runtime evita duplicação via código.

4) `qualificacoes_historico` (progressão/histórico)
- PK: `id`
- Campos-chave: `funcionario_id`, `qualificacao_codigo`, `status`, `data_conclusao`, `sessao_id`, `empresa_id`
- Papel atual: grava planejada/concluída, inclusive associando sessão por `sessao_id`.

5) `modelos_sessao` e `tipos_sessao` (catálogo curricular)
- `modelos_sessao`: contém `tipo_sessao_id`, `qualificacao_tipo_id`, `gera_qualificacao`, `modelo_aeronave`, `empresa_id`.
- `tipos_sessao`: taxonomia por tenant (`codigo`, `nome`, `empresa_id`).

6) `sessoes` (legacy)
- Estrutura distinta (`data_inicio`, `data_fim`, etc.) e apenas 1 registro ativo atualmente.
- Existe endpoint legado `/api/sessoes` em `index.ts`, mas o runtime operacional de simuladores usa `/api/simuladores/sessoes` + `simulador_agendamentos`.
- Evidência adicional: `simulador_agendamentos_ativos = 47` versus `sessoes_ativas = 1`.

### 4.3 Riscos de modelo atual

- Falta de entidade de segmento horário impede PF/PM por trecho.
- `fichas_sessao.funcao_na_sessao` está estática (default PF), não segmentada.
- Participante de apoio sem ficha não é suportado no fluxo padrão (cria ficha para todos).
- Conflito interno “mesma reserva compartilhada” não existe; só há conflito por slot de simulador.

## 5. Fluxo runtime

### 5.1 Backend principal

- Orquestrador: `worker-airtrust/src/routes/simuladores-core.ts`
- Sessões:
  - `GET /simuladores/sessoes`
  - `POST /simuladores/sessoes`
  - `GET /simuladores/sessoes/:id`
  - `PUT /simuladores/sessoes/:id`
  - `DELETE /simuladores/sessoes/:id`
- Participantes/checks:
  - `GET/POST /simuladores/sessoes/:id/participantes`
  - `PUT/DELETE /simuladores/participantes/:id`
  - `GET /simuladores/sessoes/:id/checks`
- Fichas:
  - `GET/POST /simuladores/fichas`
  - `GET/PUT/DELETE /simuladores/fichas/:id`
  - `POST /simuladores/fichas/:id/assinar`
  - `POST /simuladores/fichas/:id/pdf`
- Calendário frontend usa `GET /simuladores/sessoes`.

### 5.2 Criação de sessão (ponto crítico)

Em `POST /simuladores/sessoes`:

- Cria 1 linha em `simulador_agendamentos`.
- Insere participantes em `sessoes_participantes`.
- Cria ficha para **cada participante** em `fichas_sessao`.
- Popula manobras de cada ficha.
- Pode gerar qualificações planejadas por participante conforme modelo.

Consequência:
- Hoje “2 participantes” implica “2 fichas” automaticamente (sem distinguir apoio/curricular).

### 5.3 Edição/cancelamento/conclusão

- `PUT /simuladores/sessoes/:id`:
  - Revalida conflito de slot de simulador.
  - Atualiza sessão.
  - Reescreve participantes e ajusta fichas (adiciona/remove conforme lista).
  - Pode resetar fluxo das fichas (`resetar_fluxo_fichas`).
  - Ao concluir sessão, sincroniza qualificações planejadas para concluídas.
- `DELETE /simuladores/sessoes/:id`:
  - Soft-delete sessão, participantes, fichas e qualificações planejadas ligadas.
  - Não há cancelamento parcial curricular nativo (por atribuição).

## 6. Casos reais analisados

### 6.1 Anonimização

- Piloto A = nome de guerra `Ramos`
- Piloto B = `Vargas`
- Piloto C = `Monteiro`

### 6.2 Evidências encontradas (produção, read-only)

- Sessões encontradas para A/B/C em `simulador_agendamentos` com `sessoes_participantes` em pares PIC/SIC.
- Há sequência operacional real com temas `PER 01/03`, `PER 02/03`, `PER 03/03` e `INI 01/12 ... 12/12`.
- Para praticamente todas as sessões com dois participantes, há duas fichas (`fichas_sessao`) em status `AVALIACAO_PENDENTE`.
- Também há sessão de participante único (`id 101`) com 1 participante e 1 ficha.
- Não foram encontrados overlaps de simulador entre agendamentos distintos (query de sobreposição retornou vazio).

### 6.3 Leitura funcional dos casos

- O responsável parece estar modelando a operação compartilhada como sessões independentes sequenciais no mesmo dia (ex.: `id 75` e `id 100`, mesmo tema macro, slots consecutivos).
- O padrão atual força “uma sessão = um tema/tipo + ficha para todos”, o que explica a dificuldade de representar “um cumpre currículo, outro só apoia”.

## 7. Conflitos

### 7.1 Como o conflito é detectado hoje

- Função `findSessaoConflict` em `simuladores-shared.ts`.
- Critério:
  - mesmo `simulador_id`
  - datas candidatas (dia anterior/atual/próximo para lidar com virada)
  - interseção de intervalo (`hora_inicio/hora_fim`)
  - exclui o próprio `id` no PUT.

### 7.2 O que não entra no conflito de criação/edição de sessão

- Não há bloqueio explícito por:
  - instrutor já alocado em outra sessão,
  - participante já alocado em outra sessão,
  - choque com EVD/escala no ato de salvar sessão.

O sistema publica eventos para escala (`syncSessaoEscalaEventos`), mas não usa isso como trava hard no `POST/PUT` de simuladores.

### 7.3 Causa do problema para sessão compartilhada

- O motor não conhece “grupo interno da mesma reserva”.
- Como o compartilhamento hoje exigiria duas sessões para separar currículos, qualquer tentativa de sobreposição real cairá no bloqueio por simulador/horário.

### 7.4 Regra segura proposta (alvo)

- Permitir sobreposição apenas quando pertencem ao mesmo `agendamento_pai` (reserva física única).
- Continuar bloqueando sobreposição entre reservas distintas.
- Sem flag genérica de “ignorar conflito”.

## 8. Fichas

### 8.1 Estado atual

- Natureza: ficha individual por linha em `fichas_sessao`.
- Criação atual em sessão: 1 ficha por participante.
- Suporta duas fichas no mesmo agendamento (`agendamento_slot_id`), já observado em produção.
- Não existe constraint que force “todo participante deve ter ficha” no banco; isso é comportamento de código.

### 8.2 Limitações para o contrato novo

- Não há distinção “ficha curricular” vs “participação apoio”.
- `funcao_na_sessao` nas fichas fica estática e, nos casos inspecionados, sempre `PF`.
- `carga_horaria_pf`/`carga_horaria_pm` estão nulas na maioria dos casos recentes.
- PDF assume sessão única por ficha e não contempla explicitamente múltiplos segmentos curriculares dentro da mesma reserva.

## 9. Carga horária

### 9.1 Como é calculada/exibida hoje

- No `GET /fichas/:id`, `carga_horaria_total` é derivada de `duracao_minutos` do agendamento.
- PF/PM exibidos como split fixo 50/50 no payload de leitura (não por segmento real).
- Persistência de PF/PM granular não está consistente no banco para os casos auditados.

### 9.2 Registro em `horas_voo_lancamentos`

- Existe handler `syncHorasVooFromSimulador`.
- O contrato atual de horas suporta `duracao_pic_min`/`duracao_sic_min`, porém a integração simulador atual não demonstra uso robusto de PF/PM segmentado por piloto para o novo cenário.

## 10. Progressão

- Progressão/qualificação deriva de:
  - qualificações planejadas na criação/edição de sessão;
  - geração via fluxo de assinatura de ficha (`gerarQualificacaoDaFicha`).
- Sem distinção nativa de “participante apoio”.
- Comportamento atual de auto-ficha para todos tende a induzir progressão para ambos, a menos de controles operacionais manuais.

## 11. Alternativas arquiteturais

### Opção 1 — Agendamento pai + segmentos

- Prós:
  - Modela exatamente reserva física única com segmentos PF/PM.
  - Isola conflito externo mantendo lógica atual no pai.
  - Permite dois currículos independentes dentro da mesma reserva.
- Contras:
  - Requer novas entidades.
  - Exige ajustes em APIs e UI para edição de segmentos.
- Risco: médio (mudança estrutural, porém bem delimitada).

### Opção 2 — Duas sessões curriculares filhas de uma reserva física

- Prós:
  - Semântica curricular explícita por filho.
- Contras:
  - Duplica complexidade de conflito, edição, cancelamento e calendário.
  - Alto risco de regressão em relatórios/fichas/qualificações.
- Risco: alto.

### Opção 3 — Uma sessão com múltiplos planos individuais

- Prós:
  - Mantém sessão única no topo.
  - Pode evitar duplicação de reservas.
- Contras:
  - Se não houver segmentos estruturados, PF/PM por hora vira lógica frágil.
  - Excesso de JSON opaco reduz auditabilidade SQL.
- Risco: médio-alto.

### Opção 4 — Reusar estrutura atual sem nova entidade de segmento

- Prós:
  - Menor esforço inicial.
- Contras:
  - Não atende PF/PM por segmento de forma confiável.
  - Não resolve “apoio sem ficha” com rastreabilidade adequada.
- Risco: alto de dívida e comportamento ambíguo.

## 12. Recomendação

Recomendação única: **Opção 1 híbrida com reuso máximo da estrutura atual**.

- Manter `simulador_agendamentos` como reserva física pai (sem quebrar legado).
- Manter `sessoes_participantes` como tripulação compartilhada.
- Introduzir estrutura aditiva mínima para:
  - segmentos PF/PM por intervalo;
  - atribuição curricular individual por participante.
- Fazer geração de ficha condicionada à atribuição curricular (não para apoio).
- Preservar endpoint atual para sessão simples sem obrigar novos campos.

## 13. Contrato de dados proposto

### 13.1 Entidades propostas (aditivas)

1) `simulador_segmentos`
- `id` PK
- `agendamento_id` FK -> `simulador_agendamentos.id`
- `empresa_id` NOT NULL
- `inicio_min`, `fim_min` (ou `hora_inicio`, `hora_fim`)
- `ordem`
- `status` (`ATIVO`, `CANCELADO`)
- `created_at`, `updated_at`, `deleted_at`
- Índices: `(empresa_id, agendamento_id, deleted_at)`, `(agendamento_id, ordem)`

2) `simulador_segmento_participantes`
- `id` PK
- `segmento_id` FK -> `simulador_segmentos.id`
- `participante_id` FK -> `sessoes_participantes.id`
- `empresa_id` NOT NULL
- `funcao` CHECK (`PF`,`PM`)
- `created_at`, `updated_at`, `deleted_at`
- UNIQUE parcial: `(segmento_id, participante_id)` ativo

3) `simulador_atribuicoes_curriculares`
- `id` PK
- `agendamento_id` FK -> `simulador_agendamentos.id`
- `participante_id` FK -> `sessoes_participantes.id`
- `empresa_id` NOT NULL
- `modo` CHECK (`CURRICULAR`,`APOIO`)
- `treinamento_planejado_id` nullable FK
- `modelo_sessao_id` nullable FK
- `qualificacao_tipo_id` nullable FK
- `ficha_obrigatoria` boolean
- `status` (`ATIVA`,`CANCELADA`,`CONCLUIDA`)
- `created_at`, `updated_at`, `deleted_at`
- UNIQUE parcial: 1 atribuição ativa por participante/agendamento.

### 13.2 Ajustes aditivos opcionais em tabela existente

- `fichas_sessao.atribuicao_curricular_id` nullable FK (facilita rastreio curricular).
- `fichas_sessao.tipo_participacao` (`CURRICULAR`/`APOIO`) opcional para leitura legacy.

## 14. API proposta

### 14.1 Compatibilidade

- Manter `POST /simuladores/sessoes` para sessão simples atual.
- Tornar compartilhada opt-in por novo campo `modo_compartilhado: true`.

### 14.2 Payloads (conceito)

1) Criar simples (legacy)
- Contrato atual inalterado.

2) Criar compartilhada
- Campos atuais de reserva +:
  - `segmentos[]` com horários e PF/PM por participante.
  - `atribuicoes[]` por participante:
    - `modo: CURRICULAR|APOIO`
    - `treinamento_planejado_id`/`modelo_sessao_id` quando curricular.

3) Editar reserva
- PUT atual + diffs de `segmentos` e `atribuicoes`.

4) Cancelar atribuição específica
- `PATCH /simuladores/sessoes/:id/atribuicoes/:atribuicaoId/cancelar`

5) Cancelar reserva inteira
- DELETE atual (mantido) + regra clara de cascata.

6) Concluir ficha curricular
- Fluxo atual de assinatura mantido, validando vínculo de atribuição curricular.

### 14.3 Regras server-side obrigatórias

- Nunca confiar em `empresa_id` do body.
- Bloquear `modo=CURRICULAR` sem modelo/treinamento obrigatório.
- Bloquear ficha para `modo=APOIO`.
- Validar cobertura total de segmentos para participantes.

## 15. Interface proposta

No `ModalNovaSessao`:

- Seletor inicial:
  - `Sessão simples` (default, fluxo atual)
  - `Sessão compartilhada` (novo)
- Em compartilhada:
  - reserva total (simulador/instrutor/período)
  - dois participantes
  - editor de segmentos com PF/PM
  - para cada participante:
    - “Cumpre treinamento nesta reserva?” (sim/não)
    - se sim: treinamento/modelo/sessão
    - se não: marcar apoio
  - resumo automático:
    - horas PF/PM por participante
    - fichas previstas (somente curriculares)

## 16. Compatibilidade

- Sessões simples antigas continuam pelo contrato atual sem migração de dados antiga.
- Nova modalidade só entra com `modo_compartilhado=true`.
- Leitura legacy preservada:
  - endpoints existentes continuam retornando os campos atuais.
- Sem remoção imediata de colunas ou tabelas antigas.

## 17. Riscos

- Reset de fichas em edição já é sensível hoje; com compartilhada exige escopo por atribuição.
- Relatórios e PDF assumem tema único por sessão; precisam adaptação controlada para múltiplas atribuições.
- Conciliação com `treinamentos_planejados` precisa regra explícita para evitar dupla contagem.
- Migrações pendentes do ambiente precisam governança para não contaminar rollout desta feature.

## 18. Testes

### 18.1 Caracterização (antes do patch)

- Sessão simples criar/editar/excluir.
- Geração e assinatura de ficha simples.
- Conflito atual de simulador.
- Calendário/listagem/detalhe.

### 18.2 Novos testes (shared)

1. Dois pilotos, dois currículos distintos.
2. Duas fichas no mesmo agendamento pai.
3. Segmentação PF/PM (1h + 1h) correta para ambos.
4. Carga total correta por participante curricular.
5. Um curricular + um apoio.
6. Apenas uma ficha no cenário curricular+apoio.
7. Apoio sem progressão.
8. Conflito interno permitido no mesmo pai.
9. Conflito externo bloqueado.
10. Simulador/instrutor reservados uma vez.
11. Cancelamento parcial de atribuição.
12. Cancelamento total da reserva.
13. Edição de segmentos.
14. PDF coerente por ficha curricular.
15. Tenant isolation.
16. Sessões antigas inalteradas.
17. Compatibilidade endpoint legacy.
18. Calendário e relatórios consistentes.

## 19. Rollback

- Feature flag para compartilhada (backend + frontend).
- Rollback funcional: desativar flag preservando sessão simples.
- Rollback de schema: como migration aditiva e sem drop, manter leitura legacy intacta.
- Não converter automaticamente dados antigos.

## 20. Plano em macro-lotes

### Macro-lote A — Modelo de dados e backend
- Migrations aditivas (segmentos + atribuições).
- Validações e conflito interno/externo.
- Geração condicional de ficha (curricular vs apoio).
- Horas/progressão por atribuição.
- Testes backend.

### Macro-lote B — Interface e experiência
- Extensão do modal para compartilhada.
- Detalhe da sessão com segmentos/atribuições.
- Calendário com visualização de reserva compartilhada.
- Fluxos de edição/cancelamento parcial.
- Testes frontend.

### Macro-lote C — Validação real e rollout
- Dados de ensaio controlados.
- Sessão real piloto com monitoramento.
- Ativação gradual por flag.
- Plano de rollback + documentação operacional.

## 21. Questões ainda abertas

1. A reserva compartilhada sempre terá exatamente 2 participantes ou deve suportar N?
2. A distribuição PF/PM por segmento sempre cobre 100% do tempo para ambos?
3. Em cancelamento parcial, como ficam qualificações planejadas já criadas?
4. PDF deve listar apenas segmento curricular do avaliado ou todos segmentos da reserva?
5. Em edição retroativa, mantém histórico da versão curricular antiga ou substitui?

## 22. Conclusão

- O modelo atual já suporta operação com dois participantes e duas fichas no mesmo agendamento, mas não atende de forma segura/estruturada os requisitos de sessão compartilhada curricular + apoio e PF/PM por segmento.
- O conflito hoje é corretamente rígido para reserva única por simulador/horário, porém sem noção de hierarquia pai/filho interno.
- A menor mudança segura é evolução aditiva sobre `simulador_agendamentos`/`sessoes_participantes`/`fichas_sessao` com novas entidades de segmento e atribuição curricular, preservando sessão simples legacy.
- Não foi executada qualquer alteração funcional, deploy, escrita de dados, ou migration nesta auditoria.


# FRMS — Fechamento da auditoria e parecer (2026-11-16)

Base: `origin/main` b9bae5f. Produção servindo `5823090` (Worker e Pages, mesma versão). Escopo: o que sobrou da
auditoria integral de 2026-11-03 e da rodada de check-in de 2026-11-15, sem repetir o que já estava comprovado
(`FRMS_AUDITORIA_INTEGRAL_20261103.md`, `FRMS_CHECKIN_OBRIGACAO_QUINZENA_20261115.md`). Nada aqui é aprovação
ou aceitação da ANAC.

## 1. O que está em produção e o que só existe na `main`

Prova por ancestralidade de commit contra o SHA servido por `/api/version` (as rotas privadas respondem 401 a
qualquer caminho sem token, então o teste de rota sem login não distingue versões):

| Mudança | Em produção (`5823090`) | Observação |
|---|---|---|
| #2356 regra canônica de check-in | Sim | Validada com dados reais (seção 2) |
| #2382 escalonamento de casos vencidos e reabertura | Sim | Código no ar; **primeiro cron diário ainda não observado** |
| #2383 auditoria de integridade com férias e afastamento | Sim | Só altera a contagem da notificação diária global |
| #2384 lista da equipe inclui quem tem obrigação por qualquer fonte | Sim | Teste HTTP ponta a ponta na `main` |
| #2381, #2385, #2391, #2392 sondas somente leitura e telemetria | Não se aplica | Workflows e scripts; nenhuma mudança de runtime |
| #2396 triagem global de casos antes da paginação | **Não** | Altera Worker e Pages, integrada à `main` no SHA `490c21be...`; precisa de release e pós-validação |
| #2397 fixture sintética F0C em staging | Não se aplica | Correção de teste; aguardando gates e execução governada |

**Atualização de proveniência (16/11):** a conclusão anterior de ausência de mudanças de runtime
pendentes era válida somente antes da PR #2396. Após sua integração, **há delta FRMS Worker + Pages ainda
não publicado em produção**. O encerramento exige staging, autorização de produção para o SHA exato,
deploy governado e pós-validação. Produção `5823090` também recebeu mudanças de outras frentes
(auth/LMS #2370, perf #2389, PTO #2390).

## 2. Check-in com dados reais de produção

Leitura somente leitura (D1 de produção fixado por id, adaptador que só aceita `SELECT`/`WITH`, 0 escritas),
empresa 6, 16/10 a 16/11, 24 tripulantes, 768 tripulantes-dia. A regra real (bundle do código implantado, com
prova de que os arquivos são idênticos ao SHA servido) foi comparada com um oráculo independente que carrega EVD,
jornada SIGVOOS, simulador, treinamento, atividade informada e Controle de Voos.

| Resultado | Valor |
|---|---|
| Violações das 7 invariantes | **0** |
| Avisos (Controle de Voos como evidência consultiva) | **0** |
| Status | RECEBIDO 221, NAO_APLICAVEL 312, INDETERMINADO 164, PENDENTE 71 |
| Tripulantes-dia com alocação operacional inequívoca | 16 |
| Ausências programadas por alocação (folga, férias, MED, AFT) | 0 no período |
| Lacunas de quinzena quebrada | 0 |
| Divergência de dados | `ATIVIDADE_FORA_DA_ESCALA` 72 |

Execuções: 43920344991, 43947817200, 43954393551 (check-in); mesma conclusão nas três.

### Conciliação 71 × 56

`71 = 56 + 15`. O 56 que citei antes era uma **subtração minha** (221 − 164 − 1), não uma contagem. O cruzamento
status × base mostra:

| Status/base | Tripulantes-dia |
|---|---|
| PENDENTE / ATIVIDADE_REGISTRADA | 56 |
| PENDENTE / ALOCACAO_OPERACIONAL | 15 |
| RECEBIDO (todas as bases) | 221 |

Os 15 de alocação são tripulantes alocados fora da própria quinzena-base: a regra antiga não os enxergava e a
nova os cobra. A regra antiga teria 221 pendências sem check-in; hoje 56 delas seguem pendentes, 164 viraram
"escala a confirmar" e 1 não se aplica, e mais 15 pendências reais aparecem.

### Os dias "escala a confirmar" (`QUINZENA_BASE_SEM_ESCALA`)

No total são 185 tripulantes-dia de 23 tripulantes (164 sem check-in, 21 com check-in recebido). **Não existe
nenhuma outra fonte de escala para eles**: 185 sem ciclo FRMS por pessoa (`frms_escala_quinzenal`), 185 sem linha
de jornada FRMS no dia, 157 sem alocação por perto. A evidência de trabalho na mesma quinzena:

| Evidência na mesma quinzena | Tripulantes-dia | Leitura |
|---|---|---|
| Nenhuma atividade nem check-in | 106 | Coerente com folga ou não embarque: cobrar seria pendência artificial |
| Houve atividade em outro dia da quinzena | 71 | Podem ser dias de embarque sem voo; depende de política |
| Quinzena parcial na janela | 8 | Não conclusivo |

Conclusão técnica: tratar a quinzena-base como obrigação teria criado 106 pendências artificiais de 185. Os 71
dias de quinzena com atividade são uma **decisão operacional** (seção 8), não um defeito.

## 3. Cadeia SIGVOOS → Controle de Voos → FRMS

Execuções 43920351700, 43947823476, 43954399618, leitura somente leitura, 0 violações:

| Item | Resultado |
|---|---|
| Ingestão diária | Marco em 14/11, 0 falhas consecutivas, 0 falhas nos últimos 14 dias, 494 processados e 8 falhas acumuladas |
| Reingestão retroativa D−3..D−1 | **Ativa**: última rechecagem em 15/11 |
| Integridade | 0 etapas duplicadas, 0 hash de conteúdo repetido, 0 jornadas duplicadas, 0 órfãos, 0 linhas de outra empresa, índice único de tripulantes presente |
| Art. 42 | `INACTIVE` |
| **Voos no Controle de Voos no período** | **0** (contra 203 tripulantes-dia de jornada SIGVOOS direta) |
| **Ledger de cobertura diária** | **0 linhas** |

### Correção de premissa

Eu havia dado AUD-025 (reingestão retroativa) como pendente. **Estava errado**: ela existe desde `f293ad21b`
(2026-11-03), com testes, e está rodando em produção. Repeti o texto do relatório antigo e da memória sem
conferir o código. O que realmente falta é outra coisa: a cadeia por Controle de Voos e o ledger **não estão
ativos** para a empresa 6, porque são opt-in por empresa (`CONTROLE_VOOS_FRMS_IMPORT_TENANTS` e
`FRMS_SIGVOOS_CV_COVERAGE_APPROVED_TENANTS`, variáveis do Worker fora do repositório). Hoje o FRMS opera sobre
jornadas SIGVOOS diretas, e os acumulados legais não têm atestação de cobertura por dia.

### Transição segura (nenhuma chave foi ativada)

Só ativar quando todos estes critérios estiverem comprovados, nesta ordem:

| # | Critério | Como medir |
|---|---|---|
| G1 | Equivalência de dados | Em staging com modo sombra, comparar tripulantes-dia do Controle de Voos com jornadas SIGVOOS; na produção, `RECONCILIATION.days_both` deve cobrir os dias e `days_only_cv`/`days_only_frms_jornada` devem ser explicados um a um |
| G2 | Cobertura histórica | Dry-run governado `production-frms-sigvoos-resync.yml` (modo `verify`) sobre a janela dos acumulados, sem `apply` |
| G3 | Sem duplicação | Importador idempotente por hash de carga; sonda de integridade em 0 duplicados e índice único presente, antes e depois |
| G4 | Reversão | Ponto de recuperação do D1 antes de ligar; desligar a chave interrompe novas escritas; linhas importadas têm `origem_dados = 'SIGVOOS'` e `sigvoos_importado_em`, então o conjunto a reverter é identificável |
| G5 | Canário | Primeiro em staging na empresa sintética, depois uma empresa em produção, com a sonda de cadeia antes e depois |
| G6 | Ledger | Só aprovar `FRMS_SIGVOOS_CV_COVERAGE_APPROVED_TENANTS` depois de G1 a G5, para não atestar cobertura sobre fonte não equivalente |
| G7 | Autorização | Mudança de variável de produção exige aprovação específica com SHA e escopo |

## 4. Escalonamento de casos vencidos (AUD-021)

Mecanismo em produção. Estado real, lido por `CASE_LIFECYCLE`:

| Medida | Valor |
|---|---|
| Casos abertos | 152 |
| Sem tratamento registrado | **152 (100%)** |
| Com prazo vencido | 0 |
| Notificações `FRMS_CASE_OVERDUE` (7 dias) / registros `PRAZO_VENCIDO` (14 dias) | 0 / 0 |
| Idade dos sem tratamento | até 7 dias: 89; 8 a 30: 55; 31 a 90: 5; mais de 90: 3 |

Consequência: **o escalonamento atual não dispara para nenhum desses casos**, porque o prazo é o que o gestor
registra no tratamento e nenhum caso foi tratado. O sistema não inventa prazo. O problema real é o backlog sem
tratamento, que depende de uma **definição da empresa** (prazo máximo até o primeiro tratamento e quem escala).
O cron real não pode ser disparado em staging; a validação em produção é: depois do primeiro cron diário com um
caso tratado e vencido, a sonda de cadeia deve mostrar `overdue_notifications_7d > 0` e
`overdue_audit_rows_14d > 0`, e o aviso `OVERDUE_CASES_WITHOUT_ESCALATION_RECORD` deve sumir.

## 5. Testes ponta a ponta

| Teste | Ambiente | Resultado |
|---|---|---|
| Check-in sintético (brief 60 s, KSS, atualização no mesmo dia) | Staging `a2f42dc`, execução 43948647576 | Passou |
| Acesso direto FRMS, snapshot do tenant sintético | Staging `a2f42dc`, execução 43948658879 | Passou |
| Aceite da escala de voo diária somente leitura | Staging | **Não comprovado ainda.** Falhou duas vezes antes de abrir o navegador (execuções 43948653064 e 43955756879): na primeira a `main` tinha andado; na segunda o runner `ubuntu-latest` (Ubuntu 26.04) não instala o Chromium do Playwright. Esta PR fixa `ubuntu-24.04`; precisa ser reexecutado depois do merge |
| Linha do tempo por HTTP: voo cancelado retroativamente, check-in antes da correção da escala, férias com voo inserido depois, lacuna com simulador, voo só no Controle de Voos, quinzena-base sem escala, papéis (gestor, tripulante, visualizador, gestor de outra empresa) | Rota real e SQL real em SQLite, na `main` | Passou (6 cenários) |
| Navegador autenticado em produção, somente leitura | Produção `fe0e2de`, execução 43789746916 | Passou |

Limite: o adaptador do Controle de Voos é simulado na fronteira do módulo nos testes de SQLite; o SQL do próprio
Controle de Voos só é exercitado nas sondas de produção, onde não há voos (seção 3). Não existe, ainda, cenário
com várias contas de papéis diferentes em staging; os papéis foram provados por rota real com RBAC reproduzido.

## 6. Defeitos encontrados e corrigidos nesta rodada

| Defeito | Correção | Prova |
|---|---|---|
| Sonda de leitura aceitava `SELECT '--'; DELETE ...` (comentário antes de literal) | Varredura de uma passada e recusa de `;` | Teste contra SQLite real: a linha sobrevive |
| Oráculo ignorava simulador, treinamento e Controle de Voos | Oráculo carrega todas as fontes | Testes de mutação |
| Pendência por alocação não era exigida pelo oráculo | Invariante recíproca | Teste de mutação |
| Varredura de casos vencidos lia só 500 casos e tratava o resto como zero | Pré-filtro, cursor e falha explícita ao atingir o limite | Regressões com 501 e 1100 casos |
| Reabertura perdia o histórico ao registrar novo tratamento | Histórico carregado adiante | Teste de ciclo duplo |
| Auditoria diária contava férias e afastamento como "dentro da escala" (mesma classe do #2356) | Módulo único com ausência fora da escala | Mutação: 3 contra 7 |
| Lista da equipe omitia quem só tinha atividade por Controle de Voos, simulador ou treinamento | Ids com obrigação entram via `json_each` | Teste HTTP |
| `ubuntu-latest` (Ubuntu 26.04) não instala o Chromium do Playwright | Runner proposto em `ubuntu-24.04` | **Pendente:** reexecutar aceite staging autenticado depois do merge, sem alegar sucesso prévio |

## 7. Auditoria consolidada

- **Matemática.** Nenhum cálculo foi alterado nesta rodada. Os oráculos de limites e o modelo de referência
  (`frms-reference-model.ts`, `frms-scientific-audit.test.ts`) seguem no CI da `main`, com os oito gates verdes
  em `a2f42dc`. Não repeti. Lacuna que continua: sem atestação de cobertura, os acumulados de 28 e 365 dias não
  podem ser declarados completos para a empresa 6 (seção 3).
- **Regulatória.** Matriz de 03/11 inalterada. Art. 42 calculado e **inativo**, condição em
  `FRMS_ART42_CONDICAO_DE_APLICABILIDADE_20261116.md`. AUD-011, AUD-012 e AUD-013 seguem dependentes de
  interpretação.
- **Operacional.** Check-in comprovado em produção (seção 2). Backlog de 152 casos sem tratamento é o maior risco
  operacional visível.
- **Usabilidade.** Provado: testes de componentes (painel de casos com reabertura, decisão operacional) e
  navegador autenticado em produção, somente leitura. **Não provado:** sessão com usuários reais de cada perfil.

## 8. Pendências separadas por natureza

**Técnicas (mensuráveis, sem decisão externa)**
1. Observar o primeiro cron diário do escalonamento em produção (depende de existir caso tratado e vencido).
2. Reexecutar o aceite da escala de voo diária em staging depois do merge desta PR (runner corrigido).
   Outros workflows de outras frentes (LMS, treinamentos, simuladores) têm o mesmo risco latente de runner e não foram alterados.
3. Cenário em staging com contas de papéis diferentes.
4. Sessão de usabilidade por perfil com usuários reais.

**Decisões operacionais (da empresa)**
1. Prazo máximo até o primeiro tratamento de um caso e hierarquia de escalonamento (152 casos sem tratamento).
2. Os 71 tripulantes-dia de quinzena-base com atividade em outro dia da mesma quinzena: tratar como embarque sem
   voo (exigindo check-in) ou manter "escala a confirmar".
3. Publicar alocações e ausências no sistema: hoje nenhuma folga, férias ou afastamento existe como alocação.
4. Ativar a cadeia SIGVOOS → Controle de Voos e o ledger (seção 3, G1 a G7).
5. Encaminhamento ao SGSO a partir do caso, que depende do fluxo SGSO.

**Jurídicas (não são pendência de software)**
1. Ativação do art. 42 (`law_art42_enforced`) e exceção de aeromédico e manutenção.
2. AUD-011 (44 h semanais), AUD-012 (8 folgas), AUD-013 (antecedência de 20 dias da escala).

## 9. Parecer

| Frente | Nota (0 a 10) | Critério |
|---|---|---|
| Obrigação de check-in | 8,5 | Zero violações em 768 tripulantes-dia reais; oráculo independente; HTTP ponta a ponta; falta decisão dos 71 dias |
| Ingestão SIGVOOS e rechecagem retroativa | 8,0 | Fresca, sem falhas, rechecagem diária provada, sem duplicação |
| Lista da equipe, lembrete e status individual | 8,0 | Mesma regra nos consumidores, provada por HTTP; lembrete ainda não observado em produção após as mudanças |
| Escalonamento e reabertura de casos | 6,0 | Mecanismo publicado e testado; nunca disparou em produção porque nenhum caso tem tratamento |
| Cadeia SIGVOOS → CV → FRMS e ledger | 4,0 | Desligada em produção; sem cobertura atestada para os acumulados |
| Conformidade regulatória | 6,5 | Art. 42 calculado e inativo; AUD-011/012/013 abertas; sem aceite da ANAC |
| Usabilidade | 7,0 | Componentes e navegador autenticado provados; sem teste por perfil real |

Nota geral **7,0**, ponderando pelo risco operacional.

**Classificação: APROVADO COM RESTRIÇÕES** para check-in, ingestão e lista da equipe. **Não aprovada** a cadeia
SIGVOOS → Controle de Voos → FRMS (desligada e sem equivalência provada) nem o ciclo de tratamento como processo
(backlog sem tratamento e política indefinida). Isto não constitui aprovação nem aceitação da ANAC.

O aceite da escala de voo diária em staging **não** foi comprovado nesta rodada (seção 5); a classificação acima
depende apenas de evidências que foram executadas. A PR #2396 foi integrada depois da base deste relatório,
e requer validação de Worker + Pages e release específico para não deixar a produção com a fila incompleta.

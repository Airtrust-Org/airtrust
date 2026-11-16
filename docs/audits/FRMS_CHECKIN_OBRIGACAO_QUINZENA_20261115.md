# FRMS — Obrigação de check-in fora da quinzena: auditoria, correção e parecer (2026-11-15)

Base: `origin/main` 26644dae0. Branch: `fix/frms-checkin-obrigacao-quinzena-20261115`.
Escopo desta rodada: defeito prioritário de check-in fora da quinzena e todos os caminhos
que geram "check-in pendente". A auditoria integral de 2026-11-03
(`FRMS_AUDITORIA_INTEGRAL_20261103.md`, matriz regulatória e oráculo de limites) continua
válida para o SHA mesclado em #1922/#1937 e **não foi refeita**; este documento registra
apenas o delta.

## A. Diagnóstico inicial

A pendência de check-in era decidida em **cinco lugares diferentes**, com cinco regras
diferentes, e nenhuma tratava ausência programada nem quinzena quebrada:

| # | Onde | Regra antiga | Efeito operacional |
|---|---|---|---|
| D1 | `lib/frms/operational-snapshot.ts` (painéis, fila operacional, indicador quinzenal, read-ack) | `pertenceQuinzenaAtiva \|\| escalado \|\| atividade` ⇒ `PENDENTE` | Presença no "roster" bastava para gerar `CHECKIN_PENDENTE` |
| D2 | Consulta de períodos de missão (mesmo arquivo) | Alocação com `quinzena_id` usava `COALESCE(eq.data_inicio, ea.data_inicio)` | Alocação de 01–05 virava embarque 01–15 (quinzena quebrada esticada) |
| D3 | Mesma consulta | Só `FOLGA` era excluída | Alocações de `FERIAS`, `MED` e `AFT` contavam como embarque ⇒ pendência diária durante férias/afastamento |
| D4 | Mesma consulta | Quinzena-base (`funcionarios.quinzena`) sempre somada | Tripulante remanejado na escala continuava "na quinzena" pelo atributo estático |
| D5 | EVD no snapshot | `escala_voo_diaria` lida sem filtro de `status` | Voo `CANCELADA` contava como escalado ⇒ pendência e `ESCALADO_SEM_JORNADA_FRMS` |
| D6 | `cron/frms-fadiga-reminder.ts` | Todos os pilotos ativos sem check-in no dia; data UTC | Lembrete listava a empresa inteira, inclusive quem estava de folga; após 21h BRT usava o dia seguinte |
| D7 | `buildDailyFatigueStatus` (visão do tripulante e `/daily-fatigue/alerts`) | Sem check-in ⇒ `not_submitted` sempre | O próprio tripulante via "pendente" todo dia de folga |
| D8 | Roster da equipe (`daily-fatigue-team-roster.ts`) | Só lista quinzena-base atual, jornada ou check-in | Tripulante alocado fora da sua quinzena-base ou escalado só na EVD **não aparecia** (falso negativo) |
| D9 | Frontend `frmsOperationalDecision.ts` | Reaplicava `na_quinzena_ativa ⇒ Pendente` mesmo com status `NAO_APLICAVEL` | Mesmo corrigindo o backend, a tela mostraria pendência |
| D10 | `calcularDiaDoCiclo`, `fortnight-materialization`, `fortnight-coverage` | Alocação de férias/afastamento com `quinzena_id` = período embarcado | Dia do ciclo e diagnósticos de cobertura computados sobre férias |

Causa-mãe: não existia uma regra canônica de obrigação; cada consumidor inferia trabalho a
partir de presença na quinzena.

## B. Correções executadas

- **Regra canônica única** `worker-airtrust/src/lib/frms/checkin-obligation.ts`:
  `resolveCheckinObligation` (pura), `buildScheduleDayIndex` (escala por tripulante×dia) e
  `loadDailyCheckinObligations` / `loadCheckinScheduleEvidence` (D1, todas as consultas
  ancoradas em `empresa_id`, falha fechada em resposta malformada).
- **Snapshot** (D1–D5): status de check-in passa pela regra; novo campo
  `checkin_obrigacao {status, exigivel, base, rotulo, divergencias}`; períodos de missão
  usam as datas reais da alocação e excluem `FOLGA/FERIAS/MED/AFT`; EVD `CANCELADA` excluída;
  novo alerta `ESCALA_DIVERGENTE` (atividade/voo em dia de ausência ou escala conflitante).
- **Lembrete** (D6): só tripulantes com obrigação `PENDENTE`; data operacional de São Paulo;
  deduplicação pela data do check-in; exige `status = ATIVO`.
- **Status individual** (D7): `not_submitted` só com obrigação; caso contrário `no_duty` com
  mensagem explicando dispensa/escala a confirmar; consulta de jornada agora com `empresa_id`.
- **Roster da equipe** (D8): inclui alocação real do dia e EVD não cancelada; rótulos
  "Dispensado (escala)" e "Escala a confirmar".
- **Frontend** (D9): `requiresDailyFrmsCheckin`, dispensa verificada, rótulos e orientação
  obedecem a `checkin_obrigacao`; dispensa por escala deixa de aparecer como "dado incompleto";
  escala a confirmar orienta o responsável pela escala; divergência orienta reconciliação sem
  estender a obrigação.
- **Embarque/ciclo** (D10): ausências excluídas e `MED` incluído nas ausências bloqueantes.
- `CAUSA_POR_ALERTA.CHECKIN_PENDENTE` deixou de dizer "para voo escalado" (era falso para
  dias de serviço sem voo).

## F. Regra definitiva de check-in

Avaliada por tripulante × data operacional (data civil de São Paulo), em ordem:

1. **Check-in registrado** → `RECEBIDO`. A evidência nunca é apagada; `exigivel` informa se
   havia obrigação (ex.: check-in feito e escala depois corrigida para folga → recebido,
   não exigível).
2. **Atividade registrada no dia** — mesma evidência do snapshot operacional em todos os
   consumidores: jornada preferida (Controle de Voos nativo, fallback SIGVOOS canônico) com dado
   operacional (`journeyHasOperationalData`), ou atividade FRMS (simulador, treinamento,
   atividade informada no check-in) → `PENDENTE`, base `ATIVIDADE_REGISTRADA`. Jornada de origem
   não canônica não cria obrigação (política de fonte vigente). Se o dia é de
   ausência → divergência `ATIVIDADE_EM_AUSENCIA` + alerta `ESCALA_DIVERGENTE`; se não há
   nenhuma escala → `ATIVIDADE_FORA_DA_ESCALA` (alerta já existente `JORNADA_FRMS_SEM_ESCALA`).
   As horas permanecem nos acumulados; a obrigação **não** se estende aos dias vizinhos.
3. **Voo programado na EVD** (não cancelado; rascunho conta como programação) → `PENDENTE`,
   base `VOO_PROGRAMADO`; em dia de ausência gera `VOO_PROGRAMADO_EM_AUSENCIA`.
4. **Alocação de serviço e de ausência no mesmo dia** → `INDETERMINADO`
   (`ESCALA_CONFLITANTE`): divergência a reconciliar, sem presumir.
5. **Ausência programada** (alocação `FOLGA/FERIAS/MED/AFT` ou evento diário manual
   `folga/ferias/licenca`) → `DISPENSADO`. O evento diário manual prevalece sobre a alocação
   (forma de quebrar uma quinzena).
6. **Alocação operacional cobrindo o dia** (aeronave/quinzena sem situação, ou `STB`) →
   `PENDENTE`, base `ALOCACAO_OPERACIONAL` (política vigente: check-in diário durante o
   embarque, mesmo sem voo).
7. **Curso/simulador programado sem atividade registrada** → `NAO_APLICAVEL`.
8. **Só quinzena-base** (`funcionarios.quinzena`) **e nenhuma alocação do tripulante tocando
   aquela quinzena** → `INDETERMINADO`, base `QUINZENA_BASE_SEM_ESCALA`: aparece como "Escala a
   confirmar", não conta como inadimplência. Qualquer alocação publicada na quinzena (inclusive
   de ausência) torna a escala soberana.
9. Nada → `NAO_APLICAVEL`.

Separação de conceitos: **pendência** = `PENDENTE`; **divergência de dados** =
`INDETERMINADO`/`ESCALA_DIVERGENTE`; **dispensa** = `DISPENSADO`. Nenhum desses é avaliação de
risco de fadiga nem autorização de voo.

## D/E. Testes (demonstrados localmente)

| Suíte | Resultado |
|---|---|
| `checkin-obligation.test.ts` — oráculo escrito à mão (11 casos) + 2 propriedades + índice de escala | 19/19 |
| `checkin-obligation-sqlite.test.ts` — matriz do enunciado em SQLite real, tenant 7 × tenant 8; inclui simulador concluído sem jornada, voo do Controle de Voos sem `frms_jornada` e jornada não canônica (achado P1 da revisão automática) | 19/19 |
| `scripts/__tests__/frms-daily-team-roster-sqlite.test.mjs` (gate build-content-gates) — alocação real, alocação cancelada, EVD cancelada/publicada/de outra empresa | 2/2 |
| FRMS + cron + rotas + arquitetura (worker) após a correção do achado | 3984/3984 |
| `operational-snapshot.test.ts` — quinzena-base, alocação real, quinzena quebrada + férias, voo em folga com horas preservadas, contrato SQL (EVD cancelada, ausências, datas reais) | 44/44 |
| `frms-fadiga-reminder-obligation.test.ts` — lembrete só com obrigação, data SP | 1/1 |
| `frmsOperationalDecision.test.ts` (frontend) — rótulos/ação por obrigação | 27/27 |
| FRMS + cron (worker) antes da suíte completa | 1209/1209 após ajuste do teste que codificava o defeito |
| Suíte completa do Worker | 8709/8710; a falha era o guard de arquivos >2000 linhas (rota legada chegou a 2000). Mensagens movidas para o módulo canônico (rota: 1977 → 1981 linhas) e guard + suítes afetadas reexecutados: OK |
| Frontend FRMS/funcionários/controle de voos | 599/599 |
| `npm run lint` (todos os guards, inclusive layer-boundaries e schema-contract) | OK |
| `tsc` Worker | OK |

Matriz do enunciado coberta: quinzena ativa; fora da quinzena; quinzena dividida; folga
entre períodos; atividade real em folga; horas retroativas fora da quinzena (um dia só);
voo cancelado; jornada duplicada (não duplica obrigação); substituição (obrigação segue o
escalado atual); dia sem informação confiável (`INDETERMINADO`); check-in prévio + escala
corrigida (evidência preservada); inativo e outra empresa (sem vazamento de EVD, jornada ou
evento de outro tenant).

Não coberto nesta rodada (limitação de evidência): virada de meia-noite da jornada para a
obrigação (a data é a data operacional da jornada já normalizada pelo pipeline); trilha de
auditoria específica da reclassificação (a regra é calculada em leitura, sem gravação — a
rastreabilidade é o próprio `checkin_obrigacao.base` em cada resposta).

## Pendências herdadas (não alteradas)

- AUD-001 art. 42: implementado, ativação depende de parecer jurídico (`law_art42_enforced`).
- AUD-021: prazo vencido já visível (`VENCIDO` no painel de casos); escalonamento automático
  e reabertura ainda não existem.
- AUD-025: ingestão SIGVOOS retroativa (D−3…D−1) ainda não implementada; lançamentos
  retroativos aparecem quando chegam e a regra de obrigação os trata dia a dia.
- AUD-011/012/013: interpretação regulatória pendente de parecer.

## H. Parecer

| Funcionalidade | Antes | Depois (demonstrado em teste) |
|---|---|---|
| Obrigação de check-in | 3/10: pendência artificial em folga, férias e quinzena quebrada; falso negativo fora da quinzena-base | 8/10: regra única, rastreável por base, testada contra SQLite real; falta validação em ambiente publicado |
| Lembrete diário | 2/10: cobrava a empresa inteira | 8/10 |
| Separação pendência × divergência × dispensa | 3/10 | 8/10 |

**Classificação: REPROVADO para aceite técnico interno nesta data**, pelo critério
"validação indispensável não realizada": a correção ainda não foi publicada nem pós-validada
com dados reais de escala, e a pendência AUD-001 (art. 42) segue sem parecer jurídico.
Depois de staging + produção + pós-validação dos cenários A, B e E com tripulantes reais, a
frente de check-in pode ser reclassificada como **APROVADO COM RESTRIÇÕES** (restrições:
AUD-001, AUD-021 escalonamento, AUD-025).

Esta auditoria não constitui aprovação ou aceitação da ANAC. A operação sob GRF/SGRF e
qualquer limite diferenciado exigem as aprovações regulatórias próprias.

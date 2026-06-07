# AIRTRUST - Simulator June/July 2026 Sync Dry-Run - 2026-06-06

## Resultado

Classificacao final: `DRY-RUN CONCLUÍDO — ESCRITA NÃO EXECUTADA`.

Nenhuma escrita foi executada no D1 de producao. Nenhum email foi enviado. Nenhuma migration,
alteracao de aeronave, alteracao de tenant, deploy, commit ou push foi executado.

## Gate inicial

| Item | Resultado |
| --- | --- |
| Repositorio | `/Users/filipedaumas/SAAS/Airtrust` |
| Branch | `main` |
| HEAD inicial | `e6cb33430b82a360fa09da12da964307620a20e2` |
| HEAD final | `e6cb33430b82a360fa09da12da964307620a20e2` |
| `HEAD...origin/main` | `0 0` |
| Tracked files | limpo no momento do fechamento |
| Untracked | preservados, nao limpos |

## Fontes auditadas

Arquivos principais lidos:

- `worker-airtrust/src/routes/simuladores-sessoes.ts`
- `worker-airtrust/src/routes/simuladores-sessoes-participantes.ts`
- `worker-airtrust/src/routes/simuladores-sessoes-update.ts`
- `worker-airtrust/src/routes/simuladores-shared.ts`
- `worker-airtrust/src/services/escala-mensal-integrada.ts`
- `worker-airtrust/src/routes/escalas-evd.ts`
- `worker-airtrust/src/services/simuladores-session-notifications.ts`
- `worker-airtrust/src/services/treinamentos-planejados-integration.ts`
- `worker-airtrust/src/services/treinamentos-convocacao-email.ts`

Consultas foram executadas em modo somente leitura com:

```bash
cd worker-airtrust
npx wrangler d1 execute airtrust-db --env production --remote --command "<SELECT ...>" --json
```

Todas as consultas validas retornaram `changed_db=false` e `rows_written=0`.
Uma consulta exploratoria falhou por referenciar `escala_eventos.empresa_id`, coluna inexistente,
sem escrita e sem impacto de dados.

## Totais do periodo

Periodo processado: `2026-06-01` a `2026-07-31`.

| Mes | Sessoes encontradas | Sessoes ativas | Canceladas/excluidas | Concluidas | Tenants |
| --- | ---: | ---: | ---: | ---: | ---: |
| `2026-06` | 27 | 25 | 2 | 0 | 1 |
| `2026-07` | 2 | 2 | 0 | 0 | 1 |
| Total | 29 | 27 | 2 | 0 | 1 |

## Classificacao do dry-run

| Classificacao | Sessoes | Vinculos de participantes | Qualificacoes planejadas existentes | Turmas vinculadas |
| --- | ---: | ---: | ---: | ---: |
| `CANCELADA` | 2 | 0 | 0 | 0 |
| `PRONTA_PARA_SINCRONIZAR` | 1 | 2 | 1 | 0 |
| `SEM_QUALIFICACAO_ASSOCIADA` | 26 | 52 | 0 | 0 |

Nao houve sessoes classificadas como `INCOMPLETA`, `DUPLICADA`, `CONCLUIDA`,
`SEM_PARTICIPANTES`, `SEM_HORARIO`, `CROSS_TENANT` ou `REQUER_REVISAO`.

## Relacao das sessoes

| Sessao | Data | Hora | Status | Classificacao | Modelo | Instrutor | Examinador | Participantes | Qualificacao | QH | Escala |
| ---: | --- | --- | --- | --- | --- | ---: | ---: | --- | --- | ---: | ---: |
| 71 | 2026-06-25 | 07:00-09:00 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `S76-P-C2/VFR` | 15 | - | `3:PIC,66:SIC` | - | 0 | 0 |
| 74 | 2026-06-25 | 09:00-11:00 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `S76-P-C2/IFR` | 15 | - | `3:PIC,66:SIC` | - | 0 | 0 |
| 75 | 2026-06-25 | 11:00-13:00 | AGENDADO | `PRONTA_PARA_SINCRONIZAR` | `SK76-P-CHECK` | 15 | 33 | `3:PIC,66:SIC` | `40/G2` | 1 | 0 |
| 76 | 2026-06-25 | 13:10-15:10 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-01/12` | 33 | - | `67:PIC,68:SIC` | - | 0 | 0 |
| 77 | 2026-06-25 | 15:10-17:10 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-02/12` | 33 | - | `67:PIC,68:SIC` | - | 0 | 0 |
| 72 | 2026-06-25 | 23:00-01:00 | AGENDADO | `CANCELADA` | `S76-P-C1/IFR` | 33 | - | - | - | 0 | 0 |
| 73 | 2026-06-26 | 01:00-03:00 | AGENDADO | `CANCELADA` | `SK76-P-CHECK` | 33 | 15 | - | `40/G2` | 0 | 0 |
| 78 | 2026-06-26 | 08:00-10:00 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-03/12` | 33 | - | `67:PIC,68:SIC` | - | 0 | 0 |
| 79 | 2026-06-26 | 10:00-12:00 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-04/12` | 33 | - | `67:PIC,68:SIC` | - | 0 | 0 |
| 80 | 2026-06-26 | 12:10-14:10 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-01/12` | 15 | - | `66:PIC,69:SIC` | - | 0 | 0 |
| 81 | 2026-06-26 | 14:10-16:10 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-02/12` | 15 | - | `66:PIC,69:SIC` | - | 0 | 0 |
| 82 | 2026-06-27 | 03:50-05:50 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-05/12` | 33 | - | `67:PIC,68:SIC` | - | 0 | 0 |
| 83 | 2026-06-27 | 05:50-07:50 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-06/12` | 33 | - | `67:PIC,68:SIC` | - | 0 | 0 |
| 84 | 2026-06-27 | 16:20-18:20 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-03/12` | 15 | - | `66:PIC,69:SIC` | - | 0 | 0 |
| 85 | 2026-06-27 | 18:20-20:20 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-04/12` | 15 | - | `66:PIC,69:SIC` | - | 0 | 0 |
| 86 | 2026-06-28 | 03:50-05:50 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-07/12` | 33 | - | `67:PIC,68:SIC` | - | 0 | 0 |
| 87 | 2026-06-28 | 05:50-07:50 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-08/12` | 33 | - | `67:PIC,68:SIC` | - | 0 | 0 |
| 92 | 2026-06-28 | 16:20-18:20 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-05/12` | 15 | - | `66:PIC,69:SIC` | - | 0 | 0 |
| 93 | 2026-06-28 | 18:20-20:20 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-06/12` | 15 | - | `66:PIC,69:SIC` | - | 0 | 0 |
| 88 | 2026-06-29 | 03:50-05:50 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-09/12` | 33 | - | `67:PIC,68:SIC` | - | 0 | 0 |
| 89 | 2026-06-29 | 05:50-07:50 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-10/12` | 33 | - | `67:PIC,68:SIC` | - | 0 | 0 |
| 94 | 2026-06-29 | 16:20-18:20 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-07/12` | 15 | - | `66:PIC,69:SIC` | - | 0 | 0 |
| 95 | 2026-06-29 | 18:20-20:20 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-08/12` | 15 | - | `66:PIC,69:SIC` | - | 0 | 0 |
| 90 | 2026-06-30 | 03:50-05:50 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-11/12` | 33 | - | `67:PIC,68:SIC` | - | 0 | 0 |
| 91 | 2026-06-30 | 05:50-07:50 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-12/12` | 33 | 15 | `67:PIC,68:SIC` | - | 0 | 0 |
| 96 | 2026-06-30 | 20:30-22:30 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-09/12` | 15 | - | `66:PIC,69:SIC` | - | 0 | 0 |
| 97 | 2026-06-30 | 22:30-00:30 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-10/12` | 15 | - | `66:PIC,69:SIC` | - | 0 | 0 |
| 98 | 2026-07-01 | 16:30-18:30 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-11/12` | 33 | - | `66:PIC,69:SIC` | - | 0 | 0 |
| 99 | 2026-07-01 | 18:30-20:30 | AGENDADO | `SEM_QUALIFICACAO_ASSOCIADA` | `SK76-I-12/12` | 33 | 33 | `66:PIC,69:SIC` | - | 0 | 0 |

As sessoes `72` e `73` estao soft-deleted (`deleted_at` em `2026-06-03`) e foram
classificadas como `CANCELADA` para fins operacionais do dry-run.

## Reconciliacao de participantes

| Item | Total |
| --- | ---: |
| Sessoes ativas com participantes | 27 |
| Vinculos ativos de participantes | 54 |
| Participantes unicos | 5 |
| Vinculos cross-tenant | 0 |
| Emails ausentes em participantes | 0 |
| Emails invalidos em participantes | 0 |

## Reconciliacao de qualificacoes planejadas

| Item | Total |
| --- | ---: |
| Planejamentos esperados para sessoes com qualificacao oficial | 2 |
| Qualificacoes planejadas existentes | 1 |
| Qualificacoes planejadas a criar em dry-run | 1 |
| Qualificacoes planejadas criadas | 0 |

Detalhe da sessao pronta:

| Sessao | Participante | Funcao | Email mascarado | QH | Status | Codigo | Data preenchida |
| ---: | ---: | --- | --- | ---: | --- | --- | --- |
| 75 | 3 | PIC | `a***@voecostadosol.com.br` | 4534 | PLANEJADA | G2 | 2026-06-25 |
| 75 | 66 | SIC | `v***@voecostadosol.com.br` | - | - | - | - |

Observacao critica: a qualificacao planejada existente da sessao `75` esta com
`data_conclusao = 2026-06-25`. O pedido exige que planejamento nao preencha data de
conclusao. O helper atual `criarQualificacoesPlanejadas` tambem usa a data da sessao em
`data_conclusao` ao inserir registros `PLANEJADA`. Por isso a escrita de qualificacao nao
foi executada.

## Modelos de sessao

Somente `SK76-P-CHECK` esta configurado com `gera_qualificacao=1` e `qualificacao_tipo_id=40/G2`.
Os demais modelos ativos do periodo possuem `gera_qualificacao=0` e `qualificacao_tipo_id=NULL`.
Sem alteracao de catalogo ou regra oficial, essas 26 sessoes nao podem gerar qualificacoes.

## Reconciliacao de escala

| Item | Total |
| --- | ---: |
| Eventos pessoais esperados, participantes apenas | 54 |
| Eventos pessoais esperados, participantes + instrutores | 81 |
| Eventos `escala_eventos` existentes para origem `simuladores` | 0 |
| Eventos a sincronizar, participantes apenas | 54 |
| Eventos a sincronizar, participantes + instrutores | 81 |
| Conflitos detectados contra `escala_eventos` existentes | 0 |
| Eventos concluidos em cinza criados | 0 |

O leitor da Visao Mensal Integrada carrega sessoes de simulador diretamente para
participantes via `simulador_agendamentos` + `sessoes_participantes`. Ele nao inclui
instrutores no leitor direto de simulador. O helper persistente `syncSessaoEscalaEventos`
tambem recebe apenas `participantes`, nao instrutores.

A EVD auditada (`escalas-evd.ts`) consulta compromissos de treinamento/turma; nao foi
encontrada consulta direta a `simulador_agendamentos` para compromissos de simulador. Como
nao existem `escala_eventos` persistidos para essas sessoes, a validacao EVD de simulador
ficou bloqueada no dry-run.

## Bloqueios de execucao

1. Existem 26 sessoes ativas `SEM_QUALIFICACAO_ASSOCIADA`; o pedido proibe escrever registros nessa classificacao.
2. A unica sessao `PRONTA_PARA_SINCRONIZAR` tem 1 planejamento existente e 1 faltante, mas o fluxo atual grava planejamento em `data_conclusao`, contrariando a regra do pedido.
3. Nao ha log persistente de email de simulador por `sessao_id + participante_id`. As unicas tabelas de log encontradas sao de convocacao de treinamentos.
4. O servico direto de email de simulador inclui instrutor/examinador como destinatarios, enquanto o pedido limita envio automatico aos participantes salvo regra especifica.
5. A escala persistente cobre 0 dos 54 eventos de participantes esperados e 0 dos 81 eventos quando instrutores sao incluidos.
6. A EVD nao esta validada para simulador direto sem eventos persistidos ou turma vinculada.

## Decisao

A execucao parou no dry-run. Qualificacoes planejadas criadas: `0`. Eventos de escala
sincronizados: `0`. Emails enviados: `0`. Deploy: `nao executado`. Smoke autenticado:
`nao executado`.

Antes de escrita real, o fluxo precisa corrigir ou explicitar:

- modelo canônico para as 26 sessoes sem qualificacao associada;
- idempotencia de email por sessao e participante;
- insercao de qualificacao planejada sem preencher data de conclusao;
- cobertura de instrutores na escala;
- cobertura de simulador na EVD.

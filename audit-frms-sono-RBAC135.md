# Auditoria Cientifica FRMS - Premissa de Sono + RBAC 135/117 + SAFTE-FAST
Gerado em: 2026-05-02 20:21:56 UTC
minutosAntesApresentacao configurado: 90
horasSonoPadrao configurado: 8
empresaId auditada: 6
Candidatos SIGVOOS para inferencia da empresa: empresa 6: auto_sync=true, auto_sync_hora_utc=21, last_sync_to=2026-04-30; empresa 1: auto_sync=null, auto_sync_hora_utc=null, last_sync_to=2026-04-30
Periodo: 2026-02-01 a 2026-04-30
Total jornadas auditadas: 111

## RESUMO EXECUTIVO
| Bloco | Verificacao | Resultado | FAILs |
| --- | --- | --- | --- |
| 0 | Pre-condicoes | PASS | 0 |
| 1 | Sono efetivo calculado corretamente | PASS | 0 |
| 2 | Fator_Repouso coerente com sono efetivo | PASS | 0 |
| 3 | Fator_Basica coerente com circadiano | PASS | 0 |
| 4 | Fator_Apresentacao coerente com WOCL | PASS | 0 |
| 5 | Repouso regulatorio RBAC 117 ok | PASS | 0 |
| 6 | Limites acumulados 7d/28d/365d ok | PASS | 0 |
| 7 | Cross-validation SIGVOOS >=98% cobertura | PASS | 0 |
| 8 | Scheduler diario funcionando | RISCO | 0 |

## BLOCO 0 - PRE-CONDICOES
- PASS: parametros basicos confirmados (90 min / 8 h).

## TABELA A - Verificacao do Sono Efetivo
| Tripulante | Data | Apresentacao | Hora Acordou | Sono Efetivo | Fonte | WOCL? | STATUS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Adriana Brasil | 2026-03-02 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Adriana Brasil | 2026-03-03 | 07:03 | 05:33 | 423 | INFORMADO | true | PASS |
| Antonio Luiz Simões Ramos | 2026-02-02 | 12:50 | 11:20 | 480 | PADRAO | false | PASS |
| Antonio Luiz Simões Ramos | 2026-02-06 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Antonio Luiz Simões Ramos | 2026-02-11 | 07:45 | 06:15 | 480 | PADRAO | false | PASS |
| Antonio Luiz Simões Ramos | 2026-02-12 | 09:10 | 07:40 | 480 | PADRAO | false | PASS |
| Antonio Luiz Simões Ramos | 2026-03-03 | 08:04 | 06:34 | 480 | PADRAO | false | PASS |
| Antonio Luiz Simões Ramos | 2026-04-03 | 08:20 | 06:50 | 480 | PADRAO | false | PASS |
| Antonio Luiz Simões Ramos | 2026-04-14 | 12:00 | 10:30 | 480 | PADRAO | false | PASS |
| Diego Bichara Bejamin | 2026-04-15 | 08:31 | 07:01 | 480 | PADRAO | false | PASS |
| Diego Bichara Bejamin | 2026-04-24 | 11:00 | 09:30 | 480 | PADRAO | false | PASS |
| Diego Bichara Bejamin | 2026-04-29 | 15:00 | 13:30 | 480 | PADRAO | false | PASS |
| Diego Bichara Bejamin | 2026-04-30 | 14:00 | 12:30 | 480 | PADRAO | false | PASS |
| Dieter Johny Kühr | 2026-03-02 | 10:10 | 08:40 | 480 | PADRAO | false | PASS |
| Dieter Johny Kühr | 2026-03-03 | 07:03 | 05:33 | 480 | PADRAO | true | PASS |
| Dieter Johny Kühr | 2026-03-04 | 07:04 | 05:34 | 480 | PADRAO | true | PASS |
| Dieter Johny Kühr | 2026-04-02 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Dieter Johny Kühr | 2026-04-03 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Dieter Johny Kühr | 2026-04-04 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Dieter Johny Kühr | 2026-04-05 | 19:40 | 18:10 | 480 | PADRAO | false | PASS |
| Dieter Johny Kühr | 2026-04-06 | 12:36 | 11:06 | 480 | PADRAO | false | PASS |
| Dieter Johny Kühr | 2026-04-07 | 12:30 | 11:00 | 480 | PADRAO | false | PASS |
| Dieter Johny Kühr | 2026-04-08 | 12:40 | 11:10 | 480 | PADRAO | false | PASS |
| Dieter Johny Kühr | 2026-04-09 | 12:40 | 11:10 | 480 | PADRAO | false | PASS |
| Dieter Johny Kühr | 2026-04-10 | 12:13 | 10:43 | 480 | PADRAO | false | PASS |
| Dieter Johny Kühr | 2026-04-11 | 07:17 | 05:47 | 480 | PADRAO | true | PASS |
| Dieter Johny Kühr | 2026-04-12 | 14:31 | 13:01 | 480 | PADRAO | false | PASS |
| Dieter Johny Kühr | 2026-04-13 | 07:20 | 05:50 | 480 | PADRAO | true | PASS |
| Fernando La Rocque De Freitas Filho | 2026-03-02 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Fernando La Rocque De Freitas Filho | 2026-03-03 | 06:30 | 05:00 | 480 | PADRAO | true | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-02 | 07:15 | 05:45 | 480 | PADRAO | true | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-03 | 12:30 | 11:00 | 480 | PADRAO | false | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-04 | 07:20 | 05:50 | 480 | PADRAO | true | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-06 | 07:36 | 06:06 | 480 | PADRAO | false | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-07 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-08 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-09 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-10 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-11 | 06:50 | 05:20 | 480 | PADRAO | true | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-12 | 12:35 | 11:05 | 480 | PADRAO | false | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-13 | 12:00 | 10:30 | 480 | PADRAO | false | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-14 | 06:58 | 05:28 | 480 | PADRAO | true | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-15 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Gabriel Ferreira Barreto | 2026-04-02 | 07:15 | 05:45 | 480 | PADRAO | true | PASS |
| Gabriel Ferreira Barreto | 2026-04-03 | 12:30 | 11:00 | 480 | PADRAO | false | PASS |
| Gabriel Ferreira Barreto | 2026-04-04 | 07:20 | 05:50 | 480 | PADRAO | true | PASS |
| Gabriel Ferreira Barreto | 2026-04-06 | 07:36 | 06:06 | 480 | PADRAO | false | PASS |
| Gabriel Ferreira Barreto | 2026-04-07 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Gabriel Ferreira Barreto | 2026-04-08 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Gabriel Ferreira Barreto | 2026-04-09 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Gabriel Ferreira Barreto | 2026-04-10 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Gabriel Ferreira Barreto | 2026-04-11 | 06:50 | 05:20 | 480 | PADRAO | true | PASS |
| Gabriel Ferreira Barreto | 2026-04-12 | 12:35 | 11:05 | 480 | PADRAO | false | PASS |
| Gabriel Ferreira Barreto | 2026-04-13 | 12:00 | 10:30 | 480 | PADRAO | false | PASS |
| Gabriel Ferreira Barreto | 2026-04-14 | 06:58 | 05:28 | 480 | PADRAO | true | PASS |
| Gabriel Ferreira Barreto | 2026-04-15 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Jair Cesar Da Silva | 2026-04-24 | 11:00 | 09:30 | 480 | PADRAO | false | PASS |
| Jair Cesar Da Silva | 2026-04-29 | 15:00 | 13:30 | 480 | PADRAO | false | PASS |
| Jair Cesar Da Silva | 2026-04-30 | 14:00 | 12:30 | 480 | PADRAO | false | PASS |
| José Alfredo Gomes Marinho | 2026-04-03 | 08:20 | 06:50 | 480 | PADRAO | false | PASS |
| José Alfredo Gomes Marinho | 2026-04-14 | 12:00 | 10:30 | 480 | PADRAO | false | PASS |
| Karl Martin Kühr | 2026-02-02 | 12:50 | 11:20 | 480 | PADRAO | false | PASS |
| Karl Martin Kühr | 2026-02-06 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Karl Martin Kühr | 2026-02-11 | 07:45 | 06:15 | 480 | PADRAO | false | PASS |
| Karl Martin Kühr | 2026-02-12 | 09:10 | 07:40 | 480 | PADRAO | false | PASS |
| Karl Martin Kühr | 2026-03-03 | 08:04 | 06:34 | 480 | PADRAO | false | PASS |
| Karl Martin Kühr | 2026-04-02 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Karl Martin Kühr | 2026-04-03 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Karl Martin Kühr | 2026-04-04 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Karl Martin Kühr | 2026-04-05 | 19:40 | 18:10 | 480 | PADRAO | false | PASS |
| Karl Martin Kühr | 2026-04-06 | 12:36 | 11:06 | 480 | PADRAO | false | PASS |
| Karl Martin Kühr | 2026-04-07 | 12:30 | 11:00 | 480 | PADRAO | false | PASS |
| Karl Martin Kühr | 2026-04-08 | 12:40 | 11:10 | 480 | PADRAO | false | PASS |
| Karl Martin Kühr | 2026-04-09 | 12:40 | 11:10 | 480 | PADRAO | false | PASS |
| Karl Martin Kühr | 2026-04-10 | 12:13 | 10:43 | 480 | PADRAO | false | PASS |
| Karl Martin Kühr | 2026-04-11 | 07:17 | 05:47 | 480 | PADRAO | true | PASS |
| Karl Martin Kühr | 2026-04-12 | 14:31 | 13:01 | 480 | PADRAO | false | PASS |
| Karl Martin Kühr | 2026-04-13 | 07:20 | 05:50 | 480 | PADRAO | true | PASS |
| Karl Martin Kühr | 2026-04-14 | 10:10 | 08:40 | 480 | PADRAO | false | PASS |
| Karl Martin Kühr | 2026-04-15 | 12:40 | 11:10 | 480 | PADRAO | false | PASS |
| Max Monteiro Magioli | 2026-04-24 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Max Monteiro Magioli | 2026-04-29 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Max Monteiro Magioli | 2026-04-30 | 08:20 | 06:50 | 480 | PADRAO | false | PASS |
| Paloma Gonçalves Magioli | 2026-03-02 | 10:10 | 08:40 | 480 | PADRAO | false | PASS |
| Paloma Gonçalves Magioli | 2026-03-03 | 06:30 | 05:00 | 480 | PADRAO | true | PASS |
| Paloma Gonçalves Magioli | 2026-04-19 | 08:20 | 06:50 | 480 | PADRAO | false | PASS |
| Paloma Gonçalves Magioli | 2026-04-24 | 07:30 | 06:00 | 480 | PADRAO | false | PASS |
| Paloma Gonçalves Magioli | 2026-04-29 | 08:00 | 06:30 | 480 | PADRAO | false | PASS |
| Paloma Gonçalves Magioli | 2026-04-30 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Rubens Negreiros Silva | 2026-04-15 | 12:40 | 11:10 | 480 | PADRAO | false | PASS |
| Rubens Negreiros Silva | 2026-04-16 | 11:55 | 10:25 | 480 | PADRAO | false | PASS |
| Rubens Negreiros Silva | 2026-04-17 | 12:05 | 10:35 | 480 | PADRAO | false | PASS |
| Rubens Negreiros Silva | 2026-04-18 | 07:20 | 05:50 | 480 | PADRAO | true | PASS |
| Rubens Negreiros Silva | 2026-04-19 | 08:20 | 06:50 | 480 | PADRAO | false | PASS |
| Rubens Negreiros Silva | 2026-04-20 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Rubens Negreiros Silva | 2026-04-21 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Rubens Negreiros Silva | 2026-04-22 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Rubens Negreiros Silva | 2026-04-23 | 12:25 | 10:55 | 480 | PADRAO | false | PASS |
| Rubens Negreiros Silva | 2026-04-24 | 07:30 | 06:00 | 480 | PADRAO | false | PASS |
| Rubens Negreiros Silva | 2026-04-25 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Rubens Negreiros Silva | 2026-04-27 | 09:02 | 07:32 | 480 | PADRAO | false | PASS |
| Rubens Negreiros Silva | 2026-04-28 | 07:10 | 05:40 | 480 | PADRAO | true | PASS |
| Rubens Negreiros Silva | 2026-04-29 | 08:00 | 06:30 | 480 | PADRAO | false | PASS |
| Rubens Negreiros Silva | 2026-04-30 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Vitor De Almeida Costa | 2026-04-24 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Vitor De Almeida Costa | 2026-04-29 | 07:00 | 05:30 | 480 | PADRAO | true | PASS |
| Vitor De Almeida Costa | 2026-04-30 | 08:20 | 06:50 | 480 | PADRAO | false | PASS |
| Wilson Maciel Martins Nery | 2026-04-03 | 08:20 | 06:50 | 480 | PADRAO | false | PASS |
| Wilson Maciel Martins Nery | 2026-04-08 | 10:00 | 08:30 | 480 | PADRAO | false | PASS |
| Wilson Maciel Martins Nery | 2026-04-14 | 10:10 | 08:40 | 480 | PADRAO | false | PASS |
| Wilson Maciel Martins Nery | 2026-04-15 | 08:31 | 07:01 | 480 | PADRAO | false | PASS |

## TABELA B - Fator_Repouso
| Tripulante | Data | Fonte Sono | Sono Efetivo (min) | Fator_Repouso | Esperado | STATUS |
| --- | --- | --- | --- | --- | --- | --- |
| Adriana Brasil | 2026-03-02 | PADRAO | 480 | 0.00 | 0 | PASS |
| Adriana Brasil | 2026-03-03 | INFORMADO | 423 | -0.06 | pode variar | PASS |
| Antonio Luiz Simões Ramos | 2026-02-02 | PADRAO | 480 | 0.00 | 0 | PASS |
| Antonio Luiz Simões Ramos | 2026-02-06 | PADRAO | 480 | 0.00 | 0 | PASS |
| Antonio Luiz Simões Ramos | 2026-02-11 | PADRAO | 480 | 0.00 | 0 | PASS |
| Antonio Luiz Simões Ramos | 2026-02-12 | PADRAO | 480 | 0.00 | 0 | PASS |
| Antonio Luiz Simões Ramos | 2026-03-03 | PADRAO | 480 | 0.00 | 0 | PASS |
| Antonio Luiz Simões Ramos | 2026-04-03 | PADRAO | 480 | 0.00 | 0 | PASS |
| Antonio Luiz Simões Ramos | 2026-04-14 | PADRAO | 480 | 0.00 | 0 | PASS |
| Diego Bichara Bejamin | 2026-04-15 | PADRAO | 480 | 0.00 | 0 | PASS |
| Diego Bichara Bejamin | 2026-04-24 | PADRAO | 480 | 0.00 | 0 | PASS |
| Diego Bichara Bejamin | 2026-04-29 | PADRAO | 480 | 0.00 | 0 | PASS |
| Diego Bichara Bejamin | 2026-04-30 | PADRAO | 480 | 0.00 | 0 | PASS |
| Dieter Johny Kühr | 2026-03-02 | PADRAO | 480 | 0.00 | 0 | PASS |
| Dieter Johny Kühr | 2026-03-03 | PADRAO | 480 | 0.00 | 0 | PASS |
| Dieter Johny Kühr | 2026-03-04 | PADRAO | 480 | 0.00 | 0 | PASS |
| Dieter Johny Kühr | 2026-04-02 | PADRAO | 480 | 0.00 | 0 | PASS |
| Dieter Johny Kühr | 2026-04-03 | PADRAO | 480 | 0.00 | 0 | PASS |
| Dieter Johny Kühr | 2026-04-04 | PADRAO | 480 | 0.00 | 0 | PASS |
| Dieter Johny Kühr | 2026-04-05 | PADRAO | 480 | 0.00 | 0 | PASS |
| Dieter Johny Kühr | 2026-04-06 | PADRAO | 480 | 0.00 | 0 | PASS |
| Dieter Johny Kühr | 2026-04-07 | PADRAO | 480 | 0.00 | 0 | PASS |
| Dieter Johny Kühr | 2026-04-08 | PADRAO | 480 | 0.00 | 0 | PASS |
| Dieter Johny Kühr | 2026-04-09 | PADRAO | 480 | 0.00 | 0 | PASS |
| Dieter Johny Kühr | 2026-04-10 | PADRAO | 480 | 0.00 | 0 | PASS |
| Dieter Johny Kühr | 2026-04-11 | PADRAO | 480 | 0.00 | 0 | PASS |
| Dieter Johny Kühr | 2026-04-12 | PADRAO | 480 | 0.00 | 0 | PASS |
| Dieter Johny Kühr | 2026-04-13 | PADRAO | 480 | 0.00 | 0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-03-02 | PADRAO | 480 | 0.00 | 0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-03-03 | PADRAO | 480 | 0.00 | 0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-02 | PADRAO | 480 | 0.00 | 0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-03 | PADRAO | 480 | 0.00 | 0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-04 | PADRAO | 480 | 0.00 | 0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-06 | PADRAO | 480 | 0.00 | 0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-07 | PADRAO | 480 | 0.00 | 0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-08 | PADRAO | 480 | 0.00 | 0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-09 | PADRAO | 480 | 0.00 | 0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-10 | PADRAO | 480 | 0.00 | 0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-11 | PADRAO | 480 | 0.00 | 0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-12 | PADRAO | 480 | 0.00 | 0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-13 | PADRAO | 480 | 0.00 | 0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-14 | PADRAO | 480 | 0.00 | 0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-15 | PADRAO | 480 | 0.00 | 0 | PASS |
| Gabriel Ferreira Barreto | 2026-04-02 | PADRAO | 480 | 0.00 | 0 | PASS |
| Gabriel Ferreira Barreto | 2026-04-03 | PADRAO | 480 | 0.00 | 0 | PASS |
| Gabriel Ferreira Barreto | 2026-04-04 | PADRAO | 480 | 0.00 | 0 | PASS |
| Gabriel Ferreira Barreto | 2026-04-06 | PADRAO | 480 | 0.00 | 0 | PASS |
| Gabriel Ferreira Barreto | 2026-04-07 | PADRAO | 480 | 0.00 | 0 | PASS |
| Gabriel Ferreira Barreto | 2026-04-08 | PADRAO | 480 | 0.00 | 0 | PASS |
| Gabriel Ferreira Barreto | 2026-04-09 | PADRAO | 480 | 0.00 | 0 | PASS |
| Gabriel Ferreira Barreto | 2026-04-10 | PADRAO | 480 | 0.00 | 0 | PASS |
| Gabriel Ferreira Barreto | 2026-04-11 | PADRAO | 480 | 0.00 | 0 | PASS |
| Gabriel Ferreira Barreto | 2026-04-12 | PADRAO | 480 | 0.00 | 0 | PASS |
| Gabriel Ferreira Barreto | 2026-04-13 | PADRAO | 480 | 0.00 | 0 | PASS |
| Gabriel Ferreira Barreto | 2026-04-14 | PADRAO | 480 | 0.00 | 0 | PASS |
| Gabriel Ferreira Barreto | 2026-04-15 | PADRAO | 480 | 0.00 | 0 | PASS |
| Jair Cesar Da Silva | 2026-04-24 | PADRAO | 480 | 0.00 | 0 | PASS |
| Jair Cesar Da Silva | 2026-04-29 | PADRAO | 480 | 0.00 | 0 | PASS |
| Jair Cesar Da Silva | 2026-04-30 | PADRAO | 480 | 0.00 | 0 | PASS |
| José Alfredo Gomes Marinho | 2026-04-03 | PADRAO | 480 | 0.00 | 0 | PASS |
| José Alfredo Gomes Marinho | 2026-04-14 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-02-02 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-02-06 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-02-11 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-02-12 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-03-03 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-04-02 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-04-03 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-04-04 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-04-05 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-04-06 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-04-07 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-04-08 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-04-09 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-04-10 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-04-11 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-04-12 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-04-13 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-04-14 | PADRAO | 480 | 0.00 | 0 | PASS |
| Karl Martin Kühr | 2026-04-15 | PADRAO | 480 | 0.00 | 0 | PASS |
| Max Monteiro Magioli | 2026-04-24 | PADRAO | 480 | 0.00 | 0 | PASS |
| Max Monteiro Magioli | 2026-04-29 | PADRAO | 480 | 0.00 | 0 | PASS |
| Max Monteiro Magioli | 2026-04-30 | PADRAO | 480 | 0.00 | 0 | PASS |
| Paloma Gonçalves Magioli | 2026-03-02 | PADRAO | 480 | 0.00 | 0 | PASS |
| Paloma Gonçalves Magioli | 2026-03-03 | PADRAO | 480 | 0.00 | 0 | PASS |
| Paloma Gonçalves Magioli | 2026-04-19 | PADRAO | 480 | 0.00 | 0 | PASS |
| Paloma Gonçalves Magioli | 2026-04-24 | PADRAO | 480 | 0.00 | 0 | PASS |
| Paloma Gonçalves Magioli | 2026-04-29 | PADRAO | 480 | 0.00 | 0 | PASS |
| Paloma Gonçalves Magioli | 2026-04-30 | PADRAO | 480 | 0.00 | 0 | PASS |
| Rubens Negreiros Silva | 2026-04-15 | PADRAO | 480 | 0.00 | 0 | PASS |
| Rubens Negreiros Silva | 2026-04-16 | PADRAO | 480 | 0.00 | 0 | PASS |
| Rubens Negreiros Silva | 2026-04-17 | PADRAO | 480 | 0.00 | 0 | PASS |
| Rubens Negreiros Silva | 2026-04-18 | PADRAO | 480 | 0.00 | 0 | PASS |
| Rubens Negreiros Silva | 2026-04-19 | PADRAO | 480 | 0.00 | 0 | PASS |
| Rubens Negreiros Silva | 2026-04-20 | PADRAO | 480 | 0.00 | 0 | PASS |
| Rubens Negreiros Silva | 2026-04-21 | PADRAO | 480 | 0.00 | 0 | PASS |
| Rubens Negreiros Silva | 2026-04-22 | PADRAO | 480 | 0.00 | 0 | PASS |
| Rubens Negreiros Silva | 2026-04-23 | PADRAO | 480 | 0.00 | 0 | PASS |
| Rubens Negreiros Silva | 2026-04-24 | PADRAO | 480 | 0.00 | 0 | PASS |
| Rubens Negreiros Silva | 2026-04-25 | PADRAO | 480 | 0.00 | 0 | PASS |
| Rubens Negreiros Silva | 2026-04-27 | PADRAO | 480 | 0.00 | 0 | PASS |
| Rubens Negreiros Silva | 2026-04-28 | PADRAO | 480 | 0.00 | 0 | PASS |
| Rubens Negreiros Silva | 2026-04-29 | PADRAO | 480 | 0.00 | 0 | PASS |
| Rubens Negreiros Silva | 2026-04-30 | PADRAO | 480 | 0.00 | 0 | PASS |
| Vitor De Almeida Costa | 2026-04-24 | PADRAO | 480 | 0.00 | 0 | PASS |
| Vitor De Almeida Costa | 2026-04-29 | PADRAO | 480 | 0.00 | 0 | PASS |
| Vitor De Almeida Costa | 2026-04-30 | PADRAO | 480 | 0.00 | 0 | PASS |
| Wilson Maciel Martins Nery | 2026-04-03 | PADRAO | 480 | 0.00 | 0 | PASS |
| Wilson Maciel Martins Nery | 2026-04-08 | PADRAO | 480 | 0.00 | 0 | PASS |
| Wilson Maciel Martins Nery | 2026-04-14 | PADRAO | 480 | 0.00 | 0 | PASS |
| Wilson Maciel Martins Nery | 2026-04-15 | PADRAO | 480 | 0.00 | 0 | PASS |

## TABELA C - Fator_Basica vs Hora Acordou
| Tripulante | Data | Hora Acordou | Fator_Basica Registrado | Range Esperado | Delta | STATUS |
| --- | --- | --- | --- | --- | --- | --- |
| Karl Martin Kühr | 2026-02-12 | 07:40 | 0.70 | 0.65-0.75 | 0.00 | PASS |
| Paloma Gonçalves Magioli | 2026-04-19 | 06:50 | 0.70 | 0.65-0.75 | 0.00 | PASS |
| Karl Martin Kühr | 2026-04-13 | 05:50 | 0.60 | 0.55-0.65 | 0.00 | PASS |
| Wilson Maciel Martins Nery | 2026-04-15 | 07:01 | 0.70 | 0.65-0.75 | 0.00 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-15 | 05:30 | 0.60 | 0.55-0.65 | 0.00 | PASS |

## TABELA D - Fator_Apresentacao
| Tripulante | Data | Hora Acordou | WOCL? | Fator_Apresentacao Registrado | Esperado | STATUS |
| --- | --- | --- | --- | --- | --- | --- |
| Adriana Brasil | 2026-03-02 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Adriana Brasil | 2026-03-03 | 05:33 | true | -0.08 | -0.15 a -0.05 | PASS |
| Antonio Luiz Simões Ramos | 2026-02-02 | 11:20 | false | 0.00 | 0.00 | PASS |
| Antonio Luiz Simões Ramos | 2026-02-06 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Antonio Luiz Simões Ramos | 2026-02-11 | 06:15 | false | 0.00 | 0.00 | PASS |
| Antonio Luiz Simões Ramos | 2026-02-12 | 07:40 | false | 0.00 | 0.00 | PASS |
| Antonio Luiz Simões Ramos | 2026-03-03 | 06:34 | false | 0.00 | 0.00 | PASS |
| Antonio Luiz Simões Ramos | 2026-04-03 | 06:50 | false | 0.00 | 0.00 | PASS |
| Antonio Luiz Simões Ramos | 2026-04-14 | 10:30 | false | 0.00 | 0.00 | PASS |
| Diego Bichara Bejamin | 2026-04-15 | 07:01 | false | 0.00 | 0.00 | PASS |
| Diego Bichara Bejamin | 2026-04-24 | 09:30 | false | 0.00 | 0.00 | PASS |
| Diego Bichara Bejamin | 2026-04-29 | 13:30 | false | 0.00 | 0.00 | PASS |
| Diego Bichara Bejamin | 2026-04-30 | 12:30 | false | 0.00 | 0.00 | PASS |
| Dieter Johny Kühr | 2026-03-02 | 08:40 | false | 0.00 | 0.00 | PASS |
| Dieter Johny Kühr | 2026-03-03 | 05:33 | true | -0.08 | -0.15 a -0.05 | PASS |
| Dieter Johny Kühr | 2026-03-04 | 05:34 | true | -0.08 | -0.15 a -0.05 | PASS |
| Dieter Johny Kühr | 2026-04-02 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Dieter Johny Kühr | 2026-04-03 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Dieter Johny Kühr | 2026-04-04 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Dieter Johny Kühr | 2026-04-05 | 18:10 | false | 0.00 | 0.00 | PASS |
| Dieter Johny Kühr | 2026-04-06 | 11:06 | false | 0.00 | 0.00 | PASS |
| Dieter Johny Kühr | 2026-04-07 | 11:00 | false | 0.00 | 0.00 | PASS |
| Dieter Johny Kühr | 2026-04-08 | 11:10 | false | 0.00 | 0.00 | PASS |
| Dieter Johny Kühr | 2026-04-09 | 11:10 | false | 0.00 | 0.00 | PASS |
| Dieter Johny Kühr | 2026-04-10 | 10:43 | false | 0.00 | 0.00 | PASS |
| Dieter Johny Kühr | 2026-04-11 | 05:47 | true | -0.06 | -0.15 a -0.05 | PASS |
| Dieter Johny Kühr | 2026-04-12 | 13:01 | false | 0.00 | 0.00 | PASS |
| Dieter Johny Kühr | 2026-04-13 | 05:50 | true | -0.06 | -0.15 a -0.05 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-03-02 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-03-03 | 05:00 | true | -0.11 | -0.15 a -0.05 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-02 | 05:45 | true | -0.06 | -0.15 a -0.05 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-03 | 11:00 | false | 0.00 | 0.00 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-04 | 05:50 | true | -0.06 | -0.15 a -0.05 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-06 | 06:06 | false | 0.00 | 0.00 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-07 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-08 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-09 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-10 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-11 | 05:20 | true | -0.09 | -0.15 a -0.05 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-12 | 11:05 | false | 0.00 | 0.00 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-13 | 10:30 | false | 0.00 | 0.00 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-14 | 05:28 | true | -0.08 | -0.15 a -0.05 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-15 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Gabriel Ferreira Barreto | 2026-04-02 | 05:45 | true | -0.06 | -0.15 a -0.05 | PASS |
| Gabriel Ferreira Barreto | 2026-04-03 | 11:00 | false | 0.00 | 0.00 | PASS |
| Gabriel Ferreira Barreto | 2026-04-04 | 05:50 | true | -0.06 | -0.15 a -0.05 | PASS |
| Gabriel Ferreira Barreto | 2026-04-06 | 06:06 | false | 0.00 | 0.00 | PASS |
| Gabriel Ferreira Barreto | 2026-04-07 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Gabriel Ferreira Barreto | 2026-04-08 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Gabriel Ferreira Barreto | 2026-04-09 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Gabriel Ferreira Barreto | 2026-04-10 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Gabriel Ferreira Barreto | 2026-04-11 | 05:20 | true | -0.09 | -0.15 a -0.05 | PASS |
| Gabriel Ferreira Barreto | 2026-04-12 | 11:05 | false | 0.00 | 0.00 | PASS |
| Gabriel Ferreira Barreto | 2026-04-13 | 10:30 | false | 0.00 | 0.00 | PASS |
| Gabriel Ferreira Barreto | 2026-04-14 | 05:28 | true | -0.08 | -0.15 a -0.05 | PASS |
| Gabriel Ferreira Barreto | 2026-04-15 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Jair Cesar Da Silva | 2026-04-24 | 09:30 | false | 0.00 | 0.00 | PASS |
| Jair Cesar Da Silva | 2026-04-29 | 13:30 | false | 0.00 | 0.00 | PASS |
| Jair Cesar Da Silva | 2026-04-30 | 12:30 | false | 0.00 | 0.00 | PASS |
| José Alfredo Gomes Marinho | 2026-04-03 | 06:50 | false | 0.00 | 0.00 | PASS |
| José Alfredo Gomes Marinho | 2026-04-14 | 10:30 | false | 0.00 | 0.00 | PASS |
| Karl Martin Kühr | 2026-02-02 | 11:20 | false | 0.00 | 0.00 | PASS |
| Karl Martin Kühr | 2026-02-06 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Karl Martin Kühr | 2026-02-11 | 06:15 | false | 0.00 | 0.00 | PASS |
| Karl Martin Kühr | 2026-02-12 | 07:40 | false | 0.00 | 0.00 | PASS |
| Karl Martin Kühr | 2026-03-03 | 06:34 | false | 0.00 | 0.00 | PASS |
| Karl Martin Kühr | 2026-04-02 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Karl Martin Kühr | 2026-04-03 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Karl Martin Kühr | 2026-04-04 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Karl Martin Kühr | 2026-04-05 | 18:10 | false | 0.00 | 0.00 | PASS |
| Karl Martin Kühr | 2026-04-06 | 11:06 | false | 0.00 | 0.00 | PASS |
| Karl Martin Kühr | 2026-04-07 | 11:00 | false | 0.00 | 0.00 | PASS |
| Karl Martin Kühr | 2026-04-08 | 11:10 | false | 0.00 | 0.00 | PASS |
| Karl Martin Kühr | 2026-04-09 | 11:10 | false | 0.00 | 0.00 | PASS |
| Karl Martin Kühr | 2026-04-10 | 10:43 | false | 0.00 | 0.00 | PASS |
| Karl Martin Kühr | 2026-04-11 | 05:47 | true | -0.06 | -0.15 a -0.05 | PASS |
| Karl Martin Kühr | 2026-04-12 | 13:01 | false | 0.00 | 0.00 | PASS |
| Karl Martin Kühr | 2026-04-13 | 05:50 | true | -0.06 | -0.15 a -0.05 | PASS |
| Karl Martin Kühr | 2026-04-14 | 08:40 | false | 0.00 | 0.00 | PASS |
| Karl Martin Kühr | 2026-04-15 | 11:10 | false | 0.00 | 0.00 | PASS |
| Max Monteiro Magioli | 2026-04-24 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Max Monteiro Magioli | 2026-04-29 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Max Monteiro Magioli | 2026-04-30 | 06:50 | false | 0.00 | 0.00 | PASS |
| Paloma Gonçalves Magioli | 2026-03-02 | 08:40 | false | 0.00 | 0.00 | PASS |
| Paloma Gonçalves Magioli | 2026-03-03 | 05:00 | true | -0.11 | -0.15 a -0.05 | PASS |
| Paloma Gonçalves Magioli | 2026-04-19 | 06:50 | false | 0.00 | 0.00 | PASS |
| Paloma Gonçalves Magioli | 2026-04-24 | 06:00 | false | 0.00 | 0.00 | PASS |
| Paloma Gonçalves Magioli | 2026-04-29 | 06:30 | false | 0.00 | 0.00 | PASS |
| Paloma Gonçalves Magioli | 2026-04-30 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Rubens Negreiros Silva | 2026-04-15 | 11:10 | false | 0.00 | 0.00 | PASS |
| Rubens Negreiros Silva | 2026-04-16 | 10:25 | false | 0.00 | 0.00 | PASS |
| Rubens Negreiros Silva | 2026-04-17 | 10:35 | false | 0.00 | 0.00 | PASS |
| Rubens Negreiros Silva | 2026-04-18 | 05:50 | true | -0.06 | -0.15 a -0.05 | PASS |
| Rubens Negreiros Silva | 2026-04-19 | 06:50 | false | 0.00 | 0.00 | PASS |
| Rubens Negreiros Silva | 2026-04-20 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Rubens Negreiros Silva | 2026-04-21 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Rubens Negreiros Silva | 2026-04-22 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Rubens Negreiros Silva | 2026-04-23 | 10:55 | false | 0.00 | 0.00 | PASS |
| Rubens Negreiros Silva | 2026-04-24 | 06:00 | false | 0.00 | 0.00 | PASS |
| Rubens Negreiros Silva | 2026-04-25 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Rubens Negreiros Silva | 2026-04-27 | 07:32 | false | 0.00 | 0.00 | PASS |
| Rubens Negreiros Silva | 2026-04-28 | 05:40 | true | -0.07 | -0.15 a -0.05 | PASS |
| Rubens Negreiros Silva | 2026-04-29 | 06:30 | false | 0.00 | 0.00 | PASS |
| Rubens Negreiros Silva | 2026-04-30 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Vitor De Almeida Costa | 2026-04-24 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Vitor De Almeida Costa | 2026-04-29 | 05:30 | true | -0.08 | -0.15 a -0.05 | PASS |
| Vitor De Almeida Costa | 2026-04-30 | 06:50 | false | 0.00 | 0.00 | PASS |
| Wilson Maciel Martins Nery | 2026-04-03 | 06:50 | false | 0.00 | 0.00 | PASS |
| Wilson Maciel Martins Nery | 2026-04-08 | 08:30 | false | 0.00 | 0.00 | PASS |
| Wilson Maciel Martins Nery | 2026-04-14 | 08:40 | false | 0.00 | 0.00 | PASS |
| Wilson Maciel Martins Nery | 2026-04-15 | 07:01 | false | 0.00 | 0.00 | PASS |

## TABELA E - Conformidade Regulatoria de Repouso (RBAC 117)
| Tripulante | Data D1 | Duracao D1 | Corte D1 | Apresentacao D2 | Repouso Regulatorio (min) | Limite RBAC (min) | Artigo | STATUS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Adriana Brasil | 2026-03-02 | 415 min | 14:55 | 07:03 | 968 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Antonio Luiz Simões Ramos | 2026-02-02 | 0 min | 13:05 | 07:00 | 5395 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Antonio Luiz Simões Ramos | 2026-02-06 | 495 min | 16:15 | 07:45 | 6690 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Antonio Luiz Simões Ramos | 2026-02-11 | 90 min | 10:15 | 09:10 | 1375 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Antonio Luiz Simões Ramos | 2026-02-12 | 450 min | 17:40 | 08:04 | 26784 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Antonio Luiz Simões Ramos | 2026-03-03 | 456 min | 16:40 | 08:20 | 44140 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Antonio Luiz Simões Ramos | 2026-04-03 | 260 min | 13:40 | 12:00 | 15740 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Diego Bichara Bejamin | 2026-04-15 | 99 min | 11:10 | 11:00 | 12950 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Diego Bichara Bejamin | 2026-04-24 | 0 min | 11:20 | 15:00 | 7420 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Diego Bichara Bejamin | 2026-04-29 | 0 min | 15:20 | 14:00 | 1360 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Dieter Johny Kühr | 2026-03-02 | 355 min | 17:05 | 07:03 | 838 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Dieter Johny Kühr | 2026-03-03 | 577 min | 17:40 | 07:04 | 804 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Dieter Johny Kühr | 2026-03-04 | 606 min | 18:10 | 07:00 | 41090 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Dieter Johny Kühr | 2026-04-02 | 365 min | 14:05 | 07:00 | 1015 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Dieter Johny Kühr | 2026-04-03 | 244 min | 12:04 | 07:00 | 1136 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Dieter Johny Kühr | 2026-04-04 | 256 min | 12:16 | 19:40 | 1884 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Dieter Johny Kühr | 2026-04-05 | 70 min | 21:50 | 12:36 | 886 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Dieter Johny Kühr | 2026-04-06 | 264 min | 18:00 | 12:30 | 1110 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Dieter Johny Kühr | 2026-04-07 | 270 min | 18:00 | 12:40 | 1120 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Dieter Johny Kühr | 2026-04-08 | 320 min | 19:00 | 12:40 | 1060 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Dieter Johny Kühr | 2026-04-09 | 260 min | 18:00 | 12:13 | 1093 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Dieter Johny Kühr | 2026-04-10 | 287 min | 18:00 | 07:17 | 797 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Dieter Johny Kühr | 2026-04-11 | 583 min | 18:00 | 14:31 | 1231 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Dieter Johny Kühr | 2026-04-12 | 139 min | 17:50 | 07:20 | 810 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Fernando La Rocque De Freitas Filho | 2026-03-02 | 415 min | 14:55 | 06:30 | 935 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Fernando La Rocque De Freitas Filho | 2026-03-03 | 600 min | 17:30 | 07:15 | 42585 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-02 | 585 min | 18:00 | 12:30 | 1110 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-03 | 270 min | 18:00 | 07:20 | 800 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-04 | 375 min | 14:35 | 07:36 | 2461 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-06 | 564 min | 18:00 | 07:00 | 780 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-07 | 225 min | 11:45 | 07:00 | 1155 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-08 | 245 min | 12:05 | 07:00 | 1135 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-09 | 248 min | 12:08 | 07:00 | 1132 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-10 | 570 min | 17:30 | 06:50 | 800 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-11 | 245 min | 11:55 | 12:35 | 1480 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-12 | 255 min | 17:50 | 12:00 | 1090 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-13 | 290 min | 17:50 | 06:58 | 788 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-14 | 592 min | 17:50 | 07:00 | 790 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Gabriel Ferreira Barreto | 2026-04-02 | 585 min | 18:00 | 12:30 | 1110 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Gabriel Ferreira Barreto | 2026-04-03 | 270 min | 18:00 | 07:20 | 800 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Gabriel Ferreira Barreto | 2026-04-04 | 375 min | 14:35 | 07:36 | 2461 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Gabriel Ferreira Barreto | 2026-04-06 | 564 min | 18:00 | 07:00 | 780 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Gabriel Ferreira Barreto | 2026-04-07 | 225 min | 11:45 | 07:00 | 1155 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Gabriel Ferreira Barreto | 2026-04-08 | 58 min | 08:58 | 07:00 | 1322 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Gabriel Ferreira Barreto | 2026-04-09 | 248 min | 12:08 | 07:00 | 1132 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Gabriel Ferreira Barreto | 2026-04-10 | 570 min | 17:30 | 06:50 | 800 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Gabriel Ferreira Barreto | 2026-04-11 | 245 min | 11:55 | 12:35 | 1480 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Gabriel Ferreira Barreto | 2026-04-12 | 255 min | 17:50 | 12:00 | 1090 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Gabriel Ferreira Barreto | 2026-04-13 | 290 min | 17:50 | 06:58 | 788 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Gabriel Ferreira Barreto | 2026-04-14 | 592 min | 17:50 | 07:00 | 790 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Jair Cesar Da Silva | 2026-04-24 | 0 min | 11:20 | 15:00 | 7420 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Jair Cesar Da Silva | 2026-04-29 | 0 min | 15:20 | 14:00 | 1360 | 720 | RBAC 117 Apendice B item (j) | PASS |
| José Alfredo Gomes Marinho | 2026-04-03 | 260 min | 13:40 | 12:00 | 15740 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-02-02 | 0 min | 13:05 | 07:00 | 5395 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-02-06 | 495 min | 16:15 | 07:45 | 6690 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-02-11 | 90 min | 10:15 | 09:10 | 1375 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-02-12 | 450 min | 17:40 | 08:04 | 26784 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-03-03 | 456 min | 16:40 | 07:00 | 42620 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-04-02 | 365 min | 14:05 | 07:00 | 1015 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-04-03 | 244 min | 12:04 | 07:00 | 1136 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-04-04 | 256 min | 12:16 | 19:40 | 1884 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-04-05 | 70 min | 21:50 | 12:36 | 886 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-04-06 | 264 min | 18:00 | 12:30 | 1110 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-04-07 | 270 min | 18:00 | 12:40 | 1120 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-04-08 | 320 min | 19:00 | 12:40 | 1060 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-04-09 | 260 min | 18:00 | 12:13 | 1093 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-04-10 | 287 min | 18:00 | 07:17 | 797 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-04-11 | 583 min | 18:00 | 14:31 | 1231 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-04-12 | 139 min | 17:50 | 07:20 | 810 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-04-13 | 433 min | 15:33 | 10:10 | 1117 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Karl Martin Kühr | 2026-04-14 | 378 min | 17:28 | 12:40 | 1152 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Max Monteiro Magioli | 2026-04-24 | 260 min | 12:20 | 07:00 | 6880 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Max Monteiro Magioli | 2026-04-29 | 540 min | 17:00 | 08:20 | 920 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Paloma Gonçalves Magioli | 2026-03-02 | 355 min | 17:05 | 06:30 | 805 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Paloma Gonçalves Magioli | 2026-03-03 | 600 min | 17:30 | 08:20 | 67130 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Paloma Gonçalves Magioli | 2026-04-19 | 0 min | 09:00 | 07:30 | 7110 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Paloma Gonçalves Magioli | 2026-04-24 | 555 min | 17:45 | 08:00 | 6615 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Paloma Gonçalves Magioli | 2026-04-29 | 525 min | 17:45 | 07:00 | 795 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Rubens Negreiros Silva | 2026-04-15 | 304 min | 18:44 | 11:55 | 1031 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Rubens Negreiros Silva | 2026-04-16 | 290 min | 17:45 | 12:05 | 1100 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Rubens Negreiros Silva | 2026-04-17 | 280 min | 17:45 | 07:20 | 815 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Rubens Negreiros Silva | 2026-04-18 | 565 min | 17:45 | 08:20 | 875 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Rubens Negreiros Silva | 2026-04-19 | 0 min | 09:00 | 07:00 | 1320 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Rubens Negreiros Silva | 2026-04-20 | 585 min | 17:45 | 07:00 | 795 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Rubens Negreiros Silva | 2026-04-21 | 585 min | 17:45 | 07:00 | 795 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Rubens Negreiros Silva | 2026-04-22 | 583 min | 17:43 | 12:25 | 1122 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Rubens Negreiros Silva | 2026-04-23 | 260 min | 17:45 | 07:30 | 825 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Rubens Negreiros Silva | 2026-04-24 | 555 min | 17:45 | 07:00 | 795 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Rubens Negreiros Silva | 2026-04-25 | 260 min | 12:20 | 09:02 | 2682 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Rubens Negreiros Silva | 2026-04-27 | 323 min | 15:25 | 07:10 | 945 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Rubens Negreiros Silva | 2026-04-28 | 225 min | 11:55 | 08:00 | 1205 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Rubens Negreiros Silva | 2026-04-29 | 525 min | 17:45 | 07:00 | 795 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Vitor De Almeida Costa | 2026-04-24 | 260 min | 12:20 | 07:00 | 6880 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Vitor De Almeida Costa | 2026-04-29 | 540 min | 17:00 | 08:20 | 920 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Wilson Maciel Martins Nery | 2026-04-03 | 260 min | 13:40 | 10:00 | 6980 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Wilson Maciel Martins Nery | 2026-04-08 | 65 min | 12:05 | 10:10 | 8525 | 720 | RBAC 117 Apendice B item (j) | PASS |
| Wilson Maciel Martins Nery | 2026-04-14 | 378 min | 17:28 | 08:31 | 903 | 720 | RBAC 117 Apendice B item (j) | PASS |

## TABELA F - Limites Acumulados por Tripulante
| Tripulante | Data Ref | Jornada 7d (min) | Limite | Jornada 28d | Limite | HV 28d | Limite | HV 365d | Limite | STATUS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Adriana Brasil | 2026-03-02 | 415 | 3600 | 415 | 10560 | 273 | 5580 | 273 | 55800 | PASS |
| Adriana Brasil | 2026-03-03 | 992 | 3600 | 992 | 10560 | 626 | 5580 | 626 | 55800 | PASS |
| Antonio Luiz Simões Ramos | 2026-02-02 | 0 | 3600 | 0 | 10560 | 0 | 5580 | 0 | 55800 | PASS |
| Antonio Luiz Simões Ramos | 2026-02-06 | 495 | 3600 | 495 | 10560 | 340 | 5580 | 340 | 55800 | PASS |
| Antonio Luiz Simões Ramos | 2026-02-11 | 585 | 3600 | 585 | 10560 | 440 | 5580 | 440 | 55800 | PASS |
| Antonio Luiz Simões Ramos | 2026-02-12 | 1035 | 3600 | 1035 | 10560 | 622 | 5580 | 622 | 55800 | PASS |
| Antonio Luiz Simões Ramos | 2026-03-03 | 456 | 3600 | 1491 | 10560 | 867 | 5580 | 867 | 55800 | PASS |
| Antonio Luiz Simões Ramos | 2026-04-03 | 260 | 3600 | 260 | 10560 | 245 | 5580 | 1112 | 55800 | PASS |
| Antonio Luiz Simões Ramos | 2026-04-14 | 0 | 3600 | 260 | 10560 | 245 | 5580 | 1112 | 55800 | PASS |
| Diego Bichara Bejamin | 2026-04-15 | 99 | 3600 | 99 | 10560 | 112 | 5580 | 112 | 55800 | PASS |
| Diego Bichara Bejamin | 2026-04-24 | 0 | 3600 | 99 | 10560 | 112 | 5580 | 112 | 55800 | PASS |
| Diego Bichara Bejamin | 2026-04-29 | 0 | 3600 | 99 | 10560 | 112 | 5580 | 112 | 55800 | PASS |
| Diego Bichara Bejamin | 2026-04-30 | 30 | 3600 | 129 | 10560 | 132 | 5580 | 132 | 55800 | PASS |
| Dieter Johny Kühr | 2026-03-02 | 355 | 3600 | 355 | 10560 | 188 | 5580 | 188 | 55800 | PASS |
| Dieter Johny Kühr | 2026-03-03 | 932 | 3600 | 932 | 10560 | 541 | 5580 | 541 | 55800 | PASS |
| Dieter Johny Kühr | 2026-03-04 | 1538 | 3600 | 1538 | 10560 | 896 | 5580 | 896 | 55800 | PASS |
| Dieter Johny Kühr | 2026-04-02 | 365 | 3600 | 365 | 10560 | 196 | 5580 | 1092 | 55800 | PASS |
| Dieter Johny Kühr | 2026-04-03 | 609 | 3600 | 609 | 10560 | 375 | 5580 | 1271 | 55800 | PASS |
| Dieter Johny Kühr | 2026-04-04 | 865 | 3600 | 865 | 10560 | 592 | 5580 | 1488 | 55800 | PASS |
| Dieter Johny Kühr | 2026-04-05 | 935 | 3600 | 935 | 10560 | 873 | 5580 | 1769 | 55800 | PASS |
| Dieter Johny Kühr | 2026-04-06 | 1199 | 3600 | 1199 | 10560 | 1072 | 5580 | 1968 | 55800 | PASS |
| Dieter Johny Kühr | 2026-04-07 | 1469 | 3600 | 1469 | 10560 | 1479 | 5580 | 2375 | 55800 | PASS |
| Dieter Johny Kühr | 2026-04-08 | 1789 | 3600 | 1789 | 10560 | 1692 | 5580 | 2588 | 55800 | PASS |
| Dieter Johny Kühr | 2026-04-09 | 1684 | 3600 | 2049 | 10560 | 1887 | 5580 | 2783 | 55800 | PASS |
| Dieter Johny Kühr | 2026-04-10 | 1727 | 3600 | 2336 | 10560 | 2078 | 5580 | 2974 | 55800 | PASS |
| Dieter Johny Kühr | 2026-04-11 | 2054 | 3600 | 2919 | 10560 | 2401 | 5580 | 3297 | 55800 | PASS |
| Dieter Johny Kühr | 2026-04-12 | 2123 | 3600 | 3058 | 10560 | 2488 | 5580 | 3384 | 55800 | PASS |
| Dieter Johny Kühr | 2026-04-13 | 2292 | 3600 | 3491 | 10560 | 2769 | 5580 | 3665 | 55800 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-03-02 | 415 | 3600 | 415 | 10560 | 273 | 5580 | 273 | 55800 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-03-03 | 1015 | 3600 | 1015 | 10560 | 634 | 5580 | 634 | 55800 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-02 | 585 | 3600 | 585 | 10560 | 272 | 5580 | 906 | 55800 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-03 | 855 | 3600 | 855 | 10560 | 485 | 5580 | 1119 | 55800 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-04 | 1230 | 3600 | 1230 | 10560 | 681 | 5580 | 1315 | 55800 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-06 | 1794 | 3600 | 1794 | 10560 | 889 | 5580 | 1523 | 55800 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-07 | 2019 | 3600 | 2019 | 10560 | 1066 | 5580 | 1700 | 55800 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-08 | 2264 | 3600 | 2264 | 10560 | 1249 | 5580 | 1883 | 55800 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-09 | 1927 | 3600 | 2512 | 10560 | 1470 | 5580 | 2104 | 55800 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-10 | 2227 | 3600 | 3082 | 10560 | 1750 | 5580 | 2384 | 55800 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-11 | 2097 | 3600 | 3327 | 10560 | 1903 | 5580 | 2537 | 55800 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-12 | 2352 | 3600 | 3582 | 10560 | 2045 | 5580 | 2679 | 55800 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-13 | 2078 | 3600 | 3872 | 10560 | 2232 | 5580 | 2866 | 55800 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-14 | 2445 | 3600 | 4464 | 10560 | 2523 | 5580 | 3157 | 55800 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-15 | 2790 | 3600 | 5054 | 10560 | 2838 | 5580 | 3472 | 55800 | PASS |
| Gabriel Ferreira Barreto | 2026-04-02 | 585 | 3600 | 585 | 10560 | 272 | 5580 | 272 | 55800 | PASS |
| Gabriel Ferreira Barreto | 2026-04-03 | 855 | 3600 | 855 | 10560 | 485 | 5580 | 485 | 55800 | PASS |
| Gabriel Ferreira Barreto | 2026-04-04 | 1230 | 3600 | 1230 | 10560 | 681 | 5580 | 681 | 55800 | PASS |
| Gabriel Ferreira Barreto | 2026-04-06 | 1794 | 3600 | 1794 | 10560 | 889 | 5580 | 889 | 55800 | PASS |
| Gabriel Ferreira Barreto | 2026-04-07 | 2019 | 3600 | 2019 | 10560 | 1066 | 5580 | 1066 | 55800 | PASS |
| Gabriel Ferreira Barreto | 2026-04-08 | 2077 | 3600 | 2077 | 10560 | 1155 | 5580 | 1155 | 55800 | PASS |
| Gabriel Ferreira Barreto | 2026-04-09 | 1740 | 3600 | 2325 | 10560 | 1376 | 5580 | 1376 | 55800 | PASS |
| Gabriel Ferreira Barreto | 2026-04-10 | 2040 | 3600 | 2895 | 10560 | 1656 | 5580 | 1656 | 55800 | PASS |
| Gabriel Ferreira Barreto | 2026-04-11 | 1910 | 3600 | 3140 | 10560 | 1809 | 5580 | 1809 | 55800 | PASS |
| Gabriel Ferreira Barreto | 2026-04-12 | 2165 | 3600 | 3395 | 10560 | 1951 | 5580 | 1951 | 55800 | PASS |
| Gabriel Ferreira Barreto | 2026-04-13 | 1891 | 3600 | 3685 | 10560 | 2138 | 5580 | 2138 | 55800 | PASS |
| Gabriel Ferreira Barreto | 2026-04-14 | 2258 | 3600 | 4277 | 10560 | 2429 | 5580 | 2429 | 55800 | PASS |
| Gabriel Ferreira Barreto | 2026-04-15 | 2790 | 3600 | 4867 | 10560 | 2744 | 5580 | 2744 | 55800 | PASS |
| Jair Cesar Da Silva | 2026-04-24 | 0 | 3600 | 0 | 10560 | 0 | 5580 | 0 | 55800 | PASS |
| Jair Cesar Da Silva | 2026-04-29 | 0 | 3600 | 0 | 10560 | 0 | 5580 | 0 | 55800 | PASS |
| Jair Cesar Da Silva | 2026-04-30 | 30 | 3600 | 30 | 10560 | 20 | 5580 | 20 | 55800 | PASS |
| José Alfredo Gomes Marinho | 2026-04-03 | 260 | 3600 | 260 | 10560 | 245 | 5580 | 245 | 55800 | PASS |
| José Alfredo Gomes Marinho | 2026-04-14 | 0 | 3600 | 260 | 10560 | 245 | 5580 | 245 | 55800 | PASS |
| Karl Martin Kühr | 2026-02-02 | 0 | 3600 | 0 | 10560 | 0 | 5580 | 0 | 55800 | PASS |
| Karl Martin Kühr | 2026-02-06 | 495 | 3600 | 495 | 10560 | 340 | 5580 | 340 | 55800 | PASS |
| Karl Martin Kühr | 2026-02-11 | 585 | 3600 | 585 | 10560 | 440 | 5580 | 440 | 55800 | PASS |
| Karl Martin Kühr | 2026-02-12 | 1035 | 3600 | 1035 | 10560 | 622 | 5580 | 622 | 55800 | PASS |
| Karl Martin Kühr | 2026-03-03 | 456 | 3600 | 1491 | 10560 | 867 | 5580 | 867 | 55800 | PASS |
| Karl Martin Kühr | 2026-04-02 | 365 | 3600 | 365 | 10560 | 196 | 5580 | 1063 | 55800 | PASS |
| Karl Martin Kühr | 2026-04-03 | 609 | 3600 | 609 | 10560 | 375 | 5580 | 1242 | 55800 | PASS |
| Karl Martin Kühr | 2026-04-04 | 865 | 3600 | 865 | 10560 | 592 | 5580 | 1459 | 55800 | PASS |
| Karl Martin Kühr | 2026-04-05 | 935 | 3600 | 935 | 10560 | 873 | 5580 | 1740 | 55800 | PASS |
| Karl Martin Kühr | 2026-04-06 | 1199 | 3600 | 1199 | 10560 | 1072 | 5580 | 1939 | 55800 | PASS |
| Karl Martin Kühr | 2026-04-07 | 1469 | 3600 | 1469 | 10560 | 1479 | 5580 | 2346 | 55800 | PASS |
| Karl Martin Kühr | 2026-04-08 | 1789 | 3600 | 1789 | 10560 | 1692 | 5580 | 2559 | 55800 | PASS |
| Karl Martin Kühr | 2026-04-09 | 1684 | 3600 | 2049 | 10560 | 1887 | 5580 | 2754 | 55800 | PASS |
| Karl Martin Kühr | 2026-04-10 | 1727 | 3600 | 2336 | 10560 | 2078 | 5580 | 2945 | 55800 | PASS |
| Karl Martin Kühr | 2026-04-11 | 2054 | 3600 | 2919 | 10560 | 2401 | 5580 | 3268 | 55800 | PASS |
| Karl Martin Kühr | 2026-04-12 | 2123 | 3600 | 3058 | 10560 | 2488 | 5580 | 3355 | 55800 | PASS |
| Karl Martin Kühr | 2026-04-13 | 2292 | 3600 | 3491 | 10560 | 2769 | 5580 | 3636 | 55800 | PASS |
| Karl Martin Kühr | 2026-04-14 | 2400 | 3600 | 3869 | 10560 | 3004 | 5580 | 3871 | 55800 | PASS |
| Karl Martin Kühr | 2026-04-15 | 2384 | 3600 | 4173 | 10560 | 3398 | 5580 | 4265 | 55800 | PASS |
| Max Monteiro Magioli | 2026-04-24 | 260 | 3600 | 260 | 10560 | 230 | 5580 | 230 | 55800 | PASS |
| Max Monteiro Magioli | 2026-04-29 | 800 | 3600 | 800 | 10560 | 525 | 5580 | 525 | 55800 | PASS |
| Max Monteiro Magioli | 2026-04-30 | 1125 | 3600 | 1125 | 10560 | 719 | 5580 | 719 | 55800 | PASS |
| Paloma Gonçalves Magioli | 2026-03-02 | 355 | 3600 | 355 | 10560 | 188 | 5580 | 188 | 55800 | PASS |
| Paloma Gonçalves Magioli | 2026-03-03 | 955 | 3600 | 955 | 10560 | 549 | 5580 | 549 | 55800 | PASS |
| Paloma Gonçalves Magioli | 2026-04-19 | 0 | 3600 | 0 | 10560 | 0 | 5580 | 549 | 55800 | PASS |
| Paloma Gonçalves Magioli | 2026-04-24 | 555 | 3600 | 555 | 10560 | 340 | 5580 | 889 | 55800 | PASS |
| Paloma Gonçalves Magioli | 2026-04-29 | 1080 | 3600 | 1080 | 10560 | 635 | 5580 | 1184 | 55800 | PASS |
| Paloma Gonçalves Magioli | 2026-04-30 | 1490 | 3600 | 1490 | 10560 | 910 | 5580 | 1459 | 55800 | PASS |
| Rubens Negreiros Silva | 2026-04-15 | 304 | 3600 | 304 | 10560 | 394 | 5580 | 394 | 55800 | PASS |
| Rubens Negreiros Silva | 2026-04-16 | 594 | 3600 | 594 | 10560 | 593 | 5580 | 593 | 55800 | PASS |
| Rubens Negreiros Silva | 2026-04-17 | 874 | 3600 | 874 | 10560 | 703 | 5580 | 703 | 55800 | PASS |
| Rubens Negreiros Silva | 2026-04-18 | 1439 | 3600 | 1439 | 10560 | 902 | 5580 | 902 | 55800 | PASS |
| Rubens Negreiros Silva | 2026-04-19 | 1439 | 3600 | 1439 | 10560 | 902 | 5580 | 902 | 55800 | PASS |
| Rubens Negreiros Silva | 2026-04-20 | 2024 | 3600 | 2024 | 10560 | 1245 | 5580 | 1245 | 55800 | PASS |
| Rubens Negreiros Silva | 2026-04-21 | 2609 | 3600 | 2609 | 10560 | 1527 | 5580 | 1527 | 55800 | PASS |
| Rubens Negreiros Silva | 2026-04-22 | 2888 | 3600 | 3192 | 10560 | 1921 | 5580 | 1921 | 55800 | PASS |
| Rubens Negreiros Silva | 2026-04-23 | 2858 | 3600 | 3452 | 10560 | 2134 | 5580 | 2134 | 55800 | PASS |
| Rubens Negreiros Silva | 2026-04-24 | 3133 | 3600 | 4007 | 10560 | 2474 | 5580 | 2474 | 55800 | PASS |
| Rubens Negreiros Silva | 2026-04-25 | 2828 | 3600 | 4267 | 10560 | 2707 | 5580 | 2707 | 55800 | PASS |
| Rubens Negreiros Silva | 2026-04-27 | 2566 | 3600 | 4590 | 10560 | 2958 | 5580 | 2958 | 55800 | PASS |
| Rubens Negreiros Silva | 2026-04-28 | 2206 | 3600 | 4815 | 10560 | 3163 | 5580 | 3163 | 55800 | PASS |
| Rubens Negreiros Silva | 2026-04-29 | 2148 | 3600 | 5340 | 10560 | 3458 | 5580 | 3458 | 55800 | PASS |
| Rubens Negreiros Silva | 2026-04-30 | 2298 | 3600 | 5750 | 10560 | 3733 | 5580 | 3733 | 55800 | PASS |
| Vitor De Almeida Costa | 2026-04-24 | 260 | 3600 | 260 | 10560 | 230 | 5580 | 230 | 55800 | PASS |
| Vitor De Almeida Costa | 2026-04-29 | 800 | 3600 | 800 | 10560 | 525 | 5580 | 525 | 55800 | PASS |
| Vitor De Almeida Costa | 2026-04-30 | 1125 | 3600 | 1125 | 10560 | 719 | 5580 | 719 | 55800 | PASS |
| Wilson Maciel Martins Nery | 2026-04-03 | 260 | 3600 | 260 | 10560 | 245 | 5580 | 245 | 55800 | PASS |
| Wilson Maciel Martins Nery | 2026-04-08 | 325 | 3600 | 325 | 10560 | 339 | 5580 | 339 | 55800 | PASS |
| Wilson Maciel Martins Nery | 2026-04-14 | 443 | 3600 | 703 | 10560 | 574 | 5580 | 574 | 55800 | PASS |
| Wilson Maciel Martins Nery | 2026-04-15 | 477 | 3600 | 802 | 10560 | 686 | 5580 | 686 | 55800 | PASS |

## TABELA G - Cross-validation HV
| Tripulante | Data | HV SIGVOOS (min) | HV FRMS (min) | Delta | STATUS |
| --- | --- | --- | --- | --- | --- |
| ANTONIO LUIS SIMOES RAMOS | 2026-03-03 | 245 | 245 | 0 | PASS |
| ANTONIO LUIS SIMOES RAMOS | 2026-04-03 | 245 | 245 | 0 | PASS |
| Antonio Luiz Simões Ramos | 2026-02-11 | 100 | 100 | 0 | PASS |
| Diego Bichara Bejamin | 2026-04-30 | 20 | 20 | 0 | PASS |
| Dieter Johny Kühr | 2026-03-04 | 355 | 355 | 0 | PASS |
| Dieter Johny Kühr | 2026-04-02 | 196 | 196 | 0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-03-03 | 361 | 361 | 0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04-02 | 272 | 272 | 0 | PASS |
| Gabriel Ferreira Barreto | 2026-04-02 | 272 | 272 | 0 | PASS |
| Jair Cesar Da Silva | 2026-04-30 | 20 | 20 | 0 | PASS |
| JETHER PONTES  E SILVA JR. | 2026-03-03 | 353 | 353 | 0 | PASS |
| José Alfredo Gomes Marinho | 2026-04-03 | 245 | 245 | 0 | PASS |
| Karl Martin Kühr | 2026-02-06 | 340 | 340 | 0 | PASS |
| Karl Martin Kühr | 2026-03-03 | 245 | 245 | 0 | PASS |
| Karl Martin Kühr | 2026-04-02 | 196 | 196 | 0 | PASS |
| Max Monteiro Magioli | 2026-04-30 | 194 | 194 | 0 | PASS |
| Paloma Gonçalves Magioli | 2026-03-03 | 361 | 361 | 0 | PASS |
| Paloma Gonçalves Magioli | 2026-04-30 | 275 | 275 | 0 | PASS |
| Rubens Negreiros Silva | 2026-04-30 | 275 | 275 | 0 | PASS |
| Vitor De Almeida Costa | 2026-04-30 | 194 | 194 | 0 | PASS |
| Wilson Maciel Martins Nery | 2026-04-03 | 245 | 245 | 0 | PASS |
| Wilson Maciel Martins Nery | 2026-04-08 | 94 | 94 | 0 | PASS |
| Wilson Maciel Martins Nery | 2026-04-14 | 235 | 235 | 0 | PASS |
| Wilson Maciel Martins Nery | 2026-04-15 | 112 | 112 | 0 | PASS |

## TABELA H - Cobertura por tripulante/mes
| Tripulante | Mes | Dias SIGVOOS | Dias FRMS | Cobertura% | STATUS |
| --- | --- | --- | --- | --- | --- |
| ANTONIO LUIS SIMOES RAMOS | 2026-03 | 1 | 1 | 100.0 | PASS |
| ANTONIO LUIS SIMOES RAMOS | 2026-04 | 1 | 1 | 100.0 | PASS |
| Antonio Luiz Simões Ramos | 2026-02 | 1 | 1 | 100.0 | PASS |
| Diego Bichara Bejamin | 2026-04 | 1 | 1 | 100.0 | PASS |
| Dieter Johny Kühr | 2026-03 | 1 | 1 | 100.0 | PASS |
| Dieter Johny Kühr | 2026-04 | 1 | 1 | 100.0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-03 | 1 | 1 | 100.0 | PASS |
| Fernando La Rocque De Freitas Filho | 2026-04 | 1 | 1 | 100.0 | PASS |
| Gabriel Ferreira Barreto | 2026-04 | 1 | 1 | 100.0 | PASS |
| Jair Cesar Da Silva | 2026-04 | 1 | 1 | 100.0 | PASS |
| JETHER PONTES  E SILVA JR. | 2026-03 | 1 | 1 | 100.0 | PASS |
| José Alfredo Gomes Marinho | 2026-04 | 1 | 1 | 100.0 | PASS |
| Karl Martin Kühr | 2026-02 | 1 | 1 | 100.0 | PASS |
| Karl Martin Kühr | 2026-03 | 1 | 1 | 100.0 | PASS |
| Karl Martin Kühr | 2026-04 | 1 | 1 | 100.0 | PASS |
| Max Monteiro Magioli | 2026-04 | 1 | 1 | 100.0 | PASS |
| Paloma Gonçalves Magioli | 2026-03 | 1 | 1 | 100.0 | PASS |
| Paloma Gonçalves Magioli | 2026-04 | 1 | 1 | 100.0 | PASS |
| Rubens Negreiros Silva | 2026-04 | 1 | 1 | 100.0 | PASS |
| Vitor De Almeida Costa | 2026-04 | 1 | 1 | 100.0 | PASS |
| Wilson Maciel Martins Nery | 2026-04 | 4 | 4 | 100.0 | PASS |

## BLOCO 8 - Scheduler automatico
- Cron em producao: 0 8 * * * -> 05:00 BRT (UTC-3)
- auto_sync_hora_utc configurado: 21:00
- Handler: Handler sincroniza a primeira janela pendente entre last_sync_to+1 e hoje; nao esta fixado estritamente em ontem 00:00-23:59.
- Eventos automaticos ultimos 7 dias: 0
- Falhas ultimos 7 dias: 0
- Alerta de falha: identificado

| Tipo | Timestamp | Janela | totalEtapas | Status | STATUS |
| --- | --- | --- | --- | --- | --- |
| Sem dados | - | - | - | - | - |

## CORRECOES NECESSARIAS
- Nenhuma correcao mandataria registrada; sem FAILs.
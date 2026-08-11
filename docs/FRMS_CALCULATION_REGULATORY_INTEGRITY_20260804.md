# FRMS — Integridade dos cálculos e validação regulatória

**Branch:** `fix/frms-calculation-regulatory-integrity-20260804`  
**SHA-base:** `c3259a7967412c4a4219beba095f4b5515fb71b9`  
**Fórmula empresarial proposta:** `FRMS_EFFECTIVENESS_V2_20260804`  
**Estado:** implementação técnica em PR de rascunho; aprovação regulatória e científica pendente.

## 1. Escopo e declaração de conformidade

Esta alteração corrige erros matemáticos e temporais comprovados. Ela **não declara** que o AirTrust, isoladamente, comprova conformidade integral com a Lei nº 13.475/2017 ou com o RBAC nº 117.

O índice de `effectiveness` não possui fórmula numérica definida na Lei nº 13.475/2017, no RBAC nº 117 ou na IS nº 117-001C. Portanto, ele permanece um **modelo empresarial de triagem**, sujeito a validação formal por especialista de FRMS, operador e, quando aplicável, processo aceito pela ANAC.

## 2. Caracterização antes da correção

| Caso determinístico                                                                               |                                                 Resultado anterior | Inconsistência                                                                                     | Classificação                      |
| ------------------------------------------------------------------------------------------------- | -----------------------------------------------------------------: | -------------------------------------------------------------------------------------------------- | ---------------------------------- |
| jornada anterior em 03/08, apresentação 18:00, término 02:00; nova apresentação em 04/08 às 10:00 |                                                   1.920 min (32 h) | somava um dia extra porque associava 02:00 à data de início sem reconstruir o intervalo da jornada | bug temporal/matemático            |
| jornada corrente 06:00–17:00 com 180 min de voo                                                   |                                                   `hv_dia_min = 0` | janela de 24 h terminava na apresentação e excluía toda a jornada corrente                         | convenção previsão/realizado       |
| primeira jornada ou histórico incompleto                                                          |                                           `repouso_suficiente = 1` | desconhecido era transformado em suficiente                                                        | decisão de segurança fail-open     |
| 240 min de voo e limite mensal de 90 h                                                            |                                     `fator_hv_basica_pct = 4,4444` | razão multiplicada por 100 era somada a penalidades em escala fracionária                          | bug dimensional                    |
| jornada 08:00–17:00 sem pausa registrada                                                          |                                                            480 min | dedução fixa de 60 min sem evidência de pausa                                                      | regra empresarial não documentada  |
| effectiveness com sono/WOCL                                                                       | baseline positivo e diferenças entre fatores eram somados ao total | compensações de grandezas com significados diferentes podiam cancelar risco                        | bug dimensional/modelo empresarial |

Os valores anteriores permanecem documentados como caracterização; nenhum deles foi promovido a comportamento desejado.

## 3. Resultado depois da correção

- O intervalo da jornada é reconstruído por data de apresentação, hora de apresentação e hora de término. Término menor ou igual à apresentação indica cruzamento real de meia-noite.
- O repouso é a diferença entre o fim reconstruído da jornada anterior e a apresentação corrente. Não se adicionam 24 horas apenas porque os rótulos de data são consecutivos.
- A janela `REALIZADO_APOS_JORNADA` termina no fim da jornada corrente e inclui suas horas de voo. A janela `PROJECAO_ANTES_JORNADA` termina na apresentação e permanece explicitamente separada.
- Repouso desconhecido produz `repouso_estado = DESCONHECIDO` e `repouso_suficiente = 0` por compatibilidade fail-closed.
- Fatores históricos com sufixo `_pct` passam a utilizar uma única escala fracionária 0–1. Percentuais de utilização de limites permanecem 0–100.
- Razões básicas de utilização não entram na soma de penalidades.
- O horário real de despertar prevalece. A estimativa só ocorre quando o real está ausente, com `fonte_sono = PADRAO` e campos de evento que separam real de estimado.
- Sono acima de oito horas não cria bônus positivo. Menos sono, maior exposição noturna/WOCL e maior jornada não melhoram o índice.
- Não há dedução de almoço sem pausa registrada.

## 4. Convenção temporal canônica

| Item                        | Convenção                                                                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| data da jornada             | data civil da apresentação                                                                                                                                                                                                   |
| início                      | `data + hora_apresentacao`                                                                                                                                                                                                   |
| fim no mesmo dia            | `hora_termino > hora_apresentacao`                                                                                                                                                                                           |
| cruzamento de meia-noite    | `hora_termino <= hora_apresentacao`, acrescentando um dia ao fim                                                                                                                                                             |
| dado incompleto             | intervalo desconhecido; não se inventa duração                                                                                                                                                                               |
| timezone operacional padrão | `America/Sao_Paulo`                                                                                                                                                                                                          |
| UTC                         | suportado como identificação explícita                                                                                                                                                                                       |
| DST                         | o schema atual não guarda offset/instante. A aritmética usa minutos civis e não depende do TZ do runtime. Operações em zona com transição DST exigem data/hora com offset ou instante UTC antes de homologação internacional |

## 5. Fórmula empresarial v2

```text
effectiveness_raw_pct = 100 + 100 × soma_das_penalidades_fracionarias

effectiveness_pct = limite_visual(effectiveness_raw_pct, 0, 100)
```

A limitação de apresentação em 0–100 é apenas contrato visual. A investigação e o dry-run devem conservar o delta bruto para não ocultar saturação.

Entram na soma:

- penalidade circadiana/WOCL;
- duração longa;
- sono/repouso;
- decolagem e chegada noturnas;
- ciclo embarcado;
- base away;
- não aclimatado;
- quantidade de horas de voo;
- progressão no período embarcado.

Não entram:

- `fator_basica_pct` de jornada;
- `fator_hv_basica_pct`;
- percentuais de utilização 0–100;
- bônus positivos por repouso ou sono.

## 6. Matriz de fórmulas, unidades e fontes

| Variável            | Fórmula/unidade                                                                                   | Fonte normativa                                                | Fonte empresarial                   | Interpretação e teste                           | Divergência/gate                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| duração da jornada  | fim − apresentação; minutos                                                                       | Lei 13.475/2017, art. 35                                       | pausa somente quando registrada     | 08:00–17:00 = 540 min sem pausa                 | validar campos de encerramento doméstico/internacional                                                         |
| repouso anterior    | apresentação atual − fim anterior; minutos                                                        | Lei 13.475/2017, arts. 46–48                                   | estado desconhecido fail-closed     | 02:00→10:00 = 480 min                           | mínimos de 12/16/24 h dependem da jornada anterior e do regime aplicável; parametrização completa ainda é gate |
| HV diária realizada | soma proporcional das jornadas sobrepostas às 24 h terminadas no fim da jornada corrente; minutos | Lei 13.475/2017 e apêndice aplicável do RBAC 117               | modo explícito realizado            | jornada corrente incluída                       | limite diário depende do serviço/operação; confirmar configuração por operador                                 |
| HV diária projetada | janela de 24 h terminada na apresentação; minutos                                                 | gestão prospectiva de risco                                    | modo explícito projeção             | jornada corrente não realizada fica fora        | não misturar com valor realizado persistido                                                                    |
| HV 7 dias           | soma por janela; minutos e %                                                                      | não identificada como limite geral de helicópteros no RBAC 117 | política interna configurável       | mudança de limite altera %                      | especialista deve confirmar aplicabilidade                                                                     |
| HV 28 dias          | soma em 28 dias; minutos e %                                                                      | apêndice do RBAC 117 selecionado pelo operador                 | `HV_28_DIAS_HORAS`                  | janela cruza mês                                | confirmar apêndice operacional                                                                                 |
| HV mês civil        | soma no mês; minutos e %                                                                          | Lei 13.475/2017, art. 33                                       | `HV_MES_HORAS`                      | mês ≠ 28 dias                                   | confirmar tipo de serviço                                                                                      |
| HV 365 dias         | soma em 365 dias; minutos e %                                                                     | apêndice do RBAC 117 selecionado                               | `HV_365_DIAS_HORAS`                 | janela móvel                                    | confirmar apêndice e operação                                                                                  |
| WOCL                | 02:00–06:00; minuto do dia                                                                        | IS 117-001C, conceito circadiano                               | curva de penalidade interna         | despertar na WOCL não melhora resultado         | curva numérica exige validação científica                                                                      |
| sono efetivo        | despertar − início do sono; minutos                                                               | princípios de fadiga da IS 117-001C                            | padrão de oito horas quando ausente | 5h ≤ 8h = 12h = 16h em segurança, sem bônus >8h | estimativa não substitui dado real                                                                             |
| fator de repouso    | penalidade fracionária ≤ 0                                                                        | norma não prescreve fórmula                                    | modelo empresarial                  | monotonicidade                                  | validação formal obrigatória                                                                                   |
| fator noturno       | penalidade fracionária ≤ 0                                                                        | princípios da IS 117-001C                                      | `NOTURNO_FATOR`                     | noturno ≤ diurno                                | validar magnitude                                                                                              |
| fator duração       | penalidade fracionária ≤ 0 após limiar                                                            | limites legais/RBAC aplicáveis                                 | `DURACAO_LONGA_*`                   | jornada maior não aumenta effectiveness         | validar limiar por operação                                                                                    |
| effectiveness       | 100 + soma de penalidades ×100; %                                                                 | nenhuma fórmula normativa localizada                           | `FRMS_EFFECTIVENESS_V2_20260804`    | determinismo e monotonicidade                   | não aprovar como fórmula regulatória sem especialista                                                          |
| score de check-in   | média ponderada 0–100                                                                             | nenhuma fórmula normativa localizada                           | pesos empresariais                  | desconhecido não vira ótimo                     | calibrar com dados e governança médica/FRMS                                                                    |

## 7. Fontes oficiais consultadas

1. Lei nº 13.475/2017, Presidência da República: jornada, horas de voo e repouso — `https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2017/lei/l13475.htm`.
2. RBAC nº 117 EMD 01, versão vigente indicada pela ANAC desde 1º de agosto de 2024 — `https://www.anac.gov.br/assuntos/legislacao/legislacao-1/rbha-e-rbac/rbac`.
3. IS nº 117-001C, emitida em julho de 2026: conceitos básicos de fadiga, WOCL, sono, trabalho noturno e seleção de apêndice — `https://www.anac.gov.br/assuntos/legislacao/legislacao-1/boletim-de-pessoal/2026/bps-v-21-no-28-13-a-17-07-2026/is-117-001c/visualizar_ato_normativo`.
4. Resolução ANAC nº 750/2024, que aprovou a EMD 01 ao RBAC 117.

## 8. Casos numéricos cobertos

A suíte `frms-regulatory-integrity.test.ts` cobre os vinte casos obrigatórios, além da ausência de pausa e da separação projeção/realizado:

- 02:00→10:00; 23:00→10:00; mesma data; múltiplos dias;
- 5h, 8h, 12h e 16h de sono;
- diurno, noturno e WOCL;
- despertar real, estimado e dado desconhecido;
- jornada corrente em HV diária;
- limite configurado e escalas 0–1/0–100;
- monotonicidade;
- UTC, America/Sao_Paulo e virada de ano;
- dado incompleto;
- valores históricos caracterizados.

## 9. Gate de especialista

Antes de promover a PR para pronta para revisão, um especialista responsável pelo FRMS do operador deve registrar formalmente:

- apêndice do RBAC 117 aplicável a cada tipo de operação;
- limites diários, 28 dias, mês e 365 dias por serviço;
- tratamento de jornada anterior para repousos de 12/16/24 horas;
- aplicabilidade de acordos coletivos e SGRF aceito;
- magnitude e direção dos fatores empresariais;
- critérios de bloqueio, alerta e override;
- aprovação ou rejeição da fórmula `FRMS_EFFECTIVENESS_V2_20260804`.

## 10. Riscos residuais

- O schema atual não representa timestamp com offset, dobra/lacuna de DST ou data explícita de término.
- A configuração possui um único `REPOUSO_MINIMO_HORAS`; os patamares completos de repouso por duração da jornada anterior ainda precisam de fonte única parametrizada e validação do regime operacional.
- Campos históricos `_pct` preservam nome legado apesar de agora serem frações.
- `tempo_abaixo_limiar_pct` preserva nome legado, embora o valor continue em minutos.
- Registros persistidos anteriores permanecem inalterados até execução governada da Frente 10.

## 11. Segurança operacional

Nesta frente não houve:

- consulta ou escrita em D1 remoto;
- reprocessamento histórico;
- migration;
- deploy;
- alteração de produção;
- merge.

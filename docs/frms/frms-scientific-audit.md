# FRMS — Auditoria matemática e científica dos cálculos

**PR:** #811 · **Branch:** `fix/frms-calculation-regulatory-integrity-20260804`
**SHA-base (main no momento da auditoria):** `ec4c2ab2a99adb9bba974a85cd155c9ef7c572dd`
**SHA da branch auditada (entrada):** `8f089fb36cdf78e9106c2a38f3edb977adfa1d10`
**Data:** 2026-08-05

## 0. Declaração de escopo e de não conformidade automática

Esta auditoria verifica **matemática, unidades, domínios e rastreabilidade documental**.
Ela **não declara** conformidade regulatória do AirTrust com a Lei nº 13.475/2017,
com o RBAC nº 117 ou com a IS nº 117-001C. Conformidade depende de manual do
operador, processo aceito pela ANAC e validação por especialista de FRMS.

Onde a norma define um valor, ele é citado com seção. Onde não define, o item é
marcado **M-xx (modelo empresarial)** e permanece explicitamente não validado.

## 1. Fontes primárias utilizadas

| ID  | Fonte                                                                                                              | Uso                                               |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| F-1 | RBAC nº 117, Emenda nº 01 (Resolução ANAC nº 750/2024) — `pergamum.anac.gov.br/pergamum/vinculos/RBAC117EMD01.pdf` | jornada, repouso, WOCL, tempo de voo              |
| F-2 | RBAC 117 EMD 01, **117.3(n)**                                                                                      | definição de jornada                              |
| F-3 | RBAC 117 EMD 01, **117.3(aa)**                                                                                     | tempo de voo calço-a-calço                        |
| F-4 | RBAC 117 EMD 01, **117.3(u)** (remete ao art. 46 da Lei nº 13.475/2017)                                            | repouso é período ininterrupto após a jornada     |
| F-5 | RBAC 117 EMD 01, **117.3(m)-III(1)**                                                                               | WOCL = 02h00–06h00, hora local da base contratual |
| F-6 | RBAC 117 EMD 01, Apêndice A, **A117.23(b)**                                                                        | repouso mínimo em função da jornada anterior      |
| F-7 | RBAC 117 EMD 01, Apêndice A, **A117.23(c)–(d)**                                                                    | limites alternativos aprovados; +2 h por fuso     |

Texto literal de F-6, base da correção D-04:

> (b) O tempo mínimo de repouso tem duração relacionada ao tempo da jornada anterior, observando-se os seguintes limites:
> (1) 12 (doze) horas de repouso, após jornada de até 12 (doze) horas;
> (2) 16 (dezesseis) horas de repouso, após jornada de mais de 12 (doze) horas e até 15 (quinze) horas;
> (3) 24 (vinte e quatro) horas de repouso, após jornada de mais de 15 (quinze) horas.

Texto literal de F-5, base da janela WOCL:

> (1) para viagens que cruzam menos de 3 fusos horários, o período transcorrido, total ou parcialmente, entre 02h00 e 06h00, hora local da base contratual do tripulante

## 2. Convenções de unidade (declaradas, nunca inferidas)

| Grandeza                | Unidade                                  | Domínio     | Onde                                      |
| ----------------------- | ---------------------------------------- | ----------- | ----------------------------------------- |
| instante civil          | minuto desde 1970-01-01, tempo de parede | ℤ           | `civilMinute`, oráculo `civilInstant`     |
| minuto do dia           | minuto                                   | [0, 1440)   | `parseHhmm`                               |
| duração                 | minuto                                   | ℤ≥0         | `calcDuracaoJornada`                      |
| **penalidade**          | fração adimensional                      | **[-1, 0]** | todos os `fator_*` exceto razões          |
| **razão de utilização** | fração adimensional                      | **[0, ∞)**  | `fator_basica_pct`, `fator_hv_basica_pct` |
| percentual de limite    | ponto percentual                         | [0, ∞)      | `pct_limite_*`                            |
| effectiveness           | ponto percentual                         | [0, 100]    | `effectiveness_pct`                       |

O sufixo `_pct` cobre três grandezas distintas por dívida histórica — ver **D-10**.

## 3. Matriz de rastreabilidade

Legenda de resultado: **OK** conferido contra fonte/oráculo · **M** modelo
empresarial sem fonte numérica · **D** defeito corrigido nesta auditoria ·
**L** limitação documentada.

| #   | Função / arquivo                                    | Finalidade                        | Entradas (unidade)                         | Domínio     | Equação implementada                                  | Fonte / seção                              | Constantes              | Arredondamento | Fora do domínio                       | Teste                      | Resultado     |
| --- | --------------------------------------------------- | --------------------------------- | ------------------------------------------ | ----------- | ----------------------------------------------------- | ------------------------------------------ | ----------------------- | -------------- | ------------------------------------- | -------------------------- | ------------- |
| 1   | `calcDuracaoJornada` · `calculos.ts`                | duração da jornada                | apresentação, término (HH:MM); pausa (min) | 00:00–23:59 | `fim − início (+1440 se fim ≤ início) − pausa`        | F-2 (117.3(n))                             | —                       | inteiro        | HH:MM inválido → 0                    | §1, §2, §6                 | **OK**        |
| 2   | `resolveJornadaInterval` · `calculos.ts`            | intervalo físico da jornada       | data + HH:MM                               | ISO válido  | data rotula a apresentação; término ≤ início ⇒ +1 dia | F-2                                        | 1440                    | inteiro        | intervalo nulo → repouso DESCONHECIDO | §1, §2 V-01                | **OK**        |
| 3   | `calcRepousoAnterior` · `calculos.ts`               | repouso observado                 | histórico de jornadas                      | —           | `apresentação_atual − fim_anterior_mais_recente`      | F-4 (117.3(u))                             | —                       | inteiro        | sobreposição/ausência ⇒ DESCONHECIDO  | §2 V-01, §6 D-07           | **D-07**      |
| 4   | `repousoMinimoRequeridoMin` · `calculos.ts`         | piso de repouso exigido           | duração da jornada anterior (min)          | ℤ≥0         | escada 12 h / 16 h / 24 h                             | **F-6 (A117.23(b))**                       | 12, 16, 24 h            | inteiro        | `null` ⇒ piso base                    | §1, §2 V-02/V-03/V-04, §6  | **D-04**      |
| 5   | `calcHvRolling24h` · `calculos.ts`                  | HV em janela móvel de 24 h        | jornadas + HV (min)                        | —           | `Σ hv · (sobreposição / duração)`                     | F-3 + **M-03** (rateio)                    | 1440                    | `Math.round`   | duração ≤ 0 ⇒ ignora                  | §2 V-05/V-06, §5           | **OK / M-03** |
| 6   | `calcAcumuloRolling` (7/28/365/mês)                 | HV acumulado                      | jornadas                                   | —           | soma por rótulo de data civil                         | F-1 + política interna                     | 7/28/365                | inteiro        | —                                     | §5                         | **OK / L-03** |
| 7   | `isWithinWOCL` · `fadiga-score.ts`                  | janela circadiana                 | minuto do dia                              | [0,1440)    | `120 ≤ m < 360`                                       | **F-5 (117.3(m)-III)**                     | 02:00, 06:00            | —              | normaliza mod 1440                    | §1, §6                     | **OK**        |
| 8   | `calcularPenalidadeWOCL`                            | penalidade de despertar na WOCL   | minuto do dia                              | [0,1440)    | `−(0,30 − min(1,\|m−240\|/120)·0,15)`                 | janela F-5; função **M-01**                | 0,30 / 0,15             | —              | fora da WOCL ⇒ 0                      | §1                         | **M-01**      |
| 9   | `calcularFatorRepouso`                              | débito de sono                    | sono (min)                                 | ℤ           | `0` se ≥480; senão `−((480−s)/480)·0,5`               | **M-02**                                   | 480, 0,5                | —              | ≤0 ou não finito ⇒ −0,5               | §1, §4                     | **M-02**      |
| 10  | `calcularSono`                                      | duração e proveniência do sono    | apresentação, dormiu, acordou              | —           | despertar real prevalece; senão apresentação − offset | **M-04**                                   | 90 min, 8 h, teto 16 h  | inteiro        | inválido ⇒ padrão                     | §1 (fadiga-score.v2)       | **D-01**      |
| 11  | `toPenalty` · `calculos.ts`                         | normalização de fator configurado | valor + `FATORES_ESCALA`                   | ℝ           | `−min(1, \|v\|/(escala))`                             | convenção interna                          | —                       | —              | não finito ⇒ 0; \|v\|>1 satura −1     | §7 D-03                    | **D-03**      |
| 12  | `calcFatorizacao`                                   | fatores da jornada                | jornada, repouso, limites                  | —           | soma de penalidades; razões excluídas                 | **M-05**                                   | `LIMITES_DEFAULT`       | `round4`       | folga ⇒ zeros                         | §3, §4                     | **M-05**      |
| 13  | `calcFatorCicloEmbarcado`                           | fadiga acumulada no embarque      | dia do ciclo                               | ℤ≥1         | interpolação linear entre patamares                   | **M-06**                                   | dia 1–15; 0 → −0,15     | `round4`       | `null`/< início ⇒ 0                   | §1                         | **M-06**      |
| 14  | `calcEffectiveness`                                 | índice de effectiveness           | fatorização + jornada                      | —           | `100 + 100·Σ penalidades`, saturado                   | **M-07**                                   | 100                     | 1 casa         | satura [0,100]                        | §2 V-07, §4                | **M-07**      |
| 15  | `classificarEffectiveness`                          | faixa visual                      | effectiveness                              | [0,100]     | limiares configuráveis                                | **M-08**                                   | 90 / 77 / 65            | —              | —                                     | §7                         | **M-08**      |
| 16  | `calcularScoreFadiga` · `fadiga-score.ts`           | score de check-in                 | KSS, sono, sintomas                        | —           | soma ponderada ×100 + penalidades                     | **M-09** (KSS: Åkerstedt & Gillberg, 1990) | pesos 0,4/0,25/0,2/0,15 | `Math.round`   | ausente ⇒ valor conservador           | `fadiga-score.test.ts`     | **M-09**      |
| 17  | `sincronizarCheckinComFrms` · `fadiga-frms-sync.ts` | persistência do resultado         | check-in + jornada                         | —           | grava sono, proveniência e effectiveness              | —                                          | —                       | —              | coluna ausente ⇒ ignora               | `fadiga-frms-sync.test.ts` | **D-01/D-02** |
| 18  | `validarEscalaFutura`                               | violações projetadas              | períodos projetados                        | —           | reusa 4, 5, 6                                         | F-6 + política                             | —                       | `round4`       | duração ≥ 24 h ⇒ usa campo de duração | §6                         | **D-06**      |

## 4. Relatório de defeitos

### D-01 — `fonte_sono` passou a significar proveniência do despertar (regressão semântica)

- **Função:** `calcularSono` (`fadiga-score.ts`), `sincronizarCheckinComFrms`.
- **Caso:** tripulante reporta 6 h de sono no check-in, sem informar o horário de despertar.
- **Evidência de contrato:** `routes/frms.ts:1995` grava `fonte_sono = 'INFORMADO'`
  ao registrar `hora_dormiu`; `routes/frms.ts:942` deriva
  `informedData = Boolean(horaAcordou) || fonte_sono === 'INFORMADO'`.
  Três testes independentes já codificavam essa semântica
  (`fadiga-score.v2.test.ts:398`, `calcEffectiveness.test.ts:280`,
  `fadiga-frms-sync.test.ts:251`).
- **Esperado:** `INFORMADO`. **Atual (antes):** `PADRAO`.
- **Impacto operacional:** o sync sobrescrevia com `PADRAO` o `INFORMADO` gravado
  pela rota, e a tela de rastreabilidade passava a rotular **dado real do
  tripulante como estimativa**. Perda de informação de proveniência.
- **Severidade:** ALTA (integridade de dado de segurança; sem efeito numérico).
- **Causa-raiz:** conflação de duas proveniências distintas num único campo.
- **Correção:** `fonteSono` volta a descrever a proveniência do **dado de sono**;
  a proveniência do **despertar** passa a ser exposta em
  `EffectivenessResult.despertar_estimado` (campo novo) e no já existente
  `wake_time_source` do evento.
- **Regressão:** `frms-scientific-audit.test.ts` §1 + testes restaurados.

### D-02 — `hora_acordou` gravado com duas semânticas por dois caminhos

- **Função:** `fadiga-frms-sync.ts` (alterado pela PR) vs `db-service-jornadas.ts` (não alterado).
- **Caso:** despertar estimado. O sync gravava `NULL`; o outro caminho gravava a estimativa.
- **Impacto:** a mesma coluna passa a ter dois significados conforme o caminho de escrita.
- **Severidade:** ALTA (integridade de dado).
- **Correção:** convenção única — `frms_jornada.hora_acordou` guarda **apenas
  despertar real**; a estimativa vive em
  `frms_fatorizacao_jornada.hora_despertar_estimada`. É a convenção que
  `routes/frms.ts` já pressupõe ao distinguir `wakeTime` de `wakeTimeEstimated`.
  Ambos os caminhos passam a usar `effectResult.despertar_estimado`.
- **Reprocessamento:** ver §6.

### D-03 — inferência de unidade por valor era descontínua e não monotônica

- **Função:** `asPenalty` (`calculos.ts`), introduzida pela PR.
- **Caso:** `NOTURNO_FATOR` configurado em 1,0 versus 1,0001.
- **Equação anterior:** `magnitude = |v| > 1 ? |v|/100 : |v|`.
- **Valores:** `v = 1,0 → −1,0`; `v = 1,0001 → −0,010001`.
- **Diferença absoluta:** 0,99 · **relativa:** 99 %. **Tolerância:** 0 — a função
  deveria ser não crescente em `|v|`.
- **Impacto operacional:** aumentar a severidade configurada **reduzia** a
  penalidade aplicada em ~99 pontos de effectiveness. Um operador endurecendo o
  parâmetro afrouxava o sistema.
- **Severidade:** ALTA (parâmetro de segurança com resposta invertida).
- **Correção:** a escala passa a ser declarada uma vez por configuração
  (`FATORES_ESCALA: 'FRACAO' | 'PERCENTUAL'`, padrão `FRACAO`, que é a escala de
  `LIMITES_DEFAULT`). Valores fora do domínio **saturam em −1** (falha fechada)
  em vez de serem reinterpretados. `calcEffectiveness` passa a usar
  `clampPenalty`, evitando dupla conversão sob escala percentual.
- **Regressão:** §7 varre o parâmetro atravessando \|v\| = 1 e exige monotonicidade.

### D-04 — repouso mínimo tratado como constante, contra A117.23(b)

- **Função:** `calcAcumuloRolling` (`calculos.ts`).
- **Caso:** jornada anterior de 13 h seguida de 13 h de repouso.
- **Fonte:** F-6 — jornada de mais de 12 h e até 15 h exige **16 h** de repouso.
- **Esperado:** `INSUFICIENTE` (780 min < 960 min). **Atual (antes):**
  `SUFICIENTE` (780 min ≥ `REPOUSO_MINIMO_HORAS` = 720 min).
- **Diferença absoluta:** 180 min de repouso não exigidos · **relativa:** 18,75 %.
- **Impacto operacional:** condição de repouso **abaixo do mínimo regulamentar**
  classificada como segura — exatamente a classe de erro que a PR se propôs a
  eliminar. Afeta jornadas longas, que são as de maior risco.
- **Severidade:** **CRÍTICA**.
- **Causa-raiz:** o piso da norma é função da jornada anterior; o código usava
  um único escalar.
- **Correção:** `repousoMinimoRequeridoMin()` implementa a escada de A117.23(b).
  Patamares configuráveis (A117.23(c) permite limites aprovados pela ANAC), com
  `Math.max` contra `REPOUSO_MINIMO_HORAS` para que a configuração do operador
  só possa **endurecer**, nunca afrouxar. `AcumuloRollingResult` passa a expor
  `repouso_minimo_requerido_min` e `duracao_jornada_anterior_min`.
- **Regressão:** §2 V-02, V-03, V-04; §6 bordas 12 h/15 h; §7 sensibilidade.

### D-05 — `DURACAO_CURTA_*` é configuração morta

- **Função:** `calcFatorDuracao`.
- **Evidência:** `DURACAO_CURTA_MINUTOS` e `DURACAO_CURTA_FATOR` existem em
  `LimitesMap` e em `LIMITES_DEFAULT` (360 min / −0,1) mas nenhum deles é lido.
- **Impacto:** um operador pode configurá-los e crer que uma mitigação está ativa.
- **Severidade:** BAIXA. **Decisão:** manter o comportamento (jornada curta não
  deve atenuar fadiga) e **documentar**; teste §7 fixa a inércia do parâmetro
  para que a ausência de efeito seja intencional e visível, não acidental.

### D-06 — duração ≥ 24 h dava a volta no relógio na projeção

- **Função:** `montarJornadasProjetadas` (`validarEscalaFutura`).
- **Caso:** `duracao_estimada_min = 1500` (25 h).
- **Cálculo:** `minutesToHhmm(360 + 1500)` = `minutesToHhmm(1860)` = `'07:00'`,
  e `resolveJornadaInterval` reconstruía **60 min** em vez de 1500.
- **Diferença absoluta:** 1440 min · **relativa:** 96 %.
- **Impacto:** jornada projetada absurdamente longa validada como curta.
- **Severidade:** MÉDIA (só afeta projeção, não histórico).
- **Correção:** não sintetiza término quando a duração ≥ 1440; o intervalo passa
  a vir do campo de duração, que não tem teto de 24 h.

### D-07 — jornada anterior sobreposta inflava o repouso (falha aberta)

- **Função:** `calcRepousoAnterior`.
- **Caso:** jornada de 03/08 18:00 → 04/08 12:00 e jornada atual em 04/08 10:00.
- **Comportamento anterior:** a sobreposta era ignorada e o algoritmo usava uma
  jornada **mais antiga**, produzindo um repouso maior que o real.
- **Impacto:** dado inconsistente convertido em folga fictícia.
- **Severidade:** ALTA. **Correção:** sobreposição marca `DESCONHECIDO`
  (`repouso_suficiente = 0`, falha fechada). Também removido um ternário morto
  cujos dois ramos retornavam `'DESCONHECIDO'`.
- **Regressão:** §6.

### D-10 — sufixo `_pct` cobre três grandezas

Razão de utilização (≥ 0, ilimitada), penalidade ([-1, 0]) e minutos
(`tempo_abaixo_limiar_pct` guarda **minutos**). Mantido por compatibilidade de
schema; fixado por teste em §3 para impedir que a distinção se perca. Renomear
exige migration — fora do escopo desta PR.

## 5. Limitações e itens de modelo (sem afirmação de conformidade)

| ID         | Item                                                                | Situação                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M-01       | função de penalidade WOCL                                           | janela vem de F-5; a curva triangular é empresarial                                                                                                                                              |
| M-02       | débito de sono linear até 8 h                                       | empresarial; não é Two-Process de Borbély calibrado                                                                                                                                              |
| M-03       | rateio uniforme do tempo de voo na janela de 24 h                   | aproximação; F-3 define calço-a-calço e o schema não guarda etapas                                                                                                                               |
| M-04       | despertar estimado 90 min antes da apresentação                     | premissa empresarial                                                                                                                                                                             |
| M-05..M-09 | fatorização, ciclo, effectiveness, classificação, score de check-in | **`FRMS_EFFECTIVENESS_V2_20260804` é modelo empresarial de triagem**; nenhuma fonte regulatória define a fórmula numérica                                                                        |
| L-01       | schema guarda relógio de parede, sem offset nem DST                 | horários ambíguos/inexistentes são tratados como rótulos civis                                                                                                                                   |
| L-02       | WOCL usa minuto local sem base contratual explícita                 | F-5 exige hora local da **base contratual**; operações AWAY multi-fuso não são distinguidas                                                                                                      |
| L-03       | janelas 7/28/365 usam rótulo de data civil, não interseção          | metodologia diferente da janela de 24 h                                                                                                                                                          |
| L-04       | deduplicação de jornadas é responsabilidade da origem               | linhas distintas contam como eventos distintos                                                                                                                                                   |
| **D-09**   | **A117.23(d): +2 h de repouso por fuso quando cruzados 3 ou mais**  | **não modelado — o schema não registra fusos cruzados.** Repouso pode ser declarado suficiente onde a norma exigiria acréscimo. Requer mudança de schema (migration), fora do escopo autorizado. |

## 6. Impacto em dados históricos e reprocessamento

**Nenhum dado histórico foi reprocessado nesta auditoria.** Nenhuma migration,
nenhum deploy, nenhuma escrita remota.

| Defeito   | Afeta histórico?                                  | Registros potencialmente afetados                                                                                   |
| --------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| D-04      | **Sim**                                           | `frms_acumulo_*` / validações onde a jornada anterior > 12 h e o repouso ficou entre o piso configurado e o exigido |
| D-07      | Sim                                               | jornadas com sobreposição de FDP no histórico                                                                       |
| D-01/D-02 | Sim                                               | `frms_jornada.fonte_sono` e `hora_acordou` gravados pelo sync após a PR                                             |
| D-03      | Só tenants com fatores em escala percentual no D1 | indeterminado sem consulta — **não consultado**                                                                     |
| D-06      | Não                                               | apenas projeção, não persistida                                                                                     |

O diagnóstico somente leitura já versionado em
`scripts/diagnostics/frms-calculation-impact-readonly.sql` cobre a caracterização.
O plano de reprocessamento (dry-run, lotes, backup, rollback, idempotência)
está em `docs/FRMS_HISTORICAL_REPROCESSING_PLAN_20260804.md` e **exige
autorização separada**.

## 7. Execução da suíte

| Gate                                                 | Resultado                                                                                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `worker-airtrust` — suíte completa                   | ver §Evidência na PR                                                                                                             |
| Suíte de auditoria (`frms-scientific-audit.test.ts`) | 49 casos                                                                                                                         |
| Independência de TZ                                  | verificada sob `UTC`, `America/Sao_Paulo`, `Pacific/Kiritimati`, `Pacific/Niue` + guarda estrutural contra APIs de horário local |

## 8. Critério de aceitação

| Critério                          | Situação                                                               |
| --------------------------------- | ---------------------------------------------------------------------- |
| erro de CI corrigido              | sim — 15 asserções obsoletas reconciliadas com a convenção documentada |
| toda fórmula com fonte rastreável | sim, **ou** marcada M-xx como modelo empresarial                       |
| unidades verificadas              | sim (§3 da suíte)                                                      |
| oráculo independente coincide     | sim, dentro das tolerâncias declaradas                                 |
| bordas cobertas                   | sim (§6 da suíte)                                                      |
| sem NaN/Infinity no domínio       | sim (§3, §4)                                                           |
| TZ não altera resultados          | sim (§8)                                                               |
| incerteza científica marcada      | sim (§5) — **não há afirmação de conformidade**                        |

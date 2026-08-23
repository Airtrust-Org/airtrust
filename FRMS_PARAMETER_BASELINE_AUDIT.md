# FRMS Parameter Baseline Audit

**Identificação**
- Perfil: `HELICOPTER_OFFSHORE`
- Revisão: `V1` (`FRMS_HELICOPTER_OFFSHORE_BASELINE_V1`)
- Modelo: `LEGACY_MODEL_V2`
- Escopo: AirTrust FRMS é destinado a **operação offshore de helicópteros**
  (rotação embarcada, plataforma, base de apoio). Não é um motor de aviação
  geral nem fixed-wing — os parâmetros de ciclo embarcado
  (`CICLO_EMBARCADO_*`), repouso em plataforma (`REPOUSO_PLATAFORMA_*`) e
  degradação progressiva do período embarcado (`FRMS_EMBARQUE_PROGRESSO_MAX`)
  só fazem sentido operacional nesse contexto; nenhum parâmetro do modelo
  atual pressupõe operação de asa fixa ou aviação comercial genérica.

Read-only inventory of every parameter the FRMS engine consumes today, as a
precondition for governing `HELICOPTER_OFFSHORE` under
`FRMS_HELICOPTER_OFFSHORE_BASELINE_V1`. No values are changed by this
document or by this phase.

## Sources inspected

- `worker-airtrust/src/lib/frms/types.ts` — `LimitesMap` / `LIMITES_DEFAULT` (67 keys)
- `worker-airtrust/src/lib/frms/fadiga-score.ts` — `FadigaBusinessPolicy` / `LEGACY_FADIGA_BUSINESS_POLICY` (25 keys)
- `worker-airtrust/src/lib/frms/fortnight-indicator.ts` — `FrmsFortnightPolicy` / `LEGACY_FORTNIGHT_POLICY` (36 keys)
- Consumers checked: `calculos.ts`, `fadiga-score.ts`, `compliance-policy.ts`, `alertas.ts`,
  `fortnight-indicator.ts`, `operational-snapshot.ts`, `decision-policy.ts`,
  `frms-governance-readiness.ts`, `parameter-governance.ts`

**Total governed parameters: 128** (67 + 25 + 36). These are exactly the keys
`resolveFrmsOperationalContext` already requires present in a governed
revision (`Object.keys(LIMITES_DEFAULT)` for the first 67; the fadiga/fortnight
sets are validated separately by `resolveFadigaBusinessPolicy` /
`resolveFortnightPolicy`). No new parameter surface is introduced by this
document.

> **Correção de inventário (2026-08-22):** a contagem original desta seção
> (120 = 63 + 24 + 33) era um erro de contagem manual, não uma alteração de
> escopo. A contagem real, verificada programaticamente a partir do código-fonte
> (`Object.keys(LIMITES_DEFAULT).length`, `Object.keys(LEGACY_FADIGA_BUSINESS_POLICY).length`,
> `Object.keys(LEGACY_FORTNIGHT_POLICY).length`), é 128 (67 + 25 + 36). Nenhum
> valor de parâmetro, fórmula, threshold ou classificação foi alterado; a
> baseline sempre representou os valores atuais do runtime — apenas o número
> total relatado nesta seção estava incorreto. Ver [MR !79](https://gitlab.com/airtrust-group/airtrust/-/merge_requests/79)
> e `FRMS_HELICOPTER_OFFSHORE_STAGING_PROVISIONING_PLAN.md`.

---

## 1. `LimitesMap` (source: `types.ts`, default fallback: `LIMITES_DEFAULT`)

| Parâmetro | Valor atual | Arquivo origem | Tipo |
|---|---|---|---|
| FDP_MAXIMO_HORAS | 11 | types.ts | REGULATORY (RBAC 117) — **⚠ citação incompleta**: código não referencia o item/tabela específica; RBAC 117 define FDP máximo por tabela variável (nº de pousos, horário de apresentação, período de repouso anterior), não um valor único fixo — 11h aparenta ser um teto conservador único, não a tabela completa. Precisa de revisão normativa específica antes de tratar como citação regulatória completa. |
| REPOUSO_MINIMO_HORAS | 12 | types.ts | REGULATORY (RBAC 117) — **⚠ citação incompleta**: sem item/artigo específico |
| HV_7_DIAS_HORAS | 45 | types.ts | OPERATIONAL_POLICY (política interna conservadora; RBAC 117 não define HV/7d) |
| HV_28_DIAS_HORAS | 93 | types.ts | REGULATORY (RBAC 117 Apêndice C) |
| HV_MES_HORAS | 90 | types.ts | REGULATORY (Lei 13.475/2017, mês calendário) |
| HV_365_DIAS_HORAS | 930 | types.ts | REGULATORY + OPERATIONAL_POLICY (misto) — Lei 13.475 estabelece 960h/ano; 930h é uma margem interna mais restritiva sobreposta à lei. A norma em si é REGULATORY, mas o valor efetivo (930 vs. 960) reflete uma escolha de política operacional, não a norma pura. |
| HV_DIARIA_HORAS | 8 | types.ts | REGULATORY |
| ALERTA_AVISO_PCT | 80 | types.ts | OPERATIONAL_POLICY |
| ALERTA_ATENCAO_PCT | 90 | types.ts | OPERATIONAL_POLICY |
| ALERTA_CRITICO_PCT | 95 | types.ts | OPERATIONAL_POLICY |
| ALERTA_VIOLACAO_PCT | 101 | types.ts | OPERATIONAL_POLICY |
| FDP_ALERTA_RESTANTE_HORAS | 3 | types.ts | OPERATIONAL_POLICY |
| HV_DIA_ALERTA_RESTANTE_HORAS | 2 | types.ts | OPERATIONAL_POLICY |
| REPOUSO_PLATAFORMA_MINIMO_HORAS | 3 | types.ts | OFFSHORE_BENCHMARK (repouso em plataforma) — **⚠ sem documento-fonte citado** (IOGP 690-2 / contrato Petrobras / outro?); só o rótulo "OFFSHORE_BENCHMARK" está no código, sem referência ao documento normativo específico |
| REPOUSO_PLATAFORMA_MAXIMO_HORAS | 6 | types.ts | OFFSHORE_BENCHMARK — **⚠ sem documento-fonte citado**, idem |
| CICLO_EMBARCADO_DIA_INICIO | 1 | types.ts | OFFSHORE_BENCHMARK (ciclo embarcado) — **⚠ sem documento-fonte citado** |
| CICLO_EMBARCADO_DIA_MAX | 15 | types.ts | OFFSHORE_BENCHMARK — 15 dias é consistente com o padrão comum de rotação offshore 14/14 ou 15/15, mas **nenhuma fonte contratual/documental é citada no código** confirmando qual rotação real está em vigor |
| CICLO_EMBARCADO_PCT_MIN | 0 | types.ts | OFFSHORE_BENCHMARK |
| CICLO_EMBARCADO_PCT_MAX | -0.15 | types.ts | OFFSHORE_BENCHMARK |
| CICLO_EMBARCADO_ATIVO | 1 | types.ts | OFFSHORE_BENCHMARK (flag) |
| APRESENTACAO_MADRUGADA_H_MIN | 0 | types.ts | BIOLOGICAL_MODEL (janela circadiana) |
| APRESENTACAO_MADRUGADA_H_MAX | 4 | types.ts | BIOLOGICAL_MODEL |
| APRESENTACAO_MADRUGADA_FATOR | -0.2 | types.ts | BIOLOGICAL_MODEL |
| APRESENTACAO_AMANHECER_H_MIN | 5 | types.ts | BIOLOGICAL_MODEL |
| APRESENTACAO_AMANHECER_H_MAX | 6 | types.ts | BIOLOGICAL_MODEL |
| APRESENTACAO_AMANHECER_FATOR | -0.05 | types.ts | BIOLOGICAL_MODEL |
| APRESENTACAO_DIURNO_H_MIN | 7 | types.ts | BIOLOGICAL_MODEL |
| APRESENTACAO_DIURNO_H_MAX | 11 | types.ts | BIOLOGICAL_MODEL |
| APRESENTACAO_DIURNO_FATOR | 0 | types.ts | BIOLOGICAL_MODEL |
| APRESENTACAO_TARDE_H_MIN | 12 | types.ts | BIOLOGICAL_MODEL |
| APRESENTACAO_TARDE_H_MAX | 17 | types.ts | BIOLOGICAL_MODEL |
| APRESENTACAO_TARDE_FATOR | -0.1 | types.ts | BIOLOGICAL_MODEL |
| APRESENTACAO_NOITE_FATOR | -0.2 | types.ts | BIOLOGICAL_MODEL |
| DURACAO_LONGA_MINUTOS | 600 | types.ts | BIOLOGICAL_MODEL |
| DURACAO_LONGA_FATOR | -0.1 | types.ts | BIOLOGICAL_MODEL |
| DURACAO_CURTA_MINUTOS | 360 | types.ts | BIOLOGICAL_MODEL |
| DURACAO_CURTA_FATOR | -0.1 | types.ts | BIOLOGICAL_MODEL |
| DURACAO_NORMAL_FATOR | 0 | types.ts | BIOLOGICAL_MODEL |
| REPOUSO_ADEQUADO_MINUTOS | 720 | types.ts | BIOLOGICAL_MODEL |
| REPOUSO_ADEQUADO_FATOR | 0 | types.ts | BIOLOGICAL_MODEL |
| REPOUSO_RUIM_MINUTOS | 480 | types.ts | BIOLOGICAL_MODEL |
| REPOUSO_RUIM_FATOR | -0.1 | types.ts | BIOLOGICAL_MODEL |
| REPOUSO_CRITICO_FATOR | -0.2 | types.ts | BIOLOGICAL_MODEL |
| NOTURNO_INICIO_HORA | 22 | types.ts | BIOLOGICAL_MODEL (WOCL) |
| NOTURNO_FIM_HORA | 5 | types.ts | BIOLOGICAL_MODEL (WOCL) |
| NOTURNO_FATOR | -0.1 | types.ts | BIOLOGICAL_MODEL (WOCL) |
| HV_MUITAS_MINUTOS | 300 | types.ts | BIOLOGICAL_MODEL |
| HV_MUITAS_FATOR | -0.1 | types.ts | BIOLOGICAL_MODEL |
| HV_POUCAS_MINUTOS | 120 | types.ts | BIOLOGICAL_MODEL |
| HV_POUCAS_FATOR | -0.1 | types.ts | BIOLOGICAL_MODEL |
| HV_NORMAL_FATOR | 0 | types.ts | BIOLOGICAL_MODEL |
| FATOR_BASE_AWAY_PCT | -0.1 | types.ts | OFFSHORE_BENCHMARK (operação fora da base) |
| FATOR_ACLIMATADO_NAO_PCT | -0.1 | types.ts | BIOLOGICAL_MODEL |
| FATOR_TRIPULACAO_AUM_HORAS | 2.0 | types.ts | OPERATIONAL_POLICY (tripulação aumentada) |
| VISUAL_AVISO_PCT | 40 | types.ts | OPERATIONAL_POLICY (early warning dashboard) — **⚠ código morto**: não referenciado em nenhum arquivo além de `types.ts` (nem cálculo, nem rota, nem UI) |
| VISUAL_ATENCAO_PCT | 85 | types.ts | OPERATIONAL_POLICY — **⚠ código morto**: idem |
| VISUAL_CRITICO_PCT | 95 | types.ts | OPERATIONAL_POLICY — **⚠ código morto**: idem |
| EFFECTIV_VERDE_MIN | 90 | types.ts | BIOLOGICAL_MODEL (proxy de effectiveness) |
| EFFECTIV_AMARELO_MAX | 77 | types.ts | BIOLOGICAL_MODEL |
| EFFECTIV_VERMELHO_MAX | 65 | types.ts | BIOLOGICAL_MODEL |
| EFFECTIV_PERIODO_PCT | 30 | types.ts | BIOLOGICAL_MODEL |
| REPOUSO_MIN_PRE_APRESENTACAO | 90 | types.ts | OFFSHORE_BENCHMARK (modelo de sono offshore) — **⚠ não consumido por nenhum cálculo**; apenas exibido/editável em `FrmsConfiguracoes.tsx` |
| REPOUSO_MIN_POS_LIBERACAO | 60 | types.ts | OFFSHORE_BENCHMARK — **⚠ não consumido por nenhum cálculo**; apenas exibido/editável em `FrmsConfiguracoes.tsx` |
| REPOUSO_QUALIDADE_HOTEL | 92 | types.ts | OFFSHORE_BENCHMARK — **⚠ não consumido por nenhum cálculo**; apenas exibido/editável em `FrmsConfiguracoes.tsx`; origem do valor "92" e sua escala (percentual? score?) não documentada em nenhum lugar do código |
| FRMS_EMBARQUE_PROGRESSO_MAX | 8 | types.ts | OFFSHORE_BENCHMARK (unidade: **percentual**, não dias — penalidade cumulativa máxima de 8% ao final do período embarcado; ver `calculos.ts:419`, `/100`) |
| MINUTOS_ANTES_APRESENTACAO | 90 | types.ts | BIOLOGICAL_MODEL (premissa operacional de sono) |
| HORAS_SONO_PADRAO | 8 | types.ts | BIOLOGICAL_MODEL |

## 2. `FadigaBusinessPolicy` (source: `fadiga-score.ts`, default: `LEGACY_FADIGA_BUSINESS_POLICY`)

Governed parameter keys (as resolved via `resolveFadigaBusinessPolicy`), all **BIOLOGICAL_MODEL**:

| Parâmetro (chave governada) | Valor atual | Arquivo origem |
|---|---|---|
| FATIGUE_MEDICATION_BONUS | 8 | fadiga-score.ts |
| FATIGUE_ALCOHOL_BONUS | 15 | fadiga-score.ts |
| WOCL_START_MINUTE | 120 | fadiga-score.ts |
| WOCL_END_MINUTE | 360 | fadiga-score.ts |
| WOCL_CENTER_PENALTY | 0.3 | fadiga-score.ts |
| WOCL_EDGE_PENALTY | 0.15 | fadiga-score.ts |
| KSS_NORM_LE_2 | 0 | fadiga-score.ts |
| KSS_NORM_LE_4 | 0.15 | fadiga-score.ts |
| KSS_NORM_LE_6 | 0.4 | fadiga-score.ts |
| KSS_NORM_EQ_7 | 0.7 | fadiga-score.ts |
| KSS_NORM_EQ_8 | 0.85 | fadiga-score.ts |
| KSS_NORM_GE_9 | 1 | fadiga-score.ts |
| SLEEP_DURATION_MISSING_NORM | 0.6 | fadiga-score.ts |
| SLEEP_DURATION_GE_8_NORM | 0 | fadiga-score.ts |
| SLEEP_DURATION_GE_7_NORM | 0.15 | fadiga-score.ts |
| SLEEP_DURATION_GE_6_NORM | 0.35 | fadiga-score.ts |
| SLEEP_DURATION_GE_5_NORM | 0.6 | fadiga-score.ts |
| SLEEP_DURATION_GE_4_NORM | 0.8 | fadiga-score.ts |
| SLEEP_DURATION_LT_4_NORM | 1 | fadiga-score.ts |
| SLEEP_QUALITY_MISSING_NORM | 0.4 | fadiga-score.ts |
| SLEEP_QUALITY_GE_5_NORM | 0 | fadiga-score.ts |
| SLEEP_QUALITY_EQ_4_NORM | 0.2 | fadiga-score.ts |
| SLEEP_QUALITY_EQ_3_NORM | 0.45 | fadiga-score.ts |
| SLEEP_QUALITY_EQ_2_NORM | 0.7 | fadiga-score.ts |
| SLEEP_QUALITY_LT_2_NORM | 1 | fadiga-score.ts |

## 3. `FrmsFortnightPolicy` (source: `fortnight-indicator.ts`, default: `LEGACY_FORTNIGHT_POLICY`)

All **OPERATIONAL_POLICY** (quinzena / trend / score thresholds and impact weights — not a biological calculation, but a scheduling-pattern classification policy):

| Parâmetro (chave governada) | Valor atual |
|---|---|
| FORTNIGHT_CONSECUTIVE_DAYS_ATTENTION | 4 |
| FORTNIGHT_CONSECUTIVE_DAYS_CRITICAL | 5 |
| FORTNIGHT_LOW_SLEEP_HOURS | 6 |
| KSS_HIGH_THRESHOLD | 7 |
| FORTNIGHT_LOW_EFFECTIVENESS_PCT | 70 |
| FORTNIGHT_DAYS_WITHOUT_DUTY | 2 |
| FORTNIGHT_LONG_REST_MINUTES | 780 |
| FORTNIGHT_SHORT_AVG_DUTY_MINUTES | 360 |
| FORTNIGHT_SHORT_REST_MINUTES | 600 |
| FORTNIGHT_EARLY_0600_MINUTES | 360 |
| FORTNIGHT_EARLY_0700_MINUTES | 420 |
| FORTNIGHT_RECURRING_EARLY_PRESENTATIONS | 2 |
| FORTNIGHT_ROLLING_DUTY_PCT | 0.8 |
| FORTNIGHT_SCORE_ATTENTION | 45 |
| FORTNIGHT_SCORE_CRITICAL | 75 |
| FORTNIGHT_SCORE_LIMIT_WEIGHT | 0.65 |
| FORTNIGHT_TREND_INCREASING_IMPACT | 6 |
| FORTNIGHT_TREND_REDUCING_IMPACT | -4 |
| FORTNIGHT_IMPACT_DAYS_WITHOUT_DUTY | -8 |
| FORTNIGHT_IMPACT_LONG_REST | -6 |
| FORTNIGHT_IMPACT_SHORT_AVG_DUTY | -5 |
| FORTNIGHT_IMPACT_NO_EARLY_PRESENTATION | -3 |
| FORTNIGHT_IMPACT_COMPLETE_DATA | -4 |
| FORTNIGHT_IMPACT_CONSECUTIVE_ATTENTION | 8 |
| FORTNIGHT_IMPACT_CONSECUTIVE_CRITICAL | 14 |
| FORTNIGHT_IMPACT_CHECKIN_PENDING | 10 |
| FORTNIGHT_IMPACT_ESTIMATED_DATA | 7 |
| FORTNIGHT_IMPACT_EARLY_0600 | 8 |
| FORTNIGHT_IMPACT_RECURRING_EARLY | 5 |
| FORTNIGHT_IMPACT_SHORT_REST | 16 |
| FORTNIGHT_IMPACT_LOW_SLEEP | 12 |
| FORTNIGHT_IMPACT_HIGH_KSS | 12 |
| FORTNIGHT_IMPACT_LOW_EFFECTIVENESS | 14 |
| FORTNIGHT_IMPACT_ROLLING_DUTY | 10 |
| FORTNIGHT_IMPACT_DAILY_CRITICAL | 18 |
| FORTNIGHT_IMPACT_DAILY_ATTENTION | 7 |

---

## Consumers cross-referenced (no additional undocumented parameters found)

- `calculos.ts` — reads `LimitesMap` fields directly for `calcFatorizacao`/`calcEffectiveness`/`validarRepousoPlataforma`/`calcAcumuloRolling`.
- `fadiga-score.ts` — `calcularScoreFadiga`, `calcularPenalidadeWOCL`, `calcularSono` consume `FadigaBusinessPolicy`.
- `compliance-policy.ts` — pure regulatory-limit-table functions (RBAC 117, IOGP 690-2, Lei 13.475); do not read `LimitesMap`/policy objects directly, they take explicit numeric arguments — no additional governed parameter surface.
- `alertas.ts` — `processarAlertas` consumes `LimitesMap` (ALERTA_*_PCT, FDP/HV thresholds).
- `fortnight-indicator.ts` — `buildFrmsFortnightIndicatorMap` consumes `FrmsFortnightPolicy`.
- `operational-snapshot.ts` — resolves governed context once per snapshot window, passes `LimitesMap`/`FrmsFortnightPolicy` through.
- `decision-policy.ts` — `buildDecisaoFields` uses `FrmsDecisaoPolicy` (`atencao`/`incompleto`/`critico`/`violacao`/`allowBloqueia`), which is **not** part of `LimitesMap`/governed parameter tables today — documented separately in the MR70 session as an intentional fixed safety floor, out of scope for this baseline (see "Fase 5" section below).

No parameter was found in any consumer that is absent from the three tables above.

---

## Fase 5 — Classificação de `LIMITES_DEFAULT` / `LEGACY_GENERAL` / `LEGACY_MODEL_V2`

Not removed (per instruction). Classified only, read-only inventory of every
remaining reference:

| Símbolo | Arquivo(s) | Classificação | Nota |
|---|---|---|---|
| `LIMITES_DEFAULT` | `types.ts` | **bootstrap** | A própria definição do valor padrão. |
| `LIMITES_DEFAULT` | `db-service-config.ts` (`carregarLimites`) | **bootstrap** | Fallback de leitura da tabela legada `frms_configuracao_limites`; alimenta o painel admin legado (`frms-relatorios-config.ts`), que continua sendo a superfície explícita de edição da tabela legada — não uma decisão operacional silenciosa (ver auditoria MR70). |
| `LIMITES_DEFAULT` | `parameter-governance.ts`, `frms-governance-readiness.ts`, `governed-recalc.ts` | **definição explícita** | Usado apenas via `Object.keys(...)` como a lista de chaves obrigatórias que uma revisão governada precisa satisfazer — nunca como valor de fallback em runtime. |
| `LIMITES_DEFAULT` | `calculos.ts` (`resolverEscalaFatores`) | **compatibilidade** | Tipo de parâmetro opcional (`Partial<LimitesMap> | null`), não um valor de fallback silencioso — a função já trata ausência de forma explícita (`FRACAO` como escala padrão documentada). |
| `LIMITES_DEFAULT` | `db-service-jornadas.ts`, `frms-fira.ts`, `frms.ts`, `services/sigvoos-frms.ts`, `cron/resilient/sigvoos-frms.ts`, `cron/scheduled-handler.ts` | **compatibilidade apenas** | Placeholder inerte passado para funções (`recalcularPipeline`, `reprocessarTripulanteCompleto`, `salvarJornada`/`atualizarJornada`/`importarApus`) que **ignoram esse parâmetro e resolvem o contexto governado internamente** (achado e documentado na sessão MR70: `fix(frms): wire remaining FRMS callers...`). Mantido apenas pela assinatura de tipo; não afeta nenhum cálculo. |
| `LEGACY_GENERAL` | `migrations/0464_frms_parameter_governance_recalc.sql` (bootstrap seed) | **bootstrap** | `profile_code` da revisão global de bootstrap (`frms-legacy-global-v2`). Não é referenciado como constante em nenhum arquivo `.ts` — é apenas um valor de dado na revisão. |
| `LEGACY_MODEL_V2` / `FRMS_LEGACY_MODEL_VERSION` | `parameter-governance.ts` | **bootstrap** | Constante nomeada usada para rotular `policy_version`/`model_version` das revisões que preservam o comportamento numérico anterior — exatamente o valor solicitado para `FRMS_HELICOPTER_OFFSHORE_BASELINE_V1` nesta mesma tarefa. |

**Objetivo declarado**: a configuração oficial para operação de helicóptero
offshore passa a ser `HELICOPTER_OFFSHORE` → revisão `V1`, resolvida via
`resolveFrmsOperationalContext`. Nenhum símbolo listado acima foi removido —
todos seguem classificados como bootstrap/definição-explícita/compatibilidade,
nenhum como "fallback operacional silencioso" residual (essa classe foi
eliminada na sessão anterior, MR70).


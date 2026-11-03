
---

# PARTE III — Auditoria aprofundada do cálculo de fadiga e da coleta de dados (prioridade do usuário)

Escopo: como o AirTrust coleta o estado do tripulante (check-in, sono, KSS, PVT) e como transforma isso em indicadores de fadiga (score do check-in, índice de efetividade, quinzena, recuperação, prontidão). Todos os achados abaixo foram comprovados por leitura do código e, quando indicado, por **casos de referência executados** contra as funções reais (`calcularScoreFadiga`, `calcularSono`, `calcularFatorRepouso`) com os parâmetros padrão da migration 0287 (`threshold_amarelo=40`, `threshold_vermelho=60`, pesos KSS 0,35 / duração 0,25 / qualidade 0,2 / sintomas 0,2) e a política legada de normalização.

## 17. Mapa da coleta → cálculo

```
Check-in (FrmsFlightCheckinFadiga.tsx / FrmsCheckinFadiga.tsx / Pilot App)
  campos: hora_apresentacao*, hora_acordou*, horas_sono_24h ou hora_dormiu*, qualidade_sono, kss_score,
          subjective_fatigue_level (enviado TAMBÉM como sleepiness_level), fit_for_duty, meds/álcool 12 h,
          oportunidade_sono_horas_24h, PVT (readiness)          (* obrigatórios no servidor)
  └─ POST /api/frms/fadiga-checkin (frms-fadiga-checkin-legacy.ts)
       normalizeCheckinInput → calcularScoreFadiga (score 0–100, VERDE..VERMELHO, APTO/INAPTO)
                             → evaluateDailyRisk (sono <4/<5 h, fadiga subjetiva ≥8/≥6, "sleepiness" ≥8/≥6)
       grava frms_fadiga_checkin (kss_score, horas_sono, score, nível, status_operacional)
  └─ recalcularPipeline (db-service-jornadas.ts) para a jornada do dia
       loadDailyCheckinEvidence → wakeTime + sleepHours24h
       calcEffectiveness(hora_dormiu = jornada.hora_dormiu, hora_acordou = check-in)   ← horas de sono NÃO entram
       grava frms_jornada.sono_efetivo_min/fonte_sono e frms_fatorizacao_jornada.effectiveness_*
  └─ snapshot operacional: alertas KSS_ALTO (KSS ≥7), SONO_INSUFICIENTE (0 < sono < 6 h), EFETIVIDADE_BAIXA…
  └─ indicador quinzenal (fortnight-indicator.ts): agravantes/atenuadores (#1476)
  └─ prontidão (readiness.ts): PVT + KSS + sono → preserved / attention / operational_review
```

## 18. Achados — cálculo e coleta de fadiga

### FRMS-FAD-001 — Horas de sono informadas no check-in são descartadas no índice de efetividade e sobrescritas por 8 h
- **P0 · alta · comprovado (código + caso executado)**
- **Onde:** `worker-airtrust/src/lib/frms/db-service-jornadas.ts` — chamada de `calcEffectiveness` (≈l. 549–560) passa `hora_dormiu: jornada.hora_dormiu` (só preenchido pelo `PATCH /jornada/:id/sono`) e `hora_acordou: checkinEvidence.wakeTime`; `checkinEvidence.sleepHours24h` não é passado. `fadiga-score.ts` `calcularSono` (≈l. 322): sem `horaDormiu` usa `horasSonoPadrao` (8 h, `frms-config.ts`) e marca `fonteSono = 'INFORMADO'` porque `horaAcordou` existe. Depois, o `UPDATE frms_jornada SET ... sono_efetivo_min = ?, fonte_sono = ?` (≈l. 574–592) grava 480 min e `INFORMADO`, **sobrescrevendo** o valor correto que o bloco anterior (≈l. 410–425) havia gravado a partir do check-in.
- **Caso executado:** `calcularSono({ apresentação 05:30, acordou 04:00, sem hora_dormiu })` → `sonoEfetivoMin = 480`, `fonteSono = 'INFORMADO'`, `calcularFatorRepouso(480) = 0`.
- **Impacto:** o tripulante que informa 4 h de sono (o formulário coleta horas, não horário de dormir) tem a efetividade calculada como se tivesse dormido 8 h, sem penalidade de sono, e o banco passa a registrar 8 h "informadas". O índice principal exibido na Operação fica otimista exatamente no cenário de maior risco. Mitigação parcial existente: o snapshot ainda gera `SONO_INSUFICIENTE` a partir de `frms_fadiga_checkin.horas_sono`, e o score quinzenal usa o check-in.
- **Correção exata:**
  1. Em `calcEffectiveness`/`calcularSono`, aceitar `sleepMinutesReported` (de `checkinEvidence.sleepHours24h`) e usá-lo como duração quando `horaDormiu` for nulo.
  2. `fonteSono` passa a descrever só a **duração**: `INFORMADO` apenas com `horaDormiu` ou `sleepMinutesReported`; caso contrário `PADRAO`.
  3. Sem nenhuma duração informada, não calcular `fatorRepouso` com 8 h: marcar `sono_indisponivel` e rebaixar a confiança (ver FAD-008).
  4. O `UPDATE` final não pode sobrescrever `sono_efetivo_min`/`fonte_sono` vindos do check-in com valores padrão.
- **Teste de aceitação:** check-in com `horas_sono_24h = 4`, sem `hora_dormiu` → `duracao_sono_efetiva_min = 240`, `fator_repouso_calibrado_pct = −0,25`, `fonte_sono = INFORMADO`; `frms_jornada.sono_efetivo_min` permanece 240 após o pipeline.

### FRMS-FAD-002 — Horário de sono inválido vira sono máximo (falha aberta)
- **P1 · alta · comprovado (caso executado)**
- `calcularSono`: `dormiu 04:30, acordou 04:00` (inversão/digitação) → 23 h 30 → limitado a **960 min (16 h)** → `fatorRepouso = 0`; `dormiu = acordou` → duração 0 → **substituída por 8 h** com `INFORMADO`.
- **Correção:** duração calculada > 14 h ou = 0 → rejeitar no check-in (`400 sleep_window_invalid`) e, no cálculo, tratar como indisponível. Nunca substituir dado inválido por padrão favorável.

### FRMS-FAD-003 — KSS ausente é gravado como 5 ("nem alerta nem sonolento")
- **P1 · alta · comprovado**
- `frms-fadiga-checkin-legacy.ts` `normalizeCheckinInput` (≈l. 213–218): sem `kss_score` e sem `sleepiness_level`, `kssScore = 5`; com só `sleepiness_level` (0–10), converte por `round(s/10·8)+1`. O valor é gravado em `frms_fadiga_checkin.kss_score` como qualquer outro. A proveniência (`CREW_REPORTED/DERIVED/DEFAULTED`, `kss-checkin-provenance.ts`) vai só para o evento em `frms_fadiga_evento`, não para a linha lida pelo snapshot, pelo score quinzenal (`KSS_ALTO_NO_PERIODO`) e pelos alertas. O próprio auditor IMA v3 já sinaliza `KSS_PERSISTIDO_PODE_SER_DERIVADO_OU_DEFAULT_5`.
- **Impacto:** dado fabricado apresentado como autorrelato; um KSS inexistente nunca gera alerta.
- **Correção:** tornar `kss_score` (1–9) obrigatório no check-in de tripulante; remover o default 5 e a conversão 0–10→KSS; persistir `kss_provenance` na própria linha (Schema V2) e tratar `DERIVED/DEFAULTED` legados como ausentes nos cálculos.

### FRMS-FAD-004 — KSS 9 resulta em VERDE / "APTO" no check-in
- **P0 · alta · comprovado (caso executado)**
- Casos com parâmetros padrão (8 h de sono, qualidade 5, sem sintomas): **KSS 5 → 14 VERDE APTO; KSS 7 → 24 VERDE APTO; KSS 8 → 30 VERDE APTO; KSS 9 → 35 VERDE APTO.** O peso do KSS (0,35) nunca alcança o limiar amarelo (40) sozinho. A regra sobreposta `evaluateDailyRisk` (≈l. 277) usa horas de sono, fadiga subjetiva e `sleepinessLevel` — **não usa o KSS**; e o formulário envia em `sleepiness_level` o valor da **fadiga subjetiva** (`FrmsFlightCheckinFadiga.tsx` ≈l. 718–720), não a sonolência. A função legada `calculateFadigaScore` tinha "KSS ≥ 9 → crítico", mas não é a usada pela rota.
- **Mitigação existente:** o snapshot gera `KSS_ALTO` para KSS ≥ 7 e a fila da Coordenação classifica como "Decisão". Porém o tripulante recebe "Apto para a jornada", o registro fica `status_operacional = 'APTO'`, e KSS 9 tem o mesmo alerta que KSS 7.
- **Correção:** (a) KSS entra em `evaluateDailyRisk` como gatilho explícito, independente da soma ponderada (proposta a validar: KSS 7 → atenção; KSS 8–9 → revisão obrigatória); (b) parar de enviar fadiga subjetiva como `sleepiness_level` — são construtos diferentes; (c) substituir o rótulo de aptidão (ver AUD-022). Os limiares exatos dependem da revisão científica (#1476); **não encontrei validação publicada de "KSS ≥ 7" como ponto de corte de desempenho** — a escala tem âncoras verbais em 1/3/5/7/9 e 7 = "sonolento, sem dificuldade para permanecer acordado"; usar 7 como limiar é decisão de política, não fato científico.

### FRMS-FAD-005 — Status inconsistente: nível AMARELO com status "APTO"
- **P2 · alta · comprovado** — `frms-fadiga-checkin-legacy.ts` ≈l. 983–994: quando `dailyRisk = attention` e o score é VERDE, o nível vira AMARELO mas `finalStatusOperacional` permanece o do score base (`APTO`). Correção: derivar status do nível final.

### FRMS-FAD-006 — 0 h de sono não gera SONO_INSUFICIENTE no snapshot
- **P2 · alta · comprovado** — `operational-snapshot.ts` ≈l. 846: `(horasSono ?? 0) > 0 && < 6`. Noite sem sono (0 h) é tratada como ausente. No check-in, `evaluateDailyRisk` (<4 h → crítico) cobre o caso, mas o alerta específico some. Correção: `horasSono != null && horasSono < 6`.

### FRMS-FAD-007 — "PVT-B" não segue o protocolo validado
- **P1 · alta · comprovado (código + referência verificada)**
- `src/react-app/lib/frms/operationalReadiness.ts` `PVTB_V2_PROTOCOL` e `worker-airtrust/src/lib/frms/readiness.ts`: **60 s**, intervalo 1–4 s, **lapso ≥ 500 ms**, mínimo 10 estímulos. O PVT-B validado (Basner, Mollicone & Dinges, 2011, Acta Astronautica) usa **3 min**, intervalo 1–4 s e **lapso > 355 ms**; os autores aceitaram perda média de 22,7 % no tamanho de efeito em troca da redução de 10 para 3 min e pediram validação adicional em campo. Um teste de 60 s com limiar de 500 ms não é o PVT-B e não tem validação conhecida.
- **Correção:** ou adotar o PVT-B (3 min, 355 ms) no check-in pré-voo, ou renomear para "teste breve de atenção (não validado)" e não usá-lo para classificar.

### FRMS-FAD-008 — Prontidão ignora o PVT isolado e não usa a linha de base individual
- **P1 · alta · comprovado** — `readiness.ts` `deriveReadinessAssessment` (≈l. 228): lapsos ≥ 20 % são apenas **um** sinal de alerta; "attention" exige **dois**. Com KSS e sono normais, **50 % de lapsos → `preserved`**. Nas 5 primeiras sessões (`minimumBaselineSessions`), nenhum sinal de alerta conta (`baseline_building`). A "linha de base individual" é só um contador de sessões: média/variabilidade pessoal de tempo de reação nunca é comparada.
- **Correção:** (a) lapsos elevados (ou queda relevante vs. a própria linha de base) bastam para "atenção"; (b) calcular a linha de base pessoal (mediana do tempo de reação, % lapsos) e sinalizar desvio; (c) durante a construção da linha de base, aplicar limiar absoluto conservador em vez de silenciar; (d) trocar "preserved" por linguagem que não sugira aptidão.

### FRMS-FAD-009 — Índice de efetividade: rótulos científicos sem a ciência correspondente
- **P1 · alta · comprovado**
- `calculos.ts` `calcEffectiveness` (≈l. 378–540): `effectiveness = 100 + 100·Σ(penalidades)` com componentes rotulados `processo_s` e `processo_c`. Na teoria de Borbély, Processo S é a pressão homeostática de sono (tempo acordado vs. dormido). Aqui `processo_s` = penalidade do **dia do ciclo embarcado** (`fator_ciclo_embarcado_pct`) menos créditos de recuperação; não há cálculo de tempo acordado. Vigília contínua até o fim da jornada (o principal determinante de fadiga aguda) **não é calculada**, mesmo quando despertar e término são reais. Débito de sono acumulado entre dias não existe.
- `tempo_abaixo_limiar_pct` é preenchido com **constantes** (45 min se noturno na decolagem, 30 se noturno no pouso, 30 se repouso < −5 %) — não é medido, e o nome diz "pct" mas o valor é minutos.
- Um modelo de dois processos real existe só no módulo de pesquisa `ima-v3-shadow.ts` (corretamente isolado).
- **Correção:** renomear componentes (`ciclo_embarcado`, `circadiano`), remover ou calcular de fato `tempo_abaixo_limiar`, acrescentar "horas acordado no fim da jornada" quando houver despertar e término reais, e exibir o índice como "exposição por regras", não "efetividade" (AUD-024).

### FRMS-FAD-010 — Créditos de recuperação baseados em oportunidade, não em sono; crédito de horas de voo "bancável"
- **P2 · alta · comprovado**
- `operational-policy-v2.ts` `computeRecoveryCredit` (≈l. 259): crédito por dia de sobreaviso proporcional a `absoluteRestHours` (oportunidade de repouso), não ao sono relatado — apesar de o check-in já coletar `horas_sono_24h` separado de `oportunidade_sono_horas_24h`. O módulo `recovery-model.ts` declara que a recuperação é "evidence-only" e **não** deve gerar bônus sem calibração; o `operational-policy-v2` gera bônus numérico que entra no índice (contradição entre módulos).
- `computeFlightHoursDelta` (≈l. 284): voar menos que o limiar num dia gera crédito que **anula a penalidade de horas de voo do dia seguinte**. Não há base fisiológica para compensar exposição de um dia com baixa exposição do dia anterior (a recuperação já é tratada por sono/repouso).
- **Correção:** crédito de recuperação condicionado ao sono relatado e limitado a anular penalidades de sono (não de ciclo); remover o crédito de horas de voo entre dias, ou tratá-lo como hipótese experimental fora do índice.

### FRMS-FAD-011 — Score do check-in: estrutura e validade
- **P1 · média** — (a) soma ponderada de construtos diferentes (sonolência, quantidade e qualidade de sono, sintomas, medicação, álcool) sem validação; (b) álcool/medicação somam pontos fixos (+15/+8) em vez de gatilhos de revisão; (c) sintomas são uma média 0–3 de itens livres; (d) faixas VERDE/AMARELO/LARANJA/VERMELHO por limiares configuráveis sem justificativa documentada; (e) `apto = 0` força só o vermelho do score, mas a regra diária já marca `NAO_APTO` — duas fontes de verdade para o mesmo campo.
- **Correção:** separar (1) gatilhos explícitos de revisão (autodeclaração de inaptidão, KSS alto, sono < limiar, álcool, medicação sedativa), (2) indicadores descritivos sem score, e (3) só depois de validação (#1476), um score.

### FRMS-FAD-012 — Coleta: imutabilidade, horário e duplicidade de conceitos
- **P2 · média · comprovado**
- (a) **Reenvio sobrescreve** o check-in do dia (`UPDATE frms_fadiga_checkin`, ≈l. 1048); há evento `CHECKIN_ATUALIZADO` e auditoria, mas a linha passa a mostrar só o último valor. Para autorrelato de segurança, a primeira resposta pré-voo deve ser imutável e as correções versionadas com horário.
- (b) `reference_date`/`data_checkin` aceitam **qualquer data** (passada ou futura) sem limite (`frms-fadiga-checkin.schema.ts`); permitir só a data operacional atual (e, para correção, D−1 com justificativa).
- (c) O horário do check-in em relação à apresentação (`submitted_at` × `hora_apresentacao`) não classifica se o relato foi pré-voo; relato após a apresentação não deveria contar como avaliação pré-missão.
- (d) **Fadiga ≠ sonolência:** o formulário envia o mesmo valor em `subjective_fatigue_level` e `sleepiness_level`, e a regra diária testa os dois (duplicando o mesmo sinal com rótulos diferentes). A missão pede não confundir os construtos. Correção: coletar Samn-Perelli (fadiga, 1–7) ou manter só a fadiga subjetiva 0–10, e usar o KSS como sonolência.
- (e) Rótulos do KSS em português (`KSS_OPCOES`) correspondem à escala estendida; verificar se há versão brasileira validada antes de afirmar validade da tradução.

### FRMS-FAD-013 — Score quinzenal (complemento à #1476)
- A fórmula e os pesos estão documentados na #1476 (`0,65·%HV168h + agravantes + atenuadores + tendência`, ATENÇÃO 45 / CRÍTICO 75). Acrescento: (a) o agravante "algum KSS ≥ 7" usa o `kss_score` que pode ser o default 5 (FAD-003) — KSS ausente nunca agrava; (b) "algum sono < 6 h" usa o check-in, mas a efetividade do mesmo dia usa 8 h (FAD-001) — dois números contraditórios para o mesmo dia na mesma tela; (c) "alguma efetividade < 70 %" herda o otimismo de FAD-001; (d) qualidade de dado entra como pontos de fadiga (AUD-023).

### FRMS-FAD-014 — Normas de jornada que afetam a exposição (registro)
- Verificado no texto do RBAC 117 Emd 01 (quadro comparativo oficial da ANAC, CP 08/2024):
  - **A117.15(m):** o limite de 2 madrugadas consecutivas / 4 em 168 h também está no RBAC 117. Só pode ser alterado por manual aprovado pela ANAC; isso reforça AUD-001.
  - **A117.15(e) redutor noturno:** cada hora de trabalho noturno conta como 52 min 30 s para fins de jornada. Considera-se noturno o trabalho em terra entre 22:00 e 05:00 local e o voo entre 18:00 e 06:00 no fuso da base. **Não implementado** (nenhuma ocorrência de redutor no código), então jornadas noturnas são subcontadas nos limites.
  - **A117.15(c):** acréscimo de jornada por interrupção fora da base. Há tratamento parcial em `calculos.ts` (`validarRepousoPlataforma`); a conferência completa não foi feita.

## 19. Matriz de testes executados nesta parte

| Caso | Função | Resultado | Status |
|---|---|---|---|
| KSS 5/7/8/9, 8 h, qualidade 5 | `calcularScoreFadiga` | 14/24/30/35 — todos VERDE APTO | FAIL (FAD-004) |
| KSS 9, 4 h, qualidade 2 | idem | 69 LARANJA INAPTO | PASS |
| KSS 3, 3 h, qualidade 5 | idem | 30 VERDE (score); regra diária → crítico | PASS na rota, FAIL no score isolado |
| Só despertar 04:00 | `calcularSono` | 480 min, INFORMADO | FAIL (FAD-001) |
| Dormiu 04:30, acordou 04:00 | `calcularSono` | 960 min, INFORMADO | FAIL (FAD-002) |
| Dormiu = acordou | `calcularSono` | 480 min, INFORMADO | FAIL (FAD-002) |
| Pipeline: check-in 4 h sem horário de dormir | `recalcularPipeline` | efetividade com 8 h e `sono_efetivo_min` sobrescrito | FAIL por leitura de código (FAD-001) — teste automatizado a criar |
| PVT 50 % lapsos, KSS 5, 8 h, linha de base pronta | `deriveReadinessAssessment` | `preserved` | FAIL por leitura de código (FAD-008) |

## 20. Correções na Parte II à luz da verificação de referências

- Seção 10.1: onde se lê que "KSS ≥ 7 associa-se a queda de desempenho", corrigir para: KSS é validado contra desempenho e EEG (Gillberg, Kecklund & Åkerstedt; Kaida et al., 2006), mas **não foi encontrado ponto de corte validado em 7**; o limiar é escolha de política.
- Seção 10.2: PVT-B confirmado como 3 min / lapso > 355 ms (Basner, Mollicone & Dinges, 2011).
- As demais referências (Borbély 1982; Belenky 2003; Van Dongen 2003; ICAO Doc 9966) não foram conferidas na fonte nesta execução e devem ser tratadas como citações a confirmar.

## 21. O que ainda não foi feito (honestidade de escopo)

- **Bloqueado por acesso:**
  - interação real nas telas (staging sem dados FRMS e sem credencial);
  - dados de produção: distribuição real de KSS (quantos são 5 por default), proporção de check-ins sem horário de dormir, impacto de FAD-001 nos índices, lapsos de PVT. As consultas estão no plano.
- **Não lidos:**
  - manuais da Costa do Sol, IS 117, Doc 9966, guia ICAO para helicópteros, FAA AC 120-103A, CASA;
  - módulos `fira-parser`, `redemet-weather`, `environmental-risk`, `frms-dispatch-gate` (Controle de Voos), `parameter-governance` (governança dos parâmetros);
  - o PR do BOA (#1650).
- **Não feitos:** benchmarking de produtos comerciais, desempenho e volume, wireframes.

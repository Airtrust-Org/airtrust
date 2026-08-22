# FRMS_HELICOPTER_OFFSHORE_BASELINE_V1 — Quality Review

Independent review before opening the MR. No formula, parameter value, or
model was changed by this review. `FRMS_PARAMETER_BASELINE_AUDIT.md` received
minimal, additive documentation corrections (unit clarification, dead-code
flags, citation-completeness flags) — no numeric value was touched.

## STATUS: **NEEDS_CORRECTION** (documentation only — no code/value blocker)

The baseline is mathematically sound and safe to merge as a *governance*
change (equivalence is proven — see below). It is **not yet** a fully
defensible audit artifact in its original form: several parameters carried
generic or missing source citations, and six of the 120 parameters turned out
to be dead code. All of that has been corrected in-place in the audit
document as part of this review; nothing here blocks the MR from a
correctness standpoint, but the corrected document should be what ships,
not the pre-review version.

---

## Resposta às 4 perguntas

**1. Os parâmetros atuais representam realmente helicóptero offshore?**
Majoritariamente sim. Os parâmetros específicos de operação offshore
(`CICLO_EMBARCADO_*`, `REPOUSO_PLATAFORMA_*`, `FRMS_EMBARQUE_PROGRESSO_MAX`)
existem e são consumidos por cálculo real (`calculos.ts`). Nenhum parâmetro
pressupõe asa fixa ou aviação comercial genérica. Porém: os valores offshore
específicos (3h/6h de repouso em plataforma, ciclo de 15 dias) **não têm
documento-fonte citado no código** — são plausíveis (15 dias é consistente
com rotação 14/14 ou 15/15 comum no setor), mas não comprovadamente
rastreáveis a um documento (IOGP 690-2, contrato Petrobras, ou outro). Isso é
uma lacuna de rastreabilidade, não uma suspeita de valor errado.

**2. Está separado o que é norma, benchmark e política interna?**
Estava quase completo; um caso estava misturado e foi corrigido nesta
revisão: `HV_365_DIAS_HORAS` (930h) apresentava-se como puramente
`REGULATORY`, mas 930h é uma margem interna mais restritiva sobre o teto
legal de 960h (Lei 13.475) — reclassificado como REGULATORY + OPERATIONAL_POLICY
(misto) no documento corrigido. Os demais 119 parâmetros já estavam
corretamente separados nas quatro categorias.

**3. Existe algum parâmetro que não deveria estar nessa primeira revisão?**
Não no sentido de "não deveria existir" — mas **6 dos 120 parâmetros são
código morto**, nunca lidos por nenhum cálculo, alerta ou decisão:
`VISUAL_AVISO_PCT`, `VISUAL_ATENCAO_PCT`, `VISUAL_CRITICO_PCT` (não
referenciados em lugar nenhum além da definição), e `REPOUSO_MIN_PRE_APRESENTACAO`,
`REPOUSO_MIN_POS_LIBERACAO`, `REPOUSO_QUALIDADE_HOTEL` (editáveis no painel
admin `FrmsConfiguracoes.tsx`, mas nunca lidos por nenhum cálculo backend).
Por instrução explícita ("não remover nada sem evidência"), **nenhum foi
removido** — apenas marcados no documento. Removê-los é candidato a uma
revisão V2 futura, não a esta.

**4. O documento produzido serve como evidência para auditoria?**
Depois desta revisão, sim, com uma ressalva: ele documenta corretamente
*o que o sistema faz hoje e por quê* (rastreável a arquivo/linha de código
para 100% dos 120 parâmetros), mas para alguns REGULATORY/OFFSHORE_BENCHMARK
não consegue apontar o documento normativo original (artigo, item, contrato) —
apenas a categoria. Isso é suficiente para provar *consistência interna e
imutabilidade* (a pergunta de auditoria mais provável — "o que estava
vigente" — é 100% respondível, ver seção de risco abaixo), mas não substitui
uma revisão jurídico-regulatória formal desses valores específicos, que seria
um trabalho separado, com especialista, fora do escopo desta migração de
governança.

---

## Achados (lista objetiva)

1. **Cabeçalho de identificação ausente** — o documento não declarava
   explicitamente perfil/revisão/modelo no topo. Corrigido.
2. **6 parâmetros são código morto** (não consumidos por nenhum cálculo) —
   listado acima. Marcado no documento, não removido.
3. **`FRMS_EMBARQUE_PROGRESSO_MAX` tinha unidade ambígua** no documento
   original (parecia "dias"; é na verdade um percentual, `/100` em
   `calculos.ts:419`). Corrigido.
4. **Citações regulatórias incompletas**: `FDP_MAXIMO_HORAS` e
   `REPOUSO_MINIMO_HORAS` citam "RBAC 117" sem item/tabela específica; a RBAC
   117 real define FDP por tabela variável (nº de pousos, horário de
   apresentação, repouso anterior), não um teto único — 11h parece ser um
   teto conservador de engenharia, não a tabela regulatória completa
   transcrita. Marcado; não corrigido em valor (fora de escopo desta
   migração).
5. **`HV_365_DIAS_HORAS` classificado como REGULATORY puro** quando na
   verdade mistura norma (960h/ano, Lei 13.475) com margem interna mais
   restritiva (930h). Reclassificado para REGULATORY + OPERATIONAL_POLICY.
6. **`REPOUSO_PLATAFORMA_*` e `CICLO_EMBARCADO_*` sem documento-fonte
   citado** apesar de rotuladas OFFSHORE_BENCHMARK — a categoria está
   correta, mas falta o nome do documento (IOGP 690-2? Petrobras?). Marcado.

Nenhum achado indica valor numérico incorreto ou comportamento operacional
divergente do atual — todos são lacunas de **documentação/rastreabilidade**,
não de cálculo.

---

## Revisão de equivalência

```
LEGACY_MODEL_V2 equivalence: PASS
```

Reconfirmado nesta revisão (não apenas herdado da tarefa anterior): reexecutei
`frms-helicopter-offshore-baseline-v1-equivalence.test.ts`, que lê os 120
parâmetros de uma execução real do seed SQL (não uma cópia manual) e compara
`calcFatorizacao`, `calcEffectiveness`, `calcularScoreFadiga`,
`calcularPenalidadeWOCL`, `buildFrmsFortnightIndicatorMap` e
`processarAlertas` rodando com `LIMITES_DEFAULT` vs. os valores governados —
11/11 casos idênticos byte-a-byte (score, classificação, alertas, motivos).

## Risco de auditoria

**P1 — "Se a Petrobras perguntar qual regra estava vigente para um
tripulante?"**
Sim, respondível. `frms_fatorizacao_jornada` e `frms_fadiga_checkin` gravam
`config_revision_id` e `model_version` em cada linha (migration 0464); a
revisão `frms-helicopter-offshore-baseline-v1` é imutável (sem UPDATE path —
apenas novas revisões via `createRevisionAndRecalcRun`), então a config
vigente em qualquer data passada é reconstituível exatamente.

**P2 — "Se mudar uma regra amanhã, conseguimos criar uma nova revisão?"**
Sim. A infraestrutura de `frms_config_revisions`/`frms_recalc_runs`/
`runGovernedRecalc` (MR70) já suporta publicar uma nova revisão com
`effective_from` futuro, sem tocar na V1 existente.

**P3 — "Conseguimos provar que a alteração não mudou histórico?"**
Sim, pelo desenho: revisões são imutáveis (nunca UPDATE, apenas nova linha +
`supersedes_revision_id`), e `recalc_state` (`CURRENT`/`STALE`/
`RECALC_PENDING`) em `frms_fatorizacao_jornada` marca explicitamente quais
linhas históricas ainda refletem qual revisão — nada é reescrito
silenciosamente.

---

## Recomendações

**Obrigatórias antes do uso operacional (não bloqueiam esta MR de governança, mas bloqueiam produção real):**
- Revisão jurídico-regulatória formal de `FDP_MAXIMO_HORAS` /
  `REPOUSO_MINIMO_HORAS` contra o texto integral da RBAC 117 (tabela
  completa, não teto único) antes de usar esta baseline para decisão
  operacional real de tripulante.
- Identificar e citar o documento-fonte real para `REPOUSO_PLATAFORMA_*` e
  `CICLO_EMBARCADO_*` (IOGP 690-2 / contrato específico) antes de apresentar
  este documento como evidência formal de auditoria a um cliente/regulador.

**Melhorias futuras (V2, não bloqueiam nada agora):**
- Remover ou justificar formalmente os 6 parâmetros mortos
  (`VISUAL_*_PCT`, `REPOUSO_MIN_PRE_APRESENTACAO`,
  `REPOUSO_MIN_POS_LIBERACAO`, `REPOUSO_QUALIDADE_HOTEL`).
- Adicionar `source_document` como campo estruturado em
  `frms_config_parameters` (hoje a citação vive apenas em comentário/docs),
  para que a rastreabilidade normativa não dependa de um markdown separado.

---

## Testes (Fase 8)

- `npm run lint` — PASS
- `cd worker-airtrust && npx vitest run` — 541/541 arquivos, 4065/4065 testes
  passando (inclui os 2 novos arquivos de teste da baseline V1, 16 testes)
- `npx tsc --noEmit` — 0 erros
- `node scripts/guard-typescript-delta.mjs` — PASS, nenhum padrão de type-safety proibido

Nenhuma regressão. Nenhuma alteração de cálculo, fórmula, peso, limite ou
comportamento de alerta.

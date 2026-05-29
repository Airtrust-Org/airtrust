# FRMS Daily Check-in UX Review (Mobile-First)

## 1) Objetivo
Simplificar o check-in diario de fadiga para tripulantes (mobile-first), removendo redundancia e mantendo apenas campos com uso operacional claro no fluxo FRMS (backend, score, snapshot e auditoria).

## 2) Campos mantidos na UI

| Campo UI | Payload | Uso backend |
| --- | --- | --- |
| Horas de sono nas ultimas 24h | `horas_sono_24h` | Compoe score (`horas_sono`) e sincronizacao FRMS (`duracao_sono_efetiva_min`) |
| Hora em que acordou | `wake_time` + `hora_acordou` | Persistencia (`wake_time`), status diario e sincronizacao FRMS |
| Qualidade do sono (1-5) | `qualidade_sono` | Componente de score |
| Sonolencia agora (KSS 1-9) | `kss_score` | Componente de score, snapshot (`KSS_ALTO`), analytics |
| Aptidao operacional (Sim/Nao/Preciso falar) | `fit_for_duty` | Persistencia (`fit_for_duty`/`apto`) e risco diario (`computed_risk_level`) |
| Observacao | `motivo_inaptidao` (quando nao apto) ou `free_text_notes` (quando apto) | Persistencia em `observacoes` e auditoria operacional |
| Medicacao (Nao/Sim/Prefiro nao informar) | `meds_ult_12h` | Componente de score (penalidade quando `true`) |
| Alcool (Nao/Sim/Prefiro nao informar) | `alcool_ult_12h` | Componente de score (penalidade quando `true`) |
| Declaracoes | `aceite_termos`, `aceite_privacidade` | Marcadores de aceite no payload |

## 3) Campos removidos ou condicionais na UI

| Campo | Acao | Justificativa |
| --- | --- | --- |
| Sono nas ultimas 48h | Removido da UI | Campo nao participa do score e aumentava friccao do formulario |
| Nivel subjetivo de fadiga 1-5 | Removido da UI | Redundante com KSS; agora derivado de `kss_score` para manter compatibilidade de payload (`subjective_fatigue_level` e `sleepiness_level`) |
| Checkboxes de sintomas (sonolencia/cansaco/concentracao) | Removidos da UI | Redundantes com KSS e sem necessidade para envio minimo diario |
| Observacao | Condicional obrigatoria em "Nao"/"Preciso falar" | Alinha UX com regra do schema (`motivo_inaptidao` obrigatorio quando inapto) |

## 4) Justificativa cientifica/operacional
- KSS permanece como medida principal de sonolencia aguda no momento do check-in.
- Horas de sono e qualidade de sono continuam cobrindo dimensao de repouso recente.
- Aptidao operacional explicita decisao de seguranca declarada pelo tripulante.
- Medicacao/alcool mantidos por impacto direto no calculo existente.
- Remocoes focam em redundancia de coleta e adesao mobile, sem alterar modelo de risco do backend.

## 5) O que e KSS e como ficou apresentada
A KSS foi mantida como escala 1-9, mas com linguagem operacional simples:
- Titulo principal: "Quao sonolento ou alerta voce esta agora?"
- Subtitulo instrucional curto para resposta imediata.
- Cada opcao 1-9 exibe descritor legivel (ex.: "Extremamente alerta", "Muito sonolento").
- "KSS" aparece como informacao secundaria, nao como pergunta tecnica principal.

## 6) Pendencias
- Nao houve alteracao de rota/contrato para diferenciar persistencia de `null` vs `0` em `meds_ult_12h`/`alcool_ult_12h` no banco legado (NOT NULL default). O frontend continua enviando `null` no payload; backend normaliza para compatibilidade legada.
- Se no futuro for necessario auditar "nao informado" no armazenamento bruto, sera necessaria mudanca de schema/migration dedicada (fora deste escopo).

## 7) Confirmacoes de escopo tecnico
- Sem mudanca de score cientifico (`calcularScoreFadiga`).
- Sem criacao/ajuste de threshold.
- Sem mudanca de schema de banco.
- Sem migration.
- Sem alteracao de regras de SGSO/escala.

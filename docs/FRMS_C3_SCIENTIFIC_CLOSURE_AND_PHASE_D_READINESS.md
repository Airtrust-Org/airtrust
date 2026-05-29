# FRMS C3-FINAL — Fechamento Cientifico e Prontidao para Fase D

Data: 2026-05-28

## 1) Status

| Fase | Status | Evidencia |
| --- | --- | --- |
| C3 | Concluida | Coleta minima, KSS real, sono, wake time e nomenclatura revisados. |
| C3-C | Concluida | Limitacoes cientificas e nomenclatura documentadas. |
| C3-D | Concluida | Indicador descritivo/read-only de quinzena offshore publicado. |
| C3-E | Concluida | Lacuna de setores, trechos e sit periods documentada sem helper. |
| C3-FINAL | Atual | Revisao de linguagem IA/resumo, labels residuais e prontidao para D. |
| D0 | Concluida | Semantica decisoria legada neutralizada antes de D1. |
| D1 | Concluida e publicada | Read/ack operacional sem mitigacao, usando eventos derivados do snapshot. |
| D2 | Concluida e publicada | Governanca de lifecycle de eventos D1 (filtros/status/summary), sem mitigacao. |
| D3 | Atual (governanca) | Politica de retencao/arquivamento e schema dedicado proposto para read/ack. |

## 2) O que foi corrigido ou consolidado

- KSS real coletado como dado subjetivo do tripulante.
- Qualidade do sono coletada de forma explicita.
- Medicacao e alcool mantidos como campos opcionais, sem inferencia quando ausentes.
- Sintomas simples coletados sem transformar o check-in em diagnostico clinico.
- `wake_time` real priorizado quando informado.
- Fallback unificado para evitar leituras divergentes.
- `HV_28_DIAS_HORAS` tratado como acumulado operacional de horas de voo.
- Nomenclatura revisada para separar proxy operacional, compliance regulatorio e indicadores subjetivos.
- Indicador de quinzena offshore implementado como descritivo/read-only.
- Lacuna de setores, trechos e sit periods documentada na C3-E.
- Linguagem do resumo FRMS revisada para reduzir termos como diagnostico, modelo validado, recomendacao forte e decisao automatica.
- Semantica decisoria legada neutralizada na D0.
- Fluxo D1 de eventos read/ack implementado sem mitigation, sem score novo e sem threshold novo.
- Lifecycle D2 definido com filtros de status, tipo e severidade, incluindo status derivado `STALE` sem escrita adicional.
- D3 iniciou governanca de retencao/historico e desenho de schema dedicado, sem migration aplicada.

## 3) O que o sistema pode afirmar hoje

- O sistema coleta dados subjetivos e operacionais relevantes para triagem FRMS.
- O sistema apresenta indicadores de triagem, nao conclusoes fisiologicas.
- O sistema separa fonte real, estimada, ausente ou incompleta em partes centrais do fluxo mais recente.
- O sistema apresenta proxy operacional de efetividade, inspirado em referencias biomatematicas, sem equivalencia a SAFTE-FAST validado.
- O sistema apresenta compliance de horas de voo e jornada como indicador regulatorio.
- O sistema apresenta indicador descritivo de quinzena offshore, sem score de risco proprio.
- O sistema documenta que setores, trechos e sit periods ainda nao possuem fonte segmentada robusta ponta-a-ponta.
- O sistema pode registrar ciencia operacional de eventos derivados do snapshot, sem registrar mitigacao.

## 4) O que o sistema nao pode afirmar hoje

- Nao e SAFTE-FAST validado ou licenciado.
- Nao e diagnostico de fadiga fisiologica.
- Nao mede sono objetivo por actigrafia, biometria ou polissonografia.
- Nao calcula carga segmentada robusta por setores, trechos ou sit periods.
- Nao deve tomar decisao automatica de escala com base apenas no proxy FRMS.
- Nao deve persistir mitigacao automatica derivada de quinzena, setores ou sit periods.
- Nao deve tratar ausencia de dado como resposta negativa sem flag de fonte.

## 5) Pendencias antes da Fase D

### Bloqueia Fase D completa

- Criterios de alerta persistente ainda precisam de revisao metodologica antes de virar gatilho formal.
- Source flags por campo ainda sao necessarios quando uma regra depender da diferenca entre "nao informado", "nao aplicavel" e "resposta negativa".
- Regra clara de ciencia, leitura, reconhecimento e trilha de auditoria foi estruturada em D1/D2; pendente consolidar migracao para schema dedicado e politica de retencao operacional aprovada.
- A rota SGSO legada que ajustava probabilidade automaticamente quando o indice FRMS estimado ficava abaixo de 70% foi neutralizada na D0; o indice permanece apenas como contexto informativo.
- A rota legada `/api/frms/score-atual/:funcionarioid` ainda expoe `apto_para_voo` por compatibilidade, mas a D0 adicionou warning explicito e `status_triagem_operacional` para leitura informativa.

### Nao bloqueia D1 read/ack, desde que nao vire gatilho

- Setores, trechos e sit periods robustos.
- Repouso contextual em hotel, alojamento ou residencia.
- Cochilo, descanso intrajornada e qualidade objetiva do sono.
- Calibracao longitudinal por individuo.
- Integracao robusta de plataformas, destinos e aeronaves por segmento.

## 6) Decisao recomendada

Fase D completa ainda esta bloqueada para qualquer criterio automatico novo, mitigacao persistente ou uso de quinzena/setores como gatilho.

Fase D1 fica limitada a read/ack de eventos derivados do snapshot existente, com estas restricoes:

- Sem nova formula de risco.
- Sem novo threshold cientifico.
- Sem transformacao de quinzena em gatilho.
- Sem transformacao de setores ou sit periods em gatilho.
- Sem mitigacao automatica.
- Sem decisao de retirada, substituicao ou aptidao automatica.
- Com linguagem de indicador operacional e triagem.
- Sem reutilizar campos legados SGSO/FRMS como decisao automatica.

## 7) Quando usar Opus

Opus deve entrar antes de:

- definir formula de risco;
- definir thresholds persistentes;
- transformar quinzena em gatilho;
- transformar setores, trechos ou sit periods em gatilho;
- criar criterios automaticos de mitigacao;
- classificar tripulante como apto/inapto com base em indicador FRMS;
- consolidar regras de alerta persistente que dependam de fonte real, estimada, ausente ou inconsistente.

## 8) Conclusao operacional

A C3 fecha uma base cientificamente mais honesta para o FRMS: coleta melhor, nomenclatura menos exagerada, indicadores offshore descritivos e lacunas documentadas. D1/D2 consolidaram o read/ack operacional sem mitigacao. O proximo passo seguro apos D3 e uma fase D3-B para schema dedicado e rollout controlado, ainda sem automacao decisoria.

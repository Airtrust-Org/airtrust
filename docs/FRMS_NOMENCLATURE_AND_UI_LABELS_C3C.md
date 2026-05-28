# FRMS C3-C — Nomenclatura Oficial e Labels de UI

## Objetivo

Padronizar nomenclatura do modulo FRMS/Fadiga para reduzir ambiguidade cientifica e operacional, mantendo aderencia ao posicionamento da C3.

## Tabela de termos

| Termo antigo | Termo recomendado | Status | Onde aparece | Justificativa |
| --- | --- | --- | --- | --- |
| Check-in de fadiga | Avaliacao diaria de aptidao e fadiga | Recomendado | Tela de check-in, docs FRMS, comunicacao operacional | Deixa claro que ha componente de aptidao operacional e nao apenas fadiga |
| KSS | Sonolencia (KSS 1-9) | Adotado | Check-in, historico, snapshot | Preserva referencia cientifica e evita escala ambigua |
| Fadiga subjetiva | Fadiga subjetiva operacional | Adotado | Check-in e score diario | Reforca natureza subjetiva e operacional |
| Score de fadiga | Indice de risco operacional diario | Recomendado | Check-in, relatorios e comunicacao de risco | Evita inferencia de medida fisiologica pura |
| Efetividade cognitiva | Indice estimado de efetividade | Adotado | Heatmap, painel de efetividade, configuracoes | Explicita que e estimativa/proxy |
| SAFTE-FAST | Proxy local inspirado em modelos biomatematicos | Adotado (quando aplicavel) | Conceitos FRMS, tooltips, docs | Evita alegacao de implementacao validada/licenciada |
| Mapa de Fadiga | Mapa FRMS de compliance e fadiga | Recomendado | Relatorios/heatmap | Separa dimensao regulatoria de dimensao de risco |
| Compliance | Compliance regulatorio HV/jornada | Adotado | Heatmap, cards, relatorios | Define objeto de medicao de forma precisa |
| Alertas | Alertas FRMS | Adotado | Snapshot e controle operacional | Delimita contexto operacional do alerta |
| Snapshot | Snapshot operacional FRMS/Escala | Adotado | Tela da coordenacao e endpoint snapshot | Enquadra consolidacao operacional diaria |

## Termos proibidos ou que exigem qualificador

- "SAFTE-FAST validado" (proibido sem validacao/licenciamento formal).
- "Fadiga fisiologica" para metricas de compliance HV/jornada.
- "Medicao exata" para indice estimado/proxy.
- "Diagnostico" quando a saida for indice operacional de triagem.
- "Retirar da escala" como recomendacao automatica do sistema.
- "Apto/Inapto" sem contexto fit-for-duty e decisao humana.

## Regras de redacao para UI e relatorios

- Sempre explicitar quando o dado for estimado.
- Sempre diferenciar compliance regulatorio de risco/fadiga.
- Em textos tecnicos, usar "indice estimado/proxy local" para efetividade.
- Em recomendacoes operacionais, manter linguagem de apoio a decisao humana.

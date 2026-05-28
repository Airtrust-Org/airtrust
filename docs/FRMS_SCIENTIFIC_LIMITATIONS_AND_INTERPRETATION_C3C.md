# AirTrust FRMS — Limitacoes Cientificas, Interpretacao Operacional e Uso Seguro

## 1. Status do documento

- Versao: C3-C
- Base de codigo: `e73be50`
- Escopo: interpretacao cientifica e operacional do modulo FRMS/Fadiga
- Este documento nao e manual regulatorio aprovado pela ANAC
- Este documento nao substitui julgamento operacional, medico ou regulatorio

## 2. Objetivo

- Definir como interpretar os dados de fadiga no AirTrust.
- Separar dado REAL, ESTIMADO, AUSENTE e INCONSISTENTE.
- Evitar confusao entre compliance regulatorio e fadiga fisiologica.
- Evitar confusao entre proxy local e modelo biomatematico validado/licenciado.

## 3. Referencias cientificas e regulatorias

| Referencia | Link | Como e usada no AirTrust | Limitacao |
| --- | --- | --- | --- |
| ICAO Fatigue Management | https://www.icao.int/safety/fatiguemanagement/Pages/default.aspx | Base conceitual para separar abordagem prescritiva e FRMS baseado em desempenho | Nao define, por si so, os parametros numericos locais do AirTrust |
| ICAO Doc 9966 | https://www.icao.int/publications/doc-9966-includes-complete-set-fatigue-management-implementation-manuals | Referencia para governanca FRMS, monitoramento e melhoria continua | Nao implica que o AirTrust seja, por si, uma implementacao FRMS completa certificada |
| IATA/ICAO/IFALPA Fatigue Management Guide | https://www.icao.int/safety/fatiguemanagement/FRMS%20Tools/FMG%20for%20Airline%20Operators%202nd%20Ed%20%28Final%29%20EN.pdf | Boas praticas de coleta, risco e mitigacao | Guia geral; exige calibracao com dados locais de operacao |
| ANAC IS 117-004B | https://www.anac.gov.br/assuntos/legislacao/legislacao-1/iac-e-is/is/is-117-004 | Referencia nacional para SGRF e uso de dados em operacao especifica | Nao substitui aprovacao/aceitacao regulatoria formal do operador |
| KSS (Karolinska Sleepiness Scale) | https://pubmed.ncbi.nlm.nih.gov/2265922/ | Escala subjetiva de sonolencia 1-9 no check-in diario | Escala subjetiva, suscetivel a vies de autorrelato |
| ICAO/IATA biomathematical fatigue models | https://www.icao.int/safety/fatiguemanagement/ArticlesPublications/biomathematical_fatigue_models.pdf | Referencia para limites e cautelas no uso de modelos biomatematicos | Nao valida automaticamente qualquer proxy local |
| IOGP Report 536 (FIFO fatigue) | https://www.iogp.org/bookstore/product/iogp-report-536-fatigue-in-fly-in-fly-out-operations/ | Referencia para fatores de fadiga em operacoes remotas | Nao mapeia integralmente o contexto operacional especifico da empresa |
| IOGP Aviation/Offshore guidance | https://www.iogp.org/workstreams/safety/safety/aviation/ | Referencia adicional para ambiente offshore e seguranca operacional | Nao fornece calibracao direta dos pesos do AirTrust |

## 4. Conceitos oficiais do AirTrust

- Avaliacao diaria de aptidao e fadiga: check-in operacional do dia.
- Sonolencia (KSS 1-9): autorrelato de sonolencia atual.
- Fadiga subjetiva operacional (1-5): percepcao subjetiva para triagem.
- Qualidade do sono (1-5): percepcao subjetiva do repouso recente.
- Indice de risco operacional diario: score composto para triagem.
- Indice estimado de efetividade: proxy local percentual.
- Compliance HV/jornada: proximidade/excedencia de limites operacionais.
- Snapshot operacional: consolidacao diaria para coordenação.
- Alertas FRMS: sinalizacao de atencao/criticidade operacional.
- Fonte de dados REAL/ESTIMADO/AUSENTE/INCONSISTENTE: rastreabilidade da confianca.
- Fit-for-duty/aptidao: declaracao operacional do tripulante.

## 5. O que o AirTrust mede diretamente

- Hora real de acordar, quando informada.
- Sono 24h informado.
- KSS real 1-9 informado.
- Qualidade do sono 1-5 informada.
- Fadiga subjetiva operacional 1-5 informada.
- Medicacao sonolenta/alcool/sintomas, quando informados.
- Aptidao declarada (fit-for-duty).
- Jornada de voo e dados SIGVOOS, quando importados.
- Horas de voo e janelas HV/jornada, quando disponiveis.

## 6. O que o AirTrust estima

- `wake_time` quando ausente (fallback por apresentacao e configuracao).
- Sono padrao/fallback quando dado real ausente.
- Indice estimado de efetividade (proxy local).
- Status operacional derivado por regras do modulo.
- Alertas derivados por thresholds configurados.
- Exposicao acumulada quando ha lacunas/incompletude de dados.

## 7. O que o AirTrust NAO faz hoje

- Nao implementa SAFTE-FAST validado/licenciado.
- Nao mede sono objetivamente (ex.: actigrafia).
- Nao mede fase circadiana individual de forma direta.
- Nao mede cochilo estruturado de forma completa.
- Nao mede qualidade de repouso em hotel/base/alojamento de forma robusta.
- Nao calcula ainda um risco acumulado especifico de quinzena offshore.
- Nao incorpora setores/trechos/sit periods de forma robusta no indice acumulado.
- Nao substitui avaliacao medica ou decisao regulatoria.
- Nao executa retirada automatica de tripulante da escala.

## 8. Interpretacao do score diario

- O score diario e um indice operacional composto.
- Combina KSS, sono, qualidade, sintomas, medicacao/alcool (quando informados) e aptidao.
- Nao representa fadiga fisiologica pura.
- Deve ser usado como triagem e apoio de coordenacao.
- Pesos/thresholds atuais ainda exigem calibracao cientifica futura.

## 9. Interpretacao da efetividade

- O indice estimado de efetividade e proxy local.
- E inspirado em referencias biomatematicas, sem equivalencia a SAFTE-FAST validado.
- O percentual nao deve ser lido como medicao fisiologica exata.
- A leitura operacional deve considerar a fonte dos dados (REAL/ESTIMADO/AUSENTE/INCONSISTENTE).

## 10. Interpretacao do compliance HV/jornada

- Compliance HV/jornada mede uso/proximidade de limites operacionais e regulatorios.
- Compliance nao equivale a fadiga fisiologica.
- Aproximacao/excesso de limite e indicador de exposicao operacional, nao diagnostico clinico.

## 11. Interpretacao em operacao offshore/quatorzena

- O AirTrust ainda precisa evoluir para indicador explicito de quinzena.
- Fatores criticos pendentes:
  - dias consecutivos;
  - posicao na quinzena;
  - duty time acumulado na quinzena;
  - setores/trechos;
  - sit periods/esperas;
  - sequencia de apresentacoes cedo;
  - repouso em hotel/base/alojamento;
  - qualidade do repouso.
- Ate essa evolucao, o uso deve permanecer como triagem operacional com decisao humana.

## 12. Regras de uso seguro pela coordenacao

- Investigar alertas criticos antes de decisao operacional.
- Confirmar dados estimados/ausentes com fonte operacional.
- Nao tomar decisao automatica apenas com score.
- Registrar contexto da jornada e exposicao no dia.
- Usar dados como apoio ao SGSO/SGRF.
- Preservar cultura justa e rastreabilidade.

## 13. Riscos de interpretacao errada

| Risco | Exemplo | Consequencia | Prevencao |
| --- | --- | --- | --- |
| Tratar compliance como fadiga fisiologica | Celula critica de HV interpretada como diagnostico de fadiga | Decisao operacional distorcida | Separar semanticamente compliance e fadiga |
| Tratar efetividade estimada como medida validada | Leitura de 68% como medida clinica exata | Excesso de confianca no proxy | Exibir sempre como indice estimado/proxy |
| Tratar ausencia de medicacao/alcool como "nao" | Campo nao informado lido como negativo | Subestimacao de risco | Diferenciar "nao informado" de "nao" |
| Ignorar dado estimado | Fallback tratado como dado real | Analise com base fragil | Badge de fonte e revisao manual |
| Usar IA/resumo como decisao | Texto automatico como comando operacional | Decisao sem lastro suficiente | IA como apoio, nao decisor |
| Comparar tripulantes sem fonte dos dados | Ranking misturando REAL e ESTIMADO | Injustica e ruido operacional | Exigir leitura por fonte de confianca |

## 14. Pendencias cientificas antes de alertas persistentes

- Source flags por campo no armazenamento historico (exige migration futura).
- IA/resumo mais estruturado com limites operacionais explicitos.
- Intensidade/estruturacao de sintomas.
- Indicador acumulado de quinzena.
- Duty time acumulado na quinzena.
- Integracao robusta de setores/trechos/sit periods.
- Qualidade de repouso em hotel/base/alojamento.
- Calibracao de pesos/thresholds com dados reais.
- Validacao longitudinal com dados operacionais.

## 15. Roadmap recomendado

- C3-D: indicador acumulado de quinzena offshore.
- C3-E: setores/trechos/sit periods no risco acumulado.
- C3-F: revisao de IA/resumo com limites de recomendacao.
- C3-G: source flags por campo (com migration dedicada).
- C3-H: calibracao cientifica de pesos/thresholds.
- Fase D: alertas persistentes apenas apos itens minimos de maturidade.

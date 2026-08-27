# FRMS — Operational Readiness / PVT v1

Status: implementação incremental em branch de feature. Este documento registra decisões de segurança e evita que regras experimentais sejam confundidas com critérios aprovados de despacho.

## Objetivo

Acoplar ao check-in diário FRMS uma avaliação objetiva breve de vigilância, mantendo KSS, sono, qualidade do sono e declaração de condição para jornada como sinais complementares. Nenhum resultado isolado deve produzir decisão automática de apto/inapto.

## Teste breve de vigilância

Protocolo inicial: `airtrust-vigilance-v1`.

- duração padrão: 3 minutos;
- intervalo pseudoaleatório entre estímulos: 2–10 s;
- resposta antecipada: < 100 ms;
- lapso: >= 500 ms;
- janela sem resposta: 2 s;
- métricas persistíveis: mediana, média, p90, desvio-padrão, lapsos, respostas antecipadas, perdas, velocidade média de resposta e trials brutos.

O baseline individual deve ser formado antes de qualquer comparação longitudinal. A classificação `baseline_building` não equivale a aprovação operacional.

## Temperatura / METAR

### Fonte meteorológica

Fonte primária prevista: API-REDEMET/DECEA.

A consulta deve usar o indicativo ICAO do aeródromo e o horário operacional relevante. Para auditoria, persistir no resultado:

- aeródromo ICAO;
- instante do METAR utilizado;
- temperatura e ponto de orvalho lidos;
- METAR bruto ou hash/referência suficiente para reprodução;
- fonte (`REDEMET_METAR`);
- voo/jornada aos quais a observação foi vinculada.

### Associação com voos

A avaliação não deve usar simplesmente a temperatura do momento em que o tripulante abre o FRMS. Deve considerar a exposição ligada à operação:

1. localizar os voos/trechos da jornada do tripulante;
2. para cada decolagem, consultar a observação METAR do aeródromo de origem mais próxima do horário operacional relevante;
3. para cada pouso, consultar a observação METAR do destino mais próxima do horário operacional relevante;
4. manter separadas observações de origem e destino;
5. em voo futuro, não fingir que METAR é previsão: usar a observação mais recente como contexto e, se a lógica futura exigir previsão, tratar TAF em campo separado;
6. em análise retrospectiva, usar METAR histórico correspondente ao evento real;
7. nunca substituir silenciosamente dado ausente por zero ou temperatura padrão.

### Regra de penalização térmica

Não há, nas referências públicas de ICAO/IATA/FAA, uma conversão universal aprovada de temperatura ambiente em pontos de fadiga por grau Celsius. A literatura de desempenho humano associa calor a perda de desempenho, porém os limiares mais consistentes para tarefas perceptivo-motoras são descritos principalmente em WBGT, e METAR fornece temperatura seca/ponto de orvalho/vento, não WBGT completo.

Consequência de projeto:

- o AirTrust pode suportar `thresholdC`, `pointsPerDegree` e `maxPoints` como parâmetros governados;
- a regra fica inicialmente desabilitada para decisão operacional;
- durante o período de calibração, temperatura e resultados de vigilância devem ser armazenados para análise longitudinal;
- somente após benchmark científico + validação operacional interna deve o parâmetro passar a influenciar score/alerta;
- mesmo depois de habilitado, a temperatura deve ser um fator de risco, não um critério isolado de aptidão.

A implementação inicial em `thermalExposure.ts` preserva exatamente essa separação entre coleta e penalização.

## Benchmark científico usado para desenho

- ICAO: FRMS deve ser baseado em princípios científicos, conhecimento, experiência operacional e evidência orientada por dados; não há um “limite correto” universal para todos os contextos.
- Revisões de desempenho em calor: reduções podem ocorrer em atenção, memória, velocidade/precisão e tarefas perceptivo-motoras; resultados dependem de intensidade, duração, tipo de tarefa e carga térmica.
- Revisões clássicas apontam início de degradação perceptivo-motora aproximadamente em 30–33 °C WBGT; esse valor não deve ser confundido com 30–33 °C de temperatura seca do METAR.

## Próximas integrações de código

1. integrar o componente de vigilância ao fluxo do check-in;
2. persistir resumo + trials em entidade tenant-scoped específica;
3. expor baseline individual e comparação longitudinal;
4. criar provider server-side para REDEMET com segredo fora do frontend;
5. associar METAR a origem/destino usando escala/voos da jornada;
6. persistir provenance da observação meteorológica;
7. incluir temperatura e desempenho na visão do tripulante e na coordenação sem diagnóstico médico;
8. validar com testes de RBAC, tenant isolation, idempotência, indisponibilidade da REDEMET e dados meteorológicos ausentes.

## Guardrails

- sem chave REDEMET no cliente;
- sem cross-tenant;
- sem score silencioso quando faltar METAR;
- sem decisão automática baseada apenas em PVT ou temperatura;
- parâmetros de score precisam de versionamento e trilha de auditoria;
- mudanças de limiar não podem reescrever retroativamente resultados históricos sem preservar a versão de regra usada.

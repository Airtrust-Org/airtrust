# FRMS — Operational Readiness / PVT v1

Status: implementação cognitiva integrada em branch de feature; validação final de CI ainda em andamento. Este documento registra decisões de segurança e evita que regras experimentais sejam confundidas com critérios aprovados de despacho.

## Objetivo

Acoplar ao check-in diário FRMS uma avaliação objetiva breve de vigilância, mantendo KSS, sono, qualidade do sono e declaração de condição para jornada como sinais complementares. Nenhum resultado isolado deve produzir decisão automática de apto/inapto.

## Teste breve de vigilância

Protocolo inicial: `airtrust-vigilance-v1`.

- duração padrão: 3 minutos;
- intervalo pseudoaleatório entre estímulos: 2–10 s;
- resposta antecipada: < 100 ms;
- lapso descritivo: >= 500 ms;
- janela sem resposta: 2 s;
- métricas persistidas: mediana, média, p90, desvio-padrão, lapsos, respostas antecipadas, perdas, velocidade de resposta e trials brutos;
- relógio monotônico no navegador via `performance.now()`;
- nenhum acesso de rede é necessário durante a execução do teste;
- troca de aba, ocultação da página ou perda de foco invalida a tentativa, descarta dados parciais e exige reinício.

O Worker recalcula as métricas e a classificação a partir dos trials brutos; resumos ou sinais subjetivos enviados pelo navegador não são fonte de verdade. KSS e sono são obtidos do check-in diário já persistido para o mesmo funcionário, empresa e data.

## Baseline e classificação V1

O baseline individual usa avaliações anteriores válidas do próprio funcionário e do mesmo tenant. São necessárias 5 sessões anteriores antes de a comparação sair de `baseline_building`. O snapshot usa até as 5 sessões válidas mais recentes estritamente anteriores à data avaliada e registra mediana individual de tempo de reação, taxa de lapsos e os deltas atuais; esses deltas ficam observáveis/auditáveis, mas ainda não recebem peso adicional na classificação sem critério validado.

Uma reavaliação no mesmo dia substitui logicamente a avaliação ativa daquele dia, preservando a anterior como histórico soft-deleted e sem contar o dia duas vezes no baseline.

Classificações disponíveis:

- `baseline_building` — histórico individual ainda insuficiente;
- `preserved` — sem combinação de sinais que exija atenção segundo a versão atual;
- `attention` — combinação de sinais de atenção com baseline já estabelecido;
- `operational_review` — presença de sinal crítico subjetivo que requer revisão operacional.

Guardrail importante: estar formando baseline nunca pode esconder sinal crítico já conhecido. KSS >= 8 ou sono < 5 h continua levando a `operational_review` mesmo nas primeiras sessões.

Os limiares cognitivos V1 são sinais de workflow e não constituem critério médico ou decisão autônoma de aptidão. A regra e a versão de protocolo ficam armazenadas para permitir auditoria e recálculo futuro.

## Persistência e isolamento

A migration aditiva `0471_frms_operational_readiness.sql` cria:

- `frms_readiness_assessment` — avaliação ativa/histórica por funcionário e data;
- `frms_readiness_vigilance_trial` — trials brutos associados à avaliação.

Todas as leituras e escritas de aplicação usam `empresa_id` do contexto autenticado. `funcionario_id`, `checkin_id` ou `assessment_id` recebidos do cliente nunca são suficientes, isoladamente, para localizar ou alterar dados.

A migration foi apenas preparada e certificada no Schema V2. Este documento e a PR não autorizam aplicação remota, escrita D1 operacional ou deploy.

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
- PVT/PVT-B: estudos publicados sustentam testes breves de aproximadamente 3 minutos como instrumentos sensíveis a degradação por perda de sono, com a ressalva de que versões breves não são intercambiáveis com PVT de 10 minutos em todas as condições.
- FAA: testes psicomotores podem compor programas estruturados de monitoramento, mas exigem baseline/monitoramento e não devem ser tratados como determinação tática isolada de nível de fadiga.
- Revisões de desempenho em calor: reduções podem ocorrer em atenção, memória, velocidade/precisão e tarefas perceptivo-motoras; resultados dependem de intensidade, duração, tipo de tarefa e carga térmica.
- Revisões clássicas apontam início de degradação perceptivo-motora aproximadamente em 30–33 °C WBGT; esse valor não deve ser confundido com 30–33 °C de temperatura seca do METAR.

## Estado das integrações

Já implementado nesta frente cognitiva:

1. teste breve integrado ao fluxo do check-in diário;
2. invalidação por perda de foco/visibilidade;
3. persistência tenant-scoped do resumo e dos trials brutos;
4. baseline individual e consulta do estado do dia;
5. recálculo autoritativo no Worker usando KSS/sono do check-in persistido;
6. reavaliação no mesmo dia sem inflar baseline;
7. migration Schema V2 aditiva 0471 preparada, sem aplicação remota;
8. testes unitários de métricas/classificação, interrupção do teste, fonte de verdade subjetiva e isolamento tenant no contrato da rota;
9. suíte do check-in adaptada para validar a sequência de persistência subjetiva + objetiva.

Continua deliberadamente separado para a frente térmica/operacional:

1. provider server-side da REDEMET com segredo fora do frontend;
2. associação de METAR a origem/destino usando escala/voos da jornada;
3. persistência da provenance meteorológica;
4. calibração validada de eventual influência térmica no score;
5. tratamento de indisponibilidade da REDEMET e dados meteorológicos ausentes.

## Guardrails

- sem chave REDEMET no cliente;
- sem cross-tenant;
- sem score silencioso quando faltar METAR;
- sem decisão automática baseada apenas em PVT ou temperatura;
- parâmetros de score precisam de versionamento e trilha de auditoria;
- mudanças de limiar não podem reescrever retroativamente resultados históricos sem preservar a versão de regra usada;
- nenhum resultado parcial de teste invalidado é persistido;
- o navegador não define a classificação autoritativa.

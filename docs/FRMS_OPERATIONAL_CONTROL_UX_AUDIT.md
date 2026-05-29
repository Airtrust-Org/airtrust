# FRMS Operational Control UX Audit

## 1. Diagnostico da tela anterior

A tela `/frms/controle-operacional` misturava painel executivo, filtros tecnicos e tabela operacional em uma unica camada visual. Os principais problemas encontrados foram:

- cards demais no topo, incluindo indicadores que nao ajudam a coordenacao a decidir a proxima acao imediata;
- filtro de funcionario exposto por ID, pouco util no uso operacional;
- base e aeronave como campos de texto livre, com risco de erro de digitacao;
- tabela densa, com pouca hierarquia entre tripulante escalado, check-in, fadiga, fonte de dados e ciencia operacional;
- labels que aproximavam jornada/compliance de fadiga fisiologica sem separar claramente as duas dimensoes;
- eventos de ciencia exibidos como bloco operacional, mas sem deixar claro que nao sao mitigacao nem decisao automatica.

## 2. Problemas corrigidos

- O topo foi reduzido para seis sinais operacionais: tripulantes monitorados, check-ins pendentes, alertas, dados estimados/ausentes, inconsistencias e ciencia pendente.
- A busca principal de tripulante passou a aceitar nome, nome de guerra, funcao, aeronave e ID como fallback de busca.
- O filtro tecnico por `funcionario_id` foi mantido, mas movido para uma area recolhida.
- Base e aeronave/modelo passaram a ser `select` populados a partir dos dados reais recebidos do snapshot.
- A tabela foi reorganizada para priorizar quem esta escalado, se fez check-in, dados de sono/KSS, efetividade/quinzena, status, alertas e fonte dos dados.
- Ciencia operacional passou a ser apresentada como registro de leitura, sem linguagem de mitigacao.

## 3. Filtros novos

- Data inicio.
- Data fim.
- Tripulante por nome, nome de guerra ou funcao.
- Base por dropdown derivado do snapshot carregado.
- Aeronave/modelo por dropdown derivado do snapshot carregado.
- Status por dropdown.
- Toggle para mostrar inconsistencias.
- Filtro tecnico recolhido por `funcionario_id`.

Os filtros de base, aeronave/modelo, status e busca textual sao aplicados no frontend sobre o snapshot carregado. Isso evita mudar backend nesta fase e preserva compatibilidade com a rota atual.

## 4. Cards mantidos e removidos

Cards mantidos como indicadores primarios:

- Tripulantes monitorados.
- Check-ins pendentes.
- Alertas.
- Dados estimados/ausentes.
- Inconsistencias.
- Ciencia pendente.

Cards removidos do topo:

- alertas criticos isolados;
- alertas atencao isolados;
- quinzena incompleta;
- quinzena atencao;
- quinzena critica;
- outros agregados secundarios que competiam com a leitura operacional imediata.

A quinzena continua visivel na linha do tripulante como indicador descritivo contextual, nao como diagnostico ou decisao automatica.

## 5. Como a coordenacao deve usar a tela

Fluxo recomendado:

1. Selecionar a data operacional.
2. Filtrar por base ou aeronave/modelo quando a coordenacao estiver acompanhando uma operacao especifica.
3. Ler primeiro os KPIs de check-in pendente, alertas, dados estimados/ausentes e inconsistencias.
4. Na tabela, verificar os tripulantes escalados primeiro.
5. Priorizar linhas com status `CRITICO`, `ATENCAO`, fonte `ESTIMADO`, fonte `AUSENTE` ou fonte `INCONSISTENTE`.
6. Usar a secao de ciencia para registrar leitura operacional quando houver evento pendente.

A tela nao decide mitigacao, nao altera escala e nao executa bloqueio automatico.

## 6. Como dados FRMS chegam da escala e snapshot

O snapshot operacional e construido em `worker-airtrust/src/lib/frms/operational-snapshot.ts` a partir de:

- escala diaria em `escala_voo_diaria`, unindo PIC e SIC;
- jornada FRMS em `frms_jornada`;
- check-in de fadiga em `frms_fadiga_checkin`;
- fatorizacao/efetividade em `frms_fatorizacao_jornada`;
- cadastro de funcionarios para nome, nome de guerra, funcao, base e aeronave fallback.

O builder monta chaves por `data_operacional` e `funcionario_id`. Com isso:

- escalado com check-in aparece como linha operacional completa;
- escalado sem check-in aparece com `CHECKIN_PENDENTE`;
- escalado sem jornada FRMS aparece com `ESCALADO_SEM_JORNADA_FRMS`;
- jornada FRMS sem escala aparece como excecao;
- check-in sem escala aparece como excecao;
- sono e despertar sao marcados como `REAL`, `ESTIMADO` ou `AUSENTE`;
- jornada pode ser `REAL`, `MANUAL`, `ESTIMADO`, `AUSENTE` ou `INCONSISTENTE`.

A tela de EVD consome atualmente rotas de fadiga diaria (`/api/frms/daily-fatigue`) e nao o snapshot operacional completo. Isso explica por que a EVD pode mostrar sinais FRMS sem compartilhar exatamente a mesma composicao de excecoes da tela de controle.

## 7. Limitacoes ainda existentes

- Dropdowns de base e aeronave/modelo dependem do snapshot carregado; nao ha endpoint dedicado de dimensoes operacionais nesta fase.
- A busca por nome e aplicada no frontend; para bases muito grandes, pode ser necessario suporte backend paginado.
- A EVD ainda nao consome a rota de snapshot operacional; uma unificacao futura exigiria desenho de contrato para nao quebrar a escala.
- A tela mostra ciencia operacional, mas nao cria mitigacao nem workflow de acao.
- A auditoria nao altera formulas, pesos ou thresholds existentes.

## 8. Pontos para Opus no futuro

Chamar Opus apenas se aparecer duvida cientifica real, como:

- qual threshold deve acionar alerta por KSS;
- como ponderar efetividade, sono, ritmo circadiano e carga offshore;
- se o indicador de quinzena deve participar de decisao operacional;
- como transformar alerta em mitigacao formal sem confundir FRMS com compliance de jornada.

## 9. Confirmacao de escopo

Esta fase nao alterou:

- banco de dados;
- schema;
- migration;
- formula de fadiga;
- threshold;
- mitigacao;
- decisao automatica;
- escala operacional;
- SGSO.

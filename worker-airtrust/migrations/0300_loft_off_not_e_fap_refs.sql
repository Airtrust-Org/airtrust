-- Migration 0300: LOFT-OFF (modelo 51), LOFT-NOT (modelo 52) e FAP refs nos LOFT-CHK
-- ============================================================

-- ============================================================
-- PARTE 1 — ATUALIZAR DESCRIÇÕES LOFT-CHK com referências FAP
-- ============================================================

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Determinação do MTOW, velocidades críticas (V1, Vtoss) e perfil de decolagem CAT A para as condições ambientais do aeródromo de partida. Verificação do envelope de desempenho Classe 1 em condições IMC. (Ref: RFM, Cap. 5) | FAP: FAP14 — Planejamento/Performance, FAP06 CIR.1'
WHERE codigo = 'LOFT-CHK-01' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Análise de METAR/TAF, determinação dos mínimos IFR do destino e alternado, combustível regulamentar e autonomia. Seleção de aeródromo de alternativa adequado às condições previstas. (Ref: RBHA 91) | FAP: FAP14 — Planejamento IFR, FAP06 CIR.1, FAP05.2 — Conhecimentos Gerais'
WHERE codigo = 'LOFT-CHK-02' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Inserção do plano de voo IFR no Primus Epic: SID, rota en route, STAR RNAV, carta IAP do destino e do alternado, combustível e pesos. Verificação cruzada PF/PM. (Ref: FMS Pilot''s Guide, Cap. 4) | FAP: FAP14 — Planejamento IFR, FAP06 CIR.1'
WHERE codigo = 'LOFT-CHK-03' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Briefing estruturado com definição de funções PF/PM, identificação de ameaças (terrain, clima, espaço aéreo), critérios de arremetida e desvio para alternado. Modelos TEM e FORDEC. | FAP: FAP05.2 NTS2.1 — Reconhecer e gerenciar ameaças, NTS1.5 — Comunicação interpessoal'
WHERE codigo = 'LOFT-CHK-04' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Inspeção pré-voo externa e interna, acionamento dos motores e execução disciplinada dos checklists normais (desafio-resposta-verificação). Monitoramento de parâmetros de motor e sistemas. (Ref: QRH, Normal Procedures) | FAP: FAP05.2 C2.1 — Procedimentos pré-voo, C2.2 — Inspeção pré-voo, H1.1 — Acionar o helicóptero, H4.1 — Cheques pré-decolagem'
WHERE codigo = 'LOFT-CHK-05' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Verificação de margem de potência (PWR MGN), centragem de comandos e estabilidade em voo pairado; taxi em voo pairado até a posição de decolagem. (Ref: RFM, Cap. 4) | FAP: FAP05.2 H2.3 — Deslocar em voo pairado, H3.1 — Taxiar o helicóptero'
WHERE codigo = 'LOFT-CHK-06' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Execução do perfil de decolagem CAT A com saída IMC logo após o TO, capturando SID e transferência para instrumentos. Manutenção da trajetória de segurança e comunicações com ATC. (Ref: RFM, Cap. 4) | FAP: FAP06 CIR.2 — Decolagem IFR, CIR.3 — Procedimento de saída IFR, FAP05.2 H4.2 — Decolagem normal'
WHERE codigo = 'LOFT-CHK-07' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Reação à falha de motor após o TDP em IMC: itens de memória (OEI PROC), trajetória fly-away monomotor, gestão de potência de contingência e comunicação Pan-Pan com ATC. (Ref: RFM, Cap. 3/4) | FAP: FAP06 CIR.4 — Saída IFR com falha de motor, FAP05.2 H7.4 — Gerenciar falha de motor nas fases de decolagem, H7.9 — Gerenciar falhas de motor'
WHERE codigo = 'LOFT-CHK-08' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Condução do voo IFR em rota: gestão de waypoints, ETA, combustível, modos de automação (AP/FD) e coordenação com controle de tráfego aéreo. (Ref: EPIC Guide, Cap. 15) | FAP: FAP14 — Navegação IFR, FAP06 CIR.5 — Navegar a aeronave sob IFR'
WHERE codigo = 'LOFT-CHK-09' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Vigilância mútua (PF/PM) sobre altitudes, velocidades e trajetória; monitoramento de integridade de instrumentos e sistemas críticos; comunicação assertiva de desvios. | FAP: FAP06 IFF.1 — Testar e monitorar instrumentos, IFF.2 — Manobras com painel completo, FAP05.2 NTS1.1 — Manter vigilância efetiva, NTS1.2 — Manter consciência situacional'
WHERE codigo = 'LOFT-CHK-10' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Identificação de falha (elétrica, hidráulica ou aviônica) em cruzeiro IFR: leitura de CAS/IED, itens de memória, uso do QRH e avaliação do impacto na continuidade do voo. (Ref: RFM, Cap. 3) | FAP: FAP05.2 H7.7 — Gerenciar falhas de sistemas, FAP06 IFL.1 — Reconhecer falhas dos instrumentos do painel'
WHERE codigo = 'LOFT-CHK-11' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Execução do procedimento de chegada STAR RNAV: interceptação do segmento inicial, descida programada no FMS, speed/altitude constraints e configuração pré-aproximação. | FAP: FAP14 — Descida e chegada, FAP06 CIR.6 — Procedimento de descida e chegada sob IFR'
WHERE codigo = 'LOFT-CHK-12' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Execução de holding IFR com geometria e entradas corretas; gerenciamento de combustível e novo ETA; comunicação com ATC para autorização e saída do holding. (Ref: AIP Brasil) | FAP: FAP14 — Procedimento de espera, FAP06 CIR.7 — Realizar procedimento de espera IFR'
WHERE codigo = 'LOFT-CHK-13' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Briefing, setup e execução da NPA: descida em degraus (step-down) ou CDFA até a MDA; vigilância de obstruções e monitoramento de CDI/desvios. Sem contato visual na MDA. (Ref: AIP/Carta IAP) | FAP: FAP06 IAP2.1 — Preparar a aeronave para o procedimento, IAP2.2 — Realizar o procedimento de não-precisão'
WHERE codigo = 'LOFT-CHK-14' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Execução da arremetida instrumental ao atingir a MDA sem referências visuais: aplicação de potência de arremetida, subida estabilizada, procedimento APM e comunicação com ATC. (Ref: AIP) | FAP: FAP06 IAP2.3 — Realizar uma aproximação perdida (NPA)'
WHERE codigo = 'LOFT-CHK-15' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Aplicação de FORDEC após arremetida: avaliação de combustível vs. condições restantes, seleção do alternado, novo plano de voo e coordenação com ATC para o desvio. | FAP: FAP05.2 NTS1.3 — Avaliar situações e tomar decisões, NTS2.2 — Reconhecer e gerenciar erros, FAP14 — Gestão de combustível e decisão operacional'
WHERE codigo = 'LOFT-CHK-16' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Configuração e verificação do ILS (FREQ, CRS, DA, mínimos); briefing completo antes do IAF incluindo critérios para pouso, go-around e OEI. (Ref: AIP/Carta ILS) | FAP: FAP06 IAP3.1 — Preparar a aeronave para o procedimento de precisão'
WHERE codigo = 'LOFT-CHK-17' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Execução da aproximação ILS: intercepção de localizer e glide slope, descida estabilizada; obtenção de referências visuais próximo à DA; pouso executado no alternado. (Ref: AIP) | FAP: FAP06 IAP3.2 — Realizar o procedimento de precisão (ILS), FAP14 — Aproximação de precisão'
WHERE codigo = 'LOFT-CHK-18' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Pouso no aeródromo alternativo, checklists após pouso e pós-voo, encerramento do plano de voo IFR e comunicações finais com ATC. (Ref: QRH) | FAP: FAP05.2 H4.3 — Realizar uma aproximação normal para pouso, H4.5 — Pouso final e corte dos motores, C2.3 — Procedimentos pós-voo'
WHERE codigo = 'LOFT-CHK-19' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Manutenção contínua da consciência situacional (SACO) ao longo do voo: awareness de posição, combustível, meteorologia e ameaças ativas; identificação e mitigação de erros. | FAP: FAP05.2 NTS1.2 — Manter consciência situacional, NTS2.1 — Reconhecer e gerenciar ameaças, NTS2.2 — Reconhecer e gerenciar erros'
WHERE codigo = 'LOFT-CHK-20' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Uso consistente de fraseologia padrão ICAO/DECEA; readbacks corretos; comunicações em situações não normais (Pan-Pan, desvio); coordenação assertiva entre PF e PM ao longo do voo. | FAP: FAP05.2 C3.1 — Operar o equipamento de rádio, C3.2 — Gerenciar panes do equipamento de rádio, C3.3 — Operar o transponder'
WHERE codigo = 'LOFT-CHK-21' AND deleted_at IS NULL;

UPDATE manobras SET updated_at = datetime('now'),
  descricao = 'Gerenciamento eficaz da carga de trabalho em fases críticas do voo; aplicação de modelos de decisão estruturados (FORDEC); liderança situacional e assertividade em cenários adversos. | FAP: FAP05.2 NTS1.4 — Definir prioridades e gerenciar tarefas, NTS1.5 — Manter comunicações e relações interpessoais efetivas'
WHERE codigo = 'LOFT-CHK-22' AND deleted_at IS NULL;

-- ============================================================
-- PARTE 2 — INSERIR MANOBRAS LOFT-OFF (Offshore Diurno)
-- ============================================================

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, created_at, updated_at) VALUES
('LOFT-OFF-01','Performance CAT A para Helideck','PRE',
 'Determinação de MTOW, Vtoss, V1 e gradiente de subida OEI considerando as condições da plataforma (altitude, temperatura, deck size). Verificação do envelope CAT A para operações Classe 1 offshore. (Ref: RFM, Cap. 5)',
 'TREINAMENTO','AW139',1,datetime('now'),datetime('now')),

('LOFT-OFF-02','Planejamento de Missão Offshore','PRE',
 'Análise de Sea State, vento no helideck, NOTAM offshore, roteamento em corredor e cálculo do ponto Bingo de combustível para decisão de retorno. (Ref: RBHA 91)',
 'TREINAMENTO','AW139',2,datetime('now'),datetime('now')),

('LOFT-OFF-03','Configuração FMS — Rota Offshore','PRE',
 'Inserção da rota no Primus Epic com waypoints do corredor offshore, ponto Bingo, coordenadas do helideck e plano de contingência. (Ref: FMS Pilot''s Guide, Cap. 4)',
 'TREINAMENTO','AW139',3,datetime('now'),datetime('now')),

('LOFT-OFF-04','Briefing Helideck e TEM','PRE',
 'Briefing completo do helideck: dimensões, elevação, obstáculos, direção de aproximação, critérios de arremetida e ameaças específicas (Black Hole, plataforma em movimento).',
 'TREINAMENTO','AW139',4,datetime('now'),datetime('now')),

('LOFT-OFF-05','Inspeção, Acionamento e Checklists','SOL',
 'Inspeção pré-voo, acionamento e checklists normais. Atenção especial à verificação de sistemas hidráulicos e elétricos antes da missão offshore. (Ref: QRH)',
 'TREINAMENTO','AW139',5,datetime('now'),datetime('now')),

('LOFT-OFF-06','Hover Check e Taxi Costeiro','SOL',
 'Verificação da margem de potência real (PWR MGN) em pairado; deslocamento até a posição de decolagem. Confirmar dados de desempenho antes da saída para o mar. (Ref: RFM, Cap. 4)',
 'TREINAMENTO','AW139',6,datetime('now'),datetime('now')),

('LOFT-OFF-07','Decolagem CAT A — Clear Area ou Vertical','SOL',
 'Execução do perfil de decolagem CAT A (Clear Area, Vertical ou Helideck) adequado às condições do aeródromo costeiro de partida. (Ref: RFM, Cap. 4)',
 'TREINAMENTO','AW139',7,datetime('now'),datetime('now')),

('LOFT-OFF-08','Gestão de Automação en Route','VOO',
 'Seleção e monitoramento dos modos AP/FD (NAV, ALTS, IAS) durante subida e cruzeiro offshore; uso correto do FMA e disciplina de automação. (Ref: EPIC Guide, Cap. 15)',
 'TREINAMENTO','AW139',8,datetime('now'),datetime('now')),

('LOFT-OFF-09','Navegação Offshore e Combustível','VOO',
 'Gestão da rota em corredor offshore: waypoints, ETAs, reporte de posição e monitoramento do combustível em relação ao ponto Bingo de retorno.',
 'TREINAMENTO','AW139',9,datetime('now'),datetime('now')),

('LOFT-OFF-10','Monitoramento de Sistemas e Path Monitoring','VOO',
 'Vigilância mútua (PF/PM) de parâmetros de voo e sistemas; comunicação assertiva de desvios; divisão de tarefas e CRM em cruzeiro sobre o mar.',
 'TREINAMENTO','AW139',10,datetime('now'),datetime('now')),

('LOFT-OFF-11','Diagnóstico: HYD 1 FAIL','EME',
 'Leitura precisa da mensagem "HYD 1 FAIL" no CAS, cruzamento com IED (pressão hidráulica, temperatura) e avaliação dos sistemas afetados (comandos, trem de pouso). (Ref: RFM, Cap. 3)',
 'TREINAMENTO','AW139',11,datetime('now'),datetime('now')),

('LOFT-OFF-12','Procedimentos Hidráulicos (Memória + QRH)','EME',
 'Execução dos itens de memória para falha hidráulica e uso coordenado do QRH; gestão da carga de trabalho PF/PM durante a pane. (Ref: RFM, Cap. 3)',
 'TREINAMENTO','AW139',12,datetime('now'),datetime('now')),

('LOFT-OFF-13','Decisão com Sistema Hidráulico Degradado','EME',
 'Aplicação de FORDEC: continuar para plataforma vs. retornar ao costeiro; impacto da falha no trem de pouso, comandos e capacidade de pouso offshore.',
 'TREINAMENTO','AW139',13,datetime('now'),datetime('now')),

('LOFT-OFF-14','Briefing de Aproximação ao Helideck','APR',
 'Briefing completo antes do IAF: setor de aproximação, vento, obstáculos, critérios de go-around normal e monomotor; limites de potência OEI para o pouso.',
 'TREINAMENTO','AW139',14,datetime('now'),datetime('now')),

('LOFT-OFF-15','Pouso Normal no Helideck','APR',
 'Primeiro pouso na plataforma após resolução da pane hidráulica; controle de rampa, vento e toque centralizado no helideck.',
 'TREINAMENTO','AW139',15,datetime('now'),datetime('now')),

('LOFT-OFF-16','Gestão de Potência OEI — Limites e Monitoramento','EME',
 'Monitoramento rigoroso dos limites de contingência (2,5 min / 30 min) do motor remanescente durante a série de exercícios OEI no helideck. (Ref: RFM, Cap. 2)',
 'TREINAMENTO','AW139',16,datetime('now'),datetime('now')),

('LOFT-OFF-17','OEI Antes do TDP — Decolagem Rejeitada','APR',
 'Falha simulada de motor antes do TDP no helideck: execução do procedimento de decolagem rejeitada com pouso seguro na plataforma. (Ref: RFM, Cap. 4)',
 'TREINAMENTO','AW139',17,datetime('now'),datetime('now')),

('LOFT-OFF-18','OEI Após o TDP — Fly-Away Monomotor','APR',
 'Falha simulada após o TDP: fly-away em perfil monomotor, saída segura da zona do helideck e circuito de retorno à plataforma. (Ref: RFM, Cap. 4)',
 'TREINAMENTO','AW139',18,datetime('now'),datetime('now')),

('LOFT-OFF-19','OEI Antes do LDP — Arremetida Monomotor','APR',
 'Falha simulada antes do LDP na aproximação final: execução de arremetida monomotor segura com afastamento da plataforma. (Ref: RFM, Cap. 4)',
 'TREINAMENTO','AW139',19,datetime('now'),datetime('now')),

('LOFT-OFF-20','OEI Após o LDP — Pouso Comprometido','APR',
 'Falha simulada após o LDP: execução do pouso comprometido ("committed") no helideck com motor inoperante. (Ref: RFM, Cap. 4)',
 'TREINAMENTO','AW139',20,datetime('now'),datetime('now')),

('LOFT-OFF-21','Estabilização Final e Controle de Rampa OEI','APR',
 'Avaliação da estabilização da aeronave (rampa, velocidade, potência) nas aproximações OEI; critérios de go-around em cada exercício; disciplina de Stabilized Approach.',
 'TREINAMENTO','AW139',21,datetime('now'),datetime('now')),

('LOFT-OFF-22','Comunicação e Coordenação em Cenários OEI','CRM',
 'Fraseologia e coordenação PF/PM durante a série de exercícios OEI; comunicação com a rádio da plataforma; assertividade em decisões críticas de pouso/arremetida.',
 'TREINAMENTO','AW139',22,datetime('now'),datetime('now'));

-- ============================================================
-- PARTE 3 — INSERIR MANOBRAS LOFT-NOT (Noturno Semestral)
-- ============================================================

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, created_at, updated_at) VALUES
('LOFT-NOT-01','Performance Noturna CAT A/PC1','PRE',
 'Determinação de MTOW e velocidades de decolagem considerando as restrições de operação noturna offshore. Verificação dos limites de iluminação de helideck exigidos. (Ref: RFM, Cap. 5)',
 'TREINAMENTO','AW139',1,datetime('now'),datetime('now')),

('LOFT-NOT-02','Planejamento Noturno e Alternado IFR','PRE',
 'Análise de METAR/TAF noturno, mínimos de visibilidade e teto para helideck à noite, seleção de aeródromo alternado IFR e combustível regulamentar para o desvio.',
 'TREINAMENTO','AW139',2,datetime('now'),datetime('now')),

('LOFT-NOT-03','Configuração FMS — Rota Noturna e Alternado','PRE',
 'Inserção da rota primária + plano secundário (alternado) no Primus Epic; configuração de auxílios rádio e carta IAP do alternado. (Ref: FMS Pilot''s Guide)',
 'TREINAMENTO','AW139',3,datetime('now'),datetime('now')),

('LOFT-NOT-04','Briefing Noturno — Ilusões e Black Hole','PRE',
 'Briefing focado nas ilusões visuais noturnas: Black Hole Effect, autokinesis, ausência de horizonte artificial externo; critérios de go-around reforçados para operações noturnas.',
 'TREINAMENTO','AW139',4,datetime('now'),datetime('now')),

('LOFT-NOT-05','Inspeção e Acionamento Noturnos','SOL',
 'Inspeção pré-voo noturna com uso de lanterna; acionamento e checklists com atenção especial à iluminação de painel, luzes externas e sistemas elétricos. (Ref: QRH)',
 'TREINAMENTO','AW139',5,datetime('now'),datetime('now')),

('LOFT-NOT-06','Monitoramento Elétrico no Acionamento','SOL',
 'Vigilância dos geradores (GEN 1 / GEN 2), barramentos e baterias no acionamento noturno; confirmar carga elétrica estabilizada antes do taxi.',
 'TREINAMENTO','AW139',6,datetime('now'),datetime('now')),

('LOFT-NOT-07','Decolagem IFR Noturna','SOL',
 'Decolagem com transição rigorosa e imediata para instrumentos após liftoff em ambiente noturno; gestão do "lure" de luzes externas e prevenção de desorientação. (Ref: RFM, Cap. 4)',
 'TREINAMENTO','AW139',7,datetime('now'),datetime('now')),

('LOFT-NOT-08','Configuração de Cockpit Noturno','VOO',
 'Ajuste técnico de brilho das telas MFD/PFD, luzes de cabine e luzes externas para otimizar visão noturna sem ofuscamento. (Ref: EPIC Guide)',
 'TREINAMENTO','AW139',8,datetime('now'),datetime('now')),

('LOFT-NOT-09','Gestão de Automação Noturna','VOO',
 'Uso disciplinado dos modos superiores (AP/FD) como substituto das referências visuais externas ausentes; monitoramento rigoroso do FMA e annunciators.',
 'TREINAMENTO','AW139',9,datetime('now'),datetime('now')),

('LOFT-NOT-10','Radar WX e TAWS à Noite','VOO',
 'Uso ativo do Radar Meteorológico e HTAWS para detecção de células convectivas e obstáculos invisíveis na escuridão. (Ref: EPIC Guide, Cap. 8)',
 'TREINAMENTO','AW139',10,datetime('now'),datetime('now')),

('LOFT-NOT-11','Path Monitoring Noturno','VOO',
 'Vigilância rigorosa do PM sobre altitude, razão de descida e curso; protocolo de alertas imediatos para prevenir desorientação espacial e CFIT em voo noturno.',
 'TREINAMENTO','AW139',11,datetime('now'),datetime('now')),

('LOFT-NOT-12','Diagnóstico: GEN 1 FAIL em Voo Noturno','EME',
 'Identificação da falha de gerador em voo noturno pelo CAS ("GEN 1 FAIL"); leitura de amperímetro e voltímetro; avaliação do impacto elétrico em telas e sistemas. (Ref: RFM, Cap. 3)',
 'TREINAMENTO','AW139',12,datetime('now'),datetime('now')),

('LOFT-NOT-13','Procedimentos Elétricos (Memória + QRH)','EME',
 'Execução dos itens de memória para falha de gerador, gestão de cargas (load shedding) e uso do QRH em ambiente noturno degradado. (Ref: RFM, Cap. 3)',
 'TREINAMENTO','AW139',13,datetime('now'),datetime('now')),

('LOFT-NOT-14','Decisão com Sistema Elétrico Degradado','EME',
 'FORDEC: continuar para destino vs. retornar; impacto da falha de gerador nos instrumentos, luzes e sistemas em operação noturna; combustível vs. risco.',
 'TREINAMENTO','AW139',14,datetime('now'),datetime('now')),

('LOFT-NOT-15','Briefing de Aproximação Noturna','APR',
 'Briefing para aproximação noturna ao helideck: iluminação disponível, mínimos noturnos, setor livre de obstáculos e critérios de go-around em ambiente escuro.',
 'TREINAMENTO','AW139',15,datetime('now'),datetime('now')),

('LOFT-NOT-16','Arremetida por Abaixo dos Mínimos (Noturna)','APR',
 'Execução da arremetida ao atingir os mínimos sem referências visuais suficientes; técnica de go-around noturna em ambiente offshore; captura imediata de instrumentos.',
 'TREINAMENTO','AW139',16,datetime('now'),datetime('now')),

('LOFT-NOT-17','Navegação para Alternado IFR','APR',
 'Reprogramação do FMS com rota para alternado; nova avaliação de combustível; coordenação com ATC para clearance de desvio e altitude em voo noturno.',
 'TREINAMENTO','AW139',17,datetime('now'),datetime('now')),

('LOFT-NOT-18','Aproximação no Alternado — ILS ou RNAV','APR',
 'Execução de aproximação de precisão (ILS) ou RNAV no aeródromo alternativo; estabilização completa na final em ambiente noturno; critérios de estabilização reforçados.',
 'TREINAMENTO','AW139',18,datetime('now'),datetime('now')),

('LOFT-NOT-19','Pouso no Alternado e Pós-Voo','APR',
 'Pouso no alternado, checklists após pouso e pós-voo, encerramento do PLVOO IFR e documentação da ocorrência elétrica. (Ref: QRH)',
 'TREINAMENTO','AW139',19,datetime('now'),datetime('now')),

('LOFT-NOT-20','Consciência Situacional em Voo Noturno','CRM',
 'Manutenção do SACO em ambiente degradado (escuridão + falha elétrica): awareness de posição, combustível, sistemas e ameaças cumulativas em cenário noturno.',
 'TREINAMENTO','AW139',20,datetime('now'),datetime('now')),

('LOFT-NOT-21','Gestão de Carga de Trabalho — Falha + Go-Around','CRM',
 'Coordenação PF/PM durante a sequência crítica de falha elétrica → go-around → desvio para alternado; priorização de tarefas e assertividade sob pressão.',
 'TREINAMENTO','AW139',21,datetime('now'),datetime('now')),

('LOFT-NOT-22','Comunicação Noturna — ATC e Rádio Plataforma','CRM',
 'Fraseologia padrão com órgão de controle durante emergência elétrica e desvio; comunicação com rádio da plataforma; coordenação de ATIS e clearances noturnas.',
 'TREINAMENTO','AW139',22,datetime('now'),datetime('now'));

-- ============================================================
-- PARTE 4 — REMOVER LINKS ANTIGOS DOS MODELOS 51 E 52
-- ============================================================

UPDATE modelos_sessao_manobras
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE modelo_id IN (51, 52) AND deleted_at IS NULL;

-- ============================================================
-- PARTE 5 — VINCULAR LOFT-OFF AO MODELO 51 (todos AB)
-- ============================================================

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-01' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-02' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-03' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-04' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-05' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-06' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-07' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-08' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-09' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-10' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-11' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-12' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-13' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-14' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-15' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-16' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-17' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-18' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-19' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-20' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-21' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 51, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-OFF-22' AND deleted_at IS NULL;

-- ============================================================
-- PARTE 6 — VINCULAR LOFT-NOT AO MODELO 52 (todos AB)
-- ============================================================

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-01' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-02' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-03' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-04' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-05' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-06' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-07' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-08' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-09' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-10' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-11' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-12' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-13' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-14' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-15' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-16' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-17' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-18' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-19' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-20' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-21' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 52, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-NOT-22' AND deleted_at IS NULL;

-- ============================================================
-- PARTE 7 — APAGAR MANOBRAS LOFT ANTIGAS SEM USO
-- Mantém LOFT-CHK, LOFT-OFF, LOFT-NOT e qualquer outra ainda referenciada
-- ============================================================

UPDATE manobras
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE codigo LIKE 'LOFT-%'
  AND codigo NOT LIKE 'LOFT-CHK-%'
  AND codigo NOT LIKE 'LOFT-OFF-%'
  AND codigo NOT LIKE 'LOFT-NOT-%'
  AND deleted_at IS NULL
  AND id NOT IN (
    SELECT DISTINCT manobra_id
    FROM modelos_sessao_manobras
    WHERE deleted_at IS NULL
  );

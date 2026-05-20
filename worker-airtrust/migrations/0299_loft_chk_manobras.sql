-- Migration 0299: Cria 22 manobras LOFT-CHK e aplica nos modelos de CHECK
-- Modelos afetados: 27 (A139-I-12/12), 34 (A139-P-LOFT/CHECK), 53 (A139-S-02/02)
-- Todos os itens são AB (avaliação em tripulação — LOFT)
-- ============================================================

-- ============================================================
-- 1. INSERIR AS 22 NOVAS MANOBRAS LOFT-CHK
-- ============================================================

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem, created_at, updated_at)
VALUES
('LOFT-CHK-01','Performance e Cálculos de Decolagem IFR','PRE',
 'Determinação do MTOW, velocidades críticas (V1, Vtoss) e perfil de decolagem CAT A para as condições ambientais do aeródromo de partida. Verificação do envelope de desempenho Classe 1 em condições IMC. (Ref: RFM, Cap. 5)',
 'TREINAMENTO','AW139',1,datetime('now'),datetime('now')),

('LOFT-CHK-02','Planejamento IFR, Mínimos e Alternado','PRE',
 'Análise de METAR/TAF, determinação dos mínimos IFR do destino e alternado, combustível regulamentar e autonomia. Seleção de aeródromo de alternativa adequado às condições previstas. (Ref: RBHA 91)',
 'TREINAMENTO','AW139',2,datetime('now'),datetime('now')),

('LOFT-CHK-03','Configuração Completa do FMS','PRE',
 'Inserção do plano de voo IFR no Primus Epic: SID, rota en route, STAR RNAV, carta IAP do destino e do alternado, combustível e pesos. Verificação cruzada PF/PM. (Ref: FMS Pilot''s Guide, Cap. 4)',
 'TREINAMENTO','AW139',3,datetime('now'),datetime('now')),

('LOFT-CHK-04','Briefing de Missão, TEM e Critérios de Decisão','PRE',
 'Briefing estruturado com definição de funções PF/PM, identificação de ameaças (terrain, clima, espaço aéreo), critérios de arremetida e desvio para alternado. Modelos TEM e FORDEC.',
 'TREINAMENTO','AW139',4,datetime('now'),datetime('now')),

('LOFT-CHK-05','Inspeção, Acionamento e Checklists','SOL',
 'Inspeção pré-voo externa e interna, acionamento dos motores e execução disciplinada dos checklists normais (desafio-resposta-verificação). Monitoramento de parâmetros de motor e sistemas. (Ref: QRH, Normal Procedures)',
 'TREINAMENTO','AW139',5,datetime('now'),datetime('now')),

('LOFT-CHK-06','Hover Check e Taxi IFR','SOL',
 'Verificação de margem de potência (PWR MGN), centragem de comandos e estabilidade em voo pairado; taxi em voo pairado até a posição de decolagem. (Ref: RFM, Cap. 4)',
 'TREINAMENTO','AW139',6,datetime('now'),datetime('now')),

('LOFT-CHK-07','Decolagem IFR — Perfil CAT A em IMC','SOL',
 'Execução do perfil de decolagem CAT A com saída IMC logo após o TO, capturando SID e transferência para instrumentos. Manutenção da trajetória de segurança e comunicações com ATC. (Ref: RFM, Cap. 4)',
 'TREINAMENTO','AW139',7,datetime('now'),datetime('now')),

('LOFT-CHK-08','OEI Pós-TDP — Fly-Away Monomotor IFR','EME',
 'Reação à falha de motor após o TDP em IMC: itens de memória (OEI PROC), trajetória fly-away monomotor, gestão de potência de contingência e comunicação Pan-Pan com ATC. (Ref: RFM, Cap. 3/4)',
 'TREINAMENTO','AW139',8,datetime('now'),datetime('now')),

('LOFT-CHK-09','Navegação IFR en Route e Gestão de FMS','VOO',
 'Condução do voo IFR em rota: gestão de waypoints, ETA, combustível, modos de automação (AP/FD) e coordenação com controle de tráfego aéreo. (Ref: EPIC Guide, Cap. 15)',
 'TREINAMENTO','AW139',9,datetime('now'),datetime('now')),

('LOFT-CHK-10','Monitoramento de Sistemas e Path Monitoring','VOO',
 'Vigilância mútua (PF/PM) sobre altitudes, velocidades e trajetória; monitoramento de integridade de instrumentos e sistemas críticos; comunicação assertiva de desvios.',
 'TREINAMENTO','AW139',10,datetime('now'),datetime('now')),

('LOFT-CHK-11','Gestão de Falha de Sistema em Rota','EME',
 'Identificação de falha (elétrica, hidráulica ou aviônica) em cruzeiro IFR: leitura de CAS/IED, itens de memória, uso do QRH e avaliação do impacto na continuidade do voo. (Ref: RFM, Cap. 3)',
 'TREINAMENTO','AW139',11,datetime('now'),datetime('now')),

('LOFT-CHK-12','Chegada STAR/RNAV e Descida para Aproximação','APR',
 'Execução do procedimento de chegada STAR RNAV: interceptação do segmento inicial, descida programada no FMS, speed/altitude constraints e configuração pré-aproximação.',
 'TREINAMENTO','AW139',12,datetime('now'),datetime('now')),

('LOFT-CHK-13','Procedimento de Espera IFR (Holding)','APR',
 'Execução de holding IFR com geometria e entradas corretas; gerenciamento de combustível e novo ETA; comunicação com ATC para autorização e saída do holding. (Ref: AIP Brasil)',
 'TREINAMENTO','AW139',13,datetime('now'),datetime('now')),

('LOFT-CHK-14','Aproximação Não-Precisão — RNAV ou VOR','APR',
 'Briefing, setup e execução da NPA: descida em degraus (step-down) ou CDFA até a MDA; vigilância de obstruções e monitoramento de CDI/desvios. Sem contato visual na MDA. (Ref: AIP/Carta IAP)',
 'TREINAMENTO','AW139',14,datetime('now'),datetime('now')),

('LOFT-CHK-15','Arremetida por Abaixo dos Mínimos (NPA)','APR',
 'Execução da arremetida instrumental ao atingir a MDA sem referências visuais: aplicação de potência de arremetida, subida estabilizada, procedimento APM e comunicação com ATC. (Ref: AIP)',
 'TREINAMENTO','AW139',15,datetime('now'),datetime('now')),

('LOFT-CHK-16','Tomada de Decisão e Desvio ao Alternado','CRM',
 'Aplicação de FORDEC após arremetida: avaliação de combustível vs. condições restantes, seleção do alternado, novo plano de voo e coordenação com ATC para o desvio.',
 'TREINAMENTO','AW139',16,datetime('now'),datetime('now')),

('LOFT-CHK-17','Setup e Briefing para ILS','APR',
 'Configuração e verificação do ILS (FREQ, CRS, DA, mínimos); briefing completo antes do IAF incluindo critérios para pouso, go-around e OEI. (Ref: AIP/Carta ILS)',
 'TREINAMENTO','AW139',17,datetime('now'),datetime('now')),

('LOFT-CHK-18','Aproximação ILS — Final e Decisão na DA','APR',
 'Execução da aproximação ILS: intercepção de localizer e glide slope, descida estabilizada; obtenção de referências visuais próximo à DA; pouso executado no alternado. (Ref: AIP)',
 'TREINAMENTO','AW139',18,datetime('now'),datetime('now')),

('LOFT-CHK-19','Pouso no Alternado e Procedimentos Pós-Voo','APR',
 'Pouso no aeródromo alternativo, checklists após pouso e pós-voo, encerramento do plano de voo IFR e comunicações finais com ATC. (Ref: QRH)',
 'TREINAMENTO','AW139',19,datetime('now'),datetime('now')),

('LOFT-CHK-20','Consciência Situacional e Gerenciamento de Ameaças','CRM',
 'Manutenção contínua da consciência situacional (SACO) ao longo do voo: awareness de posição, combustível, meteorologia e ameaças ativas; identificação e mitigação de erros.',
 'TREINAMENTO','AW139',20,datetime('now'),datetime('now')),

('LOFT-CHK-21','Comunicação ATC e Fraseologia ICAO/DECEA','CRM',
 'Uso consistente de fraseologia padrão ICAO/DECEA; readbacks corretos; comunicações em situações não normais (Pan-Pan, desvio); coordenação assertiva entre PF e PM ao longo do voo.',
 'TREINAMENTO','AW139',21,datetime('now'),datetime('now')),

('LOFT-CHK-22','Distribuição de Tarefas e Tomada de Decisão','CRM',
 'Gerenciamento eficaz da carga de trabalho em fases críticas do voo; aplicação de modelos de decisão estruturados (FORDEC); liderança situacional e assertividade em cenários adversos.',
 'TREINAMENTO','AW139',22,datetime('now'),datetime('now'));

-- ============================================================
-- 2. REMOVER LINKS ANTIGOS DOS MODELOS 27, 34 E 53
-- ============================================================

UPDATE modelos_sessao_manobras
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE modelo_id IN (27, 34, 53) AND deleted_at IS NULL;

-- ============================================================
-- 3. VINCULAR AS 22 NOVAS MANOBRAS AOS 3 MODELOS (todos AB)
-- ============================================================

-- Modelo 27 (AW139 - 12/12: LOFT E CHECK FINAL)
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-01' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-02' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-03' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-04' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-05' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-06' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-07' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-08' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-09' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-10' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-11' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-12' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-13' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-14' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-15' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-16' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-17' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-18' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-19' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-20' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-21' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 27, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-22' AND deleted_at IS NULL;

-- Modelo 34 (AW139 - PERIÓDICO - 04/04: LOFT e CHECK DE TIPO E IFR)
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-01' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-02' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-03' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-04' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-05' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-06' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-07' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-08' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-09' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-10' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-11' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-12' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-13' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-14' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-15' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-16' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-17' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-18' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-19' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-20' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-21' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 34, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-22' AND deleted_at IS NULL;

-- Modelo 53 (AW139 - SEMESTRAL - 02/02: LOFT e CHECK DE IFR)
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-01' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-02' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-03' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-04' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-05' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-06' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-07' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-08' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-09' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-10' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-11' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-12' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-13' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-14' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-15' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-16' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-17' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-18' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-19' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-20' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-21' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante, created_at, updated_at)
SELECT 53, id, ordem, 1, 'AB', datetime('now'), datetime('now') FROM manobras WHERE codigo = 'LOFT-CHK-22' AND deleted_at IS NULL;

-- ============================================================
-- 4. APAGAR MANOBRAS LOFT (não-CHK) QUE NÃO ESTÃO MAIS EM USO
-- Mantém manobras usadas por qualquer modelo ainda ativo (51, 52, etc.)
-- ============================================================

UPDATE manobras
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE codigo LIKE 'LOFT-%'
  AND codigo NOT LIKE 'LOFT-CHK-%'
  AND deleted_at IS NULL
  AND id NOT IN (
    SELECT DISTINCT manobra_id
    FROM modelos_sessao_manobras
    WHERE deleted_at IS NULL
  );

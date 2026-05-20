-- Seed: AW139 - PERIÓDICO - 03/03: LOFT E CHECK FINAL
-- Cria categorias (Bloco A-F), 22 manobras e associações com modelo_sessao id=34

BEGIN TRANSACTION;

-- Categorias (Blocos)
INSERT INTO manobras_categorias (codigo, nome, descricao, cor, created_at, updated_at) VALUES
('BLOCO-A', 'Bloco A: Preparação e Planejamento', 'Preparação e planejamento', '#1f77b4', datetime('now'), datetime('now')),
('BLOCO-B', 'Bloco B: Operações de Solo e Decolagem', 'Operações de solo e decolagem', '#ff7f0e', datetime('now'), datetime('now')),
('BLOCO-C', 'Bloco C: Condução do Voo e Automação', 'Condução do voo e uso de automação', '#2ca02c', datetime('now'), datetime('now')),
('BLOCO-D', 'Bloco D: Gestão de Falhas e Emergências (LOFT Trigger)', 'Gestão de falhas e emergências', '#d62728', datetime('now'), datetime('now')),
('BLOCO-E', 'Bloco E: Aproximação e Pouso', 'Aproximação e técnica de pouso', '#9467bd', datetime('now'), datetime('now')),
('BLOCO-F', 'Bloco F: Debriefing e CRM Geral', 'Debriefing e CRM', '#8c564b', datetime('now'), datetime('now'));

-- Manobras (ordem conforme pedido)
INSERT INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem, created_at, updated_at) VALUES
('A01','Cálculo de Performance (RFM Cap. 5)','Precisão na determinação do MTOW para as condições de pressão/temperatura e perfil de decolagem (Clear Area / Helideck).','BLOCO-A','PER','AW139',1,datetime('now'),datetime('now')),
('A02','Análise de Clima e NOTAM','Antecipação de restrições operacionais e escolha de alternativas baseadas nos mínimos da empresa e aeronave.','BLOCO-A','PER','AW139',2,datetime('now'),datetime('now')),
('A03','Configuração de Aviônica (FMS/EPIC)','Inicialização correta do sistema, inserção de pesos (ZFW), combustível e plano de voo sem erros de digitação.','BLOCO-A','PER','AW139',3,datetime('now'),datetime('now')),
('A04','Briefing de Partida (Departure Briefing)','Clareza na definição de quem voa (PF) e quem monitora (PM), e ações em caso de falha de motor antes/após o TDP.','BLOCO-A','PER','AW139',4,datetime('now'),datetime('now')),

('B01','Disciplina de Checklist','Execução de checklists normais de forma ritmada, garantindo que nenhum item seja "cantado" sem verificação real.','BLOCO-B','PER','AW139',5,datetime('now'),datetime('now')),
('B02','Gerenciamento do AC/DC e Hidráulico','Monitoramento correto das cargas elétricas e pressões durante o acionamento e taxi. (Ref: Manual CEL Cap. 1).','BLOCO-B','PER','AW139',6,datetime('now'),datetime('now')),
('B03','Hover Check e Margem de Potência','Verificação de parâmetros (Tq, ITT, Ng) em voo pairado para confirmar se a performance real condiz com a planejada.','BLOCO-B','PER','AW139',7,datetime('now'),datetime('now')),
('B04','Perfil de Decolagem (CAT A / PC1 / PC2)','Precisão na trajetória de subida e transição para a velocidade de subida (Vy/Voss). (Ref: RFM Seção 4).','BLOCO-B','PER','AW139',8,datetime('now'),datetime('now')),

('C01','Uso dos Níveis de Automação (AFCS)','Seleção do modo apropriado para a fase do voo (ex: IAS/ALT vs. FPA/VS) e correto anúncio no FMA. (Ref: EPIC Guide Cap. 15).','BLOCO-C','PER','AW139',9,datetime('now'),datetime('now')),
('C02','Flight Path Monitoring','Capacidade do PM em monitorar a trajetória e "avisar" desvios antes que se tornem críticos.','BLOCO-C','PER','AW139',10,datetime('now'),datetime('now')),
('C03','Gestão do FMS em Rota','Capacidade de realizar mudanças de plano de voo ("Direct-to", inserção de pontos) de forma eficiente sob carga de trabalho.','BLOCO-C','PER','AW139',11,datetime('now'),datetime('now')),
('C04','Consciência Situacional (MFD/TAWS)','Uso efetivo do mapa, radar meteorológico e HTAWS para evitar terreno e áreas de mau tempo.','BLOCO-C','PER','AW139',12,datetime('now'),datetime('now')),

('D01','Identificação e Diagnóstico (CAS/IED)','Rapidez e precisão em identificar falhas através das mensagens CAS e instrumentos de backup.','BLOCO-D','PER','AW139',13,datetime('now'),datetime('now')),
('D02','Ações de Memória (Memory Items)','Execução correta das ações imediatas sem hesitação e sem consulta ao manual (ex: fogo ou falha crítica de motor).','BLOCO-D','PER','AW139',14,datetime('now'),datetime('now')),
('D03','Uso do QRH','Localização e aplicação correta dos procedimentos de emergência e malfunções. (Ref: QRH Virtual).','BLOCO-D','PER','AW139',15,datetime('now'),datetime('now')),
('D04','Tomada de Decisão (Decision Making)','Uso de ferramentas (ex: FORDEC) para decidir entre retorno, prosseguimento ou pouso imediato.','BLOCO-D','PER','AW139',16,datetime('now'),datetime('now')),
('D05','Gestão da Potência OEI (One Engine Inoperative)','Monitoramento dos limites de 2.5 min ou 30 min para evitar danos ao motor remanescente. (Ref: RFM Seção 3).','BLOCO-D','PER','AW139',17,datetime('now'),datetime('now')),

('E01','Briefing de Aproximação','Definição da estratégia de pouso (ex: Point-in-Space ou ARA) e critérios de arremetida (Missed Approach).','BLOCO-E','PER','AW139',18,datetime('now'),datetime('now')),
('E02','Estabilização da Aproximação','Manutenção de velocidades e razão de descida dentro dos limites de segurança até o ponto de toque.','BLOCO-E','PER','AW139',19,datetime('now'),datetime('now')),
('E03','Técnica de Pouso OEI (se aplicável)','Gerenciamento da redução de velocidade e aplicação de coletivo (cushion) no toque. (Ref: QRH OEI Landing).','BLOCO-E','PER','AW139',20,datetime('now'),datetime('now')),

('F01','Comunicação e Coordenação','Clareza no uso da fraseologia padrão e assertividade na comunicação entre a tripulação.','BLOCO-F','PER','AW139',21,datetime('now'),datetime('now')),
('F02','Autocrítica e Debriefing','Capacidade da tripulação de identificar seus próprios erros e áreas de melhoria após o término da missão.','BLOCO-F','PER','AW139',22,datetime('now'),datetime('now'));

-- Associa dinamicamente ao modelo (procura pelo nome exato da sessão)
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT ms.id, m.id, vals.ord, 1, datetime('now')
FROM modelos_sessao ms
JOIN (
	SELECT 'A01' as code, 1 as ord UNION ALL
	SELECT 'A02',2 UNION ALL
	SELECT 'A03',3 UNION ALL
	SELECT 'A04',4 UNION ALL
	SELECT 'B01',5 UNION ALL
	SELECT 'B02',6 UNION ALL
	SELECT 'B03',7 UNION ALL
	SELECT 'B04',8 UNION ALL
	SELECT 'C01',9 UNION ALL
	SELECT 'C02',10 UNION ALL
	SELECT 'C03',11 UNION ALL
	SELECT 'C04',12 UNION ALL
	SELECT 'D01',13 UNION ALL
	SELECT 'D02',14 UNION ALL
	SELECT 'D03',15 UNION ALL
	SELECT 'D04',16 UNION ALL
	SELECT 'D05',17 UNION ALL
	SELECT 'E01',18 UNION ALL
	SELECT 'E02',19 UNION ALL
	SELECT 'E03',20 UNION ALL
	SELECT 'F01',21 UNION ALL
	SELECT 'F02',22
) vals ON 1=1
JOIN manobras m ON m.codigo = vals.code
WHERE ms.nome = 'AW139 - PERIÓDICO - 03/03: LOFT E CHECK FINAL'
	AND ms.deleted_at IS NULL
	AND m.deleted_at IS NULL;

COMMIT;

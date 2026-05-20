-- Recode categories and manobras for AW139 periodic model
-- 1) Insert canonical categories (PRE, SOL, VOO, EME, APR, CRM)
INSERT OR IGNORE INTO manobras_categorias (codigo, nome, descricao, cor, created_at, updated_at)
VALUES
('PRE','Preparação e Planejamento (PRE)','Preparação e planejamento e análise pré-voo', '#1f77b4', datetime('now'), datetime('now')),
('SOL','Operações de Solo e Decolagem (SOL)','Operações de solo e procedimentos de decolagem', '#ff7f0e', datetime('now'), datetime('now')),
('VOO','Condução do Voo e Automação (VOO)','Condução do voo e uso de automação', '#2ca02c', datetime('now'), datetime('now')),
('EME','Gestão de Falhas e Emergências (EME)','Procedimentos de emergência e gestão de falhas', '#d62728', datetime('now'), datetime('now')),
('APR','Aproximação e Pouso (APR)','Aproximações e técnicas de pouso', '#9467bd', datetime('now'), datetime('now')),
('CRM','Debriefing e CRM Geral (CRM)','Comunicação, coordenação e debriefing', '#8c564b', datetime('now'), datetime('now'));

-- 2) Remove 'Bloco X: ' prefix from existing category names (if present)
UPDATE manobras_categorias SET nome = replace(nome, 'Bloco A: ', '') WHERE codigo = 'BLOCO-A';
UPDATE manobras_categorias SET nome = replace(nome, 'Bloco B: ', '') WHERE codigo = 'BLOCO-B';
UPDATE manobras_categorias SET nome = replace(nome, 'Bloco C: ', '') WHERE codigo = 'BLOCO-C';
UPDATE manobras_categorias SET nome = replace(nome, 'Bloco D: ', '') WHERE codigo = 'BLOCO-D';
UPDATE manobras_categorias SET nome = replace(nome, 'Bloco E: ', '') WHERE codigo = 'BLOCO-E';
UPDATE manobras_categorias SET nome = replace(nome, 'Bloco F: ', '') WHERE codigo = 'BLOCO-F';

-- 3) Update manobra records: set new codigo, categoria, nome and descricao according to mapping
-- PRE (4)
UPDATE manobras SET codigo='LOFT-PRE-01', categoria='PRE', nome='Cálculo de Performance', descricao='Precisão na determinação do peso máximo (MTOW) e velocidades críticas ($V_{oss}$, $V_1$, $V_2$) para as condições de pressão e temperatura, visando operação CAT A ou PC2 e conforme o perfil de decolagem. (RFM, Cap. 5)' WHERE codigo='A01' AND tipo_aeronave='AW139';
UPDATE manobras SET codigo='LOFT-PRE-02', categoria='PRE', nome='Análise de Clima e NOTAM', descricao='Avaliação crítica de restrições de rota, aeródromos e helipontos (offshore/onshore), integrando as limitações da aeronave e mínimos operacionais ao planejamento da missão.' WHERE codigo='A02' AND tipo_aeronave='AW139';
UPDATE manobras SET codigo='LOFT-PRE-03', categoria='PRE', nome='Configuração de Aviônica (FMS)', descricao='Inicialização do sistema Primus Epic, inserção correta do plano de voo, pesos ($ZFW$), combustível e configuração de sensores e rádios. (FMS Pilot''s Guide, Cap. 4)' WHERE codigo='A03' AND tipo_aeronave='AW139';
UPDATE manobras SET codigo='LOFT-PRE-04', categoria='PRE', nome='Briefing de Partida', descricao='Definição clara de funções entre PF (Pilot Flying) e PM (Pilot Monitoring), trajetórias de saída e ações coordenadas em caso de falha de motor antes ou após o TDP.' WHERE codigo='A04' AND tipo_aeronave='AW139';

-- SOL (4)
UPDATE manobras SET codigo='LOFT-SOL-01', categoria='SOL', nome='Disciplina de Checklist', descricao='Execução das listas de verificação normais de forma ritmada e disciplinada, garantindo a verificação real de cada item antes da resposta. (QRH, Normal Procedures)' WHERE codigo='B01' AND tipo_aeronave='AW139';
UPDATE manobras SET codigo='LOFT-SOL-02', categoria='SOL', nome='Monitoramento de Sistemas', descricao='Vigilância ativa dos parâmetros de motor ($T_q, ITT, N_g, N_f$) e sistemas elétrico/hidráulico durante o acionamento e táxi, identificando precocemente desvios de normalidade. (Manual CEL, Cap. 1)' WHERE codigo='B02' AND tipo_aeronave='AW139';
UPDATE manobras SET codigo='LOFT-SOL-03', categoria='SOL', nome='Hover Check', descricao='Verificação de margem de potência, centragem de comandos e estabilidade dos sistemas em voo pairado antes da transição para o voo à frente. (RFM, Seção 4)' WHERE codigo='B03' AND tipo_aeronave='AW139';
UPDATE manobras SET codigo='LOFT-SOL-04', categoria='SOL', nome='Perfil de Decolagem', descricao='Execução precisa da trajetória técnica (Vertical, Clear Area ou Helideck) mantendo as referências visuais e parâmetros de potência conforme planejado. (RFM, Seção 4)' WHERE codigo='B04' AND tipo_aeronave='AW139';

-- VOO (4)
UPDATE manobras SET codigo='LOFT-VOO-01', categoria='VOO', nome='Gerenciamento do AFCS', descricao='Uso correto dos níveis de automação e anúncio claro de cada mudança de modo no FMA (Flight Mode Annunciator). (EPIC Pilot’s Guide, Cap. 15)' WHERE codigo='C01' AND tipo_aeronave='AW139';
UPDATE manobras SET codigo='LOFT-VOO-02', categoria='VOO', nome='Flight Path Monitoring', descricao='Vigilância constante da trajetória pelo PM, alertando prontamente sobre desvios de altitude, curso ou velocidade em relação ao planejado.' WHERE codigo='C02' AND tipo_aeronave='AW139';
UPDATE manobras SET codigo='LOFT-VOO-03', categoria='VOO', nome='Navegação e FMS em Rota', descricao='Capacidade de realizar alterações táticas no plano de voo (Direct-to, inserção de pontos ou desvios) de forma eficiente. (FMS Pilot''s Guide, Cap. 9)' WHERE codigo='C03' AND tipo_aeronave='AW139';
UPDATE manobras SET codigo='LOFT-VOO-04', categoria='VOO', nome='Consciência Situacional', descricao='Uso efetivo das telas do MFD (Mapa, Radar Meteorológico e TAWS/HTAWS) para antecipar conflitos de terreno ou meteorologia. (EPIC Pilot''s Guide, Cap. 8 & 9)' WHERE codigo='C04' AND tipo_aeronave='AW139';

-- EME (5)
UPDATE manobras SET codigo='LOFT-EME-01', categoria='EME', nome='Identificação e Diagnóstico', descricao='Identificação correta e calma da falha através das mensagens CAS (Crew Alerting System) e instrumentos de apoio, evitando diagnósticos precipitados. (RFM, Seção 3)' WHERE codigo='D01' AND tipo_aeronave='AW139';
UPDATE manobras SET codigo='LOFT-EME-02', categoria='EME', nome='Ações de Memória', descricao='Execução imediata e coordenada dos itens de memória (Memory Items) para falhas críticas que exigem ação instantânea (ex: fogo ou falha total de AC). (RFM, Seção 3 / QRH)' WHERE codigo='D02' AND tipo_aeronave='AW139';
UPDATE manobras SET codigo='LOFT-EME-03', categoria='EME', nome='Aplicação do QRH', descricao='Localização rápida e execução precisa do procedimento de emergência ou malfunção conforme descrito no manual. (QRH Virtual)' WHERE codigo='D03' AND tipo_aeronave='AW139';
UPDATE manobras SET codigo='LOFT-EME-04', categoria='EME', nome='Tomada de Decisão', descricao='Uso de ferramentas estruturadas (ex: FORDEC) para avaliar o impacto da falha e decidir entre retornar, prosseguir ou pousar imediatamente.' WHERE codigo='D04' AND tipo_aeronave='AW139';
UPDATE manobras SET codigo='LOFT-EME-05', categoria='EME', nome='Gestão de Potência OEI', descricao='Monitoramento rigoroso dos limites de tempo e torque no motor remanescente (2.5 min / 30 min) para preservar a integridade do sistema. (RFM, Seção 3)' WHERE codigo='D05' AND tipo_aeronave='AW139';

-- APR (3)
UPDATE manobras SET codigo='LOFT-APR-01', categoria='APR', nome='Briefing de Aproximação', descricao='Revisão da estratégia de pouso, altitudes de segurança e critérios para arremetida (Go-Around) antes da fase final.' WHERE codigo='E01' AND tipo_aeronave='AW139';
UPDATE manobras SET codigo='LOFT-APR-02', categoria='APR', nome='Estabilização da Aproximação', descricao='Manutenção de trajetória, velocidade e razão de descida estabilizadas até o ponto de toque ou decisão.' WHERE codigo='E02' AND tipo_aeronave='AW139';
UPDATE manobras SET codigo='LOFT-APR-03', categoria='APR', nome='Técnica de Pouso OEI', descricao='Gerenciamento da trajetória de descida e aplicação coordenada de coletivo (cushion) para um toque seguro sob condição de motor inoperante. (QRH, OEI Landing)' WHERE codigo='E03' AND tipo_aeronave='AW139';

-- CRM (2)
UPDATE manobras SET codigo='LOFT-CRM-01', categoria='CRM', nome='Comunicação e Coordenação', descricao='Uso de fraseologia padrão, clareza na distribuição de tarefas e assertividade na troca de informações entre PF e PM.' WHERE codigo='F01' AND tipo_aeronave='AW139';
UPDATE manobras SET codigo='LOFT-CRM-02', categoria='CRM', nome='Autocrítica e Análise', descricao='Capacidade da tripulação de realizar um debriefing honesto, identificando erros e propondo melhorias para a segurança operacional.' WHERE codigo='F02' AND tipo_aeronave='AW139';

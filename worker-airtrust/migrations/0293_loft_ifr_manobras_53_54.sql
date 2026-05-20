-- Migration 0293: Novas manobras LOFT-IFR e composição dos modelos 34 e 53

-- 1. NOVAS MANOBRAS NA TABELA MESTRA
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem) VALUES ('LOFT-PRE-09', 'Planejamento IFR entre Aeródromos', 'PRE', 'Elaboração de plano de voo IFR, análise de cartas de saída (SID) e chegada (STAR) e cálculo de combustível regulamentar.', 'TREINAMENTO', 'AW139', 9);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem) VALUES ('LOFT-PRE-10', 'Seleção de Alternado IFR', 'PRE', 'Análise técnica dos mínimos meteorológicos para o aeródromo de alternativa e planejamento de rota de diversão.', 'TREINAMENTO', 'AW139', 10);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem) VALUES ('LOFT-PRE-11', 'FMS Setup IFR (Inter-Airports)', 'PRE', 'Programação completa da rota, incluindo trajetórias de aproximação de não-precisão e ILS no plano secundário.', 'TREINAMENTO', 'AW139', 11);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem) VALUES ('LOFT-PRE-12', 'Briefing IFR e Ameaças', 'PRE', 'Alinhamento de CRM com foco em gestão de automação, mínimos de aproximação e critérios de arremetida.', 'TREINAMENTO', 'AW139', 12);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem) VALUES ('LOFT-SOL-08', 'Decolagem IFR (Check de Perícia)', 'SOL', 'Execução de decolagem sob regras IFR, com transição imediata para o voo instrumental e cumprimento da SID.', 'TREINAMENTO', 'AW139', 8);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem) VALUES ('LOFT-VOO-08', 'Navegação IFR em Aerovia', 'VOO', 'Condução da aeronave em rotas ATS, cumprindo restrições de altitude, velocidade e reportes obrigatórios.', 'TREINAMENTO', 'AW139', 8);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem) VALUES ('LOFT-EME-08', 'Falha de Aviônica em IFR (MAU/DU)', 'EME', 'Reação à falha de uma unidade de aviônica (MAU ou Display Unit) em voo por instrumentos, gerenciando a perda de redundância.', 'TREINAMENTO', 'AW139', 8);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem) VALUES ('LOFT-APR-10', 'Setup de Aproximação NPA (RNAV/VOR)', 'APR', 'Configuração do FMS, seleção de sensores e briefing para aproximação de não-precisão.', 'TREINAMENTO', 'AW139', 10);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem) VALUES ('LOFT-APR-11', 'Execução de NPA até a MDA', 'APR', 'Condução da aeronave na descida final da aproximação de não-precisão, mantendo limites de erro e rampa estabilizada.', 'TREINAMENTO', 'AW139', 11);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem) VALUES ('LOFT-APR-12', 'Setup e Briefing ILS (Alternado)', 'APR', 'Configuração de frequências, curso e briefing para aproximação de precisão (ILS) com visibilidade nos mínimos.', 'TREINAMENTO', 'AW139', 12);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_sessao, tipo_aeronave, ordem) VALUES ('LOFT-APR-13', 'Execução de ILS até a DA/DH', 'APR', 'Pilotagem precisa no Localizer e Glideslope, mantendo a estabilização até o ponto de decisão sob condições meteorológicas críticas.', 'TREINAMENTO', 'AW139', 13);

-- 2. MODELO 34: AW139 - PERIÓDICO - 04/04: LOFT e CHECK DE TIPO E IFR
DELETE FROM modelos_sessao_manobras WHERE modelo_id = 34;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 1,  1 FROM manobras WHERE codigo = 'LOFT-PRE-09';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 2,  1 FROM manobras WHERE codigo = 'LOFT-PRE-10';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 3,  1 FROM manobras WHERE codigo = 'LOFT-PRE-11';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 4,  1 FROM manobras WHERE codigo = 'LOFT-PRE-12';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 5,  1 FROM manobras WHERE codigo = 'LOFT-SOL-01';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 6,  1 FROM manobras WHERE codigo = 'LOFT-SOL-08';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 7,  1 FROM manobras WHERE codigo = 'LOFT-VOO-01';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 8,  1 FROM manobras WHERE codigo = 'LOFT-VOO-02';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 9,  1 FROM manobras WHERE codigo = 'LOFT-VOO-08';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 10, 1 FROM manobras WHERE codigo = 'LOFT-EME-08';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 11, 1 FROM manobras WHERE codigo = 'LOFT-EME-01';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 12, 1 FROM manobras WHERE codigo = 'LOFT-EME-03';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 13, 1 FROM manobras WHERE codigo = 'LOFT-EME-06';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 14, 1 FROM manobras WHERE codigo = 'LOFT-APR-10';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 15, 1 FROM manobras WHERE codigo = 'LOFT-APR-11';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 16, 1 FROM manobras WHERE codigo = 'LOFT-APR-07';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 17, 1 FROM manobras WHERE codigo = 'LOFT-APR-08';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 18, 1 FROM manobras WHERE codigo = 'LOFT-APR-12';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 19, 1 FROM manobras WHERE codigo = 'LOFT-APR-13';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 20, 1 FROM manobras WHERE codigo = 'LOFT-APR-09';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 21, 1 FROM manobras WHERE codigo = 'LOFT-CRM-02';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 34, id, 22, 1 FROM manobras WHERE codigo = 'LOFT-CRM-03';

-- 3. MODELO 53: AW139 - SEMESTRAL - 02/02: LOFT e CHECK DE IFR
DELETE FROM modelos_sessao_manobras WHERE modelo_id = 53;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 1,  1 FROM manobras WHERE codigo = 'LOFT-PRE-09';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 2,  1 FROM manobras WHERE codigo = 'LOFT-PRE-10';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 3,  1 FROM manobras WHERE codigo = 'LOFT-PRE-11';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 4,  1 FROM manobras WHERE codigo = 'LOFT-PRE-12';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 5,  1 FROM manobras WHERE codigo = 'LOFT-SOL-01';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 6,  1 FROM manobras WHERE codigo = 'LOFT-SOL-08';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 7,  1 FROM manobras WHERE codigo = 'LOFT-VOO-01';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 8,  1 FROM manobras WHERE codigo = 'LOFT-VOO-02';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 9,  1 FROM manobras WHERE codigo = 'LOFT-VOO-08';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 10, 1 FROM manobras WHERE codigo = 'LOFT-EME-08';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 11, 1 FROM manobras WHERE codigo = 'LOFT-EME-01';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 12, 1 FROM manobras WHERE codigo = 'LOFT-EME-03';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 13, 1 FROM manobras WHERE codigo = 'LOFT-EME-06';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 14, 1 FROM manobras WHERE codigo = 'LOFT-APR-10';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 15, 1 FROM manobras WHERE codigo = 'LOFT-APR-11';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 16, 1 FROM manobras WHERE codigo = 'LOFT-APR-07';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 17, 1 FROM manobras WHERE codigo = 'LOFT-APR-08';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 18, 1 FROM manobras WHERE codigo = 'LOFT-APR-12';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 19, 1 FROM manobras WHERE codigo = 'LOFT-APR-13';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 20, 1 FROM manobras WHERE codigo = 'LOFT-APR-09';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 21, 1 FROM manobras WHERE codigo = 'LOFT-CRM-02';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) SELECT 53, id, 22, 1 FROM manobras WHERE codigo = 'LOFT-CRM-03';

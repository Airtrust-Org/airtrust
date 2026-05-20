-- =============================================================================
-- Migration 0296: Manobras e categorias para FAP 07 e FAP 13
--   Modelo 54 -> CHECK-TRIN-INSTRUTOR (TREINAMENTO DE INSTRUTOR DE VOO)
--   Modelo 55 -> CHECK-CRED-EXAMINADOR (CREDENCIAMENTO DE EXAMINADOR)
-- =============================================================================

-- 1. CATEGORIAS
INSERT OR IGNORE INTO manobras_categorias (nome, descricao, ordem, cor) VALUES
  ('INV/Exame Oral e Conhecimentos Tecnicos', 'Verificacao de conhecimentos teoricos e documentacao para instrucao de voo.', 10, '#3B82F6'),
  ('INV/Competencias de Instrucao de Voo', 'Habilidades pedagogicas e tecnicas de ensino em voo.', 20, '#10B981'),
  ('INV/Manobras e Emergencias', 'Instrucao e supervisao de manobras e procedimentos de emergencia.', 30, '#F59E0B'),
  ('INV/Gestao de Recursos e Seguranca', 'CRM, vigilancia e etica na instrucao de voo.', 40, '#8B5CF6'),
  ('EXA/Exame Oral e Regulamentacao', 'Conhecimento de normas de credenciamento e avaliacao aeronautica.', 50, '#3B82F6'),
  ('EXA/Procedimentos de Voo e NTS', 'Avaliacao de habilidades nao-tecnicas e procedimentos de voo.', 60, '#10B981'),
  ('EXA/Conducao e Julgamento do Exame', 'Planejamento, execucao e documentacao do exame de proficiencia.', 70, '#F59E0B'),
  ('EXA/Gestao Operacional e Etica', 'Imparcialidade, padronizacao e responsabilidade do examinador credenciado.', 80, '#8B5CF6');

-- 2. MANOBRAS FAP07 - INV/Exame Oral e Conhecimentos Tecnicos
INSERT OR IGNORE INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem) VALUES
  ('INV-CGE-01', 'Instrumentos, Equipamentos e Documentos', 'Verificacao do conhecimento sobre itens obrigatorios e documentacao requerida para a aeronave e para o voo.', 'INV/Exame Oral e Conhecimentos Tecnicos', 'CHECK', NULL, 1),
  ('INV-CGE-02', 'Conhecimentos Tecnicos e Sistemas', 'Dominio sobre o funcionamento, sistemas e limitacoes da aeronave, garantindo base teorica para o ensino.', 'INV/Exame Oral e Conhecimentos Tecnicos', 'CHECK', NULL, 2),
  ('INV-CGE-03', 'Procedimentos Normais e de Emergencia', 'Conhecimento profundo dos fluxos e listas de verificacao para operacao segura em todas as fases.', 'INV/Exame Oral e Conhecimentos Tecnicos', 'CHECK', NULL, 3),
  ('INV-CGE-04', 'Calculo de Peso, Balanceamento e Performance', 'Capacidade de explicar e demonstrar calculos de envelope, decolagem e pouso.', 'INV/Exame Oral e Conhecimentos Tecnicos', 'CHECK', NULL, 4),
  ('INV-CGE-05', 'Meteorologia e Informacoes Aeronauticas', 'Interpretacao de cartas, boletins e publicacoes (ROTAER, AIP, NOTAM) essenciais ao planejamento.', 'INV/Exame Oral e Conhecimentos Tecnicos', 'CHECK', NULL, 5);

-- 2b. INV/Competencias de Instrucao de Voo
INSERT OR IGNORE INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem) VALUES
  ('INV-INS-01', 'Planejar uma Instrucao de Voo', 'Elaboracao da licao de voo respeitando o curriculo e as necessidades de progresso do instruendo.', 'INV/Competencias de Instrucao de Voo', 'CHECK', NULL, 6),
  ('INV-INS-02', 'Realizar o Briefing da Instrucao', 'Definicao de objetivos, padroes de execucao, seguranca e gerenciamento de expectativas pre-voo.', 'INV/Competencias de Instrucao de Voo', 'CHECK', NULL, 7),
  ('INV-INS-03', 'Conduzir uma Instrucao de Voo', 'Habilidade de ensinar manobras e procedimentos mantendo a proficiencia e o controle da aeronave.', 'INV/Competencias de Instrucao de Voo', 'CHECK', NULL, 8),
  ('INV-INS-04', 'Gerenciar Erros em Voo', 'Identificacao de falhas cometidas pelo instruendo e aplicacao de intervencoes pedagogicas oportunas.', 'INV/Competencias de Instrucao de Voo', 'CHECK', NULL, 9),
  ('INV-INS-05', 'Realizar o Debriefing da Instrucao', 'Analise de desempenho pos-voo, destacando pontos fortes e areas que necessitam de treinamento adicional.', 'INV/Competencias de Instrucao de Voo', 'CHECK', NULL, 10),
  ('INV-INS-06', 'Realizar os Procedimentos Administrativos', 'Registro fiel do treinamento nas fichas de avaliacao e sistemas de controle da empresa.', 'INV/Competencias de Instrucao de Voo', 'CHECK', NULL, 11),
  ('INV-INS-07', 'Tecnica de Demonstracao de Manobras', 'Execucao de manobras padrao para servir de referencia visual ao aluno.', 'INV/Competencias de Instrucao de Voo', 'CHECK', NULL, 12),
  ('INV-INS-08', 'Supervisao e Transferencia de Comandos', 'Gerenciamento seguro da troca de controles entre instrutor e aluno (Hand-over).', 'INV/Competencias de Instrucao de Voo', 'CHECK', NULL, 13);

-- 2c. INV/Manobras e Emergencias
INSERT OR IGNORE INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem) VALUES
  ('INV-MAN-01', 'Instrucao de Pouso Forcado', 'Conducao e ensino de procedimentos de pouso de emergencia a partir de voo nivelado.', 'INV/Manobras e Emergencias', 'CHECK', NULL, 14),
  ('INV-MAN-02', 'Instrucao de Autorrotacao ou Falha de Motor', 'Ensino e supervisao de entradas e trajetorias em situacoes de perda de potencia.', 'INV/Manobras e Emergencias', 'CHECK', NULL, 15),
  ('INV-MAN-03', 'Gerenciamento de Falhas de Sistema', 'Instrucao sobre reacoes a malfuncoes eletricas, hidraulicas ou de avionica.', 'INV/Manobras e Emergencias', 'CHECK', NULL, 16),
  ('INV-MAN-04', 'Recuperacao de Atitudes Anormais', 'Ensino de tecnicas de recuperacao de controle sob referencias visuais ou instrumentos.', 'INV/Manobras e Emergencias', 'CHECK', NULL, 17);

-- 2d. INV/Gestao de Recursos e Seguranca
INSERT OR IGNORE INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem) VALUES
  ('INV-CRM-01', 'Vigilancia Efetiva e Seguranca', 'Manutencao da consciencia situacional e seguranca externa enquanto monitora o aluno.', 'INV/Gestao de Recursos e Seguranca', 'CHECK', NULL, 18),
  ('INV-CRM-02', 'Comunicacao Assertiva na Instrucao', 'Uso de linguagem clara, objetiva e padronizada para facilitar a compreensao do instruendo.', 'INV/Gestao de Recursos e Seguranca', 'CHECK', NULL, 19),
  ('INV-CRM-03', 'Lideranca e Gestao de Tarefas', 'Equilibrio entre pilotar, observar e ensinar de acordo com a carga de trabalho.', 'INV/Gestao de Recursos e Seguranca', 'CHECK', NULL, 20),
  ('INV-CRM-04', 'Postura e Etica do Instrutor', 'Atuacao como modelo de conduta, disciplina e respeito aos manuais operacionais.', 'INV/Gestao de Recursos e Seguranca', 'CHECK', NULL, 21),
  ('INV-CRM-05', 'Avaliacao de Criterios de Conclusao', 'Julgar se o instruendo atingiu o nivel de proficiencia exigido para cada etapa do treinamento.', 'INV/Gestao de Recursos e Seguranca', 'CHECK', NULL, 22);

-- 3. MANOBRAS FAP13 - EXA/Exame Oral e Regulamentacao
INSERT OR IGNORE INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem) VALUES
  ('EXA-CGE-01', 'Conhecimento da IS 00-002', 'Dominio das normas de credenciamento e padroes de avaliacao da autoridade aeronautica.', 'EXA/Exame Oral e Regulamentacao', 'CHECK', NULL, 1),
  ('EXA-CGE-02', 'Metodos de Avaliacao e Julgamento', 'Conhecimento tecnico sobre como avaliar competencias e identificar erros comuns dos candidatos.', 'EXA/Exame Oral e Regulamentacao', 'CHECK', NULL, 2),
  ('EXA-CGE-03', 'Conhecimento do SOP, MGO e Curriculos', 'Dominio dos manuais da empresa e curriculos de treinamento aplicaveis ao exame.', 'EXA/Exame Oral e Regulamentacao', 'CHECK', NULL, 3),
  ('EXA-CGE-04', 'Conhecimentos Tecnicos e Limitacoes', 'Profundidade tecnica sobre a aeronave para questionar e avaliar o candidato com precisao.', 'EXA/Exame Oral e Regulamentacao', 'CHECK', NULL, 4),
  ('EXA-CGE-05', 'Planejamento de Voo e Desempenho', 'Avaliacao da capacidade do candidato em preparar o voo e calcular performances de seguranca.', 'EXA/Exame Oral e Regulamentacao', 'CHECK', NULL, 5);

-- 3b. EXA/Procedimentos de Voo e NTS
INSERT OR IGNORE INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem) VALUES
  ('EXA-NTS-01', 'Manter uma Vigilancia Efetiva', 'Monitoramento constante do voo para garantir a seguranca enquanto avalia o desempenho.', 'EXA/Procedimentos de Voo e NTS', 'CHECK', NULL, 6),
  ('EXA-NTS-02', 'Manter Consciencia Situacional', 'Percepcao continua do cenario operacional e antecipacao de ameacas durante o exame.', 'EXA/Procedimentos de Voo e NTS', 'CHECK', NULL, 7),
  ('EXA-NTS-03', 'Avaliar Situacoes e Tomar Decisoes', 'Julgar se a logica de decisao do candidato e segura e fundamentada nos manuais.', 'EXA/Procedimentos de Voo e NTS', 'CHECK', NULL, 8),
  ('EXA-NTS-04', 'Definir Prioridades e Gerenciar Tarefas', 'Avaliacao da organizacao de cabine e fluxo de trabalho do examinando.', 'EXA/Procedimentos de Voo e NTS', 'CHECK', NULL, 9),
  ('EXA-NTS-05', 'Manter Comunicacoes e Relacoes Interpessoais', 'Julgamento da eficacia da coordenacao do candidato com tripulacao e orgaos externos.', 'EXA/Procedimentos de Voo e NTS', 'CHECK', NULL, 10),
  ('EXA-NTS-06', 'Reconhecer e Gerenciar Ameacas', 'Avaliacao do uso de TEM (Threat & Error Management) pelo candidato.', 'EXA/Procedimentos de Voo e NTS', 'CHECK', NULL, 11),
  ('EXA-NTS-07', 'Reconhecer e Gerenciar Erros', 'Verificacao da capacidade do candidato em identificar e mitigar os proprios desvios.', 'EXA/Procedimentos de Voo e NTS', 'CHECK', NULL, 12);

-- 3c. EXA/Conducao e Julgamento do Exame
INSERT OR IGNORE INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem) VALUES
  ('EXA-CND-01', 'Planejar um Exame de Proficiencia', 'Preparacao logistica e tecnica do cenario de exame para cobrir todos os itens da FAP.', 'EXA/Conducao e Julgamento do Exame', 'CHECK', NULL, 13),
  ('EXA-CND-02', 'Realizar o Briefing do Exame', 'Instrucao ao candidato sobre as regras, papeis de comando e criterios de aprovacao/reprovacao.', 'EXA/Conducao e Julgamento do Exame', 'CHECK', NULL, 14),
  ('EXA-CND-03', 'Conduzir um Exame de Proficiencia', 'Postura do examinador, insercao de panes e observacao tecnica durante o voo.', 'EXA/Conducao e Julgamento do Exame', 'CHECK', NULL, 15),
  ('EXA-CND-04', 'Determinar o Resultado do Exame', 'Julgamento final (S ou I) fundamentado nos criterios objetivos da IS e manuais da aeronave.', 'EXA/Conducao e Julgamento do Exame', 'CHECK', NULL, 16),
  ('EXA-CND-05', 'Realizar o Debriefing do Exame', 'Comunicacao do resultado ao candidato com feedback tecnico e justificativa das notas.', 'EXA/Conducao e Julgamento do Exame', 'CHECK', NULL, 17),
  ('EXA-CND-06', 'Realizar os Procedimentos Administrativos', 'Assinatura de registros, preenchimento de sistemas (SACI) e envio de dados a ANAC.', 'EXA/Conducao e Julgamento do Exame', 'CHECK', NULL, 18);

-- 3d. EXA/Gestao Operacional e Etica
INSERT OR IGNORE INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem) VALUES
  ('EXA-ETH-01', 'Imparcialidade e Isencao no Julgamento', 'Garantia de uma avaliacao tecnica livre de influencias externas ou favoritismos.', 'EXA/Gestao Operacional e Etica', 'CHECK', NULL, 19),
  ('EXA-ETH-02', 'Padronizacao Operacional', 'Aplicacao dos mesmos criterios de avaliacao para todos os candidatos de acordo com o padrao.', 'EXA/Gestao Operacional e Etica', 'CHECK', NULL, 20),
  ('EXA-ETH-03', 'Representatividade da Autoridade Aeronautica', 'Postura profissional adequada a funcao delegada pela ANAC.', 'EXA/Gestao Operacional e Etica', 'CHECK', NULL, 21),
  ('EXA-ETH-04', 'Gerenciamento de Panes e Riscos', 'Garantir que a proposta de falhas simuladas nao comprometa a seguranca real do voo.', 'EXA/Gestao Operacional e Etica', 'CHECK', NULL, 22);

-- 4. VINCULAR ao MODELO 54 (FAP07 - TREINAMENTO DE INSTRUTOR)
DELETE FROM modelos_sessao_manobras WHERE modelo_id = 54;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
  SELECT 54, id, ordem, 1 FROM manobras WHERE codigo IN (
    'INV-CGE-01','INV-CGE-02','INV-CGE-03','INV-CGE-04','INV-CGE-05',
    'INV-INS-01','INV-INS-02','INV-INS-03','INV-INS-04','INV-INS-05',
    'INV-INS-06','INV-INS-07','INV-INS-08',
    'INV-MAN-01','INV-MAN-02','INV-MAN-03','INV-MAN-04',
    'INV-CRM-01','INV-CRM-02','INV-CRM-03','INV-CRM-04','INV-CRM-05');

-- 5. VINCULAR ao MODELO 55 (FAP13 - CREDENCIAMENTO DE EXAMINADOR)
DELETE FROM modelos_sessao_manobras WHERE modelo_id = 55;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
  SELECT 55, id, ordem, 1 FROM manobras WHERE codigo IN (
    'EXA-CGE-01','EXA-CGE-02','EXA-CGE-03','EXA-CGE-04','EXA-CGE-05',
    'EXA-NTS-01','EXA-NTS-02','EXA-NTS-03','EXA-NTS-04','EXA-NTS-05',
    'EXA-NTS-06','EXA-NTS-07',
    'EXA-CND-01','EXA-CND-02','EXA-CND-03','EXA-CND-04','EXA-CND-05','EXA-CND-06',
    'EXA-ETH-01','EXA-ETH-02','EXA-ETH-03','EXA-ETH-04');

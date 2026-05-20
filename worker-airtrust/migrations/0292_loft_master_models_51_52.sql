-- Tabela mestra LOFT AW139 + composição das fichas 51 e 52

WITH categoria_seed(codigo, nome, descricao, ordem) AS (
  VALUES
    ('PRE', 'Preparação e Planejamento (PRE)', 'Preparação, performance, planejamento e briefing pré-voo.', 1),
    ('SOL', 'Operações de Solo e Decolagem (SOL)', 'Checks, monitoramento de sistemas, hover check e perfis de decolagem.', 2),
    ('VOO', 'Condução do Voo e Automação (VOO)', 'Gestão da automação, navegação e consciência situacional em voo.', 3),
    ('EME', 'Gestão de Falhas e Emergências (EME)', 'Diagnóstico, ações imediatas, QRH e decisão operacional.', 4),
    ('APR', 'Aproximação e Pouso (APR)', 'Briefing, estabilização, arremetida, alternado e pouso.', 5),
    ('CRM', 'Gestão de Recursos de Tripulação (CRM)', 'Comunicação, carga de trabalho e debriefing.', 6)
)
UPDATE manobras_categorias
SET
  nome = (SELECT s.nome FROM categoria_seed s WHERE s.codigo = manobras_categorias.codigo),
  descricao = (SELECT s.descricao FROM categoria_seed s WHERE s.codigo = manobras_categorias.codigo),
  ordem = (SELECT s.ordem FROM categoria_seed s WHERE s.codigo = manobras_categorias.codigo),
  ativo = 1,
  deleted_at = NULL,
  updated_at = datetime('now')
WHERE codigo IN (SELECT codigo FROM categoria_seed);

WITH categoria_seed(codigo, nome, descricao, ordem) AS (
  VALUES
    ('PRE', 'Preparação e Planejamento (PRE)', 'Preparação, performance, planejamento e briefing pré-voo.', 1),
    ('SOL', 'Operações de Solo e Decolagem (SOL)', 'Checks, monitoramento de sistemas, hover check e perfis de decolagem.', 2),
    ('VOO', 'Condução do Voo e Automação (VOO)', 'Gestão da automação, navegação e consciência situacional em voo.', 3),
    ('EME', 'Gestão de Falhas e Emergências (EME)', 'Diagnóstico, ações imediatas, QRH e decisão operacional.', 4),
    ('APR', 'Aproximação e Pouso (APR)', 'Briefing, estabilização, arremetida, alternado e pouso.', 5),
    ('CRM', 'Gestão de Recursos de Tripulação (CRM)', 'Comunicação, carga de trabalho e debriefing.', 6)
)
INSERT INTO manobras_categorias (
  codigo,
  nome,
  descricao,
  ordem,
  ativo,
  created_at,
  updated_at
)
SELECT
  codigo,
  nome,
  descricao,
  ordem,
  1,
  datetime('now'),
  datetime('now')
FROM categoria_seed s
WHERE NOT EXISTS (
  SELECT 1
  FROM manobras_categorias c
  WHERE c.codigo = s.codigo
);

WITH manobra_seed(codigo, nome, descricao, categoria, ordem) AS (
  VALUES
    ('LOFT-PRE-01', 'Performance Diurna CAT A/PC1', 'Cálculo de pesos e velocidades ($V_{toss}, V_1, V_2$) para decolagem e pouso offshore em condições diurnas. (Ref: RFM, Cap. 5)', 'PRE', 1),
    ('LOFT-PRE-02', 'Planejamento Rota/Clima Diurno', 'Análise de tetos, visibilidade e Sea State para operação offshore diurna.', 'PRE', 2),
    ('LOFT-PRE-03', 'Configuração FMS Diurna', 'Programação da rota offshore e cálculo de combustível Bingo para missão diurna.', 'PRE', 3),
    ('LOFT-PRE-04', 'Briefing de Missão Diurno', 'Alinhamento de funções e ameaças focado em helideck e operação visual diurna.', 'PRE', 4),
    ('LOFT-PRE-05', 'Performance Noturna CAT A/PC1', 'Cálculo de performance focando em pesos e limitações para operação noturna IFR. (Ref: RFM, Cap. 5)', 'PRE', 5),
    ('LOFT-PRE-06', 'Planejamento Noturno e Alternado', 'Análise de mínimos noturnos, iluminação de helidecks e requisitos de combustível para aeródromo alternativo.', 'PRE', 6),
    ('LOFT-PRE-07', 'Configuração FMS Noturna', 'Programação de rota IFR, planos secundários para alternado e auxílios rádio noturnos.', 'PRE', 7),
    ('LOFT-PRE-08', 'Briefing de Missão Noturno', 'Foco em ilusões visuais noturnas, "Black Hole Effect" e critérios de arremetida IFR.', 'PRE', 8),

    ('LOFT-SOL-01', 'Disciplina de Checklist', 'Execução padronizada das listas de verificação normais conforme o QRH (Item comum).', 'SOL', 9),
    ('LOFT-SOL-02', 'Monitoramento de Sistemas', 'Vigilância de parâmetros de motor e sistemas elétrico/hidráulico no solo (Item comum).', 'SOL', 10),
    ('LOFT-SOL-03', 'Hover Check Diurno', 'Verificação de potência e comandos no pairado antes da partida offshore diurna.', 'SOL', 11),
    ('LOFT-SOL-04', 'Decolagem Técnica Diurna', 'Execução do perfil CAT A (Vertical/Clear Area) em aeródromo costeiro diurno.', 'SOL', 12),
    ('LOFT-SOL-05', 'OEI Antes do TDP (Exercício)', 'Reação a falha de motor simulada antes do Ponto de Decisão, resultando em decolagem rejeitada na plataforma.', 'SOL', 13),
    ('LOFT-SOL-06', 'OEI Após o TDP (Exercício)', 'Execução de Fly-away monomotor após falha de motor ocorrida após o TDP em helideck.', 'SOL', 14),
    ('LOFT-SOL-07', 'Decolagem IFR Noturna', 'Execução de decolagem noturna com transição imediata e rigorosa para o voo por instrumentos.', 'SOL', 15),

    ('LOFT-VOO-01', 'Gestão de Automação', 'Seleção de níveis de automação e monitoramento de modos FD/FMA (Item comum).', 'VOO', 16),
    ('LOFT-VOO-02', 'Path Monitoring Noturno', 'Vigilância rigorosa de altitude e razão de descida para prevenção de desorientação espacial noturna.', 'VOO', 17),
    ('LOFT-VOO-03', 'Navegação Offshore Diurna', 'Condução do voo nos corredores offshore e gestão de combustível em cruzeiro diurno.', 'VOO', 18),
    ('LOFT-VOO-04', 'Radar e Situacional Diurno', 'Uso do Radar WX e TAWS para desvio de células meteorológicas em voo diurno.', 'VOO', 19),
    ('LOFT-VOO-05', 'Configuração de Cockpit Noturno', 'Ajuste técnico de luzes internas, externas e brilho das telas para otimização da visão externa noturna.', 'VOO', 20),
    ('LOFT-VOO-06', 'Navegação IFR Noturna', 'Gestão de navegação por instrumentos, cumprindo restrições de altitudes e aerovias noturnas.', 'VOO', 21),
    ('LOFT-VOO-07', 'Radar e Situacional Noturno', 'Monitoramento crítico de terreno (TAWS) e meteorologia em ambiente de escuridão total.', 'VOO', 22),

    ('LOFT-EME-01', 'Diagnóstico CAS e IED', 'Identificação precisa de mensagens de alerta e análise de instrumentos (Item comum).', 'EME', 23),
    ('LOFT-EME-02', 'Itens de Memória', 'Execução de ações imediatas para falhas críticas sem consulta ao manual (Item comum).', 'EME', 24),
    ('LOFT-EME-03', 'Uso do QRH', 'Localização e aplicação coordenada dos checklists de emergência (Item comum).', 'EME', 25),
    ('LOFT-EME-04', 'Gestão de Falha Hidráulica', 'Reação técnica à falha de um sistema hidráulico e decisão de pouso. (Ref: RFM, Cap. 3)', 'EME', 26),
    ('LOFT-EME-05', 'Gestão de Falha Elétrica', 'Reação à falha de gerador (GEN FAIL) em voo noturno e gestão de carga elétrica.', 'EME', 27),
    ('LOFT-EME-06', 'Tomada de Decisão (FORDEC)', 'Avaliação estruturada para decidir entre retorno, prosseguimento ou alternado (Item comum).', 'EME', 28),
    ('LOFT-EME-07', 'Gestão de Potência OEI', 'Respeito aos limites de 2.5 min e 30 min no motor remanescente. (Ref: RFM, Cap. 2)', 'EME', 29),

    ('LOFT-APR-01', 'Briefing Aproximação Diurno', 'Definição de rampa e critérios de arremetida monomotor para helideck diurno.', 'APR', 30),
    ('LOFT-APR-02', 'Estabilização Final', 'Manutenção de rampa e velocidade estabilizadas até o ponto de toque (Item comum).', 'APR', 31),
    ('LOFT-APR-03', 'Pouso Normal Helideck', 'Técnica de pouso em plataforma offshore com gerenciamento de vento diurno.', 'APR', 32),
    ('LOFT-APR-04', 'OEI Antes do LDP (Exercício)', 'Execução de arremetida monomotor na aproximação final para helideck.', 'APR', 33),
    ('LOFT-APR-05', 'OEI Após o LDP (Exercício)', 'Pouso monomotor "Committed" em plataforma após o ponto de decisão.', 'APR', 34),
    ('LOFT-APR-06', 'Briefing Aproximação Noturno', 'Definição de mínimos IFR e perfil de aproximação noturna para plataforma/aeródromo.', 'APR', 35),
    ('LOFT-APR-07', 'Arremetida Meteorológica', 'Execução de Missed Approach por teto/visibilidade abaixo dos mínimos no destino.', 'APR', 36),
    ('LOFT-APR-08', 'Navegação para Alternado', 'Condução segura da aeronave para o aeródromo alternativo após arremetida noturna.', 'APR', 37),
    ('LOFT-APR-09', 'Pouso no Alternado', 'Execução de pouso IFR estabilizado em aeródromo alternativo noturno.', 'APR', 38),

    ('LOFT-CRM-01', 'Comunicação e Fraseologia', 'Uso de fraseologia padrão e assertividade na troca de informações (Item comum).', 'CRM', 39),
    ('LOFT-CRM-02', 'Gestão de Carga de Trabalho', 'Distribuição eficiente de tarefas em cenários de alta pressão ou pane (Item comum).', 'CRM', 40),
    ('LOFT-CRM-03', 'Debriefing e Crítica', 'Análise de performance e lições aprendidas após a missão (Item comum).', 'CRM', 41)
)
UPDATE manobras
SET
  nome = (SELECT s.nome FROM manobra_seed s WHERE s.codigo = manobras.codigo),
  descricao = (SELECT s.descricao FROM manobra_seed s WHERE s.codigo = manobras.codigo),
  categoria = (SELECT s.categoria FROM manobra_seed s WHERE s.codigo = manobras.codigo),
  tipo_sessao = 'TREINAMENTO',
  tipo_aeronave = 'AW139',
  ordem = (SELECT s.ordem FROM manobra_seed s WHERE s.codigo = manobras.codigo),
  deleted_at = NULL,
  updated_at = datetime('now')
WHERE codigo IN (SELECT codigo FROM manobra_seed);

WITH manobra_seed(codigo, nome, descricao, categoria, ordem) AS (
  VALUES
    ('LOFT-PRE-01', 'Performance Diurna CAT A/PC1', 'Cálculo de pesos e velocidades ($V_{toss}, V_1, V_2$) para decolagem e pouso offshore em condições diurnas. (Ref: RFM, Cap. 5)', 'PRE', 1),
    ('LOFT-PRE-02', 'Planejamento Rota/Clima Diurno', 'Análise de tetos, visibilidade e Sea State para operação offshore diurna.', 'PRE', 2),
    ('LOFT-PRE-03', 'Configuração FMS Diurna', 'Programação da rota offshore e cálculo de combustível Bingo para missão diurna.', 'PRE', 3),
    ('LOFT-PRE-04', 'Briefing de Missão Diurno', 'Alinhamento de funções e ameaças focado em helideck e operação visual diurna.', 'PRE', 4),
    ('LOFT-PRE-05', 'Performance Noturna CAT A/PC1', 'Cálculo de performance focando em pesos e limitações para operação noturna IFR. (Ref: RFM, Cap. 5)', 'PRE', 5),
    ('LOFT-PRE-06', 'Planejamento Noturno e Alternado', 'Análise de mínimos noturnos, iluminação de helidecks e requisitos de combustível para aeródromo alternativo.', 'PRE', 6),
    ('LOFT-PRE-07', 'Configuração FMS Noturna', 'Programação de rota IFR, planos secundários para alternado e auxílios rádio noturnos.', 'PRE', 7),
    ('LOFT-PRE-08', 'Briefing de Missão Noturno', 'Foco em ilusões visuais noturnas, "Black Hole Effect" e critérios de arremetida IFR.', 'PRE', 8),
    ('LOFT-SOL-01', 'Disciplina de Checklist', 'Execução padronizada das listas de verificação normais conforme o QRH (Item comum).', 'SOL', 9),
    ('LOFT-SOL-02', 'Monitoramento de Sistemas', 'Vigilância de parâmetros de motor e sistemas elétrico/hidráulico no solo (Item comum).', 'SOL', 10),
    ('LOFT-SOL-03', 'Hover Check Diurno', 'Verificação de potência e comandos no pairado antes da partida offshore diurna.', 'SOL', 11),
    ('LOFT-SOL-04', 'Decolagem Técnica Diurna', 'Execução do perfil CAT A (Vertical/Clear Area) em aeródromo costeiro diurno.', 'SOL', 12),
    ('LOFT-SOL-05', 'OEI Antes do TDP (Exercício)', 'Reação a falha de motor simulada antes do Ponto de Decisão, resultando em decolagem rejeitada na plataforma.', 'SOL', 13),
    ('LOFT-SOL-06', 'OEI Após o TDP (Exercício)', 'Execução de Fly-away monomotor após falha de motor ocorrida após o TDP em helideck.', 'SOL', 14),
    ('LOFT-SOL-07', 'Decolagem IFR Noturna', 'Execução de decolagem noturna com transição imediata e rigorosa para o voo por instrumentos.', 'SOL', 15),
    ('LOFT-VOO-01', 'Gestão de Automação', 'Seleção de níveis de automação e monitoramento de modos FD/FMA (Item comum).', 'VOO', 16),
    ('LOFT-VOO-02', 'Path Monitoring Noturno', 'Vigilância rigorosa de altitude e razão de descida para prevenção de desorientação espacial noturna.', 'VOO', 17),
    ('LOFT-VOO-03', 'Navegação Offshore Diurna', 'Condução do voo nos corredores offshore e gestão de combustível em cruzeiro diurno.', 'VOO', 18),
    ('LOFT-VOO-04', 'Radar e Situacional Diurno', 'Uso do Radar WX e TAWS para desvio de células meteorológicas em voo diurno.', 'VOO', 19),
    ('LOFT-VOO-05', 'Configuração de Cockpit Noturno', 'Ajuste técnico de luzes internas, externas e brilho das telas para otimização da visão externa noturna.', 'VOO', 20),
    ('LOFT-VOO-06', 'Navegação IFR Noturna', 'Gestão de navegação por instrumentos, cumprindo restrições de altitudes e aerovias noturnas.', 'VOO', 21),
    ('LOFT-VOO-07', 'Radar e Situacional Noturno', 'Monitoramento crítico de terreno (TAWS) e meteorologia em ambiente de escuridão total.', 'VOO', 22),
    ('LOFT-EME-01', 'Diagnóstico CAS e IED', 'Identificação precisa de mensagens de alerta e análise de instrumentos (Item comum).', 'EME', 23),
    ('LOFT-EME-02', 'Itens de Memória', 'Execução de ações imediatas para falhas críticas sem consulta ao manual (Item comum).', 'EME', 24),
    ('LOFT-EME-03', 'Uso do QRH', 'Localização e aplicação coordenada dos checklists de emergência (Item comum).', 'EME', 25),
    ('LOFT-EME-04', 'Gestão de Falha Hidráulica', 'Reação técnica à falha de um sistema hidráulico e decisão de pouso. (Ref: RFM, Cap. 3)', 'EME', 26),
    ('LOFT-EME-05', 'Gestão de Falha Elétrica', 'Reação à falha de gerador (GEN FAIL) em voo noturno e gestão de carga elétrica.', 'EME', 27),
    ('LOFT-EME-06', 'Tomada de Decisão (FORDEC)', 'Avaliação estruturada para decidir entre retorno, prosseguimento ou alternado (Item comum).', 'EME', 28),
    ('LOFT-EME-07', 'Gestão de Potência OEI', 'Respeito aos limites de 2.5 min e 30 min no motor remanescente. (Ref: RFM, Cap. 2)', 'EME', 29),
    ('LOFT-APR-01', 'Briefing Aproximação Diurno', 'Definição de rampa e critérios de arremetida monomotor para helideck diurno.', 'APR', 30),
    ('LOFT-APR-02', 'Estabilização Final', 'Manutenção de rampa e velocidade estabilizadas até o ponto de toque (Item comum).', 'APR', 31),
    ('LOFT-APR-03', 'Pouso Normal Helideck', 'Técnica de pouso em plataforma offshore com gerenciamento de vento diurno.', 'APR', 32),
    ('LOFT-APR-04', 'OEI Antes do LDP (Exercício)', 'Execução de arremetida monomotor na aproximação final para helideck.', 'APR', 33),
    ('LOFT-APR-05', 'OEI Após o LDP (Exercício)', 'Pouso monomotor "Committed" em plataforma após o ponto de decisão.', 'APR', 34),
    ('LOFT-APR-06', 'Briefing Aproximação Noturno', 'Definição de mínimos IFR e perfil de aproximação noturna para plataforma/aeródromo.', 'APR', 35),
    ('LOFT-APR-07', 'Arremetida Meteorológica', 'Execução de Missed Approach por teto/visibilidade abaixo dos mínimos no destino.', 'APR', 36),
    ('LOFT-APR-08', 'Navegação para Alternado', 'Condução segura da aeronave para o aeródromo alternativo após arremetida noturna.', 'APR', 37),
    ('LOFT-APR-09', 'Pouso no Alternado', 'Execução de pouso IFR estabilizado em aeródromo alternativo noturno.', 'APR', 38),
    ('LOFT-CRM-01', 'Comunicação e Fraseologia', 'Uso de fraseologia padrão e assertividade na troca de informações (Item comum).', 'CRM', 39),
    ('LOFT-CRM-02', 'Gestão de Carga de Trabalho', 'Distribuição eficiente de tarefas em cenários de alta pressão ou pane (Item comum).', 'CRM', 40),
    ('LOFT-CRM-03', 'Debriefing e Crítica', 'Análise de performance e lições aprendidas após a missão (Item comum).', 'CRM', 41)
)
INSERT INTO manobras (
  codigo,
  nome,
  descricao,
  categoria,
  tipo_sessao,
  tipo_aeronave,
  ordem,
  created_at,
  updated_at
)
SELECT
  codigo,
  nome,
  descricao,
  categoria,
  'TREINAMENTO',
  'AW139',
  ordem,
  datetime('now'),
  datetime('now')
FROM manobra_seed s
WHERE NOT EXISTS (
  SELECT 1
  FROM manobras m
  WHERE m.codigo = s.codigo
);

UPDATE modelos_sessao_manobras
SET
  deleted_at = datetime('now'),
  updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND modelo_id IN (51, 52);

WITH ficha_seed(modelo_id, codigo, ordem) AS (
  VALUES
    (51, 'LOFT-PRE-01', 1),
    (51, 'LOFT-PRE-02', 2),
    (51, 'LOFT-PRE-03', 3),
    (51, 'LOFT-PRE-04', 4),
    (51, 'LOFT-SOL-01', 5),
    (51, 'LOFT-SOL-02', 6),
    (51, 'LOFT-SOL-03', 7),
    (51, 'LOFT-SOL-04', 8),
    (51, 'LOFT-VOO-01', 9),
    (51, 'LOFT-VOO-03', 10),
    (51, 'LOFT-VOO-04', 11),
    (51, 'LOFT-EME-01', 12),
    (51, 'LOFT-EME-02', 13),
    (51, 'LOFT-EME-03', 14),
    (51, 'LOFT-EME-04', 15),
    (51, 'LOFT-EME-07', 16),
    (51, 'LOFT-APR-01', 17),
    (51, 'LOFT-APR-03', 18),
    (51, 'LOFT-SOL-05', 19),
    (51, 'LOFT-SOL-06', 20),
    (51, 'LOFT-CRM-01', 21),
    (51, 'LOFT-CRM-03', 22),

    (52, 'LOFT-PRE-05', 1),
    (52, 'LOFT-PRE-06', 2),
    (52, 'LOFT-PRE-07', 3),
    (52, 'LOFT-PRE-08', 4),
    (52, 'LOFT-SOL-01', 5),
    (52, 'LOFT-SOL-02', 6),
    (52, 'LOFT-SOL-07', 7),
    (52, 'LOFT-VOO-01', 8),
    (52, 'LOFT-VOO-02', 9),
    (52, 'LOFT-VOO-05', 10),
    (52, 'LOFT-VOO-06', 11),
    (52, 'LOFT-VOO-07', 12),
    (52, 'LOFT-EME-01', 13),
    (52, 'LOFT-EME-02', 14),
    (52, 'LOFT-EME-03', 15),
    (52, 'LOFT-EME-05', 16),
    (52, 'LOFT-EME-06', 17),
    (52, 'LOFT-APR-06', 18),
    (52, 'LOFT-APR-07', 19),
    (52, 'LOFT-APR-08', 20),
    (52, 'LOFT-CRM-01', 21),
    (52, 'LOFT-CRM-02', 22)
)
UPDATE modelos_sessao_manobras
SET
  ordem = (
    SELECT s.ordem
    FROM ficha_seed s
    JOIN manobras m ON m.codigo = s.codigo
    WHERE s.modelo_id = modelos_sessao_manobras.modelo_id
      AND m.id = modelos_sessao_manobras.manobra_id
  ),
  obrigatoria = 1,
  deleted_at = NULL,
  updated_at = datetime('now')
WHERE EXISTS (
  SELECT 1
  FROM ficha_seed s
  JOIN manobras m ON m.codigo = s.codigo
  WHERE s.modelo_id = modelos_sessao_manobras.modelo_id
    AND m.id = modelos_sessao_manobras.manobra_id
);

WITH ficha_seed(modelo_id, codigo, ordem) AS (
  VALUES
    (51, 'LOFT-PRE-01', 1),
    (51, 'LOFT-PRE-02', 2),
    (51, 'LOFT-PRE-03', 3),
    (51, 'LOFT-PRE-04', 4),
    (51, 'LOFT-SOL-01', 5),
    (51, 'LOFT-SOL-02', 6),
    (51, 'LOFT-SOL-03', 7),
    (51, 'LOFT-SOL-04', 8),
    (51, 'LOFT-VOO-01', 9),
    (51, 'LOFT-VOO-03', 10),
    (51, 'LOFT-VOO-04', 11),
    (51, 'LOFT-EME-01', 12),
    (51, 'LOFT-EME-02', 13),
    (51, 'LOFT-EME-03', 14),
    (51, 'LOFT-EME-04', 15),
    (51, 'LOFT-EME-07', 16),
    (51, 'LOFT-APR-01', 17),
    (51, 'LOFT-APR-03', 18),
    (51, 'LOFT-SOL-05', 19),
    (51, 'LOFT-SOL-06', 20),
    (51, 'LOFT-CRM-01', 21),
    (51, 'LOFT-CRM-03', 22),

    (52, 'LOFT-PRE-05', 1),
    (52, 'LOFT-PRE-06', 2),
    (52, 'LOFT-PRE-07', 3),
    (52, 'LOFT-PRE-08', 4),
    (52, 'LOFT-SOL-01', 5),
    (52, 'LOFT-SOL-02', 6),
    (52, 'LOFT-SOL-07', 7),
    (52, 'LOFT-VOO-01', 8),
    (52, 'LOFT-VOO-02', 9),
    (52, 'LOFT-VOO-05', 10),
    (52, 'LOFT-VOO-06', 11),
    (52, 'LOFT-VOO-07', 12),
    (52, 'LOFT-EME-01', 13),
    (52, 'LOFT-EME-02', 14),
    (52, 'LOFT-EME-03', 15),
    (52, 'LOFT-EME-05', 16),
    (52, 'LOFT-EME-06', 17),
    (52, 'LOFT-APR-06', 18),
    (52, 'LOFT-APR-07', 19),
    (52, 'LOFT-APR-08', 20),
    (52, 'LOFT-CRM-01', 21),
    (52, 'LOFT-CRM-02', 22)
)
INSERT INTO modelos_sessao_manobras (
  modelo_id,
  manobra_id,
  ordem,
  obrigatoria,
  created_at,
  updated_at
)
SELECT
  s.modelo_id,
  m.id,
  s.ordem,
  1,
  datetime('now'),
  datetime('now')
FROM ficha_seed s
JOIN manobras m ON m.codigo = s.codigo AND m.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM modelos_sessao_manobras msm
  WHERE msm.modelo_id = s.modelo_id
    AND msm.manobra_id = m.id
);

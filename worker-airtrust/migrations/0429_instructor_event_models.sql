-- Migration 0429: universaliza INST-E01/INST-E02 e adiciona metadados canônicos
-- das fichas de instrutor sem reescrever histórico.

CREATE TABLE IF NOT EXISTS fichas_sessao_instrutor_meta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ficha_id INTEGER NOT NULL UNIQUE,
  empresa_id INTEGER NOT NULL,
  equipamento_utilizado TEXT,
  dispositivo_identificacao TEXT,
  assento_instrucao_utilizado TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (ficha_id) REFERENCES fichas_sessao(id)
);

CREATE INDEX IF NOT EXISTS idx_fichas_sessao_instrutor_meta_empresa
  ON fichas_sessao_instrutor_meta (empresa_id, ficha_id);

UPDATE modelos_sessao
   SET ativo = 0,
       updated_at = datetime('now')
 WHERE codigo = 'TRE-INST'
   AND deleted_at IS NULL
   AND empresa_id <> 8;

INSERT INTO modelos_sessao (
  codigo, nome, tipo, descricao, ativo, duracao_estimada, tipo_aeronave,
  tipo_sessao_id, empresa_id, created_at, updated_at
)
SELECT
  'INST-E01',
  'Treinamento Prático de Instrutor 1/2 — Procedimentos Normais e Técnica de Instrução / Procedimentos Anormais e Gerenciamento do Erro',
  'RECORRENTE',
  'Treinamento prático universal de instrutor. Evento 1 de 2, 120 minutos, com 18 itens técnicos e 15 NOTECHS canônicos.',
  1,
  120,
  NULL,
  ms.tipo_sessao_id,
  ms.empresa_id,
  datetime('now'),
  datetime('now')
FROM modelos_sessao ms
WHERE ms.codigo = 'TRE-INST'
  AND ms.deleted_at IS NULL
  AND ms.empresa_id <> 8
  AND NOT EXISTS (
    SELECT 1
      FROM modelos_sessao novo
     WHERE novo.codigo = 'INST-E01'
       AND novo.empresa_id = ms.empresa_id
       AND novo.deleted_at IS NULL
  );

INSERT INTO modelos_sessao (
  codigo, nome, tipo, descricao, ativo, duracao_estimada, tipo_aeronave,
  tipo_sessao_id, empresa_id, created_at, updated_at
)
SELECT
  'INST-E02',
  'Treinamento Prático de Instrutor 2/2 — Emergências, Intervenção e Atuação Integrada do Instrutor',
  'RECORRENTE',
  'Treinamento prático universal de instrutor. Evento 2 de 2, 120 minutos, com 18 itens técnicos e 15 NOTECHS canônicos. Requer INST-E01 concluído.',
  1,
  120,
  NULL,
  ms.tipo_sessao_id,
  ms.empresa_id,
  datetime('now'),
  datetime('now')
FROM modelos_sessao ms
WHERE ms.codigo = 'TRE-INST'
  AND ms.deleted_at IS NULL
  AND ms.empresa_id <> 8
  AND NOT EXISTS (
    SELECT 1
      FROM modelos_sessao novo
     WHERE novo.codigo = 'INST-E02'
       AND novo.empresa_id = ms.empresa_id
       AND novo.deleted_at IS NULL
  );

WITH v(codigo, nome, descricao, ordem) AS (
  VALUES
    ('INST-E01-01', 'INV-PLN-01 — Planejamento e objetivos', 'Planejamento e definição dos objetivos da instrução.', 1),
    ('INST-E01-02', 'INV-EQP-01 — Conhecimento do equipamento', 'Conhecimento técnico, limitações, desempenho e procedimentos específicos do equipamento utilizado.', 2),
    ('INST-E01-03', 'INV-BRF-01 — Briefing da instrução', 'Briefing da instrução e definição dos papéis do instrutor-aluno, aluno simulado e instrutor supervisor.', 3),
    ('INST-E01-04', 'INV-SEA-01 — Assentos e comandos', 'Posicionamento nos assentos, responsabilidades e transferência de comandos.', 4),
    ('INST-E01-05', 'INV-DEM-01 — Técnica de instrução', 'Aplicação da técnica demonstração, explicação, prática e correção.', 5),
    ('INST-E01-06', 'INV-NRM-01 — Procedimentos normais', 'Ensino dos procedimentos normais e utilização da ECL aplicável.', 6),
    ('INST-E01-07', 'INV-FLT-01 — Condução normal', 'Ensino de táxi, pairado, decolagem e condução normal do voo.', 7),
    ('INST-E01-08', 'INV-APP-01 — Aproximação e pouso', 'Ensino de automação, aproximação, arremetida e pouso normal.', 8),
    ('INST-E01-09', 'INV-DBF-01 — Debriefing do bloco normal', 'Avaliação, debriefing e registro do bloco de procedimentos normais.', 9),
    ('INST-E01-10', 'INV-ANM-01 — Seleção da anormalidade', 'Seleção segura da anormalidade e definição das condições de entrada.', 10),
    ('INST-E01-11', 'INV-DGN-01 — Diagnóstico', 'Ensino do reconhecimento e diagnóstico da anormalidade.', 11),
    ('INST-E01-12', 'INV-MEM-01 — Ações imediatas', 'Ensino das ações imediatas e itens de memória aplicáveis.', 12),
    ('INST-E01-13', 'INV-ECL-01 — ECL/QRH coordenada', 'Utilização coordenada da ECL/QRH aplicável ao equipamento.', 13),
    ('INST-E01-14', 'INV-AUT-01 — Degradação de automação', 'Instrução com automação, instrumentos ou aviônicos degradados.', 14),
    ('INST-E01-15', 'INV-EQP-02 — Falha específica', 'Instrução de falha de sistema específica e aplicável ao equipamento utilizado.', 15),
    ('INST-E01-16', 'INV-ERR-01 — Identificação dos erros', 'Identificação dos erros, dificuldades e necessidades de treinamento do aluno.', 16),
    ('INST-E01-17', 'INV-INT-01 — Intervenção oportuna', 'Intervenção oportuna, transferência de comandos e retomada segura do cenário.', 17),
    ('INST-E01-18', 'INV-CRT-01 — Treinamento corretivo', 'Treinamento corretivo, debriefing e preenchimento da ficha de instrução.', 18)
)
INSERT INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem, empresa_id)
SELECT v.codigo, v.nome, v.descricao, 'INSTRUTOR-PRATICO', 'TREINAMENTO', NULL, v.ordem, base.empresa_id
FROM v
CROSS JOIN (
  SELECT DISTINCT empresa_id
  FROM modelos_sessao
  WHERE codigo = 'TRE-INST' AND deleted_at IS NULL AND empresa_id <> 8
) base
WHERE NOT EXISTS (
  SELECT 1 FROM manobras m
   WHERE m.codigo = v.codigo
     AND m.empresa_id = base.empresa_id
     AND m.deleted_at IS NULL
);

WITH v(codigo, nome, descricao, ordem) AS (
  VALUES
    ('INST-E02-01', 'INV-RSK-01 — Briefing de risco', 'Briefing de risco, limites do exercício e critérios de intervenção.', 1),
    ('INST-E02-02', 'INV-ENG-01 — Falha de motor', 'Instrução de falha de motor em fase crítica do voo.', 2),
    ('INST-E02-03', 'INV-TOF-01 — Decolagem rejeitada/continuada', 'Instrução de decolagem rejeitada ou continuada, conforme aplicável ao equipamento.', 3),
    ('INST-E02-04', 'INV-OEI-01 — Potência e limitações OEI', 'Gestão de potência, limitações OEI e margens de desempenho do equipamento utilizado.', 4),
    ('INST-E02-05', 'INV-OEI-02 — Condução OEI', 'Ensino da condução do voo com um motor inoperante.', 5),
    ('INST-E02-06', 'INV-OEI-03 — Aproximação OEI', 'Ensino de aproximação e arremetida OEI.', 6),
    ('INST-E02-07', 'INV-EMR-01 — Pouso de emergência', 'Ensino de pouso OEI, autorrotação ou procedimento de emergência equivalente aplicável ao equipamento utilizado.', 7),
    ('INST-E02-08', 'INV-INT-02 — Intervenção pelos assentos', 'Intervenção segura a partir dos assentos aplicáveis.', 8),
    ('INST-E02-09', 'INV-INT-03 — Consequências da intervenção', 'Reconhecimento das consequências de intervenção tardia, excessiva ou inadequada.', 9),
    ('INST-E02-10', 'INV-FSTD-01 — Operação da estação', 'Operação da estação do instrutor no FSTD.', 10),
    ('INST-E02-11', 'INV-FSTD-02 — Recuperação de cenário', 'Congelamento, reposicionamento, reinício e recuperação do cenário.', 11),
    ('INST-E02-12', 'INV-FSTD-03 — Sequenciamento de panes', 'Inserção e sequenciamento seguro de panes e condições operacionais.', 12),
    ('INST-E02-13', 'INV-SEA-02 — Condução no assento aplicável', 'Condução da instrução no assento aplicável ao equipamento utilizado.', 13),
    ('INST-E02-14', 'INV-MON-01 — Monitoramento do aluno', 'Monitoramento da trajetória, parâmetros, sistemas e carga de trabalho do aluno.', 14),
    ('INST-E02-15', 'INV-PRG-01 — Progressão incompatível', 'Identificação de desempenho ou progressão incompatível com a segurança.', 15),
    ('INST-E02-16', 'INV-REM-01 — Ação corretiva', 'Definição de ação corretiva para progresso insatisfatório.', 16),
    ('INST-E02-17', 'INV-INTG-01 — Instrução integrada', 'Condução integrada de uma instrução completa, do briefing ao debriefing.', 17),
    ('INST-E02-18', 'INV-EVA-01 — Avaliação final', 'Avaliação final, preenchimento da ficha e recomendação de progressão.', 18)
)
INSERT INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem, empresa_id)
SELECT v.codigo, v.nome, v.descricao, 'INSTRUTOR-PRATICO', 'TREINAMENTO', NULL, v.ordem, base.empresa_id
FROM v
CROSS JOIN (
  SELECT DISTINCT empresa_id
  FROM modelos_sessao
  WHERE codigo = 'TRE-INST' AND deleted_at IS NULL AND empresa_id <> 8
) base
WHERE NOT EXISTS (
  SELECT 1 FROM manobras m
   WHERE m.codigo = v.codigo
     AND m.empresa_id = base.empresa_id
     AND m.deleted_at IS NULL
);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante)
SELECT ms.id, m.id, m.ordem, 1, 'AB'
FROM modelos_sessao ms
JOIN manobras m
  ON m.codigo LIKE 'INST-E01-%'
 AND m.empresa_id = ms.empresa_id
 AND m.deleted_at IS NULL
WHERE ms.codigo = 'INST-E01'
  AND ms.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM modelos_sessao_manobras msm
     WHERE msm.modelo_id = ms.id
       AND msm.manobra_id = m.id
       AND msm.deleted_at IS NULL
  );

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante)
SELECT ms.id, m.id, m.ordem, 1, 'AB'
FROM modelos_sessao ms
JOIN manobras m
  ON m.codigo LIKE 'INST-E02-%'
 AND m.empresa_id = ms.empresa_id
 AND m.deleted_at IS NULL
WHERE ms.codigo = 'INST-E02'
  AND ms.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM modelos_sessao_manobras msm
     WHERE msm.modelo_id = ms.id
       AND msm.manobra_id = m.id
       AND msm.deleted_at IS NULL
  );

INSERT INTO modelos_sessao_requisitos (
  uuid,
  empresa_id,
  modelo_sessao_id,
  requisito_modelo_sessao_id,
  tipo_requisito,
  obrigatorio,
  observacao,
  created_at,
  updated_at
)
SELECT
  lower(hex(randomblob(16))),
  e2.empresa_id,
  e2.id,
  e1.id,
  'ETAPA_ANTERIOR',
  1,
  'INST-E02 requer INST-E01 concluído.',
  datetime('now'),
  datetime('now')
FROM modelos_sessao e2
JOIN modelos_sessao e1
  ON e1.codigo = 'INST-E01'
 AND e1.empresa_id = e2.empresa_id
 AND e1.deleted_at IS NULL
WHERE e2.codigo = 'INST-E02'
  AND e2.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
      FROM modelos_sessao_requisitos r
     WHERE r.modelo_sessao_id = e2.id
       AND r.requisito_modelo_sessao_id = e1.id
       AND r.tipo_requisito = 'ETAPA_ANTERIOR'
  );

-- Migration 0425: replace new examiner selection models with EXA-E01/EXA-E02
-- while preserving EXA-V01..EXA-V04 as historical/legacy rows, and add an
-- assignment lookup index for multi-segment shared-session fichas.

-- Fail early if there is no CRED-EXA anchor tenant.
CREATE TABLE IF NOT EXISTS _anchor_check (
  id INTEGER,
  cred_exa_tenant_anchor_present INTEGER DEFAULT 0 CHECK (cred_exa_tenant_anchor_present = 1)
);
INSERT INTO _anchor_check (id, cred_exa_tenant_anchor_present)
SELECT 1, CASE WHEN EXISTS (SELECT 1 FROM modelos_sessao WHERE codigo = 'CRED-EXA' AND deleted_at IS NULL) THEN 1 ELSE 0 END;
DROP TABLE _anchor_check;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fichas_sessao_empresa_atribuicao_curricular_ativa
  ON fichas_sessao (empresa_id, atribuicao_curricular_id)
  WHERE atribuicao_curricular_id IS NOT NULL
    AND deleted_at IS NULL;

UPDATE modelos_sessao
   SET ativo = 0,
       updated_at = datetime('now')
 WHERE codigo IN ('EXA-V01', 'EXA-V02', 'EXA-V03', 'EXA-V04')
   AND deleted_at IS NULL
   AND empresa_id IN (
       SELECT DISTINCT empresa_id 
       FROM modelos_sessao 
       WHERE codigo = 'CRED-EXA' AND deleted_at IS NULL
   );

INSERT INTO modelos_sessao (
  codigo, nome, tipo, descricao, ativo, duracao_estimada, tipo_aeronave,
  tipo_sessao_id, empresa_id, created_at, updated_at
)
SELECT
  'EXA-E01',
  'Treinamento Prático de Examinador 1/2 — SOP Normal e Condução Inicial / SOP Anormal e Avaliação',
  'RECORRENTE',
  'Treinamento prático interno de examinador. Evento 1 de 2, 120 minutos, com dois blocos: SOP normal e condução inicial; SOP anormal e avaliação. Mantém 18 itens técnicos e 15 NOTECHS canônicos. Não é FAP e não gera credenciamento ANAC.',
  1,
  120,
  NULL,
  (SELECT id FROM tipos_sessao WHERE codigo = 'EXA' AND empresa_id = cred.empresa_id AND deleted_at IS NULL LIMIT 1),
  cred.empresa_id,
  datetime('now'),
  datetime('now')
FROM (
  SELECT DISTINCT empresa_id FROM modelos_sessao WHERE codigo = 'CRED-EXA' AND deleted_at IS NULL
) AS cred
WHERE NOT EXISTS (SELECT 1 FROM modelos_sessao WHERE codigo = 'EXA-E01' AND empresa_id = cred.empresa_id AND deleted_at IS NULL);

INSERT INTO modelos_sessao (
  codigo, nome, tipo, descricao, ativo, duracao_estimada, tipo_aeronave,
  tipo_sessao_id, empresa_id, created_at, updated_at
)
SELECT
  'EXA-E02',
  'Treinamento Prático de Examinador 2/2 — Emergência, Intervenção e Segurança / Atuação Integrada do Examinador',
  'RECORRENTE',
  'Treinamento prático interno de examinador. Evento 2 de 2, 120 minutos, com dois blocos: emergência, intervenção e segurança; atuação integrada do examinador. Requer EXA-E01 concluído. Mantém 18 itens técnicos e 15 NOTECHS canônicos. Não é FAP e não gera credenciamento ANAC.',
  1,
  120,
  NULL,
  (SELECT id FROM tipos_sessao WHERE codigo = 'EXA' AND empresa_id = cred.empresa_id AND deleted_at IS NULL LIMIT 1),
  cred.empresa_id,
  datetime('now'),
  datetime('now')
FROM (
  SELECT DISTINCT empresa_id FROM modelos_sessao WHERE codigo = 'CRED-EXA' AND deleted_at IS NULL
) AS cred
WHERE NOT EXISTS (SELECT 1 FROM modelos_sessao WHERE codigo = 'EXA-E02' AND empresa_id = cred.empresa_id AND deleted_at IS NULL);

WITH v(codigo, nome, descricao, ordem) AS (
  VALUES
    ('EXA-E01-01', 'Seção 1.1 — Planejamento da sessão', 'Planejar a sessão do evento 1 segundo objetivo, padrão e tempo disponível.', 1),
    ('EXA-E01-02', 'Seção 1.2 — Briefing e critérios', 'Conduzir briefing inicial com papéis, limites e critérios de avaliação.', 2),
    ('EXA-E01-03', 'Seção 1.3 — Preparação do dispositivo', 'Preparar dispositivo, cenário e condições de início do evento.', 3),
    ('EXA-E01-04', 'Seção 1.4 — Condução inicial', 'Conduzir a etapa inicial do cenário conforme SOP aplicável.', 4),
    ('EXA-E01-05', 'Seção 1.5 — Transferência de controles', 'Estabelecer e observar a transferência/assunção de controles.', 5),
    ('EXA-E01-06', 'Seção 1.6 — Observação sem coaching', 'Observar o desempenho sem interferência indevida.', 6),
    ('EXA-E01-07', 'Seção 1.7 — Procedimentos normais', 'Avaliar execução dos procedimentos normais aplicáveis.', 7),
    ('EXA-E01-08', 'Seção 1.8 — ECL aplicável', 'Avaliar o uso correto da ECL, nunca QRH.', 8),
    ('EXA-E01-09', 'Seção 1.9 — Coordenação e comunicação', 'Avaliar coordenação, comunicação e distribuição de tarefas.', 9),
    ('EXA-E01-10', 'Seção 2.1 — Planejamento da anormalidade', 'Planejar condição anormal compatível com o objetivo do evento 1.', 10),
    ('EXA-E01-11', 'Seção 2.2 — Inserção da condição', 'Inserir a condição anormal no contexto e no momento adequados.', 11),
    ('EXA-E01-12', 'Seção 2.3 — Reconhecimento do desvio', 'Avaliar o reconhecimento adequado da condição e dos desvios.', 12),
    ('EXA-E01-13', 'Seção 2.4 — Sequência de procedimentos', 'Avaliar disciplina e ordem na execução dos procedimentos.', 13),
    ('EXA-E01-14', 'Seção 2.5 — Gerenciamento dos sistemas', 'Avaliar o gerenciamento dos sistemas afetados.', 14),
    ('EXA-E01-15', 'Seção 2.6 — Tomada de decisão', 'Avaliar decisões, prioridades e alternativas adotadas.', 15),
    ('EXA-E01-16', 'Seção 2.7 — Critérios de desempenho', 'Aplicar critérios uniformes e rastreáveis à avaliação.', 16),
    ('EXA-E01-17', 'Seção 2.8 — Debriefing objetivo', 'Conduzir debriefing baseado em evidências do evento 1.', 17),
    ('EXA-E01-18', 'Seção 2.9 — Registro interno', 'Preencher corretamente a ficha interna do evento 1.', 18)
)
INSERT INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem, empresa_id)
SELECT v.codigo, v.nome, v.descricao, 'EXAMINADOR-PRATICO', 'TREINAMENTO', NULL, v.ordem, cred.empresa_id
FROM v
CROSS JOIN (
  SELECT DISTINCT empresa_id FROM modelos_sessao WHERE codigo = 'CRED-EXA' AND deleted_at IS NULL
) AS cred
WHERE NOT EXISTS (
  SELECT 1 FROM manobras m2
  WHERE m2.codigo = v.codigo AND m2.empresa_id = cred.empresa_id AND m2.deleted_at IS NULL
);

WITH v(codigo, nome, descricao, ordem) AS (
  VALUES
    ('EXA-E02-01', 'Seção 1.1 — Planejamento da emergência', 'Planejar o cenário de emergência do evento 2 com riscos e limites claros.', 1),
    ('EXA-E02-02', 'Seção 1.2 — Preparação do IOS', 'Configurar o IOS e o cenário para execução segura.', 2),
    ('EXA-E02-03', 'Seção 1.3 — Briefing de segurança', 'Definir responsabilidades, limites e medidas de intervenção.', 3),
    ('EXA-E02-04', 'Seção 1.4 — Inserção da emergência', 'Inserir a emergência de forma segura e controlada.', 4),
    ('EXA-E02-05', 'Seção 1.5 — Ações imediatas', 'Avaliar reconhecimento e ações imediatas do examinando.', 5),
    ('EXA-E02-06', 'Seção 1.6 — Aplicação da ECL', 'Avaliar seleção e execução da ECL aplicável na emergência.', 6),
    ('EXA-E02-07', 'Seção 1.7 — Prioridades operacionais', 'Avaliar manutenção das prioridades operacionais e da segurança.', 7),
    ('EXA-E02-08', 'Seção 1.8 — Necessidade de intervenção', 'Reconhecer corretamente quando a intervenção se torna necessária.', 8),
    ('EXA-E02-09', 'Seção 1.9 — Assunção dos controles', 'Intervir e assumir os controles conforme situação e assento.', 9),
    ('EXA-E02-10', 'Seção 2.1 — Planejamento integrado', 'Planejar integralmente a avaliação do evento 2.', 10),
    ('EXA-E02-11', 'Seção 2.2 — Seleção de eventos', 'Selecionar eventos coerentes com os objetivos e padrões.', 11),
    ('EXA-E02-12', 'Seção 2.3 — Condução organizada', 'Conduzir o exame de forma ordenada e eficiente.', 12),
    ('EXA-E02-13', 'Seção 2.4 — Avaliação sem coaching', 'Avaliar sem orientar indevidamente o examinando.', 13),
    ('EXA-E02-14', 'Seção 2.5 — Aplicação dos padrões', 'Aplicar critérios consistentes ao desempenho observado.', 14),
    ('EXA-E02-15', 'Seção 2.6 — Resultado interno', 'Determinar o resultado interno conforme o padrão da empresa.', 15),
    ('EXA-E02-16', 'Seção 2.7 — Fundamentação do resultado', 'Justificar o resultado com evidências observáveis.', 16),
    ('EXA-E02-17', 'Seção 2.8 — Debriefing final', 'Conduzir debriefing estruturado e objetivo do evento 2.', 17),
    ('EXA-E02-18', 'Seção 2.9 — Encerramento da ficha', 'Concluir corretamente os registros internos do evento 2.', 18)
)
INSERT INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem, empresa_id)
SELECT v.codigo, v.nome, v.descricao, 'EXAMINADOR-PRATICO', 'TREINAMENTO', NULL, v.ordem, cred.empresa_id
FROM v
CROSS JOIN (
  SELECT DISTINCT empresa_id FROM modelos_sessao WHERE codigo = 'CRED-EXA' AND deleted_at IS NULL
) AS cred
WHERE NOT EXISTS (
  SELECT 1 FROM manobras m2
  WHERE m2.codigo = v.codigo AND m2.empresa_id = cred.empresa_id AND m2.deleted_at IS NULL
);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante)
SELECT ms.id, m.id, m.ordem, 1, 'AB'
FROM modelos_sessao ms
INNER JOIN manobras m
  ON m.codigo LIKE 'EXA-E01-%'
 AND m.empresa_id = ms.empresa_id
 AND m.deleted_at IS NULL
WHERE ms.codigo = 'EXA-E01'
  AND ms.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM modelos_sessao_manobras msm
    WHERE msm.modelo_id = ms.id
      AND msm.manobra_id = m.id
      AND msm.deleted_at IS NULL
  );

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante)
SELECT ms.id, m.id, m.ordem, 1, 'AB'
FROM modelos_sessao ms
INNER JOIN manobras m
  ON m.codigo LIKE 'EXA-E02-%'
 AND m.empresa_id = ms.empresa_id
 AND m.deleted_at IS NULL
WHERE ms.codigo = 'EXA-E02'
  AND ms.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM modelos_sessao_manobras msm
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
  'EXA-E02 requer EXA-E01 concluído.',
  datetime('now'),
  datetime('now')
FROM modelos_sessao e2
INNER JOIN modelos_sessao e1
  ON e1.codigo = 'EXA-E01'
 AND e1.empresa_id = e2.empresa_id
 AND e1.deleted_at IS NULL
WHERE e2.codigo = 'EXA-E02'
  AND e2.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM modelos_sessao_requisitos r
    WHERE r.modelo_sessao_id = e2.id
      AND r.requisito_modelo_sessao_id = e1.id
      AND r.tipo_requisito = 'ETAPA_ANTERIOR'
  );

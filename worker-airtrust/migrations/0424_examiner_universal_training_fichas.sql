-- Migration 0424: EXA-V01..V04 universal examiner practical training fichas.
--
-- Product decision: exactly four internal training fichas for the examiner's
-- practical training program (EXA-V01..EXA-V04). They are universal by
-- design — same 18 itens tecnicos + 15 NOTECHS canonicos regardless of the
-- aircraft used in the session (no AW139/S76 variants, no per-aircraft
-- codes). Equipment stays a session/scheduling metadata concern only, never
-- part of the curricular model or the ficha content.
--
-- These are NOT FAP13-CRED-* fichas, NOT ANAC credentialing, and do NOT
-- reuse or generate any FAP artifact. They do not touch the existing
-- CRED-EXA model or FAP13-CRED-* rows.
--
-- Tenant resolution (auditable, not guessed):
--   empresa_id is derived by natural key from the existing CRED-EXA
--   examiner-credentialing model (modelos_sessao.codigo = 'CRED-EXA'),
--   which is this codebase's own versioned precedent for examiner training.
--   Migration 0165_migrate_to_costa_do_sol.sql (line 46) and the documented
--   comment in 0394_tenant_scope_catalogos_f5.sql (line 10) both record,
--   in committed history, that the legacy simulator/manobras catalog
--   (including CRED-EXA) belongs to a single tenant: Costa do Sol,
--   empresa_id 6. This migration never hardcodes that literal — every
--   INSERT below re-derives empresa_id via SELECT keyed off CRED-EXA's own
--   codigo, so it stays correct if that lineage ever changes.
--
--   If CRED-EXA does not exist in a given database (fresh/empty install),
--   this migration REFUSES to proceed: the hard guard immediately below
--   raises a CHECK constraint failure and aborts before any INSERT runs.
--   A silent zero-rows "success" is exactly the failure mode this guard
--   exists to prevent — this migration must never report success while
--   creating none of EXA-V01..V04. It never falls back to empresa_id = 1
--   or 6 either; the only two outcomes are "all four models created for
--   CRED-EXA's tenant" or "migration fails loudly".
--
-- "Universal" here means universal across aircraft model within a tenant
-- (tipo_aeronave = NULL), never global across tenants — modelos_sessao.
-- empresa_id stays NOT NULL for every row this migration creates.
--
-- Aditiva por desenho:
-- - não converte, altera ou faz backfill de fichas/sessões históricas;
-- - não altera modelos_sessao, manobras ou requisitos existentes;
-- - não introduz DEFAULT em empresa_id;
-- - não cria FK cross-tenant (todo INSERT deriva empresa_id da mesma linha
--   pai já resolvida, nunca de um literal ou de outro tenant);
-- - idempotente: cada INSERT é guardado por NOT EXISTS, seguro para re-run.
--
-- Rollback manual local:
-- - DELETE FROM modelos_sessao_requisitos WHERE modelo_sessao_id IN (SELECT id FROM modelos_sessao WHERE codigo IN ('EXA-V01','EXA-V02','EXA-V03','EXA-V04'));
-- - DELETE FROM modelos_sessao_manobras WHERE modelo_id IN (SELECT id FROM modelos_sessao WHERE codigo IN ('EXA-V01','EXA-V02','EXA-V03','EXA-V04'));
-- - DELETE FROM manobras WHERE codigo LIKE 'EXA-V01-%' OR codigo LIKE 'EXA-V02-%' OR codigo LIKE 'EXA-V03-%' OR codigo LIKE 'EXA-V04-%';
-- - DELETE FROM modelos_sessao WHERE codigo IN ('EXA-V01','EXA-V02','EXA-V03','EXA-V04');
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
--   source_reference:
--     Produto: quatro fichas universais de treinamento prático de
--     examinador (EXA-V01..V04), especificação canônica em
--     docs/simulators/examiner-training-universal-fichas.md e
--     docs/simulators/examiner-training-universal-items.csv. Tenant
--     resolvido por precedente já existente no próprio repositório:
--     0165_migrate_to_costa_do_sol.sql:46 e
--     0394_tenant_scope_catalogos_f5.sql:10 (CRED-EXA / empresa_id 6).
--   operational_decision:
--     Seed é aditivo, idempotente (guardado por NOT EXISTS) e nunca
--     hardcoda empresa_id — deriva sempre por SELECT a partir do modelo
--     CRED-EXA já existente. Se CRED-EXA não existir em algum ambiente, a
--     Seção 0 (guard obrigatório) faz a migration FALHAR explicitamente
--     antes de qualquer INSERT — nunca um sucesso silencioso com zero
--     modelos criados, e nunca um fallback para empresa_id = 1 ou 6. Não
--     altera CRED-EXA, FAP13-CRED-*, nem qualquer sessão/ficha histórica.
--   dry_run_required:
--     Antes de aplicar em qualquer ambiente:
--       1. Rodar em SQLite descartável (cadeia completa de migrations até
--          0423 + esta) e confirmar 4 modelos_sessao, 72 manobras
--          (18 por modelo), 72 modelos_sessao_manobras e 3
--          modelos_sessao_requisitos.
--       2. Confirmar PRAGMA integrity_check = ok e
--          PRAGMA foreign_key_check sem violações novas.
--       3. Confirmar que rodar a migration 2x não duplica nenhuma linha.
--       4. Confirmar que, sem uma linha CRED-EXA presente, a migration
--          FALHA explicitamente (exit code != 0, CHECK constraint) — nunca
--          "sucede" silenciosamente com zero modelos criados.
--     Cobertura automatizada equivalente em
--     worker-airtrust/src/__tests__/migrations/examiner-universal-training-fichas.test.ts.
--   rollback_plan_required:
--     Ver bloco "Rollback manual local" acima. Seed puramente aditivo de
--     catálogo curricular (modelos_sessao/manobras/vínculos/requisitos),
--     sem histórico de avaliação envolvido — nenhuma ficha_sessao é criada
--     ou alterada por esta migration.

-- ===========================================================================
-- 0. GUARD OBRIGATÓRIO — falha explícita se o tenant-base não existir
--
-- Esta migration nunca deve "suceder" criando zero modelos. Se não houver
-- uma linha CRED-EXA ativa em modelos_sessao (a âncora auditável de tenant,
-- ver cabeçalho acima), o INSERT abaixo viola a CHECK constraint e aborta
-- a execução do arquivo inteiro ANTES de qualquer INSERT nas seções 1-4.
-- O nome da tabela/coluna aparece na mensagem de erro do SQLite/D1, tornando
-- a causa raiz óbvia para quem está aplicando a migration manualmente.
-- ===========================================================================

CREATE TEMP TABLE IF NOT EXISTS _migration_0424_requires_existing_cred_exa_tenant_anchor (
  cred_exa_tenant_anchor_present INTEGER NOT NULL
    CHECK (cred_exa_tenant_anchor_present = 1)
);

INSERT INTO _migration_0424_requires_existing_cred_exa_tenant_anchor (
  cred_exa_tenant_anchor_present
)
SELECT CASE
  WHEN EXISTS (
    SELECT 1 FROM modelos_sessao WHERE codigo = 'CRED-EXA' AND deleted_at IS NULL
  ) THEN 1
  ELSE 0
END;

DROP TABLE _migration_0424_requires_existing_cred_exa_tenant_anchor;

-- ===========================================================================
-- 1. MODELOS_SESSAO — 4 fichas universais
-- ===========================================================================

INSERT INTO modelos_sessao (
  codigo, nome, tipo, descricao, ativo, duracao_estimada, tipo_aeronave,
  tipo_sessao_id, empresa_id, created_at, updated_at
)
SELECT
  'EXA-V01', 'Treinamento Prático de Examinador — SOP Normal e Condução Inicial', 'RECORRENTE', 'Treinamento prático interno de examinador (1/4): SOP normal e condução inicial do cenário. Ficha universal — 18 itens técnicos + 15 NOTECHS canônicos, aplicável a qualquer modelo de aeronave. Não é FAP, não gera credenciamento ANAC.', 1, 60, NULL,
  (SELECT id FROM tipos_sessao WHERE codigo = 'EXA' AND empresa_id = cred.empresa_id AND deleted_at IS NULL LIMIT 1),
  cred.empresa_id, datetime('now'), datetime('now')
FROM (
  SELECT empresa_id FROM modelos_sessao WHERE codigo = 'CRED-EXA' AND deleted_at IS NULL LIMIT 1
) AS cred
WHERE NOT EXISTS (SELECT 1 FROM modelos_sessao WHERE codigo = 'EXA-V01');

INSERT INTO modelos_sessao (
  codigo, nome, tipo, descricao, ativo, duracao_estimada, tipo_aeronave,
  tipo_sessao_id, empresa_id, created_at, updated_at
)
SELECT
  'EXA-V02', 'Treinamento Prático de Examinador — SOP Anormal e Avaliação', 'RECORRENTE', 'Treinamento prático interno de examinador (2/4): SOP anormal e avaliação de desvios. Requer EXA-V01 concluída. Ficha universal — 18 itens técnicos + 15 NOTECHS canônicos. Não é FAP, não gera credenciamento ANAC.', 1, 60, NULL,
  (SELECT id FROM tipos_sessao WHERE codigo = 'EXA' AND empresa_id = cred.empresa_id AND deleted_at IS NULL LIMIT 1),
  cred.empresa_id, datetime('now'), datetime('now')
FROM (
  SELECT empresa_id FROM modelos_sessao WHERE codigo = 'CRED-EXA' AND deleted_at IS NULL LIMIT 1
) AS cred
WHERE NOT EXISTS (SELECT 1 FROM modelos_sessao WHERE codigo = 'EXA-V02');

INSERT INTO modelos_sessao (
  codigo, nome, tipo, descricao, ativo, duracao_estimada, tipo_aeronave,
  tipo_sessao_id, empresa_id, created_at, updated_at
)
SELECT
  'EXA-V03', 'Treinamento Prático de Examinador — Emergência, Intervenção e Segurança', 'RECORRENTE', 'Treinamento prático interno de examinador (3/4): emergência, intervenção e segurança. Requer EXA-V02 concluída. Ficha universal — 18 itens técnicos + 15 NOTECHS canônicos. Não é FAP, não gera credenciamento ANAC.', 1, 60, NULL,
  (SELECT id FROM tipos_sessao WHERE codigo = 'EXA' AND empresa_id = cred.empresa_id AND deleted_at IS NULL LIMIT 1),
  cred.empresa_id, datetime('now'), datetime('now')
FROM (
  SELECT empresa_id FROM modelos_sessao WHERE codigo = 'CRED-EXA' AND deleted_at IS NULL LIMIT 1
) AS cred
WHERE NOT EXISTS (SELECT 1 FROM modelos_sessao WHERE codigo = 'EXA-V03');

INSERT INTO modelos_sessao (
  codigo, nome, tipo, descricao, ativo, duracao_estimada, tipo_aeronave,
  tipo_sessao_id, empresa_id, created_at, updated_at
)
SELECT
  'EXA-V04', 'Treinamento Prático de Examinador — Atuação Integrada', 'RECORRENTE', 'Treinamento prático interno de examinador (4/4): atuação integrada do examinador. Requer EXA-V03 concluída. Ficha universal — 18 itens técnicos + 15 NOTECHS canônicos. Não é FAP, não gera credenciamento ANAC.', 1, 60, NULL,
  (SELECT id FROM tipos_sessao WHERE codigo = 'EXA' AND empresa_id = cred.empresa_id AND deleted_at IS NULL LIMIT 1),
  cred.empresa_id, datetime('now'), datetime('now')
FROM (
  SELECT empresa_id FROM modelos_sessao WHERE codigo = 'CRED-EXA' AND deleted_at IS NULL LIMIT 1
) AS cred
WHERE NOT EXISTS (SELECT 1 FROM modelos_sessao WHERE codigo = 'EXA-V04');


-- ===========================================================================
-- 2. MANOBRAS — 18 itens técnicos por modelo (72 no total)
--    tipo_aeronave = NULL em todos: universal, nunca varia por equipamento.
--    Os 15 NOTECHS canônicos NÃO são inseridos aqui — são injetados em tempo
--    de ficha por buildOperationalFichaManobras() (worker-airtrust/src/
--    constants/notechs.ts), o mesmo mecanismo já usado por todo modelo de
--    sessão existente no sistema.
-- ===========================================================================

WITH v(codigo, nome, descricao, ordem) AS (
  VALUES
    ('EXA-V01-01', 'Planejamento da sessão', 'Planejar a sessão conforme objetivo, programa e padrão aplicável.', 1),
    ('EXA-V01-02', 'Sequência do cenário', 'Definir sequência coerente e executável para a avaliação.', 2),
    ('EXA-V01-03', 'Condições de início', 'Confirmar condições operacionais, documentais e técnicas para iniciar.', 3),
    ('EXA-V01-04', 'Briefing do exame', 'Conduzir briefing claro, completo e proporcional ao cenário.', 4),
    ('EXA-V01-05', 'Funções e responsabilidades', 'Definir papéis, responsabilidades e limites de atuação.', 5),
    ('EXA-V01-06', 'Transferência de controles', 'Estabelecer procedimentos para transferência e assunção dos controles.', 6),
    ('EXA-V01-07', 'Configuração do dispositivo', 'Preparar o dispositivo de treinamento para o cenário planejado.', 7),
    ('EXA-V01-08', 'Condução conforme SOP', 'Conduzir o cenário de acordo com o SOP aplicável.', 8),
    ('EXA-V01-09', 'Observação sem interferência', 'Observar o desempenho sem fornecer orientação indevida.', 9),
    ('EXA-V01-10', 'Vigilância da operação', 'Manter monitoramento contínuo da segurança e da execução.', 10),
    ('EXA-V01-11', 'Identificação de desvios', 'Reconhecer desvios em relação aos padrões estabelecidos.', 11),
    ('EXA-V01-12', 'Procedimentos normais', 'Avaliar a execução dos procedimentos normais aplicáveis.', 12),
    ('EXA-V01-13', 'Listas aplicáveis', 'Avaliar a utilização correta das listas e da ECL aplicável.', 13),
    ('EXA-V01-14', 'Coordenação da tripulação', 'Avaliar coordenação, comunicação e distribuição de tarefas.', 14),
    ('EXA-V01-15', 'Gerenciamento do tempo', 'Controlar duração, sequência e progressão da sessão.', 15),
    ('EXA-V01-16', 'Critérios de avaliação', 'Aplicar critérios de forma uniforme, objetiva e rastreável.', 16),
    ('EXA-V01-17', 'Debriefing da sessão', 'Conduzir debriefing baseado nas evidências observadas.', 17),
    ('EXA-V01-18', 'Registro interno', 'Preencher corretamente a ficha interna de treinamento.', 18)
)
INSERT INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem, empresa_id)
SELECT v.codigo, v.nome, v.descricao, 'EXAMINADOR-PRATICO', 'TREINAMENTO', NULL, v.ordem, cred.empresa_id
FROM v
CROSS JOIN (
  SELECT empresa_id FROM modelos_sessao WHERE codigo = 'CRED-EXA' AND deleted_at IS NULL LIMIT 1
) AS cred
WHERE NOT EXISTS (
  SELECT 1 FROM manobras m2
  WHERE m2.codigo = v.codigo AND m2.empresa_id = cred.empresa_id AND m2.deleted_at IS NULL
);

WITH v(codigo, nome, descricao, ordem) AS (
  VALUES
    ('EXA-V02-01', 'Planejamento da anormalidade', 'Planejar condição anormal adequada ao objetivo da sessão.', 1),
    ('EXA-V02-02', 'Seleção da condição', 'Selecionar condição compatível com nível, equipamento e tempo disponível.', 2),
    ('EXA-V02-03', 'Avaliação dos riscos', 'Identificar riscos e estabelecer limites para o cenário.', 3),
    ('EXA-V02-04', 'Configuração do dispositivo', 'Configurar corretamente o dispositivo para a condição planejada.', 4),
    ('EXA-V02-05', 'Briefing específico', 'Apresentar objetivos, limites e medidas de segurança da sessão.', 5),
    ('EXA-V02-06', 'Inserção da condição', 'Inserir a condição no momento e contexto planejados.', 6),
    ('EXA-V02-07', 'Reconhecimento da condição', 'Avaliar se a condição foi identificada adequadamente.', 7),
    ('EXA-V02-08', 'Aplicação da ECL', 'Avaliar seleção, sequência e execução da ECL aplicável.', 8),
    ('EXA-V02-09', 'Sequência dos procedimentos', 'Avaliar a ordem e a disciplina na execução dos procedimentos.', 9),
    ('EXA-V02-10', 'Gerenciamento dos sistemas', 'Avaliar o gerenciamento dos sistemas afetados.', 10),
    ('EXA-V02-11', 'Distribuição de tarefas', 'Avaliar a divisão adequada de funções entre os tripulantes.', 11),
    ('EXA-V02-12', 'Tomada de decisão', 'Avaliar decisões, prioridades e alternativas adotadas.', 12),
    ('EXA-V02-13', 'Ausência de coaching', 'Manter postura de examinador sem instrução durante a avaliação.', 13),
    ('EXA-V02-14', 'Treinamento insuficiente', 'Identificar indícios de treinamento inadequado ou insuficiente.', 14),
    ('EXA-V02-15', 'Desvios de segurança', 'Reconhecer condutas ou condições que afetem a segurança.', 15),
    ('EXA-V02-16', 'Continuação ou interrupção', 'Decidir justificadamente entre continuar, repetir ou interromper.', 16),
    ('EXA-V02-17', 'Debriefing da sessão', 'Apresentar análise objetiva baseada nas evidências observadas.', 17),
    ('EXA-V02-18', 'Registro das evidências', 'Registrar desvios, decisões e resultados na ficha interna.', 18)
)
INSERT INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem, empresa_id)
SELECT v.codigo, v.nome, v.descricao, 'EXAMINADOR-PRATICO', 'TREINAMENTO', NULL, v.ordem, cred.empresa_id
FROM v
CROSS JOIN (
  SELECT empresa_id FROM modelos_sessao WHERE codigo = 'CRED-EXA' AND deleted_at IS NULL LIMIT 1
) AS cred
WHERE NOT EXISTS (
  SELECT 1 FROM manobras m2
  WHERE m2.codigo = v.codigo AND m2.empresa_id = cred.empresa_id AND m2.deleted_at IS NULL
);

WITH v(codigo, nome, descricao, ordem) AS (
  VALUES
    ('EXA-V03-01', 'Planejamento da emergência', 'Planejar cenário de emergência compatível com o objetivo.', 1),
    ('EXA-V03-02', 'Seleção da emergência', 'Selecionar emergência adequada ao nível e ao tempo disponível.', 2),
    ('EXA-V03-03', 'Riscos e limites', 'Definir riscos, limites e condições de encerramento.', 3),
    ('EXA-V03-04', 'Preparação do IOS', 'Configurar o IOS para a execução segura do cenário.', 4),
    ('EXA-V03-05', 'Briefing de segurança', 'Definir responsabilidades, limites e medidas de intervenção.', 5),
    ('EXA-V03-06', 'Inserção da emergência', 'Inserir a emergência de forma segura e controlada.', 6),
    ('EXA-V03-07', 'Ações imediatas', 'Avaliar reconhecimento e ações iniciais do examinando.', 7),
    ('EXA-V03-08', 'Aplicação da ECL', 'Avaliar seleção e execução da ECL aplicável.', 8),
    ('EXA-V03-09', 'Prioridades operacionais', 'Avaliar definição e manutenção das prioridades operacionais.', 9),
    ('EXA-V03-10', 'Controle da aeronave', 'Avaliar manutenção do controle e estabilidade da operação.', 10),
    ('EXA-V03-11', 'Coordenação PF/PM', 'Avaliar coordenação, distribuição de tarefas e cross-check.', 11),
    ('EXA-V03-12', 'Comunicação na emergência', 'Avaliar clareza, oportunidade e disciplina das comunicações.', 12),
    ('EXA-V03-13', 'Vigilância do examinador', 'Manter consciência contínua da evolução e dos riscos.', 13),
    ('EXA-V03-14', 'Necessidade de intervenção', 'Reconhecer corretamente quando a intervenção se torna necessária.', 14),
    ('EXA-V03-15', 'Momento da intervenção', 'Avaliar consequências de intervenção tardia ou inadequada.', 15),
    ('EXA-V03-16', 'Assunção dos controles', 'Intervir e assumir os controles conforme o assento aplicável.', 16),
    ('EXA-V03-17', 'Recuperação do cenário', 'Restabelecer condições seguras e encerrar adequadamente.', 17),
    ('EXA-V03-18', 'Debriefing e registro', 'Debrifar e registrar as evidências relevantes da sessão.', 18)
)
INSERT INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem, empresa_id)
SELECT v.codigo, v.nome, v.descricao, 'EXAMINADOR-PRATICO', 'TREINAMENTO', NULL, v.ordem, cred.empresa_id
FROM v
CROSS JOIN (
  SELECT empresa_id FROM modelos_sessao WHERE codigo = 'CRED-EXA' AND deleted_at IS NULL LIMIT 1
) AS cred
WHERE NOT EXISTS (
  SELECT 1 FROM manobras m2
  WHERE m2.codigo = v.codigo AND m2.empresa_id = cred.empresa_id AND m2.deleted_at IS NULL
);

WITH v(codigo, nome, descricao, ordem) AS (
  VALUES
    ('EXA-V04-01', 'Planejamento do exame', 'Planejar integralmente a avaliação prática.', 1),
    ('EXA-V04-02', 'Seleção dos eventos', 'Selecionar eventos coerentes com os objetivos e padrões.', 2),
    ('EXA-V04-03', 'Preparação do cenário', 'Preparar dispositivo, condições e sequência do exame.', 3),
    ('EXA-V04-04', 'Briefing do exame', 'Conduzir briefing completo e objetivo.', 4),
    ('EXA-V04-05', 'Responsabilidades e controles', 'Definir funções e procedimentos de transferência dos controles.', 5),
    ('EXA-V04-06', 'Condução organizada', 'Conduzir o exame de forma ordenada e eficiente.', 6),
    ('EXA-V04-07', 'Observação sem coaching', 'Avaliar sem orientar indevidamente o examinando.', 7),
    ('EXA-V04-08', 'Sequência e tempo', 'Gerenciar progressão, duração e cobertura da avaliação.', 8),
    ('EXA-V04-09', 'Desempenho técnico', 'Avaliar objetivamente o desempenho técnico observado.', 9),
    ('EXA-V04-10', 'Aplicação dos padrões', 'Aplicar os mesmos critérios de forma consistente.', 10),
    ('EXA-V04-11', 'Treinamento insuficiente', 'Identificar deficiências relacionadas a treinamento inadequado.', 11),
    ('EXA-V04-12', 'Condições que afetam segurança', 'Reconhecer comportamentos ou condições que afetem a segurança.', 12),
    ('EXA-V04-13', 'Decisão sobre o exame', 'Decidir entre continuar, repetir, interromper ou encerrar.', 13),
    ('EXA-V04-14', 'Medidas de segurança', 'Aplicar medidas de segurança conforme o assento ocupado.', 14),
    ('EXA-V04-15', 'Resultado interno', 'Determinar o resultado interno conforme o padrão da empresa.', 15),
    ('EXA-V04-16', 'Fundamentação do resultado', 'Justificar o resultado com evidências observáveis.', 16),
    ('EXA-V04-17', 'Debriefing final', 'Conduzir debriefing estruturado e objetivo.', 17),
    ('EXA-V04-18', 'Encerramento da ficha', 'Concluir os registros e assinaturas internas aplicáveis.', 18)
)
INSERT INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem, empresa_id)
SELECT v.codigo, v.nome, v.descricao, 'EXAMINADOR-PRATICO', 'TREINAMENTO', NULL, v.ordem, cred.empresa_id
FROM v
CROSS JOIN (
  SELECT empresa_id FROM modelos_sessao WHERE codigo = 'CRED-EXA' AND deleted_at IS NULL LIMIT 1
) AS cred
WHERE NOT EXISTS (
  SELECT 1 FROM manobras m2
  WHERE m2.codigo = v.codigo AND m2.empresa_id = cred.empresa_id AND m2.deleted_at IS NULL
);


-- ===========================================================================
-- 3. MODELOS_SESSAO_MANOBRAS — vincula os 18 itens de cada modelo, na ordem
-- ===========================================================================

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante)
SELECT ms.id, m.id, m.ordem, 1, 'AB'
FROM modelos_sessao ms
INNER JOIN manobras m
  ON m.empresa_id = ms.empresa_id
 AND m.codigo LIKE 'EXA-V01-%'
 AND m.deleted_at IS NULL
WHERE ms.codigo = 'EXA-V01'
  AND ms.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM modelos_sessao_manobras msm2
    WHERE msm2.modelo_id = ms.id AND msm2.manobra_id = m.id AND msm2.deleted_at IS NULL
  );

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante)
SELECT ms.id, m.id, m.ordem, 1, 'AB'
FROM modelos_sessao ms
INNER JOIN manobras m
  ON m.empresa_id = ms.empresa_id
 AND m.codigo LIKE 'EXA-V02-%'
 AND m.deleted_at IS NULL
WHERE ms.codigo = 'EXA-V02'
  AND ms.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM modelos_sessao_manobras msm2
    WHERE msm2.modelo_id = ms.id AND msm2.manobra_id = m.id AND msm2.deleted_at IS NULL
  );

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante)
SELECT ms.id, m.id, m.ordem, 1, 'AB'
FROM modelos_sessao ms
INNER JOIN manobras m
  ON m.empresa_id = ms.empresa_id
 AND m.codigo LIKE 'EXA-V03-%'
 AND m.deleted_at IS NULL
WHERE ms.codigo = 'EXA-V03'
  AND ms.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM modelos_sessao_manobras msm2
    WHERE msm2.modelo_id = ms.id AND msm2.manobra_id = m.id AND msm2.deleted_at IS NULL
  );

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, tripulante)
SELECT ms.id, m.id, m.ordem, 1, 'AB'
FROM modelos_sessao ms
INNER JOIN manobras m
  ON m.empresa_id = ms.empresa_id
 AND m.codigo LIKE 'EXA-V04-%'
 AND m.deleted_at IS NULL
WHERE ms.codigo = 'EXA-V04'
  AND ms.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM modelos_sessao_manobras msm2
    WHERE msm2.modelo_id = ms.id AND msm2.manobra_id = m.id AND msm2.deleted_at IS NULL
  );


-- ===========================================================================
-- 4. MODELOS_SESSAO_REQUISITOS — progressão sequencial obrigatória
--    EXA-V02 requer EXA-V01 concluída; EXA-V03 requer EXA-V02; EXA-V04
--    requer EXA-V03. Nunca conclusão por soma de minutos.
-- ===========================================================================

INSERT INTO modelos_sessao_requisitos (
  uuid, empresa_id, modelo_sessao_id, requisito_modelo_sessao_id, tipo_requisito, obrigatorio, ordem
)
SELECT
  lower(hex(randomblob(16))), v.empresa_id, v.modelo_id, v.requisito_id, 'ETAPA_ANTERIOR', 1, 1
FROM (
  SELECT ms1.empresa_id AS empresa_id, ms1.id AS modelo_id, ms2.id AS requisito_id
  FROM modelos_sessao ms1
  INNER JOIN modelos_sessao ms2
    ON ms2.empresa_id = ms1.empresa_id
   AND ms2.codigo = 'EXA-V01'
   AND ms2.deleted_at IS NULL
  WHERE ms1.codigo = 'EXA-V02'
    AND ms1.deleted_at IS NULL
) AS v
WHERE NOT EXISTS (
  SELECT 1 FROM modelos_sessao_requisitos r
  WHERE r.modelo_sessao_id = v.modelo_id
    AND r.requisito_modelo_sessao_id = v.requisito_id
    AND r.tipo_requisito = 'ETAPA_ANTERIOR'
    AND r.deleted_at IS NULL
);

INSERT INTO modelos_sessao_requisitos (
  uuid, empresa_id, modelo_sessao_id, requisito_modelo_sessao_id, tipo_requisito, obrigatorio, ordem
)
SELECT
  lower(hex(randomblob(16))), v.empresa_id, v.modelo_id, v.requisito_id, 'ETAPA_ANTERIOR', 1, 1
FROM (
  SELECT ms1.empresa_id AS empresa_id, ms1.id AS modelo_id, ms2.id AS requisito_id
  FROM modelos_sessao ms1
  INNER JOIN modelos_sessao ms2
    ON ms2.empresa_id = ms1.empresa_id
   AND ms2.codigo = 'EXA-V02'
   AND ms2.deleted_at IS NULL
  WHERE ms1.codigo = 'EXA-V03'
    AND ms1.deleted_at IS NULL
) AS v
WHERE NOT EXISTS (
  SELECT 1 FROM modelos_sessao_requisitos r
  WHERE r.modelo_sessao_id = v.modelo_id
    AND r.requisito_modelo_sessao_id = v.requisito_id
    AND r.tipo_requisito = 'ETAPA_ANTERIOR'
    AND r.deleted_at IS NULL
);

INSERT INTO modelos_sessao_requisitos (
  uuid, empresa_id, modelo_sessao_id, requisito_modelo_sessao_id, tipo_requisito, obrigatorio, ordem
)
SELECT
  lower(hex(randomblob(16))), v.empresa_id, v.modelo_id, v.requisito_id, 'ETAPA_ANTERIOR', 1, 1
FROM (
  SELECT ms1.empresa_id AS empresa_id, ms1.id AS modelo_id, ms2.id AS requisito_id
  FROM modelos_sessao ms1
  INNER JOIN modelos_sessao ms2
    ON ms2.empresa_id = ms1.empresa_id
   AND ms2.codigo = 'EXA-V03'
   AND ms2.deleted_at IS NULL
  WHERE ms1.codigo = 'EXA-V04'
    AND ms1.deleted_at IS NULL
) AS v
WHERE NOT EXISTS (
  SELECT 1 FROM modelos_sessao_requisitos r
  WHERE r.modelo_sessao_id = v.modelo_id
    AND r.requisito_modelo_sessao_id = v.requisito_id
    AND r.tipo_requisito = 'ETAPA_ANTERIOR'
    AND r.deleted_at IS NULL
);

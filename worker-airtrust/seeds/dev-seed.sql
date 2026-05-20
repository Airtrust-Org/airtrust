-- Seed remoto do ambiente development
-- Objetivo: dados mínimos, fictícios e idempotentes para login, multi-tenant e LMS.

PRAGMA foreign_keys = ON;

-- Empresa de desenvolvimento dedicada
INSERT OR IGNORE INTO empresas (
  id,
  nome,
  razao_social,
  cnpj,
  email,
  telefone,
  ativo,
  codigo,
  plano,
  created_at,
  updated_at
) VALUES (
  9001,
  'AirTrust DEV',
  'AirTrust Desenvolvimento Ltda',
  '99.999.999/0001-91',
  'dev@airtrust.online',
  '+55 11 4000-0000',
  1,
  'dev',
  'basic',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO empresas_config (
  empresa_id,
  timezone,
  idioma,
  updated_at
) VALUES (
  9001,
  'America/Sao_Paulo',
  'pt-BR',
  datetime('now')
);

-- Funcionários fictícios para LMS e autenticação
INSERT OR IGNORE INTO funcionarios (
  id,
  nome,
  guerra,
  funcao,
  aeronave,
  cpf,
  email,
  telefone,
  matricula,
  empresa_id,
  created_at,
  updated_at
) VALUES
  (9101, 'Amanda Gestora Demo', 'Amanda', 'Gestora de Treinamento', 'AW139', '900.001.001-01', 'gestora.dev@airtrust.online', '+55 11 98888-1001', 'DEV-1001', 9001, datetime('now'), datetime('now')),
  (9102, 'Bruno Instrutor Demo', 'Bruno', 'Instrutor', 'SK76', '900.001.001-02', 'instrutor.dev@airtrust.online', '+55 11 98888-1002', 'DEV-1002', 9001, datetime('now'), datetime('now')),
  (9103, 'Carla Aluna Demo', 'Carla', 'Piloto', 'AW139', '900.001.001-03', 'aluna.dev@airtrust.online', '+55 11 98888-1003', 'DEV-1003', 9001, datetime('now'), datetime('now')),
  (9104, 'Diego Aluno Demo', 'Diego', 'Copiloto', 'SK76', '900.001.001-04', 'aluno2.dev@airtrust.online', '+55 11 98888-1004', 'DEV-1004', 9001, datetime('now'), datetime('now'));

-- Usuários: senha conhecida compartilhada para DEV = Admin@123
INSERT OR IGNORE INTO usuarios (
  id,
  email,
  password_hash,
  nome,
  perfil,
  funcionario_id,
  active,
  created_at,
  updated_at
) VALUES
  (9201, 'admin.dev@airtrust.online', '$2b$12$NAMuNHUlkSB.DxRmCJavreynBjJfSTIOHBXZfyJsVcnrT520ib8l2', 'Admin DEV', 'ADMINISTRADOR', 9101, 1, datetime('now'), datetime('now')),
  (9202, 'gestor.dev@airtrust.online', '$2b$12$NAMuNHUlkSB.DxRmCJavreynBjJfSTIOHBXZfyJsVcnrT520ib8l2', 'Gestor DEV', 'GESTOR', 9101, 1, datetime('now'), datetime('now')),
  (9203, 'instrutor.dev@airtrust.online', '$2b$12$NAMuNHUlkSB.DxRmCJavreynBjJfSTIOHBXZfyJsVcnrT520ib8l2', 'Instrutor DEV', 'INSTRUTOR', 9102, 1, datetime('now'), datetime('now')),
  (9204, 'aluna.dev@airtrust.online', '$2b$12$NAMuNHUlkSB.DxRmCJavreynBjJfSTIOHBXZfyJsVcnrT520ib8l2', 'Aluna DEV', 'ALUNO', 9103, 1, datetime('now'), datetime('now')),
  (9205, 'aluno2.dev@airtrust.online', '$2b$12$NAMuNHUlkSB.DxRmCJavreynBjJfSTIOHBXZfyJsVcnrT520ib8l2', 'Aluno DEV 2', 'ALUNO', 9104, 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO usuarios_empresas (
  id,
  usuario_id,
  empresa_id,
  role,
  is_primary,
  created_at
) VALUES
  (9301, 9201, 9001, 'admin', 1, datetime('now')),
  (9302, 9202, 9001, 'manager', 1, datetime('now')),
  (9303, 9203, 9001, 'instructor', 1, datetime('now')),
  (9304, 9204, 9001, 'user', 1, datetime('now')),
  (9305, 9205, 9001, 'user', 1, datetime('now'));

-- Catálogo LMS fictício
INSERT OR IGNORE INTO lms_cursos (
  id,
  empresa_id,
  titulo,
  descricao,
  categoria,
  carga_horaria_minutos,
  idioma,
  tipo_conteudo,
  scorm_versao,
  scorm_mastery_score,
  ativo,
  publicado,
  version_tag,
  created_at,
  updated_at
) VALUES
  (9401, 9001, 'CRM Recorrente DEV', 'Treinamento recorrente de CRM para ambiente de desenvolvimento.', 'Operacional', 120, 'pt-BR', 'scorm', '2004', 80, 1, 1, 'dev-seed-1', datetime('now'), datetime('now')),
  (9402, 9001, 'Procedimentos de Emergência DEV', 'Conteúdo base de emergência para testes do LMS.', 'Segurança', 90, 'pt-BR', 'scorm', '1.2', 75, 1, 1, 'dev-seed-1', datetime('now'), datetime('now')),
  (9403, 9001, 'Introdução ao SGSO DEV', 'Curso introdutório publicado para validar catálogo e matrículas.', 'Compliance', 60, 'pt-BR', 'video', NULL, 70, 1, 1, 'dev-seed-1', datetime('now'), datetime('now'));

-- Matrículas para alimentar KPIs pessoais e gerenciais
INSERT OR IGNORE INTO lms_matriculas (
  id,
  empresa_id,
  curso_id,
  funcionario_id,
  status,
  progresso_pct,
  score_final,
  tentativas,
  data_inicio,
  data_conclusao,
  data_matricula,
  observacoes,
  created_at,
  updated_at
) VALUES
  (9501, 9001, 9401, 9103, 'EM_ANDAMENTO', 45, NULL, 1, datetime('now', '-3 days'), NULL, datetime('now', '-3 days'), 'Progresso em andamento', datetime('now'), datetime('now')),
  (9502, 9001, 9402, 9103, 'CONCLUIDO', 100, 92, 1, datetime('now', '-15 days'), datetime('now', '-10 days'), datetime('now', '-15 days'), 'Curso concluído', datetime('now'), datetime('now')),
  (9503, 9001, 9401, 9104, 'NAO_INICIADO', 0, NULL, 0, NULL, NULL, datetime('now', '-1 day'), 'Aguardando início', datetime('now'), datetime('now')),
  (9504, 9001, 9403, 9102, 'EM_ANDAMENTO', 20, NULL, 1, datetime('now', '-20 days'), NULL, datetime('now', '-20 days'), 'Matrícula em atraso para teste de KPI', datetime('now'), datetime('now'));

-- Dados adicionais para cobrir mais estados, qualificação gerada, H5P listado e filtros administrativos.
INSERT OR IGNORE INTO funcionarios (
  id,
  nome,
  guerra,
  funcao,
  aeronave,
  cpf,
  email,
  telefone,
  matricula,
  empresa_id,
  created_at,
  updated_at
) VALUES
  (9105, 'Erika Aluna Demo', 'Erika', 'Piloto', 'H145', '900.001.001-05', 'aluna3.dev@airtrust.online', '+55 11 98888-1005', 'DEV-1005', 9001, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO usuarios (
  id,
  email,
  password_hash,
  nome,
  perfil,
  funcionario_id,
  active,
  created_at,
  updated_at
) VALUES
  (9206, 'aluna3.dev@airtrust.online', '$2b$12$NAMuNHUlkSB.DxRmCJavreynBjJfSTIOHBXZfyJsVcnrT520ib8l2', 'Aluna DEV 3', 'ALUNO', 9105, 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO usuarios_empresas (
  id,
  usuario_id,
  empresa_id,
  role,
  is_primary,
  created_at
) VALUES
  (9306, 9206, 9001, 'user', 1, datetime('now'));

INSERT OR IGNORE INTO qualificacoes_tipos (
  id,
  tipo,
  codigo,
  nome,
  descricao,
  categoria,
  carga_horaria,
  validade,
  ativo,
  empresa_id,
  created_at,
  updated_at
) VALUES
  (9601, 'QUALIFICACAO', 'LMS-CRM-DEV', 'CRM Recorrente DEV', 'Qualificação automática gerada por conclusão do LMS no ambiente DEV.', 'Operacional', 120, 12, 1, 9001, datetime('now'), datetime('now'));

UPDATE qualificacoes_tipos
SET tipo = 'QUALIFICACAO',
    codigo = 'LMS-CRM-DEV',
    nome = 'CRM Recorrente DEV',
    descricao = 'Qualificação automática gerada por conclusão do LMS no ambiente DEV.',
    categoria = 'Operacional',
    carga_horaria = 120,
    validade = 12,
    ativo = 1,
    empresa_id = 9001,
    updated_at = datetime('now')
WHERE id = 9601;

INSERT OR IGNORE INTO lms_h5p_conteudos (
  id,
  empresa_id,
  titulo,
  tipo_h5p,
  r2_key,
  versao,
  ativo,
  created_at,
  updated_at
) VALUES
  (9651, 9001, 'Briefing Interativo DEV', 'AirtrustGreeting', 'lms/h5p/9001/9651/', 'H5P.AirtrustGreeting 1.0', 1, datetime('now'), datetime('now'));

UPDATE lms_h5p_conteudos
SET titulo = 'Briefing Interativo DEV',
    tipo_h5p = 'AirtrustGreeting',
    r2_key = 'lms/h5p/9001/9651/',
    versao = 'H5P.AirtrustGreeting 1.0',
    ativo = 1,
    updated_at = datetime('now')
WHERE id = 9651;

INSERT OR IGNORE INTO lms_cursos (
  id,
  empresa_id,
  titulo,
  descricao,
  categoria,
  carga_horaria_minutos,
  idioma,
  tipo_conteudo,
  scorm_versao,
  scorm_mastery_score,
  scorm_package_r2_prefix,
  qualificacao_tipo_id,
  gerar_qualificacao_ao_concluir,
  ativo,
  publicado,
  version_tag,
  created_at,
  updated_at
) VALUES
  (9410, 9001, 'Briefing Operacional H5P DEV', 'Curso H5P demonstrativo para telas de gestão e detalhe da matrícula.', 'Operacional', 35, 'pt-BR', 'h5p', NULL, 70, 'lms/h5p/9001/9651/', NULL, 0, 1, 1, 'dev-seed-2', datetime('now'), datetime('now')),
  (9411, 9001, 'FRMS Investigação DEV', 'Curso SCORM em rascunho para testes de publicação, filtros e upload.', 'FRMS', 75, 'pt-BR', 'scorm', '1.2', 85, NULL, NULL, 0, 1, 0, 'dev-seed-2', datetime('now'), datetime('now')),
  (9412, 9001, 'Segurança em Solo DEV', 'Curso em vídeo para validar cenários não-SCORM no catálogo.', 'Segurança', 50, 'pt-BR', 'video', NULL, 70, NULL, NULL, 0, 1, 1, 'dev-seed-2', datetime('now'), datetime('now'));

UPDATE lms_cursos
SET qualificacao_tipo_id = 9601,
    gerar_qualificacao_ao_concluir = 1,
    version_tag = 'dev-seed-2',
    updated_at = datetime('now')
WHERE id = 9401;

UPDATE lms_cursos
SET version_tag = 'dev-seed-2',
    updated_at = datetime('now')
WHERE id IN (9402, 9403, 9410, 9411, 9412);

UPDATE lms_cursos
SET scorm_package_r2_prefix = 'lms/h5p/9001/9651/'
WHERE id = 9410;

UPDATE lms_cursos
SET ativo = 0,
    publicado = 0,
    deleted_at = COALESCE(deleted_at, datetime('now')),
    updated_at = datetime('now')
WHERE empresa_id = 9001
  AND deleted_at IS NULL
  AND titulo IN ('SCORM Upload Test', 'UI SCORM Upload Test', 'SCORM Null Payload Smoke');

UPDATE lms_matriculas
SET deleted_at = COALESCE(deleted_at, datetime('now')),
    updated_at = datetime('now')
WHERE empresa_id = 9001
  AND deleted_at IS NULL
  AND curso_id IN (9404, 9405, 9413);

UPDATE lms_progresso_scorm
SET deleted_at = COALESCE(deleted_at, datetime('now')),
    updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND matricula_id IN (
    SELECT id FROM lms_matriculas WHERE curso_id IN (9404, 9405, 9413)
  );

INSERT OR IGNORE INTO qualificacoes_historico (
  id,
  funcionario_id,
  qualificacao_id,
  tipo_codigo,
  codigo,
  categoria,
  validade,
  numero_certificado,
  observacoes,
  data_conclusao,
  validade_meses,
  instrutor,
  nota,
  carga_horaria,
  data_vencimento,
  funcionario_cpf,
  qualificacao_codigo,
  empresa_id,
  status,
  tipo,
  created_at,
  updated_at
) VALUES
  (9701, 9103, 9601, 'LMS-CRM-DEV', 'LMS-CRM-DEV', 'Operacional', '12 meses', 'LMS-DEV-9502', 'Qualificação gerada a partir do curso CRM Recorrente DEV.', date('now', '-10 days'), 12, 'Bruno Instrutor Demo', 92, 120, date('now', '+12 months', '-10 days'), '900.001.001-03', 'LMS-CRM-DEV', 9001, 'CONCLUIDA', 'LMS', datetime('now'), datetime('now'));

UPDATE qualificacoes_historico
SET funcionario_id = 9103,
    qualificacao_id = 9601,
    tipo_codigo = 'LMS-CRM-DEV',
    codigo = 'LMS-CRM-DEV',
    categoria = 'Operacional',
    validade = '12 meses',
    numero_certificado = 'LMS-DEV-9502',
    observacoes = 'Qualificação gerada a partir do curso CRM Recorrente DEV.',
    data_conclusao = date('now', '-10 days'),
    validade_meses = 12,
    instrutor = 'Bruno Instrutor Demo',
    nota = 92,
    carga_horaria = 120,
    data_vencimento = date('now', '+12 months', '-10 days'),
    funcionario_cpf = '900.001.001-03',
    qualificacao_codigo = 'LMS-CRM-DEV',
    empresa_id = 9001,
    status = 'CONCLUIDA',
    tipo = 'LMS',
    updated_at = datetime('now')
WHERE id = 9701;

INSERT OR IGNORE INTO lms_matriculas (
  id,
  empresa_id,
  curso_id,
  funcionario_id,
  status,
  progresso_pct,
  score_final,
  tentativas,
  data_inicio,
  data_conclusao,
  data_expiracao,
  data_matricula,
  qualificacao_historico_id,
  observacoes,
  created_at,
  updated_at
) VALUES
  (9505, 9001, 9411, 9104, 'REPROVADO', 61, 61, 2, datetime('now', '-8 days'), datetime('now', '-2 days'), date('now', '+5 days'), datetime('now', '-8 days'), NULL, 'Aluno reprovado para validar filtros e badge.', datetime('now'), datetime('now')),
  (9506, 9001, 9402, 9105, 'CANCELADO', 0, NULL, 0, NULL, NULL, date('now', '+20 days'), datetime('now', '-6 days'), NULL, 'Matrícula cancelada para validar listagens.', datetime('now'), datetime('now')),
  (9507, 9001, 9401, 9105, 'CONCLUIDO', 100, 96, 1, datetime('now', '-12 days'), datetime('now', '-4 days'), date('now', '+180 days'), datetime('now', '-12 days'), NULL, 'Conclusão recente para alimentar taxa de conclusão.', datetime('now'), datetime('now')),
  (9508, 9001, 9410, 9103, 'EM_ANDAMENTO', 55, NULL, 1, datetime('now', '-5 days'), NULL, date('now', '+10 days'), datetime('now', '-5 days'), NULL, 'Conteúdo H5P em andamento com xAPI.', datetime('now'), datetime('now')),
  (9509, 9001, 9412, 9104, 'NAO_INICIADO', 0, NULL, 0, NULL, NULL, date('now', '+30 days'), datetime('now', '-2 days'), NULL, 'Curso em vídeo ainda não iniciado.', datetime('now'), datetime('now'));

UPDATE lms_matriculas
SET data_expiracao = date('now', '+15 days'),
    updated_at = datetime('now')
WHERE id = 9501;

UPDATE lms_matriculas
SET qualificacao_historico_id = 9701,
    data_expiracao = date('now', '+180 days'),
    updated_at = datetime('now')
WHERE id = 9502;

UPDATE lms_matriculas
SET data_expiracao = date('now', '+12 days'),
    updated_at = datetime('now')
WHERE id = 9503;

UPDATE lms_matriculas
SET data_expiracao = date('now', '-2 days'),
    updated_at = datetime('now')
WHERE id = 9504;

INSERT OR IGNORE INTO lms_progresso_scorm (
  matricula_id,
  empresa_id,
  lesson_status,
  completion_status,
  success_status,
  score_raw,
  score_max,
  score_min,
  score_scaled,
  session_time,
  total_time,
  session_count,
  suspend_data,
  launch_data,
  cmi_json,
  last_commit_at,
  created_at,
  updated_at
) VALUES
  (9501, 9001, 'incomplete', 'incomplete', 'unknown', 45, 100, 0, 0.45, 'PT18M', 'PT42M', 2, 'bookmark-slide-5', '{"modo":"recorrente"}', '{"core":{"lesson_status":"incomplete","score":{"raw":45,"max":100}}}', datetime('now', '-1 day'), datetime('now'), datetime('now')),
  (9502, 9001, 'passed', 'completed', 'passed', 92, 100, 0, 0.92, 'PT32M', 'PT1H18M', 2, NULL, '{"modo":"emergencia"}', '{"core":{"lesson_status":"passed","score":{"raw":92,"max":100}}}', datetime('now', '-10 days'), datetime('now'), datetime('now')),
  (9505, 9001, 'failed', 'completed', 'failed', 61, 100, 0, 0.61, 'PT27M', 'PT58M', 2, 'retry-question-12', '{"modo":"frms"}', '{"core":{"lesson_status":"failed","score":{"raw":61,"max":100}}}', datetime('now', '-2 days'), datetime('now'), datetime('now')),
  (9507, 9001, 'passed', 'completed', 'passed', 96, 100, 0, 0.96, 'PT24M', 'PT49M', 1, NULL, '{"modo":"crm"}', '{"core":{"lesson_status":"passed","score":{"raw":96,"max":100}}}', datetime('now', '-4 days'), datetime('now'), datetime('now'));

UPDATE lms_progresso_scorm
SET lesson_status = 'incomplete',
    completion_status = 'incomplete',
    success_status = 'unknown',
    score_raw = 45,
    score_max = 100,
    score_min = 0,
    score_scaled = 0.45,
    session_time = 'PT18M',
    total_time = 'PT42M',
    session_count = 2,
    suspend_data = 'bookmark-slide-5',
    launch_data = '{"modo":"recorrente"}',
    cmi_json = '{"core":{"lesson_status":"incomplete","score":{"raw":45,"max":100}}}',
    last_commit_at = datetime('now', '-1 day'),
    updated_at = datetime('now')
WHERE matricula_id = 9501;

UPDATE lms_progresso_scorm
SET lesson_status = 'passed',
    completion_status = 'completed',
    success_status = 'passed',
    score_raw = 92,
    score_max = 100,
    score_min = 0,
    score_scaled = 0.92,
    session_time = 'PT32M',
    total_time = 'PT1H18M',
    session_count = 2,
    suspend_data = NULL,
    launch_data = '{"modo":"emergencia"}',
    cmi_json = '{"core":{"lesson_status":"passed","score":{"raw":92,"max":100}}}',
    last_commit_at = datetime('now', '-10 days'),
    updated_at = datetime('now')
WHERE matricula_id = 9502;

UPDATE lms_progresso_scorm
SET lesson_status = 'failed',
    completion_status = 'completed',
    success_status = 'failed',
    score_raw = 61,
    score_max = 100,
    score_min = 0,
    score_scaled = 0.61,
    session_time = 'PT27M',
    total_time = 'PT58M',
    session_count = 2,
    suspend_data = 'retry-question-12',
    launch_data = '{"modo":"frms"}',
    cmi_json = '{"core":{"lesson_status":"failed","score":{"raw":61,"max":100}}}',
    last_commit_at = datetime('now', '-2 days'),
    updated_at = datetime('now')
WHERE matricula_id = 9505;

UPDATE lms_progresso_scorm
SET lesson_status = 'passed',
    completion_status = 'completed',
    success_status = 'passed',
    score_raw = 96,
    score_max = 100,
    score_min = 0,
    score_scaled = 0.96,
    session_time = 'PT24M',
    total_time = 'PT49M',
    session_count = 1,
    suspend_data = NULL,
    launch_data = '{"modo":"crm"}',
    cmi_json = '{"core":{"lesson_status":"passed","score":{"raw":96,"max":100}}}',
    last_commit_at = datetime('now', '-4 days'),
    updated_at = datetime('now')
WHERE matricula_id = 9507;

INSERT OR IGNORE INTO lms_xapi_statements (
  empresa_id,
  matricula_id,
  actor_json,
  verb_id,
  verb_display,
  object_id,
  object_type,
  result_json,
  context_json,
  timestamp,
  created_at
) VALUES
  (9001, 9508, '{"mbox":"mailto:aluna.dev@airtrust.online","name":"Carla Aluna Demo"}', 'http://adlnet.gov/expapi/verbs/initialized', 'inicializou', 'https://airtrust.dev/h5p/briefing-operacional', 'Activity', '{"completion":false}', '{"platform":"airtrust-dev"}', datetime('now', '-5 days'), datetime('now', '-5 days')),
  (9001, 9508, '{"mbox":"mailto:aluna.dev@airtrust.online","name":"Carla Aluna Demo"}', 'http://adlnet.gov/expapi/verbs/progressed', 'progrediu', 'https://airtrust.dev/h5p/briefing-operacional', 'Activity', '{"completion":false,"score":{"raw":55,"max":100,"scaled":0.55}}', '{"platform":"airtrust-dev"}', datetime('now', '-1 day'), datetime('now', '-1 day'));
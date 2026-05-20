-- SGSO demo seed (idempotent) for production visualization.
-- Strategy:
-- 1) Resolve tenant and actor from existing funcionarios table.
-- 2) Insert deterministic IDs/codes so reruns are safe.
-- 3) Use NOT EXISTS for tables without natural UNIQUE constraints.

-- Ensure tenant matrix profile cloned from global template.
INSERT INTO sgso_matriz_risco_perfis (
  empresa_id,
  codigo,
  nome,
  descricao,
  ativo,
  padrao,
  elevar_fadiga,
  exigir_aprovacao_alto,
  exigir_aprovacao_critico,
  created_at,
  updated_at
)
SELECT
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'ICAO_5X5_DEMO',
  'Matriz ICAO 5x5 Demo',
  'Perfil demo para validacao visual do modulo SGSO.',
  1,
  1,
  1,
  1,
  1,
  datetime('now'),
  datetime('now')
WHERE NOT EXISTS (
  SELECT 1
  FROM sgso_matriz_risco_perfis
  WHERE empresa_id = (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1)
    AND codigo = 'ICAO_5X5_DEMO'
);

-- Clone matrix cells from global template into tenant demo profile.
INSERT INTO sgso_matriz_risco_celulas (
  perfil_id,
  codigo_probabilidade,
  ordem_probabilidade,
  severidade,
  score,
  nivel_risco,
  token_cor,
  prazo_resposta_horas,
  exige_aprovacao,
  created_at
)
SELECT
  p.id,
  c.codigo_probabilidade,
  c.ordem_probabilidade,
  c.severidade,
  c.score,
  c.nivel_risco,
  c.token_cor,
  c.prazo_resposta_horas,
  c.exige_aprovacao,
  datetime('now')
FROM sgso_matriz_risco_perfis p
JOIN sgso_matriz_risco_perfis t
  ON t.empresa_id = 0
 AND t.codigo = 'ICAO_5X5_DEFAULT'
JOIN sgso_matriz_risco_celulas c
  ON c.perfil_id = t.id
WHERE p.empresa_id = (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1)
  AND p.codigo = 'ICAO_5X5_DEMO'
  AND NOT EXISTS (
    SELECT 1
    FROM sgso_matriz_risco_celulas x
    WHERE x.perfil_id = p.id
  );

-- Create tenant-specific FRAT model and clone global factors.
INSERT INTO sgso_frat_modelos (
  empresa_id,
  codigo,
  nome,
  descricao,
  categoria_operacao,
  ativo,
  exige_aprovacao_risco_alto,
  exige_aprovacao_risco_critico,
  created_at,
  updated_at
)
SELECT
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'FRAT_OFFSHORE_DEMO',
  'FRAT Offshore Demo',
  'Modelo FRAT demo para visualizacao operacional.',
  'OFFSHORE',
  1,
  1,
  1,
  datetime('now'),
  datetime('now')
WHERE NOT EXISTS (
  SELECT 1
  FROM sgso_frat_modelos
  WHERE empresa_id = (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1)
    AND codigo = 'FRAT_OFFSHORE_DEMO'
);

INSERT INTO sgso_frat_fatores (
  modelo_id,
  empresa_id,
  codigo,
  categoria,
  pergunta,
  tipo_resposta,
  peso_base,
  ordem_exibicao,
  opcoes_json,
  regra_score_json,
  ativo,
  created_at,
  updated_at
)
SELECT
  demo.id,
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  base.codigo,
  base.categoria,
  base.pergunta,
  base.tipo_resposta,
  base.peso_base,
  base.ordem_exibicao,
  base.opcoes_json,
  base.regra_score_json,
  1,
  datetime('now'),
  datetime('now')
FROM sgso_frat_modelos demo
JOIN sgso_frat_modelos tmpl
  ON tmpl.empresa_id = 0
 AND tmpl.codigo = 'FRAT_OFFSHORE_PADRAO'
JOIN sgso_frat_fatores base
  ON base.modelo_id = tmpl.id
WHERE demo.empresa_id = (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1)
  AND demo.codigo = 'FRAT_OFFSHORE_DEMO'
  AND NOT EXISTS (
    SELECT 1
    FROM sgso_frat_fatores x
    WHERE x.modelo_id = demo.id
  );

-- RELPREV core records.
INSERT OR IGNORE INTO sgso_relatos (
  id,
  empresa_id,
  numero_protocolo,
  tipo,
  anonimo,
  relator_id,
  aeronave_matricula,
  aeronave_modelo,
  data_ocorrencia,
  local_icao,
  local_descricao,
  fase_voo,
  condicao_meteorologica,
  descricao,
  consequencia,
  accao_imediata,
  categoria_adrep,
  subcategoria_adrep,
  status,
  gso_responsavel_id,
  created_by,
  created_at,
  updated_at,
  tipo_investigacao,
  resumo_fechamento,
  licoes_aprendidas_json
)
VALUES
(
  'SGSO-DEMO-REL-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'REL-DEMO-2026-0001',
  'OCORRENCIA',
  0,
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'PR-ATD',
  'AW139',
  datetime('now', '-10 days'),
  'SBJR',
  'Area de embarque offshore - heliponto principal',
  'DECOLAGEM',
  'DEGRADADA',
  'Tripulacao reportou aproximacao de ave durante decolagem com manobra evasiva e breve aumento de carga de trabalho.',
  'Sem danos a aeronave, decolagem continuada com monitoramento reforcado.',
  'Aplicado checklist de bird hazard e coordenacao ATC.',
  'BIRD_STRIKE',
  'BIRD_ACTIVITY_NEAR_HELIPAD',
  'EM_ANALISE',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-10 days'),
  datetime('now', '-9 days'),
  'INCIDENTE_GRAVE',
  NULL,
  NULL
),
(
  'SGSO-DEMO-REL-0002',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'REL-DEMO-2026-0002',
  'PERIGO',
  0,
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'PR-ATD',
  'AW139',
  datetime('now', '-7 days'),
  'SBME',
  'Patio de manutencao',
  'SOLO',
  'VMC',
  'Equipe identificou tendencia de falha intermitente em radio VHF durante teste pre-voo.',
  'Nenhum impacto operacional imediato.',
  'Aeronave mantida em solo para inspecao eletronica.',
  'COMMUNICATIONS',
  'VHF_INTERMITTENT',
  'AGUARDANDO_ACAO',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-7 days'),
  datetime('now', '-6 days'),
  'OBSERVACAO',
  NULL,
  NULL
),
(
  'SGSO-DEMO-REL-0003',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'REL-DEMO-2026-0003',
  'INCIDENTE',
  0,
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'PR-BTR',
  'S76',
  datetime('now', '-4 days'),
  'SBGL',
  'Corredor de taxi',
  'TAXI',
  'NOITE_VMC',
  'Durante taxi noturno houve incursao de veiculo de apoio na taxiway com necessidade de frenagem preventiva.',
  'Sem danos, atraso de 12 minutos.',
  'Reporte imediato para torre e abertura de investigacao local.',
  'RUNWAY_INCURSION',
  'GROUND_VEHICLE_CONFLICT',
  'ABERTO',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-4 days'),
  datetime('now', '-4 days'),
  'INCIDENTE_GRAVE',
  NULL,
  NULL
),
(
  'SGSO-DEMO-REL-0004',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'REL-DEMO-2026-0004',
  'OCORRENCIA',
  0,
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'PR-HLX',
  'H145',
  datetime('now', '-14 days'),
  'SBCB',
  'Area de hangar B',
  'POS_VOO',
  'VMC',
  'Falha de briefing de handover entre turnos gerou atraso em inspeccao de pos-voo.',
  'Risco potencial de liberacao tardia de manutencao.',
  'Reuniao de debriefing e ajuste de checklist de transicao.',
  'PROCEDURAL_NON_COMPLIANCE',
  'HANDOVER_GAP',
  'FECHADO',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-14 days'),
  datetime('now', '-2 days'),
  'OBSERVACAO',
  'Encerrado com revisao de processo de handover e treinamento de supervisores.',
  '["Padronizar handover com checklist digital","Executar auditoria amostral semanal"]'
);

-- Capture metadata for RELPREV sync flow.
INSERT OR IGNORE INTO sgso_relato_capturas (
  relato_id,
  empresa_id,
  client_submission_id,
  canal_origem,
  sync_status,
  sync_tentativas,
  offline_capturado_em,
  sincronizado_em,
  o_que_resumo,
  onde_resumo,
  quando_resumo,
  timezone_offset_minutos,
  dispositivo_id,
  dispositivo_tipo,
  app_versao,
  latitude,
  longitude,
  precisao_metros,
  metadata_json,
  created_at,
  updated_at
)
VALUES
(
  'SGSO-DEMO-REL-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'CLIENT-DEMO-REL-0001',
  'WEB',
  'CONCILIADO',
  1,
  datetime('now', '-10 days', '-5 minutes'),
  datetime('now', '-10 days'),
  'Aproximacao de ave na decolagem',
  'Heliponto principal',
  'Turno da manha',
  -180,
  'WEB-DEMO-01',
  'DESKTOP',
  '2026.03.16',
  -22.914,
  -43.163,
  15.0,
  '{"source":"demo-seed"}',
  datetime('now', '-10 days'),
  datetime('now', '-10 days')
),
(
  'SGSO-DEMO-REL-0002',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'CLIENT-DEMO-REL-0002',
  'TABLET',
  'PROCESSADO',
  2,
  datetime('now', '-7 days', '-3 minutes'),
  datetime('now', '-7 days'),
  'Falha intermitente VHF',
  'Patio manutencao',
  'Inicio de turno',
  -180,
  'TAB-DEMO-22',
  'TABLET',
  '2026.03.16',
  -22.996,
  -43.369,
  12.0,
  '{"source":"demo-seed"}',
  datetime('now', '-7 days'),
  datetime('now', '-7 days')
),
(
  'SGSO-DEMO-REL-0003',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'CLIENT-DEMO-REL-0003',
  'MOBILE',
  'RECEBIDO',
  0,
  datetime('now', '-4 days', '-1 minutes'),
  datetime('now', '-4 days'),
  'Conflito com veiculo durante taxi',
  'Taxiway principal',
  'Operacao noturna',
  -180,
  'MOB-DEMO-05',
  'MOBILE',
  '2026.03.16',
  -22.809,
  -43.251,
  8.0,
  '{"source":"demo-seed"}',
  datetime('now', '-4 days'),
  datetime('now', '-4 days')
),
(
  'SGSO-DEMO-REL-0004',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'CLIENT-DEMO-REL-0004',
  'WEB',
  'CONCILIADO',
  1,
  datetime('now', '-14 days', '-2 minutes'),
  datetime('now', '-14 days'),
  'Gap de handover entre turnos',
  'Hangar B',
  'Fim de turno',
  -180,
  'WEB-DEMO-09',
  'DESKTOP',
  '2026.03.16',
  -22.932,
  -43.719,
  20.0,
  '{"source":"demo-seed"}',
  datetime('now', '-14 days'),
  datetime('now', '-14 days')
);

-- Just-culture privacy layer.
INSERT OR IGNORE INTO sgso_relato_privacidade (
  relato_id,
  empresa_id,
  modo_sigilo,
  consentimento_contato,
  relator_ciphertext,
  relator_nonce,
  relator_hash_busca,
  contato_ciphertext,
  contato_nonce,
  chave_versao,
  politica_acesso_json,
  ultimo_acesso_em,
  ultimo_acesso_por,
  created_at,
  updated_at
)
VALUES
(
  'SGSO-DEMO-REL-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'CONFIDENCIAL',
  1,
  'demo-ciphertext-relator-0001',
  'demo-nonce-0001',
  'demo-hash-0001',
  'demo-ciphertext-contato-0001',
  'demo-contato-nonce-0001',
  'k1',
  '{"allowed_roles":["ADMIN","GESTOR","GSO"]}',
  datetime('now', '-9 days'),
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-10 days'),
  datetime('now', '-9 days')
),
(
  'SGSO-DEMO-REL-0002',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'IDENTIFICADO',
  1,
  'demo-ciphertext-relator-0002',
  'demo-nonce-0002',
  'demo-hash-0002',
  'demo-ciphertext-contato-0002',
  'demo-contato-nonce-0002',
  'k1',
  '{"allowed_roles":["ADMIN","GESTOR","GSO"]}',
  datetime('now', '-6 days'),
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-7 days'),
  datetime('now', '-6 days')
),
(
  'SGSO-DEMO-REL-0003',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'CONFIDENCIAL',
  0,
  'demo-ciphertext-relator-0003',
  'demo-nonce-0003',
  'demo-hash-0003',
  'demo-ciphertext-contato-0003',
  'demo-contato-nonce-0003',
  'k1',
  '{"allowed_roles":["ADMIN","GESTOR","GSO"]}',
  datetime('now', '-4 days'),
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-4 days'),
  datetime('now', '-4 days')
),
(
  'SGSO-DEMO-REL-0004',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'ANONIMIZADO',
  0,
  'demo-ciphertext-relator-0004',
  'demo-nonce-0004',
  'demo-hash-0004',
  'demo-ciphertext-contato-0004',
  'demo-contato-nonce-0004',
  'k1',
  '{"allowed_roles":["ADMIN","GESTOR","GSO"]}',
  datetime('now', '-2 days'),
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-14 days'),
  datetime('now', '-2 days')
);

-- AI triage for next-gen pipeline.
INSERT OR IGNORE INTO sgso_relato_ia_triagem (
  relato_id,
  empresa_id,
  provedor_modelo,
  nome_modelo,
  prompt_versao,
  clareza_status,
  clareza_score,
  resumo_normalizado,
  recomendacao_reescrita,
  adrep_codigo_sugerido,
  adrep_confianca,
  eccairs2_codigo_sugerido,
  eccairs2_confianca,
  taxonomia_json,
  fingerprint_semantico,
  cluster_tendencia,
  casos_similares_qtd,
  casos_similares_json,
  sinal_tendencia,
  revisado_por,
  revisado_em,
  decisao_final,
  created_at,
  updated_at
)
VALUES
(
  'SGSO-DEMO-REL-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'cloudflare-ai',
  '@cf/meta/llama-3.1-8b-instruct',
  'v2.1',
  'APROVADO',
  0.92,
  'Atividade de aves em area de decolagem com risco de bird strike.',
  'Adicionar altura aproximada e distancia da ave para calibrar score.',
  'BIRD_STRIKE',
  0.88,
  'ADREP.BIRD.01',
  0.81,
  '{"adrep":"BIRD_STRIKE","eccairs2":"ADREP.BIRD.01"}',
  'fp-demo-0001',
  'cluster-bird-activity',
  2,
  '["REL-DEMO-2026-0001","REL-DEMO-2026-0003"]',
  'EM_OBSERVACAO',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-8 days'),
  'ACEITA',
  datetime('now', '-10 days'),
  datetime('now', '-8 days')
),
(
  'SGSO-DEMO-REL-0002',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'cloudflare-ai',
  '@cf/meta/llama-3.1-8b-instruct',
  'v2.1',
  'REVISAO_MANUAL',
  0.74,
  'Falha intermitente em comunicacao VHF durante pre-voo.',
  'Confirmar duracao da indisponibilidade e impacto na missao.',
  'COMMUNICATIONS',
  0.69,
  'ADREP.COMM.02',
  0.65,
  '{"adrep":"COMMUNICATIONS","eccairs2":"ADREP.COMM.02"}',
  'fp-demo-0002',
  'cluster-comm-maint',
  1,
  '["REL-DEMO-2026-0002"]',
  'SEM_SINAL',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-5 days'),
  'AJUSTADA',
  datetime('now', '-7 days'),
  datetime('now', '-5 days')
),
(
  'SGSO-DEMO-REL-0003',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'cloudflare-ai',
  '@cf/meta/llama-3.1-8b-instruct',
  'v2.1',
  'PENDENTE',
  0.00,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'fp-demo-0003',
  'cluster-ground-ops',
  0,
  '[]',
  'SEM_SINAL',
  NULL,
  NULL,
  NULL,
  datetime('now', '-4 days'),
  datetime('now', '-4 days')
),
(
  'SGSO-DEMO-REL-0004',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'cloudflare-ai',
  '@cf/meta/llama-3.1-8b-instruct',
  'v2.1',
  'APROVADO',
  0.90,
  'Falha de handover com risco de atraso na manutencao.',
  'Sugerir check de assinatura digital no handover.',
  'PROCEDURAL_NON_COMPLIANCE',
  0.84,
  'ADREP.PROC.04',
  0.78,
  '{"adrep":"PROCEDURAL_NON_COMPLIANCE","eccairs2":"ADREP.PROC.04"}',
  'fp-demo-0004',
  'cluster-handover',
  1,
  '["REL-DEMO-2026-0004"]',
  'EM_OBSERVACAO',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-2 days'),
  'ACEITA',
  datetime('now', '-14 days'),
  datetime('now', '-2 days')
);

-- Hazard register and linkage.
INSERT OR IGNORE INTO sgso_perigos (
  id,
  empresa_id,
  codigo,
  titulo,
  descricao,
  categoria_principal,
  fonte_principal,
  status,
  responsavel_id,
  primeira_ocorrencia_em,
  ultima_ocorrencia_em,
  created_by,
  created_at,
  updated_at
)
VALUES
(
  'SGSO-DEMO-HAZ-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'HZD-DEMO-001',
  'Atividade de aves em area de decolagem',
  'Concentracao recorrente de aves proxima ao corredor de subida inicial.',
  'FAUNA',
  'RELPREV',
  'ATIVO',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-30 days'),
  datetime('now', '-1 days'),
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-30 days'),
  datetime('now', '-1 days')
),
(
  'SGSO-DEMO-HAZ-0002',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'HZD-DEMO-002',
  'Conflito veiculo-aeronave em solo',
  'Movimento nao coordenado de veiculos em area de taxi.',
  'OPERACAO_SOLO',
  'RELPREV',
  'EM_MONITORAMENTO',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-20 days'),
  datetime('now', '-4 days'),
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-20 days'),
  datetime('now', '-4 days')
);

INSERT OR IGNORE INTO sgso_relato_perigos (relato_id, perigo_id, empresa_id, origem_vinculo, confianca, created_at)
VALUES
('SGSO-DEMO-REL-0001', 'SGSO-DEMO-HAZ-0001', (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1), 'IA', 0.88, datetime('now', '-9 days')),
('SGSO-DEMO-REL-0003', 'SGSO-DEMO-HAZ-0002', (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1), 'MANUAL', 0.95, datetime('now', '-4 days'));

-- Bowtie scenario and barriers.
INSERT OR IGNORE INTO sgso_bowtie_cenarios (
  id,
  empresa_id,
  perigo_id,
  codigo,
  evento_central,
  descricao,
  perfil_matriz_id,
  owner_id,
  status,
  created_by,
  created_at,
  updated_at
)
VALUES (
  'SGSO-DEMO-BOW-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'SGSO-DEMO-HAZ-0001',
  'BOW-DEMO-001',
  'Bird strike durante decolagem',
  'Cenario bowtie para mitigar ocorrencias com aves na decolagem.',
  (SELECT id FROM sgso_matriz_risco_perfis WHERE empresa_id = (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1) AND codigo = 'ICAO_5X5_DEMO' LIMIT 1),
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'ATIVO',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-9 days'),
  datetime('now', '-1 days')
);

INSERT OR IGNORE INTO sgso_bowtie_nos (cenario_id, empresa_id, tipo_no, codigo, titulo, descricao, ordem_exibicao, origem_relato_id, created_at, updated_at)
VALUES
('SGSO-DEMO-BOW-0001', (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1), 'AMEACA', 'AM-001', 'Aves em baixa altitude', 'Concentracao de aves no eixo de subida inicial.', 10, 'SGSO-DEMO-REL-0001', datetime('now', '-9 days'), datetime('now', '-1 days')),
('SGSO-DEMO-BOW-0001', (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1), 'CONSEQUENCIA', 'CS-001', 'Dano em para-brisa/rotor', 'Impacto potencial com dano estrutural e retorno imediato.', 20, 'SGSO-DEMO-REL-0001', datetime('now', '-9 days'), datetime('now', '-1 days'));

INSERT OR IGNORE INTO sgso_bowtie_barreiras (
  id,
  empresa_id,
  cenario_id,
  codigo,
  nome,
  descricao,
  tipo_barreira,
  origem_tipo,
  owner_id,
  status_saude,
  efetividade_percentual,
  verificado_em,
  vence_em,
  created_by,
  created_at,
  updated_at
)
VALUES
(
  'SGSO-DEMO-BAR-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'SGSO-DEMO-BOW-0001',
  'BAR-DEMO-001',
  'Ronda anti-fauna pre-turno',
  'Inspecao e dispersao de aves antes do primeiro despacho.',
  'PREVENTIVA',
  'PROCEDIMENTO',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'OPERANTE',
  92,
  datetime('now', '-1 days'),
  datetime('now', '+30 days'),
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-9 days'),
  datetime('now', '-1 days')
),
(
  'SGSO-DEMO-BAR-0002',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'SGSO-DEMO-BOW-0001',
  'BAR-DEMO-002',
  'Treinamento de manobra evasiva',
  'Treinamento semestral para resposta rapida a bird activity.',
  'RECUPERACAO',
  'TREINAMENTO',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'DEGRADADA',
  68,
  datetime('now', '-15 days'),
  datetime('now', '+20 days'),
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-9 days'),
  datetime('now', '-1 days')
);

INSERT OR IGNORE INTO sgso_bowtie_barreira_vinculos (barreira_id, no_id, empresa_id, created_at)
SELECT 'SGSO-DEMO-BAR-0001', n.id, n.empresa_id, datetime('now', '-8 days')
FROM sgso_bowtie_nos n
WHERE n.cenario_id = 'SGSO-DEMO-BOW-0001' AND n.tipo_no = 'AMEACA' AND n.codigo = 'AM-001';

INSERT OR IGNORE INTO sgso_bowtie_barreira_vinculos (barreira_id, no_id, empresa_id, created_at)
SELECT 'SGSO-DEMO-BAR-0002', n.id, n.empresa_id, datetime('now', '-8 days')
FROM sgso_bowtie_nos n
WHERE n.cenario_id = 'SGSO-DEMO-BOW-0001' AND n.tipo_no = 'CONSEQUENCIA' AND n.codigo = 'CS-001';

INSERT INTO sgso_bowtie_barreira_historico (barreira_id, empresa_id, status_anterior, status_novo, motivo_tipo, motivo_ref_id, observacao, alterado_por, alterado_em)
SELECT
  'SGSO-DEMO-BAR-0002',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'OPERANTE',
  'DEGRADADA',
  'AUDITORIA',
  'SGSO-DEMO-AUD-0001',
  'Degradacao registrada apos finding em auditoria operacional.',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-3 days')
WHERE NOT EXISTS (
  SELECT 1
  FROM sgso_bowtie_barreira_historico
  WHERE barreira_id = 'SGSO-DEMO-BAR-0002'
    AND status_novo = 'DEGRADADA'
    AND motivo_ref_id = 'SGSO-DEMO-AUD-0001'
);

-- Risk evaluation (initial + residual).
INSERT INTO sgso_avaliacao_risco (
  relato_id,
  empresa_id,
  tipo_avaliacao,
  probabilidade,
  severidade,
  nivel_risco,
  probabilidade_original,
  elevado_por_fadiga,
  justificativa_elevacao,
  justificativa,
  avaliador_id,
  data_avaliacao,
  created_at,
  updated_at
)
SELECT
  'SGSO-DEMO-REL-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'INICIAL',
  'B',
  4,
  'ALTO',
  'C',
  1,
  'Tripulacao vinha de janela operacional estendida.',
  'Risco inicial alto devido recorrencia de aves no eixo de decolagem.',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-9 days'),
  datetime('now', '-9 days'),
  datetime('now', '-9 days')
WHERE NOT EXISTS (
  SELECT 1 FROM sgso_avaliacao_risco WHERE relato_id = 'SGSO-DEMO-REL-0001' AND tipo_avaliacao = 'INICIAL' AND deleted_at IS NULL
);

INSERT INTO sgso_avaliacao_risco (
  relato_id,
  empresa_id,
  tipo_avaliacao,
  probabilidade,
  severidade,
  nivel_risco,
  probabilidade_original,
  elevado_por_fadiga,
  justificativa,
  avaliador_id,
  data_avaliacao,
  created_at,
  updated_at
)
SELECT
  'SGSO-DEMO-REL-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'RESIDUAL',
  'C',
  3,
  'MEDIO',
  'C',
  0,
  'Risco residual reduzido apos reforco de barreiras.',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-2 days'),
  datetime('now', '-2 days'),
  datetime('now', '-2 days')
WHERE NOT EXISTS (
  SELECT 1 FROM sgso_avaliacao_risco WHERE relato_id = 'SGSO-DEMO-REL-0001' AND tipo_avaliacao = 'RESIDUAL' AND deleted_at IS NULL
);

INSERT OR IGNORE INTO sgso_avaliacao_risco_contexto (
  avaliacao_risco_id,
  empresa_id,
  perfil_id,
  score_calculado,
  apetite_violado,
  exige_aprovacao,
  aprovacao_status,
  aprovado_por,
  aprovado_em,
  justificativa_aprovacao,
  snapshot_json,
  created_at,
  updated_at
)
SELECT
  ar.id,
  ar.empresa_id,
  (SELECT id FROM sgso_matriz_risco_perfis WHERE empresa_id = ar.empresa_id AND codigo = 'ICAO_5X5_DEMO' LIMIT 1),
  16,
  1,
  1,
  'APROVADO',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-8 days'),
  'Aprovacao gerencial concedida para continuidade da operacao com mitigacoes.',
  '{"seed":"demo"}',
  datetime('now', '-8 days'),
  datetime('now', '-8 days')
FROM sgso_avaliacao_risco ar
WHERE ar.relato_id = 'SGSO-DEMO-REL-0001'
  AND ar.tipo_avaliacao = 'INICIAL'
  AND ar.deleted_at IS NULL;

-- Audits and non-conformities.
INSERT OR IGNORE INTO sgso_auditorias (
  id,
  empresa_id,
  tipo,
  titulo,
  descricao,
  data_programada,
  data_realizada,
  auditor_id,
  auditado_setor,
  status,
  total_itens,
  itens_conformes,
  itens_nc_major,
  itens_nc_minor,
  itens_observacao,
  percentual_conformidade,
  observacoes_gerais,
  created_by,
  created_at,
  updated_at
)
VALUES (
  'SGSO-DEMO-AUD-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'OPERACIONAL',
  'Auditoria operacional demo SGSO',
  'Auditoria de demonstracao para fluxo completo de findings e CAPA.',
  date('now', '-5 days'),
  date('now', '-3 days'),
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'Operacoes de voo',
  'CONCLUIDA',
  3,
  1,
  1,
  1,
  0,
  33.33,
  'Finding major relacionado a disciplina de patio e um finding minor de checklist.',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-5 days'),
  datetime('now', '-3 days')
);

INSERT INTO sgso_auditoria_itens (
  auditoria_id,
  empresa_id,
  numero_item,
  descricao,
  rbac_referencia,
  criterio_aceitacao,
  resultado,
  evidencia,
  verificado_por,
  verificado_em,
  created_at,
  updated_at
)
SELECT
  'SGSO-DEMO-AUD-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  1,
  'Controle de acesso de veiculos em area de taxi.',
  'RBAC-121.95',
  'Somente veiculos autorizados e escoltados.',
  'NC_MAJOR',
  'Veiculo de apoio cruzou area critica sem autorizacao formal.',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-3 days'),
  datetime('now', '-3 days'),
  datetime('now', '-3 days')
WHERE NOT EXISTS (
  SELECT 1 FROM sgso_auditoria_itens WHERE auditoria_id = 'SGSO-DEMO-AUD-0001' AND numero_item = 1
);

INSERT INTO sgso_auditoria_itens (
  auditoria_id,
  empresa_id,
  numero_item,
  descricao,
  rbac_referencia,
  criterio_aceitacao,
  resultado,
  evidencia,
  verificado_por,
  verificado_em,
  created_at,
  updated_at
)
SELECT
  'SGSO-DEMO-AUD-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  2,
  'Checklist de handover de turno concluido e assinado.',
  'RBAC-121.133',
  'Checklist completo e assinado por supervisor.',
  'NC_MINOR',
  'Assinatura ausente em 1 amostra de 8 verificadas.',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-3 days'),
  datetime('now', '-3 days'),
  datetime('now', '-3 days')
WHERE NOT EXISTS (
  SELECT 1 FROM sgso_auditoria_itens WHERE auditoria_id = 'SGSO-DEMO-AUD-0001' AND numero_item = 2
);

INSERT INTO sgso_auditoria_itens (
  auditoria_id,
  empresa_id,
  numero_item,
  descricao,
  rbac_referencia,
  criterio_aceitacao,
  resultado,
  evidencia,
  verificado_por,
  verificado_em,
  created_at,
  updated_at
)
SELECT
  'SGSO-DEMO-AUD-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  3,
  'Briefing de mitigacao de fauna antes do primeiro despacho.',
  'RBAC-121.339',
  'Briefing registrado para todas as tripulacoes do turno.',
  'CONFORME',
  'Registro completo no quadro operacional.',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-3 days'),
  datetime('now', '-3 days'),
  datetime('now', '-3 days')
WHERE NOT EXISTS (
  SELECT 1 FROM sgso_auditoria_itens WHERE auditoria_id = 'SGSO-DEMO-AUD-0001' AND numero_item = 3
);

INSERT INTO sgso_nao_conformidades (
  empresa_id,
  auditoria_id,
  auditoria_item_id,
  relato_id,
  tipo,
  descricao,
  rbac_referencia,
  causa_raiz,
  responsavel_id,
  prazo_resolucao,
  status,
  created_by,
  created_at,
  updated_at
)
SELECT
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'SGSO-DEMO-AUD-0001',
  i.id,
  'SGSO-DEMO-REL-0003',
  'MAJOR',
  'Controle de acesso de veiculos em taxiway insuficiente.',
  'RBAC-121.95',
  'Falha de disciplina operacional e ausencia de barreira fisica.',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  date('now', '+10 days'),
  'EM_RESOLUCAO',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-3 days'),
  datetime('now', '-2 days')
FROM sgso_auditoria_itens i
WHERE i.auditoria_id = 'SGSO-DEMO-AUD-0001'
  AND i.numero_item = 1
  AND NOT EXISTS (
    SELECT 1 FROM sgso_nao_conformidades n WHERE n.auditoria_item_id = i.id AND n.deleted_at IS NULL
  );

-- Corrective actions linked to relato + NC.
INSERT INTO sgso_acoes_mitigacao (
  empresa_id,
  relato_id,
  tipo,
  descricao,
  categoria,
  responsavel_id,
  prazo,
  status,
  percentual_conclusao,
  evidencia_descricao,
  created_by,
  created_at,
  updated_at
)
SELECT
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'SGSO-DEMO-REL-0001',
  'PREVENTIVA',
  'Implementar ronda anti-fauna com registro digital por turno.',
  'PROCEDIMENTO',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  date('now', '+7 days'),
  'EM_ANDAMENTO',
  60,
  'Checklist digital criado e em uso piloto.',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-6 days'),
  datetime('now', '-1 days')
WHERE NOT EXISTS (
  SELECT 1
  FROM sgso_acoes_mitigacao
  WHERE relato_id = 'SGSO-DEMO-REL-0001'
    AND descricao = 'Implementar ronda anti-fauna com registro digital por turno.'
    AND deleted_at IS NULL
);

INSERT INTO sgso_acoes_mitigacao (
  empresa_id,
  nc_id,
  tipo,
  descricao,
  categoria,
  responsavel_id,
  prazo,
  status,
  percentual_conclusao,
  evidencia_descricao,
  created_by,
  created_at,
  updated_at
)
SELECT
  n.empresa_id,
  n.id,
  'CORRETIVA',
  'Reforcar controle de acesso em taxiway com barreira e autorizacao por radio.',
  'SUPERVISAO',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  date('now', '+10 days'),
  'PENDENTE',
  0,
  'Acao aberta a partir de finding major da auditoria.',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-2 days'),
  datetime('now', '-2 days')
FROM sgso_nao_conformidades n
WHERE n.auditoria_id = 'SGSO-DEMO-AUD-0001'
  AND n.tipo = 'MAJOR'
  AND n.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sgso_acoes_mitigacao a
    WHERE a.nc_id = n.id
      AND a.descricao = 'Reforcar controle de acesso em taxiway com barreira e autorizacao por radio.'
      AND a.deleted_at IS NULL
  );

-- Human factors + comments + files.
INSERT INTO sgso_relatos_fatores_humanos (
  relato_id,
  empresa_id,
  nivel_hfacs,
  categoria,
  subcategoria,
  descricao,
  efetividade_cognitiva_capturada,
  fonte_automatica,
  created_by,
  created_at,
  updated_at
)
SELECT
  'SGSO-DEMO-REL-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'PRECONDICOES',
  'FADIGA',
  'MICRO_SONO',
  'Indicadores de fadiga moderada no turno de decolagem.',
  71.5,
  1,
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-9 days'),
  datetime('now', '-9 days')
WHERE NOT EXISTS (
  SELECT 1 FROM sgso_relatos_fatores_humanos
  WHERE relato_id = 'SGSO-DEMO-REL-0001' AND nivel_hfacs = 'PRECONDICOES' AND categoria = 'FADIGA' AND deleted_at IS NULL
);

INSERT INTO sgso_relatos_comentarios (relato_id, empresa_id, texto, interno, autor_id, created_at)
SELECT
  'SGSO-DEMO-REL-0003',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'Solicitar imagem de CFTV para consolidar linha do tempo da incursao.',
  1,
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-3 days')
WHERE NOT EXISTS (
  SELECT 1 FROM sgso_relatos_comentarios WHERE relato_id = 'SGSO-DEMO-REL-0003' AND texto = 'Solicitar imagem de CFTV para consolidar linha do tempo da incursao.' AND deleted_at IS NULL
);

INSERT INTO sgso_relatos_arquivos (
  relato_id,
  empresa_id,
  url,
  nome_original,
  tipo_mime,
  tamanho_bytes,
  tipo_documento,
  descricao,
  uploaded_by,
  created_at
)
SELECT
  'SGSO-DEMO-REL-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'https://r2.airtrust/sgso/demo/bird-activity-0001.jpg',
  'bird-activity-0001.jpg',
  'image/jpeg',
  248321,
  'FOTO_OCORRENCIA',
  'Foto da area com concentracao de aves antes da decolagem.',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-9 days')
WHERE NOT EXISTS (
  SELECT 1 FROM sgso_relatos_arquivos WHERE relato_id = 'SGSO-DEMO-REL-0001' AND nome_original = 'bird-activity-0001.jpg' AND deleted_at IS NULL
);

INSERT OR IGNORE INTO sgso_relatos_midias_metadados (
  arquivo_id,
  relato_id,
  empresa_id,
  geotag_latitude,
  geotag_longitude,
  geotag_precisao_metros,
  capturado_em,
  origem_dispositivo,
  hash_arquivo,
  metadados_exif_json,
  created_at
)
SELECT
  a.id,
  a.relato_id,
  a.empresa_id,
  -22.914,
  -43.163,
  5.0,
  datetime('now', '-9 days'),
  'MOBILE',
  'hash-demo-mid-0001',
  '{"lens":"wide","iso":400}',
  datetime('now', '-9 days')
FROM sgso_relatos_arquivos a
WHERE a.relato_id = 'SGSO-DEMO-REL-0001'
  AND a.nome_original = 'bird-activity-0001.jpg'
  AND a.deleted_at IS NULL;

-- Workflow and notifier traces.
INSERT INTO sgso_relato_workflow_eventos (relato_id, empresa_id, tipo_evento, status_evento, visivel_relator, payload_json, ator_id, criado_em)
SELECT
  'SGSO-DEMO-REL-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'RECEBIMENTO',
  'CONCLUIDO',
  1,
  '{"channel":"WEB"}',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-10 days')
WHERE NOT EXISTS (
  SELECT 1 FROM sgso_relato_workflow_eventos WHERE relato_id = 'SGSO-DEMO-REL-0001' AND tipo_evento = 'RECEBIMENTO'
);

INSERT INTO sgso_relato_workflow_eventos (relato_id, empresa_id, tipo_evento, status_evento, visivel_relator, payload_json, ator_id, criado_em)
SELECT
  'SGSO-DEMO-REL-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'CLASSIFICACAO_IA',
  'CONCLUIDO',
  1,
  '{"adrep":"BIRD_STRIKE","confidence":0.88}',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-9 days')
WHERE NOT EXISTS (
  SELECT 1 FROM sgso_relato_workflow_eventos WHERE relato_id = 'SGSO-DEMO-REL-0001' AND tipo_evento = 'CLASSIFICACAO_IA'
);

INSERT INTO sgso_relato_workflow_eventos (relato_id, empresa_id, tipo_evento, status_evento, visivel_relator, payload_json, ator_id, criado_em)
SELECT
  'SGSO-DEMO-REL-0004',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'ENCERRAMENTO',
  'CONCLUIDO',
  1,
  '{"closure":"process update and training"}',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-2 days')
WHERE NOT EXISTS (
  SELECT 1 FROM sgso_relato_workflow_eventos WHERE relato_id = 'SGSO-DEMO-REL-0004' AND tipo_evento = 'ENCERRAMENTO'
);

INSERT INTO sgso_relato_notificacoes (
  relato_id,
  workflow_evento_id,
  empresa_id,
  template_codigo,
  canal,
  destino_tipo,
  status,
  referencia_externa,
  payload_json,
  enviada_em,
  lida_em,
  created_at
)
SELECT
  'SGSO-DEMO-REL-0001',
  NULL,
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'SGSO_TRIAGEM_CONFIRMADA',
  'INAPP',
  'RELATOR',
  'LIDA',
  'notif-demo-0001',
  '{"message":"Seu relato foi recebido e esta em triagem"}',
  datetime('now', '-9 days'),
  datetime('now', '-9 days', '+1 hours'),
  datetime('now', '-9 days')
WHERE NOT EXISTS (
  SELECT 1 FROM sgso_relato_notificacoes WHERE relato_id = 'SGSO-DEMO-REL-0001' AND template_codigo = 'SGSO_TRIAGEM_CONFIRMADA' AND canal = 'INAPP'
);

INSERT INTO sgso_audit_trail (empresa_id, agregado_tipo, agregado_id, acao, ator_id, origem, payload_hash, payload_json, created_at)
SELECT
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'RELPREV',
  'SGSO-DEMO-REL-0001',
  'SEED_DEMO_CREATED',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'MANUAL',
  'audit-seed-hash-0001',
  '{"source":"seed-sgso-demo-full.sql"}',
  datetime('now', '-9 days')
WHERE NOT EXISTS (
  SELECT 1 FROM sgso_audit_trail WHERE agregado_tipo = 'RELPREV' AND agregado_id = 'SGSO-DEMO-REL-0001' AND acao = 'SEED_DEMO_CREATED'
);

-- FRAT evaluation and approvals.
INSERT OR IGNORE INTO sgso_frat_avaliacoes (
  id,
  empresa_id,
  modelo_id,
  escala_id,
  alocacao_id,
  tripulante_id,
  aeronave_id,
  data_operacao,
  score_total,
  nivel_risco,
  status,
  exige_aprovacao,
  aprovado_por,
  aprovado_em,
  despacho_bloqueado,
  justificativa,
  created_by,
  created_at,
  updated_at
)
VALUES (
  'SGSO-DEMO-FRAT-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  (SELECT id FROM sgso_frat_modelos WHERE empresa_id = (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1) AND codigo = 'FRAT_OFFSHORE_DEMO' LIMIT 1),
  NULL,
  NULL,
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  NULL,
  date('now', '-1 days'),
  12.5,
  'ALTO',
  'APROVADO',
  1,
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-1 days', '+2 hours'),
  0,
  'Aprovado com mitigacoes adicionais de briefing e monitoramento meteo.',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-1 days'),
  datetime('now', '-1 days')
);

INSERT INTO sgso_frat_respostas (avaliacao_id, fator_id, empresa_id, resposta_texto, resposta_numero, score_aplicado, observacao, created_at)
SELECT
  'SGSO-DEMO-FRAT-0001',
  f.id,
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  CASE WHEN f.codigo = 'CLIMA_ADVERSO' THEN 'IMC' ELSE 'true' END,
  NULL,
  CASE
    WHEN f.codigo = 'FADIGA' THEN 3.0
    WHEN f.codigo = 'SONO_RESTRITO' THEN 2.5
    WHEN f.codigo = 'CLIMA_ADVERSO' THEN 2.5
    ELSE 1.5
  END,
  'Resposta demo para visualizacao de score composto.',
  datetime('now', '-1 days')
FROM sgso_frat_fatores f
WHERE f.modelo_id = (SELECT id FROM sgso_frat_modelos WHERE empresa_id = (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1) AND codigo = 'FRAT_OFFSHORE_DEMO' LIMIT 1)
  AND f.codigo IN ('FADIGA', 'SONO_RESTRITO', 'CLIMA_ADVERSO', 'JANELA_OPERACIONAL')
  AND NOT EXISTS (
    SELECT 1 FROM sgso_frat_respostas r WHERE r.avaliacao_id = 'SGSO-DEMO-FRAT-0001' AND r.fator_id = f.id
  );

INSERT INTO sgso_frat_aprovacoes (avaliacao_id, empresa_id, decisao, aprovador_id, motivo, despacho_liberado, created_at)
SELECT
  'SGSO-DEMO-FRAT-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'APROVAR',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'Risco alto controlado com mitigacoes em vigor.',
  1,
  datetime('now', '-1 days', '+2 hours')
WHERE NOT EXISTS (
  SELECT 1 FROM sgso_frat_aprovacoes WHERE avaliacao_id = 'SGSO-DEMO-FRAT-0001' AND decisao = 'APROVAR'
);

-- Typed workflow closure artifacts (MOC + lessons learned).
INSERT OR IGNORE INTO sgso_moc_registros (
  id,
  empresa_id,
  titulo,
  descricao_mudanca,
  motivo,
  impacto_operacional,
  risco_nivel,
  status,
  data_planejada,
  owner_id,
  aprovado_por,
  aprovado_em,
  areas_afetadas_json,
  mitigacoes_planejadas_json,
  created_by,
  created_at,
  updated_at
)
VALUES (
  'SGSO-DEMO-MOC-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'Mudanca de procedimento de handover operacional',
  'Implantar checklist digital com assinatura obrigatoria entre turnos.',
  'Eliminar gaps identificados em auditoria operacional.',
  'Reduz risco de perda de informacao critica entre equipes.',
  'MEDIO',
  'APROVADO',
  date('now', '+5 days'),
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-1 days'),
  '["Operacoes de voo","COA","SMS"]',
  '["Treinamento de supervisores","Auditoria amostral semanal"]',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-2 days'),
  datetime('now', '-1 days')
);

INSERT INTO sgso_moc_aprovacoes (moc_id, empresa_id, status_novo, observacao, aprovador_id, created_at)
SELECT
  'SGSO-DEMO-MOC-0001',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'APROVADO',
  'Aprovacao demo para fluxo completo de MoC.',
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-1 days')
WHERE NOT EXISTS (
  SELECT 1 FROM sgso_moc_aprovacoes WHERE moc_id = 'SGSO-DEMO-MOC-0001' AND status_novo = 'APROVADO'
);

INSERT OR IGNORE INTO sgso_licoes_aprendidas (
  relato_id,
  empresa_id,
  titulo,
  resumo,
  licoes_json,
  investigation_type,
  status_publicacao,
  edapp_course_id,
  edapp_publicado_em,
  erro_publicacao,
  created_by,
  created_at,
  updated_at
)
VALUES (
  'SGSO-DEMO-REL-0004',
  (SELECT empresa_id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  'Licoes: handover operacional sem perda de contexto',
  'Padronizacao de handover reduziu risco de omissao em manutencao e despacho.',
  '["Checklist digital obrigatorio","Responsavel por assinatura por turno","Auditoria de aderencia semanal"]',
  'OBSERVACAO',
  'PUBLICADO',
  'edapp-demo-sgso-handover',
  datetime('now', '-1 days'),
  NULL,
  (SELECT id FROM funcionarios WHERE deleted_at IS NULL ORDER BY id LIMIT 1),
  datetime('now', '-2 days'),
  datetime('now', '-1 days')
);


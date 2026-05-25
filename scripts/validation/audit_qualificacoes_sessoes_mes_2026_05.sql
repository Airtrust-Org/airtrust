-- AUDITORIA READ-ONLY: qualificacoes planejadas por sessão (maio/2026)
-- Escopo: simulador_agendamentos + sessoes_participantes/fichas_sessao + qualificacoes_historico
-- Regras espelham criarQualificacoesPlanejadas/listarParticipantesDaSessaoParaQualificacao.

WITH
params AS (
  SELECT '2026-05-01' AS dt_ini, '2026-06-01' AS dt_fim
),
sessoes_mes AS (
  SELECT
    sa.id AS sessao_id,
    sa.data,
    sa.tipo_sessao,
    sa.nome AS tema_sessao,
    sa.status AS sessao_status,
    sa.simulador_id,
    sa.template_id,
    sa.empresa_id,
    COALESCE(s.aeronave_codigo, s.codigo_aeronave, s.tipo, s.modelo, '') AS modelo_raw,
    CASE
      WHEN UPPER(REPLACE(REPLACE(COALESCE(s.aeronave_codigo, s.codigo_aeronave, s.tipo, s.modelo, ''), '-', ''), ' ', '')) LIKE '%SK76%'
        OR UPPER(REPLACE(REPLACE(COALESCE(s.aeronave_codigo, s.codigo_aeronave, s.tipo, s.modelo, ''), '-', ''), ' ', '')) LIKE '%S76%'
        OR UPPER(REPLACE(REPLACE(COALESCE(s.aeronave_codigo, s.codigo_aeronave, s.tipo, s.modelo, ''), '-', ''), ' ', '')) = '76'
        THEN 'SK76'
      WHEN UPPER(COALESCE(s.aeronave_codigo, s.codigo_aeronave, s.tipo, s.modelo, '')) LIKE '%AW139%'
        THEN 'AW139'
      ELSE UPPER(TRIM(COALESCE(s.aeronave_codigo, s.codigo_aeronave, s.tipo, s.modelo, '')))
    END AS modelo_norm
  FROM simulador_agendamentos sa
  LEFT JOIN simuladores s ON s.id = sa.simulador_id AND s.deleted_at IS NULL
  JOIN params p ON sa.data >= p.dt_ini AND sa.data < p.dt_fim
  WHERE sa.deleted_at IS NULL
),
modelo_resolvido AS (
  SELECT
    sm.*,
    COALESCE(
      sm.template_id,
      (
        SELECT ms.id
        FROM modelos_sessao ms
        INNER JOIN tipos_sessao ts ON ts.id = ms.tipo_sessao_id
        WHERE ts.codigo = sm.tipo_sessao
          AND UPPER(COALESCE(ms.modelo_aeronave, '')) = sm.modelo_norm
          AND ms.deleted_at IS NULL
          AND ms.gera_qualificacao = 1
        ORDER BY ms.id DESC
        LIMIT 1
      ),
      (
        SELECT ms.id
        FROM modelos_sessao ms
        INNER JOIN tipos_sessao ts ON ts.id = ms.tipo_sessao_id
        WHERE ts.codigo = sm.tipo_sessao
          AND UPPER(COALESCE(ms.modelo_aeronave, '')) = sm.modelo_norm
          AND ms.deleted_at IS NULL
        ORDER BY ms.id DESC
        LIMIT 1
      )
    ) AS modelo_id_resolvido
  FROM sessoes_mes sm
),
modelo_completo AS (
  SELECT
    mr.*,
    ms.codigo AS modelo_codigo,
    ms.nome AS modelo_nome,
    COALESCE(ms.tipo, 'SIMULADOR') AS modelo_tipo,
    ms.gera_qualificacao,
    ms.qualificacao_tipo_id,
    ms.duracao_estimada,
    qt.codigo AS qual_codigo,
    qt.nome AS qual_nome,
    qt.categoria AS qual_categoria,
    qt.validade AS qual_validade,
    CASE WHEN UPPER(COALESCE(ms.tipo, 'SIMULADOR')) = 'AERONAVE' THEN 'VOO' ELSE 'SIMULADOR' END AS tipo
  FROM modelo_resolvido mr
  LEFT JOIN modelos_sessao ms ON ms.id = mr.modelo_id_resolvido AND ms.deleted_at IS NULL
  LEFT JOIN qualificacoes_tipos qt ON qt.id = ms.qualificacao_tipo_id AND qt.deleted_at IS NULL
),
participantes_base AS (
  SELECT DISTINCT sp.sessao_id, sp.funcionario_id
  FROM sessoes_participantes sp
  INNER JOIN modelo_completo mc ON mc.sessao_id = sp.sessao_id
  WHERE sp.deleted_at IS NULL
),
participantes_fallback AS (
  SELECT DISTINCT fs.agendamento_slot_id AS sessao_id, fs.colaborador_id_aluno AS funcionario_id
  FROM fichas_sessao fs
  INNER JOIN modelo_completo mc ON mc.sessao_id = fs.agendamento_slot_id
  WHERE fs.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sessoes_participantes sp
      WHERE sp.sessao_id = fs.agendamento_slot_id
        AND sp.deleted_at IS NULL
    )
),
participantes AS (
  SELECT * FROM participantes_base
  UNION
  SELECT * FROM participantes_fallback
),
esperadas AS (
  SELECT
    mc.sessao_id,
    mc.data,
    mc.tipo,
    mc.modelo_norm AS aeronave_modelo,
    p.funcionario_id,
    mc.qualificacao_tipo_id,
    mc.qual_codigo,
    mc.qual_nome,
    mc.qual_categoria,
    mc.tipo_sessao,
    CASE
      WHEN UPPER(COALESCE(mc.tipo_sessao, '')) = 'INI' THEN 'INICIAL'
      WHEN UPPER(COALESCE(mc.tipo_sessao, '')) = 'PER' THEN 'RECORRENTE'
      WHEN UPPER(COALESCE(mc.tipo_sessao, '')) = 'SEM' THEN 'SEMESTRAL'
      ELSE mc.tipo_sessao
    END AS tipo_treinamento_esperado,
    mc.sessao_status,
    mc.modelo_id_resolvido,
    mc.modelo_nome,
    mc.tema_sessao,
    mc.empresa_id,
    CASE
      WHEN mc.modelo_id_resolvido IS NULL THEN 'SEM_MODELO'
      WHEN COALESCE(mc.gera_qualificacao, 0) <> 1 THEN 'MODELO_NAO_GERA'
      WHEN mc.qualificacao_tipo_id IS NULL OR mc.qual_codigo IS NULL THEN 'SEM_QUALIFICACAO_TIPO'
      ELSE 'OK'
    END AS elegibilidade
  FROM modelo_completo mc
  LEFT JOIN participantes p ON p.sessao_id = mc.sessao_id
),
existentes AS (
  SELECT
    qh.id,
    qh.sessao_id,
    qh.funcionario_id,
    qh.qualificacao_id,
    qh.qualificacao_codigo,
    qh.status,
    qh.deleted_at,
    qh.data_conclusao,
    qh.tipo_treinamento,
    qh.empresa_id
  FROM qualificacoes_historico qh
  WHERE qh.sessao_id IS NOT NULL
),
detalhe AS (
  SELECT
    e.data,
    e.sessao_id,
    e.tipo,
    e.aeronave_modelo,
    e.funcionario_id,
    COALESCE(f.nome, '(sem cadastro)') AS participante,
    e.qual_codigo AS qualificacao_esperada_codigo,
    e.qual_nome AS qualificacao_esperada_nome,
    e.elegibilidade,
    e.sessao_status,
    e.tema_sessao,
    e.tipo_sessao,
    e.modelo_nome,
    COALESCE((
      SELECT GROUP_CONCAT(qh.id || ':' || COALESCE(qh.qualificacao_codigo, '-') || ':' || COALESCE(qh.status, '-'), ' | ')
      FROM existentes qh
      WHERE qh.sessao_id = e.sessao_id
        AND qh.funcionario_id = e.funcionario_id
        AND qh.deleted_at IS NULL
    ), '') AS qualificacoes_encontradas,
    COALESCE((
      SELECT COUNT(*)
      FROM existentes qh
      WHERE qh.sessao_id = e.sessao_id
        AND qh.funcionario_id = e.funcionario_id
        AND qh.deleted_at IS NULL
        AND COALESCE(qh.status, '') <> 'CANCELADA'
        AND (
          (e.qual_codigo IS NOT NULL AND qh.qualificacao_codigo = e.qual_codigo)
          OR (e.qualificacao_tipo_id IS NOT NULL AND qh.qualificacao_id = e.qualificacao_tipo_id)
        )
    ), 0) AS match_ativo,
    COALESCE((
      SELECT COUNT(*)
      FROM existentes qh
      WHERE qh.sessao_id = e.sessao_id
        AND qh.funcionario_id = e.funcionario_id
        AND qh.deleted_at IS NULL
        AND COALESCE(qh.status, '') = 'CANCELADA'
        AND (
          (e.qual_codigo IS NOT NULL AND qh.qualificacao_codigo = e.qual_codigo)
          OR (e.qualificacao_tipo_id IS NOT NULL AND qh.qualificacao_id = e.qualificacao_tipo_id)
        )
    ), 0) AS match_cancelada,
    COALESCE((
      SELECT COUNT(*)
      FROM existentes qh
      WHERE qh.sessao_id = e.sessao_id
        AND qh.funcionario_id = e.funcionario_id
        AND qh.deleted_at IS NULL
        AND (e.qual_codigo IS NOT NULL AND qh.qualificacao_codigo = e.qual_codigo)
        AND qh.data_conclusao = e.data
    ), 0) AS total_mesma_chave_unique
  FROM esperadas e
  LEFT JOIN funcionarios f ON f.id = e.funcionario_id
  WHERE e.funcionario_id IS NOT NULL
),
orfas AS (
  SELECT
    qh.id,
    qh.sessao_id,
    qh.funcionario_id,
    qh.qualificacao_codigo,
    qh.status,
    qh.data_conclusao
  FROM qualificacoes_historico qh
  LEFT JOIN modelo_completo mc ON mc.sessao_id = qh.sessao_id
  JOIN params p ON qh.data_conclusao >= p.dt_ini AND qh.data_conclusao < p.dt_fim
  WHERE qh.deleted_at IS NULL
    AND qh.sessao_id IS NOT NULL
    AND mc.sessao_id IS NULL
)
SELECT
  'RESUMO' AS bloco,
  (SELECT COUNT(*) FROM modelo_completo WHERE tipo = 'SIMULADOR') AS total_sessoes_simulador,
  (SELECT COUNT(*) FROM modelo_completo WHERE tipo = 'VOO') AS total_sessoes_voo,
  (SELECT COUNT(*) FROM participantes) AS total_participantes,
  (SELECT COUNT(*) FROM esperadas WHERE elegibilidade = 'OK' AND funcionario_id IS NOT NULL) AS total_qualificacoes_esperadas,
  (SELECT COUNT(*) FROM detalhe WHERE match_ativo > 0) AS total_qualificacoes_existentes,
  (SELECT COUNT(*) FROM detalhe WHERE elegibilidade = 'OK' AND match_ativo = 0) AS total_faltantes,
  (SELECT COUNT(*) FROM detalhe WHERE elegibilidade = 'OK' AND match_ativo > 1) AS total_duplicadas,
  (SELECT COUNT(*) FROM detalhe WHERE elegibilidade = 'OK' AND match_ativo = 0 AND match_cancelada > 0) AS total_incompletas,
  (SELECT COUNT(*) FROM orfas) AS total_orfas;

WITH
params AS (
  SELECT '2026-05-01' AS dt_ini, '2026-06-01' AS dt_fim
),
sessoes_mes AS (
  SELECT sa.id AS sessao_id, sa.data, sa.tipo_sessao, sa.nome AS tema_sessao, sa.status AS sessao_status,
         sa.simulador_id, sa.template_id, sa.empresa_id,
         COALESCE(s.aeronave_codigo, s.codigo_aeronave, s.tipo, s.modelo, '') AS modelo_raw,
         CASE
           WHEN UPPER(REPLACE(REPLACE(COALESCE(s.aeronave_codigo, s.codigo_aeronave, s.tipo, s.modelo, ''), '-', ''), ' ', '')) LIKE '%SK76%'
             OR UPPER(REPLACE(REPLACE(COALESCE(s.aeronave_codigo, s.codigo_aeronave, s.tipo, s.modelo, ''), '-', ''), ' ', '')) LIKE '%S76%'
             OR UPPER(REPLACE(REPLACE(COALESCE(s.aeronave_codigo, s.codigo_aeronave, s.tipo, s.modelo, ''), '-', ''), ' ', '')) = '76'
             THEN 'SK76'
           WHEN UPPER(COALESCE(s.aeronave_codigo, s.codigo_aeronave, s.tipo, s.modelo, '')) LIKE '%AW139%'
             THEN 'AW139'
           ELSE UPPER(TRIM(COALESCE(s.aeronave_codigo, s.codigo_aeronave, s.tipo, s.modelo, '')))
         END AS modelo_norm
  FROM simulador_agendamentos sa
  LEFT JOIN simuladores s ON s.id = sa.simulador_id AND s.deleted_at IS NULL
  JOIN params p ON sa.data >= p.dt_ini AND sa.data < p.dt_fim
  WHERE sa.deleted_at IS NULL
),
modelo_resolvido AS (
  SELECT sm.*,
         COALESCE(sm.template_id,
           (SELECT ms.id FROM modelos_sessao ms INNER JOIN tipos_sessao ts ON ts.id = ms.tipo_sessao_id
             WHERE ts.codigo = sm.tipo_sessao AND UPPER(COALESCE(ms.modelo_aeronave, '')) = sm.modelo_norm
               AND ms.deleted_at IS NULL AND ms.gera_qualificacao = 1 ORDER BY ms.id DESC LIMIT 1),
           (SELECT ms.id FROM modelos_sessao ms INNER JOIN tipos_sessao ts ON ts.id = ms.tipo_sessao_id
             WHERE ts.codigo = sm.tipo_sessao AND UPPER(COALESCE(ms.modelo_aeronave, '')) = sm.modelo_norm
               AND ms.deleted_at IS NULL ORDER BY ms.id DESC LIMIT 1)
         ) AS modelo_id_resolvido
  FROM sessoes_mes sm
),
modelo_completo AS (
  SELECT mr.*, ms.nome AS modelo_nome, COALESCE(ms.tipo, 'SIMULADOR') AS modelo_tipo,
         ms.gera_qualificacao, ms.qualificacao_tipo_id, qt.codigo AS qual_codigo, qt.nome AS qual_nome,
         CASE WHEN UPPER(COALESCE(ms.tipo, 'SIMULADOR')) = 'AERONAVE' THEN 'VOO' ELSE 'SIMULADOR' END AS tipo
  FROM modelo_resolvido mr
  LEFT JOIN modelos_sessao ms ON ms.id = mr.modelo_id_resolvido AND ms.deleted_at IS NULL
  LEFT JOIN qualificacoes_tipos qt ON qt.id = ms.qualificacao_tipo_id AND qt.deleted_at IS NULL
),
participantes_base AS (
  SELECT DISTINCT sp.sessao_id, sp.funcionario_id
  FROM sessoes_participantes sp
  INNER JOIN modelo_completo mc ON mc.sessao_id = sp.sessao_id
  WHERE sp.deleted_at IS NULL
),
participantes_fallback AS (
  SELECT DISTINCT fs.agendamento_slot_id AS sessao_id, fs.colaborador_id_aluno AS funcionario_id
  FROM fichas_sessao fs
  INNER JOIN modelo_completo mc ON mc.sessao_id = fs.agendamento_slot_id
  WHERE fs.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM sessoes_participantes sp WHERE sp.sessao_id = fs.agendamento_slot_id AND sp.deleted_at IS NULL)
),
participantes AS (
  SELECT * FROM participantes_base
  UNION
  SELECT * FROM participantes_fallback
),
esperadas AS (
  SELECT mc.sessao_id, mc.data, mc.tipo, mc.modelo_norm AS aeronave_modelo,
         p.funcionario_id, mc.qualificacao_tipo_id, mc.qual_codigo, mc.qual_nome,
         mc.sessao_status, mc.tema_sessao, mc.tipo_sessao, mc.modelo_nome,
         CASE
           WHEN mc.modelo_id_resolvido IS NULL THEN 'SEM_MODELO'
           WHEN COALESCE(mc.gera_qualificacao, 0) <> 1 THEN 'MODELO_NAO_GERA'
           WHEN mc.qualificacao_tipo_id IS NULL OR mc.qual_codigo IS NULL THEN 'SEM_QUALIFICACAO_TIPO'
           ELSE 'OK'
         END AS elegibilidade
  FROM modelo_completo mc
  LEFT JOIN participantes p ON p.sessao_id = mc.sessao_id
),
existentes AS (
  SELECT qh.*
  FROM qualificacoes_historico qh
  WHERE qh.sessao_id IS NOT NULL
),
detalhe AS (
  SELECT e.data, e.sessao_id, e.tipo, e.aeronave_modelo, e.funcionario_id,
         COALESCE(f.nome, '(sem cadastro)') AS participante,
         e.qual_codigo AS qualificacoes_esperadas,
         COALESCE((SELECT GROUP_CONCAT(qh.id || ':' || COALESCE(qh.qualificacao_codigo, '-') || ':' || COALESCE(qh.status, '-'), ' | ')
                   FROM existentes qh
                   WHERE qh.sessao_id = e.sessao_id AND qh.funcionario_id = e.funcionario_id AND qh.deleted_at IS NULL), '') AS qualificacoes_encontradas,
         COALESCE((SELECT COUNT(*) FROM existentes qh
                   WHERE qh.sessao_id = e.sessao_id AND qh.funcionario_id = e.funcionario_id AND qh.deleted_at IS NULL
                     AND COALESCE(qh.status, '') <> 'CANCELADA'
                     AND ((e.qual_codigo IS NOT NULL AND qh.qualificacao_codigo = e.qual_codigo)
                          OR (e.qualificacao_tipo_id IS NOT NULL AND qh.qualificacao_id = e.qualificacao_tipo_id))), 0) AS match_ativo,
         COALESCE((SELECT COUNT(*) FROM existentes qh
                   WHERE qh.sessao_id = e.sessao_id AND qh.funcionario_id = e.funcionario_id AND qh.deleted_at IS NULL
                     AND COALESCE(qh.status, '') = 'CANCELADA'
                     AND ((e.qual_codigo IS NOT NULL AND qh.qualificacao_codigo = e.qual_codigo)
                          OR (e.qualificacao_tipo_id IS NOT NULL AND qh.qualificacao_id = e.qualificacao_tipo_id))), 0) AS match_cancelada,
         e.elegibilidade, e.sessao_status, e.tema_sessao, e.tipo_sessao, e.modelo_nome
  FROM esperadas e
  LEFT JOIN funcionarios f ON f.id = e.funcionario_id
  WHERE e.funcionario_id IS NOT NULL
)
SELECT
  data,
  sessao_id,
  tipo,
  aeronave_modelo,
  funcionario_id,
  participante,
  qualificacoes_esperadas,
  qualificacoes_encontradas,
  CASE WHEN elegibilidade = 'OK' AND match_ativo = 0 THEN qualificacoes_esperadas ELSE '' END AS faltantes,
  CASE WHEN elegibilidade = 'OK' AND match_ativo > 1 THEN (match_ativo - 1) ELSE 0 END AS duplicadas,
  CASE
    WHEN elegibilidade <> 'OK' THEN 'ERRO'
    WHEN match_ativo > 1 THEN 'DUPLICADA'
    WHEN match_ativo = 0 AND match_cancelada > 0 THEN 'INCOMPLETA'
    WHEN match_ativo = 0 THEN 'FALTANDO'
    ELSE 'OK'
  END AS status,
  CASE
    WHEN elegibilidade <> 'OK' THEN elegibilidade
    WHEN match_ativo = 0 AND match_cancelada > 0 THEN 'Existe apenas CANCELADA para a chave esperada'
    WHEN match_ativo = 0 THEN 'Sem qualificação ativa para sessão+participante'
    WHEN match_ativo > 1 THEN 'Mais de uma qualificação ativa para chave esperada'
    ELSE 'Sem ação'
  END AS acao_sugerida,
  tema_sessao,
  tipo_sessao,
  sessao_status,
  modelo_nome
FROM detalhe
ORDER BY data, sessao_id, funcionario_id;

-- ORFÃS no mês de referência (qualificações com sessao_id apontando para sessão inexistente/no mês fora do escopo)
SELECT
  qh.id,
  qh.sessao_id,
  qh.funcionario_id,
  qh.qualificacao_codigo,
  qh.status,
  qh.data_conclusao,
  CASE
    WHEN sa.id IS NULL THEN 'SESSAO_INEXISTENTE_OU_DELETADA'
    WHEN sa.data < '2026-05-01' OR sa.data >= '2026-06-01' THEN 'SESSAO_FORA_DO_MES_AUDITADO'
    ELSE 'OK'
  END AS motivo_orfandade
FROM qualificacoes_historico qh
LEFT JOIN simulador_agendamentos sa ON sa.id = qh.sessao_id AND sa.deleted_at IS NULL
WHERE qh.deleted_at IS NULL
  AND qh.sessao_id IS NOT NULL
  AND qh.data_conclusao >= '2026-05-01'
  AND qh.data_conclusao < '2026-06-01'
  AND (sa.id IS NULL OR sa.data < '2026-05-01' OR sa.data >= '2026-06-01')
ORDER BY qh.data_conclusao, qh.sessao_id, qh.funcionario_id;

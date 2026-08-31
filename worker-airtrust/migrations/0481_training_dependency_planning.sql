-- Migration 0481: configurable training dependencies -> simulator planning.
-- Additive, tenant-scoped and non-retroactive. No historical backfill.

CREATE TABLE IF NOT EXISTS treinamento_dependencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  qualificacao_origem_id INTEGER NOT NULL,
  qualificacao_destino_id INTEGER NOT NULL,
  intervalo_meses INTEGER NOT NULL CHECK(intervalo_meses BETWEEN 1 AND 60),
  vigencia_inicio TEXT NOT NULL,
  vigencia_fim TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  deleted_at TEXT,
  CHECK(qualificacao_origem_id <> qualificacao_destino_id),
  CHECK(vigencia_fim IS NULL OR date(vigencia_fim) >= date(vigencia_inicio))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_treinamento_dependencias_unique
  ON treinamento_dependencias(empresa_id,qualificacao_origem_id,qualificacao_destino_id,vigencia_inicio)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_treinamento_dependencias_lookup
  ON treinamento_dependencias(empresa_id,qualificacao_origem_id,ativo,vigencia_inicio)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS treinamento_dependencia_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regra_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  qualificacao_historico_origem_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  data_conclusao_origem TEXT NOT NULL,
  data_vencimento_origem TEXT,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  UNIQUE(regra_id,qualificacao_historico_origem_id,funcionario_id)
);

CREATE TRIGGER IF NOT EXISTS trg_treinamento_dependencias_tenant_insert
BEFORE INSERT ON treinamento_dependencias BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM qualificacoes_tipos q
     WHERE q.id=NEW.qualificacao_origem_id AND q.empresa_id=NEW.empresa_id AND q.deleted_at IS NULL
  ) THEN RAISE(ABORT,'treinamento_dependencias source tenant mismatch') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM qualificacoes_tipos q
     WHERE q.id=NEW.qualificacao_destino_id AND q.empresa_id=NEW.empresa_id AND q.deleted_at IS NULL
  ) THEN RAISE(ABORT,'treinamento_dependencias destination tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_treinamento_dependencias_tenant_update
BEFORE UPDATE OF empresa_id,qualificacao_origem_id,qualificacao_destino_id ON treinamento_dependencias BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM qualificacoes_tipos q
     WHERE q.id=NEW.qualificacao_origem_id AND q.empresa_id=NEW.empresa_id AND q.deleted_at IS NULL
  ) THEN RAISE(ABORT,'treinamento_dependencias source tenant mismatch') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM qualificacoes_tipos q
     WHERE q.id=NEW.qualificacao_destino_id AND q.empresa_id=NEW.empresa_id AND q.deleted_at IS NULL
  ) THEN RAISE(ABORT,'treinamento_dependencias destination tenant mismatch') END;
END;

-- Fail closed before enabling the approved production rule. IDs were audited on
-- empresa_id=6 and must still resolve to the exact qualification codes and a
-- current destination session model. If production drifted, the migration aborts.
CREATE TABLE IF NOT EXISTS _0481_preflight_guard (
  id INTEGER PRIMARY KEY CHECK(id = 1)
);
CREATE TRIGGER IF NOT EXISTS _0481_preflight_validate
BEFORE INSERT ON _0481_preflight_guard
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM qualificacoes_tipos
     WHERE id=33 AND empresa_id=6 AND codigo='G1' AND deleted_at IS NULL
  ) <> 1 THEN RAISE(ABORT,'0481 preflight: AW139 Periodico G1 id=33 drifted') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM qualificacoes_tipos
     WHERE id=106 AND empresa_id=6 AND codigo='G1-SEM' AND deleted_at IS NULL
  ) <> 1 THEN RAISE(ABORT,'0481 preflight: AW139 Semestral G1-SEM id=106 drifted') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao
     WHERE empresa_id=6 AND qualificacao_tipo_id=106 AND deleted_at IS NULL
  ) < 1 THEN RAISE(ABORT,'0481 preflight: AW139 Semestral has no current session model') END;
END;
INSERT INTO _0481_preflight_guard(id) VALUES (1);
DROP TRIGGER IF EXISTS _0481_preflight_validate;
DROP TABLE IF EXISTS _0481_preflight_guard;

-- Approved rule: empresa 6, AW139 Periodico G1 (33) -> Semestral G1-SEM (106), 6 months.
INSERT INTO treinamento_dependencias
 (empresa_id,qualificacao_origem_id,qualificacao_destino_id,intervalo_meses,vigencia_inicio,observacoes)
SELECT 6,33,106,6,'2026-08-31',
       'AW139: Periodico G1 gera planejamento Semestral G1-SEM em ate 6 meses.'
WHERE NOT EXISTS(
    SELECT 1 FROM treinamento_dependencias
     WHERE empresa_id=6 AND qualificacao_origem_id=33 AND qualificacao_destino_id=106
       AND vigencia_inicio='2026-08-31' AND deleted_at IS NULL
  );

CREATE TABLE IF NOT EXISTS _0481_postseed_guard (
  id INTEGER PRIMARY KEY CHECK(id = 1)
);
CREATE TRIGGER IF NOT EXISTS _0481_postseed_validate
BEFORE INSERT ON _0481_postseed_guard
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM treinamento_dependencias
     WHERE empresa_id=6 AND qualificacao_origem_id=33 AND qualificacao_destino_id=106
       AND intervalo_meses=6 AND vigencia_inicio='2026-08-31'
       AND ativo=1 AND deleted_at IS NULL
  ) <> 1 THEN RAISE(ABORT,'0481 postseed: approved AW139 rule missing or ambiguous') END;
END;
INSERT INTO _0481_postseed_guard(id) VALUES (1);
DROP TRIGGER IF EXISTS _0481_postseed_validate;
DROP TABLE IF EXISTS _0481_postseed_guard;

-- A single dispatcher owns materialization; the two qualification triggers only enqueue an idempotent event.
CREATE TRIGGER IF NOT EXISTS trg_treinamento_dependencia_evento_dispatch
AFTER INSERT ON treinamento_dependencia_eventos
BEGIN
  INSERT INTO treinamentos_planejados(
    empresa_id,qualificacao_tipo_id,data_prevista,status,carga_horaria_prevista,
    titulo,descricao,observacoes,created_at,updated_at,
    planejamento_status,planejamento_origem,planejamento_chave,
    planejamento_editado_manualmente,planejamento_vencimento_referencia,
    planejamento_modelo_aeronave,planejamento_conflitos_json,
    planejamento_snapshot_json,planejamento_recalculado_em
  )
  SELECT
    d.empresa_id,d.qualificacao_destino_id,
    date(date(NEW.data_conclusao_origem,'start of month',printf('+%d months',d.intervalo_meses)),
         printf('+%d days',
           MIN(CAST(strftime('%d',NEW.data_conclusao_origem) AS INTEGER),
               CAST(strftime('%d',date(NEW.data_conclusao_origem,'start of month',
                    printf('+%d months',d.intervalo_meses+1),'-1 day')) AS INTEGER))-1)),
    'PLANEJADO',COALESCE(q.carga_horaria_recorrente,q.carga_horaria),
    'Planejamento '||COALESCE(q.nome,q.codigo,'treinamento dependente')||
      CASE WHEN COALESCE((SELECT modelo_aeronave FROM modelos_sessao
        WHERE empresa_id=d.empresa_id AND qualificacao_tipo_id=d.qualificacao_destino_id
          AND deleted_at IS NULL ORDER BY COALESCE(ordem_no_treinamento,9999),id LIMIT 1),'')=''
      THEN '' ELSE ' — '||(SELECT modelo_aeronave FROM modelos_sessao
        WHERE empresa_id=d.empresa_id AND qualificacao_tipo_id=d.qualificacao_destino_id
          AND deleted_at IS NULL ORDER BY COALESCE(ordem_no_treinamento,9999),id LIMIT 1) END,
    'Planejamento futuro gerado automaticamente pela dependencia entre treinamentos configurada.',
    'Origem: qualificacao concluida #'||NEW.qualificacao_historico_origem_id||
      '; intervalo: '||d.intervalo_meses||' mes(es).',
    datetime('now'),datetime('now'),'PROPOSTO','SIMULADOR_QUINZENA',
    'DEPENDENCIA:'||d.id||':'||NEW.qualificacao_historico_origem_id||':'||NEW.funcionario_id,
    1,
    date(date(NEW.data_conclusao_origem,'start of month',printf('+%d months',d.intervalo_meses)),
         printf('+%d days',
           MIN(CAST(strftime('%d',NEW.data_conclusao_origem) AS INTEGER),
               CAST(strftime('%d',date(NEW.data_conclusao_origem,'start of month',
                    printf('+%d months',d.intervalo_meses+1),'-1 day')) AS INTEGER))-1)),
    COALESCE((SELECT modelo_aeronave FROM modelos_sessao
      WHERE empresa_id=d.empresa_id AND qualificacao_tipo_id=d.qualificacao_destino_id
        AND deleted_at IS NULL ORDER BY COALESCE(ordem_no_treinamento,9999),id LIMIT 1),''),
    '[]',
    json_object(
      'generated_at',datetime('now'),'generated_by','TRAINING_DEPENDENCY',
      'config',json_object(
        'planning_horizon_days',CASE WHEN ec.planejamento_simulador_antecedencia_dias BETWEEN 1 AND 365 THEN ec.planejamento_simulador_antecedencia_dias ELSE 90 END,
        'roster_policy',CASE UPPER(COALESCE(ec.planejamento_simulador_regra_quinzena,'AMBAS')) WHEN 'FOLGA' THEN 'FOLGA' WHEN 'TRABALHO' THEN 'TRABALHO' WHEN 'AMBAS' THEN 'AMBAS' ELSE 'AMBAS' END,
        'preferred_sessions_per_day',CASE WHEN ec.planejamento_simulador_preferencia_sessoes_por_dia BETWEEN 1 AND 8 THEN ec.planejamento_simulador_preferencia_sessoes_por_dia ELSE 2 END,
        'preferred_minutes_per_day',CASE WHEN ec.planejamento_simulador_preferencia_minutos_por_dia BETWEEN 30 AND 1440 THEN ec.planejamento_simulador_preferencia_minutos_por_dia ELSE 240 END,
        'allow_preference_break',json(CASE WHEN COALESCE(ec.planejamento_simulador_permitir_quebra_preferencia,1)=0 THEN 'false' ELSE 'true' END),
        'allow_shared_session',json(CASE WHEN COALESCE(ec.planejamento_simulador_permitir_sessao_compartilhada,1)=0 THEN 'false' ELSE 'true' END),
        'prefer_same_training',json(CASE WHEN COALESCE(ec.planejamento_simulador_preferir_mesmo_treinamento,1)=0 THEN 'false' ELSE 'true' END),
        'prefer_same_session',json(CASE WHEN COALESCE(ec.planejamento_simulador_preferir_mesma_sessao,1)=0 THEN 'false' ELSE 'true' END),
        'approval_required',json(CASE WHEN COALESCE(ec.planejamento_simulador_aprovacao_obrigatoria,1)=0 THEN 'false' ELSE 'true' END)
      ),
      'mode','NORMAL','simulator_id',NULL,'instructor_id',NULL,
      'resource_assignment',json_object('pending',json_array('simulator_id','instructor_id'),'complete',json('false')),
      'participants',json_array(json_object(
        'funcionario_id',NEW.funcionario_id,'employee_id',NEW.funcionario_id,'employee_active',json('true'),
        'equipment',COALESCE((SELECT modelo_aeronave FROM modelos_sessao
          WHERE empresa_id=d.empresa_id AND qualificacao_tipo_id=d.qualificacao_destino_id
            AND deleted_at IS NULL ORDER BY COALESCE(ordem_no_treinamento,9999),id LIMIT 1),''),
        'qualification_history_id',NEW.qualificacao_historico_origem_id,
        'qualification_expiry_date',NEW.data_vencimento_origem,'training_id',d.qualificacao_destino_id,
        'session_model_ids',json_array((SELECT id FROM modelos_sessao
          WHERE empresa_id=d.empresa_id AND qualificacao_tipo_id=d.qualificacao_destino_id
            AND deleted_at IS NULL ORDER BY COALESCE(ordem_no_treinamento,9999),id LIMIT 1)),
        'roster_by_date',json('{}')
      )),
      'cae_slots',json('[]'),
      'canonical_session_fingerprint','sessions:'||NEW.funcionario_id||':'||(SELECT id FROM modelos_sessao
        WHERE empresa_id=d.empresa_id AND qualificacao_tipo_id=d.qualificacao_destino_id
          AND deleted_at IS NULL ORDER BY COALESCE(ordem_no_treinamento,9999),id LIMIT 1),
      'pairing_fingerprint','pairing:NORMAL:'||NEW.funcionario_id||':'||(SELECT id FROM modelos_sessao
        WHERE empresa_id=d.empresa_id AND qualificacao_tipo_id=d.qualificacao_destino_id
          AND deleted_at IS NULL ORDER BY COALESCE(ordem_no_treinamento,9999),id LIMIT 1),
      'dependency',json_object(
        'rule_id',d.id,'source_qualification_history_id',NEW.qualificacao_historico_origem_id,
        'source_qualification_id',d.qualificacao_origem_id,'destination_qualification_id',d.qualificacao_destino_id,
        'interval_months',d.intervalo_meses,'effective_from',d.vigencia_inicio,
        'source_completion_date',NEW.data_conclusao_origem,
        'due_date',date(date(NEW.data_conclusao_origem,'start of month',printf('+%d months',d.intervalo_meses)),
          printf('+%d days',
            MIN(CAST(strftime('%d',NEW.data_conclusao_origem) AS INTEGER),
                CAST(strftime('%d',date(NEW.data_conclusao_origem,'start of month',
                     printf('+%d months',d.intervalo_meses+1),'-1 day')) AS INTEGER))-1))
      ),
      'source','treinamento_dependencias + qualificacoes_historico + modelos_sessao'
    ),
    datetime('now')
  FROM treinamento_dependencias d
  JOIN qualificacoes_tipos q ON q.id=d.qualificacao_destino_id AND q.empresa_id=d.empresa_id AND q.deleted_at IS NULL
  LEFT JOIN empresas_config ec ON ec.empresa_id=d.empresa_id
  WHERE d.id=NEW.regra_id AND d.empresa_id=NEW.empresa_id AND d.ativo=1 AND d.deleted_at IS NULL
  ON CONFLICT DO NOTHING;

  INSERT OR IGNORE INTO treinamentos_participantes(
    treinamento_id,funcionario_id,confirmado,presente,aprovado,nota,observacoes,created_at,updated_at
  )
  SELECT p.id,NEW.funcionario_id,0,NULL,NULL,NULL,
         'Incluido automaticamente por dependencia entre treinamentos.',datetime('now'),datetime('now')
    FROM treinamento_dependencias d
    JOIN treinamentos_planejados p
      ON p.empresa_id=d.empresa_id
     AND p.planejamento_chave='DEPENDENCIA:'||d.id||':'||NEW.qualificacao_historico_origem_id||':'||NEW.funcionario_id
     AND p.deleted_at IS NULL
   WHERE d.id=NEW.regra_id AND d.empresa_id=NEW.empresa_id;

  INSERT INTO simulador_planejamento_auditoria(
    empresa_id,treinamento_planejado_id,acao,planejamento_status,
    snapshot_antes_json,snapshot_depois_json,realizado_por,realizado_em
  )
  SELECT d.empresa_id,p.id,'DEPENDENCIA_TREINAMENTO_GERADA',p.planejamento_status,NULL,
         json_object('rule_id',d.id,'source_qualification_history_id',NEW.qualificacao_historico_origem_id,
           'destination_qualification_id',d.qualificacao_destino_id,'interval_months',d.intervalo_meses,
           'due_date',p.planejamento_vencimento_referencia),
         NULL,datetime('now')
    FROM treinamento_dependencias d
    JOIN treinamentos_planejados p
      ON p.empresa_id=d.empresa_id
     AND p.planejamento_chave='DEPENDENCIA:'||d.id||':'||NEW.qualificacao_historico_origem_id||':'||NEW.funcionario_id
     AND p.deleted_at IS NULL
   WHERE d.id=NEW.regra_id AND d.empresa_id=NEW.empresa_id
     AND NOT EXISTS(SELECT 1 FROM simulador_planejamento_auditoria a
       WHERE a.empresa_id=d.empresa_id AND a.treinamento_planejado_id=p.id
         AND a.acao='DEPENDENCIA_TREINAMENTO_GERADA');
END;

-- If the completion date of an already-materialized source qualification is
-- corrected, the hard deadline follows the corrected source. A proposal that
-- still has its original automatic date moves with the deadline; a date that
-- was already changed by a human is preserved and explicitly flagged when it
-- now falls after the corrected deadline.
CREATE TRIGGER IF NOT EXISTS trg_treinamento_dependencia_evento_recalculate
AFTER UPDATE OF data_conclusao_origem,data_vencimento_origem ON treinamento_dependencia_eventos
WHEN date(OLD.data_conclusao_origem) <> date(NEW.data_conclusao_origem)
  OR COALESCE(OLD.data_vencimento_origem,'') <> COALESCE(NEW.data_vencimento_origem,'')
BEGIN
  UPDATE treinamentos_planejados
     SET data_prevista = CASE
           WHEN planejamento_status='PROPOSTO'
            AND date(data_prevista)=date(
              date(OLD.data_conclusao_origem,'start of month',
                   printf('+%d months',(SELECT intervalo_meses FROM treinamento_dependencias WHERE id=NEW.regra_id))),
              printf('+%d days',
                MIN(CAST(strftime('%d',OLD.data_conclusao_origem) AS INTEGER),
                    CAST(strftime('%d',date(OLD.data_conclusao_origem,'start of month',
                      printf('+%d months',(SELECT intervalo_meses+1 FROM treinamento_dependencias WHERE id=NEW.regra_id)),
                      '-1 day')) AS INTEGER))-1)
            )
           THEN date(
              date(NEW.data_conclusao_origem,'start of month',
                   printf('+%d months',(SELECT intervalo_meses FROM treinamento_dependencias WHERE id=NEW.regra_id))),
              printf('+%d days',
                MIN(CAST(strftime('%d',NEW.data_conclusao_origem) AS INTEGER),
                    CAST(strftime('%d',date(NEW.data_conclusao_origem,'start of month',
                      printf('+%d months',(SELECT intervalo_meses+1 FROM treinamento_dependencias WHERE id=NEW.regra_id)),
                      '-1 day')) AS INTEGER))-1)
            )
           ELSE data_prevista
         END,
         planejamento_vencimento_referencia = date(
           date(NEW.data_conclusao_origem,'start of month',
                printf('+%d months',(SELECT intervalo_meses FROM treinamento_dependencias WHERE id=NEW.regra_id))),
           printf('+%d days',
             MIN(CAST(strftime('%d',NEW.data_conclusao_origem) AS INTEGER),
                 CAST(strftime('%d',date(NEW.data_conclusao_origem,'start of month',
                   printf('+%d months',(SELECT intervalo_meses+1 FROM treinamento_dependencias WHERE id=NEW.regra_id)),
                   '-1 day')) AS INTEGER))-1)
         ),
         observacoes = CASE
           WHEN date(data_prevista) > date(
             date(NEW.data_conclusao_origem,'start of month',
                  printf('+%d months',(SELECT intervalo_meses FROM treinamento_dependencias WHERE id=NEW.regra_id))),
             printf('+%d days',
               MIN(CAST(strftime('%d',NEW.data_conclusao_origem) AS INTEGER),
                   CAST(strftime('%d',date(NEW.data_conclusao_origem,'start of month',
                     printf('+%d months',(SELECT intervalo_meses+1 FROM treinamento_dependencias WHERE id=NEW.regra_id)),
                     '-1 day')) AS INTEGER))-1)
           )
           THEN COALESCE(observacoes||char(10),'')||
                'Conflito: data planejada preservada apos correcao do Periodico; revisar novo vencimento derivado.'
           ELSE observacoes
         END,
         planejamento_snapshot_json = json_set(
           COALESCE(planejamento_snapshot_json,'{}'),
           '$.dependency.source_completion_date',NEW.data_conclusao_origem,
           '$.dependency.due_date',date(
             date(NEW.data_conclusao_origem,'start of month',
                  printf('+%d months',(SELECT intervalo_meses FROM treinamento_dependencias WHERE id=NEW.regra_id))),
             printf('+%d days',
               MIN(CAST(strftime('%d',NEW.data_conclusao_origem) AS INTEGER),
                   CAST(strftime('%d',date(NEW.data_conclusao_origem,'start of month',
                     printf('+%d months',(SELECT intervalo_meses+1 FROM treinamento_dependencias WHERE id=NEW.regra_id)),
                     '-1 day')) AS INTEGER))-1)
           ),
           '$.participants[0].qualification_expiry_date',NEW.data_vencimento_origem
         ),
         planejamento_recalculado_em=datetime('now'),
         updated_at=datetime('now')
   WHERE empresa_id=NEW.empresa_id
     AND deleted_at IS NULL
     AND planejamento_chave='DEPENDENCIA:'||NEW.regra_id||':'||
         NEW.qualificacao_historico_origem_id||':'||NEW.funcionario_id;

  INSERT INTO simulador_planejamento_auditoria(
    empresa_id,treinamento_planejado_id,acao,planejamento_status,
    snapshot_antes_json,snapshot_depois_json,realizado_por,realizado_em
  )
  SELECT NEW.empresa_id,p.id,'DEPENDENCIA_TREINAMENTO_RECALCULADA',p.planejamento_status,
         json_object('source_completion_date',OLD.data_conclusao_origem,
                     'source_expiry_date',OLD.data_vencimento_origem),
         json_object('source_completion_date',NEW.data_conclusao_origem,
                     'source_expiry_date',NEW.data_vencimento_origem,
                     'due_date',p.planejamento_vencimento_referencia,
                     'planned_date_preserved',
                       CASE WHEN date(p.data_prevista)<>date(p.planejamento_vencimento_referencia)
                            THEN json('true') ELSE json('false') END),
         NULL,datetime('now')
    FROM treinamentos_planejados p
   WHERE p.empresa_id=NEW.empresa_id
     AND p.deleted_at IS NULL
     AND p.planejamento_chave='DEPENDENCIA:'||NEW.regra_id||':'||
         NEW.qualificacao_historico_origem_id||':'||NEW.funcionario_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_qualificacao_dependencia_after_insert
AFTER INSERT ON qualificacoes_historico
WHEN NEW.deleted_at IS NULL AND UPPER(COALESCE(NEW.status,''))='CONCLUIDA'
 AND NEW.data_conclusao IS NOT NULL AND NEW.qualificacao_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO treinamento_dependencia_eventos(
    regra_id,empresa_id,qualificacao_historico_origem_id,funcionario_id,data_conclusao_origem,data_vencimento_origem
  )
  SELECT d.id,d.empresa_id,NEW.id,NEW.funcionario_id,NEW.data_conclusao,NEW.data_vencimento
    FROM treinamento_dependencias d
   WHERE d.empresa_id=NEW.empresa_id AND d.qualificacao_origem_id=NEW.qualificacao_id
     AND d.ativo=1 AND d.deleted_at IS NULL
     AND date(NEW.data_conclusao)>=date(d.vigencia_inicio)
     AND (d.vigencia_fim IS NULL OR date(NEW.data_conclusao)<=date(d.vigencia_fim))
     AND EXISTS(SELECT 1 FROM modelos_sessao m WHERE m.empresa_id=d.empresa_id
       AND m.qualificacao_tipo_id=d.qualificacao_destino_id AND m.deleted_at IS NULL);
END;

CREATE TRIGGER IF NOT EXISTS trg_qualificacao_dependencia_after_update
AFTER UPDATE OF status,data_conclusao,data_vencimento,deleted_at ON qualificacoes_historico
WHEN NEW.deleted_at IS NULL AND UPPER(COALESCE(NEW.status,''))='CONCLUIDA'
 AND NEW.data_conclusao IS NOT NULL AND NEW.qualificacao_id IS NOT NULL
BEGIN
  UPDATE treinamento_dependencia_eventos
     SET data_conclusao_origem=NEW.data_conclusao,
         data_vencimento_origem=NEW.data_vencimento,
         updated_at=datetime('now')
   WHERE empresa_id=NEW.empresa_id
     AND qualificacao_historico_origem_id=NEW.id
     AND funcionario_id=NEW.funcionario_id
     AND regra_id IN (
       SELECT d.id FROM treinamento_dependencias d
        WHERE d.empresa_id=NEW.empresa_id
          AND d.qualificacao_origem_id=NEW.qualificacao_id
          AND d.ativo=1 AND d.deleted_at IS NULL
          AND date(NEW.data_conclusao)>=date(d.vigencia_inicio)
          AND (d.vigencia_fim IS NULL OR date(NEW.data_conclusao)<=date(d.vigencia_fim))
     )
     AND (
       date(data_conclusao_origem)<>date(NEW.data_conclusao)
       OR COALESCE(data_vencimento_origem,'')<>COALESCE(NEW.data_vencimento,'')
     );

  INSERT OR IGNORE INTO treinamento_dependencia_eventos(
    regra_id,empresa_id,qualificacao_historico_origem_id,funcionario_id,data_conclusao_origem,data_vencimento_origem
  )
  SELECT d.id,d.empresa_id,NEW.id,NEW.funcionario_id,NEW.data_conclusao,NEW.data_vencimento
    FROM treinamento_dependencias d
   WHERE d.empresa_id=NEW.empresa_id AND d.qualificacao_origem_id=NEW.qualificacao_id
     AND d.ativo=1 AND d.deleted_at IS NULL
     AND date(NEW.data_conclusao)>=date(d.vigencia_inicio)
     AND (d.vigencia_fim IS NULL OR date(NEW.data_conclusao)<=date(d.vigencia_fim))
     AND EXISTS(SELECT 1 FROM modelos_sessao m WHERE m.empresa_id=d.empresa_id
       AND m.qualificacao_tipo_id=d.qualificacao_destino_id AND m.deleted_at IS NULL);
END;

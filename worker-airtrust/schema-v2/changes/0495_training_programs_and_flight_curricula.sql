-- Migration 0495: canonical training programs + flight curricula.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
--   source_reference: user-approved Initial -> Periodic program architecture (2026-09-14) + existing 0493 flight-cycle baseline.
--   operational_decision: Separate qualification identity from the program used to obtain/renew it. Initial runs once; recurring renewals use the recurring program; semiannual remains a complementary obligation.
--   dry_run_required: Validate all tenant-6 target qualification/session identities and current canonical models before production apply.
--   rollback_plan_required: additive schema; runtime can fall back to 0493 tables and legacy qualification fields. No destructive rollback without a separate reviewed change.
--

CREATE TABLE IF NOT EXISTS treinamento_programas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  qualificacao_tipo_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  tipo_treinamento TEXT NOT NULL CHECK(tipo_treinamento IN ('INICIAL','RECORRENTE','SEMESTRAL','UPGRADE','ESPECIFICO')),
  carga_horaria REAL,
  validade_meses INTEGER,
  uso_unico INTEGER NOT NULL DEFAULT 0 CHECK(uso_unico IN (0,1)),
  total_ciclos INTEGER NOT NULL DEFAULT 1 CHECK(total_ciclos BETWEEN 1 AND 12),
  ano_base INTEGER,
  ciclo_ano_base INTEGER,
  proximo_programa_id INTEGER,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  deleted_at TEXT,
  CHECK(carga_horaria IS NULL OR carga_horaria > 0),
  CHECK(validade_meses IS NULL OR validade_meses BETWEEN 1 AND 120),
  CHECK((total_ciclos = 1) OR (ano_base BETWEEN 2000 AND 2100 AND ciclo_ano_base BETWEEN 1 AND total_ciclos))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_treinamento_programas_codigo_active
  ON treinamento_programas(empresa_id, codigo)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_treinamento_programas_qualificacao
  ON treinamento_programas(empresa_id, qualificacao_tipo_id, ativo)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS treinamento_programa_modelos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  programa_id INTEGER NOT NULL,
  ciclo INTEGER NOT NULL DEFAULT 1 CHECK(ciclo BETWEEN 1 AND 12),
  modelo_sessao_id INTEGER NOT NULL,
  codigo_canonico TEXT NOT NULL,
  ordem INTEGER NOT NULL CHECK(ordem BETWEEN 1 AND 99),
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_treinamento_programa_modelos_ordem_active
  ON treinamento_programa_modelos(empresa_id, programa_id, ciclo, ordem)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_treinamento_programa_modelos_codigo_active
  ON treinamento_programa_modelos(empresa_id, programa_id, ciclo, codigo_canonico)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_treinamento_programa_modelos_lookup
  ON treinamento_programa_modelos(empresa_id, modelo_sessao_id)
  WHERE deleted_at IS NULL;
CREATE TRIGGER IF NOT EXISTS trg_treinamento_programas_tenant_insert
BEFORE INSERT ON treinamento_programas BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM qualificacoes_tipos q
     WHERE q.id=NEW.qualificacao_tipo_id AND q.empresa_id=NEW.empresa_id AND q.deleted_at IS NULL
  ) THEN RAISE(ABORT,'treinamento_programas qualification tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_treinamento_programas_tenant_update
BEFORE UPDATE OF empresa_id,qualificacao_tipo_id,proximo_programa_id ON treinamento_programas BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM qualificacoes_tipos q
     WHERE q.id=NEW.qualificacao_tipo_id AND q.empresa_id=NEW.empresa_id AND q.deleted_at IS NULL
  ) THEN RAISE(ABORT,'treinamento_programas qualification tenant mismatch') END;
  SELECT CASE WHEN NEW.proximo_programa_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM treinamento_programas p
     WHERE p.id=NEW.proximo_programa_id AND p.empresa_id=NEW.empresa_id
       AND p.qualificacao_tipo_id=NEW.qualificacao_tipo_id AND p.deleted_at IS NULL
  ) THEN RAISE(ABORT,'treinamento_programas next program tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_treinamento_programa_modelos_guard_insert
BEFORE INSERT ON treinamento_programa_modelos BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM treinamento_programas p
     WHERE p.id=NEW.programa_id AND p.empresa_id=NEW.empresa_id AND p.deleted_at IS NULL
       AND p.ativo=1 AND NEW.ciclo BETWEEN 1 AND p.total_ciclos
  ) THEN RAISE(ABORT,'treinamento_programa_modelos invalid program/cycle') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM modelos_sessao ms
    JOIN modelos_sessao_versionamento msv ON msv.modelo_id=ms.id AND msv.empresa_id=ms.empresa_id AND msv.is_current=1
    WHERE ms.id=NEW.modelo_sessao_id AND ms.empresa_id=NEW.empresa_id AND ms.deleted_at IS NULL
      AND COALESCE(ms.ativo,1)=1 AND msv.codigo_canonico=NEW.codigo_canonico
  ) THEN RAISE(ABORT,'treinamento_programa_modelos current canonical model mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_treinamento_programa_modelos_guard_update
BEFORE UPDATE OF empresa_id,programa_id,ciclo,modelo_sessao_id,codigo_canonico ON treinamento_programa_modelos BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM treinamento_programas p
     WHERE p.id=NEW.programa_id AND p.empresa_id=NEW.empresa_id AND p.deleted_at IS NULL
       AND p.ativo=1 AND NEW.ciclo BETWEEN 1 AND p.total_ciclos
  ) THEN RAISE(ABORT,'treinamento_programa_modelos invalid program/cycle') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM modelos_sessao ms
    JOIN modelos_sessao_versionamento msv ON msv.modelo_id=ms.id AND msv.empresa_id=ms.empresa_id AND msv.is_current=1
    WHERE ms.id=NEW.modelo_sessao_id AND ms.empresa_id=NEW.empresa_id AND ms.deleted_at IS NULL
      AND COALESCE(ms.ativo,1)=1 AND msv.codigo_canonico=NEW.codigo_canonico
  ) THEN RAISE(ABORT,'treinamento_programa_modelos current canonical model mismatch') END;
END;

ALTER TABLE qualificacoes_historico ADD COLUMN programa_treinamento_id INTEGER;
ALTER TABLE treinamentos_planejados ADD COLUMN programa_treinamento_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_programa
  ON qualificacoes_historico(empresa_id, programa_treinamento_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_treinamentos_planejados_programa
  ON treinamentos_planejados(empresa_id, programa_treinamento_id)
  WHERE deleted_at IS NULL;

-- S-76 has a complementary semiannual flight obligation, but production did not
-- yet have a dedicated qualification identity for it. Create it once, tenant-scoped.
INSERT INTO qualificacoes_tipos (
  tipo,codigo,nome,descricao,categoria,carga_horaria,carga_horaria_inicial,
  carga_horaria_recorrente,conteudo_programatico,validade,vencimento_fim_mes,
  observacoes,ativo,categoria_id,empresa_id,created_at,updated_at,deleted_at
)
SELECT
  'RECORRENTE','G2-SEM','SK76 — Currículo de Voo - Semestral (FFS)',
  'Treinamento complementar semestral do currículo de voo SK76.',
  qc.nome,4,NULL,4,NULL,6,0,
  'Vinculado ao periódico G2 como obrigação complementar em 6 meses.',
  1,qc.id,6,datetime('now'),datetime('now'),NULL
FROM qualificacoes_categorias qc
WHERE qc.empresa_id=6 AND qc.deleted_at IS NULL AND COALESCE(qc.ativo,1)=1
  AND UPPER(TRIM(COALESCE(qc.codigo,'')))='VOO'
  AND NOT EXISTS(
    SELECT 1 FROM qualificacoes_tipos qt
     WHERE qt.empresa_id=6 AND UPPER(TRIM(qt.codigo))='G2-SEM' AND qt.deleted_at IS NULL
  )
LIMIT 1;

-- Fail closed if the flight qualification identities drifted.
CREATE TABLE IF NOT EXISTS _0495_preflight_guard(id INTEGER PRIMARY KEY CHECK(id=1));
CREATE TRIGGER IF NOT EXISTS _0495_preflight_validate
BEFORE INSERT ON _0495_preflight_guard BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G1' AND id=33 AND deleted_at IS NULL)<>1
    THEN RAISE(ABORT,'0495 preflight: G1 drifted') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G1-SEM' AND id=106 AND deleted_at IS NULL)<>1
    THEN RAISE(ABORT,'0495 preflight: G1-SEM drifted') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G2' AND id=40 AND deleted_at IS NULL)<>1
    THEN RAISE(ABORT,'0495 preflight: G2 drifted') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G2-SEM' AND deleted_at IS NULL)<>1
    THEN RAISE(ABORT,'0495 preflight: G2-SEM missing or ambiguous') END;
END;
INSERT INTO _0495_preflight_guard(id) VALUES(1);
DROP TRIGGER IF EXISTS _0495_preflight_validate;
DROP TABLE IF EXISTS _0495_preflight_guard;
-- Every active VOO qualification is represented by at least one program.
-- Initial and recurring are distinct when their workloads exist; G1/G2 semiannual
-- obligations keep their own qualification identity because they coexist with annual renewal.
INSERT INTO treinamento_programas
 (empresa_id,qualificacao_tipo_id,codigo,nome,tipo_treinamento,carga_horaria,validade_meses,uso_unico,total_ciclos,ano_base,ciclo_ano_base)
SELECT qt.empresa_id,qt.id,qt.codigo||':INICIAL',
       CASE qt.codigo WHEN 'G1' THEN 'AW139 — Currículo de Voo — Inicial' WHEN 'G2' THEN 'SK76 — Currículo de Voo — Inicial' ELSE qt.nome||' — Inicial' END,
       'INICIAL',COALESCE(qt.carga_horaria_inicial,qt.carga_horaria),qt.validade,1,1,NULL,NULL
  FROM qualificacoes_tipos qt
  JOIN qualificacoes_categorias qc ON qc.id=qt.categoria_id AND qc.empresa_id=qt.empresa_id
 WHERE qt.empresa_id=6 AND qt.deleted_at IS NULL AND COALESCE(qt.ativo,1)=1
   AND qc.deleted_at IS NULL AND COALESCE(qc.ativo,1)=1 AND UPPER(TRIM(qc.codigo))='VOO'
   AND qt.codigo NOT IN ('G1-SEM','G2-SEM')
   AND COALESCE(qt.carga_horaria_inicial,0)>0
   AND NOT EXISTS(SELECT 1 FROM treinamento_programas p WHERE p.empresa_id=qt.empresa_id AND p.codigo=qt.codigo||':INICIAL' AND p.deleted_at IS NULL);

INSERT INTO treinamento_programas
 (empresa_id,qualificacao_tipo_id,codigo,nome,tipo_treinamento,carga_horaria,validade_meses,uso_unico,total_ciclos,ano_base,ciclo_ano_base)
SELECT qt.empresa_id,qt.id,qt.codigo||':RECORRENTE',
       CASE qt.codigo WHEN 'G1' THEN 'AW139 — Currículo de Voo — Periódico' WHEN 'G2' THEN 'SK76 — Currículo de Voo — Periódico' ELSE qt.nome||' — Periódico' END,
       'RECORRENTE',COALESCE(qt.carga_horaria_recorrente,qt.carga_horaria),qt.validade,0,
       CASE WHEN qt.codigo IN ('G1','G2') THEN 3 ELSE 1 END,
       CASE WHEN qt.codigo IN ('G1','G2') THEN 2026 ELSE NULL END,
       CASE WHEN qt.codigo IN ('G1','G2') THEN 2 ELSE NULL END
  FROM qualificacoes_tipos qt
  JOIN qualificacoes_categorias qc ON qc.id=qt.categoria_id AND qc.empresa_id=qt.empresa_id
 WHERE qt.empresa_id=6 AND qt.deleted_at IS NULL AND COALESCE(qt.ativo,1)=1
   AND qc.deleted_at IS NULL AND COALESCE(qc.ativo,1)=1 AND UPPER(TRIM(qc.codigo))='VOO'
   AND qt.codigo NOT IN ('G1-SEM','G2-SEM') AND COALESCE(qt.carga_horaria_recorrente,0)>0
   AND NOT EXISTS(SELECT 1 FROM treinamento_programas p WHERE p.empresa_id=qt.empresa_id AND p.codigo=qt.codigo||':RECORRENTE' AND p.deleted_at IS NULL);
INSERT INTO treinamento_programas
 (empresa_id,qualificacao_tipo_id,codigo,nome,tipo_treinamento,carga_horaria,validade_meses,uso_unico,total_ciclos,ano_base,ciclo_ano_base)
SELECT qt.empresa_id,qt.id,qt.codigo||':SEMESTRAL',qt.nome,'SEMESTRAL',
       COALESCE(qt.carga_horaria_recorrente,qt.carga_horaria),qt.validade,0,
       CASE WHEN qt.codigo='G1-SEM' THEN 3 ELSE 1 END,
       CASE WHEN qt.codigo='G1-SEM' THEN 2026 ELSE NULL END,
       CASE WHEN qt.codigo='G1-SEM' THEN 2 ELSE NULL END
  FROM qualificacoes_tipos qt
 WHERE qt.empresa_id=6 AND qt.codigo IN ('G1-SEM','G2-SEM') AND qt.deleted_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM treinamento_programas p WHERE p.empresa_id=qt.empresa_id AND p.codigo=qt.codigo||':SEMESTRAL' AND p.deleted_at IS NULL);

INSERT INTO treinamento_programas
 (empresa_id,qualificacao_tipo_id,codigo,nome,tipo_treinamento,carga_horaria,validade_meses,uso_unico,total_ciclos)
SELECT qt.empresa_id,qt.id,qt.codigo||':ESPECIFICO',qt.nome,'ESPECIFICO',qt.carga_horaria,qt.validade,0,1
  FROM qualificacoes_tipos qt
  JOIN qualificacoes_categorias qc ON qc.id=qt.categoria_id AND qc.empresa_id=qt.empresa_id
 WHERE qt.empresa_id=6 AND qt.deleted_at IS NULL AND COALESCE(qt.ativo,1)=1
   AND qc.deleted_at IS NULL AND COALESCE(qc.ativo,1)=1 AND UPPER(TRIM(qc.codigo))='VOO'
   AND NOT EXISTS(SELECT 1 FROM treinamento_programas p WHERE p.empresa_id=qt.empresa_id AND p.qualificacao_tipo_id=qt.id AND p.deleted_at IS NULL)
   AND NOT EXISTS(SELECT 1 FROM treinamento_programas p WHERE p.empresa_id=qt.empresa_id AND p.codigo=qt.codigo||':ESPECIFICO' AND p.deleted_at IS NULL);

-- CRM D3 proves the same architecture outside simulator training: one qualification,
-- distinct Initial and Periodic programs with different certificate workloads.
INSERT INTO treinamento_programas
 (empresa_id,qualificacao_tipo_id,codigo,nome,tipo_treinamento,carga_horaria,validade_meses,uso_unico,total_ciclos)
SELECT qt.empresa_id,qt.id,'D3:INICIAL',qt.nome||' — Inicial','INICIAL',qt.carga_horaria_inicial,qt.validade,1,1
FROM qualificacoes_tipos qt WHERE qt.empresa_id=6 AND qt.codigo='D3' AND qt.deleted_at IS NULL AND COALESCE(qt.carga_horaria_inicial,0)>0
AND NOT EXISTS(SELECT 1 FROM treinamento_programas p WHERE p.empresa_id=6 AND p.codigo='D3:INICIAL' AND p.deleted_at IS NULL);
INSERT INTO treinamento_programas
 (empresa_id,qualificacao_tipo_id,codigo,nome,tipo_treinamento,carga_horaria,validade_meses,uso_unico,total_ciclos)
SELECT qt.empresa_id,qt.id,'D3:RECORRENTE',qt.nome||' — Periódico','RECORRENTE',qt.carga_horaria_recorrente,qt.validade,0,1
FROM qualificacoes_tipos qt WHERE qt.empresa_id=6 AND qt.codigo='D3' AND qt.deleted_at IS NULL AND COALESCE(qt.carga_horaria_recorrente,0)>0
AND NOT EXISTS(SELECT 1 FROM treinamento_programas p WHERE p.empresa_id=6 AND p.codigo='D3:RECORRENTE' AND p.deleted_at IS NULL);

-- Explicit succession: Initial is used once; all subsequent renewals use Periodic.
UPDATE treinamento_programas
   SET proximo_programa_id=(SELECT p2.id FROM treinamento_programas p2 WHERE p2.empresa_id=treinamento_programas.empresa_id AND p2.qualificacao_tipo_id=treinamento_programas.qualificacao_tipo_id AND p2.tipo_treinamento='RECORRENTE' AND p2.deleted_at IS NULL ORDER BY p2.id LIMIT 1),
       updated_at=datetime('now')
 WHERE empresa_id=6 AND tipo_treinamento='INICIAL' AND deleted_at IS NULL
   AND EXISTS(SELECT 1 FROM treinamento_programas p2 WHERE p2.empresa_id=treinamento_programas.empresa_id AND p2.qualificacao_tipo_id=treinamento_programas.qualificacao_tipo_id AND p2.tipo_treinamento='RECORRENTE' AND p2.deleted_at IS NULL);
UPDATE treinamento_programas
   SET proximo_programa_id=id, updated_at=datetime('now')
 WHERE empresa_id=6 AND tipo_treinamento IN ('RECORRENTE','SEMESTRAL') AND deleted_at IS NULL;

-- Migrate the already-approved rotating annual/semiannual curricula from 0493.
INSERT INTO treinamento_programa_modelos
 (empresa_id,programa_id,ciclo,modelo_sessao_id,codigo_canonico,ordem)
SELECT i.empresa_id,p.id,i.ciclo,msv.modelo_id,i.codigo_canonico,i.ordem
  FROM simuladores_curriculos_voo_itens i
  JOIN treinamento_programas p ON p.empresa_id=i.empresa_id AND p.qualificacao_tipo_id=i.qualificacao_tipo_id AND p.deleted_at IS NULL
   AND p.tipo_treinamento=CASE WHEN p.qualificacao_tipo_id=106 THEN 'SEMESTRAL' ELSE 'RECORRENTE' END
  JOIN modelos_sessao_versionamento msv ON msv.empresa_id=i.empresa_id AND msv.codigo_canonico=i.codigo_canonico AND msv.is_current=1
  JOIN modelos_sessao ms ON ms.id=msv.modelo_id AND ms.empresa_id=i.empresa_id AND ms.deleted_at IS NULL AND COALESCE(ms.ativo,1)=1
 WHERE i.empresa_id=6 AND i.deleted_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM treinamento_programa_modelos pm WHERE pm.empresa_id=i.empresa_id AND pm.programa_id=p.id AND pm.ciclo=i.ciclo AND pm.codigo_canonico=i.codigo_canonico AND pm.deleted_at IS NULL);
-- Initial AW139 curriculum (12 x 2h = qualification Initial program total 24h).
WITH wanted(codigo_canonico,ordem) AS (
  VALUES
  ('A139-I-01/12',1),('A139-I-02/12',2),('A139-I-03/12',3),('A139-I-04/12',4),
  ('A139-I-05/12',5),('A139-I-06/12',6),('A139-I-07/12',7),('A139-I-08/12',8),
  ('A139-I-09/12',9),('A139-I-10/12',10),('A139-I-11/12',11),('A139-I-12/12',12)
)
INSERT INTO treinamento_programa_modelos
 (empresa_id,programa_id,ciclo,modelo_sessao_id,codigo_canonico,ordem)
SELECT 6,p.id,1,msv.modelo_id,w.codigo_canonico,w.ordem
FROM wanted w
JOIN modelos_sessao_versionamento msv ON msv.empresa_id=6 AND msv.codigo_canonico=w.codigo_canonico AND msv.is_current=1
JOIN modelos_sessao ms ON ms.id=msv.modelo_id AND ms.empresa_id=6 AND ms.deleted_at IS NULL AND COALESCE(ms.ativo,1)=1
JOIN treinamento_programas p ON p.empresa_id=6 AND p.codigo='G1:INICIAL' AND p.deleted_at IS NULL
WHERE NOT EXISTS(SELECT 1 FROM treinamento_programa_modelos pm WHERE pm.empresa_id=6 AND pm.programa_id=p.id AND pm.ciclo=1 AND pm.codigo_canonico=w.codigo_canonico AND pm.deleted_at IS NULL);

-- Initial SK76 curriculum.
WITH wanted(codigo_canonico,ordem) AS (
  VALUES
  ('SK76-I-01/12',1),('SK76-I-02/12',2),('SK76-I-03/12',3),('SK76-I-04/12',4),
  ('SK76-I-05/12',5),('SK76-I-06/12',6),('SK76-I-07/12',7),('SK76-I-08/12',8),
  ('SK76-I-09/12',9),('SK76-I-10/12',10),('SK76-I-11/12',11),('SK76-I-12/12',12)
)
INSERT INTO treinamento_programa_modelos
 (empresa_id,programa_id,ciclo,modelo_sessao_id,codigo_canonico,ordem)
SELECT 6,p.id,1,msv.modelo_id,w.codigo_canonico,w.ordem
FROM wanted w
JOIN modelos_sessao_versionamento msv ON msv.empresa_id=6 AND msv.codigo_canonico=w.codigo_canonico AND msv.is_current=1
JOIN modelos_sessao ms ON ms.id=msv.modelo_id AND ms.empresa_id=6 AND ms.deleted_at IS NULL AND COALESCE(ms.ativo,1)=1
JOIN treinamento_programas p ON p.empresa_id=6 AND p.codigo='G2:INICIAL' AND p.deleted_at IS NULL
WHERE NOT EXISTS(SELECT 1 FROM treinamento_programa_modelos pm WHERE pm.empresa_id=6 AND pm.programa_id=p.id AND pm.ciclo=1 AND pm.codigo_canonico=w.codigo_canonico AND pm.deleted_at IS NULL);

-- SK76 semiannual program uses the two canonical semiannual models already in the matrix.
WITH wanted(codigo_canonico,ordem) AS (
  VALUES ('SK76-S-01/02',1),('SK76-S-02/02',2)
)
INSERT INTO treinamento_programa_modelos
 (empresa_id,programa_id,ciclo,modelo_sessao_id,codigo_canonico,ordem)
SELECT 6,p.id,1,msv.modelo_id,w.codigo_canonico,w.ordem
FROM wanted w
JOIN modelos_sessao_versionamento msv ON msv.empresa_id=6 AND msv.codigo_canonico=w.codigo_canonico AND msv.is_current=1
JOIN modelos_sessao ms ON ms.id=msv.modelo_id AND ms.empresa_id=6 AND ms.deleted_at IS NULL AND COALESCE(ms.ativo,1)=1
JOIN treinamento_programas p ON p.empresa_id=6 AND p.codigo='G2-SEM:SEMESTRAL' AND p.deleted_at IS NULL
WHERE NOT EXISTS(SELECT 1 FROM treinamento_programa_modelos pm WHERE pm.empresa_id=6 AND pm.programa_id=p.id AND pm.ciclo=1 AND pm.codigo_canonico=w.codigo_canonico AND pm.deleted_at IS NULL);

-- The final simulator model grants the qualification. Link the current canonical
-- final Initial/Semiannual models physically for legacy writers; program mapping remains canonical.
UPDATE modelos_sessao SET qualificacao_tipo_id=33, gera_qualificacao=1, updated_at=datetime('now')
 WHERE id=(SELECT modelo_id FROM modelos_sessao_versionamento WHERE empresa_id=6 AND codigo_canonico='A139-I-12/12' AND is_current=1)
   AND empresa_id=6 AND deleted_at IS NULL;
UPDATE modelos_sessao SET qualificacao_tipo_id=40, gera_qualificacao=1, updated_at=datetime('now')
 WHERE id=(SELECT modelo_id FROM modelos_sessao_versionamento WHERE empresa_id=6 AND codigo_canonico='SK76-I-12/12' AND is_current=1)
   AND empresa_id=6 AND deleted_at IS NULL;
UPDATE modelos_sessao
   SET qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G2-SEM' AND deleted_at IS NULL LIMIT 1),
       ordem_no_treinamento=1, gera_qualificacao=0, updated_at=datetime('now')
 WHERE id=(SELECT modelo_id FROM modelos_sessao_versionamento WHERE empresa_id=6 AND codigo_canonico='SK76-S-01/02' AND is_current=1)
   AND empresa_id=6 AND deleted_at IS NULL;
UPDATE modelos_sessao
   SET qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G2-SEM' AND deleted_at IS NULL LIMIT 1),
       ordem_no_treinamento=2, gera_qualificacao=1, updated_at=datetime('now')
 WHERE id=(SELECT modelo_id FROM modelos_sessao_versionamento WHERE empresa_id=6 AND codigo_canonico='SK76-S-02/02' AND is_current=1)
   AND empresa_id=6 AND deleted_at IS NULL;

-- Complementary semiannual obligation: annual G2 completion schedules G2-SEM at +6 months.
INSERT INTO treinamento_dependencias
 (empresa_id,qualificacao_origem_id,qualificacao_destino_id,intervalo_meses,vigencia_inicio,observacoes)
SELECT 6,g2.id,g2s.id,6,'2026-09-14','SK76: Periódico G2 gera planejamento Semestral G2-SEM em 6 meses.'
FROM qualificacoes_tipos g2, qualificacoes_tipos g2s
WHERE g2.empresa_id=6 AND g2.codigo='G2' AND g2.deleted_at IS NULL
  AND g2s.empresa_id=6 AND g2s.codigo='G2-SEM' AND g2s.deleted_at IS NULL
  AND NOT EXISTS(
    SELECT 1 FROM treinamento_dependencias d
     WHERE d.empresa_id=6 AND d.qualificacao_origem_id=g2.id AND d.qualificacao_destino_id=g2s.id
       AND d.deleted_at IS NULL
  );

-- Bind explicit history type to its program without reclassifying ambiguous legacy rows.
CREATE TRIGGER IF NOT EXISTS trg_qualificacoes_historico_programa_insert_0495
AFTER INSERT ON qualificacoes_historico
WHEN NEW.programa_treinamento_id IS NULL AND NEW.qualificacao_id IS NOT NULL AND NEW.tipo_treinamento IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico SET programa_treinamento_id=(
    SELECT p.id FROM treinamento_programas p
     WHERE p.empresa_id=NEW.empresa_id AND p.qualificacao_tipo_id=NEW.qualificacao_id
       AND p.tipo_treinamento=NEW.tipo_treinamento AND p.ativo=1 AND p.deleted_at IS NULL
     ORDER BY p.id LIMIT 1
  ) WHERE id=NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_qualificacoes_historico_programa_update_0495
AFTER UPDATE OF qualificacao_id,tipo_treinamento,programa_treinamento_id ON qualificacoes_historico
WHEN NEW.programa_treinamento_id IS NULL AND NEW.qualificacao_id IS NOT NULL AND NEW.tipo_treinamento IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico SET programa_treinamento_id=(
    SELECT p.id FROM treinamento_programas p
     WHERE p.empresa_id=NEW.empresa_id AND p.qualificacao_tipo_id=NEW.qualificacao_id
       AND p.tipo_treinamento=NEW.tipo_treinamento AND p.ativo=1 AND p.deleted_at IS NULL
     ORDER BY p.id LIMIT 1
  ) WHERE id=NEW.id;
END;

-- Existing history is intentionally not backfilled: legacy tipo_treinamento may have
-- been inferred from workload. New writes carry the explicit program id and the
-- trigger only enriches new rows that already have an explicit training type.

CREATE TABLE IF NOT EXISTS _0495_post_guard(id INTEGER PRIMARY KEY CHECK(id=1));
CREATE TRIGGER IF NOT EXISTS _0495_post_validate BEFORE INSERT ON _0495_post_guard BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM treinamento_programas p JOIN qualificacoes_tipos q ON q.id=p.qualificacao_tipo_id WHERE p.empresa_id=6 AND q.codigo='G1' AND p.deleted_at IS NULL AND p.tipo_treinamento IN ('INICIAL','RECORRENTE'))<>2
    THEN RAISE(ABORT,'0495 post: G1 Initial/Periodic programs missing') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM treinamento_programas p JOIN qualificacoes_tipos q ON q.id=p.qualificacao_tipo_id WHERE p.empresa_id=6 AND q.codigo='G2' AND p.deleted_at IS NULL AND p.tipo_treinamento IN ('INICIAL','RECORRENTE'))<>2
    THEN RAISE(ABORT,'0495 post: G2 Initial/Periodic programs missing') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM treinamento_programa_modelos pm JOIN treinamento_programas p ON p.id=pm.programa_id WHERE pm.empresa_id=6 AND p.codigo='G1:INICIAL' AND pm.deleted_at IS NULL)<>12
    THEN RAISE(ABORT,'0495 post: G1 Initial curriculum must have 12 sessions') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM treinamento_programa_modelos pm JOIN treinamento_programas p ON p.id=pm.programa_id WHERE pm.empresa_id=6 AND p.codigo='G2:INICIAL' AND pm.deleted_at IS NULL)<>12
    THEN RAISE(ABORT,'0495 post: G2 Initial curriculum must have 12 sessions') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM treinamento_programa_modelos pm JOIN treinamento_programas p ON p.id=pm.programa_id WHERE pm.empresa_id=6 AND p.codigo='G1:RECORRENTE' AND pm.deleted_at IS NULL)<>12
    THEN RAISE(ABORT,'0495 post: G1 Periodic curriculum must have 12 cycle rows') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM treinamento_programa_modelos pm JOIN treinamento_programas p ON p.id=pm.programa_id WHERE pm.empresa_id=6 AND p.codigo='G2:RECORRENTE' AND pm.deleted_at IS NULL)<>9
    THEN RAISE(ABORT,'0495 post: G2 Periodic curriculum must have 9 cycle rows') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM treinamento_programa_modelos pm JOIN treinamento_programas p ON p.id=pm.programa_id WHERE pm.empresa_id=6 AND p.codigo='G1-SEM:SEMESTRAL' AND pm.deleted_at IS NULL)<>6
    THEN RAISE(ABORT,'0495 post: G1-SEM curriculum must have 6 cycle rows') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM treinamento_programa_modelos pm JOIN treinamento_programas p ON p.id=pm.programa_id WHERE pm.empresa_id=6 AND p.codigo='G2-SEM:SEMESTRAL' AND pm.deleted_at IS NULL)<>2
    THEN RAISE(ABORT,'0495 post: G2-SEM curriculum must have 2 sessions') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM treinamento_programas WHERE empresa_id=6 AND codigo IN ('D3:INICIAL','D3:RECORRENTE') AND deleted_at IS NULL)<>2
    THEN RAISE(ABORT,'0495 post: CRM D3 Initial/Periodic programs missing') END;
END;
INSERT INTO _0495_post_guard(id) VALUES(1);
DROP TRIGGER IF EXISTS _0495_post_validate;
DROP TABLE IF EXISTS _0495_post_guard;

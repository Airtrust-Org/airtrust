-- 0493_simulator_annual_curriculum_cycles.sql
-- Additive cycle-aware flight curriculum model.
-- Operational baseline: Costa do Sol recurrent curricula rotate C2 in 2026,
-- C3 in 2027, C1 in 2028, then repeat every three calendar years.
-- Historical/planned executions remain frozen by their existing planning snapshots.
-- source_reference: user-approved 3-year curriculum rotation (2026=C2, 2027=C3, 2028=C1) plus read-only production D1 audit of canonical/current simulator session models on 2026-09-14.
-- operational_decision: keep G1/G1-SEM/G2 qualification identities stable and model C1/C2/C3 as tenant-scoped child curricula resolved by reference year.
-- dry_run_required: true — run the dedicated 0493 SQLite migration tests and production read-only preflight before any remote apply.
-- rollback_plan_required: true — capture a D1 Time Travel recovery point before production apply; do not use ad hoc reverse SQL.

CREATE TABLE IF NOT EXISTS simuladores_curriculos_voo_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  qualificacao_tipo_id INTEGER NOT NULL,
  total_ciclos INTEGER NOT NULL DEFAULT 3 CHECK (total_ciclos BETWEEN 1 AND 12),
  ano_base INTEGER NOT NULL CHECK (ano_base BETWEEN 2000 AND 2100),
  ciclo_ano_base INTEGER NOT NULL CHECK (ciclo_ano_base BETWEEN 1 AND total_ciclos),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (qualificacao_tipo_id) REFERENCES qualificacoes_tipos(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_curr_voo_config_active
  ON simuladores_curriculos_voo_config (empresa_id, qualificacao_tipo_id)
  WHERE ativo = 1 AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS simuladores_curriculos_voo_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  qualificacao_tipo_id INTEGER NOT NULL,
  ciclo INTEGER NOT NULL CHECK (ciclo BETWEEN 1 AND 12),
  modelo_sessao_id INTEGER NOT NULL,
  codigo_canonico TEXT NOT NULL CHECK (length(trim(codigo_canonico)) > 0),
  ordem INTEGER NOT NULL CHECK (ordem BETWEEN 1 AND 50),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (qualificacao_tipo_id) REFERENCES qualificacoes_tipos(id),
  FOREIGN KEY (modelo_sessao_id) REFERENCES modelos_sessao(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_curr_voo_itens_order_active
  ON simuladores_curriculos_voo_itens (empresa_id, qualificacao_tipo_id, ciclo, ordem)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_curr_voo_itens_code_active
  ON simuladores_curriculos_voo_itens (empresa_id, qualificacao_tipo_id, ciclo, codigo_canonico)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sim_curr_voo_itens_model
  ON simuladores_curriculos_voo_itens (empresa_id, modelo_sessao_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_sim_curr_voo_config_tenant_insert
BEFORE INSERT ON simuladores_curriculos_voo_config
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM qualificacoes_tipos qt
     WHERE qt.id=NEW.qualificacao_tipo_id AND qt.empresa_id=NEW.empresa_id
       AND qt.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'sim_curr_voo_config: qualificacao fora do tenant') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_sim_curr_voo_itens_guard_insert
BEFORE INSERT ON simuladores_curriculos_voo_itens
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM simuladores_curriculos_voo_config c
     WHERE c.empresa_id=NEW.empresa_id
       AND c.qualificacao_tipo_id=NEW.qualificacao_tipo_id
       AND c.ativo=1 AND c.deleted_at IS NULL
       AND NEW.ciclo BETWEEN 1 AND c.total_ciclos
  ) THEN RAISE(ABORT, 'sim_curr_voo_itens: ciclo/configuracao invalido') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM modelos_sessao ms
     WHERE ms.id=NEW.modelo_sessao_id AND ms.empresa_id=NEW.empresa_id
       AND ms.deleted_at IS NULL AND COALESCE(ms.ativo,1)=1
  ) THEN RAISE(ABORT, 'sim_curr_voo_itens: modelo fora do tenant ou inativo') END;
END;

-- Costa do Sol: recurrent flight curricula share the same three-year rotation.
INSERT INTO simuladores_curriculos_voo_config
  (empresa_id, qualificacao_tipo_id, total_ciclos, ano_base, ciclo_ano_base, ativo)
SELECT 6, qt.id, 3, 2026, 2, 1
  FROM qualificacoes_tipos qt
 WHERE qt.empresa_id=6
   AND qt.deleted_at IS NULL
   AND COALESCE(qt.ativo,1)=1
   AND qt.codigo IN ('G1','G1-SEM','G2')
   AND NOT EXISTS (
     SELECT 1 FROM simuladores_curriculos_voo_config c
      WHERE c.empresa_id=qt.empresa_id AND c.qualificacao_tipo_id=qt.id
        AND c.ativo=1 AND c.deleted_at IS NULL
   );

-- AW139 annual G1: four sessions in each of C1/C2/C3.
INSERT INTO simuladores_curriculos_voo_itens
  (empresa_id, qualificacao_tipo_id, ciclo, modelo_sessao_id, codigo_canonico, ordem)
SELECT 6, qt.id,
       CAST(substr(v.codigo_canonico, instr(v.codigo_canonico, '-C') + 2, 1) AS INTEGER),
       v.modelo_id, v.codigo_canonico,
       CASE
         WHEN v.codigo_canonico LIKE 'A139-P-01/04-%' THEN 1
         WHEN v.codigo_canonico LIKE 'A139-P-02/04-%' THEN 2
         WHEN v.codigo_canonico LIKE 'A139-P-03/04-%' THEN 3
         WHEN v.codigo_canonico LIKE 'A139-P-04/04-%' THEN 4
       END
  FROM modelos_sessao_versionamento v
  JOIN qualificacoes_tipos qt ON qt.empresa_id=6 AND qt.codigo='G1' AND qt.deleted_at IS NULL
 WHERE v.empresa_id=6 AND v.is_current=1
   AND (
     v.codigo_canonico GLOB 'A139-P-01/04-C[123]' OR
     v.codigo_canonico GLOB 'A139-P-02/04-C[123]-OFFSHORE' OR
     v.codigo_canonico GLOB 'A139-P-03/04-C[123]-IFR-LOFT' OR
     v.codigo_canonico GLOB 'A139-P-04/04-C[123]-CHECK'
   )
   AND NOT EXISTS (
     SELECT 1 FROM simuladores_curriculos_voo_itens i
      WHERE i.empresa_id=6 AND i.qualificacao_tipo_id=qt.id
        AND i.ciclo=CAST(substr(v.codigo_canonico, instr(v.codigo_canonico, '-C') + 2, 1) AS INTEGER)
        AND i.codigo_canonico=v.codigo_canonico AND i.deleted_at IS NULL
   );

-- AW139 semiannual G1-SEM follows the same year cycle with two sessions.
INSERT INTO simuladores_curriculos_voo_itens
  (empresa_id, qualificacao_tipo_id, ciclo, modelo_sessao_id, codigo_canonico, ordem)
SELECT 6, qt.id,
       CAST(substr(v.codigo_canonico, instr(v.codigo_canonico, '-C') + 2, 1) AS INTEGER),
       v.modelo_id, v.codigo_canonico,
       CASE WHEN v.codigo_canonico LIKE 'A139-S-01/02-%' THEN 1 ELSE 2 END
  FROM modelos_sessao_versionamento v
  JOIN qualificacoes_tipos qt ON qt.empresa_id=6 AND qt.codigo='G1-SEM' AND qt.deleted_at IS NULL
 WHERE v.empresa_id=6 AND v.is_current=1
   AND (
     v.codigo_canonico GLOB 'A139-S-01/02-C[123]' OR
     v.codigo_canonico GLOB 'A139-S-02/02-C[123]'
   )
   AND NOT EXISTS (
     SELECT 1 FROM simuladores_curriculos_voo_itens i
      WHERE i.empresa_id=6 AND i.qualificacao_tipo_id=qt.id
        AND i.ciclo=CAST(substr(v.codigo_canonico, instr(v.codigo_canonico, '-C') + 2, 1) AS INTEGER)
        AND i.codigo_canonico=v.codigo_canonico AND i.deleted_at IS NULL
   );

-- S-76 annual G2: two cycle-specific sessions plus the shared check as S3.
INSERT INTO simuladores_curriculos_voo_itens
  (empresa_id, qualificacao_tipo_id, ciclo, modelo_sessao_id, codigo_canonico, ordem)
SELECT 6, qt.id,
       CAST(substr(v.codigo_canonico, instr(v.codigo_canonico, '-C') + 2, 1) AS INTEGER),
       v.modelo_id, v.codigo_canonico,
       CASE WHEN v.codigo_canonico LIKE 'S76-P-01/%' THEN 1 ELSE 2 END
  FROM modelos_sessao_versionamento v
  JOIN qualificacoes_tipos qt ON qt.empresa_id=6 AND qt.codigo='G2' AND qt.deleted_at IS NULL
 WHERE v.empresa_id=6 AND v.is_current=1
   AND (
     v.codigo_canonico GLOB 'S76-P-01/0[34]-C[123]' OR
     v.codigo_canonico GLOB 'S76-P-02/0[34]-C[123]'
   )
   AND NOT EXISTS (
     SELECT 1 FROM simuladores_curriculos_voo_itens i
      WHERE i.empresa_id=6 AND i.qualificacao_tipo_id=qt.id
        AND i.ciclo=CAST(substr(v.codigo_canonico, instr(v.codigo_canonico, '-C') + 2, 1) AS INTEGER)
        AND i.codigo_canonico=v.codigo_canonico AND i.deleted_at IS NULL
   );

INSERT INTO simuladores_curriculos_voo_itens
  (empresa_id, qualificacao_tipo_id, ciclo, modelo_sessao_id, codigo_canonico, ordem)
SELECT 6, qt.id, cycles.ciclo, v.modelo_id, v.codigo_canonico, 3
  FROM modelos_sessao_versionamento v
  JOIN qualificacoes_tipos qt ON qt.empresa_id=6 AND qt.codigo='G2' AND qt.deleted_at IS NULL
  CROSS JOIN (SELECT 1 AS ciclo UNION ALL SELECT 2 UNION ALL SELECT 3) cycles
 WHERE v.empresa_id=6 AND v.is_current=1 AND v.codigo_canonico='SK76-P-CHECK'
   AND NOT EXISTS (
     SELECT 1 FROM simuladores_curriculos_voo_itens i
      WHERE i.empresa_id=6 AND i.qualificacao_tipo_id=qt.id
        AND i.ciclo=cycles.ciclo AND i.codigo_canonico=v.codigo_canonico AND i.deleted_at IS NULL
   );

-- 0492_organizational_structure_normalization.sql
-- Canonical organizational structure for employee sector/function compliance.
-- Tenant-specific data correction is restricted to empresa_id=6; schema support is generic.
-- source_reference: user-approved organizational mapping (2026-09-14) plus read-only production D1 sector/function/reference audit.
-- operational_decision: normalize CTM->Manutenção, Qualidade->QSMS, First Officer->Copiloto, engineering/supplies ownership, and canonical employee function IDs for tenant 6.
-- dry_run_required: true — staging applies only through the dedicated governed runner after backup/preflight.
-- rollback_plan_required: true — use the captured D1 Time Travel recovery point; no ad hoc reverse SQL.

ALTER TABLE funcionarios ADD COLUMN funcao_id INTEGER REFERENCES funcoes(id);

CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa_funcao_id
  ON funcionarios(empresa_id, funcao_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_funcionarios_funcao_tenant_insert
BEFORE INSERT ON funcionarios
FOR EACH ROW WHEN NEW.funcao_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM funcoes f
     WHERE f.id = NEW.funcao_id
       AND f.empresa_id = NEW.empresa_id
       AND f.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'funcionarios: funcao fora do tenant') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_funcionarios_funcao_tenant_update
BEFORE UPDATE OF empresa_id, funcao_id ON funcionarios
FOR EACH ROW WHEN NEW.funcao_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM funcoes f
     WHERE f.id = NEW.funcao_id
       AND f.empresa_id = NEW.empresa_id
       AND f.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'funcionarios: funcao fora do tenant') END;
END;

CREATE TABLE IF NOT EXISTS setores_funcoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  setor_id INTEGER NOT NULL,
  funcao_id INTEGER NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (setor_id) REFERENCES setores(id),
  FOREIGN KEY (funcao_id) REFERENCES funcoes(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_setores_funcoes_unique_active
  ON setores_funcoes(empresa_id,setor_id,funcao_id) WHERE ativo=1 AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_setores_funcoes_empresa_setor
  ON setores_funcoes(empresa_id,setor_id) WHERE ativo=1 AND deleted_at IS NULL;
CREATE TRIGGER IF NOT EXISTS trg_setores_funcoes_tenant_insert
BEFORE INSERT ON setores_funcoes FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM setores s WHERE s.id=NEW.setor_id AND s.empresa_id=NEW.empresa_id AND s.deleted_at IS NULL
  ) THEN RAISE(ABORT,'setores_funcoes: setor fora do tenant') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM funcoes f WHERE f.id=NEW.funcao_id AND f.empresa_id=NEW.empresa_id AND f.deleted_at IS NULL
  ) THEN RAISE(ABORT,'setores_funcoes: funcao fora do tenant') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_setores_funcoes_tenant_update
BEFORE UPDATE OF empresa_id,setor_id,funcao_id ON setores_funcoes FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM setores s WHERE s.id=NEW.setor_id AND s.empresa_id=NEW.empresa_id AND s.deleted_at IS NULL
  ) THEN RAISE(ABORT,'setores_funcoes: setor fora do tenant') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM funcoes f WHERE f.id=NEW.funcao_id AND f.empresa_id=NEW.empresa_id AND f.deleted_at IS NULL
  ) THEN RAISE(ABORT,'setores_funcoes: funcao fora do tenant') END;
END;

CREATE TABLE IF NOT EXISTS setores_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  alias TEXT NOT NULL,
  setor_id INTEGER NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (setor_id) REFERENCES setores(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_setores_aliases_unique_active
  ON setores_aliases(empresa_id,LOWER(TRIM(alias))) WHERE ativo=1 AND deleted_at IS NULL;
CREATE TRIGGER IF NOT EXISTS trg_setores_aliases_tenant_insert
BEFORE INSERT ON setores_aliases FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM setores s WHERE s.id=NEW.setor_id AND s.empresa_id=NEW.empresa_id AND s.deleted_at IS NULL
  ) THEN RAISE(ABORT,'setores_aliases: setor fora do tenant') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_setores_aliases_tenant_update
BEFORE UPDATE OF empresa_id,setor_id ON setores_aliases FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM setores s WHERE s.id=NEW.setor_id AND s.empresa_id=NEW.empresa_id AND s.deleted_at IS NULL
  ) THEN RAISE(ABORT,'setores_aliases: setor fora do tenant') END;
END;

CREATE TABLE IF NOT EXISTS funcoes_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  alias TEXT NOT NULL,
  funcao_id INTEGER NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcao_id) REFERENCES funcoes(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_funcoes_aliases_unique_active
  ON funcoes_aliases(empresa_id,LOWER(TRIM(alias))) WHERE ativo=1 AND deleted_at IS NULL;
CREATE TRIGGER IF NOT EXISTS trg_funcoes_aliases_tenant_insert
BEFORE INSERT ON funcoes_aliases FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM funcoes f WHERE f.id=NEW.funcao_id AND f.empresa_id=NEW.empresa_id AND f.deleted_at IS NULL
  ) THEN RAISE(ABORT,'funcoes_aliases: funcao fora do tenant') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_funcoes_aliases_tenant_update
BEFORE UPDATE OF empresa_id,funcao_id ON funcoes_aliases FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM funcoes f WHERE f.id=NEW.funcao_id AND f.empresa_id=NEW.empresa_id AND f.deleted_at IS NULL
  ) THEN RAISE(ABORT,'funcoes_aliases: funcao fora do tenant') END;
END;

-- Canonical function catalog for the current Costa do Sol organization.
INSERT OR IGNORE INTO funcoes (codigo,nome,descricao,categoria,ativo,empresa_id,created_at,updated_at) VALUES
('ORG_ASG','Auxiliar de Serviços Gerais','Função organizacional canônica','ADMINISTRATIVO',1,6,datetime('now'),datetime('now')),
('ORG_COORD_BASE','Coordenador de Base','Função organizacional canônica','ADMINISTRATIVO',1,6,datetime('now'),datetime('now')),
('ORG_GER_BASES','Gerente de Bases','Função organizacional canônica','ADMINISTRATIVO',1,6,datetime('now'),datetime('now')),
('ORG_VIGIA','Vigia','Função organizacional canônica','ADMINISTRATIVO',1,6,datetime('now'),datetime('now')),
('ORG_CONS_COM','Consultor Comercial','Função organizacional canônica','COMERCIAL',1,6,datetime('now'),datetime('now')),
('ORG_GER_COM','Gerente Comercial','Função organizacional canônica','COMERCIAL',1,6,datetime('now'),datetime('now')),
('ORG_AN_COMPRAS','Analista de Compras','Função organizacional canônica','COMPRAS',1,6,datetime('now'),datetime('now')),
('ORG_COORD_COMP_LOG','Coordenador de Compras e Logística','Função organizacional canônica','COMPRAS',1,6,datetime('now'),datetime('now')),
('ORG_AN_FIN','Analista Financeiro','Função organizacional canônica','CONTROLADORIA',1,6,datetime('now'),datetime('now')),
('ORG_AUX_FIN','Auxiliar Financeiro','Função organizacional canônica','CONTROLADORIA',1,6,datetime('now'),datetime('now')),
('ORG_ADV','Advogado','Função organizacional canônica','JURIDICO',1,6,datetime('now'),datetime('now')),
('ORG_AUX_SUPR','Auxiliar de Suprimentos','Função organizacional canônica','LOGISTICA',1,6,datetime('now'),datetime('now')),
('ORG_AN_CTM_I','Analista de CTM I','Função organizacional canônica','MANUTENCAO',1,6,datetime('now'),datetime('now')),
('ORG_AN_SUPR_II','Analista de Suprimentos II','Função organizacional canônica','MANUTENCAO',1,6,datetime('now'),datetime('now')),
('ORG_AUX_CTM_I','Auxiliar de CTM I','Função organizacional canônica','MANUTENCAO',1,6,datetime('now'),datetime('now')),
('ORG_AUX_MAN','Auxiliar de Manutenção','Função organizacional canônica','MANUTENCAO',1,6,datetime('now'),datetime('now')),
('ORG_COORD_ENG','Coordenador de Engenharia','Função organizacional canônica','MANUTENCAO',1,6,datetime('now'),datetime('now')),
('ORG_AG_ATEND','Agente de Atendimento','Função organizacional canônica','OPERACIONAL',1,6,datetime('now'),datetime('now')),
('ORG_AG_RAMPA','Agente de Rampa','Função organizacional canônica','OPERACIONAL',1,6,datetime('now'),datetime('now')),
('ORG_ASSIST_OPS','Assistente de Operações','Função organizacional canônica','OPERACIONAL',1,6,datetime('now'),datetime('now')),
('ORG_AUX_COORD_VOO','Auxiliar de Coordenação de Voo','Função organizacional canônica','OPERACIONAL',1,6,datetime('now'),datetime('now')),
('ORG_COORD_VOO','Coordenador de Voo','Função organizacional canônica','OPERACIONAL',1,6,datetime('now'),datetime('now')),
('ORG_GER_OPS','Gerente de Operações','Função organizacional canônica','OPERACIONAL',1,6,datetime('now'),datetime('now')),
('ORG_MOTORISTA','Motorista','Função organizacional canônica','OPERACIONAL',1,6,datetime('now'),datetime('now')),
('ORG_AUX_QSMS','Auxiliar de QSMS','Função organizacional canônica','QSMS',1,6,datetime('now'),datetime('now')),
('ORG_TEC_SEG_TRAB','Técnico de Segurança do Trabalho','Função organizacional canônica','QSMS',1,6,datetime('now'),datetime('now')),
('ORG_ASSIST_ADM_RH','Assistente Administrativo e de RH','Função organizacional canônica','RH',1,6,datetime('now'),datetime('now')),
('ORG_ASSIST_SEG_OP','Assistente de Segurança Operacional','Função organizacional canônica','SEGURANCA_OPERACIONAL',1,6,datetime('now'),datetime('now'));

-- Legacy labels resolve to the approved canonical organization on future edits/imports.
INSERT OR IGNORE INTO setores_aliases(empresa_id,alias,setor_id) VALUES
  (6,'CTM',11),(6,'Qualidade',28);
INSERT OR IGNORE INTO funcoes_aliases(empresa_id,alias,funcao_id)
  SELECT 6,'1º Oficial',id FROM funcoes WHERE empresa_id=6 AND codigo='SIC' AND deleted_at IS NULL;
INSERT OR IGNORE INTO funcoes_aliases(empresa_id,alias,funcao_id)
  SELECT 6,'1° Oficial',id FROM funcoes WHERE empresa_id=6 AND codigo='SIC' AND deleted_at IS NULL;
INSERT OR IGNORE INTO funcoes_aliases(empresa_id,alias,funcao_id)
  SELECT 6,'1o Oficial',id FROM funcoes WHERE empresa_id=6 AND codigo='SIC' AND deleted_at IS NULL;
INSERT OR IGNORE INTO funcoes_aliases(empresa_id,alias,funcao_id)
  SELECT 6,'Primeiro Oficial',id FROM funcoes WHERE empresa_id=6 AND codigo='SIC' AND deleted_at IS NULL;
INSERT OR IGNORE INTO funcoes_aliases(empresa_id,alias,funcao_id)
  SELECT 6,'Coord de Engenharia',id FROM funcoes WHERE empresa_id=6 AND codigo='ORG_COORD_ENG' AND deleted_at IS NULL;
INSERT OR IGNORE INTO funcoes_aliases(empresa_id,alias,funcao_id)
  SELECT 6,'Auxiliar de Suprimentos II',id FROM funcoes WHERE empresa_id=6 AND codigo='ORG_AUX_SUPR' AND deleted_at IS NULL;

-- Canonical Setor -> Cargo/Função map is independent of current employee headcount.
WITH mapping(setor_id,funcao_nome) AS (VALUES
  (14,'Auxiliar de Serviços Gerais'),(14,'Coordenador de Base'),(14,'Gerente de Bases'),(14,'Vigia'),
  (25,'Consultor Comercial'),(25,'Gerente Comercial'),
  (26,'Analista de Compras'),(26,'Coordenador de Compras e Logística'),
  (27,'Analista Financeiro'),(27,'Auxiliar Financeiro'),
  (29,'Advogado'),
  (31,'Auxiliar de Suprimentos'),
  (11,'Analista de CTM I'),(11,'Analista de Suprimentos II'),(11,'Auxiliar de CTM I'),
  (11,'Auxiliar de Manutenção'),(11,'Auxiliar de Serviços Gerais'),(11,'Coordenador de Engenharia'),(11,'Mecânico'),
  (24,'Agente de Atendimento'),(24,'Agente de Rampa'),(24,'Assistente de Operações'),
  (24,'Auxiliar de Coordenação de Voo'),(24,'Coordenador de Voo'),(24,'Gerente de Operações'),(24,'Motorista'),
  (28,'Auxiliar de QSMS'),(28,'Técnico de Segurança do Trabalho'),
  (30,'Assistente Administrativo e de RH'),
  (5,'Assistente de Segurança Operacional'),
  (10,'Comandante'),(10,'Copiloto')
)
INSERT OR IGNORE INTO setores_funcoes(empresa_id,setor_id,funcao_id)
SELECT 6,s.id,f.id
  FROM mapping m
  JOIN setores s ON s.id=m.setor_id AND s.empresa_id=6 AND s.deleted_at IS NULL AND COALESCE(s.ativo,1)=1
  JOIN funcoes f ON f.empresa_id=6 AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1
                AND UPPER(TRIM(f.nome))=UPPER(TRIM(m.funcao_nome));

-- Merge qualification visibility: CTM -> Manutenção (21 -> 11), Qualidade -> QSMS (15 -> 28).
UPDATE qualificacoes_tipos_setores
   SET deleted_at = datetime('now'), updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL AND setor_id IN (15,21)
   AND EXISTS (
     SELECT 1 FROM qualificacoes_tipos_setores target
      WHERE target.empresa_id = 6 AND target.deleted_at IS NULL
        AND target.tipo_id = qualificacoes_tipos_setores.tipo_id
        AND target.setor_id = CASE qualificacoes_tipos_setores.setor_id WHEN 15 THEN 28 WHEN 21 THEN 11 END
        AND target.id <> qualificacoes_tipos_setores.id
   );
UPDATE qualificacoes_tipos_setores
   SET setor_id = CASE setor_id WHEN 15 THEN 28 WHEN 21 THEN 11 END,
       updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL AND setor_id IN (15,21);

-- Merge LMS catalog visibility with duplicate protection.
UPDATE lms_cursos_setores
   SET deleted_at = datetime('now'), updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL AND setor_id IN (15,21)
   AND EXISTS (
     SELECT 1 FROM lms_cursos_setores target
      WHERE target.empresa_id = 6 AND target.deleted_at IS NULL
        AND target.curso_id = lms_cursos_setores.curso_id
        AND target.setor_id = CASE lms_cursos_setores.setor_id WHEN 15 THEN 28 WHEN 21 THEN 11 END
        AND target.id <> lms_cursos_setores.id
   );
UPDATE lms_cursos_setores
   SET setor_id = CASE setor_id WHEN 15 THEN 28 WHEN 21 THEN 11 END,
       updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL AND setor_id IN (15,21);

-- Merge manager assignments without duplicating the same manager/user on the target sector.
UPDATE setores_gestores
   SET deleted_at = datetime('now'), ativo = 0, updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL AND setor_id IN (15,21)
   AND EXISTS (
     SELECT 1 FROM setores_gestores target
      WHERE target.empresa_id = 6 AND target.deleted_at IS NULL
        AND target.setor_id = CASE setores_gestores.setor_id WHEN 15 THEN 28 WHEN 21 THEN 11 END
        AND target.id <> setores_gestores.id
        AND (
          (setores_gestores.usuario_id IS NOT NULL AND target.usuario_id = setores_gestores.usuario_id)
          OR
          (setores_gestores.usuario_id IS NULL AND target.usuario_id IS NULL
           AND setores_gestores.gestor_id IS NOT NULL AND target.gestor_id = setores_gestores.gestor_id)
        )
   );
UPDATE setores_gestores
   SET setor_id = CASE setor_id WHEN 15 THEN 28 WHEN 21 THEN 11 END,
       updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL AND setor_id IN (15,21);

-- Merge canonical compliance rules with duplicate protection.
UPDATE treinamento_requisitos
   SET deleted_at = datetime('now'), ativo = 0, updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL AND ativo = 1 AND setor_id IN (15,21)
   AND EXISTS (
     SELECT 1 FROM treinamento_requisitos target
      WHERE target.empresa_id = 6 AND target.deleted_at IS NULL AND target.ativo = 1
        AND target.qualificacao_tipo_id = treinamento_requisitos.qualificacao_tipo_id
        AND target.escopo = treinamento_requisitos.escopo
        AND COALESCE(target.funcao_id,0) = COALESCE(treinamento_requisitos.funcao_id,0)
        AND COALESCE(target.funcionario_id,0) = COALESCE(treinamento_requisitos.funcionario_id,0)
        AND target.setor_id = CASE treinamento_requisitos.setor_id WHEN 15 THEN 28 WHEN 21 THEN 11 END
        AND target.id <> treinamento_requisitos.id
   );
UPDATE treinamento_requisitos
   SET setor_id = CASE setor_id WHEN 15 THEN 28 WHEN 21 THEN 11 END,
       updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL AND setor_id IN (15,21);

-- Merge employees in historical/active records and keep legacy sector text aligned.
UPDATE funcionarios
   SET setor_id = CASE setor_id WHEN 15 THEN 28 WHEN 21 THEN 11 END,
       setor = CASE setor_id WHEN 15 THEN 'QSMS' WHEN 21 THEN 'Manutenção' ELSE setor END,
       updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL AND setor_id IN (15,21);

-- User-approved role corrections.
UPDATE funcionarios
   SET funcao = 'Coordenador de Engenharia', updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL
   AND UPPER(TRIM(COALESCE(funcao,''))) = UPPER('Coord de Engenharia');

UPDATE funcionarios
   SET setor_id = 31, setor = 'Logística', cargo = 'Auxiliar de Suprimentos',
       funcao = 'Auxiliar de Suprimentos', updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL
   AND setor_id = 11
   AND (UPPER(TRIM(COALESCE(cargo,''))) = UPPER('Auxiliar de Suprimentos')
        OR UPPER(TRIM(COALESCE(funcao,''))) IN (UPPER('Auxiliar de Suprimentos'),UPPER('Auxiliar de Suprimentos II')));

-- Tripulação is canonicalized to exactly Comandante or Copiloto.
UPDATE funcionarios
   SET cargo = 'Copiloto', funcao = 'Copiloto', updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL AND setor_id = 10
   AND UPPER(REPLACE(REPLACE(TRIM(COALESCE(cargo,'')),'º',''),'°','')) IN ('1 OFICIAL','1O OFICIAL','PRIMEIRO OFICIAL');
UPDATE funcionarios
   SET cargo = 'Copiloto', funcao = 'Copiloto', updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL AND setor_id = 10
   AND UPPER(TRIM(COALESCE(funcao,''))) = UPPER('Copiloto');
UPDATE funcionarios
   SET cargo = 'Comandante', funcao = 'Comandante', updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL AND setor_id = 10
   AND UPPER(TRIM(COALESCE(funcao,''))) = UPPER('Comandante');

-- Remove synthetic QA employee fixtures from active operational scope, preserving history.
UPDATE funcionarios
   SET ativo = 0, status = 'INATIVO', deleted_at = datetime('now'), updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL
   AND UPPER(TRIM(COALESCE(cargo,''))) = UPPER('QA Fictício');

-- Populate normalized function IDs from the canonical catalog while preserving legacy text compatibility.
UPDATE funcionarios
   SET funcao_id = (
     SELECT fn.id FROM funcoes fn
      WHERE fn.empresa_id = funcionarios.empresa_id
        AND fn.deleted_at IS NULL AND COALESCE(fn.ativo,1)=1
        AND UPPER(TRIM(fn.nome)) = UPPER(TRIM(COALESCE(NULLIF(funcionarios.funcao,''),NULLIF(funcionarios.cargo,''))))
      ORDER BY fn.id LIMIT 1
   )
 WHERE empresa_id = 6 AND deleted_at IS NULL;

UPDATE funcionarios
   SET funcao = (SELECT fn.nome FROM funcoes fn WHERE fn.id = funcionarios.funcao_id),
       setor = COALESCE((SELECT s.nome FROM setores s WHERE s.id = funcionarios.setor_id AND s.empresa_id = funcionarios.empresa_id AND s.deleted_at IS NULL), setor),
       updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL AND funcao_id IS NOT NULL;

-- Retire merged source sectors only after all live references are moved.
UPDATE setores
   SET ativo = 0, deleted_at = datetime('now'), updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL AND id IN (15,21);

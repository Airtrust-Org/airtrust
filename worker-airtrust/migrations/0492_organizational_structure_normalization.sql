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
INSERT OR IGNORE INTO setores_aliases(empresa_id,alias,setor_id)
  SELECT 6,'CTM',id FROM setores
   WHERE empresa_id=6 AND deleted_at IS NULL AND COALESCE(ativo,1)=1
     AND (UPPER(TRIM(codigo))='MAN' OR UPPER(TRIM(nome))=UPPER('Manutenção'))
   ORDER BY id LIMIT 1;
INSERT OR IGNORE INTO setores_aliases(empresa_id,alias,setor_id)
  SELECT 6,'Qualidade',id FROM setores
   WHERE empresa_id=6 AND deleted_at IS NULL AND COALESCE(ativo,1)=1
     AND (UPPER(TRIM(codigo))='QSMS' OR UPPER(TRIM(nome))='QSMS')
   ORDER BY id LIMIT 1;
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

-- Canonical Setor -> Cargo/Função map is resolved by tenant-local sector identity, never by environment-specific IDs.
WITH mapping(setor_codigo,setor_nome,funcao_nome) AS (VALUES
  ('ADM','Administrativo','Auxiliar de Serviços Gerais'),('ADM','Administrativo','Coordenador de Base'),
  ('ADM','Administrativo','Gerente de Bases'),('ADM','Administrativo','Vigia'),
  ('COMERCIAL','Comercial','Consultor Comercial'),('COMERCIAL','Comercial','Gerente Comercial'),
  ('COMPRAS','Compras','Analista de Compras'),('COMPRAS','Compras','Coordenador de Compras e Logística'),
  ('CONTROLADORIA','Controladoria','Analista Financeiro'),('CONTROLADORIA','Controladoria','Auxiliar Financeiro'),
  ('JURIDICO','Jurídico','Advogado'),
  ('LOGISTICA','Logística','Auxiliar de Suprimentos'),
  ('MAN','Manutenção','Analista de CTM I'),('MAN','Manutenção','Analista de Suprimentos II'),
  ('MAN','Manutenção','Auxiliar de CTM I'),('MAN','Manutenção','Auxiliar de Manutenção'),
  ('MAN','Manutenção','Auxiliar de Serviços Gerais'),('MAN','Manutenção','Coordenador de Engenharia'),
  ('MAN','Manutenção','Mecânico'),
  ('OPERACOES_CS','Operações','Agente de Atendimento'),('OPERACOES_CS','Operações','Agente de Rampa'),
  ('OPERACOES_CS','Operações','Assistente de Operações'),('OPERACOES_CS','Operações','Auxiliar de Coordenação de Voo'),
  ('OPERACOES_CS','Operações','Coordenador de Voo'),('OPERACOES_CS','Operações','Gerente de Operações'),
  ('OPERACOES_CS','Operações','Motorista'),
  ('QSMS','QSMS','Auxiliar de QSMS'),('QSMS','QSMS','Técnico de Segurança do Trabalho'),
  ('RH_CS','Recursos Humanos','Assistente Administrativo e de RH'),
  ('SEGURANCA','Segurança Operacional','Assistente de Segurança Operacional'),
  ('TRI','Tripulação','Comandante'),('TRI','Tripulação','Copiloto')
)
INSERT OR IGNORE INTO setores_funcoes(empresa_id,setor_id,funcao_id)
SELECT 6,s.id,f.id
  FROM mapping m
  JOIN setores s ON s.empresa_id=6 AND s.deleted_at IS NULL AND COALESCE(s.ativo,1)=1
                AND (UPPER(TRIM(s.codigo))=UPPER(TRIM(m.setor_codigo))
                     OR UPPER(TRIM(s.nome))=UPPER(TRIM(m.setor_nome)))
  JOIN funcoes f ON f.empresa_id=6 AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1
                AND UPPER(TRIM(f.nome))=UPPER(TRIM(m.funcao_nome));

-- Merge qualification visibility: CTM -> Manutenção and Qualidade -> QSMS.
WITH sector_merge(source_id,target_id) AS (
  SELECT src.id,tgt.id FROM setores src JOIN setores tgt ON tgt.empresa_id=src.empresa_id
   WHERE src.empresa_id=6 AND src.deleted_at IS NULL AND COALESCE(src.ativo,1)=1
     AND tgt.deleted_at IS NULL AND COALESCE(tgt.ativo,1)=1
     AND ((UPPER(TRIM(src.codigo))='CTM' AND (UPPER(TRIM(tgt.codigo))='MAN' OR UPPER(TRIM(tgt.nome))=UPPER('Manutenção')))
       OR (UPPER(TRIM(src.codigo))='QUA' AND (UPPER(TRIM(tgt.codigo))='QSMS' OR UPPER(TRIM(tgt.nome))='QSMS')))
)
UPDATE qualificacoes_tipos_setores
   SET deleted_at = datetime('now'), updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL
   AND setor_id IN (SELECT source_id FROM sector_merge)
   AND EXISTS (
     SELECT 1 FROM sector_merge sm
     JOIN qualificacoes_tipos_setores target
       ON target.empresa_id=6 AND target.deleted_at IS NULL
      AND target.tipo_id=qualificacoes_tipos_setores.tipo_id
      AND target.setor_id=sm.target_id
      AND target.id<>qualificacoes_tipos_setores.id
     WHERE sm.source_id=qualificacoes_tipos_setores.setor_id
   );
WITH sector_merge(source_id,target_id) AS (
  SELECT src.id,tgt.id FROM setores src JOIN setores tgt ON tgt.empresa_id=src.empresa_id
   WHERE src.empresa_id=6 AND src.deleted_at IS NULL AND COALESCE(src.ativo,1)=1
     AND tgt.deleted_at IS NULL AND COALESCE(tgt.ativo,1)=1
     AND ((UPPER(TRIM(src.codigo))='CTM' AND (UPPER(TRIM(tgt.codigo))='MAN' OR UPPER(TRIM(tgt.nome))=UPPER('Manutenção')))
       OR (UPPER(TRIM(src.codigo))='QUA' AND (UPPER(TRIM(tgt.codigo))='QSMS' OR UPPER(TRIM(tgt.nome))='QSMS')))
)
UPDATE qualificacoes_tipos_setores
   SET setor_id = (SELECT target_id FROM sector_merge WHERE source_id=qualificacoes_tipos_setores.setor_id),
       updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL
   AND setor_id IN (SELECT source_id FROM sector_merge);

-- Merge LMS catalog visibility with duplicate protection.
WITH sector_merge(source_id,target_id) AS (
  SELECT src.id,tgt.id FROM setores src JOIN setores tgt ON tgt.empresa_id=src.empresa_id
   WHERE src.empresa_id=6 AND src.deleted_at IS NULL AND COALESCE(src.ativo,1)=1
     AND tgt.deleted_at IS NULL AND COALESCE(tgt.ativo,1)=1
     AND ((UPPER(TRIM(src.codigo))='CTM' AND (UPPER(TRIM(tgt.codigo))='MAN' OR UPPER(TRIM(tgt.nome))=UPPER('Manutenção')))
       OR (UPPER(TRIM(src.codigo))='QUA' AND (UPPER(TRIM(tgt.codigo))='QSMS' OR UPPER(TRIM(tgt.nome))='QSMS')))
)
UPDATE lms_cursos_setores
   SET deleted_at = datetime('now'), updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL
   AND setor_id IN (SELECT source_id FROM sector_merge)
   AND EXISTS (
     SELECT 1 FROM sector_merge sm
     JOIN lms_cursos_setores target
       ON target.empresa_id=6 AND target.deleted_at IS NULL
      AND target.curso_id=lms_cursos_setores.curso_id
      AND target.setor_id=sm.target_id
      AND target.id<>lms_cursos_setores.id
     WHERE sm.source_id=lms_cursos_setores.setor_id
   );
WITH sector_merge(source_id,target_id) AS (
  SELECT src.id,tgt.id FROM setores src JOIN setores tgt ON tgt.empresa_id=src.empresa_id
   WHERE src.empresa_id=6 AND src.deleted_at IS NULL AND COALESCE(src.ativo,1)=1
     AND tgt.deleted_at IS NULL AND COALESCE(tgt.ativo,1)=1
     AND ((UPPER(TRIM(src.codigo))='CTM' AND (UPPER(TRIM(tgt.codigo))='MAN' OR UPPER(TRIM(tgt.nome))=UPPER('Manutenção')))
       OR (UPPER(TRIM(src.codigo))='QUA' AND (UPPER(TRIM(tgt.codigo))='QSMS' OR UPPER(TRIM(tgt.nome))='QSMS')))
)
UPDATE lms_cursos_setores
   SET setor_id = (SELECT target_id FROM sector_merge WHERE source_id=lms_cursos_setores.setor_id),
       updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL
   AND setor_id IN (SELECT source_id FROM sector_merge);

-- Merge manager assignments without duplicating the same manager/user on the target sector.
WITH sector_merge(source_id,target_id) AS (
  SELECT src.id,tgt.id FROM setores src JOIN setores tgt ON tgt.empresa_id=src.empresa_id
   WHERE src.empresa_id=6 AND src.deleted_at IS NULL AND COALESCE(src.ativo,1)=1
     AND tgt.deleted_at IS NULL AND COALESCE(tgt.ativo,1)=1
     AND ((UPPER(TRIM(src.codigo))='CTM' AND (UPPER(TRIM(tgt.codigo))='MAN' OR UPPER(TRIM(tgt.nome))=UPPER('Manutenção')))
       OR (UPPER(TRIM(src.codigo))='QUA' AND (UPPER(TRIM(tgt.codigo))='QSMS' OR UPPER(TRIM(tgt.nome))='QSMS')))
)
UPDATE setores_gestores
   SET deleted_at = datetime('now'), ativo = 0, updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL
   AND setor_id IN (SELECT source_id FROM sector_merge)
   AND EXISTS (
     SELECT 1 FROM sector_merge sm
     JOIN setores_gestores target
       ON target.empresa_id=6 AND target.deleted_at IS NULL
      AND target.setor_id=sm.target_id AND target.id<>setores_gestores.id
      AND ((setores_gestores.usuario_id IS NOT NULL AND target.usuario_id=setores_gestores.usuario_id)
        OR (setores_gestores.usuario_id IS NULL AND target.usuario_id IS NULL
            AND setores_gestores.gestor_id IS NOT NULL AND target.gestor_id=setores_gestores.gestor_id))
     WHERE sm.source_id=setores_gestores.setor_id
   );
WITH sector_merge(source_id,target_id) AS (
  SELECT src.id,tgt.id FROM setores src JOIN setores tgt ON tgt.empresa_id=src.empresa_id
   WHERE src.empresa_id=6 AND src.deleted_at IS NULL AND COALESCE(src.ativo,1)=1
     AND tgt.deleted_at IS NULL AND COALESCE(tgt.ativo,1)=1
     AND ((UPPER(TRIM(src.codigo))='CTM' AND (UPPER(TRIM(tgt.codigo))='MAN' OR UPPER(TRIM(tgt.nome))=UPPER('Manutenção')))
       OR (UPPER(TRIM(src.codigo))='QUA' AND (UPPER(TRIM(tgt.codigo))='QSMS' OR UPPER(TRIM(tgt.nome))='QSMS')))
)
UPDATE setores_gestores
   SET setor_id = (SELECT target_id FROM sector_merge WHERE source_id=setores_gestores.setor_id),
       updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL
   AND setor_id IN (SELECT source_id FROM sector_merge);

-- Merge canonical compliance rules with duplicate protection.
WITH sector_merge(source_id,target_id) AS (
  SELECT src.id,tgt.id FROM setores src JOIN setores tgt ON tgt.empresa_id=src.empresa_id
   WHERE src.empresa_id=6 AND src.deleted_at IS NULL AND COALESCE(src.ativo,1)=1
     AND tgt.deleted_at IS NULL AND COALESCE(tgt.ativo,1)=1
     AND ((UPPER(TRIM(src.codigo))='CTM' AND (UPPER(TRIM(tgt.codigo))='MAN' OR UPPER(TRIM(tgt.nome))=UPPER('Manutenção')))
       OR (UPPER(TRIM(src.codigo))='QUA' AND (UPPER(TRIM(tgt.codigo))='QSMS' OR UPPER(TRIM(tgt.nome))='QSMS')))
)
UPDATE treinamento_requisitos
   SET deleted_at = datetime('now'), ativo = 0, updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL AND ativo = 1
   AND setor_id IN (SELECT source_id FROM sector_merge)
   AND EXISTS (
     SELECT 1 FROM sector_merge sm
     JOIN treinamento_requisitos target
       ON target.empresa_id=6 AND target.deleted_at IS NULL AND target.ativo=1
      AND target.qualificacao_tipo_id=treinamento_requisitos.qualificacao_tipo_id
      AND target.escopo=treinamento_requisitos.escopo
      AND COALESCE(target.funcao_id,0)=COALESCE(treinamento_requisitos.funcao_id,0)
      AND COALESCE(target.funcionario_id,0)=COALESCE(treinamento_requisitos.funcionario_id,0)
      AND target.setor_id=sm.target_id AND target.id<>treinamento_requisitos.id
     WHERE sm.source_id=treinamento_requisitos.setor_id
   );
WITH sector_merge(source_id,target_id) AS (
  SELECT src.id,tgt.id FROM setores src JOIN setores tgt ON tgt.empresa_id=src.empresa_id
   WHERE src.empresa_id=6 AND src.deleted_at IS NULL AND COALESCE(src.ativo,1)=1
     AND tgt.deleted_at IS NULL AND COALESCE(tgt.ativo,1)=1
     AND ((UPPER(TRIM(src.codigo))='CTM' AND (UPPER(TRIM(tgt.codigo))='MAN' OR UPPER(TRIM(tgt.nome))=UPPER('Manutenção')))
       OR (UPPER(TRIM(src.codigo))='QUA' AND (UPPER(TRIM(tgt.codigo))='QSMS' OR UPPER(TRIM(tgt.nome))='QSMS')))
)
UPDATE treinamento_requisitos
   SET setor_id = (SELECT target_id FROM sector_merge WHERE source_id=treinamento_requisitos.setor_id),
       updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL
   AND setor_id IN (SELECT source_id FROM sector_merge);

-- Merge employees and keep legacy sector text aligned.
WITH sector_merge(source_id,target_id,target_name) AS (
  SELECT src.id,tgt.id,tgt.nome FROM setores src JOIN setores tgt ON tgt.empresa_id=src.empresa_id
   WHERE src.empresa_id=6 AND src.deleted_at IS NULL AND COALESCE(src.ativo,1)=1
     AND tgt.deleted_at IS NULL AND COALESCE(tgt.ativo,1)=1
     AND ((UPPER(TRIM(src.codigo))='CTM' AND (UPPER(TRIM(tgt.codigo))='MAN' OR UPPER(TRIM(tgt.nome))=UPPER('Manutenção')))
       OR (UPPER(TRIM(src.codigo))='QUA' AND (UPPER(TRIM(tgt.codigo))='QSMS' OR UPPER(TRIM(tgt.nome))='QSMS')))
)
UPDATE funcionarios
   SET setor_id = (SELECT target_id FROM sector_merge WHERE source_id=funcionarios.setor_id),
       setor = (SELECT target_name FROM sector_merge WHERE source_id=funcionarios.setor_id),
       updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL
   AND setor_id IN (SELECT source_id FROM sector_merge);

-- User-approved role corrections.
UPDATE funcionarios
   SET funcao = 'Coordenador de Engenharia', updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL
   AND UPPER(TRIM(COALESCE(funcao,''))) = UPPER('Coord de Engenharia');

UPDATE funcionarios
   SET setor_id = (
         SELECT id FROM setores WHERE empresa_id=6 AND deleted_at IS NULL AND COALESCE(ativo,1)=1
           AND (UPPER(TRIM(codigo))='LOGISTICA' OR UPPER(TRIM(nome))=UPPER('Logística'))
         ORDER BY id LIMIT 1
       ),
       setor = 'Logística', cargo = 'Auxiliar de Suprimentos',
       funcao = 'Auxiliar de Suprimentos', updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL
   AND setor_id IN (
     SELECT id FROM setores WHERE empresa_id=6 AND deleted_at IS NULL AND COALESCE(ativo,1)=1
       AND (UPPER(TRIM(codigo))='MAN' OR UPPER(TRIM(nome))=UPPER('Manutenção'))
   )
   AND EXISTS (
     SELECT 1 FROM setores WHERE empresa_id=6 AND deleted_at IS NULL AND COALESCE(ativo,1)=1
       AND (UPPER(TRIM(codigo))='LOGISTICA' OR UPPER(TRIM(nome))=UPPER('Logística'))
   )
   AND (UPPER(TRIM(COALESCE(cargo,''))) = UPPER('Auxiliar de Suprimentos')
        OR UPPER(TRIM(COALESCE(funcao,''))) IN (UPPER('Auxiliar de Suprimentos'),UPPER('Auxiliar de Suprimentos II')));

-- Tripulação is canonicalized to exactly Comandante or Copiloto.
UPDATE funcionarios
   SET cargo = 'Copiloto', funcao = 'Copiloto', updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL
   AND setor_id IN (
     SELECT id FROM setores WHERE empresa_id=6 AND deleted_at IS NULL AND COALESCE(ativo,1)=1
       AND (UPPER(TRIM(codigo))='TRI' OR UPPER(TRIM(nome))=UPPER('Tripulação'))
   )
   AND UPPER(REPLACE(REPLACE(TRIM(COALESCE(cargo,'')),'º',''),'°','')) IN ('1 OFICIAL','1O OFICIAL','PRIMEIRO OFICIAL');
UPDATE funcionarios
   SET cargo = 'Copiloto', funcao = 'Copiloto', updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL
   AND setor_id IN (
     SELECT id FROM setores WHERE empresa_id=6 AND deleted_at IS NULL AND COALESCE(ativo,1)=1
       AND (UPPER(TRIM(codigo))='TRI' OR UPPER(TRIM(nome))=UPPER('Tripulação'))
   )
   AND UPPER(TRIM(COALESCE(funcao,''))) = UPPER('Copiloto');
UPDATE funcionarios
   SET cargo = 'Comandante', funcao = 'Comandante', updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL
   AND setor_id IN (
     SELECT id FROM setores WHERE empresa_id=6 AND deleted_at IS NULL AND COALESCE(ativo,1)=1
       AND (UPPER(TRIM(codigo))='TRI' OR UPPER(TRIM(nome))=UPPER('Tripulação'))
   )
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

-- Retire merged source sectors only after all live references are moved and a target exists.
WITH sector_merge(source_id,target_id) AS (
  SELECT src.id,tgt.id FROM setores src JOIN setores tgt ON tgt.empresa_id=src.empresa_id
   WHERE src.empresa_id=6 AND src.deleted_at IS NULL AND COALESCE(src.ativo,1)=1
     AND tgt.deleted_at IS NULL AND COALESCE(tgt.ativo,1)=1
     AND ((UPPER(TRIM(src.codigo))='CTM' AND (UPPER(TRIM(tgt.codigo))='MAN' OR UPPER(TRIM(tgt.nome))=UPPER('Manutenção')))
       OR (UPPER(TRIM(src.codigo))='QUA' AND (UPPER(TRIM(tgt.codigo))='QSMS' OR UPPER(TRIM(tgt.nome))='QSMS')))
)
UPDATE setores
   SET ativo = 0, deleted_at = datetime('now'), updated_at = datetime('now')
 WHERE empresa_id = 6 AND deleted_at IS NULL
   AND id IN (SELECT source_id FROM sector_merge);

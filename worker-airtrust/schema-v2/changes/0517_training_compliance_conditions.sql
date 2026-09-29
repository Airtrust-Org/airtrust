-- 0517_training_compliance_conditions.sql
-- Adds auditable applicability conditions/designations to Training Compliance.
-- Historical training remains evidence only; current obligation is resolved exclusively from active requirements.
-- source_reference: regulatory audit approved by the user on 2026-09-28 (ANAC RBAC/IS, MTE NRs, Costa do Sol controlled programs).
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-conditions-0517.md

CREATE TABLE IF NOT EXISTS compliance_condicoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('EXPOSICAO_RISCO','ATIVIDADE','DESIGNACAO','CERTIFICACAO','OUTRO')),
  descricao TEXT,
  referencia_normativa TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_condicoes_codigo_active
  ON compliance_condicoes(empresa_id, codigo COLLATE NOCASE)
  WHERE ativo=1 AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_compliance_condicoes_empresa_tipo
  ON compliance_condicoes(empresa_id, tipo, nome)
  WHERE ativo=1 AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS funcionarios_compliance_condicoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  condicao_id INTEGER NOT NULL,
  data_inicio TEXT,
  data_fim TEXT,
  origem TEXT NOT NULL DEFAULT 'EMPRESA',
  referencia_normativa TEXT,
  justificativa TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (condicao_id) REFERENCES compliance_condicoes(id),
  CHECK (data_fim IS NULL OR data_inicio IS NULL OR date(data_fim) >= date(data_inicio))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_func_compliance_condicao_active
  ON funcionarios_compliance_condicoes(empresa_id, funcionario_id, condicao_id)
  WHERE ativo=1 AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_func_compliance_condicoes_lookup
  ON funcionarios_compliance_condicoes(empresa_id, funcionario_id, condicao_id, data_inicio, data_fim)
  WHERE ativo=1 AND deleted_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_func_compliance_condicoes_tenant_insert
BEFORE INSERT ON funcionarios_compliance_condicoes
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM funcionarios f WHERE f.id=NEW.funcionario_id AND f.empresa_id=NEW.empresa_id AND f.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'funcionarios_compliance_condicoes: funcionario fora do tenant') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM compliance_condicoes c WHERE c.id=NEW.condicao_id AND c.empresa_id=NEW.empresa_id AND c.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'funcionarios_compliance_condicoes: condicao fora do tenant') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_func_compliance_condicoes_tenant_update
BEFORE UPDATE OF empresa_id, funcionario_id, condicao_id ON funcionarios_compliance_condicoes
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM funcionarios f WHERE f.id=NEW.funcionario_id AND f.empresa_id=NEW.empresa_id AND f.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'funcionarios_compliance_condicoes: funcionario fora do tenant') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM compliance_condicoes c WHERE c.id=NEW.condicao_id AND c.empresa_id=NEW.empresa_id AND c.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'funcionarios_compliance_condicoes: condicao fora do tenant') END;
END;

ALTER TABLE treinamento_requisitos ADD COLUMN condicao_id INTEGER REFERENCES compliance_condicoes(id);
ALTER TABLE treinamento_requisitos ADD COLUMN justificativa TEXT;
ALTER TABLE treinamento_requisitos ADD COLUMN perfil_competencia TEXT;
ALTER TABLE treinamento_requisitos ADD COLUMN modalidade_requerida TEXT
  CHECK (modalidade_requerida IS NULL OR modalidade_requerida IN ('EAD','PRESENCIAL','PRATICO','HIBRIDO','DOCUMENTAL','OUTRA'));
ALTER TABLE treinamento_requisitos ADD COLUMN fundamento_tipo TEXT;
ALTER TABLE treinamento_requisitos ADD COLUMN fundamento_documento TEXT;
ALTER TABLE treinamento_requisitos ADD COLUMN fundamento_item TEXT;
ALTER TABLE treinamento_requisitos ADD COLUMN validade_fonte TEXT NOT NULL DEFAULT 'EVIDENCIA'
  CHECK (validade_fonte IN ('MODELO','EVIDENCIA'));

DROP INDEX IF EXISTS idx_treinamento_requisitos_unique_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_treinamento_requisitos_unique_active
  ON treinamento_requisitos (
    empresa_id, qualificacao_tipo_id, escopo,
    COALESCE(setor_id,0), COALESCE(funcao_id,0), COALESCE(funcionario_id,0),
    COALESCE(UPPER(TRIM(aeronave_modelo)),''), COALESCE(condicao_id,0),
    COALESCE(UPPER(TRIM(perfil_competencia)),'')
  )
  WHERE ativo=1 AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_treinamento_requisitos_condicao
  ON treinamento_requisitos(empresa_id, condicao_id, qualificacao_tipo_id)
  WHERE ativo=1 AND deleted_at IS NULL AND condicao_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_treinamento_requisitos_condicao_tenant_insert
BEFORE INSERT ON treinamento_requisitos
FOR EACH ROW WHEN NEW.condicao_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM compliance_condicoes c WHERE c.id=NEW.condicao_id AND c.empresa_id=NEW.empresa_id AND c.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'treinamento_requisitos: condicao fora do tenant') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_treinamento_requisitos_condicao_tenant_update
BEFORE UPDATE OF empresa_id, condicao_id ON treinamento_requisitos
FOR EACH ROW WHEN NEW.condicao_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM compliance_condicoes c WHERE c.id=NEW.condicao_id AND c.empresa_id=NEW.empresa_id AND c.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'treinamento_requisitos: condicao fora do tenant') END;
END;

-- Initial condition catalog for Costa do Sol. Assignments are deliberately NOT inferred here.
INSERT OR IGNORE INTO compliance_condicoes(empresa_id,codigo,nome,tipo,descricao,referencia_normativa)
SELECT id,'TRABALHO_ALTURA_AUTORIZADO','Trabalho em altura autorizado','EXPOSICAO_RISCO','Pessoa autorizada a executar atividade abrangida pela NR-35','NR-35' FROM empresas WHERE id=6
UNION ALL SELECT id,'OPERADOR_EQUIP_MOVIMENTACAO','Operador de equipamento de movimentação','ATIVIDADE','Opera equipamento de transporte/movimentação abrangido pela NR-11','NR-11' FROM empresas WHERE id=6
UNION ALL SELECT id,'USO_EPI_REQUER_TREINAMENTO','Uso de EPI que requer treinamento','EXPOSICAO_RISCO','Atividade exige EPI e treinamento/informação específicos','NR-06; PGR/LAPR' FROM empresas WHERE id=6
UNION ALL SELECT id,'MANUSEIA_PRODUTO_QUIMICO','Manuseia produto químico','EXPOSICAO_RISCO','Utiliza, manuseia ou armazena produto químico abrangido pela NR-26','NR-26; PGR/LAPR' FROM empresas WHERE id=6
UNION ALL SELECT id,'NR20_AREA_SEM_CONTATO','NR-20 — acesso sem contato direto','EXPOSICAO_RISCO','Entra em área abrangida pela NR-20 sem contato direto com o processo','NR-20' FROM empresas WHERE id=6
UNION ALL SELECT id,'NR20_CONTATO_DIRETO','NR-20 — contato direto com processo','EXPOSICAO_RISCO','Executa atividade com contato direto em instalação abrangida pela NR-20','NR-20' FROM empresas WHERE id=6
UNION ALL SELECT id,'ARSO','Empregado ARSO','DESIGNACAO','Exerce Atividade de Risco à Segurança Operacional','RBAC 120; PRG-SSO-005' FROM empresas WHERE id=6
UNION ALL SELECT id,'SUPERVISOR_ARSO','Supervisor ARSO','DESIGNACAO','Supervisor formal de empregado(s) ARSO','RBAC 120; PRG-SSO-005' FROM empresas WHERE id=6
UNION ALL SELECT id,'MEMBRO_CIPA','Membro da CIPA / representante NR-05','DESIGNACAO','Titular, suplente ou representante formalmente designado','NR-05' FROM empresas WHERE id=6
UNION ALL SELECT id,'BRIGADISTA','Brigadista','DESIGNACAO','Integrante formal da brigada de emergência/incêndio','NR-23; legislação estadual/local; PAE/PAEL' FROM empresas WHERE id=6
UNION ALL SELECT id,'SOCORRISTA_DESIGNADO','Socorrista designado','DESIGNACAO','Pessoa formalmente designada para primeiros socorros','PGR/PCMSO/PAE aplicáveis' FROM empresas WHERE id=6
UNION ALL SELECT id,'GATEKEEPER','Gatekeeper FDM','DESIGNACAO','Gatekeeper formalmente designado no Programa FDM','MNL-SSO-002' FROM empresas WHERE id=6
UNION ALL SELECT id,'FDM_EQUIPE','Equipe/Comitê FDM','DESIGNACAO','Pessoa com função formal no Programa/Comitê FDM','MNL-SSO-002' FROM empresas WHERE id=6
UNION ALL SELECT id,'LOSA_OBSERVADOR','Observador/equipe LOSA','DESIGNACAO','Pessoa designada para observação/análise LOSA','Programa LOSA; PRG-SGI-005' FROM empresas WHERE id=6
UNION ALL SELECT id,'INSTRUTOR_DESIGNADO','Instrutor designado','DESIGNACAO','Pessoa formalmente designada como instrutor','PTO/PTM aplicável' FROM empresas WHERE id=6
UNION ALL SELECT id,'EXAMINADOR_DESIGNADO','Examinador designado','DESIGNACAO','Pessoa formalmente designada/credenciada como examinador','PTO/RBAC aplicável' FROM empresas WHERE id=6
UNION ALL SELECT id,'OPERADOR_MAQUINA_NR12','Operador de máquina/equipamento NR-12','ATIVIDADE','Opera máquina ou equipamento abrangido pela NR-12 e requer capacitação específica','NR-12; PGR/LAPR' FROM empresas WHERE id=6
UNION ALL SELECT id,'PTAP_RAMPA_DG_DESIGNADO','Agente de rampa DG designado','DESIGNACAO','Agente de rampa formalmente designado para tarefas adicionais de artigos perigosos previstas no PTAP','PRG-OPS-003 Rev.05; RBAC 175; IS 175-007F' FROM empresas WHERE id=6
UNION ALL SELECT id,'AUDITOR_INTERNO_DESIGNADO','Auditor interno designado','DESIGNACAO','Pessoa designada para auditoria interna','ISO 9001/14001/45001; programa interno' FROM empresas WHERE id=6
UNION ALL SELECT id,'AUDITOR_COMPORTAMENTAL_DESIGNADO','Auditor comportamental designado','DESIGNACAO','Pessoa designada para auditoria comportamental','PRC-SGI-017' FROM empresas WHERE id=6
UNION ALL SELECT id,'EXPOSICAO_AIRSIDE','Atuação operacional em airside','ATIVIDADE','Atividade vigente em área operacional/airside que exige treinamento associado ao risco operacional','FORM-SGI-037; procedimento operacional aplicável' FROM empresas WHERE id=6
UNION ALL SELECT id,'AVSEC_ATENDIMENTO_PASSAGEIRO','Atividade AVSEC de atendimento ao passageiro','CERTIFICACAO','Executa controles AVSEC relacionados ao atendimento/despacho de passageiros','PRG-SSO-006; RBAC 110' FROM empresas WHERE id=6
UNION ALL SELECT id,'AVSEC_OPERACOES_SOLO','Atividade AVSEC de operações de solo','CERTIFICACAO','Executa controles AVSEC de solo no âmbito do operador aéreo','PRG-SSO-006; RBAC 110' FROM empresas WHERE id=6
UNION ALL SELECT id,'AVSEC_CARGA_AEREA','Atividade AVSEC de carga aérea','CERTIFICACAO','Executa controles AVSEC relacionados à carga aérea','PRG-SSO-006; RBAC 110' FROM empresas WHERE id=6;

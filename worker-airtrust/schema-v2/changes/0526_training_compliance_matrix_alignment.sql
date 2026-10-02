-- 0526_training_compliance_matrix_alignment.sql
-- Forward-only alignment of Costa do Sol Training Compliance with the reviewed corporate matrix
-- and Training Manager decisions dated 2026-10-02.
-- source_reference: FORM-SGI-037 Rev.03; MGSO Rev.18; PRC-SSO-001 Rev.22; controlled maintenance matrix;
--                    reviewed Petrobras/IOGP client criterion informed by Training Management.
-- operational_decision: when the controlled corporate matrix is broader than the regulatory minimum,
--                       keep the broader audience; use individual designations only for specific roles/programs.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-matrix-alignment-0526.md

-- SGSO: corporate familiarization/recurrent cycle is 36 months (8 h initial / 4 h recurrent).
UPDATE qualificacoes_tipos
   SET validade=36,
       carga_horaria_inicial=8,
       carga_horaria_recorrente=4,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(codigo)='D2' AND deleted_at IS NULL;

-- PRE: annual cycle.
UPDATE qualificacoes_tipos
   SET validade=12,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(codigo)='PRE' AND deleted_at IS NULL;

-- LOFT remains a separate current qualification/control for flight crew.
UPDATE qualificacoes_tipos
   SET ativo=1,
       validade=COALESCE(validade,12),
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND deleted_at IS NULL;

UPDATE qualificacoes_tipos
   SET ativo=1,
       deleted_at=NULL,
       validade=COALESCE(validade,12),
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND deleted_at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM qualificacoes_tipos q2
      WHERE q2.empresa_id=6 AND UPPER(q2.codigo)='LOFT' AND q2.deleted_at IS NULL
   );

UPDATE treinamento_requisitos
   SET ativo=0, deleted_at=COALESCE(deleted_at,datetime('now')), updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND qualificacao_tipo_id=(
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND ativo=1 AND deleted_at IS NULL LIMIT 1
   )
   AND condicao_id IS NULL
   AND escopo IN ('EMPRESA','SETOR','FUNCAO','SETOR_FUNCAO')
   AND NOT (
     escopo='FUNCAO' AND funcao_id IN (
       SELECT id FROM funcoes
        WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
          AND UPPER(TRIM(nome)) IN ('COMANDANTE','COPILOTO')
     )
   );

INSERT OR IGNORE INTO treinamento_requisitos (
  empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,
  origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,
  validade_fonte,auto_matricular_ead,ativo,observacoes,created_at,updated_at
)
SELECT 6,qt.id,'FUNCAO',f.id,'OBRIGATORIA',1,
       'PTO','PTO vigente Costa do Sol; decisão da Gerência de Treinamento 2026-10-02',
       'LOFT permanece como controle separado aplicável à tripulação técnica.',
       'PROGRAMA_APROVADO','PTO vigente Costa do Sol',
       'MODELO',0,1,'Alinhamento governado 0526: LOFT mantido separadamente.',
       datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt
  JOIN funcoes f ON f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
   AND UPPER(TRIM(f.nome)) IN ('COMANDANTE','COPILOTO')
 WHERE qt.empresa_id=6 AND UPPER(qt.codigo)='LOFT' AND qt.ativo=1 AND qt.deleted_at IS NULL;

-- Maintenance controlled training: 24 months is treated as a Petrobras/IOGP client criterion,
-- not as an internal-policy interval. The predicate is intentionally bounded to the reviewed list.
UPDATE qualificacoes_tipos
   SET validade=24,
       observacoes=CASE
         WHEN LOWER(COALESCE(observacoes,'')) LIKE '%petrobras/iogp%' THEN observacoes
         ELSE TRIM(COALESCE(observacoes,'') ||
              CASE WHEN NULLIF(TRIM(COALESCE(observacoes,'')),'') IS NULL THEN '' ELSE ' ' END ||
              'Validade de 24 meses conforme critério contratual Petrobras/IOGP informado pela Gerência de Treinamento em 2026-10-02.')
       END,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND deleted_at IS NULL
   AND (
     UPPER(codigo) IN ('MNT_AW139','MNT_S76AC')
     OR (
       UPPER(COALESCE(categoria,'')) IN ('MANUTENCAO','MANUTENÇÃO','OUTROS')
       AND UPPER(TRIM(nome)) IN (
         'PROCEDIMENTO INTEGRACAO','PROCEDIMENTO INTEGRAÇÃO',
         'INTEGRACAO / DOUTRINACAO DE MANUTENCAO','INTEGRAÇÃO / DOUTRINAÇÃO DE MANUTENÇÃO',
         'MOM','MCQ','MGM','IRM','INSPECAO & IIO & APRS','INSPEÇÃO & IIO & APRS',
         'AS350 B2','S76 A/C','AW139','ARRIEL 2','ARRIEL 2 MODULACAO/DESMODULACAO',
         'ARRIEL 2 MODULAÇÃO/DESMODULAÇÃO','ARRIEL 1','PW PT6C-67C','PT6C-67C',
         'HUMS','HUMS-VXP','FATORES HUMANOS','SGSO','SGSO PARA MANUTENCAO',
         'SGSO PARA MANUTENÇÃO','CRM','ARTIGOS PERIGOSOS','MEL',
         'PROFICIENCIA LINGUA INGLESA','PROFICIÊNCIA LÍNGUA INGLESA',
         'PROFICIENCIA EM LINGUA INGLESA','PROFICIÊNCIA EM LÍNGUA INGLESA'
       )
     )
   );

UPDATE treinamento_requisitos
   SET origem='CLIENTE',
       referencia_normativa='Critério contratual Petrobras/IOGP informado pela Gerência de Treinamento em 2026-10-02',
       justificativa='Treinamento controlado de Manutenção com validade de 24 meses por critério contratual Petrobras/IOGP.',
       fundamento_tipo='CONTRATUAL_CLIENTE',
       fundamento_documento='Critério contratual Petrobras/IOGP — decisão gerencial registrada em 2026-10-02',
       validade_fonte='MODELO',
       updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND qualificacao_tipo_id IN (
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND deleted_at IS NULL
        AND (
          UPPER(codigo) IN ('MNT_AW139','MNT_S76AC')
          OR (
            UPPER(COALESCE(categoria,'')) IN ('MANUTENCAO','MANUTENÇÃO','OUTROS')
            AND UPPER(TRIM(nome)) IN (
              'PROCEDIMENTO INTEGRACAO','PROCEDIMENTO INTEGRAÇÃO',
              'INTEGRACAO / DOUTRINACAO DE MANUTENCAO','INTEGRAÇÃO / DOUTRINAÇÃO DE MANUTENÇÃO',
              'MOM','MCQ','MGM','IRM','INSPECAO & IIO & APRS','INSPEÇÃO & IIO & APRS',
              'AS350 B2','S76 A/C','AW139','ARRIEL 2','ARRIEL 2 MODULACAO/DESMODULACAO',
              'ARRIEL 2 MODULAÇÃO/DESMODULAÇÃO','ARRIEL 1','PW PT6C-67C','PT6C-67C',
              'HUMS','HUMS-VXP','FATORES HUMANOS','SGSO','SGSO PARA MANUTENCAO',
              'SGSO PARA MANUTENÇÃO','CRM','ARTIGOS PERIGOSOS','MEL',
              'PROFICIENCIA LINGUA INGLESA','PROFICIÊNCIA LÍNGUA INGLESA',
              'PROFICIENCIA EM LINGUA INGLESA','PROFICIÊNCIA EM LÍNGUA INGLESA'
            )
          )
        )
   )
   AND obrigatoriedade<>'NAO_APLICA';

-- Stable broad audiences from the controlled matrix. No individual designation is required.
UPDATE qualificacoes_tipos
   SET validade=24, carga_horaria_inicial=16, carga_horaria_recorrente=4, updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(codigo)='NR-20' AND deleted_at IS NULL;

UPDATE qualificacoes_tipos
   SET validade=24, carga_horaria_inicial=8, categoria='Presencial', updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(codigo)='NR-35' AND deleted_at IS NULL;

-- Replace only unconditioned organizational rules for the four reviewed NRs.
-- Target function rules are preserved on a re-run so the active rule set is stable.
UPDATE treinamento_requisitos
   SET ativo=0,deleted_at=COALESCE(deleted_at,datetime('now')),updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND qualificacao_tipo_id IN (
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND UPPER(codigo) IN ('NR-11','NR-20','NR-26','NR-35') AND deleted_at IS NULL
   )
   AND condicao_id IS NULL
   AND escopo IN ('EMPRESA','SETOR','FUNCAO','SETOR_FUNCAO')
   AND NOT (
     escopo='FUNCAO' AND (
       (qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='NR-11' AND deleted_at IS NULL LIMIT 1)
         AND funcao_id IN (SELECT id FROM funcoes WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND UPPER(TRIM(nome)) IN ('MECÂNICO','MECANICO','AUX MANUTENÇÃO','AUX MANUTENCAO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO')))
       OR
       (qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='NR-20' AND deleted_at IS NULL LIMIT 1)
         AND funcao_id IN (SELECT id FROM funcoes WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND UPPER(TRIM(nome)) IN ('MECÂNICO','MECANICO','AUX MANUTENÇÃO','AUX MANUTENCAO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO','AUX SUPRIMENTOS','AUXILIAR DE SUPRIMENTOS','SUPERVISOR SUPRIMENTOS','SUPERVISOR DE SUPRIMENTOS')))
       OR
       (qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='NR-35' AND deleted_at IS NULL LIMIT 1)
         AND funcao_id IN (SELECT id FROM funcoes WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND UPPER(TRIM(nome)) IN ('MECÂNICO','MECANICO','AUX MANUTENÇÃO','AUX MANUTENCAO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO')))
     )
   );

-- NR-11: every Mechanic and Maintenance Assistant may operate the covered equipment.
INSERT OR IGNORE INTO treinamento_requisitos (
  empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,
  origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,
  validade_fonte,auto_matricular_ead,ativo,created_at,updated_at
)
SELECT 6,qt.id,'FUNCAO',f.id,'OBRIGATORIA',1,'REGULATORIO',
       'NR-11; FORM-SGI-037 Rev.03; decisão gerencial 2026-10-02',
       'Todos os Mecânicos e Auxiliares de Manutenção estão incluídos no treinamento de operação de equipamentos.',
       'REGULATORIO_DIRETO','NR-11; FORM-SGI-037 Rev.03','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt
  JOIN funcoes f ON f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
   AND UPPER(TRIM(f.nome)) IN ('MECÂNICO','MECANICO','AUX MANUTENÇÃO','AUX MANUTENCAO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO')
 WHERE qt.empresa_id=6 AND UPPER(qt.codigo)='NR-11' AND qt.ativo=1 AND qt.deleted_at IS NULL;

-- NR-20: conservative Intermediate trail for maintenance/inspection in the helicopter hangar.
INSERT OR IGNORE INTO treinamento_requisitos (
  empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,
  origem,referencia_normativa,justificativa,modalidade_requerida,fundamento_tipo,fundamento_documento,
  validade_fonte,auto_matricular_ead,ativo,observacoes,created_at,updated_at
)
SELECT 6,qt.id,'FUNCAO',f.id,'OBRIGATORIA',1,'REGULATORIO',
       'NR-20; FORM-SGI-037 Rev.03; Licença de Operação INEA IN001890',
       'Trilha NR-20 Intermediário adotada para a população da matriz exposta a inflamáveis, combustíveis e óleos no hangar.',
       'HIBRIDO','REGULATORIO_DIRETO','NR-20; FORM-SGI-037 Rev.03; LO INEA IN001890',
       'MODELO',0,1,
       'Inicial 16 h e atualização 4 h/24 meses; a conclusão deve manter evidência da parte prática aplicável.',
       datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt
  JOIN funcoes f ON f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
   AND UPPER(TRIM(f.nome)) IN (
     'MECÂNICO','MECANICO','AUX MANUTENÇÃO','AUX MANUTENCAO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO',
     'AUX SUPRIMENTOS','AUXILIAR DE SUPRIMENTOS','SUPERVISOR SUPRIMENTOS','SUPERVISOR DE SUPRIMENTOS'
   )
 WHERE qt.empresa_id=6 AND UPPER(qt.codigo)='NR-20' AND qt.ativo=1 AND qt.deleted_at IS NULL;

-- NR-26/FDS: the company deliberately keeps an audience broader than the regulatory minimum.
-- Do not impose a fabricated fixed expiry here; the current qualification model keeps its reviewed validity metadata.
INSERT OR IGNORE INTO treinamento_requisitos (
  empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,
  origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,
  validade_fonte,auto_matricular_ead,ativo,created_at,updated_at
)
SELECT 6,qt.id,'FUNCAO',f.id,'OBRIGATORIA',0,'EMPRESA',
       'NR-26; FORM-SGI-037 Rev.03; decisão gerencial 2026-10-02',
       'A Costa do Sol mantém o treinamento de produtos químicos/FDS para o pessoal operacional por critério corporativo mais abrangente.',
       'POLITICA_INTERNA','FORM-SGI-037 Rev.03; decisão gerencial 2026-10-02',
       'MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt
  JOIN funcoes f ON f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
   AND UPPER(TRIM(f.nome)) IN (
     'AGENTE ATENDIMENTO','AGENTE DE ATENDIMENTO','AGENTE RAMPA','AGENTE DE RAMPA',
     'ANALISTA CTM','ANALISTA DE CTM','ASSISTENTE OPERAÇÕES','ASSISTENTE DE OPERAÇÕES',
     'ASSISTENTE SEGURANÇA OPERACIONAL','ASSISTENTE DE SEGURANÇA OPERACIONAL',
     'AUX CTM','AUXILIAR DE CTM','AUX COORDENAÇÃO VOO','AUXILIAR DE COORDENAÇÃO DE VOO',
     'AUX MANUTENÇÃO','AUX MANUTENCAO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO',
     'AUX QSMS','AUXILIAR DE QSMS','AUX SUPRIMENTOS','AUXILIAR DE SUPRIMENTOS',
     'COMANDANTE','COPILOTO','COORDENADOR BASE','COORDENADOR DE BASE','COORDENADOR ENGENHARIA','COORDENADOR DE ENGENHARIA',
     'COORDENADOR VOO','COORDENADOR DE VOO','GERENTE BASES','GERENTE DE BASES',
     'GERENTE MANUTENÇÃO','GERENTE MANUTENCAO','GERENTE DE MANUTENÇÃO','GERENTE DE MANUTENCAO',
     'GERENTE OPERAÇÕES','GERENTE OPERACOES','GERENTE DE OPERAÇÕES','GERENTE DE OPERACOES',
     'GERENTE QSMS','GERENTE DE QSMS','GERENTE SEGURANÇA OPERACIONAL','GERENTE SEGURANCA OPERACIONAL',
     'GERENTE DE SEGURANÇA OPERACIONAL','GERENTE DE SEGURANCA OPERACIONAL',
     'MECÂNICO','MECANICO','MOTORISTA','SUPERVISOR ENGENHARIA','SUPERVISOR DE ENGENHARIA',
     'SUPERVISOR SUPRIMENTOS','SUPERVISOR DE SUPRIMENTOS','TST','TÉCNICO DE SEGURANÇA DO TRABALHO','TECNICO DE SEGURANCA DO TRABALHO'
   )
 WHERE qt.empresa_id=6 AND UPPER(qt.codigo)='NR-26' AND qt.ativo=1 AND qt.deleted_at IS NULL;

-- NR-35: broad matrix population remains Mechanic + Maintenance Assistant; training is presencial.
INSERT OR IGNORE INTO treinamento_requisitos (
  empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,
  origem,referencia_normativa,justificativa,modalidade_requerida,fundamento_tipo,fundamento_documento,
  validade_fonte,auto_matricular_ead,ativo,created_at,updated_at
)
SELECT 6,qt.id,'FUNCAO',f.id,'OBRIGATORIA',1,'REGULATORIO',
       'NR-35; FORM-SGI-037 Rev.03; decisão gerencial 2026-10-02',
       'A matriz corporativa mantém NR-35 para todos os Mecânicos e Auxiliares de Manutenção.',
       'PRESENCIAL','REGULATORIO_DIRETO','NR-35; FORM-SGI-037 Rev.03',
       'MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt
  JOIN funcoes f ON f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
   AND UPPER(TRIM(f.nome)) IN ('MECÂNICO','MECANICO','AUX MANUTENÇÃO','AUX MANUTENCAO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO')
 WHERE qt.empresa_id=6 AND UPPER(qt.codigo)='NR-35' AND qt.ativo=1 AND qt.deleted_at IS NULL;

-- AVSEC awareness remains company-wide because every employee must be able to access the airport base.
UPDATE qualificacoes_tipos
   SET ativo=1,
       nome='AVSEC — Conscientização Corporativa',
       descricao='Conscientização AVSEC corporativa para funcionários que precisam acessar a base da Costa do Sol em ambiente aeroportuário.',
       observacoes='Obrigação corporativa mantida porque todos os funcionários precisam poder acessar a base aeroportuária; certificações AVSEC específicas permanecem adicionais.',
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(codigo)='AVSEC_CONSC' AND deleted_at IS NULL;

UPDATE treinamento_requisitos
   SET origem='EMPRESA',
       referencia_normativa='Requisito operacional de acesso à base aeroportuária Costa do Sol; requisitos AVSEC aplicáveis',
       justificativa='Todos os funcionários precisam poder acessar a base localizada dentro do ambiente aeroportuário.',
       fundamento_tipo='POLITICA_INTERNA',
       fundamento_documento='Decisão da Gerência de Treinamento 2026-10-02; matriz corporativa de Compliance',
       validade_fonte='MODELO',
       auto_matricular_ead=0,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND escopo='EMPRESA' AND obrigatoriedade='OBRIGATORIA'
   AND qualificacao_tipo_id=(
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND UPPER(codigo)='AVSEC_CONSC' AND ativo=1 AND deleted_at IS NULL LIMIT 1
   );

-- Seed only genuinely specific designations needed for the next manager-return step.
INSERT OR IGNORE INTO compliance_condicoes(empresa_id,codigo,nome,tipo,descricao,referencia_normativa)
SELECT id,'FDM_ADMIN','Administrador FDM','DESIGNACAO','Administrador formal do Programa FDM','MNL-SSO-002 Rev.09' FROM empresas WHERE id=6;
INSERT OR IGNORE INTO compliance_condicoes(empresa_id,codigo,nome,tipo,descricao,referencia_normativa)
SELECT id,'FDM_COMITE','Membro do Comitê FDM','DESIGNACAO','Integrante formal do Comitê FDM','MNL-SSO-002 Rev.09' FROM empresas WHERE id=6;
INSERT OR IGNORE INTO compliance_condicoes(empresa_id,codigo,nome,tipo,descricao,referencia_normativa)
SELECT id,'LOSA_ANALISTA','Analista LOSA','DESIGNACAO','Pessoa formalmente designada para análise LOSA','PRC-SSO-012 Rev.07' FROM empresas WHERE id=6;
INSERT OR IGNORE INTO compliance_condicoes(empresa_id,codigo,nome,tipo,descricao,referencia_normativa)
SELECT id,'EDB_LOGBOOK_USUARIO','Usuário eDB / logbook de Manutenção','DESIGNACAO','Pessoa autorizada a utilizar o eDB/logbook conforme função de Manutenção','PTM Rev.07' FROM empresas WHERE id=6;
INSERT OR IGNORE INTO compliance_condicoes(empresa_id,codigo,nome,tipo,descricao,referencia_normativa)
SELECT id,'GESTAO_MUDANCAS_PARTICIPANTE','Participante de Gestão de Mudanças','DESIGNACAO','Pessoa formalmente envolvida em processo de Gestão de Mudanças','SGSO; FORM-SGI-037' FROM empresas WHERE id=6;

-- Keep current broad FDM/PPSP rules during the transition: assignments are still incomplete.
-- Mark them explicitly so a later governed change can narrow scope only after managers return the lists.
UPDATE treinamento_requisitos
   SET observacoes=CASE
         WHEN LOWER(COALESCE(observacoes,'')) LIKE '%transição 0526%' THEN observacoes
         ELSE TRIM(COALESCE(observacoes,'') ||
              CASE WHEN NULLIF(TRIM(COALESCE(observacoes,'')),'') IS NULL THEN '' ELSE ' ' END ||
              'Transição 0526: público amplo preservado até conclusão das designações formais; não inferir designação por histórico.')
       END,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND qualificacao_tipo_id IN (
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND UPPER(codigo) IN ('FDM-EAD','PPSP') AND deleted_at IS NULL
   );

-- No writes to lms_matriculas, qualification histories, certificates or completion evidence.

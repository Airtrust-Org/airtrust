// source_reference: staging D1 0518 failures + staging 0524 preflight failure on 2026-09-30 + staging 0526 read-only preflight failure run 37087544679; production tenant 6 reference catalog comparisons
// operational_decision: preserve immutable production Schema V2 changes 0518/0524 and bootstrap only their non-PII reference prerequisites missing from reduced staging
// dry_run_required: true
// rollback_plan_required: staging D1 Time Travel recovery point captured by apply-approved-migration-with-recovery-point.sh
const CRM_0518_MIGRATION = '0518_crm_qualification_consolidation.sql';
const COMPLIANCE_0524_MIGRATION = '0524_training_compliance_requirement_sanitization.sql';
const COMPLIANCE_0526_MIGRATION = '0526_training_compliance_matrix_alignment.sql';

export function adaptStagingMigrationSql({ migrationName, migrationSql }) {
  if (typeof migrationSql !== 'string' || !migrationSql.trim()) {
    throw new Error('migrationSql vazio ou ausente');
  }
  if (migrationName === CRM_0518_MIGRATION) {
  // Staging intentionally carries a reduced non-PII reference catalog. The
  // immutable 0518 change assumes the production CRM references already exist.
  // Seed only those references atomically before 0518. No employee, history,
  // enrollment, certificate or assignment row is created by this adapter.
  const bootstrap = `-- staging-only reference prerequisites for immutable production change 0518
INSERT INTO qualificacoes_categorias (
  id,nome,codigo,descricao,cor,ativo,empresa_id,dominio_codigo,lms_integrada,created_at,updated_at
)
SELECT 13,'EAD','EAD','Categoria canônica de treinamentos EaD','#EABA0C',1,6,NULL,1,datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_categorias
   WHERE empresa_id=6 AND deleted_at IS NULL
     AND (id=13 OR UPPER(TRIM(codigo))='EAD' OR UPPER(TRIM(nome))='EAD')
);

INSERT INTO qualificacoes_categorias (
  nome,codigo,descricao,cor,ativo,empresa_id,dominio_codigo,lms_integrada,created_at,updated_at
)
SELECT 'Teórico','TERICO','Treinamentos em sala de aula e cursos teóricos','#3B82F6',1,6,'OPERACOES',0,datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_categorias
   WHERE empresa_id=6 AND deleted_at IS NULL
     AND (UPPER(TRIM(codigo))='TERICO' OR UPPER(TRIM(nome))='TEÓRICO')
);

INSERT INTO qualificacoes_formatos (
  id,nome,codigo,descricao,cor,ativo,empresa_id,created_at,updated_at
)
SELECT 1,'EAD','EAD','Treinamento a distância (EAD/e-learning). Vinculado ao LMS nativo.','#6B7280',1,6,datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_formatos
   WHERE empresa_id=6 AND deleted_at IS NULL
     AND (id=1 OR UPPER(TRIM(codigo))='EAD' OR UPPER(TRIM(nome))='EAD')
);

INSERT INTO qualificacoes_formatos (
  nome,codigo,descricao,cor,ativo,empresa_id,created_at,updated_at
)
SELECT 'Presencial','PRESENCIAL','Treinamento ou avaliação presencial em sala ou campo.','#6B7280',1,6,datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_formatos
   WHERE empresa_id=6 AND deleted_at IS NULL
     AND (UPPER(TRIM(codigo))='PRESENCIAL' OR UPPER(TRIM(nome))='PRESENCIAL')
);

INSERT INTO setores (
  codigo,nome,descricao,ativo,empresa_id,created_at,updated_at
)
SELECT 'TRI','Tripulação','Tripulantes das Aeronaves',1,6,datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM setores
   WHERE empresa_id=6 AND deleted_at IS NULL AND UPPER(TRIM(codigo))='TRI'
);

INSERT INTO qualificacoes_tipos (
  codigo,nome,descricao,categoria,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,
  validade,vencimento_fim_mes,observacoes,ativo,is_check,empresa_id,formato_id,categoria_id,
  classe_requisito,dominio_codigo,area_id,created_at,updated_at
)
SELECT
  'CRM_CORP','CRM — Corporate','Referência staging para o CRM Corporate','Teórico',
  16,16,16,24,0,'Referência não-PII criada apenas para validar 0518/0521 em staging.',
  1,0,6,NULL,
  (SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='TERICO' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
  'TREINAMENTO','CORPORATIVO',
  (SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='SEGURANCA_OPERACIONAL' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
  datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_tipos
   WHERE empresa_id=6 AND codigo='CRM_CORP' AND deleted_at IS NULL
);

INSERT INTO qualificacoes_tipos (
  codigo,nome,descricao,categoria,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,
  validade,vencimento_fim_mes,observacoes,ativo,is_check,empresa_id,formato_id,categoria_id,
  classe_requisito,dominio_codigo,area_id,created_at,updated_at
)
SELECT
  'D3','CRM — Tripulantes','Referência staging para o CRM de Tripulantes','Teórico',
  8,16,8,12,0,'Referência não-PII criada apenas para validar a exclusão do CRM Corporate em staging.',
  1,0,6,
  (SELECT id FROM qualificacoes_formatos WHERE empresa_id=6 AND codigo='PRESENCIAL' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
  (SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='TERICO' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
  'TREINAMENTO',NULL,
  (SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='OPERACOES' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
  datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_tipos
   WHERE empresa_id=6 AND codigo='D3' AND deleted_at IS NULL
);

INSERT INTO treinamento_requisitos (
  empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,
  origem,observacoes,auto_matricular_ead,ativo,created_at,updated_at
)
SELECT 6,qt.id,'EMPRESA','OBRIGATORIA',0,'EMPRESA',
       'Referência staging: regra corporativa necessária para validar as exclusões específicas do CRM.',
       0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt
 WHERE qt.empresa_id=6 AND qt.codigo='CRM_CORP' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM treinamento_requisitos tr
      WHERE tr.empresa_id=6 AND tr.qualificacao_tipo_id=qt.id
        AND tr.escopo='EMPRESA' AND tr.obrigatoriedade='OBRIGATORIA'
        AND tr.ativo=1 AND tr.deleted_at IS NULL
   );`;

  return `${bootstrap}\n\n${migrationSql}`;
  }

  if (migrationName === COMPLIANCE_0524_MIGRATION) {
    // Staging intentionally omits part of the maintenance reference catalog
    // that immutable 0524 expects to exist in production. Seed only non-PII
    // function/category/format/model references in the same atomic upload.
    const bootstrap = `-- staging-only reference prerequisites for immutable production change 0524
INSERT INTO qualificacoes_categorias (
  nome,codigo,descricao,cor,ativo,empresa_id,dominio_codigo,lms_integrada,created_at,updated_at
)
SELECT 'Treinamento de Produto','TREINAMENTO-DE-PRODUTO',
       'Treinamentos técnicos sobre aeronaves e motores específicos da frota','#EF4444',
       1,6,'MANUTENCAO',0,datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_categorias
   WHERE empresa_id=6 AND deleted_at IS NULL
     AND (UPPER(TRIM(codigo))='TREINAMENTO-DE-PRODUTO' OR UPPER(TRIM(nome))='TREINAMENTO DE PRODUTO')
);

INSERT INTO qualificacoes_formatos (
  nome,codigo,descricao,cor,ativo,empresa_id,created_at,updated_at
)
SELECT 'Não classificado','NAO_CLASSIFICADO',
       'Formato ainda não atribuído. Reclassificar conforme evidência do dado.','#6B7280',
       1,6,datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_formatos
   WHERE empresa_id=6 AND deleted_at IS NULL
     AND (UPPER(TRIM(codigo))='NAO_CLASSIFICADO' OR UPPER(TRIM(nome))='NÃO CLASSIFICADO')
);

INSERT INTO funcoes (
  codigo,nome,descricao,categoria,ativo,empresa_id,created_at,updated_at
)
SELECT 'MEC','Mecânico',NULL,'MANUTENCAO',1,6,datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM funcoes
   WHERE empresa_id=6 AND deleted_at IS NULL
     AND (UPPER(TRIM(codigo))='MEC' OR UPPER(TRIM(nome))='MECÂNICO')
);

INSERT INTO qualificacoes_tipos (
  codigo,nome,descricao,categoria,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,
  validade,vencimento_fim_mes,observacoes,ativo,is_check,empresa_id,formato_id,categoria_id,
  classe_requisito,dominio_codigo,area_id,created_at,updated_at
)
SELECT 'MNT_AW139','AW139 - Manutenção','PTM 20.6','EAD',12,40,12,24,0,'PTM 20.6',
       1,0,6,NULL,
       (SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       'TREINAMENTO','MANUTENCAO',
       (SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='MANUTENCAO' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_tipos
   WHERE empresa_id=6 AND codigo='MNT_AW139' AND deleted_at IS NULL
);

INSERT INTO qualificacoes_tipos (
  codigo,nome,descricao,categoria,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,
  validade,vencimento_fim_mes,observacoes,ativo,is_check,empresa_id,formato_id,categoria_id,
  classe_requisito,dominio_codigo,area_id,created_at,updated_at
)
SELECT 'MNT_S76AC','S-76 A/C','PTM 20.5','Treinamento de Produto',12,40,12,36,0,'PTM 20.5',
       1,0,6,
       (SELECT id FROM qualificacoes_formatos WHERE empresa_id=6 AND codigo='NAO_CLASSIFICADO' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       (SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='TREINAMENTO-DE-PRODUTO' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       'TREINAMENTO',NULL,
       (SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='MANUTENCAO' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_tipos
   WHERE empresa_id=6 AND codigo='MNT_S76AC' AND deleted_at IS NULL
);`;

    return `${bootstrap}\n\n${migrationSql}`;
  }

  if (migrationName === COMPLIANCE_0526_MIGRATION) {
    // Staging intentionally carries a reduced organizational reference catalog.
    // 0526 targets function IDs by reviewed names, so seed only the seven non-PII
    // function references needed to exercise its LOFT/NR rules. No employee,
    // history, enrollment, certificate or designation row is created.
    const bootstrap = `-- staging-only function reference prerequisites for immutable production change 0526
INSERT INTO funcoes (codigo,nome,descricao,categoria,ativo,empresa_id,created_at,updated_at)
SELECT 'CMD','Comandante',NULL,'OPERACOES',1,6,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM funcoes WHERE empresa_id=6 AND deleted_at IS NULL AND (UPPER(TRIM(codigo))='CMD' OR TRIM(nome)='Comandante'));

INSERT INTO funcoes (codigo,nome,descricao,categoria,ativo,empresa_id,created_at,updated_at)
SELECT 'COP','Copiloto',NULL,'OPERACOES',1,6,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM funcoes WHERE empresa_id=6 AND deleted_at IS NULL AND (UPPER(TRIM(codigo))='COP' OR TRIM(nome)='Copiloto'));

INSERT INTO funcoes (codigo,nome,descricao,categoria,ativo,empresa_id,created_at,updated_at)
SELECT 'MEC','Mecânico',NULL,'MANUTENCAO',1,6,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM funcoes WHERE empresa_id=6 AND deleted_at IS NULL AND (UPPER(TRIM(codigo))='MEC' OR TRIM(nome) IN ('Mecânico','Mecanico','MECÂNICO','MECANICO')));

INSERT INTO funcoes (codigo,nome,descricao,categoria,ativo,empresa_id,created_at,updated_at)
SELECT 'AUXM','Aux Manutenção',NULL,'MANUTENCAO',1,6,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM funcoes WHERE empresa_id=6 AND deleted_at IS NULL AND (UPPER(TRIM(codigo))='AUXM' OR TRIM(nome) IN ('Aux Manutenção','Aux Manutencao','Auxiliar de Manutenção','Auxiliar de Manutencao')));

INSERT INTO funcoes (codigo,nome,descricao,categoria,ativo,empresa_id,created_at,updated_at)
SELECT 'AUXS','Aux Suprimentos',NULL,'SUPRIMENTOS',1,6,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM funcoes WHERE empresa_id=6 AND deleted_at IS NULL AND (UPPER(TRIM(codigo))='AUXS' OR TRIM(nome) IN ('Aux Suprimentos','Auxiliar de Suprimentos')));

INSERT INTO funcoes (codigo,nome,descricao,categoria,ativo,empresa_id,created_at,updated_at)
SELECT 'SUPS','Supervisor Suprimentos',NULL,'SUPRIMENTOS',1,6,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM funcoes WHERE empresa_id=6 AND deleted_at IS NULL AND (UPPER(TRIM(codigo))='SUPS' OR TRIM(nome) IN ('Supervisor Suprimentos','Supervisor de Suprimentos')));

INSERT INTO funcoes (codigo,nome,descricao,categoria,ativo,empresa_id,created_at,updated_at)
SELECT 'RMP','Agente Rampa',NULL,'OPERACOES',1,6,datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM funcoes WHERE empresa_id=6 AND deleted_at IS NULL AND (UPPER(TRIM(codigo))='RMP' OR TRIM(nome) IN ('Agente Rampa','Agente de Rampa')));`;

    return `${bootstrap}

${migrationSql}`;
  }

  if (migrationName === '0537_training_catalog_source_backed_metadata.sql') {
    // The staging snapshot has LGPD_SEG_INFO but not the independent LGPD
    // canonical qualification model. Never conflate the two identities.
    // This bootstrap is staging-only, additive, tenant-scoped, without
    // employee data, LMS course/enrollment, history or certificate writes.
    // The 0537 preflight requires exactly one safe source when LGPD is missing.
    const bootstrap = `-- staging-only canonical LGPD reference for 0537
INSERT INTO qualificacoes_tipos (
  empresa_id,codigo,nome,descricao,categoria,categoria_id,area_id,
  validade,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,
  ativo,is_check,created_at,updated_at
)
SELECT 6,'LGPD','LGPD — Lei Geral de Proteção de Dados Pessoais',
       'Modelo de referência de treinamento LGPD da Costa do Sol.',
       src.categoria,src.categoria_id,src.area_id,
       24,NULL,NULL,NULL,1,0,datetime('now'),datetime('now')
  FROM qualificacoes_tipos src
 WHERE src.empresa_id=6 AND src.codigo='LGPD_SEG_INFO'
   AND src.ativo=1 AND src.deleted_at IS NULL
   AND src.categoria='EAD' AND src.categoria_id IS NOT NULL
   AND src.carga_horaria IS NULL
   AND src.carga_horaria_inicial IS NULL
   AND src.carga_horaria_recorrente IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM qualificacoes_tipos qt
      WHERE qt.empresa_id=6 AND UPPER(TRIM(qt.codigo))='LGPD'
   )
 LIMIT 1;`;
    return `${bootstrap}\n\n${migrationSql}`;
  }

  return migrationSql;
}

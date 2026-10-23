#!/usr/bin/env node

// source_reference: staging-only synthetic lifecycle fixture for Training Compliance 0491/0494.
// operational_decision: STAGING_ONLY; targets only qa_examiner_training on the canonical staging D1.
// dry_run_required: default mode never writes; --apply requires explicit staging confirmation.
// rollback_plan_required: --rollback --apply soft-deletes only artifacts identified by this run's reserved QA codes.
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ALLOWED_D1 = 'airtrust-db-staging-baseline-20260701';
const CONFIRM = 'AIRTRUST_STAGING_TRAINING_COMPLIANCE_LIFECYCLE_QA';
const TENANT = 'qa_examiner_training';
const qaAdminEmail = String(
  process.env.QA_EXAMINER_ADMIN_EMAIL || 'qa-examiner-admin@staging.airtrust.invalid',
).trim().toLowerCase();
if (!/^[a-z0-9._+-]+@staging\.airtrust\.invalid$/.test(qaAdminEmail)) {
  throw new Error('QA_ADMIN_STAGING_IDENTITY_REQUIRED');
}
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const rollback = args.includes('--rollback');
const code = (args.find((v) => v.startsWith('--code=')) || '').slice(7);
const marker = (args.find((v) => v.startsWith('--marker=')) || '').slice(9);
const db = String(process.env.STAGING_D1_NAME || ALLOWED_D1).trim();
const esc = (v) => `'${String(v).replace(/'/g, "''")}'`;

if (db !== ALLOWED_D1) throw new Error(`STAGING_D1_REJECTED:${db}`);
if (!/^QA-COMP-LIFE-[0-9]{3,32}$/.test(code)) throw new Error('QA_LIFECYCLE_CODE_INVALID');
if (!/^QA_ONLY_TRAINING_COMPLIANCE_LIFECYCLE_[0-9]{3,32}$/.test(marker))
  throw new Error('QA_LIFECYCLE_MARKER_INVALID');
if (apply && process.env.CONFIRM_STAGING_COMPLIANCE_LIFECYCLE_QA !== CONFIRM)
  throw new Error('STAGING_CONFIRMATION_MISSING');

const sectorCode = `${code}-SEC`;
const invalidSectorCode = `${code}-ALTSEC`;
const functionCode = `${code}-FUN`;
const invalidFunctionCode = `${code}-ALT`;
const employee1Code = `${code}-E1`;
const employee2Code = `${code}-E2`;
const requiredTypeCode = `${code}-REQ`;
const orphanTypeCode = `${code}-ORPH`;
const sectorName = `${code} Setor`;
const invalidSectorName = `${code} Setor alternativo`;
const functionName = `${code} Cargo`;
const invalidFunctionName = `${code} Cargo não vinculado`;
const employee1Name = `${code} Pessoa 1`;
const employee2Name = `${code} Pessoa 2`;
const requiredTypeName = `${code} Treinamento obrigatório`;
const orphanTypeName = `${code} Treinamento legado`;
const requiredCourseTitle = `${code} EAD obrigatório`;
const orphanCourseTitle = `${code} EAD legado`;
const requiredPackagePrefix = `qa/h5p/${code}/required/`;
const orphanPackagePrefix = `qa/h5p/${code}/orphan/`;
const tenantId = `(SELECT id FROM empresas WHERE codigo=${esc(TENANT)} AND deleted_at IS NULL AND COALESCE(ativo,1)=1)`;
const qaUserScope = `FROM usuarios u
  INNER JOIN usuarios_empresas ue ON ue.usuario_id=u.id AND ue.empresa_id=${tenantId}
  WHERE LOWER(TRIM(u.email))=${esc(qaAdminEmail)} AND u.deleted_at IS NULL
    AND COALESCE(u.active,1)=1
    AND LOWER(TRIM(ue.role)) IN ('admin','administrador','gestor','manager')`;
const qaUserId = `(SELECT u.id ${qaUserScope} LIMIT 1)`;
const sectorId = `(SELECT id FROM setores WHERE empresa_id=${tenantId} AND codigo=${esc(sectorCode)} AND deleted_at IS NULL LIMIT 1)`;
const invalidSectorId = `(SELECT id FROM setores WHERE empresa_id=${tenantId} AND codigo=${esc(invalidSectorCode)} AND deleted_at IS NULL LIMIT 1)`;
const functionId = `(SELECT id FROM funcoes WHERE empresa_id=${tenantId} AND codigo=${esc(functionCode)} AND deleted_at IS NULL LIMIT 1)`;
const employee1Id = `(SELECT id FROM funcionarios WHERE empresa_id=${tenantId} AND matricula=${esc(employee1Code)} AND deleted_at IS NULL LIMIT 1)`;
const employee2Id = `(SELECT id FROM funcionarios WHERE empresa_id=${tenantId} AND matricula=${esc(employee2Code)} AND deleted_at IS NULL LIMIT 1)`;
const requiredTypeId = `(SELECT id FROM qualificacoes_tipos WHERE empresa_id=${tenantId} AND codigo=${esc(requiredTypeCode)} AND deleted_at IS NULL LIMIT 1)`;
const orphanTypeId = `(SELECT id FROM qualificacoes_tipos WHERE empresa_id=${tenantId} AND codigo=${esc(orphanTypeCode)} AND deleted_at IS NULL LIMIT 1)`;
const orphanCourseId = `(SELECT id FROM lms_cursos WHERE empresa_id=${tenantId} AND titulo=${esc(orphanCourseTitle)} AND deleted_at IS NULL LIMIT 1)`;
const lmsCategoryId = `(SELECT id FROM qualificacoes_categorias WHERE empresa_id=${tenantId} AND lms_integrada=1 AND ativo=1 AND deleted_at IS NULL LIMIT 1)`;

const seedSql = `
CREATE TABLE IF NOT EXISTS _qa_compliance_lifecycle_guard(ok INTEGER NOT NULL CHECK(ok=1));
DELETE FROM _qa_compliance_lifecycle_guard;
INSERT INTO _qa_compliance_lifecycle_guard(ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM empresas WHERE codigo=${esc(TENANT)} AND deleted_at IS NULL AND COALESCE(ativo,1)=1)=1
 AND (SELECT COUNT(DISTINCT u.id) ${qaUserScope})=1
 AND NOT EXISTS (SELECT 1 FROM setores WHERE empresa_id=${tenantId} AND codigo=${esc(sectorCode)} AND deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM funcionarios WHERE empresa_id=${tenantId} AND matricula IN (${esc(employee1Code)},${esc(employee2Code)}) AND deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id=${tenantId} AND codigo IN (${esc(requiredTypeCode)},${esc(orphanTypeCode)}) AND deleted_at IS NULL)
 AND (SELECT COUNT(*) FROM qualificacoes_categorias WHERE empresa_id=${tenantId} AND lms_integrada=1 AND ativo=1 AND deleted_at IS NULL)=1
THEN 1 ELSE 0 END;
DROP TABLE _qa_compliance_lifecycle_guard;

INSERT INTO setores(codigo,nome,descricao,responsavel,ativo,empresa_id,created_at,updated_at,deleted_at)
SELECT ${esc(sectorCode)},${esc(sectorName)},${esc(marker)},'QA',1,id,datetime('now'),datetime('now'),NULL
FROM empresas WHERE id=${tenantId};
INSERT INTO setores(codigo,nome,descricao,responsavel,ativo,empresa_id,created_at,updated_at,deleted_at)
SELECT ${esc(invalidSectorCode)},${esc(invalidSectorName)},${esc(marker)},'QA',1,id,datetime('now'),datetime('now'),NULL
FROM empresas WHERE id=${tenantId};

-- Temporary manager grants: the QA login may select the scoped Gestor
-- profile, whose catalogue correctly hides sectors without a manager link.
-- Both synthetic sectors are needed for the negative unmapped-function case.
INSERT INTO setores_gestores
  (setor_id,usuario_id,gestor_id,empresa_id,role,ativo,created_at,updated_at,deleted_at)
SELECT s.id,${qaUserId},NULL,s.empresa_id,'manager',1,datetime('now'),datetime('now'),NULL
FROM setores s
WHERE s.empresa_id=${tenantId}
  AND s.codigo IN (${esc(sectorCode)},${esc(invalidSectorCode)})
  AND s.descricao=${esc(marker)} AND s.ativo=1 AND s.deleted_at IS NULL;

INSERT INTO funcoes(codigo,nome,descricao,categoria,ativo,empresa_id,created_at,updated_at,deleted_at)
SELECT ${esc(functionCode)},${esc(functionName)},${esc(marker)},'QA',1,id,datetime('now'),datetime('now'),NULL FROM empresas WHERE id=${tenantId};
INSERT INTO funcoes(codigo,nome,descricao,categoria,ativo,empresa_id,created_at,updated_at,deleted_at)
SELECT ${esc(invalidFunctionCode)},${esc(invalidFunctionName)},${esc(marker)},'QA',1,id,datetime('now'),datetime('now'),NULL FROM empresas WHERE id=${tenantId};

INSERT INTO setores_funcoes(empresa_id,setor_id,funcao_id,ativo,created_at,updated_at,deleted_at)
VALUES (${tenantId},${sectorId},${functionId},1,datetime('now'),datetime('now'),NULL);
INSERT INTO setores_funcoes(empresa_id,setor_id,funcao_id,ativo,created_at,updated_at,deleted_at)
VALUES (${tenantId},${invalidSectorId},(SELECT id FROM funcoes WHERE empresa_id=${tenantId} AND codigo=${esc(invalidFunctionCode)} AND deleted_at IS NULL LIMIT 1),1,datetime('now'),datetime('now'),NULL);

INSERT INTO funcionarios(nome,matricula,cargo,funcao,setor,setor_id,funcao_id,status,is_instrutor,is_examinador,ativo,empresa_id,observacoes,created_at,updated_at,deleted_at)
VALUES (${esc(employee1Name)},${esc(employee1Code)},${esc(functionName)},${esc(functionName)},${esc(sectorName)},${sectorId},${functionId},'ATIVO',0,0,1,${tenantId},${esc(marker)},datetime('now'),datetime('now'),NULL);
INSERT INTO funcionarios(nome,matricula,cargo,funcao,setor,setor_id,funcao_id,status,is_instrutor,is_examinador,ativo,empresa_id,observacoes,created_at,updated_at,deleted_at)
VALUES (${esc(employee2Name)},${esc(employee2Code)},${esc(functionName)},${esc(functionName)},${esc(sectorName)},${sectorId},${functionId},'ATIVO',0,0,1,${tenantId},${esc(marker)},datetime('now'),datetime('now'),NULL);

INSERT INTO qualificacoes_tipos(tipo,codigo,nome,descricao,categoria_id,categoria,carga_horaria,validade,vencimento_fim_mes,observacoes,ativo,empresa_id,created_at,updated_at,deleted_at)
SELECT 'TREINAMENTO',${esc(requiredTypeCode)},${esc(requiredTypeName)},${esc(marker)},qc.id,'EAD',1,12,0,${esc(marker)},1,qc.empresa_id,datetime('now'),datetime('now'),NULL
FROM qualificacoes_categorias qc WHERE qc.id=${lmsCategoryId} AND qc.empresa_id=${tenantId};
INSERT INTO qualificacoes_tipos(tipo,codigo,nome,descricao,categoria_id,categoria,carga_horaria,validade,vencimento_fim_mes,observacoes,ativo,empresa_id,created_at,updated_at,deleted_at)
SELECT 'TREINAMENTO',${esc(orphanTypeCode)},${esc(orphanTypeName)},${esc(marker)},qc.id,'EAD',1,12,0,${esc(marker)},1,qc.empresa_id,datetime('now'),datetime('now'),NULL
FROM qualificacoes_categorias qc WHERE qc.id=${lmsCategoryId} AND qc.empresa_id=${tenantId};

INSERT INTO lms_cursos(empresa_id,titulo,descricao,categoria,carga_horaria_minutos,qualificacao_tipo_id,gerar_qualificacao_ao_concluir,ativo,publicado,version_tag,tipo_conteudo,scorm_package_r2_prefix,observacoes,created_at,updated_at,deleted_at)
VALUES (${tenantId},${esc(requiredCourseTitle)},${esc(marker)},'EAD',60,${requiredTypeId},1,1,1,${esc(code)},'h5p',${esc(requiredPackagePrefix)},${esc(marker)},datetime('now'),datetime('now'),NULL);
INSERT INTO lms_cursos(empresa_id,titulo,descricao,categoria,carga_horaria_minutos,qualificacao_tipo_id,gerar_qualificacao_ao_concluir,ativo,publicado,version_tag,tipo_conteudo,scorm_package_r2_prefix,observacoes,created_at,updated_at,deleted_at)
VALUES (${tenantId},${esc(orphanCourseTitle)},${esc(marker)},'EAD',60,${orphanTypeId},1,1,1,${esc(code)},'h5p',${esc(orphanPackagePrefix)},${esc(marker)},datetime('now'),datetime('now'),NULL);

-- The scoped QA Gestor only sees courses linked to the permitted synthetic
-- sector. Do not relax product RBAC or grant global course visibility.
INSERT INTO lms_cursos_setores(curso_id,setor_id,empresa_id,created_at,updated_at,deleted_at)
SELECT c.id,${sectorId},c.empresa_id,datetime('now'),datetime('now'),NULL
FROM lms_cursos c
WHERE c.empresa_id=${tenantId}
  AND c.titulo IN (${esc(requiredCourseTitle)},${esc(orphanCourseTitle)})
  AND c.observacoes=${esc(marker)} AND c.deleted_at IS NULL;

-- Historical enrollment with no requirement: deliberately creates the reconciliation case.
INSERT INTO lms_matriculas(empresa_id,curso_id,funcionario_id,status,progresso_pct,tentativas,observacoes,created_at,updated_at,deleted_at)
VALUES (${tenantId},${orphanCourseId},${employee1Id},'NAO_INICIADO',0,0,${esc(marker)},datetime('now'),datetime('now'),NULL);

CREATE TABLE IF NOT EXISTS _qa_compliance_lifecycle_post(
  sector_count INTEGER NOT NULL CHECK(sector_count=2),
  function_count INTEGER NOT NULL CHECK(function_count=2),
  pair_count INTEGER NOT NULL CHECK(pair_count=1),
  manager_grants_count INTEGER NOT NULL CHECK(manager_grants_count=2),
  employee_count INTEGER NOT NULL CHECK(employee_count=2),
  type_count INTEGER NOT NULL CHECK(type_count=2),
  course_count INTEGER NOT NULL CHECK(course_count=2),
  course_sector_count INTEGER NOT NULL CHECK(course_sector_count=2),
  orphan_enrollment_count INTEGER NOT NULL CHECK(orphan_enrollment_count=1),
  rules_count INTEGER NOT NULL CHECK(rules_count=0)
);
DELETE FROM _qa_compliance_lifecycle_post;
INSERT INTO _qa_compliance_lifecycle_post
SELECT
 (SELECT COUNT(*) FROM setores WHERE empresa_id=${tenantId} AND codigo IN (${esc(sectorCode)},${esc(invalidSectorCode)}) AND deleted_at IS NULL),
 (SELECT COUNT(*) FROM funcoes WHERE empresa_id=${tenantId} AND codigo IN (${esc(functionCode)},${esc(invalidFunctionCode)}) AND deleted_at IS NULL),
 (SELECT COUNT(*) FROM setores_funcoes WHERE empresa_id=${tenantId} AND setor_id=${sectorId} AND funcao_id=${functionId} AND ativo=1 AND deleted_at IS NULL),
 (SELECT COUNT(*) FROM setores_gestores sg JOIN setores s ON s.id=sg.setor_id AND s.empresa_id=sg.empresa_id
   WHERE sg.empresa_id=${tenantId} AND sg.usuario_id=${qaUserId}
     AND s.codigo IN (${esc(sectorCode)},${esc(invalidSectorCode)})
     AND s.descricao=${esc(marker)} AND sg.ativo=1 AND sg.deleted_at IS NULL),
 (SELECT COUNT(*) FROM funcionarios WHERE empresa_id=${tenantId} AND matricula IN (${esc(employee1Code)},${esc(employee2Code)}) AND deleted_at IS NULL),
 (SELECT COUNT(*) FROM qualificacoes_tipos WHERE empresa_id=${tenantId} AND codigo IN (${esc(requiredTypeCode)},${esc(orphanTypeCode)}) AND deleted_at IS NULL),
 (SELECT COUNT(*) FROM lms_cursos WHERE empresa_id=${tenantId} AND titulo IN (${esc(requiredCourseTitle)},${esc(orphanCourseTitle)}) AND deleted_at IS NULL),
 (SELECT COUNT(*) FROM lms_cursos_setores lcs JOIN lms_cursos c ON c.id=lcs.curso_id AND c.empresa_id=lcs.empresa_id
   WHERE lcs.empresa_id=${tenantId} AND lcs.setor_id=${sectorId}
     AND c.observacoes=${esc(marker)}
     AND c.titulo IN (${esc(requiredCourseTitle)},${esc(orphanCourseTitle)})
     AND lcs.deleted_at IS NULL),
 (SELECT COUNT(*) FROM lms_matriculas WHERE empresa_id=${tenantId} AND curso_id=${orphanCourseId} AND funcionario_id=${employee1Id} AND deleted_at IS NULL),
 (SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=${tenantId} AND qualificacao_tipo_id IN (${requiredTypeId},${orphanTypeId}) AND deleted_at IS NULL);
DROP TABLE _qa_compliance_lifecycle_post;
`;

const rollbackSql = `
-- Revoke only the two per-run manager grants before retiring the synthetic sectors.
UPDATE setores_gestores
SET ativo=0,deleted_at=COALESCE(deleted_at,datetime('now')),updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND usuario_id=${qaUserId}
  AND setor_id IN (SELECT id FROM setores WHERE empresa_id=${tenantId}
    AND codigo IN (${esc(sectorCode)},${esc(invalidSectorCode)})
    AND descricao=${esc(marker)}) AND deleted_at IS NULL;

UPDATE treinamento_matricula_reconciliacoes
SET ativo=0,deleted_at=COALESCE(deleted_at,datetime('now')),updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND matricula_id IN (
  SELECT m.id FROM lms_matriculas m JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
  WHERE m.empresa_id=${tenantId} AND c.observacoes=${esc(marker)}
);
UPDATE treinamento_requisitos
SET ativo=0,deleted_at=COALESCE(deleted_at,datetime('now')),updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND qualificacao_tipo_id IN (
  SELECT id FROM qualificacoes_tipos WHERE empresa_id=${tenantId} AND codigo IN (${esc(requiredTypeCode)},${esc(orphanTypeCode)})
);
UPDATE qualificacoes_historico
SET deleted_at=COALESCE(deleted_at,datetime('now')),updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND funcionario_id IN (
  SELECT id FROM funcionarios WHERE empresa_id=${tenantId} AND matricula IN (${esc(employee1Code)},${esc(employee2Code)})
) AND qualificacao_id IN (
  SELECT id FROM qualificacoes_tipos WHERE empresa_id=${tenantId} AND codigo IN (${esc(requiredTypeCode)},${esc(orphanTypeCode)})
);
-- Schema V2 0557 archives are immutable by trigger. Retain archived xAPI
-- and lms_ciclo_evidencias in the run-scoped synthetic tenant for audit.
-- Delete only unarchived, mutable QA statements.
DELETE FROM lms_xapi_statements
WHERE archived_cycle_id IS NULL AND empresa_id=${tenantId} AND matricula_id IN (
  SELECT m.id FROM lms_matriculas m
  JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
  WHERE m.empresa_id=${tenantId} AND c.observacoes=${esc(marker)}
    AND m.funcionario_id IN (
      SELECT id FROM funcionarios WHERE empresa_id=${tenantId} AND matricula IN (${esc(employee1Code)},${esc(employee2Code)})
    )
);
-- Certificate R2 objects MUST be deleted and HEAD-verified first by
-- cleanup-qa-training-compliance-r2.mjs with dedicated staging-only credentials.
-- D1 records are only retired when the exact employee, qualification and
-- enrollment are all proven to be this run's synthetic fixture.
UPDATE pasta_virtual
SET deleted_at=COALESCE(deleted_at,datetime('now'))
WHERE empresa_id=${tenantId} AND deleted_at IS NULL AND caminho_arquivo IN (
  SELECT d.r2_key FROM documentos d
  JOIN qualificacoes_historico qh ON qh.certificado_arquivo_id=d.id
    AND qh.empresa_id=d.empresa_id AND qh.funcionario_id=d.funcionario_id
  JOIN lms_matriculas m ON m.id=qh.lms_matricula_id
    AND m.empresa_id=d.empresa_id AND m.funcionario_id=d.funcionario_id
  JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
  WHERE d.empresa_id=${tenantId} AND c.observacoes=${esc(marker)}
    AND d.funcionario_id IN (${employee1Id},${employee2Id})
    AND qh.qualificacao_id=c.qualificacao_tipo_id
);
UPDATE documentos
SET deleted_at=COALESCE(deleted_at,datetime('now')),updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND deleted_at IS NULL AND id IN (
  SELECT d.id FROM documentos d
  JOIN qualificacoes_historico qh ON qh.certificado_arquivo_id=d.id
    AND qh.empresa_id=d.empresa_id AND qh.funcionario_id=d.funcionario_id
  JOIN lms_matriculas m ON m.id=qh.lms_matricula_id
    AND m.empresa_id=d.empresa_id AND m.funcionario_id=d.funcionario_id
  JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
  WHERE d.empresa_id=${tenantId} AND c.observacoes=${esc(marker)}
    AND d.funcionario_id IN (${employee1Id},${employee2Id})
    AND qh.qualificacao_id=c.qualificacao_tipo_id
);
-- Cycle rows are soft-deleted, but immutable archived evidence and statements
-- remain attributable to their historical synthetic cycle (never hard DELETE).
UPDATE lms_matricula_ciclos
SET ciclo_atual=0,deleted_at=COALESCE(deleted_at,datetime('now')),
    updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND deleted_at IS NULL AND matricula_id IN (
  SELECT m.id FROM lms_matriculas m
  JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
  WHERE m.empresa_id=${tenantId} AND c.observacoes=${esc(marker)}
    AND m.funcionario_id IN (${employee1Id},${employee2Id})
);
UPDATE lms_matriculas
SET status='CANCELADO',deleted_at=COALESCE(deleted_at,datetime('now')),updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND curso_id IN (
  SELECT id FROM lms_cursos WHERE empresa_id=${tenantId} AND observacoes=${esc(marker)}
) AND funcionario_id IN (
  SELECT id FROM funcionarios WHERE empresa_id=${tenantId} AND matricula IN (${esc(employee1Code)},${esc(employee2Code)})
);
-- Retire exactly this run's two course-sector links before retiring courses.
UPDATE lms_cursos_setores
SET deleted_at=COALESCE(deleted_at,datetime('now')),updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND setor_id=${sectorId} AND deleted_at IS NULL
  AND curso_id IN (
    SELECT id FROM lms_cursos WHERE empresa_id=${tenantId}
      AND titulo IN (${esc(requiredCourseTitle)},${esc(orphanCourseTitle)})
      AND observacoes=${esc(marker)}
  );
UPDATE lms_cursos SET ativo=0,publicado=0,deleted_at=COALESCE(deleted_at,datetime('now')),updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND observacoes=${esc(marker)};
UPDATE funcionarios SET ativo=0,status='INATIVO',deleted_at=COALESCE(deleted_at,datetime('now')),updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND matricula IN (${esc(employee1Code)},${esc(employee2Code)});
UPDATE setores_funcoes SET ativo=0,deleted_at=COALESCE(deleted_at,datetime('now')),updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND setor_id IN (SELECT id FROM setores WHERE empresa_id=${tenantId} AND codigo IN (${esc(sectorCode)},${esc(invalidSectorCode)}))
  AND funcao_id IN (SELECT id FROM funcoes WHERE empresa_id=${tenantId} AND codigo IN (${esc(functionCode)},${esc(invalidFunctionCode)}));
UPDATE funcoes SET ativo=0,deleted_at=COALESCE(deleted_at,datetime('now')),updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND codigo IN (${esc(functionCode)},${esc(invalidFunctionCode)});
UPDATE setores SET ativo=0,deleted_at=COALESCE(deleted_at,datetime('now')),updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND codigo IN (${esc(sectorCode)},${esc(invalidSectorCode)});
UPDATE qualificacoes_tipos SET ativo=0,deleted_at=COALESCE(deleted_at,datetime('now')),updated_at=datetime('now')
WHERE empresa_id=${tenantId} AND codigo IN (${esc(requiredTypeCode)},${esc(orphanTypeCode)});
CREATE TABLE IF NOT EXISTS _qa_compliance_lifecycle_cleanup(active_count INTEGER NOT NULL CHECK(active_count=0));
DELETE FROM _qa_compliance_lifecycle_cleanup;
INSERT INTO _qa_compliance_lifecycle_cleanup(active_count)
SELECT
 (SELECT COUNT(*) FROM setores WHERE empresa_id=${tenantId} AND codigo IN (${esc(sectorCode)},${esc(invalidSectorCode)}) AND deleted_at IS NULL)
 +(SELECT COUNT(*) FROM setores_gestores sg JOIN setores s ON s.id=sg.setor_id AND s.empresa_id=sg.empresa_id
     WHERE sg.empresa_id=${tenantId} AND sg.usuario_id=${qaUserId}
       AND s.codigo IN (${esc(sectorCode)},${esc(invalidSectorCode)})
       AND s.descricao=${esc(marker)} AND sg.ativo=1 AND sg.deleted_at IS NULL)
 +(SELECT COUNT(*) FROM funcoes WHERE empresa_id=${tenantId} AND codigo IN (${esc(functionCode)},${esc(invalidFunctionCode)}) AND deleted_at IS NULL)
 +(SELECT COUNT(*) FROM funcionarios WHERE empresa_id=${tenantId} AND matricula IN (${esc(employee1Code)},${esc(employee2Code)}) AND deleted_at IS NULL)
 +(SELECT COUNT(*) FROM qualificacoes_tipos WHERE empresa_id=${tenantId} AND codigo IN (${esc(requiredTypeCode)},${esc(orphanTypeCode)}) AND deleted_at IS NULL)
 +(SELECT COUNT(*) FROM lms_cursos WHERE empresa_id=${tenantId} AND observacoes=${esc(marker)} AND deleted_at IS NULL)
 +(SELECT COUNT(*) FROM documentos d
    JOIN funcionarios f ON f.id=d.funcionario_id AND f.empresa_id=d.empresa_id
    WHERE d.empresa_id=${tenantId} AND f.matricula IN (${esc(employee1Code)},${esc(employee2Code)})
      AND d.deleted_at IS NULL)
 +(SELECT COUNT(*) FROM pasta_virtual pv
    JOIN funcionarios f ON f.id=pv.funcionario_id AND f.empresa_id=pv.empresa_id
    WHERE pv.empresa_id=${tenantId} AND f.matricula IN (${esc(employee1Code)},${esc(employee2Code)})
      AND pv.deleted_at IS NULL)
 +(SELECT COUNT(*) FROM lms_matricula_ciclos cy
    JOIN lms_matriculas m ON m.id=cy.matricula_id AND m.empresa_id=cy.empresa_id
    JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
    WHERE cy.empresa_id=${tenantId} AND c.observacoes=${esc(marker)}
      AND cy.deleted_at IS NULL)
 +(SELECT COUNT(*) FROM lms_cursos_setores lcs JOIN lms_cursos c ON c.id=lcs.curso_id AND c.empresa_id=lcs.empresa_id
     WHERE lcs.empresa_id=${tenantId} AND lcs.setor_id=${sectorId}
       AND c.observacoes=${esc(marker)} AND lcs.deleted_at IS NULL)
 +(SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=${tenantId} AND qualificacao_tipo_id IN (
    SELECT id FROM qualificacoes_tipos WHERE empresa_id=${tenantId} AND codigo IN (${esc(requiredTypeCode)},${esc(orphanTypeCode)})
  ) AND deleted_at IS NULL)
 +(SELECT COUNT(*) FROM lms_matriculas WHERE empresa_id=${tenantId} AND curso_id IN (
    SELECT id FROM lms_cursos WHERE empresa_id=${tenantId} AND observacoes=${esc(marker)}
  ) AND deleted_at IS NULL);
DROP TABLE _qa_compliance_lifecycle_cleanup;
`;

const sql = rollback ? rollbackSql : seedSql;
// Read-only test hook: only the local Node SQLite harness may render the DML.
// No remote write, no custom D1 target, no production process may use this.
if (process.env.NODE_ENV === 'test' && args.includes('--print-sql-for-qa-test')) {
  process.stdout.write(sql);
  process.exit(0);
}
if (!apply) {
  console.log(JSON.stringify({ mode: 'DRY_RUN', target: db, operation: rollback ? 'ROLLBACK' : 'SEED', code, marker }));
  process.exit(0);
}
// Keep this bounded fixture on D1's normal query path. Remote --file routes
// through Wrangler's bulk-import/reset endpoint and can fail closed with
// D1_RESET_DO before executing otherwise valid fixture SQL.
const r = spawnSync('npx', ['wrangler', 'd1', 'execute', db, '--remote', '--command', sql, '--json'], {
  cwd: join(process.cwd(), 'worker-airtrust'), encoding: 'utf8', env: process.env,
});
if (r.status !== 0) {
  process.stderr.write(r.stderr || r.stdout);
  process.exit(r.status || 1);
}
console.log(JSON.stringify({ mode: 'APPLY', target: db, operation: rollback ? 'ROLLBACK' : 'SEED', code, marker, status: 'PASS' }));

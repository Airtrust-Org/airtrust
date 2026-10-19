import { hasSchemaColumn, hasSchemaTable } from '../utils/db-schema';
import { resolveEffectiveTrainingComplianceProfile } from './training-compliance-evidence-profile';

/** One D1 transaction: policy-guarded enrollment, first cycle, evidence profile and audit. */
export async function createComplianceEnrollmentAtomic(db:D1Database, p:{
  empresaId:number; funcionarioId:number; cursoId:number; qualificacaoTipoId:number;
  regraId:number; observacoes:string;
  origin:'CARGO_COMPLIANCE'|'COMPLIANCE_RULE_SAVE'|'REQUISITO_PENDENTE_QSMS';
}):Promise<number|null> {
  if (!(await hasSchemaTable(db,'audit_logs')) || !(await hasSchemaTable(db,'lms_matricula_ciclos')))
    throw new Error('COMPLIANCE_ATOMIC_SCHEMA_MISSING');
  const hasProfile=await hasSchemaColumn(db,'lms_matriculas','perfil_competencia');
  const profile=hasProfile ? await resolveEffectiveTrainingComplianceProfile(db,{
    empresaId:p.empresaId,funcionarioId:p.funcionarioId,qualificacaoTipoId:p.qualificacaoTipoId,
  }) : null;
  // Re-check persisted policy immediately before the write. A stale preview
  // cannot authorize an inactive employee, unpublished course, opt-out or NULL modality.
  const [enrollment,cycle,audit]=await db.batch([
    db.prepare(`INSERT INTO lms_matriculas
      (empresa_id,curso_id,funcionario_id,observacoes${hasProfile?',perfil_competencia':''})
      SELECT ?,?,?,?${hasProfile?',?':''} WHERE EXISTS (
        SELECT 1 FROM funcionarios f
        JOIN lms_cursos c ON c.id=? AND c.empresa_id=f.empresa_id
          AND c.qualificacao_tipo_id=? AND c.ativo=1 AND c.publicado=1 AND c.deleted_at IS NULL
        JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id
          AND qt.ativo=1 AND qt.deleted_at IS NULL
          AND UPPER(TRIM(COALESCE(qt.categoria,''))) IN ('EAD','TREINAMENTO EAD')
        JOIN treinamento_requisitos tr ON tr.id=? AND tr.empresa_id=f.empresa_id
          AND tr.qualificacao_tipo_id=c.qualificacao_tipo_id AND tr.ativo=1 AND tr.deleted_at IS NULL
          AND tr.obrigatoriedade='OBRIGATORIA' AND tr.auto_matricular_ead=1
          AND tr.modalidade_requerida='EAD'
          AND (tr.vigencia_inicio IS NULL OR date(tr.vigencia_inicio)<=date('now'))
          AND (tr.vigencia_fim IS NULL OR date(tr.vigencia_fim)>=date('now'))
        WHERE f.id=? AND f.empresa_id=? AND f.deleted_at IS NULL
          AND UPPER(COALESCE(f.status,'ATIVO'))='ATIVO' AND COALESCE(f.ativo,1)=1
          AND (tr.escopo='EMPRESA'
            OR (tr.escopo='SETOR' AND tr.setor_id=f.setor_id)
            OR (tr.escopo='FUNCAO' AND tr.funcao_id=f.funcao_id)
            OR (tr.escopo='SETOR_FUNCAO' AND tr.setor_id=f.setor_id AND tr.funcao_id=f.funcao_id)
            OR (tr.escopo='FUNCIONARIO' AND tr.funcionario_id=f.id))
      ) AND NOT EXISTS (
        SELECT 1 FROM lms_matriculas m
         WHERE m.empresa_id=? AND m.curso_id=? AND m.funcionario_id=?
      )`).bind(p.empresaId,p.cursoId,p.funcionarioId,p.observacoes,
        ...(hasProfile?[profile]:[]),
        p.cursoId,p.qualificacaoTipoId,p.regraId,p.funcionarioId,p.empresaId,
        p.empresaId,p.cursoId,p.funcionarioId),
    db.prepare(`INSERT INTO lms_matricula_ciclos
      (empresa_id,matricula_id,curso_id,funcionario_id,numero_ciclo,origem,
       status,ciclo_atual,observacoes,data_matricula,progresso_pct,tentativas)
      SELECT m.empresa_id,m.id,m.curso_id,m.funcionario_id,1,'AUTO_RENOVACAO',
        'NAO_INICIADO',1,m.observacoes,m.data_matricula,0,0
      FROM lms_matriculas m
      WHERE changes()=1 AND m.id=last_insert_rowid()
        AND m.empresa_id=? AND m.curso_id=? AND m.funcionario_id=?`)
      .bind(p.empresaId,p.cursoId,p.funcionarioId),
    db.prepare(`INSERT INTO audit_logs
      (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at)
      SELECT NULL,'LMS_COMPLIANCE_ATOMIC_ENROLLMENT','lms_matriculas',cy.matricula_id,
        NULL,?,?,datetime('now') FROM lms_matricula_ciclos cy
      WHERE changes()=1 AND cy.id=last_insert_rowid() AND cy.empresa_id=?
        AND cy.curso_id=? AND cy.funcionario_id=?`)
      .bind(JSON.stringify({origin:p.origin,curso_id:p.cursoId,email_enviado:false}),
        p.empresaId,p.empresaId,p.cursoId,p.funcionarioId),
  ]);
  if (Number(enrollment?.meta?.changes||0)===0) return null;
  if (Number(cycle?.meta?.changes||0)!==1 || Number(audit?.meta?.changes||0)!==1)
    throw new Error('COMPLIANCE_ATOMIC_POSTCHECK_FAILED');
  const id=Number(enrollment.meta.last_row_id||0);
  if (!id) throw new Error('COMPLIANCE_ATOMIC_ID_MISSING');
  return id;
}

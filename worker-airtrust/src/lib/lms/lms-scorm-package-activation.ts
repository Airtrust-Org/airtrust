/** Atomically switch the active certified SCORM edition after SHA-bound attestation.
 * Re-check the stored validation JSON within the D1 batch: a stale preflight must
 * never demote the active package or move the course pointer.
 */
export type CertifiedScormActivation = Readonly<{
  db: D1Database;
  empresaId: number;
  cursoId: number;
  packageId: string;
  packageSha256: string;
  prefix: string;
  launchFile: string;
  originalFilename: string | null;
  actorId: number | null;
  auditId: string;
  validationJson: string | null;
  /**
   * Edition-pinned assessment policy transition. Absent = legacy activation:
   * the course-level policy and every cycle are left exactly as they were.
   * When present, the SAME D1 transaction (1) stamps the outgoing edition,
   * (2) freezes every terminal cycle of the course with the policy that was in
   * force while it ended, and (3) moves the course policy together with the
   * pointer. Freezing with the policy currently in force is always truthful, so
   * the pre-statements are safe even if the activation itself is then refused.
   */
  policy?: Readonly<{ incoming: 'SCORED' | 'FORMATIVE' }>;
}>;

export async function commitCertifiedScormActivation(input: CertifiedScormActivation): Promise<boolean> {
  const { db, empresaId, cursoId, packageId, packageSha256, prefix,
    launchFile, originalFilename, actorId, auditId, validationJson, policy } = input;
  if (!validationJson) return false;
  // The candidate must still be the exact VALIDATED, attested bytes for any
  // pre-statement to run; otherwise a stale request must change nothing.
  const candidateStillValid = `EXISTS(SELECT 1 FROM lms_scorm_package_versions v
    WHERE v.id=? AND v.empresa_id=? AND v.curso_id=? AND v.package_sha256=?
      AND v.r2_prefix=? AND v.status='VALIDATED' AND v.validation_result_json=?)`;
  const candidateArgs = [packageId, empresaId, cursoId, packageSha256, prefix, validationJson];
  const currentPolicy = `(SELECT c.scorm_assessment_policy FROM lms_cursos c
    WHERE c.id=? AND c.empresa_id=? AND c.deleted_at IS NULL)`;
  // The recoverable predecessor is whatever is ACTIVE inside this very
  // transaction, never a value remembered at upload time. Runs only for the
  // exact still-valid candidate, before the active edition is superseded.
  const recordOutgoing = db.prepare(`UPDATE lms_scorm_package_versions
    SET previous_active_package_id=(SELECT a.id FROM lms_scorm_package_versions a
      WHERE a.empresa_id=? AND a.curso_id=? AND a.status='ACTIVE')
    WHERE id=? AND empresa_id=? AND curso_id=? AND package_sha256=?
      AND r2_prefix=? AND status='VALIDATED' AND validation_result_json=?`)
    .bind(empresaId, cursoId, packageId, empresaId, cursoId, packageSha256, prefix, validationJson);
  const pre = policy ? [
    db.prepare(`UPDATE lms_scorm_package_versions SET assessment_policy=${currentPolicy}
      WHERE empresa_id=? AND curso_id=? AND status='ACTIVE' AND assessment_policy IS NULL
        AND ${candidateStillValid}`)
      .bind(cursoId, empresaId, empresaId, cursoId, ...candidateArgs),
    db.prepare(`UPDATE lms_matricula_ciclos SET assessment_policy=${currentPolicy}
      WHERE empresa_id=? AND assessment_policy IS NULL AND deleted_at IS NULL
        AND status NOT IN ('NAO_INICIADO','EM_ANDAMENTO')
        AND (curso_id=? OR matricula_id IN
          (SELECT m.id FROM lms_matriculas m WHERE m.empresa_id=? AND m.curso_id=?))
        AND ${candidateStillValid}`)
      .bind(cursoId, empresaId, empresaId, cursoId, empresaId, cursoId, ...candidateArgs),
  ] : [];
  const results = await db.batch([
    recordOutgoing,
    ...pre,
    // The candidate must still be VALIDATED with the exact attested bytes.
    // Otherwise a delayed duplicate request must not supersede the active edition.
    db.prepare(`UPDATE lms_scorm_package_versions SET status='SUPERSEDED'
      WHERE empresa_id=? AND curso_id=? AND status='ACTIVE'
      AND EXISTS(SELECT 1 FROM lms_scorm_package_versions v
        WHERE v.id=? AND v.empresa_id=? AND v.curso_id=? AND v.package_sha256=?
          AND v.r2_prefix=? AND v.status='VALIDATED' AND v.validation_result_json=?)
      AND EXISTS(SELECT 1 FROM lms_cursos c WHERE c.id=? AND c.empresa_id=?
        AND c.deleted_at IS NULL)`)
      .bind(empresaId, cursoId, packageId, empresaId, cursoId, packageSha256, prefix, validationJson, cursoId, empresaId),
    db.prepare(`UPDATE lms_scorm_package_versions
      SET status='ACTIVE', activated_at=datetime('now'), activated_by=?
      WHERE id=? AND empresa_id=? AND curso_id=? AND package_sha256=?
        AND r2_prefix=? AND status='VALIDATED' AND validation_result_json=?
        AND EXISTS(SELECT 1 FROM lms_cursos c WHERE c.id=? AND c.empresa_id=?
          AND c.deleted_at IS NULL)`)
      .bind(actorId, packageId, empresaId, cursoId,
        packageSha256, prefix, validationJson, cursoId, empresaId),
    // changes() is the candidate UPDATE row count from the preceding statement
    // on the same SQLite connection/transaction. Never move a pointer on zero writes.
    // The policy moves in the same statement as the pointer: never one without the other.
    db.prepare(`UPDATE lms_cursos SET tipo_conteudo='scorm',
      scorm_package_r2_prefix=?, scorm_launch_file=?, scorm_versao='1.2',
      scorm_assessment_policy=COALESCE(?,scorm_assessment_policy),
      conteudo_arquivo_nome=COALESCE(?,conteudo_arquivo_nome),updated_at=datetime('now')
      WHERE id=? AND empresa_id=? AND deleted_at IS NULL AND changes()=1
        AND EXISTS(SELECT 1 FROM lms_scorm_package_versions p
          WHERE p.id=? AND p.empresa_id=? AND p.curso_id=?
            AND p.package_sha256=? AND p.r2_prefix=? AND p.status='ACTIVE')`)
      .bind(prefix, launchFile, policy?.incoming ?? null, originalFilename, cursoId, empresaId,
        packageId, empresaId, cursoId, packageSha256, prefix),
    // Audit is part of the activation transaction. A failure rolls back the
    // package statuses and course pointer; a rejected retry emits no receipt.
    db.prepare(`INSERT INTO lms_scorm_package_audit_log
      (id,empresa_id,curso_id,package_id,action,actor_id,created_at)
      SELECT ?,?,?,?,'ACTIVATED',?,datetime('now')
      WHERE changes()=1
        AND EXISTS(SELECT 1 FROM lms_cursos c
          WHERE c.id=? AND c.empresa_id=? AND c.deleted_at IS NULL
            AND c.scorm_package_r2_prefix=?)`)
      .bind(auditId, empresaId, cursoId, packageId, actorId,
        cursoId, empresaId, prefix),
    // Diagnostics are an edition-scoped read model. Only a transaction that
    // inserted this exact activation receipt may invalidate them.
    db.prepare(`DELETE FROM lms_completion_diagnostics_snapshots
      WHERE empresa_id=? AND curso_id=?
        AND EXISTS(SELECT 1 FROM lms_scorm_package_audit_log a
          WHERE a.id=? AND a.empresa_id=? AND a.curso_id=?
            AND a.package_id=? AND a.action='ACTIVATED')`)
      .bind(empresaId, cursoId, auditId, empresaId, cursoId, packageId),
  ]);
  // D1 executes batch() in a single transaction, but zero-row UPDATEs are not
  // SQL errors. Neither a stale retry nor an attestation mutation is success.
  const at = pre.length + 1; // recordOutgoing + policy pre-statements
  return results[at + 1]?.meta?.changes === 1 && results[at + 2]?.meta?.changes === 1 &&
    results[at + 3]?.meta?.changes === 1;
}

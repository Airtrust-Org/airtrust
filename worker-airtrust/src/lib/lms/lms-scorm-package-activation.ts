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
}>;

export async function commitCertifiedScormActivation(input: CertifiedScormActivation): Promise<boolean> {
  const { db, empresaId, cursoId, packageId, packageSha256, prefix,
    launchFile, originalFilename, actorId, auditId, validationJson } = input;
  if (!validationJson) return false;
  const results = await db.batch([
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
      .bind(actorId, packageId, empresaId, cursoId, packageSha256, prefix, validationJson,
        cursoId, empresaId),
    // changes() is the candidate UPDATE row count from the preceding statement
    // on the same SQLite connection/transaction. Never move a pointer on zero writes.
    db.prepare(`UPDATE lms_cursos SET tipo_conteudo='scorm',
      scorm_package_r2_prefix=?, scorm_launch_file=?, scorm_versao='1.2',
      conteudo_arquivo_nome=COALESCE(?,conteudo_arquivo_nome),updated_at=datetime('now')
      WHERE id=? AND empresa_id=? AND deleted_at IS NULL AND changes()=1
        AND EXISTS(SELECT 1 FROM lms_scorm_package_versions p
          WHERE p.id=? AND p.empresa_id=? AND p.curso_id=?
            AND p.package_sha256=? AND p.r2_prefix=? AND p.status='ACTIVE')`)
      .bind(prefix, launchFile, originalFilename, cursoId, empresaId,
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
  return results[1]?.meta?.changes === 1 && results[2]?.meta?.changes === 1 &&
    results[3]?.meta?.changes === 1;
}

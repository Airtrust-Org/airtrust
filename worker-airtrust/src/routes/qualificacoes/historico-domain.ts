/**
 * Canonical read-side domain resolution for qualification history.
 *
 * Qualification history is an individual record owned by a funcionario. For
 * manager READS, the authorization boundary is therefore the funcionario's
 * actively managed setor, not the qualification's own functional domain.
 *
 * This matters for transversal qualifications (for example SGSO, English or
 * mixed-delivery EAD): a Maintenance manager must still see those records for
 * Maintenance employees. The route already enforces f.setor_id against the
 * manager's setores_gestores scope, so resolving the domain from that same
 * active setor preserves tenant/setor isolation without the previous double
 * restriction (setor AND qualification domain).
 *
 * Write/certificate authorization keeps its separate resource-domain
 * resolution and is intentionally unaffected by this read-side helper.
 * Unclassified/inactive employee setores remain fail-closed because the
 * expression returns NULL and cannot match an allowed operational domain.
 */
export function buildQualificationHistoryDomainColumn(hasTipoDominioOverride: boolean): string {
  // Keep the parameter for call-site compatibility while read authorization
  // no longer depends on qualification-type classification precedence.
  void hasTipoDominioOverride;

  return `(SELECT s.dominio_codigo
    FROM setores s
    WHERE s.id = f.setor_id
      AND s.empresa_id = f.empresa_id
      AND s.ativo = 1
      AND s.deleted_at IS NULL
    LIMIT 1)`;
}

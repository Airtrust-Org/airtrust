/**
 * Canonical read-side domain resolution for qualification history.
 *
 * Histórico de qualificação é dado individual ligado ao funcionário. Para a
 * leitura do GESTOR, o setor do funcionário já é aplicado separadamente como
 * fronteira de acesso; portanto o domínio efetivo da linha deve acompanhar o
 * setor operacional do próprio funcionário antes de considerar a classificação
 * do catálogo da qualificação.
 *
 * Isso é especialmente importante para qualificações transversais (por exemplo,
 * treinamentos usados por Manutenção e Operações): o mesmo tipo pode ter uma
 * classificação de catálogo que não representa o domínio operacional de todos
 * os funcionários que o possuem. Filtrar simultaneamente pelo setor do
 * funcionário E pelo domínio do catálogo escondia registros legítimos do gestor
 * do próprio setor.
 *
 * A classificação histórica/tipo continua como fallback para compatibilidade e
 * para contextos em que o setor do funcionário não tenha domínio resolvido.
 * Migration 0454 continua sendo feature-detected pelo chamador.
 */
export function buildQualificationHistoryDomainColumn(hasTipoDominioOverride: boolean): string {
  const catalogDomain = hasTipoDominioOverride
    ? 'COALESCE(qh_categoria_ref.dominio_codigo, qt.dominio_codigo, qt_categoria_ref.dominio_codigo)'
    : 'COALESCE(qh_categoria_ref.dominio_codigo, qt_categoria_ref.dominio_codigo)';

  return `COALESCE(
    (
      SELECT s_hist_scope.dominio_codigo
        FROM setores s_hist_scope
       WHERE s_hist_scope.id = f.setor_id
         AND s_hist_scope.empresa_id = f.empresa_id
         AND s_hist_scope.ativo = 1
         AND s_hist_scope.deleted_at IS NULL
       LIMIT 1
    ),
    ${catalogDomain}
  )`;
}

/**
 * Pós-condições atômicas para importação local de matriz PTO.
 *
 * Invocado dentro do BEGIN IMMEDIATE, ANTES do COMMIT.
 * Um CHECK violado faz o CLI sqlite3 -bail encerrar a conexão e desfazer
 * toda a transação. O verificador externo permanece como prova adicional,
 * não como primeira barreira depois de dados já persistidos.
 */
function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function buildPtoRev10AtomicPostconditions({ plan, empresaId }) {
  if (!Number.isInteger(empresaId) || empresaId <= 0 ||
      plan?.empresa_id !== empresaId ||
      !Array.isArray(plan?.models) || plan.models.length === 0 ||
      !Array.isArray(plan?.manobra_resolution)) {
    throw new Error('PTO Rev10: parâmetros do guard transacional inválidos');
  }
  const codes = plan.models.map((model) => model?.codigo);
  if (codes.some((code) => !code) || new Set(codes).size !== codes.length) {
    throw new Error('PTO Rev10: códigos de modelos duplicados/inválidos');
  }
  const version = quote(plan.versao_matriz);
  const codeList = codes.map(quote).join(',');
  const supersededIds = (plan.superseded_models || []).map((model) => model.id);
  if (supersededIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('PTO Rev10: IDs substituídos inválidos');
  }
  const remainingLegacy = supersededIds.length
    ? `NOT EXISTS (
         SELECT 1 FROM modelos_sessao
          WHERE empresa_id=${empresaId} AND id IN (${supersededIds.join(',')})
            AND ativo=1 AND deleted_at IS NULL
       )`
    : '1=1';
  const expectedModels = codes.length;
  const expectedResolution = plan.manobra_resolution.length;
  return `
CREATE TEMP TABLE __pto_rev10_atomic_check (
  ok INTEGER NOT NULL CHECK(ok=1)
);
INSERT INTO __pto_rev10_atomic_check(ok)
SELECT CASE WHEN
    (SELECT COUNT(*) FROM modelos_sessao_versionamento
      WHERE empresa_id=${empresaId} AND is_current=1
        AND codigo_canonico IN (${codeList}))=${expectedModels}
    AND (SELECT COUNT(DISTINCT codigo_canonico) FROM modelos_sessao_versionamento
      WHERE empresa_id=${empresaId} AND is_current=1
        AND codigo_canonico IN (${codeList}))=${expectedModels}
    AND NOT EXISTS (
      SELECT 1 FROM modelos_sessao_versionamento msv
      LEFT JOIN modelos_sessao_manobras msm
        ON msm.modelo_id=msv.modelo_id AND msm.deleted_at IS NULL
      WHERE msv.empresa_id=${empresaId} AND msv.is_current=1
        AND msv.codigo_canonico IN (${codeList})
      GROUP BY msv.codigo_canonico,msv.modelo_id
      HAVING COUNT(msm.id)<>18
    )
    AND (SELECT COUNT(*) FROM simuladores_matriz_manobra_resolution
      WHERE empresa_id=${empresaId} AND versao_matriz=${version})=${expectedResolution}
    AND NOT EXISTS (
      SELECT 1 FROM simuladores_matriz_manobra_resolution r
      JOIN manobras m ON m.id=r.manobra_id
      WHERE r.empresa_id=${empresaId} AND r.versao_matriz=${version}
        AND m.empresa_id<>${empresaId}
    )
    AND ${remainingLegacy}
  THEN 1 ELSE 0 END;
`;
}

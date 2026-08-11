export const SK76_PERIODIC_CODE_RENAMES = Object.freeze([
  ['S76-P-01/04-C1', 'S76-P-01/03-C1'],
  ['S76-P-01/04-C2', 'S76-P-01/03-C2'],
  ['S76-P-01/04-C3', 'S76-P-01/03-C3'],
  ['S76-P-02/04-C1', 'S76-P-02/03-C1'],
  ['S76-P-02/04-C2', 'S76-P-02/03-C2'],
  ['S76-P-02/04-C3', 'S76-P-02/03-C3'],
]);

const LEGACY_TO_CANONICAL = new Map(SK76_PERIODIC_CODE_RENAMES);
const CANONICAL_TO_LEGACY = new Map(
  SK76_PERIODIC_CODE_RENAMES.map(([legacy, canonical]) => [canonical, legacy]),
);

export function canonicalSk76PeriodicCode(code) {
  const value = String(code || '');
  return LEGACY_TO_CANONICAL.get(value) || value;
}

export function legacySk76PeriodicCode(code) {
  return CANONICAL_TO_LEGACY.get(String(code || '')) || null;
}

export function canonicalSk76ArchitectureId(value) {
  const raw = String(value || '');
  if (!raw.startsWith('SK76:')) return value;
  const code = raw.slice('SK76:'.length);
  const canonical = canonicalSk76PeriodicCode(code);
  return canonical === code ? value : `SK76:${canonical}`;
}

export function applySk76PeriodicSessionContractCorrections(contract) {
  if (!contract || !Array.isArray(contract.sessions)) return contract;
  return {
    ...contract,
    sessions: contract.sessions.map((session) => ({
      ...session,
      codigo_canonico: canonicalSk76PeriodicCode(session.codigo_canonico),
      arquitetura_id_sanitizado: canonicalSk76ArchitectureId(session.arquitetura_id_sanitizado),
    })),
  };
}

export function applySk76PeriodicMatrixCodeCorrections(matrix) {
  if (!matrix || !Array.isArray(matrix.models) || !Array.isArray(matrix.items)) return matrix;
  return {
    ...matrix,
    models: matrix.models.map((model) => ({
      ...model,
      codigo: canonicalSk76PeriodicCode(model.codigo),
    })),
    items: matrix.items.map((item) => ({
      ...item,
      modelo: canonicalSk76PeriodicCode(item.modelo),
    })),
  };
}

export function assertSk76PeriodicCodesCorrected(codes) {
  const set = new Set((codes || []).map(String));
  for (const [legacy, canonical] of SK76_PERIODIC_CODE_RENAMES) {
    if (set.has(legacy)) throw new Error(`código S-76 legado ainda ativo: ${legacy}`);
    if (!set.has(canonical)) throw new Error(`código S-76 canônico ausente: ${canonical}`);
  }
  if (!set.has('SK76-P-CHECK')) throw new Error('SK76-P-CHECK ausente');
  return true;
}

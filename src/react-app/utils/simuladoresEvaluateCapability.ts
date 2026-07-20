/**
 * hasInstructorEvaluationCapability — capability real "simuladores.evaluate"
 * (avaliar/assinar fichas de treinamento de voo como instrutor).
 *
 * Espelha exatamente `hasSimuladoresEvaluateCapability` no backend
 * (worker-airtrust/src/routes/simuladores-fichas.ts): overrides individuais
 * GRANT/DENY (mesmo array `user.permissions` vindo do JWT, ver
 * src/react-app/context/auth-context.ts) vencem primeiro; na ausência de
 * override, só o role INSTRUTOR qualifica.
 *
 * Diferença deliberada em relação a `usePermissions().can('simuladores.evaluate')`:
 * o `can()` genérico aplica o wildcard de ADMINISTRADOR/GESTOR (podem fazer
 * qualquer coisa por padrão), mas esta tela/rota não deve considerar
 * "ser admin" equivalente a "estar autorizado a avaliar fichas como
 * instrutor". Use esta função (não `can()`) sempre que a decisão precisar
 * bater com o que o backend realmente autoriza em GET /fichas/para-avaliar.
 */
export function hasInstructorEvaluationCapability(
  role: string | null | undefined,
  permissions: string[] | null | undefined,
): boolean {
  const overrides = Array.isArray(permissions) ? permissions : [];
  const denies = new Set(
    overrides.filter((o) => o.startsWith('DENY:')).map((o) => o.slice('DENY:'.length)),
  );
  const grants = new Set(
    overrides.filter((o) => o.startsWith('GRANT:')).map((o) => o.slice('GRANT:'.length)),
  );

  if (denies.has('simuladores.evaluate')) return false;
  if (grants.has('simuladores.evaluate')) return true;

  return String(role || '').toUpperCase() === 'INSTRUTOR';
}

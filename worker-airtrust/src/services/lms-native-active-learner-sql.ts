/** Active account and tenant-scoped employee, rechecked on every Native learner request. */
export const NATIVE_ACTIVE_EMPLOYEE_JOIN = [
  'JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=m.empresa_id',
  'AND f.deleted_at IS NULL AND f.ativo=1',
  "AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO'",
].join(' ');

export const NATIVE_ACTIVE_USER_CONDITION = 'AND u.active=1';

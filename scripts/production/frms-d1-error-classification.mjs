// Fixed-category diagnostics for the governed FRMS production SELECT-only inventory.
// Never emit Cloudflare's raw error text: it may contain SQL, tenant metadata,
// request data or network details. This helper does not execute any query.
export function classifyFrmsD1Error(httpStatus, payload) {
  const status = Number(httpStatus);
  const errors = Array.isArray(payload?.errors) ? payload.errors.slice(0, 4) : [];
  const messages = errors.map((e) => String(e?.message ?? '')).join(' ').slice(0, 4000);
  if (/no such table|table[^.]*does not exist/i.test(messages)) return 'D1_SCHEMA_TABLE_MISSING';
  if (/no such column|unknown column|SQLITE_ERROR[^.]*column/i.test(messages)) return 'D1_SCHEMA_COLUMN_MISSING';
  if (/syntax error|near[^.]*syntax/i.test(messages)) return 'D1_SQL_SYNTAX_REJECTED';
  if (status === 401 || status === 403 || /permission|forbidden|unauthorized|authentication/i.test(messages)) return 'D1_ACCESS_DENIED';
  if (status === 429) return 'D1_RATE_LIMITED';
  if (/busy|locked|temporarily unavailable|service unavailable|timeout/i.test(messages)) return 'D1_TEMPORARY_UNAVAILABLE';
  if (/D1_ERROR|SQLITE_ERROR/i.test(messages)) return 'D1_BACKEND_SQL_ERROR';
  const code = errors.map((e) => e?.code).find((n) => Number.isSafeInteger(n) && n >= 100 && n <= 99999);
  if (code !== undefined) return 'D1_CF_CODE_' + String(code);
  if (Number.isInteger(status) && status >= 400 && status <= 599) return 'D1_HTTP_' + String(status);
  return 'D1_READ_REJECTED';
}
export const FRMS_INVENTORY_PHASES = Object.freeze([
  'active_tenants', 'active_assignments', 'regulatory_profiles', 'config_revisions', 'config_parameter_count',
]);
export function validatedPhase(phase) {
  return FRMS_INVENTORY_PHASES.includes(phase) ? phase : 'unclassified';
}

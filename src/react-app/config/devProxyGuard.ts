const PROD_DEV_PROXY_OVERRIDE = 'AIRTRUST_ALLOW_PROD_DEV_PROXY';
const PROD_DEV_PROXY_CONFIRMATION = 'I_UNDERSTAND_THIS_POINTS_DEV_TO_PRODUCTION';

export function isProductionApiTarget(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return host === 'api.airtrust.online' || host === 'airtrust.online' || host.endsWith('.airtrust.online');
  } catch {
    return value.toLowerCase().includes('airtrust.online');
  }
}

export function assertDevProxyTargetIsSafe(
  mode: string,
  target: string,
  overrideValue = process.env[PROD_DEV_PROXY_OVERRIDE],
): void {
  if (mode !== 'development' || !isProductionApiTarget(target)) return;
  if (overrideValue === PROD_DEV_PROXY_CONFIRMATION) return;

  throw new Error(
    `[vite] Dev proxy blocked: VITE_DEV_PROXY_TARGET points to production (${target}). ` +
      `Set ${PROD_DEV_PROXY_OVERRIDE}=${PROD_DEV_PROXY_CONFIRMATION} only in an approved ops session.`,
  );
}

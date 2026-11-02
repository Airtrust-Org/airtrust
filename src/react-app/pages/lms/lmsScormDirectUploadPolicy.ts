/** Only an authenticated administrator on the production UI may start a direct ZIP replacement. Backend RBAC and tenant guards remain authoritative. */
export function allowDirectScormUpload(isAdmin: boolean, hostname: string): boolean {
  return isAdmin && hostname === 'airtrust.online';
}

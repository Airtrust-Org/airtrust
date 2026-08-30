export type AdminPermissionsLoadState = 'loading' | 'ready' | 'error';

export function resolveConfiguredAdminPermission(
  permissions: ReadonlyMap<string, boolean>,
  key: string,
): boolean {
  return permissions.get(key) ?? false;
}

export function canEditAdminPermissions(loadState: AdminPermissionsLoadState): boolean {
  return loadState === 'ready';
}

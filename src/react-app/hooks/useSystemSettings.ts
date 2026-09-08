import { useEffect, useState } from 'react';
import { AUTH_TOKEN_CHANGED_EVENT } from '@/react-app/config/api';
import { getCurrentTenantId } from '@/react-app/lib/tenant-data-layer';
import {
  applySystemSettingsToDocument,
  fetchSystemSettingsFromServer,
  getSystemLogoSrc,
  getSystemSettings,
  mapServerToLocalSettings,
  saveSystemSettings,
  SystemSettings,
} from '@/react-app/config/systemSettings';

export function useSystemSettings() {
  const [settings, setSettings] = useState<SystemSettings>(() => getSystemSettings());

  useEffect(() => {
    let mounted = true;
    let requestGeneration = 0;

    const applyCachedForTenant = (tenantId: number | null) => {
      const latest = getSystemSettings(tenantId);
      if (mounted) {
        setSettings(latest);
      }
      applySystemSettingsToDocument(latest);
    };

    const loadForCurrentTenant = () => {
      const tenantId = getCurrentTenantId();
      const generation = ++requestGeneration;
      applyCachedForTenant(tenantId);

      if (!tenantId) return;

      fetchSystemSettingsFromServer()
        .then((server) => {
          if (
            !mounted ||
            generation !== requestGeneration ||
            server.empresaId !== tenantId ||
            getCurrentTenantId() !== tenantId
          ) {
            return;
          }

          const mapped = mapServerToLocalSettings(server);
          saveSystemSettings(mapped, tenantId);
        })
        .catch(() => {
          // Tenant-scoped local cache remains the safe fallback.
        });
    };

    const handleSettingsUpdate = (event?: Event) => {
      const currentTenantId = getCurrentTenantId();
      const eventTenantId = Number(
        (event as CustomEvent<{ tenantId?: number }> | undefined)?.detail?.tenantId || 0,
      );
      if (eventTenantId > 0 && eventTenantId !== currentTenantId) return;
      applyCachedForTenant(currentTenantId);
    };

    const handleTokenChange = () => {
      loadForCurrentTenant();
    };

    loadForCurrentTenant();

    window.addEventListener(
      'airtrust:system-settings-updated',
      handleSettingsUpdate as EventListener,
    );
    window.addEventListener('storage', handleSettingsUpdate);
    window.addEventListener(AUTH_TOKEN_CHANGED_EVENT, handleTokenChange);

    return () => {
      mounted = false;
      requestGeneration += 1;
      window.removeEventListener(
        'airtrust:system-settings-updated',
        handleSettingsUpdate as EventListener,
      );
      window.removeEventListener('storage', handleSettingsUpdate);
      window.removeEventListener(AUTH_TOKEN_CHANGED_EVENT, handleTokenChange);
    };
  }, []);

  return {
    settings,
    logoSrc: getSystemLogoSrc(settings),
  };
}

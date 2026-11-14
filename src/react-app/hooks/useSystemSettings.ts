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
    let activeController: AbortController | null = null;

    const abortInFlight = () => {
      if (activeController) {
        activeController.abort();
        activeController = null;
      }
    };

    const applyCachedForTenant = (tenantId: number | null) => {
      const latest = getSystemSettings(tenantId);
      if (mounted) {
        setSettings(latest);
      }
      applySystemSettingsToDocument(latest);
    };

    const loadForCurrentTenant = () => {
      abortInFlight();
      const tenantId = getCurrentTenantId();
      const generation = ++requestGeneration;
      applyCachedForTenant(tenantId);

      if (!tenantId) return;

      const controller = new AbortController();
      activeController = controller;

      fetchSystemSettingsFromServer(controller.signal)
        .then((server) => {
          if (
            !mounted ||
            controller.signal.aborted ||
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
        })
        .finally(() => {
          if (activeController === controller) {
            activeController = null;
          }
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
    window.addEventListener('pagehide', abortInFlight);

    return () => {
      mounted = false;
      requestGeneration += 1;
      abortInFlight();
      window.removeEventListener(
        'airtrust:system-settings-updated',
        handleSettingsUpdate as EventListener,
      );
      window.removeEventListener('storage', handleSettingsUpdate);
      window.removeEventListener(AUTH_TOKEN_CHANGED_EVENT, handleTokenChange);
      window.removeEventListener('pagehide', abortInFlight);
    };
  }, []);

  return {
    settings,
    logoSrc: getSystemLogoSrc(settings),
  };
}

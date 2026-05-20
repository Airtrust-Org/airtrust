import { useEffect, useState } from 'react';
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

    const handleUpdate = () => {
      const latest = getSystemSettings();
      if (mounted) {
        setSettings(latest);
      }
      applySystemSettingsToDocument(latest);
    };

    handleUpdate();

    fetchSystemSettingsFromServer()
      .then((server) => {
        const mapped = mapServerToLocalSettings(server);
        saveSystemSettings(mapped);
      })
      .catch(() => {
        // fallback local-only
      });

    window.addEventListener('airtrust:system-settings-updated', handleUpdate as EventListener);
    window.addEventListener('storage', handleUpdate);

    return () => {
      mounted = false;
      window.removeEventListener('airtrust:system-settings-updated', handleUpdate as EventListener);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  return {
    settings,
    logoSrc: getSystemLogoSrc(settings),
  };
}

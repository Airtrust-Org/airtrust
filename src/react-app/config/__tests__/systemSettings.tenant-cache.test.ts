import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_SYSTEM_SETTINGS,
  getSystemSettings,
  saveSystemSettings,
  systemSettingsStorageKey,
} from '@/react-app/config/systemSettings';

describe('system settings tenant cache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps tenant branding and preferences isolated', () => {
    saveSystemSettings({ ...DEFAULT_SYSTEM_SETTINGS, appName: 'Tenant A' }, 11);
    saveSystemSettings({ ...DEFAULT_SYSTEM_SETTINGS, appName: 'Tenant B' }, 22);

    expect(getSystemSettings(11).appName).toBe('Tenant A');
    expect(getSystemSettings(22).appName).toBe('Tenant B');
    expect(localStorage.getItem(systemSettingsStorageKey(11))).not.toEqual(
      localStorage.getItem(systemSettingsStorageKey(22)),
    );
  });

  it('never falls back to the historical unscoped cache', () => {
    localStorage.setItem(
      'airtrust_system_settings_v1',
      JSON.stringify({ ...DEFAULT_SYSTEM_SETTINGS, appName: 'Other tenant' }),
    );

    expect(getSystemSettings(33)).toEqual(DEFAULT_SYSTEM_SETTINGS);
    expect(localStorage.getItem('airtrust_system_settings_v1')).toBeNull();
  });

  it('does not persist settings without a resolved tenant', () => {
    saveSystemSettings({ ...DEFAULT_SYSTEM_SETTINGS, appName: 'Pending' }, null);

    expect(localStorage.length).toBe(0);
    expect(getSystemSettings(null)).toEqual(DEFAULT_SYSTEM_SETTINGS);
  });
});

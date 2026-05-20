/**
 * Feature Flags System for AirTrust
 * Permite rollout progressivo de funcionalidades
 */

interface FeatureFlags {
  ENABLE_CATALOG_MANAGEMENT: boolean;
  ENABLE_ADVANCED_REPORTING: boolean;
  ENABLE_NOTIFICATION_SYSTEM: boolean;
  ENABLE_EXPORT_FUNCTIONS: boolean;
  ENABLE_BULK_OPERATIONS: boolean;
  ENABLE_AUDIT_TRAIL_UI: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  ENABLE_CATALOG_MANAGEMENT: true,
  ENABLE_ADVANCED_REPORTING: false,
  ENABLE_NOTIFICATION_SYSTEM: false,
  ENABLE_EXPORT_FUNCTIONS: true,
  ENABLE_BULK_OPERATIONS: false,
  ENABLE_AUDIT_TRAIL_UI: false,
};

class FeatureFlagsManager {
  private flags: FeatureFlags = { ...DEFAULT_FLAGS };
  private loaded = false;

  async loadFlags(): Promise<void> {
    if (this.loaded) return;

    try {
      const localOverrides = localStorage.getItem('airtrust_feature_flags');
      if (localOverrides) {
        const overrides = JSON.parse(localOverrides);
        this.flags = { ...this.flags, ...overrides };
      }

      this.loaded = true;
    } catch (error) {
      console.warn('[FeatureFlags] Failed to load, using defaults:', error);
      this.loaded = true;
    }
  }

  isEnabled(flag: keyof FeatureFlags): boolean {
    if (!this.loaded) {
      console.warn(`[FeatureFlags] Flag ${flag} checked before loading, using default`);
      return DEFAULT_FLAGS[flag];
    }
    return this.flags[flag];
  }

  enable(flag: keyof FeatureFlags, enabled: boolean = true): void {
    this.flags[flag] = enabled;
    
    try {
      const overrides = JSON.parse(localStorage.getItem('airtrust_feature_flags') || '{}');
      overrides[flag] = enabled;
      localStorage.setItem('airtrust_feature_flags', JSON.stringify(overrides));
    } catch (error) {
      console.warn('[FeatureFlags] Failed to persist override:', error);
    }
  }

  getAllFlags(): Readonly<FeatureFlags> {
    return { ...this.flags };
  }

  isEnabledForUser(flag: keyof FeatureFlags, userId?: string): boolean {
    if (!this.isEnabled(flag)) return false;
    
    if (!userId) return true;

    const hash = this.simpleHash(userId + flag);
    const percentage = hash % 100;

    const rolloutPercentage = 100;
    
    return percentage < rolloutPercentage;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

export const featureFlags = new FeatureFlagsManager();

export function useFeatureFlag(flag: keyof FeatureFlags, userId?: string): boolean {
  return featureFlags.isEnabledForUser(flag, userId);
}

export async function initializeFeatureFlags(): Promise<void> {
  await featureFlags.loadFlags();
}

export default featureFlags;

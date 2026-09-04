import type { Page } from '@playwright/test';

export const AUTH_POST_ALLOWLIST: readonly string[];
export const SAFE_METHODS: readonly string[];
export const MUTATION_METHODS: readonly string[];

export function classifyRequest(req: {
  method: string;
  url: string;
  phase?: 'pre-auth' | 'post-auth';
}): { decision: 'allow' | 'block'; reason: string };

export function installReadOnlyGuard(
  page: Page,
  opts?: { getPhase?: () => 'pre-auth' | 'post-auth' },
): {
  violations: { method: string; url: string; reason: string }[];
  assertClean(): void;
};

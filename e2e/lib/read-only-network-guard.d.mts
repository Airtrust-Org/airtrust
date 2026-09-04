import type { Page } from '@playwright/test';

export const AUTH_POST_ALLOWLIST: readonly string[];
export const SAFE_METHODS: readonly string[];
export const MUTATION_METHODS: readonly string[];
export const STAGING_HOST_ALLOWLIST: readonly string[];
export const STAGING_API_HOST_ALLOWLIST: readonly string[];
export const PRODUCTION_HOST_PATTERNS: readonly RegExp[];

export function isProductionHost(hostname: string): boolean;
export function isAllowlistedHost(hostname: string): boolean;

export function classifyRequest(req: { method: string; url: string }): {
  decision: 'allow' | 'block';
  reason: string;
};

export function installReadOnlyGuard(page: Page): {
  violations: { method: string; url: string; reason: string }[];
  readonly mutationCount: number;
  assertClean(): void;
};

import type { Page } from '@playwright/test';

export function extractBuildVersion(html: string | null | undefined): string | null;
export function normalizeShortSha(value: string): string;
export function assertLiveShaMatches(args: {
  buildVersion: string | null;
  expectedShortSha: string;
  where?: string;
}): string;
export function assertLiveFrontendShaFromPage(
  page: Page,
  expectedShortSha: string,
  where?: string,
): Promise<string>;
export function assertLiveFrontendShaFromOrigin(
  origin: string,
  expectedShortSha: string,
  fetchImpl?: typeof fetch,
): Promise<string>;

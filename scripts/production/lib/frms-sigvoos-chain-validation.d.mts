export const SEVERITY: Readonly<{ VIOLATION: 'VIOLATION'; ADVISORY: 'ADVISORY'; INFO: 'INFO' }>;
export function listDays(from: string, to: string, limit?: number): string[];
export interface ChainFinding { severity: 'VIOLATION' | 'ADVISORY' | 'INFO'; code: string; [key: string]: unknown }
export function evaluateChain(
  facts: Record<string, unknown>,
  ctx: { today: string; from: string; to: string },
): { findings: ChainFinding[]; violations: number; advisories: number };

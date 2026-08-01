export const PTO_REV10_PLAN_SCHEMA_VERSION: number;
export const PTO_REV10_PLAN_KIND: string;
export const PTO_REV10_EXPECTED_PLAN_TOTALS: Readonly<{
  models: number;
  links: number;
  notechs_links: number;
  functional_codes: number;
}>;
export function stableJson(value: unknown): string;
export function sha256(value: unknown): string;
export function sealPtoRev10Plan<T extends Record<string, any>>(
  payload: T,
): T & { plan_sha256: string };
export function assertPtoRev10Plan(plan: any): true;
export function projectionToPlanPayload(options: Record<string, any>): any;

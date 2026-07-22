export const CONTRACT_SCHEMA_VERSION: number;
export const EXPECTED_TOTALS: { modelos: number; vinculos: number; loft: number };
export const AW139_CODES: string[];
export const SK76_CODES: string[];
export function loadSessionContract(filePath: string): any;
export function validateSessionContract(contract: any): any;
export function defaultContractPath(root?: string): string;

export const EXPECTED_MANOEUVRE_CODE_COUNT: number;
export const RESOLUTION_TYPES: string[];
export function classifyManoeuvreCode(input: any): any;
export function buildManoeuvreResolutionEntries(input: any): any[];
export function validateManoeuvreResolution(entries: any[], input: any): boolean;
export function physicalManoeuvreCode(codigoCanonico: string, versaoMatriz: string): string;

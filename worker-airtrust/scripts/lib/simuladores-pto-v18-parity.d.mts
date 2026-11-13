export const PTO_V18_SHA256: string;
export function assertPtoV18CurricularParity(args: { projection: any; contract: any[]; sourceManifest: any; contractSha256: string }): Readonly<{ sessions: number; technical_links: number; notechs: number; source_sha256: string; contract_sha256: string; level: string }>;

export function assertPtoV18SessionLoad(args: {
  code: string;
  canonical: string;
  projected: string;
  projectedMinutes?: number | null;
}): Readonly<{ session_minutes: number; source_load: string }>;

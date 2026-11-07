export type StreamedZipMember = { path: string; data: Uint8Array; sha256: string; bytes: number };
export function validateZipReader(
  source: { size: number; read(offset: number, length: number): Promise<Uint8Array>; stream(offset: number, length: number): AsyncIterable<Uint8Array>; sequential?: boolean },
  expectedSha: string,
  options?: { onMember?: (member: StreamedZipMember) => Promise<void> | void },
): Promise<{ zipSha256: string; zipBytes: number; expandedBytes: number; members: number; r2ReadStats?: { rangeRequests: number; rangeBytesRead: number } }>;

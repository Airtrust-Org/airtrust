export function validateF5R2ArchiveReadOnly(params: {
  bucket: R2Bucket; key: string; expectedPrefix: string; expectedSha256: string;
  onMember?: (member: { path: string; data: Uint8Array; sha256: string; bytes: number }) => Promise<void> | void;
}): Promise<{
  zipSha256: string; zipBytes: number; expandedBytes: number; members: number;
  r2ReadStats: { rangeRequests: number; rangeBytesRead: number };
}>;

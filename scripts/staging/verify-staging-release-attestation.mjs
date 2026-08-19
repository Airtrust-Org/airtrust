import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildStagingReleaseAttestation, SCHEMA } from './build-staging-release-attestation.mjs';

export function verifyStagingReleaseAttestation(serialized, expectedHash) {
  const parsed = JSON.parse(serialized);
  if (parsed.schema_version !== SCHEMA) throw new Error('ATTESTATION_SCHEMA');
  const rebuilt = buildStagingReleaseAttestation(parsed);
  if (rebuilt.serialized !== serialized) throw new Error('ATTESTATION_NON_CANONICAL');
  const actual = createHash('sha256').update(serialized).digest('hex');
  if (expectedHash && actual !== expectedHash.trim().split(/\s+/)[0]) throw new Error('ATTESTATION_HASH_MISMATCH');
  return actual;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [path, hashPath] = process.argv.slice(2);
  if (!path) throw new Error('usage: verify-staging-release-attestation attestation.json [attestation.sha256]');
  const hash = hashPath ? readFileSync(hashPath, 'utf8') : undefined;
  process.stdout.write(`STAGING_RELEASE_ATTESTATION_VERIFIED=${verifyStagingReleaseAttestation(readFileSync(path, 'utf8'), hash)}\n`);
}

import { describe, expect, it } from 'vitest';
import {
  type BackupChecksumManifest,
  verifyBackupChecksumManifest,
} from '../../services/backup/checksum-manifest';

const CHECKED_AT = '2026-06-14T15:00:00.000Z';

function bytesFromString(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? bytesFromString(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function createLocalDrillFixture() {
  const artifacts = new Map<string, Uint8Array>([
    [
      'backups/2026/06/14/local-drill-001/CONFIGURACOES.json',
      bytesFromString(
        JSON.stringify({
          modulo: 'CONFIGURACOES',
          tabelas_principais: { configuracoes: [{ id: 1, chave: 'fixture', valor: 'local' }] },
          tabelas_relacionadas: {},
        }),
      ),
    ],
    [
      'backups/local-drill-001/r2-metadata-manifest.json',
      bytesFromString(
        JSON.stringify({
          backup_uuid: 'local-drill-001',
          total_arquivos: 1,
          objetos: [{ key: 'fixture/logo.txt', size: 9 }],
        }),
      ),
    ],
  ]);

  const manifestArtifacts = await Promise.all(
    [...artifacts.entries()].map(async ([key, bytes]) => ({
      key,
      size: bytes.byteLength,
      uploaded: '2026-06-14T10:00:00.000Z',
      etag: `etag-${key}`,
      sha256: await sha256(bytes),
    })),
  );

  const manifest: BackupChecksumManifest = {
    version: 1,
    backup_uuid: 'local-drill-001',
    algorithm: 'SHA-256',
    generated_at: '2026-06-14T12:00:00.000Z',
    scope_prefixes: ['backups/2026/06/14/local-drill-001', 'backups/local-drill-001/'],
    artifact_count: manifestArtifacts.length,
    total_bytes: manifestArtifacts.reduce((sum, artifact) => sum + artifact.size, 0),
    artifacts: manifestArtifacts,
  };

  const manifestJson = JSON.stringify(manifest);

  return {
    artifacts,
    manifest,
    manifestJson,
    manifestSha256: await sha256(manifestJson),
  };
}

describe('backup restore drill local integrity verification', () => {
  it('aprova fixture local quando manifesto e artefatos estao integros', async () => {
    const fixture = await createLocalDrillFixture();

    const report = await verifyBackupChecksumManifest({
      manifestJson: fixture.manifestJson,
      expectedManifestSha256: fixture.manifestSha256,
      checkedAt: CHECKED_AT,
      readArtifact: async (key) => fixture.artifacts.get(key) || null,
    });

    expect(report).toMatchObject({
      ok: true,
      checkedAt: CHECKED_AT,
      backupUuid: 'local-drill-001',
      manifestSha256: fixture.manifestSha256,
      expectedManifestSha256: fixture.manifestSha256,
      artifactCount: 2,
      failures: [],
    });
    expect(report.artifacts.every((artifact) => artifact.ok)).toBe(true);
  });

  it('falha quando o SHA-256 esperado do manifesto diverge', async () => {
    const fixture = await createLocalDrillFixture();

    const report = await verifyBackupChecksumManifest({
      manifestJson: fixture.manifestJson,
      expectedManifestSha256: `sha256:${'0'.repeat(64)}`,
      checkedAt: CHECKED_AT,
      readArtifact: async (key) => fixture.artifacts.get(key) || null,
    });

    expect(report.ok).toBe(false);
    expect(report.failures).toContain(
      `SHA-256 do manifesto divergente: esperado=sha256:${'0'.repeat(64)}, atual=${fixture.manifestSha256}`,
    );
  });

  it('falha quando um byte de artefato e alterado', async () => {
    const fixture = await createLocalDrillFixture();
    const corruptedArtifacts = new Map(fixture.artifacts);
    const [firstKey, firstBytes] = [...corruptedArtifacts.entries()][0];
    const corruptedBytes = new Uint8Array(firstBytes);
    corruptedBytes[0] = corruptedBytes[0] === 123 ? 124 : 123;
    corruptedArtifacts.set(firstKey, corruptedBytes);

    const report = await verifyBackupChecksumManifest({
      manifestJson: fixture.manifestJson,
      expectedManifestSha256: fixture.manifestSha256,
      checkedAt: CHECKED_AT,
      readArtifact: async (key) => corruptedArtifacts.get(key) || null,
    });

    expect(report.ok).toBe(false);
    expect(report.artifacts.find((artifact) => artifact.key === firstKey)?.failures).toEqual([
      expect.stringContaining('SHA-256 divergente'),
    ]);
  });

  it('falha quando um artefato esta ausente', async () => {
    const fixture = await createLocalDrillFixture();
    const missingKey = fixture.manifest.artifacts[0].key;
    const incompleteArtifacts = new Map(fixture.artifacts);
    incompleteArtifacts.delete(missingKey);

    const report = await verifyBackupChecksumManifest({
      manifestJson: fixture.manifestJson,
      expectedManifestSha256: fixture.manifestSha256,
      checkedAt: CHECKED_AT,
      readArtifact: async (key) => incompleteArtifacts.get(key) || null,
    });

    expect(report.ok).toBe(false);
    expect(report.artifacts.find((artifact) => artifact.key === missingKey)?.failures).toEqual([
      `Artefato ausente: ${missingKey}`,
    ]);
  });

  it('falha quando o tamanho declarado diverge dos bytes restaurados', async () => {
    const fixture = await createLocalDrillFixture();
    const tamperedManifest: BackupChecksumManifest = {
      ...fixture.manifest,
      artifacts: fixture.manifest.artifacts.map((artifact, index) =>
        index === 0 ? { ...artifact, size: artifact.size + 1 } : artifact,
      ),
      total_bytes: fixture.manifest.total_bytes + 1,
    };

    const report = await verifyBackupChecksumManifest({
      manifestJson: JSON.stringify(tamperedManifest),
      expectedManifestSha256: await sha256(JSON.stringify(tamperedManifest)),
      checkedAt: CHECKED_AT,
      readArtifact: async (key) => fixture.artifacts.get(key) || null,
    });

    expect(report.ok).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([expect.stringContaining('Tamanho divergente')]));
  });
});

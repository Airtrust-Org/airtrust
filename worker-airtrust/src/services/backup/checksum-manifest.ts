export interface BackupChecksumManifestArtifact {
  key: string;
  size: number;
  uploaded?: string;
  etag?: string;
  sha256: string;
}

export interface BackupChecksumManifest {
  version: number;
  backup_uuid: string;
  algorithm: 'SHA-256';
  generated_at: string;
  scope_prefixes: string[];
  artifact_count: number;
  total_bytes: number;
  artifacts: BackupChecksumManifestArtifact[];
}

export interface BackupRestoreDrillArtifactReport {
  key: string;
  ok: boolean;
  expectedSize: number;
  actualSize: number | null;
  expectedSha256: string;
  actualSha256: string | null;
  failures: string[];
}

export interface BackupRestoreDrillReport {
  ok: boolean;
  checkedAt: string;
  backupUuid: string | null;
  manifestSha256: string;
  expectedManifestSha256: string | null;
  artifactCount: number;
  totalBytes: number;
  failures: string[];
  artifacts: BackupRestoreDrillArtifactReport[];
}

export interface VerifyBackupChecksumManifestOptions {
  manifestJson: string;
  expectedManifestSha256?: string;
  readArtifact: (key: string) => Promise<ArrayBuffer | Uint8Array | null>;
  checkedAt?: string;
}

const SHA256_PREFIX = 'sha256:';

function normalizeSha256(value: string): string {
  return value.startsWith(SHA256_PREFIX) ? value : `${SHA256_PREFIX}${value}`;
}

function isSha256(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

function toBytes(content: string | ArrayBuffer | Uint8Array): Uint8Array {
  if (typeof content === 'string') {
    return new TextEncoder().encode(content);
  }

  if (content instanceof Uint8Array) {
    return content;
  }

  return new Uint8Array(content);
}

async function sha256Hex(content: string | ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toBytes(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseManifest(manifestJson: string, failures: string[]): BackupChecksumManifest | null {
  try {
    const parsed = JSON.parse(manifestJson) as Partial<BackupChecksumManifest>;
    if (!parsed || typeof parsed !== 'object') {
      failures.push('Manifesto nao e um objeto JSON valido');
      return null;
    }

    return parsed as BackupChecksumManifest;
  } catch (error) {
    failures.push(`Manifesto JSON invalido: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function validateManifestShape(manifest: BackupChecksumManifest, failures: string[]): void {
  if (manifest.version !== 1) {
    failures.push(`Versao de manifesto inesperada: ${String(manifest.version)}`);
  }

  if (manifest.algorithm !== 'SHA-256') {
    failures.push(`Algoritmo de manifesto inesperado: ${String(manifest.algorithm)}`);
  }

  if (!manifest.backup_uuid || typeof manifest.backup_uuid !== 'string') {
    failures.push('Manifesto sem backup_uuid valido');
  }

  if (!Array.isArray(manifest.artifacts)) {
    failures.push('Manifesto sem lista artifacts valida');
    return;
  }

  if (manifest.artifact_count !== manifest.artifacts.length) {
    failures.push(
      `artifact_count divergente: manifesto=${String(manifest.artifact_count)}, artifacts=${manifest.artifacts.length}`,
    );
  }

  const calculatedTotalBytes = manifest.artifacts.reduce((sum, artifact) => sum + Number(artifact.size || 0), 0);
  if (manifest.total_bytes !== calculatedTotalBytes) {
    failures.push(`total_bytes divergente: manifesto=${String(manifest.total_bytes)}, artifacts=${calculatedTotalBytes}`);
  }

  const seenKeys = new Set<string>();
  for (const artifact of manifest.artifacts) {
    if (!artifact.key || typeof artifact.key !== 'string') {
      failures.push('Artefato sem key valida');
      continue;
    }

    if (seenKeys.has(artifact.key)) {
      failures.push(`Artefato duplicado no manifesto: ${artifact.key}`);
    }
    seenKeys.add(artifact.key);

    if (!Number.isFinite(artifact.size) || artifact.size < 0) {
      failures.push(`Artefato com tamanho invalido no manifesto: ${artifact.key}`);
    }

    if (!isSha256(artifact.sha256)) {
      failures.push(`Artefato com SHA-256 invalido no manifesto: ${artifact.key}`);
    }
  }
}

export async function verifyBackupChecksumManifest(
  options: VerifyBackupChecksumManifestOptions,
): Promise<BackupRestoreDrillReport> {
  const failures: string[] = [];
  const artifacts: BackupRestoreDrillArtifactReport[] = [];
  const manifestSha256 = normalizeSha256(await sha256Hex(options.manifestJson));
  const expectedManifestSha256 = options.expectedManifestSha256
    ? normalizeSha256(options.expectedManifestSha256)
    : null;

  if (expectedManifestSha256 && manifestSha256 !== expectedManifestSha256) {
    failures.push(
      `SHA-256 do manifesto divergente: esperado=${expectedManifestSha256}, atual=${manifestSha256}`,
    );
  }

  const manifest = parseManifest(options.manifestJson, failures);
  if (!manifest) {
    return {
      ok: false,
      checkedAt: options.checkedAt || new Date().toISOString(),
      backupUuid: null,
      manifestSha256,
      expectedManifestSha256,
      artifactCount: 0,
      totalBytes: 0,
      failures,
      artifacts,
    };
  }

  validateManifestShape(manifest, failures);

  for (const artifact of Array.isArray(manifest.artifacts) ? manifest.artifacts : []) {
    const artifactFailures: string[] = [];
    const expectedSize = Number(artifact.size);
    let actualSize: number | null = null;
    let actualSha256: string | null = null;

    const bytes = await options.readArtifact(artifact.key);
    if (!bytes) {
      artifactFailures.push(`Artefato ausente: ${artifact.key}`);
    } else {
      const artifactBytes = toBytes(bytes);
      actualSize = artifactBytes.byteLength;
      actualSha256 = normalizeSha256(await sha256Hex(artifactBytes));

      if (actualSize !== expectedSize) {
        artifactFailures.push(
          `Tamanho divergente: esperado=${String(expectedSize)}, atual=${String(actualSize)}`,
        );
      }

      if (actualSha256 !== artifact.sha256) {
        artifactFailures.push(`SHA-256 divergente: esperado=${artifact.sha256}, atual=${actualSha256}`);
      }
    }

    artifacts.push({
      key: artifact.key,
      ok: artifactFailures.length === 0,
      expectedSize,
      actualSize,
      expectedSha256: artifact.sha256,
      actualSha256,
      failures: artifactFailures,
    });

    failures.push(...artifactFailures);
  }

  return {
    ok: failures.length === 0,
    checkedAt: options.checkedAt || new Date().toISOString(),
    backupUuid: manifest.backup_uuid || null,
    manifestSha256,
    expectedManifestSha256,
    artifactCount: artifacts.length,
    totalBytes: artifacts.reduce((sum, artifact) => sum + (artifact.actualSize || 0), 0),
    failures,
    artifacts,
  };
}

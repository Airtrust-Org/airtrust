import { strFromU8, unzipSync } from 'fflate';

import { ApiError } from '../../middleware/error-handler';
import { resolveScormLaunchFileHref, resolveScormVersion } from './scorm-manifest-parser';

export type LmsStructuredContentType = 'scorm' | 'h5p';

/**
 * Conservative limits for synchronous ZIP extraction in the Worker runtime.
 * The compressed body is bounded before extraction and central-directory
 * metadata is inspected before unzipSync allocates expanded entries.
 */
// Cloudflare Workers have a 128 MiB per-isolate memory ceiling. unzipSync keeps
// the submitted ZIP and expanded entries resident at the same time, so limits
// must leave material headroom for the JS heap, validator metadata and
// concurrent requests sharing the isolate. A larger package requires a future
// streaming/external extraction architecture; it must not be admitted here.
export const LMS_PACKAGE_LIMITS = Object.freeze({
  maxCompressedBytes: 32 * 1024 * 1024,
  maxEntries: 2_000,
  maxUncompressedBytes: 64 * 1024 * 1024,
  maxFileBytes: 32 * 1024 * 1024,
  maxMetadataBytes: 2 * 1024 * 1024,
  maxPathDepth: 20,
  maxPathBytes: 512,
  maxCompressionRatio: 200,
  uploadBatchSize: 8,
});

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;
const IGNORED_ROOTS = new Set(['__macosx']);
const IGNORED_FILES = new Set(['.ds_store', 'thumbs.db']);

export type ZipEntryMetadata = {
  rawPath: string;
  path: string | null;
  compressedSize: number;
  uncompressedSize: number;
  directory: boolean;
};

export type ValidatedPackageEntry = {
  path: string;
  data: Uint8Array;
};

export type ValidatedLmsPackage = {
  tipoConteudo: LmsStructuredContentType;
  entries: ValidatedPackageEntry[];
  totalUncompressedBytes: number;
  launchFile: string | null;
  scormVersao: '1.2' | '2004' | null;
  tipoH5p: string | null;
};

export type UploadedEntryDescriptor = {
  path: string;
  size: number;
};

function invalidPackage(message: string, status = 400): never {
  throw new ApiError(message, status);
}

function readUint16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) {
    invalidPackage('Arquivo ZIP inválido ou truncado');
  }
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) {
    invalidPackage('Arquivo ZIP inválido ou truncado');
  }
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function findEocdOffset(bytes: Uint8Array): number {
  const minimumOffset = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (readUint32(bytes, offset) === ZIP_EOCD_SIGNATURE) return offset;
  }
  invalidPackage('Arquivo ZIP inválido ou corrompido');
}

function decodeZipName(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    invalidPackage('O pacote contém nome de arquivo com codificação inválida');
  }
}

function decodeArchivePath(rawPath: string): string {
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    invalidPackage('O pacote contém caminho com escape inválido');
  }
  return decoded.normalize('NFC').replace(/\\/g, '/');
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code !== undefined && (code <= 0x1f || code === 0x7f)) return true;
  }
  return false;
}

export function normalizeLmsArchivePath(rawPath: string): string | null {
  const decoded = decodeArchivePath(rawPath);
  if (!decoded || hasControlCharacter(decoded)) {
    invalidPackage('O pacote contém caminho inválido');
  }
  if (decoded.startsWith('/') || decoded.startsWith('//') || /^[a-zA-Z]:\//.test(decoded)) {
    invalidPackage('O pacote contém caminho absoluto inválido');
  }

  const directory = decoded.endsWith('/');
  const segments = decoded.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    invalidPackage('O pacote contém tentativa de path traversal');
  }

  const compact = segments.filter(Boolean);
  if (compact.length === 0 || directory) return null;
  if (compact.length > LMS_PACKAGE_LIMITS.maxPathDepth) {
    invalidPackage(
      `O pacote excede a profundidade máxima de ${LMS_PACKAGE_LIMITS.maxPathDepth} níveis`,
    );
  }

  const normalized = compact.join('/');
  if (new TextEncoder().encode(normalized).byteLength > LMS_PACKAGE_LIMITS.maxPathBytes) {
    invalidPackage(`O pacote contém caminho acima de ${LMS_PACKAGE_LIMITS.maxPathBytes} bytes`);
  }

  const root = compact[0]!.toLowerCase();
  const filename = compact[compact.length - 1]!.toLowerCase();
  if (IGNORED_ROOTS.has(root) || IGNORED_FILES.has(filename)) return null;

  return normalized;
}

function collisionKey(path: string): string {
  return path.normalize('NFC').toLocaleLowerCase('en-US');
}

function assertNoPathCollision(path: string, seen: Map<string, string>): void {
  const key = collisionKey(path);
  const existing = seen.get(key);
  if (existing) {
    invalidPackage(`O pacote contém caminhos duplicados ou equivalentes: ${existing} e ${path}`);
  }
  seen.set(key, path);
}

function assertEntryLimits(entry: {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
}): void {
  if (entry.uncompressedSize > LMS_PACKAGE_LIMITS.maxFileBytes) {
    invalidPackage(`O arquivo ${entry.path} excede o limite individual de 32 MB`);
  }

  const ratio = entry.uncompressedSize / Math.max(1, entry.compressedSize);
  if (entry.uncompressedSize > 1024 && ratio > LMS_PACKAGE_LIMITS.maxCompressionRatio) {
    invalidPackage(
      `O arquivo ${entry.path} possui proporção de compressão anormal (${Math.round(ratio)}:1)`,
    );
  }
}

export function inspectZipCentralDirectory(bytes: Uint8Array): ZipEntryMetadata[] {
  if (bytes.byteLength === 0) invalidPackage('Arquivo vazio');
  if (bytes.byteLength > LMS_PACKAGE_LIMITS.maxCompressedBytes) {
    invalidPackage('Pacote excede o limite comprimido de 32 MB', 413);
  }

  const eocdOffset = findEocdOffset(bytes);
  const diskNumber = readUint16(bytes, eocdOffset + 4);
  const centralDirectoryDisk = readUint16(bytes, eocdOffset + 6);
  const entriesOnDisk = readUint16(bytes, eocdOffset + 8);
  const entryCount = readUint16(bytes, eocdOffset + 10);
  const centralDirectorySize = readUint32(bytes, eocdOffset + 12);
  const centralDirectoryOffset = readUint32(bytes, eocdOffset + 16);

  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== entryCount) {
    invalidPackage('Pacotes ZIP multi-volume não são aceitos');
  }
  if (
    entryCount === ZIP64_SENTINEL_16 ||
    centralDirectorySize === ZIP64_SENTINEL_32 ||
    centralDirectoryOffset === ZIP64_SENTINEL_32
  ) {
    invalidPackage('Pacotes ZIP64 não são aceitos neste fluxo');
  }
  if (entryCount === 0) invalidPackage('O pacote não contém arquivos');
  if (entryCount > LMS_PACKAGE_LIMITS.maxEntries) {
    invalidPackage(`O pacote excede o limite de ${LMS_PACKAGE_LIMITS.maxEntries} entradas`);
  }
  if (centralDirectoryOffset + centralDirectorySize > eocdOffset) {
    invalidPackage('Diretório central ZIP inválido');
  }

  const entries: ZipEntryMetadata[] = [];
  const seen = new Map<string, string>();
  let cursor = centralDirectoryOffset;
  let totalUncompressed = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(bytes, cursor) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      invalidPackage('Diretório central ZIP corrompido');
    }

    const flags = readUint16(bytes, cursor + 8);
    if ((flags & 0x1) !== 0) {
      invalidPackage('Pacotes ZIP criptografados não são aceitos');
    }

    const compressedSize = readUint32(bytes, cursor + 20);
    const uncompressedSize = readUint32(bytes, cursor + 24);
    const fileNameLength = readUint16(bytes, cursor + 28);
    const extraLength = readUint16(bytes, cursor + 30);
    const commentLength = readUint16(bytes, cursor + 32);
    const recordEnd = cursor + 46 + fileNameLength + extraLength + commentLength;
    if (recordEnd > bytes.length) invalidPackage('Diretório central ZIP truncado');

    const rawPath = decodeZipName(bytes.subarray(cursor + 46, cursor + 46 + fileNameLength));
    const directory = /[\\/]$/.test(rawPath);
    const path = normalizeLmsArchivePath(rawPath);

    if (!directory && path) {
      assertNoPathCollision(path, seen);
      assertEntryLimits({ path, compressedSize, uncompressedSize });
      totalUncompressed += uncompressedSize;
      if (totalUncompressed > LMS_PACKAGE_LIMITS.maxUncompressedBytes) {
        invalidPackage('Pacote excede o limite descompactado total de 64 MB');
      }
    }

    entries.push({ rawPath, path, compressedSize, uncompressedSize, directory });
    cursor = recordEnd;
  }

  if (cursor !== centralDirectoryOffset + centralDirectorySize) {
    invalidPackage('Diretório central ZIP possui tamanho inconsistente');
  }

  return entries;
}

function resolveRelativePackagePath(basePath: string, relativePath: string): string {
  const withoutQuery = relativePath.split(/[?#]/, 1)[0] ?? '';
  if (!withoutQuery) invalidPackage('O manifest informa launch file vazio');
  const baseDir = basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/') + 1) : '';
  const resolved = normalizeLmsArchivePath(`${baseDir}${withoutQuery}`);
  if (!resolved) invalidPackage('O manifest informa launch file inválido');
  return resolved;
}

function findSingleMetadataEntry(
  entries: ValidatedPackageEntry[],
  filename: string,
): ValidatedPackageEntry {
  const lowerName = filename.toLowerCase();
  const matches = entries.filter(
    (entry) =>
      entry.path.toLowerCase() === lowerName ||
      entry.path.toLowerCase().endsWith(`/${lowerName}`),
  );
  if (matches.length === 0) invalidPackage(`${filename} não encontrado no pacote`);
  if (matches.length > 1) invalidPackage(`O pacote contém mais de um ${filename}`);
  const match = matches[0]!;
  if (match.data.byteLength > LMS_PACKAGE_LIMITS.maxMetadataBytes) {
    invalidPackage(`${filename} excede o limite de metadados de 2 MB`);
  }
  return match;
}

function validateScormEntries(
  entries: ValidatedPackageEntry[],
): Pick<ValidatedLmsPackage, 'launchFile' | 'scormVersao' | 'tipoH5p'> {
  const manifest = findSingleMetadataEntry(entries, 'imsmanifest.xml');
  const manifestXml = strFromU8(manifest.data);
  const rawLaunchFile = resolveScormLaunchFileHref(manifestXml);
  if (!rawLaunchFile) {
    invalidPackage('Não foi possível identificar o launch file do pacote SCORM');
  }

  const launchFile = resolveRelativePackagePath(manifest.path, rawLaunchFile);
  const existingPaths = new Set(entries.map((entry) => collisionKey(entry.path)));
  if (!existingPaths.has(collisionKey(launchFile))) {
    invalidPackage(`O launch file ${launchFile} não existe no conjunto extraído`);
  }

  return {
    launchFile,
    scormVersao: resolveScormVersion(manifestXml),
    tipoH5p: null,
  };
}

const SCORM_STATIC_GATE_METADATA_FILENAMES = new Set([
  'imsmanifest.xml',
  'airtrust-completion-manifest.json',
  'airtrust-completion-diagnostics.json',
]);

/**
 * Runs only the checks the SCORM static gate actually needs (manifest,
 * launch-file resolution + existence, AirTrust completion/diagnostics
 * manifests) without decompressing every entry in the archive. Central
 * directory inspection (inspectZipCentralDirectory) already gives every
 * entry's path and size with zero decompression; unzipSync's filter then
 * decompresses only the handful of small metadata files this needs.
 * Existence of the launch file is checked against that central-directory
 * listing, not against decompressed bytes — its content is never read here.
 *
 * This exists to avoid paying full-package decompression CPU for a
 * candidate that the static gate will reject anyway. A package that passes
 * this check still needs the full extractAndValidateLmsPackage pass before
 * storage, since every byte must land in R2 for Browser Run/playback to
 * work — this function only lets a REJECTED verdict be reached cheaply.
 */
export function extractScormStaticGateMetadata(bytes: Uint8Array): ValidatedLmsPackage {
  const centralDirectory = inspectZipCentralDirectory(bytes);
  const centralDirectoryPaths = new Set(
    centralDirectory
      .filter((item): item is ZipEntryMetadata & { path: string } => Boolean(item.path && !item.directory))
      .map((item) => collisionKey(item.path)),
  );
  const totalUncompressedBytes = centralDirectory.reduce((sum, item) => sum + item.uncompressedSize, 0);

  let archive: ReturnType<typeof unzipSync>;
  try {
    archive = unzipSync(bytes, {
      filter(file) {
        const path = normalizeLmsArchivePath(file.name);
        if (!path) return false;
        const filename = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
        return SCORM_STATIC_GATE_METADATA_FILENAMES.has(filename);
      },
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    invalidPackage('Arquivo ZIP inválido ou corrompido');
  }

  const seen = new Map<string, string>();
  const entries: ValidatedPackageEntry[] = [];
  for (const [rawPath, data] of Object.entries(archive)) {
    const path = normalizeLmsArchivePath(rawPath);
    if (!path) continue;
    assertNoPathCollision(path, seen);
    entries.push({ path, data });
  }

  let launchFile: string | null = null;
  let scormVersao: '1.2' | '2004' | null = null;
  const manifestMatches = entries.filter(
    (entry) => entry.path.toLowerCase() === 'imsmanifest.xml' || entry.path.toLowerCase().endsWith('/imsmanifest.xml'),
  );
  if (manifestMatches.length === 1) {
    const manifest = manifestMatches[0]!;
    const manifestXml = strFromU8(manifest.data);
    const rawLaunchFile = resolveScormLaunchFileHref(manifestXml);
    if (rawLaunchFile) {
      try {
        const candidateLaunchFile = resolveRelativePackagePath(manifest.path, rawLaunchFile);
        if (centralDirectoryPaths.has(collisionKey(candidateLaunchFile))) {
          launchFile = candidateLaunchFile;
          scormVersao = resolveScormVersion(manifestXml);
        }
      } catch {
        // Leave launchFile null — the static gate reports this as a
        // structural failure rather than crashing extraction.
      }
    }
  }

  return {
    tipoConteudo: 'scorm',
    entries,
    totalUncompressedBytes,
    launchFile,
    scormVersao,
    tipoH5p: null,
  };
}

function parseH5pMainLibrary(metadata: Uint8Array): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(strFromU8(metadata)) as Record<string, unknown>;
  } catch {
    invalidPackage('h5p.json inválido');
  }

  const mainLibrary = parsed.mainLibrary;
  if (typeof mainLibrary !== 'string' || !mainLibrary.trim()) {
    invalidPackage('h5p.json não informa mainLibrary válida');
  }
  return mainLibrary.trim().replace(/\s+\d.*$/, '');
}

function validateH5pEntries(
  entries: ValidatedPackageEntry[],
): Pick<ValidatedLmsPackage, 'launchFile' | 'scormVersao' | 'tipoH5p'> {
  const metadata = findSingleMetadataEntry(entries, 'h5p.json');
  const baseDir = metadata.path.includes('/')
    ? metadata.path.slice(0, metadata.path.lastIndexOf('/') + 1)
    : '';
  const expectedContentPath = `${baseDir}content/content.json`;
  const content = entries.find(
    (entry) => collisionKey(entry.path) === collisionKey(expectedContentPath),
  );
  if (!content) invalidPackage('content/content.json não encontrado no pacote H5P');
  if (content.data.byteLength > LMS_PACKAGE_LIMITS.maxMetadataBytes) {
    invalidPackage('content/content.json excede o limite de metadados de 2 MB');
  }

  return {
    launchFile: null,
    scormVersao: null,
    tipoH5p: parseH5pMainLibrary(metadata.data),
  };
}

export function extractAndValidateLmsPackage(
  bytes: Uint8Array,
  tipoConteudo: LmsStructuredContentType,
): ValidatedLmsPackage {
  const metadata = inspectZipCentralDirectory(bytes);

  let archive: ReturnType<typeof unzipSync>;
  let filteredTotal = 0;
  try {
    archive = unzipSync(bytes, {
      filter(file) {
        const path = normalizeLmsArchivePath(file.name);
        if (!path) return false;
        if (file.originalSize > LMS_PACKAGE_LIMITS.maxFileBytes) {
          invalidPackage(`O arquivo ${path} excede o limite individual de 32 MB`);
        }
        filteredTotal += file.originalSize;
        if (filteredTotal > LMS_PACKAGE_LIMITS.maxUncompressedBytes) {
          invalidPackage('Pacote excede o limite descompactado total de 64 MB');
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    invalidPackage('Arquivo ZIP inválido ou corrompido');
  }

  const expected = new Map(
    metadata
      .filter(
        (entry): entry is ZipEntryMetadata & { path: string } =>
          Boolean(entry.path && !entry.directory),
      )
      .map((entry) => [collisionKey(entry.path), entry]),
  );
  const seen = new Map<string, string>();
  const entries: ValidatedPackageEntry[] = [];
  let totalUncompressedBytes = 0;

  for (const [rawPath, data] of Object.entries(archive)) {
    const path = normalizeLmsArchivePath(rawPath);
    if (!path) continue;
    assertNoPathCollision(path, seen);

    const expectedEntry = expected.get(collisionKey(path));
    if (!expectedEntry) {
      invalidPackage(`A entrada ${path} não consta no diretório central do ZIP`);
    }
    if (data.byteLength !== expectedEntry.uncompressedSize) {
      invalidPackage(`A entrada ${path} possui tamanho descompactado inconsistente`);
    }
    if (data.byteLength > LMS_PACKAGE_LIMITS.maxFileBytes) {
      invalidPackage(`O arquivo ${path} excede o limite individual de 32 MB`);
    }

    totalUncompressedBytes += data.byteLength;
    if (totalUncompressedBytes > LMS_PACKAGE_LIMITS.maxUncompressedBytes) {
      invalidPackage('Pacote excede o limite descompactado total de 64 MB');
    }
    entries.push({ path, data });
  }

  if (entries.length === 0) invalidPackage('O pacote não contém arquivos utilizáveis');
  if (entries.length > LMS_PACKAGE_LIMITS.maxEntries) {
    invalidPackage(`O pacote excede o limite de ${LMS_PACKAGE_LIMITS.maxEntries} arquivos`);
  }
  if (entries.length !== expected.size) {
    invalidPackage('O conjunto extraído diverge do diretório central');
  }

  const contentMeta =
    tipoConteudo === 'scorm' ? validateScormEntries(entries) : validateH5pEntries(entries);

  return {
    tipoConteudo,
    entries,
    totalUncompressedBytes,
    ...contentMeta,
  };
}

export function validateUploadedEntryDescriptors(entries: UploadedEntryDescriptor[]): {
  normalized: UploadedEntryDescriptor[];
  totalBytes: number;
} {
  if (entries.length === 0) invalidPackage('Nenhum arquivo foi confirmado no storage');
  if (entries.length > LMS_PACKAGE_LIMITS.maxEntries) {
    invalidPackage(`O upload excede o limite de ${LMS_PACKAGE_LIMITS.maxEntries} arquivos`);
  }

  const seen = new Map<string, string>();
  const normalized: UploadedEntryDescriptor[] = [];
  let totalBytes = 0;

  for (const entry of entries) {
    const path = normalizeLmsArchivePath(entry.path);
    if (!path) invalidPackage('O upload contém caminho de arquivo inválido');
    if (!Number.isInteger(entry.size) || entry.size < 0) {
      invalidPackage(`Tamanho inválido para ${path}`);
    }
    assertNoPathCollision(path, seen);
    if (entry.size > LMS_PACKAGE_LIMITS.maxFileBytes) {
      invalidPackage(`O arquivo ${path} excede o limite individual de 32 MB`, 413);
    }
    totalBytes += entry.size;
    if (totalBytes > LMS_PACKAGE_LIMITS.maxUncompressedBytes) {
      invalidPackage('Upload excede o limite total de 256 MB', 413);
    }
    normalized.push({ path, size: entry.size });
  }

  return { normalized, totalBytes };
}

export function validateStructuredScormMetadata(params: {
  entries: UploadedEntryDescriptor[];
  manifestPath: string;
  manifestBytes: Uint8Array;
}): { launchFile: string; scormVersao: '1.2' | '2004' } {
  const { normalized } = validateUploadedEntryDescriptors(params.entries);
  if (params.manifestBytes.byteLength > LMS_PACKAGE_LIMITS.maxMetadataBytes) {
    invalidPackage('imsmanifest.xml excede o limite de metadados de 2 MB');
  }

  const manifestPath = normalizeLmsArchivePath(params.manifestPath);
  if (!manifestPath) invalidPackage('Caminho de manifest inválido');
  const manifestXml = strFromU8(params.manifestBytes);
  const rawLaunch = resolveScormLaunchFileHref(manifestXml);
  if (!rawLaunch) {
    invalidPackage('Não foi possível identificar o launch file do pacote SCORM');
  }
  const launchFile = resolveRelativePackagePath(manifestPath, rawLaunch);
  const paths = new Set(normalized.map((entry) => collisionKey(entry.path)));
  if (!paths.has(collisionKey(launchFile))) {
    invalidPackage(`O launch file ${launchFile} não existe no upload confirmado`);
  }
  return { launchFile, scormVersao: resolveScormVersion(manifestXml) };
}

export function validateStructuredH5pMetadata(params: {
  entries: UploadedEntryDescriptor[];
  h5pJsonPath: string;
  h5pJsonBytes: Uint8Array;
}): { tipoH5p: string } {
  const { normalized } = validateUploadedEntryDescriptors(params.entries);
  if (params.h5pJsonBytes.byteLength > LMS_PACKAGE_LIMITS.maxMetadataBytes) {
    invalidPackage('h5p.json excede o limite de metadados de 2 MB');
  }

  const h5pJsonPath = normalizeLmsArchivePath(params.h5pJsonPath);
  if (!h5pJsonPath) invalidPackage('Caminho de h5p.json inválido');
  const baseDir = h5pJsonPath.includes('/')
    ? h5pJsonPath.slice(0, h5pJsonPath.lastIndexOf('/') + 1)
    : '';
  const expectedContent = `${baseDir}content/content.json`;
  if (!normalized.some((entry) => collisionKey(entry.path) === collisionKey(expectedContent))) {
    invalidPackage('content/content.json não encontrado no upload H5P');
  }

  return { tipoH5p: parseH5pMainLibrary(params.h5pJsonBytes) };
}

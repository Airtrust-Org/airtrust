import { unzipSync } from 'fflate';

// Keep browser preflight aligned with the authoritative Worker budget.
export const LMS_BROWSER_PACKAGE_LIMITS = Object.freeze({
  maxCompressedBytes: 32 * 1024 * 1024,
  maxEntries: 2_000,
  maxUncompressedBytes: 64 * 1024 * 1024,
  maxFileBytes: 32 * 1024 * 1024,
  maxPathDepth: 20,
  maxPathBytes: 512,
  maxCompressionRatio: 200,
});

export type BrowserPackageEntry = { path: string; bytes: Uint8Array };

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;

function u16(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 2 > bytes.length) throw new Error('O ZIP está truncado.');
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function u32(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.length) throw new Error('O ZIP está truncado.');
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function findEocd(bytes: Uint8Array) {
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (u32(bytes, offset) === EOCD) return offset;
  }
  throw new Error('O arquivo selecionado não é um ZIP válido.');
}

function collisionKey(path: string) {
  return path.normalize('NFC').toLocaleLowerCase('en-US');
}

export function normalizeBrowserArchivePath(rawPath: string): string | null {
  let path = rawPath;
  try {
    path = decodeURIComponent(path);
  } catch {
    throw new Error('O pacote contém caminho com escape inválido.');
  }
  path = path.normalize('NFC').replace(/\\/g, '/');
  if (!path || path.includes('\0') || /[\u0000-\u001f\u007f]/.test(path)) {
    throw new Error('O pacote contém caminhos inválidos.');
  }
  if (path.startsWith('/') || path.startsWith('//') || /^[a-zA-Z]:\//.test(path)) {
    throw new Error('O pacote contém caminho absoluto inválido.');
  }
  const isDirectory = path.endsWith('/');
  const segments = path.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('O pacote contém tentativa de path traversal.');
  }
  const compact = segments.filter(Boolean);
  if (isDirectory || compact.length === 0) return null;
  if (compact.length > LMS_BROWSER_PACKAGE_LIMITS.maxPathDepth) {
    throw new Error('O pacote possui caminhos profundos demais.');
  }
  const normalized = compact.join('/');
  if (new TextEncoder().encode(normalized).byteLength > LMS_BROWSER_PACKAGE_LIMITS.maxPathBytes) {
    throw new Error('O pacote possui nome de arquivo longo demais.');
  }
  if (compact[0]!.toLowerCase() === '__macosx') return null;
  if (['.ds_store', 'thumbs.db'].includes(compact.at(-1)!.toLowerCase())) return null;
  return normalized;
}

export function inspectBrowserZip(bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new Error('O pacote está vazio.');
  if (bytes.byteLength > LMS_BROWSER_PACKAGE_LIMITS.maxCompressedBytes) {
    throw new Error('O pacote excede o limite comprimido de 32 MB.');
  }
  const eocd = findEocd(bytes);
  const entries = u16(bytes, eocd + 10);
  const centralSize = u32(bytes, eocd + 12);
  const centralOffset = u32(bytes, eocd + 16);
  if (entries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('Pacotes ZIP64 não são aceitos.');
  }
  if (entries === 0 || entries > LMS_BROWSER_PACKAGE_LIMITS.maxEntries) {
    throw new Error(`O pacote excede o limite de ${LMS_BROWSER_PACKAGE_LIMITS.maxEntries} entradas.`);
  }
  if (centralOffset + centralSize > eocd) throw new Error('Diretório central ZIP inválido.');

  let cursor = centralOffset;
  let total = 0;
  const expected = new Map<string, { path: string; size: number }>();
  for (let index = 0; index < entries; index += 1) {
    if (u32(bytes, cursor) !== CENTRAL) throw new Error('Diretório central ZIP corrompido.');
    const flags = u16(bytes, cursor + 8);
    if ((flags & 1) !== 0) throw new Error('Pacotes ZIP criptografados não são aceitos.');
    const compressed = u32(bytes, cursor + 20);
    const uncompressed = u32(bytes, cursor + 24);
    const nameLength = u16(bytes, cursor + 28);
    const extraLength = u16(bytes, cursor + 30);
    const commentLength = u16(bytes, cursor + 32);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.length) throw new Error('Diretório central ZIP truncado.');
    let rawPath: string;
    try {
      rawPath = new TextDecoder('utf-8', { fatal: true }).decode(
        bytes.subarray(cursor + 46, cursor + 46 + nameLength),
      );
    } catch {
      throw new Error('O pacote contém nome de arquivo com codificação inválida.');
    }
    const path = normalizeBrowserArchivePath(rawPath);
    if (path) {
      if (uncompressed > LMS_BROWSER_PACKAGE_LIMITS.maxFileBytes) {
        throw new Error(`O arquivo ${path} excede o limite individual de 32 MB.`);
      }
      const ratio = uncompressed / Math.max(1, compressed);
      if (uncompressed > 1024 && ratio > LMS_BROWSER_PACKAGE_LIMITS.maxCompressionRatio) {
        throw new Error(`O arquivo ${path} possui proporção de compressão anormal.`);
      }
      const key = collisionKey(path);
      if (expected.has(key)) throw new Error(`O pacote contém caminhos duplicados: ${path}.`);
      expected.set(key, { path, size: uncompressed });
      total += uncompressed;
      if (total > LMS_BROWSER_PACKAGE_LIMITS.maxUncompressedBytes) {
        throw new Error('O pacote excede o limite descompactado total de 64 MB.');
      }
    }
    cursor = end;
  }
  if (cursor !== centralOffset + centralSize) throw new Error('Diretório central ZIP inconsistente.');
  return expected;
}

export function extractBrowserLmsPackage(bytes: Uint8Array): BrowserPackageEntry[] {
  const expected = inspectBrowserZip(bytes);
  let archive: ReturnType<typeof unzipSync>;
  let filteredTotal = 0;
  try {
    archive = unzipSync(bytes, {
      filter(file) {
        const path = normalizeBrowserArchivePath(file.name);
        if (!path) return false;
        if (file.originalSize > LMS_BROWSER_PACKAGE_LIMITS.maxFileBytes) {
          throw new Error(`O arquivo ${path} excede o limite individual de 32 MB.`);
        }
        filteredTotal += file.originalSize;
        if (filteredTotal > LMS_BROWSER_PACKAGE_LIMITS.maxUncompressedBytes) {
          throw new Error('O pacote excede o limite descompactado total de 64 MB.');
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof Error && /limite|caminho|path traversal/i.test(error.message)) throw error;
    throw new Error('O arquivo selecionado não é um ZIP válido.');
  }

  const entries: BrowserPackageEntry[] = [];
  const seen = new Set<string>();
  for (const [rawPath, data] of Object.entries(archive as Record<string, Uint8Array>)) {
    const path = normalizeBrowserArchivePath(rawPath);
    if (!path) continue;
    const key = collisionKey(path);
    if (seen.has(key)) throw new Error(`O pacote contém caminhos duplicados: ${path}.`);
    const metadata = expected.get(key);
    if (!metadata || metadata.size !== data.byteLength) {
      throw new Error(`O arquivo ${path} diverge do diretório central do ZIP.`);
    }
    seen.add(key);
    entries.push({ path, bytes: data });
  }
  if (entries.length !== expected.size) throw new Error('O conjunto extraído está incompleto.');
  return entries;
}

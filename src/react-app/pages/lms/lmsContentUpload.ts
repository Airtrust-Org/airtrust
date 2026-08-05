import { strFromU8 } from 'fflate';
import { fetchWithAuth } from '@/react-app/config/api';
import type { ScormVersao } from '@/react-app/hooks/useLms';
import { extractBrowserLmsPackage, normalizeBrowserArchivePath } from './lmsPackageValidator';

type UploadTipoConteudo = 'scorm' | 'h5p';

type PreparedFile = {
  path: string;
  bytes: Uint8Array;
  size: number;
  mimeType: string;
};

type PreparedPackage = {
  files: PreparedFile[];
  totalBytes: number;
  launchFile: string | null;
  scormVersao: ScormVersao;
  tipoH5p: string | null;
  packageHash: string;
};

const IGNORED_ARCHIVE_SUFFIXES = ['.map'];
const STRUCTURED_UPLOAD_CONCURRENCY = 4;

function shouldIgnoreArchivePath(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return IGNORED_ARCHIVE_SUFFIXES.some((suffix) => lowerPath.endsWith(suffix));
}

function parseLaunchFile(manifestXml: string): string | null {
  const resourceMatch = manifestXml.match(/<resource\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i);
  if (resourceMatch?.[1]) return resourceMatch[1];
  const itemMatch = manifestXml.match(/<item\b[^>]*\bidentifierref\s*=\s*["']([^"']+)["']/i);
  if (!itemMatch?.[1]) return null;
  const escaped = itemMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `<resource\\b[^>]*\\bidentifier\\s*=\\s*["']${escaped}["'][^>]*\\bhref\\s*=\\s*["']([^"']+)["']`,
    'i',
  ).exec(manifestXml)?.[1] ?? null;
}

function parseScormVersion(manifestXml: string): ScormVersao {
  return /adlcp:schemaversion[^>]*>\s*2004/i.test(manifestXml) || /SCORM\s*2004/i.test(manifestXml)
    ? '2004'
    : '1.2';
}

function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    html: 'text/html', htm: 'text/html', js: 'application/javascript', mjs: 'application/javascript',
    css: 'text/css', xml: 'application/xml', json: 'application/json', png: 'image/png',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml',
    webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', woff: 'font/woff',
    woff2: 'font/woff2', ttf: 'font/ttf', ico: 'image/x-icon', pdf: 'application/pdf',
    swf: 'application/x-shockwave-flash',
  };
  return map[ext ?? ''] ?? 'application/octet-stream';
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { success?: boolean; data?: T; error?: string };
    if (!response.ok || !json.success) throw new Error(json.error ?? `HTTP ${response.status}`);
    return json.data as T;
  } catch (error) {
    if (error instanceof Error && error.message !== `HTTP ${response.status}`) throw error;
    if (/413|payload too large/i.test(text)) {
      throw new Error('O pacote excede um dos limites seguros de upload.');
    }
    throw new Error(text || `HTTP ${response.status}`);
  }
}

function parseH5pType(h5pJsonText: string): string | null {
  try {
    const mainLibrary = (JSON.parse(h5pJsonText) as Record<string, unknown>).mainLibrary;
    return typeof mainLibrary === 'string' && mainLibrary.trim()
      ? mainLibrary.trim().replace(/\s+\d.*$/, '')
      : null;
  } catch {
    return null;
  }
}

function resolveRelativePath(basePath: string, relativePath: string) {
  const baseDir = basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/') + 1) : '';
  return normalizeBrowserArchivePath(`${baseDir}${relativePath.split(/[?#]/, 1)[0] ?? ''}`);
}

async function preparePackageUpload(file: File, tipoConteudo: UploadTipoConteudo): Promise<PreparedPackage> {
  const packageBytes = new Uint8Array(await file.arrayBuffer());
  const packageDigest = await crypto.subtle.digest('SHA-256', packageBytes);
  const packageHash = [...new Uint8Array(packageDigest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const files = extractBrowserLmsPackage(packageBytes)
    .filter((entry) => !shouldIgnoreArchivePath(entry.path))
    .map((entry) => ({
      path: entry.path,
      bytes: entry.bytes,
      size: entry.bytes.byteLength,
      mimeType: guessMime(entry.path),
    }));
  if (files.length === 0) throw new Error('O pacote não contém arquivos utilizáveis.');
  const totalBytes = files.reduce((sum, entry) => sum + entry.size, 0);

  if (tipoConteudo === 'scorm') {
    const manifests = files.filter(
      (entry) => entry.path.toLowerCase() === 'imsmanifest.xml' || entry.path.toLowerCase().endsWith('/imsmanifest.xml'),
    );
    if (manifests.length !== 1) {
      throw new Error(manifests.length === 0 ? 'imsmanifest.xml não encontrado no pacote SCORM.' : 'O pacote contém mais de um imsmanifest.xml.');
    }
    const manifest = manifests[0]!;
    const manifestXml = strFromU8(manifest.bytes);
    const launchRaw = parseLaunchFile(manifestXml);
    if (!launchRaw) throw new Error('Não foi possível identificar o arquivo inicial do pacote SCORM.');
    const launchFile = resolveRelativePath(manifest.path, launchRaw);
    if (!launchFile || !files.some((entry) => entry.path.toLocaleLowerCase('en-US') === launchFile.toLocaleLowerCase('en-US'))) {
      throw new Error(`O arquivo inicial ${launchFile ?? launchRaw} não existe no pacote SCORM.`);
    }
    return { files, totalBytes, launchFile, scormVersao: parseScormVersion(manifestXml), tipoH5p: null, packageHash };
  }

  const h5pMetadata = files.filter(
    (entry) => entry.path.toLowerCase() === 'h5p.json' || entry.path.toLowerCase().endsWith('/h5p.json'),
  );
  if (h5pMetadata.length !== 1) {
    throw new Error(h5pMetadata.length === 0 ? 'h5p.json não encontrado no pacote H5P.' : 'O pacote contém mais de um h5p.json.');
  }
  const h5pJson = h5pMetadata[0]!;
  const baseDir = h5pJson.path.includes('/') ? h5pJson.path.slice(0, h5pJson.path.lastIndexOf('/') + 1) : '';
  if (!files.some((entry) => entry.path.toLocaleLowerCase('en-US') === `${baseDir}content/content.json`.toLocaleLowerCase('en-US'))) {
    throw new Error('content/content.json não encontrado no pacote H5P.');
  }
  const tipoH5p = parseH5pType(strFromU8(h5pJson.bytes));
  if (!tipoH5p) throw new Error('h5p.json não informa mainLibrary válida.');
  return { files, totalBytes, launchFile: null, scormVersao: null, tipoH5p, packageHash };
}

function buildIdempotencyKey(tipoConteudo: UploadTipoConteudo, packageHash: string) {
  return `${tipoConteudo}:${packageHash}`;
}

export async function uploadStructuredLmsPackage(params: {
  cursoId: number;
  tipoConteudo: UploadTipoConteudo;
  file: File;
  skipPurge?: boolean;
  onProgress?: (pct: number) => void;
  onStatus?: (status: string) => void;
}) {
  const { cursoId, tipoConteudo, file, onProgress, onStatus } = params;
  onStatus?.('Validando e extraindo pacote...');
  onProgress?.(10);
  const prepared = await preparePackageUpload(file, tipoConteudo);
  const idempotencyKey = buildIdempotencyKey(tipoConteudo, prepared.packageHash);

  onStatus?.('Preparando uma nova versão do conteúdo...');
  const initResponse = await fetchWithAuth(`/api/lms/cursos/${cursoId}/content-upload/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ tipo_conteudo: tipoConteudo, idempotency_key: idempotencyKey }),
  });
  const init = await parseApiResponse<{
    upload_id: string;
    status?: 'uploading' | 'completed';
    result?: Record<string, unknown> | null;
  }>(initResponse);
  if (init.status === 'completed' && init.result) {
    onProgress?.(100);
    onStatus?.('Conteúdo já confirmado com sucesso.');
    return {
      filesUploaded: Number(init.result.files_uploaded ?? prepared.files.length),
      prefix: typeof init.result.prefix === 'string' ? init.result.prefix : null,
      launchFile: typeof init.result.launch_file === 'string' ? init.result.launch_file : prepared.launchFile,
      scormVersao: (typeof init.result.scorm_versao === 'string' ? init.result.scorm_versao : prepared.scormVersao) as ScormVersao,
      tipoH5p: typeof init.result.tipo_h5p === 'string' ? init.result.tipo_h5p : prepared.tipoH5p,
    };
  }

  let uploadedBytes = 0;
  let completedFiles = 0;
  async function uploadEntry(entry: PreparedFile) {
    const query = new URLSearchParams({ tipo_conteudo: tipoConteudo, upload_id: init.upload_id, path: entry.path });
    const response = await fetchWithAuth(`/api/lms/cursos/${cursoId}/content-upload/file?${query}`, {
      method: 'POST', headers: { 'Content-Type': entry.mimeType }, body: entry.bytes,
    });
    await parseApiResponse(response);
    uploadedBytes += entry.size;
    completedFiles += 1;
    onStatus?.(`Enviando arquivo ${completedFiles} de ${prepared.files.length}...`);
    onProgress?.(Math.min(18 + Math.round((uploadedBytes / prepared.totalBytes) * 72), 92));
  }

  for (let index = 0; index < prepared.files.length; index += STRUCTURED_UPLOAD_CONCURRENCY) {
    await Promise.all(prepared.files.slice(index, index + STRUCTURED_UPLOAD_CONCURRENCY).map(uploadEntry));
  }

  onStatus?.('Validando e ativando a nova versão...');
  onProgress?.(95);
  const completeResponse = await fetchWithAuth(`/api/lms/cursos/${cursoId}/content-upload/complete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tipo_conteudo: tipoConteudo,
      upload_id: init.upload_id,
      arquivo_nome: file.name.trim() || null,
      files_uploaded: prepared.files.length,
      uploaded_paths: prepared.files.map((entry) => entry.path),
    }),
  });
  const data = await parseApiResponse<Record<string, unknown>>(completeResponse);
  onProgress?.(100);
  onStatus?.('Conteúdo enviado com sucesso.');
  return {
    filesUploaded: Number(data.files_uploaded ?? prepared.files.length),
    prefix: typeof data.prefix === 'string' ? data.prefix : null,
    launchFile: typeof data.launch_file === 'string' ? data.launch_file : prepared.launchFile,
    scormVersao: (typeof data.scorm_versao === 'string' ? data.scorm_versao : prepared.scormVersao) as ScormVersao,
    tipoH5p: typeof data.tipo_h5p === 'string' ? data.tipo_h5p : prepared.tipoH5p,
  };
}

export async function uploadSimpleFile(params: {
  cursoId: number;
  tipo: 'pdf' | 'pptx';
  file: File;
  onProgress?: (pct: number) => void;
  onStatus?: (status: string) => void;
}): Promise<{ r2_key: string; slide_count?: number }> {
  const { cursoId, tipo, file, onProgress, onStatus } = params;
  onStatus?.(`Enviando ${tipo.toUpperCase()}...`);
  onProgress?.(20);
  const formData = new FormData();
  formData.append('arquivo', file);
  const response = await fetchWithAuth(`/api/lms/cursos/${cursoId}/upload/${tipo}`, { method: 'POST', body: formData });
  onProgress?.(90);
  const data = await parseApiResponse<{ pdf_r2_key?: string; pptx_r2_key?: string; slide_count?: number }>(response);
  onProgress?.(100);
  onStatus?.('Arquivo enviado com sucesso.');
  return { r2_key: (tipo === 'pdf' ? data.pdf_r2_key : data.pptx_r2_key) ?? '', slide_count: data.slide_count };
}

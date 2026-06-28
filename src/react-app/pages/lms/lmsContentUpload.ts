import { strFromU8, unzipSync } from 'fflate';
import { fetchWithAuth } from '@/react-app/config/api';
import type { ScormVersao } from '@/react-app/hooks/useLms';

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
};

const IGNORED_ARCHIVE_FILENAMES = new Set(['.ds_store', 'thumbs.db']);
const IGNORED_ARCHIVE_SUFFIXES = ['.map'];
const STRUCTURED_UPLOAD_CONCURRENCY = 4;

function normalizeArchivePath(path: string): string {
  const normalized = decodeURIComponent(path).replace(/^\/+/, '').replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);

  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('O pacote contém caminhos inválidos.');
  }

  return segments.join('/');
}

function sanitizeArchivePath(path: string): string | null {
  const decodedPath = decodeURIComponent(path).replace(/^\/+/, '').replace(/\\/g, '/');
  if (!decodedPath || decodedPath.endsWith('/') || decodedPath.startsWith('__MACOSX/')) {
    return null;
  }

  const normalized = normalizeArchivePath(path);

  if (!normalized || normalized.startsWith('__MACOSX/')) {
    return null;
  }

  return normalized;
}

function shouldIgnoreArchivePath(path: string): boolean {
  const lowerPath = path.toLowerCase();
  const filename = lowerPath.slice(lowerPath.lastIndexOf('/') + 1);

  if (IGNORED_ARCHIVE_FILENAMES.has(filename)) {
    return true;
  }

  return IGNORED_ARCHIVE_SUFFIXES.some((suffix) => lowerPath.endsWith(suffix));
}

function parseLaunchFile(manifestXml: string): string | null {
  const resourceMatch = manifestXml.match(/<resource[^>]+href="([^"]+)"/i);
  if (resourceMatch?.[1]) return resourceMatch[1];

  const itemMatch = manifestXml.match(/<item[^>]+identifierref="([^"]+)"/i);
  if (itemMatch?.[1]) {
    const refMatch = new RegExp(`identifier="${itemMatch[1]}"[^>]*href="([^"]+)"`, 'i').exec(
      manifestXml,
    );
    if (refMatch?.[1]) return refMatch[1];
  }

  return null;
}

function parseScormVersion(manifestXml: string): ScormVersao {
  if (manifestXml.includes('adlcp:schemaversion') && manifestXml.includes('2004')) return '2004';
  if (manifestXml.includes('1.2')) return '1.2';
  return '1.2';
}

function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    html: 'text/html',
    htm: 'text/html',
    js: 'application/javascript',
    mjs: 'application/javascript',
    css: 'text/css',
    xml: 'application/xml',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogv: 'video/ogg',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    ico: 'image/x-icon',
    pdf: 'application/pdf',
    swf: 'application/x-shockwave-flash',
  };
  return map[ext ?? ''] ?? 'application/octet-stream';
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  try {
    const json = JSON.parse(text) as { success?: boolean; data?: T; error?: string };
    if (!response.ok || !json.success) {
      throw new Error(json.error ?? `HTTP ${response.status}`);
    }
    return json.data as T;
  } catch (error) {
    if (error instanceof Error && error.message !== `HTTP ${response.status}`) {
      throw error;
    }

    if (/413|payload too large/i.test(text)) {
      throw new Error(
        'O pacote excedia o limite do envio antigo. Tente novamente: agora o upload é fragmentado por arquivo.',
      );
    }

    throw new Error(text || `HTTP ${response.status}`);
  }
}

function parseH5pType(h5pJsonText: string): string | null {
  try {
    const parsed = JSON.parse(h5pJsonText) as Record<string, unknown>;
    const mainLibrary = parsed.mainLibrary;
    if (typeof mainLibrary === 'string' && mainLibrary.trim()) {
      return mainLibrary.replace(/\s+\d.*$/, '');
    }
  } catch {
    return null;
  }

  return null;
}

async function preparePackageUpload(
  file: File,
  tipoConteudo: UploadTipoConteudo,
): Promise<PreparedPackage> {
  const packageBytes = new Uint8Array(await file.arrayBuffer());

  let archive: ReturnType<typeof unzipSync>;
  try {
    archive = unzipSync(packageBytes);
  } catch {
    throw new Error('O arquivo selecionado não é um ZIP válido.');
  }

  const files = Object.entries(archive)
    .map(([path, bytes]) => {
      const safePath = sanitizeArchivePath(path);
      if (!safePath) return null;
      if (shouldIgnoreArchivePath(safePath)) return null;

      return {
        path: safePath,
        bytes,
        size: bytes.byteLength,
        mimeType: guessMime(safePath),
      } satisfies PreparedFile;
    })
    .filter((entry): entry is PreparedFile => Boolean(entry));

  if (files.length === 0) {
    throw new Error('O pacote está vazio ou não contém arquivos utilizáveis.');
  }

  const totalBytes = files.reduce((sum, entry) => sum + entry.size, 0);

  if (tipoConteudo === 'scorm') {
    const manifest = files.find(
      (entry) =>
        entry.path.toLowerCase() === 'imsmanifest.xml' ||
        entry.path.toLowerCase().endsWith('/imsmanifest.xml'),
    );

    if (!manifest) {
      throw new Error('imsmanifest.xml não encontrado no pacote SCORM.');
    }

    const manifestXml = strFromU8(manifest.bytes);
    const launchFile = parseLaunchFile(manifestXml);
    if (!launchFile) {
      throw new Error('Não foi possível identificar o arquivo inicial do pacote SCORM.');
    }

    const manifestDir = manifest.path.includes('/')
      ? manifest.path.slice(0, manifest.path.lastIndexOf('/') + 1)
      : '';

    return {
      files,
      totalBytes,
      launchFile: normalizeArchivePath(`${manifestDir}${launchFile}`),
      scormVersao: parseScormVersion(manifestXml),
      tipoH5p: null,
    };
  }

  const h5pJson = files.find(
    (entry) => entry.path === 'h5p.json' || entry.path.endsWith('/h5p.json'),
  );

  return {
    files,
    totalBytes,
    launchFile: null,
    scormVersao: null,
    tipoH5p: h5pJson ? parseH5pType(strFromU8(h5pJson.bytes)) : null,
  };
}

export async function uploadStructuredLmsPackage(params: {
  cursoId: number;
  tipoConteudo: UploadTipoConteudo;
  file: File;
  skipPurge?: boolean;
  onProgress?: (pct: number) => void;
  onStatus?: (status: string) => void;
}) {
  const { cursoId, tipoConteudo, file, skipPurge = false, onProgress, onStatus } = params;

  onStatus?.('Extraindo pacote no navegador...');
  onProgress?.(10);
  const prepared = await preparePackageUpload(file, tipoConteudo);

  onStatus?.('Preparando destino do conteúdo...');
  const initResponse = await fetchWithAuth(`/api/lms/cursos/${cursoId}/content-upload/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo_conteudo: tipoConteudo, skip_purge: skipPurge || undefined }),
  });
  await parseApiResponse(initResponse);

  let uploadedBytes = 0;
  let completedFiles = 0;

  async function uploadEntry(entry: PreparedFile) {
    const uploadResponse = await fetchWithAuth(
      `/api/lms/cursos/${cursoId}/content-upload/file?tipo_conteudo=${tipoConteudo}&path=${encodeURIComponent(entry.path)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': entry.mimeType },
        body: entry.bytes,
      },
    );
    await parseApiResponse(uploadResponse);

    uploadedBytes += entry.size;
    completedFiles += 1;
    onStatus?.(`Enviando arquivo ${completedFiles} de ${prepared.files.length}...`);
    const progress = 18 + Math.round((uploadedBytes / prepared.totalBytes) * 72);
    onProgress?.(Math.min(progress, 92));
  }

  onStatus?.(`Enviando arquivo 0 de ${prepared.files.length}...`);

  for (
    let startIndex = 0;
    startIndex < prepared.files.length;
    startIndex += STRUCTURED_UPLOAD_CONCURRENCY
  ) {
    const chunk = prepared.files.slice(startIndex, startIndex + STRUCTURED_UPLOAD_CONCURRENCY);
    await Promise.all(chunk.map((entry) => uploadEntry(entry)));
  }

  onStatus?.('Finalizando pacote...');
  onProgress?.(95);

  const completeResponse = await fetchWithAuth(
    `/api/lms/cursos/${cursoId}/content-upload/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo_conteudo: tipoConteudo,
        launch_file: prepared.launchFile,
        scorm_versao: prepared.scormVersao,
        tipo_h5p: prepared.tipoH5p,
        arquivo_nome: file.name.trim() || null,
        files_uploaded: prepared.files.length,
        uploaded_paths: prepared.files.map((entry) => entry.path),
      }),
    },
  );

  const data = await parseApiResponse<{ files_uploaded?: number }>(completeResponse);
  onProgress?.(100);
  onStatus?.('Conteúdo enviado com sucesso.');

  return {
    filesUploaded: data.files_uploaded ?? prepared.files.length,
    prefix:
      typeof (data as { prefix?: unknown }).prefix === 'string'
        ? ((data as { prefix: string }).prefix as string)
        : null,
    launchFile:
      typeof (data as { launch_file?: unknown }).launch_file === 'string'
        ? ((data as { launch_file: string }).launch_file as string)
        : prepared.launchFile,
    scormVersao:
      (typeof (data as { scorm_versao?: unknown }).scorm_versao === 'string'
        ? ((data as { scorm_versao: ScormVersao }).scorm_versao as ScormVersao)
        : prepared.scormVersao) ?? null,
    tipoH5p:
      typeof (data as { tipo_h5p?: unknown }).tipo_h5p === 'string'
        ? ((data as { tipo_h5p: string }).tipo_h5p as string)
        : prepared.tipoH5p,
  };
}

// ── Upload simples (PDF / PPTX — arquivo único) ───────────────────────────────

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

  const response = await fetchWithAuth(`/api/lms/cursos/${cursoId}/upload/${tipo}`, {
    method: 'POST',
    body: formData,
  });

  onProgress?.(90);
  const data = await parseApiResponse<{
    pdf_r2_key?: string;
    pptx_r2_key?: string;
    slide_count?: number;
  }>(response);
  onProgress?.(100);
  onStatus?.('Arquivo enviado com sucesso.');

  return {
    r2_key: (tipo === 'pdf' ? data.pdf_r2_key : data.pptx_r2_key) ?? '',
    slide_count: data.slide_count,
  };
}

import { strFromU8 } from 'fflate';
import { fetchWithAuth } from '@/react-app/config/api';
import type { ScormVersao } from '@/react-app/hooks/useLms';
import { safeLmsResponseErrorText } from '@/react-app/lib/lms-safe-error-response';
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
  packageBytes: Uint8Array;
  totalBytes: number;
  launchFile: string | null;
  scormVersao: ScormVersao;
  tipoH5p: string | null;
  packageHash: string;
};

type UploadedFileSnapshot = {
  path: string;
  size: number;
};

const IGNORED_ARCHIVE_SUFFIXES = ['.map'];
// The Free Worker CPU budget cannot sustain four simultaneous R2 body streams
// for media-heavy SCORM packages. Two small assets can share a batch, while a
// large body remains isolated to preserve the Worker CPU/R2 safety boundary.
const STRUCTURED_UPLOAD_CONCURRENCY = 2;
const STRUCTURED_UPLOAD_SHARED_BATCH_MAX_BYTES = 4 * 1024 * 1024;
const STRUCTURED_UPLOAD_MAX_ATTEMPTS = 4;
const STRUCTURED_UPLOAD_RETRY_BASE_MS = 250;

function shouldIgnoreArchivePath(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return IGNORED_ARCHIVE_SUFFIXES.some((suffix) => lowerPath.endsWith(suffix));
}

/**
 * Fallback regex para manifests que o DOMParser não consegue estruturar.
 * Aceita prefixo de namespace opcional (ex.: `<ns0:resource>`, `<ns0:item>`).
 */
export function parseLaunchFileRegex(manifestXml: string): string | null {
  const resourceMatch = manifestXml.match(/<(?:\w+:)?resource\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i);
  if (resourceMatch?.[1]) return resourceMatch[1];
  const itemMatch = manifestXml.match(/<(?:\w+:)?item\b[^>]*\bidentifierref\s*=\s*["']([^"']+)["']/i);
  if (!itemMatch?.[1]) return null;
  const escaped = itemMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `<(?:\\w+:)?resource\\b[^>]*\\bidentifier\\s*=\\s*["']${escaped}["'][^>]*\\bhref\\s*=\\s*["']([^"']+)["']`,
    'i',
  ).exec(manifestXml)?.[1] ?? null;
}

/**
 * Identifica o arquivo inicial (launch) de um pacote SCORM 1.2/2004 a partir do
 * imsmanifest.xml. Usa DOMParser com matching por localName para funcionar com
 * manifest XML namespaced (ex.: `<ns0:resource href="index.html">`), que o regex
 * estrito `<resource ...>` não reconhecia (bug MEL V4 "Não foi possível
 * identificar o arquivo inicial do pacote SCORM.").
 *
 * Regra: organização padrão → primeiro <item> → identifierref → <resource> com
 * esse identifier → href relativo. Se DOMParser falhar, cai no regex com prefixo
 * de namespace opcional.
 */
export function parseLaunchFile(manifestXml: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(manifestXml, 'application/xml');
    // DOMParser materializa erros de parsing como um elemento <parsererror>.
    if (doc.getElementsByTagNameNS('*', 'parsererror').length > 0) {
      return parseLaunchFileRegex(manifestXml);
    }

    // Recursos/itens em QUALQUER namespace (localName).
    const resources = Array.from(doc.getElementsByTagNameNS('*', 'resource'));
    if (resources.length === 0) return parseLaunchFileRegex(manifestXml);
    const items = Array.from(doc.getElementsByTagNameNS('*', 'item'));

    const defaultOrgId = doc.documentElement.getAttribute('default');
    const orgs = Array.from(doc.getElementsByTagNameNS('*', 'organization'));
    const targetOrg =
      orgs.find((org) => org.getAttribute('identifier') === defaultOrgId) ?? orgs[0] ?? null;
    const firstItem = targetOrg
      ? Array.from(targetOrg.getElementsByTagNameNS('*', 'item'))[0]
      : items[0];
    const identifierRef = firstItem?.getAttribute('identifierref') ?? null;

    let href: string | null = null;
    if (identifierRef) {
      const resource = resources.find((r) => r.getAttribute('identifier') === identifierRef);
      href = resource?.getAttribute('href') ?? null;
    }
    if (!href) {
      href = resources.find((r) => r.getAttribute('href'))?.getAttribute('href') ?? null;
    }
    return href ? (href.split(/[?#]/, 1)[0] ?? href) : null;
  } catch {
    return parseLaunchFileRegex(manifestXml);
  }
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

export async function parseApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let json: { success?: boolean; data?: T; error?: string } | null = null;

  try {
    json = JSON.parse(text) as { success?: boolean; data?: T; error?: string };
  } catch {
    json = null;
  }

  if (response.ok && json?.success) {
    return json.data as T;
  }

  if (response.status === 413 || /413|payload too large/i.test(text)) {
    throw new Error('O pacote excede um dos limites seguros de upload.');
  }

  if (response.ok && !json) {
    throw new Error('Resposta inválida do servidor.');
  }

  throw new Error(safeLmsResponseErrorText(json?.error ?? text, response.status));
}

function isRetryableUploadResponse(response: Response) {
  return response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
}

function isRetryableUploadError(error: unknown) {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
  return /failed to fetch|networkerror|network request failed|load failed/i.test(error.message);
}

function waitForRetry(attempt: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, STRUCTURED_UPLOAD_RETRY_BASE_MS * attempt);
  });
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
    return { files, packageBytes, totalBytes, launchFile, scormVersao: parseScormVersion(manifestXml), tipoH5p: null, packageHash };
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
  return { files, packageBytes, totalBytes, launchFile: null, scormVersao: null, tipoH5p, packageHash };
}

function buildIdempotencyKey(tipoConteudo: UploadTipoConteudo, packageHash: string) {
  return `${tipoConteudo}:${packageHash}`;
}

type ScormGateSection = { status?: string; errors?: string[] };
type ScormQualityShape = {
  packageId?: string;
  status?: string;
  publishable?: boolean;
  structural?: ScormGateSection;
  completionManifest?: ScormGateSection;
  diagnostics?: ScormGateSection;
  conformance?: ScormGateSection;
  runtime?: { status?: string; errors?: string[] };
};

function collectGateErrors(quality: ScormQualityShape): string[] {
  const sections: Array<ScormGateSection | undefined> = [
    quality.structural,
    quality.completionManifest,
    quality.diagnostics,
    quality.conformance,
  ];
  const errs = sections.flatMap((section) => section?.errors ?? []);
  errs.push(...(quality.runtime?.errors ?? []));
  return [...new Set(errs.filter((entry) => typeof entry === 'string' && entry.trim()))];
}

function scormGateError(prefix: string, quality: ScormQualityShape): Error {
  const detail = collectGateErrors(quality).join('; ');
  return new Error(detail ? `${prefix}: ${detail}` : prefix);
}

/**
 * SCORM "Substituir conteúdo" — o único botão executa internamente o fluxo
 * governado oficial de versão de pacote:
 *   1. POST /scorm-upload            (ZIP inteiro; SHA-256 exato certificado no backend)
 *   2. static Quality Gate embutido na resposta do passo 1
 *   3. POST /scorm-package-versions/:packageId/conformance   (validação no player real)
 *   4. POST /scorm-package-versions/:packageId/activate      (troca atômica do ponteiro do curso)
 * Em qualquer falha de gate o pacote ATIVO anterior permanece intacto — nenhum
 * dos passos acima toca o curso até o activate. O antigo content-upload/init
 * arquivo-a-arquivo continua desativado para SCORM (não certifica o SHA do ZIP).
 */
async function uploadScormZipPackage(params: {
  cursoId: number;
  file: File;
  prepared: PreparedPackage;
  skipPurge?: boolean;
  onProgress?: (pct: number) => void;
  onStatus?: (status: string) => void;
}) {
  const { cursoId, file, prepared, skipPurge, onProgress, onStatus } = params;

  onStatus?.('Enviando ZIP...');
  onProgress?.(25);
  const formData = new FormData();
  const zipBlob = new Blob([prepared.packageBytes], { type: 'application/zip' });
  formData.append('arquivo', zipBlob, file.name?.trim() || 'scorm-package.zip');
  const uploadResponse = await fetchWithAuth(
    `/api/lms/cursos/${cursoId}/scorm-upload${skipPurge ? '?skip_purge=true' : ''}`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': buildIdempotencyKey('scorm', prepared.packageHash) },
      body: formData,
    },
  );
  const candidate = await parseApiResponse<ScormQualityShape & { r2Prefix?: string; launchFile?: string }>(
    uploadResponse,
  );
  const packageId = candidate.packageId;
  if (!packageId) throw new Error('Quality Gate não retornou um identificador de pacote.');

  onStatus?.('Executando Quality Gate...');
  onProgress?.(45);
  if (candidate.status === 'REJECTED') {
    // Pacote ativo anterior segue inalterado.
    throw scormGateError('O pacote foi rejeitado no Quality Gate estático', candidate);
  }

  // O backend deduplica por SHA-256: reenviar o ZIP idêntico ao que já está
  // ATIVO retorna o pacote existente com status ACTIVE. Ele já é o conteúdo
  // vivo — conformance/activate rejeitariam (409) um pacote nesse estado.
  if (candidate.status === 'ACTIVE') {
    onProgress?.(100);
    onStatus?.('Este pacote já é o conteúdo ativo do curso.');
    return {
      filesUploaded: prepared.files.length,
      prefix: typeof candidate.r2Prefix === 'string' ? candidate.r2Prefix : null,
      launchFile: typeof candidate.launchFile === 'string' ? candidate.launchFile : prepared.launchFile,
      scormVersao: prepared.scormVersao,
      tipoH5p: null,
    };
  }

  onStatus?.('Executando validação do player...');
  onProgress?.(65);
  const conformanceResponse = await fetchWithAuth(
    `/api/lms/cursos/${cursoId}/scorm-package-versions/${packageId}/conformance`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  const conformance = await parseApiResponse<ScormQualityShape>(conformanceResponse);
  if (!conformance.publishable) {
    // Pacote ativo anterior segue inalterado.
    throw scormGateError('O pacote não passou na validação de conformidade do player', conformance);
  }

  onStatus?.('Ativando nova versão...');
  onProgress?.(85);
  const activateResponse = await fetchWithAuth(
    `/api/lms/cursos/${cursoId}/scorm-package-versions/${packageId}/activate`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  const activated = await parseApiResponse<{
    r2Prefix?: string;
    launchFile?: string;
    scorm_versao?: string;
  }>(activateResponse);

  onProgress?.(100);
  onStatus?.('Conteúdo substituído com sucesso.');
  return {
    filesUploaded: prepared.files.length,
    prefix: typeof activated.r2Prefix === 'string' ? activated.r2Prefix : null,
    launchFile:
      typeof activated.launchFile === 'string' ? activated.launchFile : prepared.launchFile,
    scormVersao: (typeof activated.scorm_versao === 'string'
      ? activated.scorm_versao
      : prepared.scormVersao) as ScormVersao,
    tipoH5p: null,
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
  const { cursoId, tipoConteudo, file, skipPurge, onProgress, onStatus } = params;
  onStatus?.('Validando pacote...');
  onProgress?.(10);
  const prepared = await preparePackageUpload(file, tipoConteudo);

  // SCORM: o backend desativou deliberadamente o protocolo arquivo-a-arquivo
  // (content-upload/init) porque ele não certifica o SHA-256 exato do ZIP.
  // Rotear pelo fluxo governado de versão de pacote. H5P mantém o protocolo atual.
  if (tipoConteudo === 'scorm') {
    return uploadScormZipPackage({ cursoId, file, prepared, skipPurge, onProgress, onStatus });
  }

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
    uploaded_files?: UploadedFileSnapshot[];
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

  const uploadedFileSizes = new Map(
    (init.uploaded_files ?? []).map((entry) => [entry.path, entry.size] as const),
  );
  let uploadedBytes = 0;
  let completedFiles = 0;
  const pendingFiles = prepared.files.filter((entry) => {
    if (uploadedFileSizes.get(entry.path) !== entry.size) return true;
    uploadedBytes += entry.size;
    completedFiles += 1;
    return false;
  });

  if (completedFiles > 0) {
    onStatus?.(`Retomando upload: ${completedFiles} de ${prepared.files.length} arquivos já enviados.`);
    onProgress?.(Math.min(18 + Math.round((uploadedBytes / prepared.totalBytes) * 72), 92));
  }

  async function uploadEntry(entry: PreparedFile) {
    const query = new URLSearchParams({ tipo_conteudo: tipoConteudo, upload_id: init.upload_id, path: entry.path });
    const endpoint = `/api/lms/cursos/${cursoId}/content-upload/file?${query}`;

    for (let attempt = 1; attempt <= STRUCTURED_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetchWithAuth(endpoint, {
          method: 'POST', headers: { 'Content-Type': entry.mimeType }, body: entry.bytes,
        });
        if (response.ok) {
          await parseApiResponse(response);
          uploadedBytes += entry.size;
          completedFiles += 1;
          onStatus?.(`Enviando arquivo ${completedFiles} de ${prepared.files.length}...`);
          onProgress?.(Math.min(18 + Math.round((uploadedBytes / prepared.totalBytes) * 72), 92));
          return;
        }
        if (!isRetryableUploadResponse(response) || attempt === STRUCTURED_UPLOAD_MAX_ATTEMPTS) {
          await parseApiResponse(response);
        }
      } catch (error) {
        if (!isRetryableUploadError(error) || attempt === STRUCTURED_UPLOAD_MAX_ATTEMPTS) {
          throw error;
        }
      }

      onStatus?.(
        `Falha transitória ao enviar ${entry.path}. Tentando novamente (${attempt + 1}/${STRUCTURED_UPLOAD_MAX_ATTEMPTS})...`,
      );
      await waitForRetry(attempt);
    }

    throw new Error(`Falha ao enviar ${entry.path}`);
  }

  for (let index = 0; index < pendingFiles.length;) {
    const first = pendingFiles[index]!;
    const batch = first.size >= STRUCTURED_UPLOAD_SHARED_BATCH_MAX_BYTES
      ? [first]
      : pendingFiles
        .slice(index, index + STRUCTURED_UPLOAD_CONCURRENCY)
        .filter((entry) => entry.size < STRUCTURED_UPLOAD_SHARED_BATCH_MAX_BYTES);
    await Promise.all(batch.map(uploadEntry));
    index += batch.length;
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

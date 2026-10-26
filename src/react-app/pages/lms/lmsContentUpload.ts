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

/**
 * The Replace Content button is a publication workflow, not the governed
 * staging intake. Never POST a private/non-publishable F5 ZIP from this UI.
 * The Worker still enforces independent certification and activation.
 */
function assertScormReplacementCandidate(prepared: PreparedPackage) {
  const manifest = prepared.files.find(file =>
    file.path.toLowerCase() === 'airtrust-completion-manifest.json');
  if (!manifest) return; // Server-side static quality gate remains authoritative.
  let contract: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(strFromU8(manifest.bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    contract = parsed as Record<string, unknown>;
  } catch {
    return; // The Worker rejects malformed authoring contracts.
  }
  const release = contract.release && typeof contract.release === 'object'
    ? contract.release as Record<string, unknown> : null;
  const assessment = contract.assessment && typeof contract.assessment === 'object'
    ? contract.assessment as Record<string, unknown> : null;
  const releaseStatus = typeof release?.status === 'string'
    ? release.status.trim().toUpperCase() : '';
  // R5 authoring uses more than one immutable private-candidate marker.
  // The "Substituir conteúdo" button eventually activates a package, so
  // every private/non-activatable edition must be rejected before network I/O.
  if (releaseStatus.startsWith('PRIVATE_') ||
      releaseStatus.includes('DO_NOT_ACTIVATE') ||
      assessment?.mode === 'EXTERNAL') {
    throw new Error(
      'Este SCORM exige aprovação editorial e prova externa independente ou está marcado NÃO ATIVAR. ' +
      'A substituição foi bloqueada antes do upload; o conteúdo ativo permanece inalterado. ' +
      'Use somente o fluxo governado de homologação em staging.',
    );
  }
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
  functionalCertification?: { status?: string; missing?: string[] };
  runtime?: { status?: string; errors?: string[]; failureStage?: string; failureCategory?: string; failureCode?: string };
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
  // Browser Rendering returns only sanitized infrastructure diagnostics.
  // Never interpolate arbitrary exception details, URLs, tokens or ZIP text.
  if (quality.runtime?.errors?.includes('SCORM_BROWSER_INFRASTRUCTURE_ERROR')) {
    const allowed = [
      new Set(['BINDING_MISSING', 'BROWSER_LAUNCH', 'CREATE_PAGE',
        'SET_REQUEST_INTERCEPTION', 'LOAD_SCO_ASSETS', 'VERIFY_SCORM_INITIALIZATION', 'DRIVE_SCO_INTERACTIONS',
        'CLOSE_SCO_SESSION', 'READ_SCORM_TRACE']),
      new Set(['BROWSER_QUOTA', 'BROWSER_ACCESS', 'BROWSER_SERVICE',
        'BROWSER_TIMEOUT', 'BROWSER_CONNECTION', 'BROWSER_OTHER']),
      new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND',
        'EAI_AGAIN', 'ERR_CONNECTION_CLOSED', 'ERR_HTTP2_STREAM_ERROR',
        'TYPE_ERROR', 'TIMEOUT_ERROR', 'ABORT_ERROR', 'PROTOCOL_ERROR',
        'GENERIC_ERROR', 'UNKNOWN_ERROR']),
    ];
    const diagnostic = [quality.runtime.failureStage,
      quality.runtime.failureCategory, quality.runtime.failureCode]
      .map((value, index) => typeof value === 'string' && allowed[index]!.has(value)
        ? value : null).filter(Boolean);
    if (diagnostic.length) errs.push(`Diagnóstico seguro do navegador: ${diagnostic.join(' / ')}`);
  }
  // Functional E2E is independent of SCORM protocol conformance. Report
  // missing browser scenarios rather than a misleading generic player error.
  errs.push(...(quality.functionalCertification?.missing ?? [])
    .filter((entry) => typeof entry === 'string' && /^[A-Z][A-Z0-9_:]{0,100}$/.test(entry))
    .slice(0, 24).map((entry) => `Certificação funcional pendente: ${entry}`));
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
  assertScormReplacementCandidate(prepared);

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
    // Static/protocol success is NOT certification. Preserve the currently
    // active ZIP until independent Chromium/WebKit and backend proof exists.
    const technicalPass = conformance.conformance?.status === 'PASS';
    const functionalPending = conformance.functionalCertification?.status !== 'CERTIFIED';
    const infrastructureFailure = conformance.runtime?.errors?.includes('SCORM_BROWSER_INFRASTRUCTURE_ERROR') === true;
    // An infrastructure timeout is inconclusive: it is not a bad ZIP and
    // must never trigger automatic retries, approval or an active switch.
    const prefix = infrastructureFailure
      ? 'O ZIP foi recebido como candidato inativo, mas a infraestrutura de navegação do Quality Gate falhou. A certificação não foi executada e o conteúdo atual foi preservado'
      : technicalPass && functionalPending
        ? 'O pacote passou na conformidade técnica, mas aguarda certificação funcional independente em staging. O conteúdo ativo foi preservado'
        : 'O pacote não passou na validação de conformidade do player; o conteúdo ativo foi preservado';
    throw scormGateError(prefix, conformance);
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

/**
 * F5 operator upload of a single inactive SCORM edition in the staging UI.
 * Uses the *existing* staging-only R2 multipart protocol. The Worker validates
 * a fresh, exact runtime/tenant/course/package-SHA/byte grant on init/parts/
 * completion. This client never calls conformance or activation and never
 * changes lms_cursos or any learner/certificate state.
 */
export async function uploadScormF5InactiveStaging(params: {
  cursoId: number;
  file: File;
  onProgress?: (pct: number) => void;
  onStatus?: (status: string) => void;
}): Promise<{ packageId: string; packageSha256: string; status: 'VALIDATED'; zipBytes: number }> {
  const { cursoId, file, onProgress, onStatus } = params;
  if (window.location.hostname !== 'staging.airtrust.pages.dev') {
    throw new Error('Envio de candidato F5 disponível somente no staging.');
  }
  if (!Number.isSafeInteger(cursoId) || cursoId < 1 || !file.name.toLowerCase().endsWith('.zip')) {
    throw new Error('Selecione um curso existente e seu arquivo SCORM .zip.');
  }
  onStatus?.('Calculando SHA-256 do ZIP original...');
  const packageBytes = new Uint8Array(await file.arrayBuffer());
  if (packageBytes.byteLength < 22 || packageBytes.byteLength > 80 * 1024 * 1024) {
    throw new Error('O ZIP F5 deve ter entre 22 bytes e 80 MiB.');
  }
  const digest = await crypto.subtle.digest('SHA-256', packageBytes);
  const packageSha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const operationId = crypto.randomUUID();
  const base = `/api/lms/cursos/${cursoId}/scorm-upload/streamed`;
  let initialized = false;
  let completeStarted = false;
  try {
    onStatus?.('Validando autorização individual de staging...');
    const initResponse = await fetchWithAuth(`${base}/init`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation_id: operationId, expected_sha256: packageSha256,
        zip_bytes: packageBytes.byteLength, arquivo_nome: file.name,
      }),
    });
    const init = await parseApiResponse<{ operationId: string; partBytes: number; partCount: number }>(initResponse);
    if (init.operationId !== operationId ||
        !Number.isSafeInteger(init.partBytes) || init.partBytes < 1 ||
        init.partBytes > 8 * 1024 * 1024 ||
        init.partCount !== Math.ceil(packageBytes.byteLength / init.partBytes)) {
      throw new Error('Protocolo de intake F5 retornou tamanho/escopo inesperado.');
    }
    initialized = true;
    for (let part = 1; part <= init.partCount; part += 1) {
      const start = (part - 1) * init.partBytes;
      const end = Math.min(start + init.partBytes, packageBytes.byteLength);
      const chunk = new Blob([new Uint8Array(packageBytes.slice(start, end))], {
        type: 'application/octet-stream',
      });
      onStatus?.(`Enviando parte ${part} de ${init.partCount} (candidato inativo)...`);
      const response = await fetchWithAuth(`${base}/${operationId}/parts/${part}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: chunk,
      });
      const receipt = await parseApiResponse<{ partNumber: number; bytes: number }>(response);
      if (receipt.partNumber !== part || receipt.bytes !== end - start) {
        throw new Error('Recibo de parte SCORM F5 não corresponde aos bytes enviados.');
      }
      onProgress?.(Math.round(80 * part / init.partCount));
    }
    completeStarted = true;
    onStatus?.('Verificando ZIP e criando somente a versão candidata inativa...');
    const response = await fetchWithAuth(`${base}/${operationId}/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    const candidate = await parseApiResponse<{
      packageId?: string; packageSha256?: string; status?: string; zipBytes?: number;
    }>(response);
    if (!candidate.packageId || candidate.packageSha256 !== packageSha256 ||
        candidate.status !== 'VALIDATED' || candidate.zipBytes !== packageBytes.byteLength) {
      throw new Error('Candidato F5 sem confirmação íntegra de SHA/bytes/estado pelo Worker.');
    }
    onProgress?.(100);
    onStatus?.('Candidato F5 armazenado INATIVO no staging. Não houve publicação.');
    return {
      packageId: candidate.packageId, packageSha256,
      status: 'VALIDATED', zipBytes: packageBytes.byteLength,
    };
  } catch (error) {
    // Before complete, the granted abort endpoint releases only the isolated
    // intake. A lost completion response must NOT delete an already-created
    // candidate; the separate Worker status/readback endpoint resolves it.
    if (initialized && !completeStarted) {
      await fetchWithAuth(`${base}/${operationId}/abort`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      }).catch(() => undefined);
    }
    throw error;
  }
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

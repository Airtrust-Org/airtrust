/**
 * Browser-local Native course-review fast lane, staging only.
 *
 * This is NOT publication, enrollment, grade, certificate or R2 upload.
 * The signed private review ZIP never leaves the browser. Its private
 * answer keys are stripped before handing the learner projection to the player.
 */
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { unzip, type Unzipped } from 'fflate';
import NativeCoursePreview from './native/NativeCoursePreview';
import { useLmsCursos } from '@/react-app/hooks/useLms';
import {
  toNativeLearnerCourse,
  validateNativeCourseArtifact,
  type NativeAsset,
  type NativeLearnerCourse,
} from '../../../../worker-airtrust/src/lib/lms/lms-native-course-contract';

const EXPECTED_REVIEW_ARCHIVE_SHA256 = '559cecb9b90bea8c942f813ac2fffca34d70e4ae57f1f050fd95ca6d0446cf3c';
const EXPECTED_REVIEW_ARCHIVE_BYTES = 82101110;
const COURSE_JSON_SUFFIX = '/candidate/native-private-candidate.json';
const MEDIA_DIR_PART = '/draft/media/';
const REQUIRED_COURSES = 9;

type ReviewCourse = {
  folder: string;
  learner: NativeLearnerCourse;
};
type ReviewLibrary = {
  courses: ReviewCourse[];
  media: Unzipped;
};

export function isNativeReviewStagingHost(hostname: string): boolean {
  return hostname === 'staging.airtrust.pages.dev' ||
    (import.meta.env.DEV && (hostname === 'localhost' || hostname === '127.0.0.1'));
}

export function canReadNativeReviewZipPath(path: string): boolean {
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0') ||
      path.split('/').includes('..') || path.split('/').some((part) => !part)) return false;
  return path.endsWith(COURSE_JSON_SUFFIX) || path.includes(MEDIA_DIR_PART);
}

function bytesHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  return bytesHex(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)));
}

/** Expected archive fingerprint is anchored to the reviewed private artifact. */
export async function loadPrivateNativeReviewArchive(file: File): Promise<ReviewLibrary> {
  if (file.size !== EXPECTED_REVIEW_ARCHIVE_BYTES || !file.name.toLowerCase().endsWith('.zip')) {
    throw new Error('Use o pacote privado de nove cursos Native destinado à homologação.');
  }
  const buffer = await file.arrayBuffer();
  if (await sha256(buffer) !== EXPECTED_REVIEW_ARCHIVE_SHA256) {
    throw new Error('A assinatura do pacote não corresponde à versão de revisão autorizada.');
  }
  const media = await new Promise<Unzipped>((resolve, reject) => {
    unzip(new Uint8Array(buffer), {
      filter: (entry) => canReadNativeReviewZipPath(entry.name),
    }, (error, files) => error ? reject(new Error('Falha ao abrir o ZIP de revisão.')) : resolve(files));
  });
  const jsonPaths = Object.keys(media).filter((path) => path.endsWith(COURSE_JSON_SUFFIX));
  if (jsonPaths.length !== REQUIRED_COURSES) {
    throw new Error('O ZIP não contém os nove cursos esperados.');
  }
  const seenIds = new Set<string>();
  const courses = jsonPaths.map((path) => {
    const folder = path.slice(0, -COURSE_JSON_SUFFIX.length);
    if (!folder || folder.includes('/')) throw new Error('Identificação inválida do curso Native.');
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(media[path]));
    const privateCandidate = validateNativeCourseArtifact(parsed);
    if (seenIds.has(privateCandidate.courseId)) throw new Error('Curso duplicado no pacote.');
    seenIds.add(privateCandidate.courseId);
    // Never propagate answer keys to the preview component.
    const learner = toNativeLearnerCourse(privateCandidate);
    if (!learner.units.length || learner.questions.some((q) =>
      'correctOptionId' in q || 'feedbackCorrect' in q || 'feedbackIncorrect' in q
    )) throw new Error('Projeção do aluno inválida para homologação.');
    for (const asset of learner.assets) {
      if (!media[folder + MEDIA_DIR_PART + asset.path]) {
        throw new Error('Mídia obrigatória ausente do curso Native.');
      }
    }
    return { folder, learner };
  });
  return { media, courses };
}

export async function privateNativeReviewMedia(
  library: ReviewLibrary, folder: string, asset: NativeAsset, signal: AbortSignal,
): Promise<Blob> {
  if (signal.aborted) throw new Error('ABORTED');
  const course = library.courses.find((entry) => entry.folder === folder);
  if (!course || !course.learner.assets.some((a) => (
    a.id === asset.id && a.sha256 === asset.sha256 && a.path === asset.path && a.mime === asset.mime
  ))) throw new Error('NATIVE_REVIEW_ASSET_NOT_AUTHORIZED');
  const bytes = library.media[folder + MEDIA_DIR_PART + asset.path];
  if (!bytes) throw new Error('NATIVE_REVIEW_ASSET_MISSING');
  if (await sha256(bytes.slice().buffer as ArrayBuffer) !== asset.sha256) {
    throw new Error('NATIVE_REVIEW_ASSET_DIGEST_MISMATCH');
  }
  if (signal.aborted) throw new Error('ABORTED');
  return new Blob([Uint8Array.from(bytes) as BlobPart], { type: asset.mime });
}

/** Read-only staging chooser: never reinterpret a Native candidate as a SCORM package. */
export function isReviewableLegacyScorm(course: {
  tipo_conteudo: string;
  scorm_package_r2_prefix?: string | null;
  ativo?: number | null;
}): boolean {
  return course.tipo_conteudo === 'scorm' &&
    Boolean(course.scorm_package_r2_prefix) && course.ativo === 1;
}

export default function NativeReviewZipPilot() {
  const [library, setLibrary] = useState<ReviewLibrary | null>(null);
  const [format, setFormat] = useState<'scorm' | 'native'>('scorm');
  const { data: existingCourses, isLoading: scormLoading, isError: scormError } = useLmsCursos(
    { limit: 250 }, { enabled: format === 'scorm' && isNativeReviewStagingHost(window.location.hostname) },
  );
  const scormCourses = existingCourses?.data.filter(isReviewableLegacyScorm) ?? [];
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = library?.courses.find((course) => course.folder === active) ?? null;
  const getAsset = useCallback((asset: NativeAsset, signal: AbortSignal) => {
    if (!library || !current) return Promise.reject(new Error('NATIVE_REVIEW_NO_COURSE'));
    return privateNativeReviewMedia(library, current.folder, asset, signal);
  }, [library, current]);

  async function importZip(file: File | undefined) {
    if (!file) return;
    setLoading(true);
    setActive(null);
    setLibrary(null);
    setError(null);
    try {
      setLibrary(await loadPrivateNativeReviewArchive(file));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'O pacote não pôde ser validado.');
    } finally {
      setLoading(false);
    }
  }

  if (!isNativeReviewStagingHost(window.location.hostname)) {
    return <main role="alert" className="p-8">Revisão Native disponível somente no staging.</main>;
  }

  return (
    <main className="min-h-screen bg-[#f1f5f8] px-4 py-7 text-[#122b41] md:px-8">
      <div className="mx-auto max-w-[1520px]">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-[#e65300]">AirTrust Staging • Homologação</p>
            <h1 className="text-2xl font-extrabold">Player de cursos — homologação SCORM e Native</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              Abra os SCORM originais já armazenados no catálogo de staging ou compare com os
              nove cursos convertidos para Native. A prévia administrativa não registra
              matrícula, desempenho, aprovação ou certificado.
            </p>
          </div>
          <Link to="/lms/cursos" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold">
            Voltar ao catálogo
          </Link>
        </header>
        <nav aria-label="Formato do curso para homologação" className="mb-5 flex flex-wrap gap-3">
          <button type="button" aria-pressed={format === 'scorm'} onClick={() => { setFormat('scorm'); setActive(null); }}
            className={'rounded-xl border px-5 py-3 text-sm font-bold ' + (format === 'scorm'
              ? 'border-[#e65300] bg-[#fff2e9] text-[#9c490f]' : 'border-slate-300 bg-white text-[#123b5e]')}>
            SCORM original — player legado
          </button>
          <button type="button" aria-pressed={format === 'native'} onClick={() => setFormat('native')}
            className={'rounded-xl border px-5 py-3 text-sm font-bold ' + (format === 'native'
              ? 'border-[#e65300] bg-[#fff2e9] text-[#9c490f]' : 'border-slate-300 bg-white text-[#123b5e]')}>
            Native — nove cursos convertidos
          </button>
        </nav>
        {format === 'scorm' && (
          <section aria-label="Cursos SCORM existentes no staging" className="mb-5 rounded-xl border border-[#cddce6] bg-white p-5">
            <h2 className="text-lg font-extrabold">Cursos SCORM no catálogo atual</h2>
            <p className="mt-2 text-sm text-slate-600">
              Estes cursos usam o player SCORM original e seus arquivos privados autenticados.
              É a referência visual para revisar a conversão Native, sem alteração do conteúdo.
            </p>
            {scormLoading && <p role="status" className="mt-3 text-sm">Carregando cursos SCORM...</p>}
            {scormError && <p role="alert" className="mt-3 text-sm text-red-700">
              Não foi possível consultar os cursos com a sessão atual. Confira a empresa ativa e as permissões.
            </p>}
            {!scormLoading && !scormError && scormCourses.length === 0 && <p className="mt-3 text-sm text-slate-600">
              Nenhum pacote SCORM acessível no contexto atual. Selecione a empresa que contém os cursos.
            </p>}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {scormCourses.map((curso) => (
                <Link key={curso.id} to={`/lms/player/preview/${curso.id}`}
                  state={{ from: '/lms/native/revisao' }}
                  className="rounded-xl border border-[#d8e3ec] bg-[#f8fafc] p-4 text-left hover:border-[#e65300] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e65300]">
                  <span className="text-xs font-extrabold uppercase text-[#123b5e]">SCORM {curso.scorm_versao || ''} · Original</span>
                  <h3 className="mt-2 text-base font-extrabold text-[#10243d]">{curso.titulo}</h3>
                  <span className="mt-2 inline-block text-sm font-semibold text-[#ce5000]">Abrir no player SCORM →</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {format === 'native' && <>
        <section className="mb-5 rounded-xl border border-[#cddce6] bg-white p-5">
          <label htmlFor="native-private-zip" className="block text-base font-bold">Pacote Native privado dos nove cursos convertidos</label>
          <p className="mt-1 text-sm text-slate-600">
            O Native ainda depende deste ZIP privado enquanto a integração D1/R2 governada não estiver pronta. Ele é verificado pelo SHA-256 e permanece
            apenas na memória desta aba. Nenhum gabarito é exibido no player.
          </p>
          <input id="native-private-zip" type="file" accept=".zip,application/zip"
            className="mt-3 w-full max-w-lg text-sm" disabled={loading}
            onChange={(event) => void importZip(event.target.files?.[0])} />
          {loading && <p role="status" className="mt-3 text-sm font-semibold">Validando e preparando o player...</p>}
          {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
        </section>
        {library && <section aria-label="Nove cursos Native para revisar" className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {library.courses.map(({ folder, learner }) => (
            <button type="button" key={folder} onClick={() => setActive(folder)}
              aria-pressed={active === folder}
              className={'rounded-xl border p-4 text-left shadow-sm ' +
                (active === folder ? 'border-[#e65300] bg-[#fff3e9]' : 'border-[#d8e3ec] bg-white hover:border-[#e65300]')}>
              <span className="text-xs font-extrabold uppercase text-[#ce5000]">Native • Revisão</span>
              <h2 className="mt-1 text-base font-extrabold">{learner.title}</h2>
              <p className="mt-2 text-xs text-slate-600">
                {learner.units.length} unidades • {learner.questions.length} questões
              </p>
              <span className="mt-2 inline-block text-sm font-semibold">Abrir player →</span>
            </button>
          ))}
        </section>}
        {current && <NativeCoursePreview key={current.learner.courseId}
          course={current.learner} resolveAssetHref={() => null} fetchAuthorizedAsset={getAsset}/>}
        </>}
      </div>
    </main>
  );
}

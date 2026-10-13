import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen, Check, ChevronLeft, ChevronRight, List, Menu, X,
} from 'lucide-react';
import type {
  NativeAsset,
  NativeBlock,
  NativeLearnerCourse,
} from '../../../../../worker-airtrust/src/lib/lms/lms-native-course-contract';

type PreviewProps = {
  course: NativeLearnerCourse;
  /** Only an authenticated, same-origin LMS media route may be rendered. */
  resolveAssetHref: (asset: NativeAsset) => string | null;
  fetchAuthorizedAsset?: (asset: NativeAsset, signal: AbortSignal) => Promise<Blob>;
  initialUnitId?: string | null;
  serverSeenLessonIds?: readonly string[];
  onRecordLessonVisit?: (unitId: string) => void;
  onSubmitAssessment?: (answers: Array<{ questionId: string; optionId: string }>) => void;
  evidenceBusy?: boolean;
  /** Fill a dedicated review viewport instead of stacking under the course catalogue. */
  fullscreen?: boolean;
};

const TEMPLATE_VARIANTS = [
  'media-right', 'media-left', 'wide-top', 'wide-bottom',
  'image-overlay', 'banner-list', 'double-crop', 'editorial-dashboard',
] as const;
type NativeTemplate = typeof TEMPLATE_VARIANTS[number];

/**
 * Reusable across all source courses. This is visual navigation only, never
 * learner progress or an authoring/certification policy. Dense evaluations
 * retain an accessible internal scroll area instead of cropping questions.
 */
export function selectNativeLessonTemplate(index: number, unit: NativeLearnerCourse['units'][number]): NativeTemplate {
  const media = unit.blocks.filter((b) => b.type === 'image' || b.type === 'video');
  const textWeight = unit.title.length + unit.blocks.reduce((sum, b) => (
    sum + (b.type === 'heading' || b.type === 'paragraph' ? b.text.length :
      b.type === 'bullets' ? b.items.join(' ').length : 0)
  ), 0);
  if (!media.length) return 'editorial-dashboard';
  // Assessments and decisions must show the prompt/options before decorative media.
  // Keeping a wide hero above an activity pushes the actual question below the fold.
  if (unit.kind === 'scenario' || unit.kind === 'assessment') return 'media-right';
  const selected = unit.presentationTemplate ?? TEMPLATE_VARIANTS[index % TEMPLATE_VARIANTS.length];
  if (selected === 'double-crop' && media[0].type === 'video') return 'media-right';
  if (textWeight > 850 && ['wide-top', 'wide-bottom', 'image-overlay', 'banner-list'].includes(selected)) {
    return 'media-right';
  }
  return selected;
}

function safeLmsAssetUrl(url: string | null): string | null {
  if (!url || !url.startsWith('/api/lms/') || url.includes('\\') ||
      /[%?#]/.test(url) || url.split('/').includes('..')) return null;
  return url;
}

/** Load protected media as a Blob, revoking object URLs after use. Never publish R2 URLs. */
function ProtectedNativeMedia({ asset, type, alt, stacked = false, fetchAsset }: {
  asset: NativeAsset;
  type: 'image' | 'video';
  alt: string;
  stacked?: boolean;
  fetchAsset: (asset: NativeAsset, signal: AbortSignal) => Promise<Blob>;
}) {
  const [href, setHref] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setHref(null);
    setFailed(false);
    void fetchAsset(asset, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      if (blob.type !== asset.mime) throw new Error('NATIVE_ASSET_MIME_CONFLICT');
      objectUrl = URL.createObjectURL(blob);
      setHref(objectUrl);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset, fetchAsset]);

  if (!href) {
    return (
      <div role="status" className="flex min-h-[120px] items-center justify-center rounded-xl bg-slate-100 p-6 text-center text-sm font-medium text-slate-600">
        {failed ? 'Mídia indisponível' : 'Carregando mídia'}: {alt}
      </div>
    );
  }
  if (type === 'image' && stacked) return (
    <div className="grid h-full w-full min-h-0 grid-rows-2 gap-2">
      <img src={href} alt={alt} className="h-full min-h-0 w-full object-cover object-center" />
      <img src={href} alt="" aria-hidden="true" className="h-full min-h-0 w-full object-cover object-bottom" />
    </div>
  );
  return type === 'image'
    ? <img src={href} alt={alt} className="h-full w-full object-cover" />
    : <video src={href} controls preload="metadata" className="h-full w-full object-contain" aria-label={alt} />;
}

/**
 * Native V1 player.
 *
 * Keeps the original SCORM visual hierarchy (full-bleed training visual,
 * generous lesson typography, compact course drawer and anchored navigation)
 * while retaining Native's server-owned evidence and protected-media boundary.
 * Navigation position is deliberately NOT presented as completion percentage.
 */
export default function NativeCoursePreview({
  course, resolveAssetHref, fetchAuthorizedAsset, initialUnitId,
  serverSeenLessonIds, onRecordLessonVisit, onSubmitAssessment, evidenceBusy = false,
  fullscreen = false,
}: PreviewProps) {
  const [unitIndex, setUnitIndex] = useState(() => {
    const index = initialUnitId ? course.units.findIndex((u) => u.id === initialUnitId) : -1;
    return index >= 0 ? index : 0;
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});

  useEffect(() => {
    const index = initialUnitId ? course.units.findIndex((u) => u.id === initialUnitId) : -1;
    setUnitIndex(index >= 0 ? index : 0);
    setChoices({});
    setMenuOpen(false);
  }, [course.courseId, course.packageVersion, course.units, initialUnitId]);

  const assets = useMemo(() => new Map(course.assets.map((a) => [a.id, a])), [course.assets]);
  const questionMap = useMemo(() => new Map(course.questions.map((q) => [q.id, q])), [course.questions]);
  const unit = course.units[unitIndex];

  if (!unit) return <p role="alert">Este curso não possui unidades disponíveis.</p>;

  const mediaBlocks = unit.blocks.filter((block) => block.type === 'image' || block.type === 'video');
  const contentBlocks = unit.blocks.filter((block) => block.type !== 'image' && block.type !== 'video');
  const isActivity = unit.kind === 'scenario' || unit.kind === 'assessment';
  const template = selectNativeLessonTemplate(unitIndex, unit);
  const vertical = template === 'wide-top' || template === 'wide-bottom' || template === 'banner-list';
  const reversed = template === 'media-left' || template === 'editorial-dashboard';
  const stacked = template === 'double-crop';
  const overlay = template === 'image-overlay';
  const hasMedia = mediaBlocks.length > 0;
  const layoutClass = !hasMedia ? 'flex min-h-0 flex-col' : overlay
    ? 'relative flex min-h-0 flex-col lg:block'
    : vertical ? (template === 'wide-bottom'
      ? 'flex min-h-0 flex-col gap-3'
      : 'flex min-h-0 flex-col-reverse gap-3')
    : 'grid min-h-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-5';
  const textClass = 'min-h-0 min-w-0 space-y-3 overflow-y-auto overscroll-contain ' +
    (vertical ? 'lg:flex-1' : 'lg:h-full') +
    (reversed ? ' lg:order-2' : ' lg:order-1') +
    (overlay ? ' relative z-10 rounded-xl bg-white/95 p-4 shadow-xl lg:my-4 lg:ml-5 lg:w-[56%] lg:max-h-[calc(100%-32px)] lg:p-5' : '') +
    (template === 'banner-list' && !isActivity ? ' lg:pr-1' : '');
  const imageClass = 'min-h-0 min-w-0 overflow-hidden ' +
    (vertical ? 'h-[min(22vh,160px)] shrink-0' : 'h-[min(30vh,220px)] lg:h-[min(46vh,320px)] lg:self-start') +
    (reversed ? ' lg:order-1' : ' lg:order-2') +
    (overlay ? ' lg:absolute lg:inset-0 lg:h-full' : '');

  const unitLabel = unit.kind === 'lesson' ? 'CONTEÚDO DO TREINAMENTO'
    : unit.kind === 'scenario' ? 'DECISÃO OPERACIONAL' : 'AVALIAÇÃO';
  const navigationProgress = ((unitIndex + 1) / course.units.length) * 100;

  function navigateTo(index: number) {
    setUnitIndex(Math.max(0, Math.min(index, course.units.length - 1)));
    setMenuOpen(false);
  }

  function mediaFrame(block: Extract<NativeBlock, { type: 'image' | 'video' }>, index: number) {
    const asset = assets.get(block.assetId);
    const href = asset && !fetchAuthorizedAsset ? safeLmsAssetUrl(resolveAssetHref(asset)) : null;
    const missing = !asset || (!fetchAuthorizedAsset && !href);
    return (
      <figure key={index} className={'relative isolate flex h-full min-h-[120px] w-full flex-1 overflow-hidden rounded-xl bg-[#102c43] shadow-[0_18px_44px_rgba(8,27,48,0.15)] ' +
        (template === 'media-right' || template === 'media-left'
          ? 'lg:[clip-path:polygon(8%_0,100%_0,100%_100%,0_100%)]' : '')}>
        {missing ? (
          <div role="status" className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-white">
            Mídia indisponível nesta visualização: {block.alt}
          </div>
        ) : fetchAuthorizedAsset && asset ? (
          <ProtectedNativeMedia
            asset={asset} type={block.type} alt={block.alt} stacked={stacked} fetchAsset={fetchAuthorizedAsset}
          />
        ) : block.type === 'image' ? (
          stacked ? <div className="grid h-full w-full grid-rows-2 gap-2">
            <img src={href!} alt={block.alt} className="h-full min-h-0 w-full object-cover" loading="lazy" />
            <img src={href!} alt="" aria-hidden="true" className="h-full min-h-0 w-full object-cover object-bottom" loading="lazy" />
          </div> : <img src={href!} alt={block.alt} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <video src={href!} controls preload="metadata" className="h-full w-full object-contain" aria-label={block.alt} />
        )}
        {block.type === 'image' && !missing && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#071b2f]/15 via-transparent to-transparent" />
        )}
        <figcaption className="sr-only">{block.alt}</figcaption>
      </figure>
    );
  }

  function renderTextBlock(block: NativeBlock, index: number) {
    if (block.type === 'heading') {
      return (
        <h3 key={index} className="border-l-[3px] border-[#e65300] pl-3 text-base font-bold leading-snug text-[#123b5e] sm:text-lg">
          {block.text}
        </h3>
      );
    }
    if (block.type === 'paragraph') {
      return <p key={index} className="whitespace-pre-line text-base leading-[1.5] text-[#344e64]">{block.text}</p>;
    }
    if (block.type === 'bullets') {
      return (
        <ul key={index} className={'grid gap-2 ' + (block.items.length >= 4 && block.items.every((item) => item.length <= 65) ? 'lg:grid-cols-2' : '')}>
          {block.items.map((item, i) => (
            <li key={i} className="flex break-inside-avoid items-start gap-2 rounded-lg border border-[#dce6ed] bg-[#f6f9fc] px-3 py-2 text-base leading-snug text-[#203c56]">
              <Check className="mt-1 h-4 w-4 shrink-0 text-[#e65300]" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    }
    return null;
  }

  return (
    <section data-testid="native-course-player-v2" aria-label="Prévia do curso nativo"
      className={'relative mx-auto flex flex-col overflow-hidden border border-[#d5e0e7] bg-white text-[#10243d] shadow-[0_12px_32px_rgba(8,27,48,0.10)] ' +
        (fullscreen ? 'h-full min-h-0 w-full max-w-none rounded-xl' :
          'h-[min(840px,calc(100dvh-24px))] min-h-[500px] w-full max-w-[1520px] rounded-[22px]')}>
      <header className="z-10 flex min-h-[60px] items-center gap-3 border-b border-[#dce5ed] bg-white px-3 sm:gap-4 sm:px-5">
        <button type="button" aria-label="Abrir menu de unidades" aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#dce5ed] text-[#123b5e] transition-colors hover:bg-[#eef4f8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e65300]">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {course.courseId.startsWith('costa-do-sol-') || course.courseId === 'SGSO' ? (
            <img src="/branding/costa-do-sol-scorm.svg" alt="Costa do Sol Táxi Aéreo"
              className="h-9 w-[110px] shrink-0 object-contain sm:w-[132px]" />
          ) : null}
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#e65300]">PLATAFORMA DE TREINAMENTO</p>
            <h1 className="truncate text-sm font-extrabold text-[#10243d] sm:text-base">{course.title}</h1>
          </div>
        </div>
        <div className="hidden min-w-[175px] flex-col gap-1.5 text-right sm:flex">
          <span className="text-xs font-bold text-[#536b82]">Unidade {unitIndex + 1} de {course.units.length}</span>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#e2ebf0]" role="progressbar"
            aria-label="Posição de navegação" aria-valuenow={unitIndex + 1}
            aria-valuemin={1} aria-valuemax={course.units.length}>
            <div className="h-full rounded-full bg-[#e65300] transition-all" style={{ width: navigationProgress + '%' }} />
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-[#f3d3b7] bg-[#fff5eb] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[#a84b0f]">
          Prévia
        </span>
      </header>

      {menuOpen && (
        <div className="absolute inset-0 z-30 flex" data-testid="native-course-drawer">
          <div role="presentation" className="absolute inset-0 bg-[#071b2f]/55" onClick={() => setMenuOpen(false)} />
          <aside className="relative z-10 flex h-full w-[min(390px,88vw)] flex-col bg-[#0b2740] text-white shadow-2xl"
            aria-label="Menu de unidades">
            <div className="flex items-start justify-between gap-4 border-b border-white/15 px-6 py-6">
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#ef9b6b]">CONTEÚDO DO CURSO</span>
                <p className="text-lg font-extrabold leading-snug">{course.title}</p>
                <p className="text-sm text-[#b9cada]">{course.units.length} unidades disponíveis</p>
              </div>
              <button type="button" aria-label="Fechar menu de unidades" onClick={() => setMenuOpen(false)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/20 hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav aria-label="Unidades do curso" className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
              {course.units.map((candidate, index) => (
                <button type="button" key={candidate.id}
                  aria-current={index === unitIndex ? 'step' : undefined}
                  onClick={() => navigateTo(index)}
                  className={
                    'flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors ' +
                    (index === unitIndex ? 'bg-[#e65300] font-bold text-white' : 'text-[#d7e3ee] hover:bg-white/10')
                  }>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/15 text-xs font-extrabold">{index + 1}</span>
                  <span className="min-w-0 leading-snug">{candidate.title}</span>
                </button>
              ))}
            </nav>
          </aside>
        </div>
      )}

      <main className="relative min-h-0 flex-1 overflow-y-auto bg-white lg:overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col px-4 py-3 sm:px-6 lg:px-7">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.13em] text-[#e65300]">
              <span className="h-px w-6 bg-[#e65300]" /> {unitLabel}
            </p>
            <span className="text-xs font-semibold text-[#6a8092]">Etapa {unitIndex + 1} / {course.units.length}</span>
          </div>
          <article data-native-template={template} aria-labelledby="native-preview-unit-title"
            className={'min-h-0 flex-1 ' + layoutClass}>
            <div className={textClass}>
              <h2 id="native-preview-unit-title"
                className={'max-w-[760px] font-extrabold leading-[1.12] tracking-[-0.025em] text-[#081b30] ' +
                  (unit.title.length > 76 ? 'text-[clamp(22px,2vw,28px)]' : 'text-[clamp(24px,2.3vw,34px)]')}>
                {unit.title}
              </h2>
              <div className="space-y-2.5">
                {contentBlocks.map(renderTextBlock)}
              </div>

              {isActivity && (
                <div className="space-y-3 pt-1">
                  {unit.questionIds.map((questionId, position) => {
                    const question = questionMap.get(questionId);
                    if (!question) return <p role="alert" key={questionId}>Questão indisponível</p>;
                    return (
                      <fieldset key={question.id} className="space-y-2 rounded-xl border border-[#dbe5ec] bg-[#f7fafc] p-3 sm:p-4">
                        <legend className={question.prompt.trim().toLocaleLowerCase() === unit.title.trim().toLocaleLowerCase()
                          ? 'sr-only'
                          : 'max-w-full px-1 pt-1 text-base font-bold leading-snug text-[#081b30]'}>
                          {question.prompt}
                        </legend>
                        <span className="block text-xs font-bold uppercase tracking-wide text-[#e65300]">
                          {unit.kind === 'scenario' ? 'Decisão do cenário' : 'Questão'} {position + 1}
                        </span>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                          {question.options.map((option, optionIndex) => (
                            <label key={option.id}
                              className={
                                'flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-colors focus-within:ring-2 focus-within:ring-[#e65300] ' +
                                (choices[question.id] === option.id
                                  ? 'border-[#e65300] bg-[#fff1e6] shadow-[0_0_0_1px_#e65300]'
                                  : 'border-[#d8e4ec] bg-white hover:border-[#e9a077]')
                              }>
                              <input type="radio" name={question.id} value={option.id} aria-label={option.text}
                                checked={choices[question.id] === option.id}
                                onChange={() => setChoices((current) => ({ ...current, [question.id]: option.id }))}
                                className="sr-only" />
                              <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#eaf1f5] text-xs font-extrabold text-[#123b5e]">
                                {String.fromCharCode(65 + optionIndex)}
                              </span>
                              <span className="text-base font-medium leading-snug text-[#203a53]">{option.text}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    );
                  })}
                </div>
              )}

              {unit.sourceRefs && unit.sourceRefs.length > 0 && (
                <aside aria-label="Referências da unidade" className="border-t border-[#dce5ed] pt-4 text-sm text-[#536b82]">
                  <p className="mb-2 font-bold text-[#123b5e]">Referências</p>
                  <ul className="list-inside list-disc space-y-1">
                    {unit.sourceRefs.map((ref, i) => <li key={i}>{ref}</li>)}
                  </ul>
                </aside>
              )}

              {unit.kind === 'lesson' && onRecordLessonVisit && (
                <button type="button" onClick={() => onRecordLessonVisit(unit.id)}
                  disabled={evidenceBusy || serverSeenLessonIds?.includes(unit.id)}
                  className="rounded-full bg-[#123b5e] px-5 py-3 text-sm font-bold text-white hover:bg-[#081b30] disabled:opacity-50">
                  {serverSeenLessonIds?.includes(unit.id) ? 'Visita registrada no servidor' : 'Registrar visita a esta aula'}
                </button>
              )}
              {onSubmitAssessment && isActivity && course.questions.length > 0 && (
                <div className="rounded-2xl border border-[#e1e9ef] bg-[#f7fafc] p-4">
                  <button type="button"
                    disabled={evidenceBusy || course.questions.some((q) => !choices[q.id])}
                    onClick={() => onSubmitAssessment(course.questions.map((q) => ({ questionId: q.id, optionId: choices[q.id] })))}
                    className="rounded-full bg-[#e65300] px-5 py-3 text-sm font-bold text-white hover:bg-[#bd4300] disabled:cursor-not-allowed disabled:opacity-50">
                    Enviar respostas para avaliação
                  </button>
                  <p className="mt-2 text-sm text-[#536b82]">Todas as questões devem ser respondidas. O envio não conclui o curso.</p>
                </div>
              )}
            </div>

            {mediaBlocks.length > 0 && (
              <div className={imageClass}>
                {mediaBlocks.map((block, i) =>
                  (block.type === 'image' || block.type === 'video') ? mediaFrame(block, i) : null)}
              </div>
            )}
          </article>
        </div>
      </main>

      <footer className="z-10 flex min-h-[62px] flex-wrap items-center justify-between gap-2 border-t border-[#dce5ed] bg-white px-4 py-2 sm:px-6">
        <button type="button" disabled={unitIndex === 0} onClick={() => navigateTo(unitIndex - 1)}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#cfdce5] px-4 text-sm font-extrabold text-[#123b5e] hover:bg-[#f3f7fa] disabled:cursor-not-allowed disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior
        </button>
        <div className="hidden min-w-0 text-center md:block">
          <span className="flex items-center justify-center gap-2 text-xs font-semibold text-[#536b82]">
            {unit.kind === 'lesson' ? <BookOpen className="h-4 w-4" aria-hidden="true" /> : <List className="h-4 w-4" aria-hidden="true" />}
            {onRecordLessonVisit || onSubmitAssessment
              ? 'Piloto de staging — visitas e avaliações são registradas; conclusão e certificados ainda indisponíveis.'
              : 'Prévia técnica — respostas e navegação não são gravadas e não concluem treinamentos.'}
          </span>
          {serverSeenLessonIds && <p className="mt-1 text-[11px] text-[#789]">Aulas com registro de visita no servidor: {serverSeenLessonIds.length}. Registros de visita não comprovam conclusão ou aprovação.</p>}
        </div>
        <button type="button" disabled={unitIndex === course.units.length - 1}
          onClick={() => navigateTo(unitIndex + 1)}
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#e65300] px-5 text-sm font-extrabold text-white hover:bg-[#bd4300] disabled:cursor-not-allowed disabled:opacity-40">
          Próximo <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </footer>
      <p className="border-t border-[#edf2f6] bg-[#f7fafc] px-5 py-2 text-center text-[11px] leading-snug text-[#60788b] md:hidden">
        {onRecordLessonVisit || onSubmitAssessment
          ? 'Piloto de staging — sem conclusão ou certificados.'
          : 'Acesso demonstrativo — sem registro de conclusão ou certificado.'}
      </p>
    </section>
  );
}

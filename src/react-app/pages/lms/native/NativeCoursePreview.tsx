import { useEffect, useMemo, useState } from 'react';
import type {
  NativeAsset,
  NativeBlock,
  NativeLearnerCourse,
} from '../../../../../worker-airtrust/src/lib/lms/lms-native-course-contract';

type PreviewProps = {
  course: NativeLearnerCourse;
  /** Must resolve to an authenticated same-origin LMS asset URL. */
  resolveAssetHref: (asset: NativeAsset) => string | null;
  /** Optional authenticated media fetch; Blob URLs are created and revoked here. */
  fetchAuthorizedAsset?: (asset: NativeAsset, signal: AbortSignal) => Promise<Blob>;
  /** Server-confirmed last lesson; not a client-side completion claim. */
  initialUnitId?: string | null;
  /** Only persisted visit receipts. These are NOT pedagogy/completion proof. */
  serverSeenLessonIds?: readonly string[];
  /** Staging-only evidence callbacks. Visit receipt does not mean completion. */
  onRecordLessonVisit?: (unitId: string) => void;
  onSubmitAssessment?: (answers: Array<{ questionId: string; optionId: string }>) => void;
  evidenceBusy?: boolean;
};

function safeLmsAssetUrl(url: string | null): string | null {
  // No remote URLs, data: or javascript: schemes, including encoded variants.
  if (!url || !url.startsWith('/api/lms/') || url.includes('\\') ||
      /[%?#]/.test(url) || url.split('/').includes('..')) return null;
  return url;
}

/**
 * Non-certifying read-only preview. It cannot update progress, grade a quiz,
 * finish an enrollment or issue qualifications. Those belong to Worker APIs.
 */
function ProtectedNativeMedia({ asset, type, alt, fetchAsset }: {
  asset: NativeAsset;
  type: 'image' | 'video';
  alt: string;
  fetchAsset: (asset: NativeAsset, signal: AbortSignal) => Promise<Blob>;
}) {
  const [href, setHref] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setFailed(false);
    setHref(null);
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
    return <p role="status">{failed ? 'Mídia indisponível' : 'Carregando mídia'}: {alt}</p>;
  }
  return type === 'image'
    ? <img src={href} alt={alt} className="max-w-full h-auto rounded-lg" />
    : <figure>
        <video src={href} controls preload="metadata" className="w-full max-w-3xl" aria-label={alt} />
        <figcaption className="text-sm text-slate-600">{alt}</figcaption>
      </figure>;
}

export default function NativeCoursePreview({ course, resolveAssetHref, fetchAuthorizedAsset, initialUnitId, serverSeenLessonIds, onRecordLessonVisit, onSubmitAssessment, evidenceBusy = false }: PreviewProps) {
  const [unitIndex, setUnitIndex] = useState(() => {
    const index = initialUnitId
      ? course.units.findIndex((unit) => unit.id === initialUnitId) : -1;
    return index >= 0 ? index : 0;
  });
  const [choices, setChoices] = useState<Record<string, string>>({});

  useEffect(() => {
    // Resume only to an existing unit in the same course; never synthesize
    // progress or let a missing/stale unit select an arbitrary page.
    const index = initialUnitId
      ? course.units.findIndex((unit) => unit.id === initialUnitId)
      : -1;
    setUnitIndex(index >= 0 ? index : 0);
    setChoices({});
  }, [course.courseId, course.packageVersion, course.units, initialUnitId]);

  const assets = useMemo(
    () => new Map(course.assets.map((asset) => [asset.id, asset])),
    [course.assets],
  );
  const questionMap = useMemo(
    () => new Map(course.questions.map((question) => [question.id, question])),
    [course.questions],
  );
  const unit = course.units[unitIndex];

  if (!unit) {
    return <p role="alert">Este curso não possui unidades disponíveis.</p>;
  }

  function renderBlock(block: NativeBlock, index: number) {
    if (block.type === 'heading') {
      return <h3 key={index} className="text-xl font-semibold">{block.text}</h3>;
    }
    if (block.type === 'paragraph') {
      return <p key={index} className="text-lg leading-relaxed whitespace-pre-line">{block.text}</p>;
    }
    if (block.type === 'bullets') {
      return <ul key={index} className="list-disc pl-6 text-lg">{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul>;
    }
    const asset = assets.get(block.assetId);
    if (asset && fetchAuthorizedAsset) {
      return <ProtectedNativeMedia
        key={index} asset={asset} type={block.type} alt={block.alt}
        fetchAsset={fetchAuthorizedAsset}
      />;
    }
    const href = asset ? safeLmsAssetUrl(resolveAssetHref(asset)) : null;
    if (!href) {
      return <p key={index} role="status">Mídia indisponível nesta visualização: {block.alt}</p>;
    }
    if (block.type === 'image') {
      return <img key={index} src={href} alt={block.alt} className="max-w-full h-auto rounded-lg" loading="lazy" />;
    }
    return (
      <figure key={index}>
        <video src={href} controls preload="metadata" className="w-full max-w-3xl" aria-label={block.alt} />
        <figcaption className="text-sm text-slate-600">{block.alt}</figcaption>
      </figure>
    );
  }

  return (
    <section aria-label="Prévia do curso nativo" className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-amber-800" role="status">
          {onRecordLessonVisit || onSubmitAssessment
            ? 'Piloto de staging — visitas e avaliações são registradas; conclusão e certificados ainda indisponíveis.'
            : 'Prévia técnica — respostas e navegação não são gravadas e não concluem treinamentos.'}
        </p>
        <h1 className="text-2xl font-bold">{course.title}</h1>
        <p className="text-base">Unidade {unitIndex + 1} de {course.units.length}</p>
        {serverSeenLessonIds && (
          <p className="text-sm">
            Aulas com registro de visita no servidor: {serverSeenLessonIds.length}.
            Registros de visita não comprovam conclusão ou aprovação.
          </p>
        )}
      </header>

      <nav aria-label="Unidades do curso" className="flex flex-wrap gap-2">
        {course.units.map((candidate, index) => (
          <button
            key={candidate.id}
            type="button"
            aria-current={index === unitIndex ? 'step' : undefined}
            className="rounded-md border px-3 py-2 text-left"
            onClick={() => setUnitIndex(index)}
          >
            {index + 1}. {candidate.title}
          </button>
        ))}
      </nav>

      <article aria-labelledby="native-preview-unit-title" className="space-y-5">
        <h2 id="native-preview-unit-title" className="text-2xl font-semibold">{unit.title}</h2>
        {unit.blocks.map(renderBlock)}
        {unit.sourceRefs && unit.sourceRefs.length > 0 && (
          <aside aria-label="Referências da unidade" className="rounded-md border p-3">
            <h3 className="font-semibold">Referências</h3>
            <ul className="list-disc pl-6">
              {unit.sourceRefs.map((ref, index) => <li key={index}>{ref}</li>)}
            </ul>
          </aside>
        )}

        {unit.kind === 'lesson' && onRecordLessonVisit && (
          <button type="button" onClick={() => onRecordLessonVisit(unit.id)}
            disabled={evidenceBusy || serverSeenLessonIds?.includes(unit.id)}
            className="rounded border px-4 py-2 disabled:opacity-50">
            {serverSeenLessonIds?.includes(unit.id) ? 'Visita registrada no servidor' : 'Registrar visita a esta aula'}
          </button>
        )}
        {(unit.kind === 'assessment' || unit.kind === 'scenario') && unit.questionIds.map((questionId) => {
          const question = questionMap.get(questionId);
          if (!question) return <p role="alert" key={questionId}>Questão indisponível</p>;
          return (
            <fieldset key={question.id} className="space-y-2 rounded-lg border p-4">
              <legend className="font-semibold text-lg">{question.prompt}</legend>
              {question.options.map((option) => (
                <label key={option.id} className="flex items-start gap-3 py-1 text-base">
                  <input
                    type="radio"
                    name={question.id}
                    value={option.id}
                    checked={choices[question.id] === option.id}
                    onChange={() => setChoices((current) => ({ ...current, [question.id]: option.id }))}
                  />
                  <span>{option.text}</span>
                </label>
              ))}
            </fieldset>
          );
        })}
      </article>

      {onSubmitAssessment && (unit.kind === 'assessment' || unit.kind === 'scenario') && course.questions.length > 0 && (
        <div className="space-y-2 rounded border p-3">
          <button type="button"
            disabled={evidenceBusy || course.questions.some((q) => !choices[q.id])}
            onClick={() => onSubmitAssessment(course.questions.map((q) => ({ questionId: q.id, optionId: choices[q.id] })))}
            className="rounded border px-4 py-2 disabled:opacity-50">
            Enviar respostas para avaliação
          </button>
          <p className="text-sm">Todas as questões devem ser respondidas. O envio não conclui o curso.</p>
        </div>
      )}
      <footer className="flex items-center justify-between gap-3">
        <button type="button" disabled={unitIndex === 0} onClick={() => setUnitIndex((value) => Math.max(0, value - 1))}
          className="rounded-md border px-4 py-2 disabled:opacity-50">Anterior</button>
        <button type="button" disabled={unitIndex === course.units.length - 1}
          onClick={() => setUnitIndex((value) => Math.min(course.units.length - 1, value + 1))}
          className="rounded-md border px-4 py-2 disabled:opacity-50">Próximo</button>
      </footer>
    </section>
  );
}

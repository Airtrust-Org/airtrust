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
export default function NativeCoursePreview({ course, resolveAssetHref }: PreviewProps) {
  const [unitIndex, setUnitIndex] = useState(0);
  const [choices, setChoices] = useState<Record<string, string>>({});

  useEffect(() => {
    setUnitIndex(0);
    setChoices({});
  }, [course.courseId, course.packageVersion]);

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
          Prévia técnica — respostas e navegação não são gravadas e não concluem treinamentos.
        </p>
        <h1 className="text-2xl font-bold">{course.title}</h1>
        <p className="text-base">Unidade {unitIndex + 1} de {course.units.length}</p>
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

/**
 * Risk-proportionate, bounded UI driver limits for genuinely longer SCORM courses.
 * The authored ZIP's content contract determines size; untrusted driver hints do not.
 * All permitted steps are still real, validated DOM actions with bounded counts.
 */
export function scormGovernedDriverLimits(files) {
  const fallback = { maxActions: 120, maxContent: 120, authoredSlides: null };
  if (!files || !files['content.js'] || !files['airtrust-completion-manifest.json']) {
    return fallback;
  }
  try {
    const js = Buffer.from(files['content.js']).toString('utf8');
    const prefix = 'window.AIRTRUST_CONTENT = ';
    if (!js.startsWith(prefix)) return fallback;
    const json = js.slice(prefix.length).trim().replace(/;$/, '');
    const model = JSON.parse(json);
    const contract = JSON.parse(
      Buffer.from(files['airtrust-completion-manifest.json']).toString('utf8'),
    );
    const slides = model?.slides;
    const required = contract?.content?.requiredSlides;
    if (!Array.isArray(slides) || !Array.isArray(required) ||
        slides.length < 1 || slides.length > 1000 ||
        slides.length !== required.length ||
        slides.some((slide, i) => typeof slide?.id !== 'string' ||
          !slide.id || slide.id !== required[i]) ||
        new Set(required).size !== required.length) return fallback;
    return {
      maxActions: Math.min(1200, Math.max(120, slides.length * 5)),
      maxContent: Math.min(1000, Math.max(120, slides.length)),
      authoredSlides: slides.length,
    };
  } catch {
    return fallback;
  }
}

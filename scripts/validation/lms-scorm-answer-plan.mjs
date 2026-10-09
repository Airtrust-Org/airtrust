// Read-only SCORM browser certification: extract authored correct responses only from package metadata.
export function extractAnswerPlan(model) {
  const answers = [];
  const seen = new Set();
  function visit(value, path = '') {
    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    const obj = value;
    let options = null;
    for (const key of ['options', 'alternatives', 'choices', 'answers', 'alternativas', 'opcoes', 'respostas']) {
      if (Array.isArray(obj[key]) && obj[key].length) {
        options = obj[key];
        break;
      }
    }
    if (options?.length) {
      let indices = [];
      for (const key of ['correctIndex', 'answerIndex', 'correctOptionIndex', 'correctAnswerIndex']) {
        if (Number.isInteger(obj[key])) indices = [Number(obj[key])];
      }
      for (const key of ['correctAnswer', 'answer', 'correctOption', 'correct', 'correctLetter', 'rightAnswer', 'respostaCorreta', 'gabarito']) {
        const raw = obj[key];
        if (typeof raw === 'number' && Number.isInteger(raw)) indices = [raw];
        if (Array.isArray(raw) && raw.every((item) => Number.isInteger(item))) indices = raw.map(Number);
        if (typeof raw === 'string') {
          const normalized = raw.trim();
          const idx = options.findIndex((option) =>
            String(option?.value ?? option?.text ?? option?.label ?? option).trim() === normalized
          );
          if (idx >= 0) indices = [idx];
          else if (/^[A-Z]$/i.test(normalized)) {
            const letter = normalized.toUpperCase().charCodeAt(0) - 65;
            if (letter >= 0 && letter < options.length) indices = [letter];
          }
        }
      }
      const marked = options
        .map((option, i) => (
          option && typeof option === 'object' &&
          (option.correct === true || option.isCorrect === true || option.correctAnswer === true)
            ? i
            : -1
        ))
        .filter((i) => i >= 0);
      if (marked.length) indices = marked;
      const unique = [...new Set(indices)].filter((i) => i >= 0 && i < options.length);
      if (unique.length) {
        const slideMatch = path.match(/(?:^|\.)slides\[(\d+)\]/);
        answers.push({
          path,
          slideIndex: slideMatch ? Number(slideMatch[1]) + 1 : null,
          indices: unique,
        });
      }
    }
    for (const [key, child] of Object.entries(obj)) visit(child, path ? `${path}.${key}` : key);
  }
  visit(model);
  return answers;
}

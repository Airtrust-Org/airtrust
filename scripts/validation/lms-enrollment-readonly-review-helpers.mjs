const CANDIDATE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function activeCandidateIdFromPrefix(prefix) {
  const value = String(prefix || '').trim();
  const match = value.match(/(?:^|\/)\_candidates\/([^/]+)\/?$/i);
  if (!match || !CANDIDATE_UUID_PATTERN.test(match[1])) return null;
  return match[1].toLowerCase();
}

export function resolveExpectedCandidateId({ expectedCandidateId, activePrefix }) {
  const active = activeCandidateIdFromPrefix(activePrefix);
  if (!active) throw new Error('ACTIVE_SCORM_CANDIDATE_NOT_RESOLVABLE');

  const requested = String(expectedCandidateId || '').trim().toLowerCase();
  if (requested && requested !== 'auto' && requested !== active) {
    throw new Error('EXPECTED_CANDIDATE_DOES_NOT_MATCH_ENROLLMENT');
  }
  return active;
}

function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function summarizeEnrollment(enrollment) {
  const row = enrollment && typeof enrollment === 'object' ? enrollment : {};
  const scorm = row.scorm_progresso && typeof row.scorm_progresso === 'object'
    ? row.scorm_progresso
    : {};
  const cmi = parseObject(scorm.cmi_json);
  const lessonLocation =
    cmi['cmi.core.lesson_location'] ?? cmi['cmi.location'] ?? null;
  const lessonStatus =
    scorm.lesson_status ?? cmi['cmi.core.lesson_status'] ?? cmi['cmi.completion_status'] ?? null;
  const score = scorm.score_raw ?? cmi['cmi.core.score.raw'] ?? cmi['cmi.score.raw'] ?? null;
  const suspendData = scorm.suspend_data ?? cmi['cmi.suspend_data'] ?? '';

  return {
    matricula_id: Number(row.id) || null,
    empresa_id: Number(row.empresa_id) || null,
    curso_id: Number(row.curso_id) || null,
    content_type: String(row.tipo_conteudo || '').toLowerCase() || null,
    enrollment_status: String(row.status || '').toUpperCase() || null,
    progress_pct: Number.isFinite(Number(row.progresso_pct)) ? Number(row.progresso_pct) : null,
    scorm: {
      lesson_status: lessonStatus == null ? null : String(lessonStatus),
      lesson_location: lessonLocation == null ? null : String(lessonLocation),
      score_raw: score == null || !Number.isFinite(Number(score)) ? null : Number(score),
      suspend_data_present: String(suspendData || '').length > 0,
      suspend_data_length: String(suspendData || '').length,
    },
  };
}

export function hasMeaningfulScormLocation(value) {
  if (value == null) return false;
  const location = String(value).trim();
  if (!location) return false;
  return !/^0(?:\/\d+)?$/.test(location);
}

export function parseLaunchCycle(html) {
  const text = String(html || '');
  const readNumber = (name) => {
    const match = text.match(new RegExp(`\\bvar\\s+${name}\\s*=\\s*(\\d+)\\s*;`));
    return match ? Number(match[1]) : null;
  };
  const readBoolean = (name) => {
    const match = text.match(new RegExp(`\\bvar\\s+${name}\\s*=\\s*(true|false)\\s*;`, 'i'));
    return match ? match[1].toLowerCase() === 'true' : null;
  };

  return {
    ciclo_id: readNumber('CICLO_ID'),
    numero_ciclo: readNumber('NUMERO_CICLO'),
    preview_mode: readBoolean('PREVIEW_MODE'),
    review_mode: readBoolean('REVIEW_MODE'),
  };
}

export function launchInitialCmi(html) {
  const text = String(html || '');
  const match = text.match(/var parsed = JSON\.parse\(("(?:\\.|[^"\\])*")\);/);
  if (!match) return null;
  try {
    return parseObject(JSON.parse(match[1]));
  } catch {
    return null;
  }
}

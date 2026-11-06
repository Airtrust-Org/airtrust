/**
 * Pure SCORM location and progress parsing helpers, extracted from the
 * asset/launch route to keep its runtime size within architecture guardrails.
 * Public symbols remain re-exported from lms-assets for existing callers.
 */
export function parseScormLocationMarker(
  location: unknown,
): { current: number; total: number | null } | null {
  if (typeof location !== 'string' || !location.trim()) return null;

  const trimmed = location.trim();
  let match = trimmed.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) {
    match = trimmed.match(/(\d+)\s*of\s*(\d+)/i);
  }
  if (match) {
    const current = Number(match[1]);
    const total = Number(match[2]);
    if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0 || current < 0) {
      return null;
    }

    return { current, total };
  }

  const single = Number(trimmed);
  if (Number.isFinite(single) && single > 0) {
    return { current: single, total: null };
  }

  return null;
}

export function parseScormLocationPair(
  location: unknown,
): { current: number; total: number } | null {
  const marker = parseScormLocationMarker(location);
  if (!marker || marker.total == null) return null;
  return { current: marker.current, total: marker.total };
}

export function resolveScormResumeTargetSlide(
  savedLocation: unknown,
  observedLocation: unknown,
): number | null {
  const saved = parseScormLocationMarker(savedLocation);
  if (!saved || saved.current <= 1) return null;

  const observed = parseScormLocationMarker(observedLocation);
  if (observed) {
    if (observed.current >= saved.current) return null;
    if (observed.total != null && saved.current > observed.total) return null;
  }

  return saved.current;
}

/**
 * Parse a value to a finite number, preserving `0`. Returns null only when the
 * value is absent, non-numeric or non-finite. Replaces the `parseFloat(x) || null`
 * idiom in buildPayload(), which silently maps a legitimate `0` (score_raw,
 * score_min, score_scaled, …) to null and loses SCORM state on round-trip.
 */
export function finiteNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/**
 * DOM-progress authority: a full explicit fraction (current/total) authored by
 * the package is authoritative (package 47/47 beats a "121/135" string on the
 * page). A bare-number authored location (no total) accepts the DOM fraction
 * only when its current matches the authored position — form numbers
 * ("005/123") or regulatory refs ("121/135") never hijack the real counter.
 */
export function resolveProbedScormLocation(params: {
  authored: boolean;
  explicitLocation: unknown;
  domLocation: unknown;
}): { location: string | null; persist: boolean; reason: string } {
  const explicitMarker = parseScormLocationMarker(params.explicitLocation);
  if (params.authored && explicitMarker && explicitMarker.current >= 1 && explicitMarker.total != null) {
    return { location: String(params.explicitLocation), persist: false, reason: 'explicit-package-location' };
  }
  const domMarker = parseScormLocationMarker(params.domLocation);
  if (!domMarker) {
    return { location: explicitMarker ? String(params.explicitLocation) : null, persist: false, reason: 'no-dom-progress' };
  }
  if (params.authored && explicitMarker && explicitMarker.current >= 1 && domMarker.total != null && domMarker.current !== explicitMarker.current) {
    return { location: String(params.explicitLocation), persist: false, reason: 'dom-current-mismatch' };
  }
  const domLocation = domMarker.total == null ? String(domMarker.current) : String(domMarker.current) + '/' + String(domMarker.total);
  return { location: domLocation, persist: true, reason: 'dom-fallback' };
}


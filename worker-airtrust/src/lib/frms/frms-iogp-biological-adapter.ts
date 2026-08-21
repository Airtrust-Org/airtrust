/**
 * AirTrust FRMS IOGP — biological level adapter.
 *
 * Translates the canonical AirTrust engine's `effectiveness_nivel` string
 * (computed by `calcEffectiveness` and persisted in `frms_fatorizacao_jornada`)
 * into the `biologicalLevel` vocabulary expected by the IOGP shadow orchestrator.
 *
 * Rules:
 *   - Does NOT recalculate fatigue. This is a pure vocabulary adapter.
 *   - Unknown / null inputs map to 'UNKNOWN' (fail-conservative).
 *   - 'verde'      → 'NORMAL'   (full effectiveness, no biological risk)
 *   - 'transição'  → 'ELEVATED' (borderline, watchlist)
 *   - 'amarelo'    → 'ELEVATED' (attention band)
 *   - 'vermelho'   → 'HIGH'     (critical band, but not autonomous CRITICAL
 *                                per orchestrator — operational/compliance context
 *                                can still escalate to CRITICAL)
 *   - anything else / null → 'UNKNOWN'
 */

export type IogpBiologicalLevel = 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

/**
 * Maps the effectiveness_nivel from the canonical AirTrust FRMS engine to the
 * IOGP shadow pipeline biologicalLevel. Source: frms_fatorizacao_jornada.effectiveness_nivel.
 *
 * @param effectivenessNivel - Raw string from the DB, e.g. 'verde', 'amarelo', 'vermelho', null.
 * @returns IOGP biological risk level.
 */
export function mapEffectivenessNivelToBiologicalLevel(
  effectivenessNivel: string | null | undefined,
): IogpBiologicalLevel {
  const normalized = String(effectivenessNivel ?? '').trim().toLowerCase();
  switch (normalized) {
    case 'verde':
      return 'NORMAL';
    case 'transição':
    case 'transicao': // ASCII-safe variant that may appear in legacy rows
    case 'amarelo':
      return 'ELEVATED';
    case 'vermelho':
      return 'HIGH';
    default:
      return 'UNKNOWN';
  }
}

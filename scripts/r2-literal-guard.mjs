/**
 * Checks tracked text for R2 credential-shaped assignments without ever
 * returning the candidate value. Used by guard:sanitization (#500).
 *
 * The input is a single "git grep -n" line. Fixtures must be synthetic.
 */
const ASSIGNMENT = /(?:^|[\s"'\x60[{,])["'\x60]?(R2_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|ACCOUNT_ID))["'\x60]?\s*[:=]\s*["'\x60]?([A-Za-z0-9_-]{24,})(?=$|[\s"'\x60,;#}\]])/gi;

function isPlaceholder(field, value) {
  const upper = value.toUpperCase().replace(/-/g, '_');
  return upper === 'YOUR_' + field ||
    upper === 'EXAMPLE_' + field ||
    upper === 'PLACEHOLDER_' + field ||
    upper === 'CHANGEME_' + field ||
    upper === 'DUMMY_' + field ||
    upper === 'TEST_ONLY_' + field ||
    ['PLACEHOLDER', 'CHANGEME', 'EXAMPLE', 'DUMMY'].includes(upper);
}

/** @returns {{ path: string, line: number, field: string } | null} */
export function findR2LiteralAssignment(gitGrepLine) {
  const marker = /^(.*):([0-9]+):(.*)$/.exec(gitGrepLine);
  const content = marker ? marker[3] : gitGrepLine;
  ASSIGNMENT.lastIndex = 0;
  for (const match of content.matchAll(ASSIGNMENT)) {
    if (!isPlaceholder(match[1], match[2])) {
      return {
        path: marker ? marker[1] : '(synthetic)',
        line: marker ? Number(marker[2]) : 0,
        field: match[1],
      };
    }
  }
  return null;
}

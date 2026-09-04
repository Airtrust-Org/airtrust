/**
 * Synthetic QA fixture classifier for the Staging Frontend PR UI QA.
 *
 * This workflow authenticates with REAL credentials against REAL staging data.
 * A funcionário ficha (and the documents inside it) may only be opened/exercised
 * when it is UNAMBIGUOUSLY a synthetic QA fixture — never by a generic substring
 * like "fixture" or "synthetic" appearing anywhere in a real person's name or a
 * real document's label (e.g. "João Fixture Silva", "Documento sintético").
 *
 * BLOCKER K: no canonical "this is a synthetic staging funcionário" marker was
 * found anywhere in the repository. Absent that guarantee, the ONLY safe
 * contract is an explicit QA prefix at the START of the label. Anything else —
 * including the generic words "fixture" / "synthetic" / "sintético" used alone,
 * in the middle of a name, or only in a secondary description — is REJECTED.
 * If staging carries no such prefixed fixture, the correct outcome is BLOCKED,
 * not opening a real funcionário to "look for" a document.
 */

// Required prefix at the very start of the label:
//   [QA]                             e.g. "[QA] Funcionário Teste"
//   QA_FIXTURE / QA-FIXTURE          e.g. "QA_FIXTURE_FUNCIONARIO"
//   QA_SYNTHETIC / QA-SYNTHETIC      e.g. "QA_SYNTHETIC Employee"
//   QA_SINTETICO / QA-SINTETICO      e.g. "QA_SINTETICO Documento" (accent optional)
const SYNTHETIC_QA_PREFIX_PATTERN =
  /^\s*(?:\[QA\]|QA[_-](?:FIXTURE|SYNTHETIC|SINT[EÉ]TIC[OA]?))/i;

/**
 * @param {string | null | undefined} label the funcionário or document label
 * @returns {boolean} true only when `label` starts with an explicit QA prefix
 */
export function isSyntheticQaFixtureLabel(label) {
  const value = String(label ?? '');
  if (!value.trim()) return false;
  return SYNTHETIC_QA_PREFIX_PATTERN.test(value);
}

export { SYNTHETIC_QA_PREFIX_PATTERN };

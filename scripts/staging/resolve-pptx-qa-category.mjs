/**
 * Pure, tenant-scoped guard for synthetic PPTX qualifying QA.
 * A friendly name/code such as EAD does not confer LMS integration.
 * Never mutate the qualification category catalog just to satisfy a QA run.
 */
export function resolvePptxQaLmsCategoryId(categories) {
  if (!Array.isArray(categories)) {
    throw new Error('PPTX_QA_CATEGORIES_INVALID');
  }
  const integrated = categories.filter((row) =>
    row?.ativo === true && row?.lms_integrada === true);
  if (integrated.length !== 1) {
    throw new Error('PPTX_QA_CANONICAL_LMS_CATEGORY_NOT_UNIQUE');
  }
  const id = Number(integrated[0].id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('PPTX_QA_CANONICAL_LMS_CATEGORY_INVALID_ID');
  }
  return id;
}

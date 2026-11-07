// Fixed, reviewed runtime dependencies for the current FRMS and PPTX Worker.
const OBJECTS = [
  ['index', 'idx_frms_checkin_kss_provenance_scope'],
  ['table', 'lms_pptx_slide_evidences'],
  ['index', 'idx_lms_pptx_slide_evidences_scope'],
  ['trigger', 'trg_lms_pptx_evidence_insert_scope'],
  ['trigger', 'trg_lms_pptx_evidence_immutable_update'],
  ['trigger', 'trg_lms_pptx_evidence_immutable_delete'],
];

export function schemaV2RuntimeReadiness({ objects, checkinColumns, ledger, manifests }) {
  const present = new Set(objects.map((row) => `${row.type}:${row.name}`));
  const missingObjects = OBJECTS.filter(([type, name]) => !present.has(`${type}:${name}`))
    .map(([type, name]) => `${type}:${name}`);
  if (!checkinColumns.includes('kss_provenance')) missingObjects.push('column:frms_fadiga_checkin.kss_provenance');
  const missingLedger = manifests.filter((manifest) => !ledger.some((row) =>
    row.change_id === manifest.changeId && row.baseline_id === manifest.baselineId &&
    row.file_hash === manifest.fileHash && row.plan_hash === manifest.planHash))
    .map((manifest) => manifest.changeId);
  return { ready: missingObjects.length === 0 && missingLedger.length === 0, missingObjects, missingLedger };
}

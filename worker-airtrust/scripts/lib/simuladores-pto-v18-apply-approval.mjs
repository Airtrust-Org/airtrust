/**
 * Garante que nenhuma nova importação curricular use o plano legado nem rascunhos
 * de guias ainda sem homologação técnica. Não confunde aprovação de mudança em
 * produção com homologação operacional da matriz de sessões e procedimentos.
 */
import { PTO_REV10_V18_PLAN_SCHEMA_VERSION } from './simuladores-pto-rev10-plan.mjs';

const PTO_V18_SHA256 = '040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912';

export function assertNewPtoV18ApplyReady({
  plan,
  existingState,
  dryRun,
  technicalApproval,
}) {
  if (existingState === 'IDEMPOTENT_APPLIED') return { mode: 'HISTORICAL_READBACK' };

  if (plan?.schema_version !== PTO_REV10_V18_PLAN_SCHEMA_VERSION) {
    throw new Error('PTO V18: novas aplicações de plano curricular legado estão bloqueadas');
  }
  if (plan.approved_source_sha256 !== PTO_V18_SHA256) {
    throw new Error('PTO V18: fonte normativa do plano não corresponde ao documento aprovado');
  }
  if (!/^[a-f0-9]{64}$/.test(String(plan.canonical_contract_sha256 || ''))) {
    throw new Error('PTO V18: contrato canônico sem checksum');
  }

  if (dryRun) return { mode: 'CURRICULAR_DRY_RUN_ONLY' };

  if (technicalApproval?.status !== 'VALIDADO_PARA_PRODUCAO') {
    throw new Error('PTO V18: aprovação técnica dos guias e procedimentos ausente');
  }
  if (technicalApproval.pto_sha256 !== PTO_V18_SHA256 ||
      technicalApproval.contract_sha256 !== plan.canonical_contract_sha256 ||
      technicalApproval.plan_sha256 !== plan.plan_sha256) {
    throw new Error('PTO V18: aprovação técnica não vinculada ao plano exato');
  }
  if (technicalApproval.guide_count !== 82 ||
      technicalApproval.technical_items_verified !== 1476 ||
      technicalApproval.notechs_verified !== 15 ||
      technicalApproval.functional_guides_verified !== 6 ||
      technicalApproval.functional_technical_items_verified !== 108 ||
      technicalApproval.functional_notechs_links_verified !== 90) {
    throw new Error('PTO V18: aprovação técnica não abrange integralmente a matriz');
  }
  if (!String(technicalApproval.reviewer || '').trim() ||
      !String(technicalApproval.evidence_ref || '').trim() ||
      !/^20\d\d-\d\d-\d\dT/.test(String(technicalApproval.reviewed_at || ''))) {
    throw new Error('PTO V18: responsável, data e evidência de aceite técnico obrigatórios');
  }
  return { mode: 'TECHNICALLY_APPROVED_EXACT_PLAN' };
}

/**
 * Estrutura de aeronave/competência de um plano PTO Rev.10 V18.
 *
 * O SHA do contrato garante proveniência no gerador, mas não basta para
 * impedir que um plano reserializado inclua associações AW139/S76 trocadas
 * depois de criado. Esta barreira confere a estrutura do plano selado.
 * NÃO é aprovação operacional de cenário, SOP, QRH ou RFM.
 */
const EXPECTED_AIRCRAFT = Object.freeze({ AW139: 37, SK76: 45 });

export function assertPtoV18ModelIsolation(plan) {
  const models = plan?.models;
  const items = plan?.items;
  if (!Array.isArray(models) || !Array.isArray(items) ||
      models.length !== 88 || items.length !== 1584) {
    throw new Error('PTO V18: estrutura exige 88 modelos e 1584 vínculos');
  }
  const counts = { AW139: 0, SK76: 0, functional: 0 };
  const byCode = new Map();
  for (const model of models) {
    if (!model?.codigo || byCode.has(model.codigo)) {
      throw new Error('PTO V18: modelo duplicado ou sem código');
    }
    byCode.set(model.codigo, model);
    const functional = ['INSTRUTOR', 'EXAMINADOR'].includes(model.tipo_estruturado);
    if (functional) {
      if (model.aeronave !== null ||
          !(model.codigo.startsWith('INST-') || model.codigo.startsWith('EXA-'))) {
        throw new Error(`PTO V18: sessão funcional com aeronave/código incompatível: ${model.codigo}`);
      }
      counts.functional += 1;
      continue;
    }
    if (!(model.aeronave in EXPECTED_AIRCRAFT) ||
        !(model.aeronave === 'AW139' ? model.codigo.startsWith('A139-') :
          model.codigo.startsWith('S76-'))) {
      throw new Error(`PTO V18: sessão de aeronave incompatível: ${model.codigo}`);
    }
    counts[model.aeronave] += 1;
  }
  if (counts.AW139 !== 37 || counts.SK76 !== 45 || counts.functional !== 6) {
    throw new Error('PTO V18: divisão por aeronave/função incorreta (37/45/6)');
  }
  const functionalCodes = new Set((plan.functional_catalog || []).map((item) => item?.codigo));
  if (functionalCodes.size !== 94 || functionalCodes.has(undefined)) {
    throw new Error('PTO V18: catálogo de 94 competências funcionais inválido');
  }
  const codes = new Set();
  for (const competency of plan.notechs || []) {
    if (!competency?.codigo || codes.has(competency.codigo)) {
      throw new Error('PTO V18: competência NOTECHS ausente/duplicada');
    }
    codes.add(competency.codigo);
  }
  if (codes.size !== 15) throw new Error('PTO V18: exige 15 NOTECHS distintos');
  const linksByModel = new Map();
  for (const item of items) {
    const model = byCode.get(item?.modelo);
    if (!model) throw new Error('PTO V18: vínculo com modelo desconhecido');
    if (item.aeronave !== model.aeronave) {
      throw new Error(`PTO V18: vínculo de aeronave cruzado: ${item.modelo}/${item.codigo}`);
    }
    const functional = ['INSTRUTOR', 'EXAMINADOR'].includes(model.tipo_estruturado);
    if (functionalCodes.has(item.codigo) !== functional) {
      throw new Error(`PTO V18: vínculo de competência funcional no grupo errado: ${item.modelo}/${item.codigo}`);
    }
    linksByModel.set(item.modelo, (linksByModel.get(item.modelo) || 0) + 1);
  }
  if (models.some((model) => linksByModel.get(model.codigo) !== 18)) {
    throw new Error('PTO V18: cada modelo exige exatamente 18 vínculos');
  }
  return true;
}

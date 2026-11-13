/**
 * PTO Rev.10 V18: fail-closed match of every operational aircraft model and
 * technical position to the exact approved document transcription.
 *
 * The document, not previous AirTrust models, is the authority. A SHA field
 * alone is not provenance: the payload itself is matched item-by-item.
 * This guard does not approve SOP/RFM/QRH/ECL scenarios or guides.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const PTO_V18_CANONICAL_SESSIONS_SHA =
  '0d3fa1f4ee9bcd812b99627bd6251b6729ad5ae3d34cd53fae953dc21d560fec';
export const PTO_V18_CANONICAL_NOTECHS_SHA =
  '1f4196556c5b3aff77f163cd1a6c35ce3d7eedf6319698b3e58a19e72132e78b';

function approvedJson(name, expectedSha) {
  const path = new URL('../../../scripts/operations/pto-v18-canonical/' + name, import.meta.url);
  const raw = readFileSync(path);
  if (createHash('sha256').update(raw).digest('hex') !== expectedSha) {
    throw new Error('PTO V18: transcrição canônica alterada: ' + name);
  }
  return JSON.parse(raw.toString('utf8'));
}

const approvedSessions = approvedJson('sessoes_pto_v18.json', PTO_V18_CANONICAL_SESSIONS_SHA);
const approvedNotechs = approvedJson('notechs_pto_v18.json', PTO_V18_CANONICAL_NOTECHS_SHA);
const canonicalCodes = new Set(approvedSessions.map((s) => s.codigo));

export function assertPtoV18CanonicalPlan(plan) {
  if (plan?.canonical_contract_sha256 !== PTO_V18_CANONICAL_SESSIONS_SHA) {
    throw new Error('PTO V18: checksum não é o do contrato canônico aprovado');
  }
  const models = plan?.models;
  const items = plan?.items;
  if (!Array.isArray(models) || !Array.isArray(items) ||
      models.length !== 88 || items.length !== 1584) {
    throw new Error('PTO V18: exigidos 82 modelos de aeronave, 6 funcionais e 1584 vínculos');
  }

  const byModel = new Map();
  for (const model of models) {
    if (byModel.has(model.codigo)) throw new Error('PTO V18: modelo duplicado ' + model.codigo);
    byModel.set(model.codigo, model);
  }
  const bySession = new Map();
  for (const item of items) {
    if (!byModel.has(item.modelo)) {
      throw new Error('PTO V18: vínculo sem modelo ' + item.modelo);
    }
    if (!bySession.has(item.modelo)) bySession.set(item.modelo, []);
    bySession.get(item.modelo).push(item);
  }

  for (const session of approvedSessions) {
    const model = byModel.get(session.codigo);
    if (!model) throw new Error('PTO V18: sessão obrigatória ausente ' + session.codigo);
    const expectedAircraft = session.aeronave === 'S76' ? 'SK76' : 'AW139';
    if (model.aeronave !== expectedAircraft ||
        model.titulo !== session.titulo ||
        model.carga_sessao !== session.carga) {
      throw new Error('PTO V18: modelo difere da fonte aprovada ' + session.codigo);
    }

    const actual = (bySession.get(session.codigo) || []).slice()
      .sort((a, b) => a.ordem - b.ordem);
    if (actual.length !== 18) {
      throw new Error('PTO V18: sessão sem 18 posições ' + session.codigo);
    }
    for (let i = 0; i < 18; i += 1) {
      const approved = session.itens[i];
      const row = actual[i];
      const expectedPF = i < 9 ? 'A' : 'B';
      if (row.ordem !== approved.ordem ||
          row.codigo !== approved.codigo ||
          row.nome !== approved.nome ||
          row.execucao_pf !== expectedPF ||
          row.aeronave !== expectedAircraft) {
        throw new Error('PTO V18: divergência código/nome/ordem/perna na sessão ' +
          session.codigo + ', posição ' + (i + 1));
      }
    }
  }

  const functional = models.filter((model) => !canonicalCodes.has(model.codigo));
  if (functional.length !== 6 || functional.some((m) =>
    !['INSTRUTOR', 'EXAMINADOR'].includes(m.tipo_estruturado) ||
    m.aeronave !== null ||
    (bySession.get(m.codigo) || []).length !== 18)) {
    throw new Error('PTO V18: seis sessões funcionais não preservadas');
  }
  if (plan.notechs?.length !== 15) {
    throw new Error('PTO V18: 15 competências NOTECHS obrigatórias');
  }
  for (const [index, notech] of approvedNotechs.entries()) {
    const matches = plan.notechs.filter((row) => row.codigo === notech.codigo);
    if (matches.length !== 1 ||
        matches[0].nome !== notech.elemento ||
        matches[0].categoria !== notech.categoria ||
        matches[0].evidencia_observavel !== notech.evidencia ||
        matches[0].ordem !== 1001 + index) {
      throw new Error('PTO V18: catálogo NOTECHS diferente do documento aprovado: ' + notech.codigo);
    }
  }
  return true;
}

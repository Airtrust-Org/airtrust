/**
 * PTO Rev.10 V18 curricular parity preflight.
 *
 * Independent of D1; rejects obsolete 'PTO Rev10' packages before plan creation.
 * The private contract is generated from the DOCX with its pinned SHA256.
 * This check does NOT approve SOP/QRH, instructor guides or production release.
 */
export const PTO_V18_SHA256 =
  '040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912';

const EXPECTED = Object.freeze({ AW139: 37, S76: 45, technical: 1476, notechs: 15 });

function fail(message) {
  throw new Error(`PTO V18 preflight: ${message}`);
}

function normalized(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

/**
 * O PTO V18 tem cinco formas de carga nas 82 tabelas de aeronaves. A carga
 * prática no FFS não é confundida com a duração total que inclui solo.
 * Valores desconhecidos são bloqueados — nunca inferidos por texto livre.
 */
export function assertPtoV18SessionLoad({ code, canonical, projected, projectedMinutes }) {
  const clean = (value) => String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');
  const wanted = clean(canonical);
  const got = clean(projected);
  const specs = new Map([
    ['2 horas', { total: 120, modes: ['2 horas'] }],
    ['3 horas', { total: 180, modes: ['3 horas'] }],
    ['2 horas praticas em ffs', { total: 120, modes: ['2 horas praticas em ffs', '2 horas'] }],
    ['90 minutos (minimo)', { total: 90, modes: ['90 minutos (minimo)', '90 minutos'] }],
    ['1 hora pratica (minimo); 1 hora de solo associada', {
      total: 120, modes: ['1 hora pratica (minimo); 1 hora de solo associada'],
    }],
  ]);
  const spec = specs.get(wanted);
  if (!spec) fail(`${code}: carga canônica PTO desconhecida ou ausente: ${canonical}`);
  if (!spec.modes.includes(got)) {
    fail(`${code}: carga da sessão divergente do PTO V18: esperado ${canonical}, recebido ${projected}`);
  }
  if (projectedMinutes !== null && projectedMinutes !== undefined &&
      (!Number.isInteger(projectedMinutes) || projectedMinutes !== spec.total)) {
    fail(`${code}: duração estimada em minutos divergente da carga PTO V18 (${spec.total})`);
  }
  return Object.freeze({ session_minutes: spec.total, source_load: canonical });
}

export function assertPtoV18CurricularParity({ projection, contract, sourceManifest, contractSha256 }) {
  if (sourceManifest?.sha256_fonte !== PTO_V18_SHA256) {
    fail('hash da fonte V18 não corresponde ao PTO aprovado');
  }
  if (!Array.isArray(contract)) fail('contrato curricular V18 ausente');
  if (!/^[a-f0-9]{64}$/.test(String(contractSha256 || '')) ||
      sourceManifest.sha256_contrato !== contractSha256) {
    fail('checksum do contrato V18 diferente do manifesto');
  }
  if (contract.length !== EXPECTED.AW139 + EXPECTED.S76) {
    fail(`contrato V18 exige 82 sessões (recebidas ${contract.length})`);
  }

  const expected = new Map();
  for (const session of contract) {
    const code = String(session?.codigo ?? '');
    if (!code || expected.has(code)) fail(`código de sessão V18 duplicado ou vazio: ${code}`);
    if (!['AW139', 'S76'].includes(session.aeronave)) fail(`${code}: aeronave do contrato inválida`);
    if (!Array.isArray(session.itens) || session.itens.length !== 18) {
      fail(`${code}: contrato exige exatamente 18 manobras`);
    }
    for (let i = 0; i < 18; i += 1) {
      if (Number(session.itens[i].ordem) !== i + 1 || !String(session.itens[i].codigo || '').trim()) {
        fail(`${code}: ordem/código inválido no contrato na posição ${i + 1}`);
      }
    }
    expected.set(code, session);
  }

  const actual = new Map();
  for (const [aircraft, count] of Object.entries({ AW139: EXPECTED.AW139, S76: EXPECTED.S76 })) {
    const models = projection?.aeronaves?.[aircraft]?.sessoes;
    if (!Array.isArray(models) || models.length !== count) {
      fail(`${aircraft}: esperadas ${count} sessões, recebidas ${models?.length ?? 'nenhuma'}`);
    }
    const contractCount = contract.filter((session) => session.aeronave === aircraft).length;
    if (contractCount !== count) fail(`${aircraft}: quantidade de sessões no contrato incorreta`);
    for (const model of models) {
      if (!model.codigo || actual.has(model.codigo)) fail(`modelo duplicado: ${model.codigo}`);
      actual.set(model.codigo, { ...model, aeronave: aircraft });
    }
  }

  if (actual.size !== expected.size) fail('quantidade total de modelos divergente');
  let technicalCount = 0;
  for (const [code, wanted] of expected) {
    const got = actual.get(code);
    if (!got) fail(`${code}: sessão ausente no pacote`);
    if (got.aeronave !== wanted.aeronave) fail(`${code}: aeronave incorreta`);
    if (normalized(got.titulo) !== normalized(wanted.titulo)) fail(`${code}: título divergente`);
    assertPtoV18SessionLoad({
      code, canonical: wanted.carga, projected: got.carga_sessao,
      projectedMinutes: got.duracao_estimada_minutos,
    });
    const items = got.itens_tecnicos;
    if (!Array.isArray(items) || items.length !== 18) fail(`${code}: deve conter 18 itens técnicos`);
    for (let i = 0; i < 18; i += 1) {
      const a = items[i];
      const b = wanted.itens[i];
      if (Number(a.ordem) !== b.ordem) fail(`${code}: ordem divergente na posição ${i + 1}`);
      if (String(a.codigo) !== String(b.codigo)) fail(`${code}: código divergente na posição ${i + 1}`);
      if (normalized(a.nome) !== normalized(b.nome)) fail(`${code}: descrição divergente na posição ${i + 1}`);
      if (normalized(a.perna_pf ?? a.perna) !== normalized(b.perna)) {
        fail(`${code}: perna PF divergente na posição ${i + 1}`);
      }
      technicalCount += 1;
    }
  }
  if (technicalCount !== EXPECTED.technical) fail('vínculos técnicos incompletos');
  if (projection?.notechs?.length !== EXPECTED.notechs) fail('catálogo NOTECHS incompleto');
  return Object.freeze({
    sessions: actual.size,
    technical_links: technicalCount,
    notechs: EXPECTED.notechs,
    source_sha256: PTO_V18_SHA256,
    contract_sha256: contractSha256,
    level: 'CURRICULAR_PARITY_ONLY',
  });
}

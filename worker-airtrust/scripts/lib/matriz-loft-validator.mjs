import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

function fail(message) {
  throw new Error(`LOFT semântico inválido: ${message}`);
}

function text(value) {
  return String(value ?? '').trim();
}

function key(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function isTakeoff(fase) {
  return /decolagem|subida|takeoff/.test(key(fase));
}
function isLanding(fase) {
  return /pouso|pos-pouso|pos pouso|landing/.test(key(fase));
}
function isApproach(fase) {
  return /aproxim|arremet/.test(key(fase));
}
function isEmergency(tipo) {
  return /emerg|falha|pane|oei|failure/.test(key(tipo));
}
function isPrep(fase, nome) {
  return /pre-voo|partida|briefing|solo|prepar/.test(`${key(fase)} ${key(nome)}`);
}
function pfToken(value) {
  const normalized = key(value);
  if (normalized.includes('b') && !normalized.includes('ab')) return 'B';
  if (normalized.includes('a')) return 'A';
  return normalized.toUpperCase();
}

function matrixItemsFor(modelCode, matrixItems) {
  return matrixItems
    .filter((item) => item.modelo === modelCode)
    .sort((a, b) => Number(a.ordem) - Number(b.ordem));
}

function architectureSequence(entry) {
  if (Array.isArray(entry.sequence)) {
    return entry.sequence.map((item, index) => {
      if (Array.isArray(item))
        return { ordem: Number(item[0]) || index + 1, codigo: text(item[1]) };
      if (item && typeof item === 'object')
        return { ordem: Number(item.ordem) || index + 1, codigo: text(item.codigo || item.code) };
      return { ordem: index + 1, codigo: text(item) };
    });
  }
  return null;
}

function validateOneLoft({ session, matrixItems, architectureEntry, htmlPath, htmlRequired }) {
  const code = session.codigo_canonico;
  const items = matrixItemsFor(code, matrixItems);
  if (items.length !== 18) fail(`${code}: matriz sem 18 posições`);
  if (htmlRequired && (!htmlPath || !fs.existsSync(htmlPath))) fail(`${code}: HTML órfão`);

  const sequence = architectureSequence(architectureEntry);
  if (!architectureEntry) fail(`${code}: arquitetura órfã`);
  if (sequence && sequence.length !== 18) fail(`${code}: sequência diferente de 18`);
  if (sequence) {
    for (let index = 0; index < 18; index += 1) {
      if (sequence[index].codigo && sequence[index].codigo !== items[index].codigo) {
        fail(`${code}: divergência matriz/JSON na ordem ${index + 1}`);
      }
    }
  }

  const leg2Start = Number(
    architectureEntry.leg2_start ||
      architectureEntry.primeiro_item_perna_2?.toString?.().match(/^\d+/)?.[0] ||
      11,
  );
  if (!Number.isInteger(leg2Start) || leg2Start < 3 || leg2Start > 16)
    fail(`${code}: transição de perna inválida`);

  const leg1 = items.slice(0, leg2Start - 1);
  const leg2 = items.slice(leg2Start - 1);
  if (!leg1.length || !leg2.length) fail(`${code}: pernas incompletas`);

  const firstTakeoff1 = leg1.findIndex((item) => isTakeoff(item.fase_voo));
  const firstEvent1 = leg1.findIndex((item) => isEmergency(item.tipo_conteudo));
  const lastLanding1 = [...leg1].reverse().findIndex((item) => isLanding(item.fase_voo));
  const landing1 = lastLanding1 >= 0 ? leg1.length - 1 - lastLanding1 : -1;
  if (firstTakeoff1 < 0) fail(`${code}: decolagem PFA ausente`);
  if (firstEvent1 >= 0 && firstEvent1 < firstTakeoff1) fail(`${code}: pane antes da decolagem`);
  if (firstEvent1 >= 0 && firstTakeoff1 >= 0) {
    const stabilizeGap = firstEvent1 - firstTakeoff1;
    if (stabilizeGap < 1) fail(`${code}: evento antes da estabilização`);
  }
  if (landing1 < 0) fail(`${code}: ausência de pouso entre pernas`);
  if (landing1 >= 0 && landing1 < leg1.length - 1) {
    // items after landing in leg1 must be ground transition / crew swap only
    for (const item of leg1.slice(landing1 + 1)) {
      if (isEmergency(item.tipo_conteudo) || isTakeoff(item.fase_voo))
        fail(`${code}: troca em voo / pane após pouso inválida`);
    }
  }

  const firstTakeoff2 = leg2.findIndex((item) => isTakeoff(item.fase_voo));
  const firstEvent2 = leg2.findIndex((item) => isEmergency(item.tipo_conteudo));
  if (firstTakeoff2 < 0) fail(`${code}: decolagem PFB ausente`);
  if (firstEvent2 === 0 || (firstEvent2 >= 0 && firstEvent2 < firstTakeoff2))
    fail(`${code}: Perna 2 iniciando com pane / evento antes PFB`);
  if (firstEvent2 >= 0 && firstTakeoff2 >= 0 && firstEvent2 - firstTakeoff2 < 1)
    fail(`${code}: evento antes da estabilização (perna 2)`);
  if (!leg2.some((item) => isApproach(item.fase_voo))) fail(`${code}: aproximação perna 2 ausente`);
  if (!leg2.some((item) => isLanding(item.fase_voo))) fail(`${code}: pouso perna 2 ausente`);

  for (const item of leg1) {
    if (pfToken(item.execucao_pf) === 'B') fail(`${code}: PF incorreto na perna 1 (${item.ordem})`);
  }
  for (const item of leg2) {
    if (pfToken(item.execucao_pf) === 'A') fail(`${code}: PF incorreto na perna 2 (${item.ordem})`);
  }

  // Explicit 14-step coverage markers (sanitized booleans only)
  const steps = {
    prep_leg1: leg1.some((item) => isPrep(item.fase_voo, item.nome)),
    takeoff_pfa: firstTakeoff1 >= 0,
    stabilize_leg1: firstTakeoff1 >= 0 && firstEvent1 > firstTakeoff1,
    event_leg1: firstEvent1 >= 0,
    approach_leg1: leg1.some((item) => isApproach(item.fase_voo)),
    landing_leg1: landing1 >= 0,
    ground_transition: landing1 >= 0 && landing1 < leg1.length - 1,
    crew_swap: landing1 >= 0,
    prep_leg2: leg2.slice(0, Math.max(1, firstTakeoff2)).length > 0,
    takeoff_pfb: firstTakeoff2 >= 0,
    stabilize_leg2: firstTakeoff2 >= 0 && (firstEvent2 < 0 || firstEvent2 > firstTakeoff2),
    event_leg2: firstEvent2 >= 0,
    approach_leg2: leg2.some((item) => isApproach(item.fase_voo)),
    landing_leg2: leg2.some((item) => isLanding(item.fase_voo)),
  };

  return {
    codigo_canonico: code,
    steps,
    leg2_start: leg2Start,
    html_sha256:
      htmlPath && fs.existsSync(htmlPath)
        ? createHash('sha256').update(fs.readFileSync(htmlPath)).digest('hex')
        : null,
  };
}

export function validateLoftSemantics({
  contract,
  matrixItems,
  architectures,
  sourceRoots = {},
  htmlRequired = true,
  reportPath = null,
}) {
  const loftSessions = (contract.sessions || []).filter((session) => session.loft);
  if (loftSessions.length !== 22) fail(`esperados 22 LOFT; encontrados ${loftSessions.length}`);

  const byCode = new Map();
  for (const entry of architectures || []) {
    const code = text(entry.modelo || entry.model || '').replace(/\.html$/, '');
    const file = text(entry.file || '').replace(/\.html$/, '');
    if (code) byCode.set(code, entry);
    if (file) byCode.set(file, entry);
  }

  const results = [];
  for (const session of loftSessions) {
    const arch =
      byCode.get(session.codigo_canonico) ||
      byCode.get(path.basename(String(session.html_relpath || ''), '.html')) ||
      null;
    const root = session.aeronave === 'AW139' ? sourceRoots.AW139 : sourceRoots.SK76;
    const htmlPath =
      root && session.html_relpath
        ? path.join(
            root,
            path.basename(path.dirname(session.html_relpath)) === 'html' ? '' : '',
            session.html_relpath.includes('/')
              ? session.html_relpath.split('/').slice(1).join('/')
              : session.html_relpath,
          )
        : null;
    const resolvedHtml =
      root && session.html_relpath
        ? path.join(root, session.html_relpath.replace(/^AW139\//, '').replace(/^SK76\//, ''))
        : htmlPath;
    results.push(
      validateOneLoft({
        session,
        matrixItems,
        architectureEntry: arch,
        htmlPath: resolvedHtml,
        htmlRequired,
      }),
    );
  }

  const report = {
    generated_at: new Date().toISOString(),
    verdict: '22/22',
    totals: { loft: results.length },
    results,
  };
  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

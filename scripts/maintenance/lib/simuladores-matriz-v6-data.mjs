import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');

const DOC_V62 = path.join(ROOT, 'docs', 'analysis', 'airtrust_matriz_v6_2_todas_sessoes_manobras_final.md');
const NOTECHS_SUMMARY = path.join(
  ROOT,
  'docs',
  'analysis',
  'NOTECHS_MODELOS_MANOBRAS_SUMMARY_20260702.md',
);
const SOURCE_MAP = path.join(
  ROOT,
  'scripts',
  'operations',
  'modelos-sessao-manobras-empresa6-source-map.json',
);

const MODEL_HEADING_RE = /^##\s+([A-Z0-9/-]+)\s+—\s+(.+)$/;
const APPROVED_CODE_RE = /^(A139|S76|76|CAU|WAR|OPS|FLY|LOFT|NOTECHS|INV|EXA)-/;
const TERMINAL_CODE_RE = /(-EST-|S76-FLU-01$|OPS-OFF-X3$)/;
const FORBIDDEN_TECHNICAL_CODE_RE = /^(NOTECHS-|INV-CRM-|EXA-NTS-)/;

const RPEA_ALIAS_MAP = {
  '690-2.43BA': '690-2.43BB',
  '690-2.43C.1A': '690-2.43C.1B',
  '690-2.43C.2': '690-2.43C.2A',
  '690-2.44C.1C': '690-2.44C.1E',
  '690-2.44C.3': '690-2.44C.3B',
  '690-2.45BA': '690-2.45BB',
};

export const RPEA_PENDING_GAPS = [
  {
    item: '690-2.50C.2',
    descricao: 'Variacao de aproximacao/pouso offshore para embarcacao pequena/media em movimento',
    status: 'PENDENTE_OWNER',
  },
  {
    item: '690-2.51C.1',
    descricao: 'Control guarding durante embarque/desembarque com rotores girando',
    status: 'TREINAMENTO_OPERACIONAL_SEPARADO',
  },
  {
    item: '690-2.51C.2',
    descricao: 'Restricao fisica dos comandos quando o outro piloto sai/retorna do assento',
    status: 'TREINAMENTO_OPERACIONAL_SEPARADO',
  },
  {
    item: '690-2.43C.2A',
    descricao: 'Fidelidade visual FSTD / fonte Journey Logs incompativel',
    status: 'PENDENTE_FONTE',
  },
];

export function normalizeRpeaAlias(code) {
  const trimmed = String(code || '').trim();
  return RPEA_ALIAS_MAP[trimmed] || trimmed;
}

function resolveV62Path() {
  if (!fs.existsSync(DOC_V62)) {
    throw new Error(`matriz_v6_2_source_not_found:${DOC_V62}`);
  }
  return DOC_V62;
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function inferAircraft(modelCode) {
  if (modelCode === 'TRE-INST' || modelCode === 'CRED-EXA') return 'N/A';
  return modelCode.startsWith('A139-') ? 'AW139' : 'SK76';
}

function inferKind(modelCode) {
  if (modelCode.includes('-I-')) return 'inicial';
  if (modelCode.includes('-P-')) return 'periodico';
  if (modelCode === 'TRE-INST') return 'instrutor';
  if (modelCode === 'CRED-EXA') return 'examinador';
  return 'outro';
}

function inferCategoria(codigo) {
  if (codigo.startsWith('NOTECHS-')) return 'NOTECHS';
  if (codigo.startsWith('LOFT-')) return 'LOFT';
  if (/CKL|QRH|ECL/.test(codigo)) return 'PROCEDIMENTO';
  if (/APP|APX|ILS|VOR|RNV|LDP|TDP|POU|APO|ARN|MIS|EST|FLU|DIT/.test(codigo)) return 'POUSO';
  if (/MOT|OEI|EEC|DECU|FIR|FUM|SMK|AUT|RPM|MGB|TR|SER|HYD|HYP|FAL|FAIL|FIRE|LOW|HIG/.test(codigo)) {
    return 'EMERGENCIA';
  }
  return 'TREINAMENTO';
}

function parseMarkdownTables(text) {
  const sections = [];
  const lines = text.split(/\r?\n/);
  let current = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(MODEL_HEADING_RE);
    if (match) {
      current = {
        modelCode: match[1].trim(),
        modelName: match[2].trim(),
        notes: [],
        table: [],
      };
      sections.push(current);
      continue;
    }

    if (!current) continue;

    if (line.startsWith('>')) {
      current.notes.push(line.replace(/^>\s?/, '').trim());
      continue;
    }

    if (/^\|/.test(line) && lines[index + 1] && /^\|[-\s:|]+\|?$/.test(lines[index + 1])) {
      index += 1;
      while (lines[index + 1] && /^\|/.test(lines[index + 1])) {
        index += 1;
        current.table.push(
          lines[index]
            .split('|')
            .slice(1, -1)
            .map((cell) => cell.trim()),
        );
      }
    }
  }

  return sections.filter((section) => section.table.length > 0);
}

function buildRegistry(models, sourceFile) {
  const registry = new Map();

  for (const model of models) {
    for (const row of model.rows) {
      const existing = registry.get(row.codigo);
      const next = {
        codigo: row.codigo,
        nome: row.nome,
        fase_voo: row.fase_voo,
        fap_refs: row.fap_refs || '-',
        tipo_aeronave: model.aircraft,
        tipo_sessao: 'TREINAMENTO',
        categoria: inferCategoria(row.codigo),
        origem_documental: sourceFile,
      };

      if (!existing) {
        registry.set(row.codigo, next);
        continue;
      }

      if ((!existing.nome || existing.nome === '-') && next.nome) existing.nome = next.nome;
      if ((!existing.fase_voo || existing.fase_voo === '-') && next.fase_voo) existing.fase_voo = next.fase_voo;
    }
  }

  return registry;
}

function buildModels() {
  const docPath = resolveV62Path();
  const sourceFile = path.basename(docPath);
  const sections = parseMarkdownTables(read(docPath));

  return {
    sourceFile,
    docPath,
    models: sections.map((section) => {
      const aircraft = inferAircraft(section.modelCode);
      const isEvaluative = /check/i.test(section.modelName) || section.notes.some((note) => /avaliativ/i.test(note));
      const loftByCode = section.table.some((row) => /^LOFT-(CHK|OFF|NOT)-/.test(row[1]));
      const loftByStructuredNote = section.notes.some((note) => /enquadramento loft/i.test(note));

      return {
        modelCode: section.modelCode,
        modelName: section.modelName,
        aircraft,
        kind: inferKind(section.modelCode),
        sourceFile,
        sourceHeading: `${section.modelCode} — ${section.modelName}`,
        sourceNotes: [...section.notes],
        loftScenario: loftByStructuredNote,
        loftEvidence: loftByCode || loftByStructuredNote,
        rows: section.table.map((row) => ({
          ordem: Number(row[0]),
          codigo: row[1],
          nome: row[2],
          fase_voo: row[3],
          fap_refs: '-',
          observacao: '',
          carater: isEvaluative ? 'avaliativo' : 'treinamento',
        })),
      };
    }),
  };
}

function validateModels(models) {
  const issues = [];
  const modelCodes = new Set();

  for (const model of models) {
    if (modelCodes.has(model.modelCode)) {
      issues.push(`duplicate_model:${model.modelCode}`);
    }
    modelCodes.add(model.modelCode);

    if (model.rows.length !== 18) {
      issues.push(`row_count:${model.modelCode}:${model.rows.length}`);
    }

    const codes = model.rows.map((row) => row.codigo);
    if (/loft/i.test(model.modelName) && !model.loftEvidence) {
      issues.push(`loft_without_evidence:${model.modelCode}`);
    }
    if (new Set(codes).size !== codes.length) {
      issues.push(`duplicate_codes:${model.modelCode}`);
    }

    for (const row of model.rows) {
      if (!APPROVED_CODE_RE.test(row.codigo)) {
        issues.push(`rogue_code:${model.modelCode}:${row.codigo}`);
      }
      if (FORBIDDEN_TECHNICAL_CODE_RE.test(row.codigo)) {
        issues.push(`forbidden_technical_code:${model.modelCode}:${row.codigo}`);
      }
      if (/(?:FAP\d|FAP[ ._]\d|FCOM|FDM|Rev\.|Página|Pagina)/i.test(row.codigo)) {
        issues.push(`manual_ref_in_code:${model.modelCode}:${row.codigo}`);
      }
      if (
        /[Tt]ipo_item|fase_voo|carater|matriz_v6_modelo|V4\.1|renomeado|validar se fica/.test(
          `${row.nome} ${row.fase_voo || ''}`,
        )
      ) {
        issues.push(`metadata_in_name:${model.modelCode}:${row.codigo}`);
      }
    }

    if (
      model.aircraft === 'AW139' &&
      codes.some((codigo) => codigo.startsWith('S76-') || codigo.startsWith('76-'))
    ) {
      issues.push(`aircraft_mix:${model.modelCode}:contains_s76`);
    }
    if (
      model.aircraft === 'SK76' &&
      codes.some((codigo) => codigo.startsWith('A139-') || codigo.startsWith('CAU-') || codigo.startsWith('WAR-'))
    ) {
      issues.push(`aircraft_mix:${model.modelCode}:contains_aw139`);
    }

    const terminalIndex = model.rows.findIndex((row) => TERMINAL_CODE_RE.test(row.codigo));
    if (terminalIndex !== -1 && terminalIndex !== model.rows.length - 1) {
      issues.push(`terminal_not_last:${model.modelCode}:${model.rows[terminalIndex].codigo}`);
    }
  }

  return issues;
}

function readSourceMapSummary() {
  if (!fs.existsSync(SOURCE_MAP)) {
    return { allowlistModels: [], currentRows: [], meta: {} };
  }
  const sourceMap = JSON.parse(read(SOURCE_MAP));
  return {
    allowlistModels: sourceMap.allowlist_models || [],
    currentRows: sourceMap.rows || [],
    meta: sourceMap.meta || {},
  };
}

function buildRpeaReferenceEntries(row) {
  if (!Array.isArray(row.rpea_refs) || row.rpea_refs.length === 0) return [];
  return row.rpea_refs.map((code) => ({
    tipo: 'OUTRO',
    documento: 'RPEA/PQ-C IOGP 690-2',
    item: normalizeRpeaAlias(code),
    descricao: row.nome,
    url: null,
    status: 'CONFIRMADA',
  }));
}

const STRUCTURED_SOURCE_PATTERN =
  /^(FAP\s*\d+(?:\.\d+)?|RBAC\s*\d+|IS\s*\d+(?:-\d+)?[A-Z]?)\s*(.*)$/i;

function classifySourceToken(token) {
  const structured = token.match(STRUCTURED_SOURCE_PATTERN);
  if (structured) {
    const documento = structured[1].replace(/\s+/g, ' ').trim();
    const item = structured[2] ? structured[2].trim() || null : null;
    const upper = documento.toUpperCase();
    const tipo = upper.startsWith('FAP') ? 'FAP' : upper.startsWith('RBAC') ? 'RBAC' : 'IS';
    return { tipo, documento, item, status: 'CONFIRMADA' };
  }

  const upper = token.toUpperCase();
  const documento = token.trim();
  if (upper.startsWith('PTO')) return { tipo: 'PTO', documento, item: null, status: 'FONTE_OPERADOR' };
  if (upper.startsWith('QRH')) return { tipo: 'QRH', documento, item: null, status: 'FONTE_OPERADOR' };
  if (upper.startsWith('AFM')) return { tipo: 'AFM', documento, item: null, status: 'FONTE_OPERADOR' };
  if (upper.startsWith('FCTM')) return { tipo: 'FCTM', documento, item: null, status: 'FONTE_OPERADOR' };
  if (upper.startsWith('MGO')) return { tipo: 'MGO', documento, item: null, status: 'FONTE_OPERADOR' };
  if (upper.startsWith('MOM')) return { tipo: 'MOM', documento, item: null, status: 'FONTE_OPERADOR' };
  if (upper.startsWith('SOP') || upper.startsWith('FTV') || upper.startsWith('PRG-OPS')) {
    return { tipo: 'OPERADOR', documento, item: null, status: 'FONTE_OPERADOR' };
  }
  return null;
}

export function buildRowReferencias(row) {
  const refs = [];
  const value = String(row.fap_refs || '').trim();
  if (value && value !== '-') {
    for (const token of value.split(',').map((item) => item.trim()).filter(Boolean)) {
      const classified = classifySourceToken(token) || {
        tipo: 'OUTRO',
        documento: token,
        item: null,
        status: 'CONFIRMADA',
      };
      refs.push({ ...classified, descricao: row.nome, url: null });
    }
  }

  if (refs.length === 0 && /^(76-|S76-)/.test(row.codigo) && inferCategoria(row.codigo) === 'EMERGENCIA') {
    refs.push({
      tipo: 'OPERADOR',
      documento: 'QRH/AFM/FCTM/MGO/MOM',
      item: null,
      descricao: row.nome,
      url: null,
      status: 'FONTE_OPERADOR',
    });
  }

  refs.push(...buildRpeaReferenceEntries(row));
  return refs.length ? refs : null;
}

export function buildModelMetadataObservacoes(_model, row) {
  return String(row.observacao || '').trim();
}

export function loadSimuladoresMatrizV6Data() {
  const { models, sourceFile, docPath } = buildModels();
  const issues = validateModels(models);
  const registry = buildRegistry(models, sourceFile);
  const notechsSummary = fs.existsSync(NOTECHS_SUMMARY) ? read(NOTECHS_SUMMARY) : '';
  const sourceMapSummary = readSourceMapSummary();

  return {
    generatedAt: new Date().toISOString(),
    sourceFile,
    sourcePath: docPath,
    models,
    registry,
    issues,
    rpeaPendingGaps: RPEA_PENDING_GAPS.map((gap) => ({ ...gap })),
    notechsCodes: Array.from({ length: 15 }, (_, index) => `NOTECHS-${String(index + 1).padStart(2, '0')}`),
    notechsSummary,
    sourceMapSummary,
  };
}

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');

const DOC_V5 = path.join(ROOT, 'docs', 'analysis', 'COSTA_DO_SOL_MATRIZ_V5_FINAL_REVISAVEL_20260703.md');
const DOC_V3 = path.join(ROOT, 'docs', 'analysis', 'COSTA_DO_SOL_MATRIZ_V3_FINAL_REVISAVEL_20260703.md');
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

const EXPLICIT_MANEUVERS = {
  'A139-PNO-01': {
    codigo: 'A139-PNO-01',
    nome: 'Pouso normal',
    fase_voo: 'pouso',
    fap_refs: 'FAP05.2 H4.3',
    tipo_aeronave: 'AW139',
    tipo_sessao: 'TREINAMENTO',
    categoria: 'POUSO',
    origem_documental: 'V6 correcao adicional de unicidade',
  },
  'A139-AUT-02': {
    codigo: 'A139-AUT-02',
    nome: 'Flare e recuperação avançada da autorrotação',
    fase_voo: 'autorrotacao',
    fap_refs: '-',
    tipo_aeronave: 'AW139',
    tipo_sessao: 'TREINAMENTO',
    categoria: 'EMERGENCIA',
    origem_documental: 'V6 variacao tecnica real para evitar duplicidade',
  },
  'A139-RPM-02': {
    codigo: 'A139-RPM-02',
    nome: 'Gerenciamento avançado de energia e RPM em flare/recuperação',
    fase_voo: 'autorrotacao',
    fap_refs: '-',
    tipo_aeronave: 'AW139',
    tipo_sessao: 'TREINAMENTO',
    categoria: 'EMERGENCIA',
    origem_documental: 'V6 variacao tecnica real para evitar duplicidade',
  },
};

const REPLACEMENTS = {
  'SK76-I-03/12': {
    16: { codigo: 'S76-ILS-00' },
    17: { codigo: 'S76-VOR-00' },
    18: { codigo: 'S76-CKL-01' },
  },
  'SK76-I-05/12': {
    17: { codigo: '76-DUACZ' },
    18: { codigo: 'S76-CKL-01' },
  },
  'SK76-I-06/12': {
    17: { codigo: '76-MOTCZ' },
    18: { codigo: 'S76-CKL-02' },
  },
  'SK76-I-08/12': {
    17: { codigo: 'S76-MGL-33' },
    18: { codigo: 'S76-MOH-35' },
  },
  'SK76-I-09/12': {
    17: { codigo: 'S76-SFE-10' },
    18: { codigo: 'S76-BCS-10' },
  },
  'SK76-I-10/12': {
    17: { codigo: 'S76-LDP-00' },
    18: { codigo: '76-APXAL' },
  },
  'A139-I-01/12': {
    16: { codigo: 'A139-PNO-01' },
  },
  'A139-I-03/12': {
    17: { codigo: 'A139-MOD-01' },
    18: { codigo: 'A139-FMA-02' },
  },
  'A139-I-05/12': {
    17: { codigo: 'WAR-IDL-16' },
    18: { codigo: 'A139-CKL-02' },
  },
  'A139-I-06/12': {
    17: { codigo: 'A139-CKL-03' },
    18: { codigo: 'A139-OEI-01' },
  },
  'A139-I-07/12': {
    17: { codigo: 'CAU-APO-38' },
    18: { codigo: 'A139-MOD-01' },
  },
  'A139-I-08/12': {
    17: { codigo: 'A139-AUT-02' },
    18: { codigo: 'A139-RPM-02' },
  },
  'A139-I-09/12': {
    17: { codigo: 'CAU-2FP-74' },
    18: { codigo: 'CAU-EFP-75' },
  },
};

const SHARED_PERIODIC_MODELS = new Set(['SK76-P-CHECK', 'A139-P-LOFT/CHECK', 'A139-P-LOFT/OFFSHORE']);

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function stripTicks(value) {
  return String(value || '').replace(/`/g, '').trim();
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseMarkdownTables(text, headingMatcher) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let current = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = headingMatcher(line);
    if (heading) {
      current = { heading, lines: [], table: [] };
      sections.push(current);
      continue;
    }

    if (current) {
      current.lines.push(line);
      if (/^\|/.test(line) && lines[index + 1] && /^\|---/.test(lines[index + 1])) {
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
  }

  return sections;
}

function extractSectionRange(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`missing_section_start:${startMarker}`);
  }
  const end = endMarker ? text.indexOf(endMarker, start) : -1;
  return end === -1 ? text.slice(start) : text.slice(start, end);
}

function buildRegistryFromSources() {
  const registry = new Map();

  function add(entry) {
    const existing = registry.get(entry.codigo);
    if (!existing) {
      registry.set(entry.codigo, entry);
      return;
    }

    for (const key of ['nome', 'fase_voo', 'fap_refs', 'tipo_aeronave', 'categoria', 'origem_documental']) {
      if ((!existing[key] || existing[key] === '-') && entry[key] && entry[key] !== '-') {
        existing[key] = entry[key];
      }
    }
  }

  for (const entry of Object.values(EXPLICIT_MANEUVERS)) {
    add({ ...entry });
  }

  const initialText = extractSectionRange(
    read(DOC_V5),
    '## 5. Matriz final S76/SK76 Inicial',
    '## 7. Matriz S76/SK76 Periodico',
  );
  const initialSections = parseMarkdownTables(initialText, (line) =>
    line.startsWith('### Sessao') ? line.slice(4).trim() : null,
  );

  let aircraft = 'SK76';
  for (const section of initialSections) {
    if (section.heading.includes('AW139') || section.lines.some((line) => line.includes('AW139'))) {
      aircraft = 'AW139';
    }
    for (const row of section.table) {
      if (row.length < 9) continue;
      add({
        codigo: stripTicks(row[1]),
        nome: stripTicks(row[2]),
        fase_voo: stripTicks(row[3]),
        fap_refs: stripTicks(row[7] || '-'),
        tipo_aeronave: aircraft,
        categoria: inferCategoria(stripTicks(row[1])),
        origem_documental: path.basename(DOC_V5),
      });
    }
  }

  const periodicSections = parseMarkdownTables(read(DOC_V3), (line) =>
    line.startsWith('### ') ? line.slice(4).trim() : null,
  );
  for (const section of periodicSections) {
    for (const row of section.table) {
      if (row.length < 9) continue;
      add({
        codigo: stripTicks(row[1]),
        nome: stripTicks(row[2]),
        fase_voo: '',
        fap_refs: stripTicks(row[6] || '-'),
        tipo_aeronave: inferAircraftFromCode(stripTicks(row[1])),
        categoria: inferCategoria(stripTicks(row[1])),
        origem_documental: path.basename(DOC_V3),
      });
    }
  }

  add({
    codigo: 'S76-VOR-00',
    nome: 'Aproximação VOR/NDB',
    fase_voo: 'aproximacao_ifr',
    fap_refs: 'FAP06 IAP2.2',
    tipo_aeronave: 'SK76',
    categoria: 'POUSO',
    origem_documental: '0262_sk76_periodico_ciclos.sql',
  });
  add({
    codigo: 'S76-LDP-00',
    nome: 'Pouso Classe 2 - Helideck (Committal Point)',
    fase_voo: 'aproximacao_offshore',
    fap_refs: 'FAP14 Offshore',
    tipo_aeronave: 'SK76',
    categoria: 'POUSO',
    origem_documental: '0262_sk76_periodico_ciclos.sql',
  });

  return registry;
}

function inferCategoria(codigo) {
  if (codigo.startsWith('NOTECHS-')) return 'NOTECHS';
  if (codigo.includes('LOFT')) return 'LOFT';
  if (/CKL|QRH|ECL/.test(codigo)) return 'PROCEDIMENTO';
  if (/APP|APX|ILS|VOR|RNV|LDP|TDP|POU|APO|ARO|MIS/.test(codigo)) return 'POUSO';
  if (/MOT|OEI|EEC|DECU|FIR|FUM|SMK|AUT|RPM|MGB|TR|SER|HYD|HYP/.test(codigo)) return 'EMERGENCIA';
  return 'TREINAMENTO';
}

function inferAircraftFromCode(codigo) {
  if (codigo.startsWith('A139') || codigo.startsWith('CAU-') || codigo.startsWith('WAR-') || codigo.startsWith('OPS-') || codigo.startsWith('FLY-')) {
    return 'AW139';
  }
  if (codigo.startsWith('S76') || codigo.startsWith('76-')) {
    return 'SK76';
  }
  return 'MISTO';
}

function normalizeObservation(text) {
  const value = stripTicks(text || '');
  return value === '-' ? '' : value;
}

function buildInitialModels(registry) {
  const initialText = extractSectionRange(
    read(DOC_V5),
    '## 5. Matriz final S76/SK76 Inicial',
    '## 7. Matriz S76/SK76 Periodico',
  );
  const sections = parseMarkdownTables(initialText, (line) =>
    line.startsWith('### Sessao') ? line.slice(4).trim() : null,
  );
  const models = [];
  let sectionName = 'SK76';

  for (const section of sections) {
    if (section.heading.includes('Familiarização / Checklist Normal / Voo Normal') && models.length >= 12) {
      sectionName = 'AW139';
    }
    if (section.table.length === 0) continue;
    const match = section.heading.match(/Sessao\s+(\d{2})\/12\s+—\s+(.+)$/i);
    if (!match) continue;

    const number = match[1];
    const title = match[2];
    const modelCode = sectionName === 'AW139' ? `A139-I-${number}/12` : `SK76-I-${number}/12`;
    const aircraft = sectionName === 'AW139' ? 'AW139' : 'SK76';
    const rows = section.table.map((row) => ({
      ordem: Number(row[0]),
      codigo: stripTicks(row[1]),
      nome: stripTicks(row[2]),
      fase_voo: stripTicks(row[3]),
      fap_refs: stripTicks(row[7] || '-'),
      observacao: normalizeObservation(row[8]),
      carater: number === '12' ? 'avaliativo' : 'treinamento',
    }));

    models.push({
      modelCode,
      modelName: `${number}/12 - ${title}`,
      aircraft,
      kind: 'inicial',
      sourceFile: path.basename(DOC_V5),
      sourceHeading: section.heading,
      rows,
    });
  }

  return applyReplacements(models, registry);
}

function buildPeriodicModels(registry) {
  const sections = parseMarkdownTables(read(DOC_V3), (line) =>
    line.startsWith('### ') ? line.slice(4).trim() : null,
  );
  const models = [];

  for (const section of sections) {
    if (!section.heading.startsWith('Ciclo ')) continue;
    const modelLine = section.lines.find((line) => line.includes('Modelo-base auditado:'));
    if (!modelLine || section.table.length === 0) continue;
    const modelCode = stripTicks(modelLine.split(':').slice(1).join(':').replace(/\.$/, ''));
    const aircraft = modelCode.startsWith('A139') ? 'AW139' : 'SK76';
    const rows = section.table.map((row) => ({
      ordem: Number(row[0]),
      codigo: stripTicks(row[1]),
      nome: stripTicks(row[2]),
      fase_voo: '',
      fap_refs: stripTicks(row[6] || '-'),
      observacao: normalizeObservation(row[8]),
      carater: modelCode.includes('CHECK') ? 'avaliativo' : 'treinamento',
    }));

    for (const row of rows) {
      if (row.codigo === 'S76-LOFT-15') {
        row.nome = 'Aplicacao do ECL';
      }
    }

    const existing = models.find((item) => item.modelCode === modelCode);
    if (!existing) {
      models.push({
        modelCode,
        modelName: section.heading,
        aircraft,
        kind: 'periodico',
        sourceFile: path.basename(DOC_V3),
        sourceHeading: section.heading,
        rows,
      });
      continue;
    }

    // Mantem somente a primeira definicao idêntica por modelo reutilizado.
    const existingSignature = JSON.stringify(
      existing.rows.map((row) => [row.ordem, row.codigo, row.carater]),
    );
    const incomingSignature = JSON.stringify(rows.map((row) => [row.ordem, row.codigo, row.carater]));
    if (existingSignature !== incomingSignature && !SHARED_PERIODIC_MODELS.has(modelCode)) {
      throw new Error(`periodic_model_conflict:${modelCode}`);
    }
  }

  return applyReplacements(models, registry);
}

function applyReplacements(models, registry) {
  return models.map((model) => {
    const replacementByOrder = REPLACEMENTS[model.modelCode] || {};
    const rows = model.rows.map((row) => {
      const override = replacementByOrder[row.ordem];
      if (!override) return row;
      const explicit = EXPLICIT_MANEUVERS[override.codigo];
      const ref = explicit || registry.get(override.codigo);
      if (!ref) {
        throw new Error(`missing_replacement_reference:${model.modelCode}:${row.ordem}:${override.codigo}`);
      }

      return {
        ...row,
        codigo: override.codigo,
        nome: override.nome || ref.nome,
        fase_voo: override.fase_voo || ref.fase_voo || row.fase_voo,
        fap_refs: override.fap_refs || ref.fap_refs || row.fap_refs,
        observacao: row.observacao,
      };
    });

    return { ...model, rows };
  });
}

function validateModels(models) {
  const issues = [];
  for (const model of models) {
    if (model.rows.length !== 18) {
      issues.push(`row_count:${model.modelCode}:${model.rows.length}`);
    }
    const codes = model.rows.map((row) => row.codigo);
    const uniqueCodes = new Set(codes);
    if (uniqueCodes.size !== codes.length) {
      issues.push(`duplicate_codes:${model.modelCode}`);
    }
    if (model.aircraft === 'AW139' && codes.some((code) => code.startsWith('S76') || code.startsWith('76-'))) {
      issues.push(`aircraft_mix:${model.modelCode}:contains_s76`);
    }
    if (model.aircraft === 'SK76' && codes.some((code) => code.startsWith('A139') || code.startsWith('CAU-') || code.startsWith('WAR-'))) {
      issues.push(`aircraft_mix:${model.modelCode}:contains_aw139`);
    }
  }
  return issues;
}

function readSourceMapSummary() {
  const sourceMap = JSON.parse(read(SOURCE_MAP));
  return {
    allowlistModels: sourceMap.allowlist_models || [],
    currentRows: sourceMap.rows || [],
    meta: sourceMap.meta || {},
  };
}

export function loadSimuladoresMatrizV6Data() {
  const registry = buildRegistryFromSources();
  const initialModels = buildInitialModels(registry);
  const periodicModels = buildPeriodicModels(registry);
  const models = [...initialModels, ...periodicModels];
  const issues = validateModels(models);
  const notechsSummary = read(NOTECHS_SUMMARY);
  const sourceMapSummary = readSourceMapSummary();

  return {
    generatedAt: new Date().toISOString(),
    models,
    registry,
    issues,
    notechsCodes: Array.from({ length: 15 }, (_, index) => `NOTECHS-${String(index + 1).padStart(2, '0')}`),
    notechsSummary,
    sourceMapSummary,
  };
}

export function buildModelMetadataObservacoes(model, row) {
  const parts = [`tipo_item=tecnica`];
  if (row.fase_voo) parts.push(`fase_voo=${slugify(row.fase_voo)}`);
  if (row.carater) parts.push(`carater=${row.carater}`);
  if (row.fap_refs && row.fap_refs !== '-') parts.push(`fap_refs=${row.fap_refs.replace(/\s+/g, '')}`);
  if (row.observacao) parts.push(`nota=${row.observacao.replace(/;/g, ',')}`);
  parts.push(`matriz_v6_modelo=${model.modelCode}`);
  return parts.join('; ');
}

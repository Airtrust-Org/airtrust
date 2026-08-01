#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PTO_REV10_VERSION = 'PTO-REV10-2026-07-30';
export const PTO_REV10_PROVENANCE_FIELDS = Object.freeze([
  'sessao_anterior',
  'codigo_anterior',
  'descricao_anterior',
  'alias_substituicao',
]);

const REQUIRED_FILES = Object.freeze([
  'sessoes.json',
  'matriz_tecnica.json',
  'catalogo_codigos.json',
  'catalogo_notechs.json',
  'matriz_notechs.json',
  'catalogo_codigos_instrutor_examinador.json',
  'MAPEAMENTO_IMPORTACAO_AIRTRUST.json',
  'VALIDACAO_PTO_REV10.json',
]);

function fail(message) {
  throw new Error(`Pacote PTO Rev10 recusado: ${message}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function nonEmpty(value, label) {
  const result = String(value ?? '').trim();
  if (!result) fail(`${label} ausente`);
  return result;
}

function integer(value, label) {
  const result = Number(value);
  if (!Number.isInteger(result)) fail(`${label} não é inteiro`);
  return result;
}

function stripProvenance(value) {
  if (Array.isArray(value)) return value.map(stripProvenance);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PTO_REV10_PROVENANCE_FIELDS.includes(key))
      .map(([key, child]) => [key, stripProvenance(child)]),
  );
}

export function durationMinutesFromCanonicalLoad(load) {
  const value = nonEmpty(load, 'carga_sessao');
  if (value === '1 hora') return 60;
  if (value === '2 horas') return 120;
  if (value === '3 horas') return 180;
  if (value.startsWith('4 horas por tripulação:')) return 240;
  if (value.startsWith('1 hora prática')) return 60;
  if (value.startsWith('90 minutos')) return 90;
  if (value.startsWith('Integrada às 9 horas do ciclo; sem carga adicional de FFS')) return 0;
  fail(`carga_sessao não reconhecida: ${value}`);
}

export function structuredSessionType(program, nature) {
  const p = nonEmpty(program, 'programa')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const n = nonEmpty(nature, 'natureza_sessao')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (n.startsWith('VERIFICACAO')) return 'CHECK';
  if (p === 'INICIAL') return 'INICIAL';
  if (p === 'PERIODICO') return 'PERIODICO';
  if (p === 'SEMESTRAL') return 'SEMESTRAL';
  if (p === 'REQUALIFICACAO') return 'REQUALIFICACAO';
  if (p === 'ELEVACAO DE NIVEL') return 'ELEVACAO_NIVEL';
  if (p === 'REAQUISICAO DE EXPERIENCIA RECENTE') return 'EXPERIENCIA_RECENTE';
  if (p === 'TREINAMENTO NOTURNO') return 'NOTURNO';
  fail(`programa/natureza não reconhecidos: ${program}/${nature}`);
}

function tripulanteFromPerna(value) {
  const normalized = String(value || '').toUpperCase();
  if (/PF\s*A\b/.test(normalized) && !/PF\s*B\b/.test(normalized)) return 'A';
  if (/PF\s*B\b/.test(normalized) && !/PF\s*A\b/.test(normalized)) return 'B';
  return 'AB';
}

function legacySourcesBySession(technicalRows) {
  const result = new Map();
  for (const row of technicalRows) {
    const current = nonEmpty(row.sessao, 'matriz_tecnica/sessao');
    const previous = String(row.sessao_anterior || '').trim();
    if (!previous || previous === current) continue;
    if (!result.has(current)) result.set(current, new Set());
    result.get(current).add(previous);
  }
  return result;
}

function verifyPackageFiles(packageDir, packageManifest, aircraft) {
  if (!fs.existsSync(packageDir) || !fs.statSync(packageDir).isDirectory()) {
    fail(`${aircraft}: diretório inexistente`);
  }
  for (const fileName of REQUIRED_FILES) {
    const filePath = path.join(packageDir, fileName);
    if (!fs.existsSync(filePath)) fail(`${aircraft}: arquivo ausente ${fileName}`);
    const expected = packageManifest.files?.[fileName];
    if (!expected) fail(`${aircraft}: hash não declarado para ${fileName}`);
    const actual = sha256File(filePath);
    if (actual !== expected) fail(`${aircraft}: checksum divergente em ${fileName}`);
  }
}

const FUNCTIONAL_SESSION_DEFINITIONS = Object.freeze({
  'INST-E01': {
    titulo: 'Treinamento Prático de Instrutor 1/2 — Procedimentos Normais e Técnica de Instrução',
    programa: 'Treinamento de Instrutor',
    natureza: 'Instrução prática',
    tipo_estruturado: 'INSTRUTOR',
    carga_sessao: '1 hora',
    duracao_estimada_minutos: 60,
    ordem_curricular: 1,
    legacy_source_codes: [],
  },
  'INST-E02': {
    titulo: 'Treinamento Prático de Instrutor 2/2 — Procedimentos Anormais, Emergências e Atuação Integrada do Instrutor',
    programa: 'Treinamento de Instrutor',
    natureza: 'Instrução prática',
    tipo_estruturado: 'INSTRUTOR',
    carga_sessao: '2 horas',
    duracao_estimada_minutos: 120,
    ordem_curricular: 2,
    legacy_source_codes: [],
  },
  'EXA-01/04': {
    titulo: 'Treinamento Prático de Examinador 1/4 — Procedimentos Normais e Condução sem Coaching',
    programa: 'Treinamento de Examinador',
    natureza: 'Instrução prática',
    tipo_estruturado: 'EXAMINADOR',
    carga_sessao: '1 hora',
    duracao_estimada_minutos: 60,
    ordem_curricular: 3,
    legacy_source_codes: ['EXA-E01', 'EXA-V01'],
  },
  'EXA-02/04': {
    titulo: 'Treinamento Prático de Examinador 2/4 — Procedimentos Não Normais e Avaliação',
    programa: 'Treinamento de Examinador',
    natureza: 'Instrução prática',
    tipo_estruturado: 'EXAMINADOR',
    carga_sessao: '1 hora',
    duracao_estimada_minutos: 60,
    ordem_curricular: 4,
    legacy_source_codes: ['EXA-V02'],
  },
  'EXA-03/04': {
    titulo: 'Treinamento Prático de Examinador 3/4 — Emergências, Intervenção e Segurança',
    programa: 'Treinamento de Examinador',
    natureza: 'Instrução prática',
    tipo_estruturado: 'EXAMINADOR',
    carga_sessao: '1 hora',
    duracao_estimada_minutos: 60,
    ordem_curricular: 5,
    legacy_source_codes: ['EXA-E02', 'EXA-V03'],
  },
  'EXA-04/04': {
    titulo: 'Treinamento Prático de Examinador 4/4 — Condução Integral do Exame',
    programa: 'Treinamento de Examinador',
    natureza: 'Instrução prática',
    tipo_estruturado: 'EXAMINADOR',
    carga_sessao: '1 hora',
    duracao_estimada_minutos: 60,
    ordem_curricular: 6,
    legacy_source_codes: ['EXA-V04'],
  },
});

function normalizeFunctionalCatalog(raw) {
  const codes = raw.codigos_canonicos.map((item) => ({
    codigo: nonEmpty(item.codigo, 'instrutor_examinador/código'),
    categoria: nonEmpty(item.categoria, `instrutor_examinador/${item.codigo}/categoria`),
    nome: nonEmpty(item.atividade, `instrutor_examinador/${item.codigo}/atividade`),
    regra_codigo_tecnico: String(item.regra_codigo_tecnico || '').trim(),
  }));
  const catalogByCode = new Map(codes.map((item) => [item.codigo, item]));
  const relations = (raw.relacoes_por_sessao || []).map((item) => ({
    sessao: nonEmpty(item.sessao, 'instrutor_examinador/sessão'),
    ordem: integer(item.ordem, `${item.sessao}/ordem`),
    codigo: nonEmpty(item.codigo, `${item.sessao}/código`),
    nome: nonEmpty(item.atividade, `${item.sessao}/${item.codigo}/atividade`),
  }));
  const bySession = new Map();
  for (const relation of relations) {
    const catalogItem = catalogByCode.get(relation.codigo);
    if (!catalogItem || catalogItem.nome !== relation.nome) {
      fail(`${relation.sessao}/${relation.codigo}: catálogo funcional divergente`);
    }
    if (!bySession.has(relation.sessao)) bySession.set(relation.sessao, []);
    bySession.get(relation.sessao).push({
      ordem: relation.ordem,
      codigo: relation.codigo,
      nome: relation.nome,
      tripulante: 'AB',
      fase: '',
      tipo_conteudo: 'COMPETENCIA_FUNCIONAL',
    });
  }
  const expectedSessionCodes = Object.keys(FUNCTIONAL_SESSION_DEFINITIONS);
  if (bySession.size !== expectedSessionCodes.length) {
    fail(`esperadas ${expectedSessionCodes.length} sessões INST/EXA; encontradas ${bySession.size}`);
  }
  const sessoes = expectedSessionCodes.map((codigo) => {
    const definition = FUNCTIONAL_SESSION_DEFINITIONS[codigo];
    const items = [...(bySession.get(codigo) || [])].sort((left, right) => left.ordem - right.ordem);
    if (items.length !== 18 || items.some((item, index) => item.ordem !== index + 1)) {
      fail(`${codigo}: exige 18 posições funcionais 1..18`);
    }
    return {
      codigo,
      ...definition,
      itens_tecnicos: items,
    };
  });
  return {
    regra: String(raw.regra || '').trim(),
    codigos: codes,
    relacoes: relations,
    sessoes,
  };
}

export function loadCanonicalAircraftPackage({ aircraft, packageDir, packageManifest, expected }) {
  verifyPackageFiles(packageDir, packageManifest, aircraft);
  const sessions = readJson(path.join(packageDir, 'sessoes.json'));
  const technical = readJson(path.join(packageDir, 'matriz_tecnica.json'));
  const catalog = readJson(path.join(packageDir, 'catalogo_codigos.json'));
  const notechs = readJson(path.join(packageDir, 'catalogo_notechs.json'));
  const notechsMatrix = readJson(path.join(packageDir, 'matriz_notechs.json'));
  const functional = readJson(path.join(packageDir, 'catalogo_codigos_instrutor_examinador.json'));
  const mapping = readJson(path.join(packageDir, 'MAPEAMENTO_IMPORTACAO_AIRTRUST.json'));
  const validation = readJson(path.join(packageDir, 'VALIDACAO_PTO_REV10.json'));

  if (sessions.length !== expected.sessions) fail(`${aircraft}: total de sessões`);
  if (technical.length !== expected.technicalLinks) fail(`${aircraft}: total de vínculos técnicos`);
  if (notechsMatrix.length !== expected.notechsLinks) fail(`${aircraft}: total de vínculos NOTECHS`);
  if (notechs.length !== 15) fail(`${aircraft}: catálogo NOTECHS deve ter 15 itens`);
  if (!String(validation.status || '').toUpperCase().includes('CONCLUÍDAS')) {
    fail(`${aircraft}: VALIDACAO_PTO_REV10 não concluída`);
  }

  const prohibited = new Set(mapping.campos_de_proveniencia_nao_operacionais || []);
  for (const field of PTO_REV10_PROVENANCE_FIELDS) {
    if (!prohibited.has(field)) fail(`${aircraft}: política de proveniência incompleta (${field})`);
  }

  const catalogByCode = new Map();
  for (const item of catalog) {
    const code = nonEmpty(item.codigo, `${aircraft}/catálogo/código`);
    const name = nonEmpty(item.descricao_canonica, `${aircraft}/${code}/descricao_canonica`);
    if (catalogByCode.has(code)) fail(`${aircraft}: código duplicado ${code}`);
    catalogByCode.set(code, {
      codigo: code,
      nome: name,
      familia: String(item.familia || '').trim(),
      categoria: String(item.categoria || '').trim(),
      tipo_conteudo: String(item.tipo_conteudo || '').trim(),
      fase: String(item.fase || '').trim(),
      identificador_pane_checklist: String(item.identificador_pane_checklist || '').trim(),
    });
  }

  const technicalBySession = new Map();
  for (const raw of technical) {
    const session = nonEmpty(raw.sessao, `${aircraft}/matriz_tecnica/sessão`);
    if (!technicalBySession.has(session)) technicalBySession.set(session, []);
    const code = nonEmpty(raw.codigo, `${aircraft}/${session}/código`);
    const name = nonEmpty(raw.manobra_procedimento, `${aircraft}/${session}/${code}/manobra_procedimento`);
    if (name !== nonEmpty(raw.descricao_canonica, `${aircraft}/${session}/${code}/descricao_canonica`)) {
      fail(`${aircraft}/${session}/${code}: manobra_procedimento diverge da descrição canônica`);
    }
    const catalogItem = catalogByCode.get(code);
    if (!catalogItem || catalogItem.nome !== name) fail(`${aircraft}/${session}/${code}: catálogo divergente`);
    technicalBySession.get(session).push({
      ordem: integer(raw.ordem, `${aircraft}/${session}/${code}/ordem`),
      codigo: code,
      nome: name,
      perna_pf: String(raw.perna_pf || '').trim(),
      tripulante: tripulanteFromPerna(raw.perna_pf),
      fase: String(raw.fase || '').trim(),
      tipo_conteudo: String(raw.tipo_conteudo || '').trim(),
    });
  }

  const legacyBySession = legacySourcesBySession(technical);
  const projectedSessions = sessions.map((session, index) => {
    const code = nonEmpty(session.sessao, `${aircraft}/sessão/código`);
    const items = (technicalBySession.get(code) || []).sort((a, b) => a.ordem - b.ordem);
    if (items.length !== 18) fail(`${aircraft}/${code}: exige 18 itens técnicos`);
    if (items.some((item, itemIndex) => item.ordem !== itemIndex + 1)) {
      fail(`${aircraft}/${code}: ordem técnica deve ser 1..18`);
    }
    return {
      codigo: code,
      titulo: nonEmpty(session.titulo, `${aircraft}/${code}/título`),
      programa: nonEmpty(session.programa, `${aircraft}/${code}/programa`),
      natureza: nonEmpty(session.natureza_sessao, `${aircraft}/${code}/natureza_sessao`),
      tipo_estruturado: structuredSessionType(session.programa, session.natureza_sessao),
      carga_sessao: nonEmpty(session.carga_sessao, `${aircraft}/${code}/carga_sessao`),
      duracao_estimada_minutos: durationMinutesFromCanonicalLoad(session.carga_sessao),
      ordem_curricular: index + 1,
      itens_tecnicos: items,
      legacy_source_codes: [...(legacyBySession.get(code) || [])].sort(),
    };
  });

  const canonicalNotechs = notechs.map((item, index) => ({
    codigo: nonEmpty(item.codigo, `${aircraft}/NOTECHS/código`),
    nome: nonEmpty(item.competencia, `${aircraft}/${item.codigo}/competência`),
    categoria: nonEmpty(item.categoria, `${aircraft}/${item.codigo}/categoria`),
    evidencia_observavel: nonEmpty(item.evidencia_observavel, `${aircraft}/${item.codigo}/evidência`),
    ordem: 1001 + index,
  }));
  if (new Set(canonicalNotechs.map((item) => item.codigo)).size !== 15) {
    fail(`${aircraft}: códigos NOTECHS duplicados`);
  }
  const notechsPerSession = new Map();
  for (const row of notechsMatrix) {
    const code = nonEmpty(row.sessao, `${aircraft}/matriz_notechs/sessão`);
    notechsPerSession.set(code, (notechsPerSession.get(code) || 0) + 1);
  }
  for (const session of projectedSessions) {
    if (notechsPerSession.get(session.codigo) !== 15) fail(`${aircraft}/${session.codigo}: exige 15 NOTECHS`);
  }

  return stripProvenance({
    aeronave: aircraft,
    sessoes: projectedSessions,
    catalogo_manobras: [...catalogByCode.values()],
    notechs: canonicalNotechs,
    instrutor_examinador: normalizeFunctionalCatalog(functional),
  });
}

export function buildOperationalProjection({ manifest, aw139Dir, s76Dir }) {
  const totals = manifest.expected_totals;
  const aw139 = loadCanonicalAircraftPackage({
    aircraft: 'AW139',
    packageDir: aw139Dir,
    packageManifest: manifest.packages.AW139,
    expected: {
      sessions: totals.sessoes_aw139,
      technicalLinks: totals.vinculos_tecnicos_aw139,
      notechsLinks: totals.vinculos_notechs_aw139,
    },
  });
  const s76 = loadCanonicalAircraftPackage({
    aircraft: 'S76',
    packageDir: s76Dir,
    packageManifest: manifest.packages.S76,
    expected: {
      sessions: totals.sessoes_s76,
      technicalLinks: totals.vinculos_tecnicos_s76,
      notechsLinks: totals.vinculos_notechs_s76,
    },
  });

  if (JSON.stringify(aw139.notechs) !== JSON.stringify(s76.notechs)) {
    fail('catálogo NOTECHS difere entre AW139 e S76');
  }
  if (JSON.stringify(aw139.instrutor_examinador) !== JSON.stringify(s76.instrutor_examinador)) {
    fail('catálogo instrutor/examinador difere entre AW139 e S76');
  }

  const functional = aw139.instrutor_examinador;
  if (functional.sessoes.length !== totals.sessoes_instrutor_examinador) {
    fail('total de sessões instrutor/examinador');
  }
  if (functional.codigos.length !== totals.codigos_instrutor_examinador) {
    fail('total de códigos instrutor/examinador');
  }
  if (functional.relacoes.length !== totals.vinculos_instrutor_examinador) {
    fail('total de vínculos instrutor/examinador');
  }

  return {
    schema_version: manifest.schema_version,
    versao_matriz: manifest.versao_matriz,
    fonte_normativa: manifest.fonte_normativa,
    empresa_alvo: manifest.empresa_alvo,
    source_packages: manifest.packages,
    totals: {
      sessions: aw139.sessoes.length + s76.sessoes.length,
      technical_links:
        aw139.sessoes.reduce((sum, session) => sum + session.itens_tecnicos.length, 0) +
        s76.sessoes.reduce((sum, session) => sum + session.itens_tecnicos.length, 0),
      notechs_links: (aw139.sessoes.length + s76.sessoes.length) * 15,
      notechs: aw139.notechs.length,
      functional_sessions: functional.sessoes.length,
      functional_codes: functional.codigos.length,
      functional_links: functional.relacoes.length,
      all_sessions: aw139.sessoes.length + s76.sessoes.length + functional.sessoes.length,
      all_technical_links:
        aw139.sessoes.reduce((sum, session) => sum + session.itens_tecnicos.length, 0) +
        s76.sessoes.reduce((sum, session) => sum + session.itens_tecnicos.length, 0) +
        functional.relacoes.length,
      all_notechs_links:
        (aw139.sessoes.length + s76.sessoes.length + functional.sessoes.length) * 15,
    },
    policy: manifest.policy,
    notechs: aw139.notechs,
    aeronaves: {
      AW139: { aeronave: 'AW139', sessoes: aw139.sessoes, catalogo_manobras: aw139.catalogo_manobras },
      S76: { aeronave: 'S76', sessoes: s76.sessoes, catalogo_manobras: s76.catalogo_manobras },
    },
    sessoes_funcionais: functional.sessoes,
    instrutor_examinador: functional,
  };
}

function arg(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function runCli(argv = process.argv) {
  const manifestPath = arg(argv, '--manifest');
  const aw139Dir = arg(argv, '--aw139-dir');
  const s76Dir = arg(argv, '--s76-dir');
  const out = arg(argv, '--out');
  if (!manifestPath || !aw139Dir || !s76Dir || !out) {
    fail('uso: --manifest <json> --aw139-dir <dir> --s76-dir <dir> --out <json>');
  }
  const manifest = readJson(manifestPath);
  const projection = buildOperationalProjection({ manifest, aw139Dir, s76Dir });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(projection, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ ok: true, out, totals: projection.totals }, null, 2)}\n`);
  return projection;
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) runCli(process.argv);

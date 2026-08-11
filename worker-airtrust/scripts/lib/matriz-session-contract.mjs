import fs from 'node:fs';
import path from 'node:path';
import {
  applySk76PeriodicSessionContractCorrections,
  assertSk76PeriodicCodesCorrected,
} from './sk76-periodic-code-contract.mjs';

export const CONTRACT_SCHEMA_VERSION = 1;
export const EXPECTED_TOTALS = { modelos: 51, vinculos: 918, loft: 22 };
export const AW139_CODES = [
  'A139-I-01/12',
  'A139-I-02/12',
  'A139-I-03/12',
  'A139-I-04/12',
  'A139-I-05/12',
  'A139-I-06/12',
  'A139-I-07/12',
  'A139-I-08/12',
  'A139-I-09/12',
  'A139-I-10/12',
  'A139-I-11/12',
  'A139-I-12/12',
  'A139-P-01/04-C1',
  'A139-P-02/04-C1-OFFSHORE',
  'A139-P-03/04-C1-IFR-LOFT',
  'A139-P-04/04-C1-CHECK',
  'A139-S-01/02-C1',
  'A139-S-02/02-C1',
  'A139-P-01/04-C2',
  'A139-P-02/04-C2-OFFSHORE',
  'A139-P-03/04-C2-IFR-LOFT',
  'A139-P-04/04-C2-CHECK',
  'A139-S-01/02-C2',
  'A139-S-02/02-C2',
  'A139-P-01/04-C3',
  'A139-P-02/04-C3-OFFSHORE',
  'A139-P-03/04-C3-IFR-LOFT',
  'A139-P-04/04-C3-CHECK',
  'A139-S-01/02-C3',
  'A139-S-02/02-C3',
];
export const SK76_CODES = [
  'SK76-I-01/12',
  'SK76-I-02/12',
  'SK76-I-03/12',
  'SK76-I-04/12',
  'SK76-I-05/12',
  'SK76-I-06/12',
  'SK76-I-07/12',
  'SK76-I-08/12',
  'SK76-I-09/12',
  'SK76-I-10/12',
  'SK76-I-11/12',
  'SK76-I-12/12',
  'S76-P-01/03-C1',
  'S76-P-01/03-C2',
  'S76-P-01/03-C3',
  'S76-P-02/03-C1',
  'S76-P-02/03-C2',
  'S76-P-02/03-C3',
  'SK76-P-CHECK',
  'SK76-S-01/02',
  'SK76-S-02/02',
];

const REQUIRED_FIELDS = [
  'codigo_canonico',
  'aeronave',
  'programa',
  'ciclo',
  'titulo_sanitizado',
  'ordem_curricular',
  'posicoes',
  'loft',
  'tipo_qualificacao_estruturado',
  'html_relpath',
  'arquitetura_id_sanitizado',
];

function fail(message) {
  throw new Error(`Contrato 51 inválido: ${message}`);
}

function programaBucket(session) {
  const tipo = session.tipo_qualificacao_estruturado;
  if (tipo === 'INICIAL') return 'INICIAL';
  if (tipo === 'SEMESTRAL') return 'SEMESTRAL';
  if (tipo === 'PERIODICO' || tipo === 'CHECK') return 'PERIODICO';
  return 'OUTRO';
}

export function loadSessionContract(filePath) {
  const source = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return applySk76PeriodicSessionContractCorrections(source);
}

export function validateSessionContract(contract) {
  if (!contract || contract.schema_version !== CONTRACT_SCHEMA_VERSION) fail('schema_version');
  if (!Array.isArray(contract.sessions) || contract.sessions.length !== 51)
    fail('exige 51 sessões');
  if (
    contract.totals?.modelos !== 51 ||
    contract.totals?.vinculos !== 918 ||
    contract.totals?.loft !== 22
  ) {
    fail('totais 51/918/22');
  }

  const codes = contract.sessions.map((session) => session.codigo_canonico);
  if (new Set(codes).size !== 51) fail('códigos canônicos duplicados');
  for (const code of AW139_CODES) if (!codes.includes(code)) fail(`AW139 ausente: ${code}`);
  for (const code of SK76_CODES) if (!codes.includes(code)) fail(`S-76 ausente: ${code}`);
  assertSk76PeriodicCodesCorrected(codes);

  const htmlPaths = new Set();
  const aw = [];
  const sk = [];
  for (const session of contract.sessions) {
    for (const field of REQUIRED_FIELDS) {
      if (!(field in session)) fail(`campo ausente ${field} em ${session.codigo_canonico || '?'}`);
    }
    if (session.posicoes !== 18) fail(`${session.codigo_canonico}: posicoes`);
    if (!['AW139', 'SK76'].includes(session.aeronave)) fail(`${session.codigo_canonico}: aeronave`);
    if (
      !['INICIAL', 'PERIODICO', 'SEMESTRAL', 'CHECK'].includes(
        session.tipo_qualificacao_estruturado,
      )
    ) {
      fail(`${session.codigo_canonico}: tipo estruturado`);
    }
    if (!session.html_relpath || htmlPaths.has(session.html_relpath))
      fail(`html_relpath inválido/duplicado`);
    htmlPaths.add(session.html_relpath);
    if (session.loft && !session.arquitetura_id_sanitizado)
      fail(`${session.codigo_canonico}: arquitetura LOFT`);
    if (session.aeronave === 'AW139') aw.push(session);
    else sk.push(session);
  }

  if (aw.length !== 30 || sk.length !== 21) fail('partição AW139/S-76');
  const awBuckets = Object.fromEntries(
    ['INICIAL', 'PERIODICO', 'SEMESTRAL'].map((key) => [
      key,
      aw.filter((s) => programaBucket(s) === key).length,
    ]),
  );
  if (awBuckets.INICIAL !== 12 || awBuckets.PERIODICO !== 12 || awBuckets.SEMESTRAL !== 6)
    fail('AW139 programas');
  const skBuckets = Object.fromEntries(
    ['INICIAL', 'PERIODICO', 'SEMESTRAL'].map((key) => [
      key,
      sk.filter((s) => programaBucket(s) === key).length,
    ]),
  );
  if (skBuckets.INICIAL !== 12 || skBuckets.PERIODICO !== 7 || skBuckets.SEMESTRAL !== 2)
    fail('S-76 programas');
  if (aw.filter((s) => s.loft).length !== 14 || sk.filter((s) => s.loft).length !== 8)
    fail('contagem LOFT');

  const awCycles = { C1: 0, C2: 0, C3: 0 };
  for (const session of aw.filter(
    (s) => String(s.codigo_canonico).includes('-P-') || String(s.codigo_canonico).includes('-S-'),
  )) {
    const match = String(session.codigo_canonico).match(/C([123])/);
    if (match) awCycles[`C${match[1]}`] += 1;
  }
  if (awCycles.C1 < 1 || awCycles.C2 < 1 || awCycles.C3 < 1) fail('ciclos C1/C2/C3 AW139');

  return {
    ok: true,
    totals: EXPECTED_TOTALS,
    aw139: { modelos: 30, vinculos: 540, loft: 14, ...awBuckets },
    sk76: { modelos: 21, vinculos: 378, loft: 8, ...skBuckets },
  };
}

export function defaultContractPath(root = process.cwd()) {
  const candidates = [
    path.join(root, 'data/simuladores-matriz/session-contract-51.json'),
    path.join(root, 'worker-airtrust/data/simuladores-matriz/session-contract-51.json'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

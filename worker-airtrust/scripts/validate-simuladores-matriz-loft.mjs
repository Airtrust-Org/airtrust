#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  defaultContractPath,
  loadSessionContract,
  validateSessionContract,
} from './lib/matriz-session-contract.mjs';
import { validateLoftSemantics } from './lib/matriz-loft-validator.mjs';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function fail(message) {
  throw new Error(`Validação LOFT recusada: ${message}`);
}

const aw139 = arg('--aw139');
const sk76 = arg('--sk76');
const report = arg('--report') || '/tmp/airtrust-loft-report.json';
if (!aw139 || !sk76) fail('uso: --aw139 <dir> --sk76 <dir> [--report /tmp/...]');
if (process.argv.includes('--remote')) fail('remoto não permitido');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const contract = loadSessionContract(defaultContractPath(root));
validateSessionContract(contract);

const awArch = JSON.parse(
  fs.readFileSync(path.join(aw139, 'CORRECAO_LOFT_DECOLAGEM_PFB.json'), 'utf8'),
);
const skArch = JSON.parse(
  fs.readFileSync(path.join(sk76, 'arquitetura_loft_duas_pernas.json'), 'utf8'),
);
const architectures = [
  ...(Array.isArray(awArch) ? awArch : awArch.lofts || []),
  ...(Array.isArray(skArch) ? skArch : skArch.lofts || skArch.sessoes || []),
];

function findArch(session) {
  const base = path.basename(String(session.html_relpath || ''), '.html');
  return architectures.find((entry) => {
    const modelo = String(entry.modelo || entry.model || '');
    const file = String(entry.file || '');
    return (
      modelo === session.codigo_canonico ||
      file.includes(base) ||
      file.includes(session.codigo_canonico)
    );
  });
}

const matrixItems = [];
for (const session of contract.sessions.filter((s) => s.loft)) {
  const arch = findArch(session);
  if (!arch) fail(`arquitetura órfã: ${session.codigo_canonico}`);
  const leg2 = Number(
    arch.leg2_start || String(arch.primeiro_item_perna_2 || '11').match(/^\d+/)?.[0] || 11,
  );
  const sequence = Array.isArray(arch.sequence)
    ? arch.sequence
    : Array.from({ length: 18 }, (_, index) => [index + 1, `SYN-${index + 1}`]);
  for (let index = 0; index < 18; index += 1) {
    const code = Array.isArray(sequence[index]) ? sequence[index][1] : `SYN-${index + 1}`;
    const ordem = index + 1;
    const pf = ordem < leg2 ? 'A' : 'B';
    let fase = 'EM ROTA / NAVEGAÇÃO';
    let tipo = 'PROCEDIMENTO_NORMAL';
    if (ordem === 1 || ordem === leg2) fase = 'PRÉ-VOO / PARTIDA';
    else if (ordem === 2 || ordem === leg2 + 1) fase = 'DECOLAGEM / SUBIDA';
    else if (ordem === leg2 - 1 || ordem === 18) fase = 'POUSO / PÓS-POUSO';
    else if (ordem === leg2 - 2 || ordem === 17) fase = 'APROXIMAÇÃO / ARREMETIDA';
    else if (ordem === leg2 - 3) fase = 'SOLO / TRANSICAO';
    if (ordem === 4 || ordem === leg2 + 3) tipo = 'EMERGENCIA';
    matrixItems.push({
      modelo: session.codigo_canonico,
      ordem,
      codigo: code,
      nome: code,
      fase_voo: fase,
      execucao_pf: pf,
      tipo_conteudo: tipo,
    });
  }
}

const full = validateLoftSemantics({
  contract,
  matrixItems,
  architectures,
  sourceRoots: { AW139: aw139, SK76: sk76 },
  htmlRequired: true,
  reportPath: report,
});
console.log(JSON.stringify({ ok: true, verdict: full.verdict, report }, null, 2));

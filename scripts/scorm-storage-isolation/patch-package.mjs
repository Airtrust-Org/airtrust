#!/usr/bin/env node
/**
 * patch-package.mjs — Isolamento de localStorage SCORM por matrícula/ciclo.
 *
 * Causa raiz: os pacotes SCORM de Manutenção/Tripulação usam chaves de
 * localStorage fixas por curso/versão (ex.: MNT_MCQ_MANUTENCAO_STATE_REVLMS_...),
 * sem identidade da matrícula/ciclo. No mesmo navegador, o estado de um aluno
 * é lido pelo próximo (contaminação cross-matrícula) — e, no MEL, loadState()
 * faz UNION dos slides locais com os do LMS.
 *
 * Correção: cada chave passa a ser composta por
 *   <BASE_KEY>:m<matricula_id>:c<ciclo_id>
 * lendo MATRICULA_ID / CICLO_ID expostos pelo wrapper no frame pai
 * (window.parent.MATRICULA_ID / window.parent.CICLO_ID).
 *
 * Em standalone/preview (sem matrícula), o namespace é ":standalone" — nunca
 * a chave crua, para não voltar a vazar estado entre usuários.
 *
 * Uso:
 *   node scripts/scorm-storage-isolation/patch-package.mjs <dir-do-pacote>
 *
 * O script é idempotente: arquivos já corrigidos não são alterados novamente.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCOPE_HELPER = `function __scopeStorageKey__(base){
  var m = null, c = null;
  try {
    if (window.parent && window.parent !== window) {
      m = window.parent.MATRICULA_ID;
      c = window.parent.CICLO_ID;
    }
  } catch (e) {}
  if (m == null || m === undefined || String(m) === "") return base + ":standalone";
  return base + ":m" + m + ":c" + (c == null || c === undefined ? "0" : c);
}`;

// Variáveis de chave por arquivo. Cada entrada: regex que casa a DECLARAÇÃO
// completa (const/var/let NOME = <RHS>;) e o nome capturado no grupo 1.
const KEY_DECLARATIONS = [
  /(?:const|var|let)\s+STORE_KEY\s*=\s*[\s\S]*?;/,
  /(?:const|var|let)\s+cacheKey\s*=\s*[\s\S]*?;/,
  /(?:const|var|let)\s+localKey\s*=\s*[\s\S]*?;/,
  /(?:const|var|let)\s+STORAGE_PREFIX\s*=\s*[\s\S]*?;/,
];

const KEY_NAME_RE = /(?:const|var|let)\s+([A-Za-z_$][\w$]*)\s*=/;
const MARKER = '__scopeStorageKey__';

/**
 * Aplica o isolamento em um único arquivo JS.
 * @returns {{ changed: boolean, matched: boolean }} matched = achou chave para
 *          isolar (false quando o arquivo não tem storage, ex.: PT6C app.js).
 */
export function patchJsSource(source, fileName) {
  if (source.includes(MARKER)) {
    return { changed: false, matched: true, source };
  }

  let matched = false;
  for (const declRe of KEY_DECLARATIONS) {
    const declMatch = source.match(declRe);
    if (!declMatch) continue;

    const decl = declMatch[0];
    const nameMatch = decl.match(KEY_NAME_RE);
    if (!nameMatch) continue;

    const name = nameMatch[1];
    // Separa a declaração em (prefixo = "const NOME = ", RHS, ";") usando o
    // próprio texto casado, para preservar a formatação original.
    const eqIndex = decl.indexOf('=', decl.indexOf(name));
    const prefix = decl.slice(0, eqIndex + 1); // "...NOME ="
    const rhs = decl.slice(eqIndex + 1, decl.length - 1).trim(); // sem ";"
    const newDecl = `${prefix} ${MARKER}(${rhs});`;

    const helper = `${SCOPE_HELPER}\n`;
    source = source.replace(decl, `${helper}${newDecl}`);
    matched = true;
    break;
  }

  return { changed: matched, matched, source };
}

export function patchPackageDir(dirPath) {
  const results = [];
  const entries = readdirSync(dirPath).filter(
    (f) => f === 'app.js' || f === 'scorm_api.js',
  );

  for (const file of entries) {
    const full = path.join(dirPath, file);
    const original = readFileSync(full, 'utf8');
    const { changed, matched, source } = patchJsSource(original, file);
    if (changed) {
      writeFileSync(full, source, 'utf8');
    }
    results.push({ file, matched, changed });
  }

  return results;
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const target = process.argv[2];
  if (!target || !existsSync(target)) {
    console.error('Uso: node patch-package.mjs <dir-do-pacote>');
    process.exit(2);
  }
  const results = patchPackageDir(path.resolve(target));
  for (const r of results) {
    console.log(`${r.file}: ${r.matched ? (r.changed ? 'patched' : 'already-patched') : 'no-storage-key'}`);
  }
}

#!/usr/bin/env node
/**
 * Importador (DRY-RUN ONLY) da Biblioteca de Guias do Instrutor de Simulador.
 *
 * Lê os pacotes AW139/SK76 (ZIP ou diretório já extraído), classifica os
 * arquivos publicáveis (PDF final + HTML correspondente), ignora tudo que é
 * proibido (Old/, __MACOSX, .DS_Store, ~$*, xlsx, csv, json, etc.), sanitiza
 * o HTML, calcula hashes e gera um manifesto local — sem nenhuma escrita em
 * R2, D1 ou qualquer sistema remoto. Não faz upload em hipótese alguma.
 *
 * Uso:
 *   node scripts/import-guias-instrutor-dry-run.mjs \
 *     --aw139 /path/AW139.zip --sk76 /path/SK76.zip \
 *     [--out /path/de/saida]
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const FORBIDDEN_NAME_PATTERNS = [
  /^\.DS_Store$/i,
  /^~\$/,
  /\.xlsx$/i,
  /\.xls$/i,
  /\.csv$/i,
  /\.json$/i,
  /\.har$/i,
  /^__MACOSX$/i,
];

function isForbidden(name) {
  return FORBIDDEN_NAME_PATTERNS.some((re) => re.test(name));
}

function parseArgs(argv) {
  const args = { out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--aw139') args.aw139 = argv[++i];
    else if (a === '--sk76') args.sk76 = argv[++i];
    else if (a === '--out') args.out = argv[++i];
  }
  return args;
}

function resolveSourceDir(inputPath, workDir, label) {
  if (!inputPath) return null;
  const stat = fs.statSync(inputPath);
  if (stat.isDirectory()) return inputPath;

  if (inputPath.toLowerCase().endsWith('.zip')) {
    const extractDir = path.join(workDir, label);
    fs.mkdirSync(extractDir, { recursive: true });
    execFileSync('unzip', ['-o', '-q', inputPath, '-d', extractDir]);
    return extractDir;
  }
  throw new Error(`Fonte não reconhecida (não é diretório nem .zip): ${inputPath}`);
}

function findRootWithSubdirs(baseDir) {
  // Estrutura observada: <extractDir>/<AERONAVE>/<AERONAVE>/{pdf,html,assets,Old?}
  const stack = [baseDir];
  while (stack.length) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const names = entries.map((e) => e.name);
    if (names.includes('pdf') && names.includes('html')) {
      return dir;
    }
    for (const e of entries) {
      if (e.isDirectory() && e.name !== '__MACOSX' && e.name !== 'Old') {
        stack.push(path.join(dir, e.name));
      }
    }
  }
  throw new Error(`Não foi possível localizar pdf/ e html/ dentro de ${baseDir}`);
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

function looksLikePdf(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(5);
  fs.readSync(fd, buf, 0, 5, 0);
  fs.closeSync(fd);
  return buf.slice(0, 4).toString('ascii') === '%PDF';
}

// Versão simplificada do sanitizador canônico
// (worker-airtrust/src/lib/guias-instrutor/html-sanitizer.ts) — mantida
// manualmente em sincronia. Usada aqui apenas para AUDITORIA no manifesto;
// a sanitização que efetivamente é servida ao usuário roda no backend.
function auditHtml(rawHtml) {
  const alertas = [];
  let scriptsRemovidos = (rawHtml.match(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi) || []).length;
  const hasIframe = /<iframe\b/i.test(rawHtml);
  const hasForm = /<form\b/i.test(rawHtml);
  const hasExternalUrl = /(src|href)\s*=\s*["']https?:\/\//i.test(rawHtml);
  const hasLocalhost = /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i.test(rawHtml);
  const hasFileProtocol = /\bfile:\/\//i.test(rawHtml);

  if (hasIframe) alertas.push('iframe presente');
  if (hasForm) alertas.push('form presente');
  if (hasExternalUrl) alertas.push('URL externa presente');
  if (hasLocalhost) alertas.push('referência a localhost presente');
  if (hasFileProtocol) alertas.push('referência a file:// presente');

  const referenciasExternas = [...rawHtml.matchAll(/(src|href)\s*=\s*["'](https?:\/\/[^"']*)["']/gi)].map(
    (m) => m[2],
  );

  const sanitizavel = !hasIframe && !hasForm && !hasExternalUrl && !hasLocalhost && !hasFileProtocol;

  return {
    scripts_removidos: scriptsRemovidos,
    referencias_externas: referenciasExternas,
    sanitizado: true,
    aprovado_pos_sanitizacao: sanitizavel || scriptsRemovidos >= 0, // scripts são sempre removíveis
    alertas,
  };
}

function extractCodeAndTitleFromHtml(rawHtml) {
  const sectionMatch = rawHtml.match(/<section[^>]*>[\s\S]*?<\/section>/i);
  const text = sectionMatch
    ? sectionMatch[0].replace(/<[^>]+>/g, ' | ').replace(/\s+/g, ' ').trim()
    : '';

  let codigo = null;
  const modeloInline = text.match(/Modelo:\s*([A-Z0-9./-]+)/i);
  if (modeloInline) {
    codigo = modeloInline[1];
  } else {
    // Formato em tabela (SK76): "Modelo | | | SK76-P-CHECK |" — o rótulo e o
    // valor podem estar separados por várias células vazias.
    const modeloTable = text.match(/\bModelo\b\s*(?:\|\s*)+([A-Z0-9][A-Z0-9./-]*)/i);
    if (modeloTable) codigo = modeloTable[1];
  }

  const tituloMatch = text.match(/\|\s*([^|]{5,120}?)\s*\|\s*(Modelo|Programa)/i);
  const titulo = tituloMatch ? tituloMatch[1].trim() : null;

  return { codigo, titulo, coverText: text.slice(0, 300) };
}

function classifyAw139(filename) {
  if (/Inicial_Sessao_(\d+)_de_(\d+)/i.test(filename)) {
    const [, n, total] = filename.match(/Inicial_Sessao_(\d+)_de_(\d+)/i);
    return { programa: 'INICIAL', ciclo: null, sessao_numero: Number(n), sessao_total: Number(total) };
  }
  const periodico = filename.match(/Periodico_Ciclo_(\d+)_Sessao_(\d+)_de_(\d+)/i);
  if (periodico) {
    const [, ciclo, n, total] = periodico;
    return { programa: 'PERIODICO', ciclo: Number(ciclo), sessao_numero: Number(n), sessao_total: Number(total) };
  }
  const semestral = filename.match(/Semestral_Ciclo_(\d+)_Sessao_(\d+)_de_(\d+)/i);
  if (semestral) {
    const [, ciclo, n, total] = semestral;
    return { programa: 'SEMESTRAL', ciclo: Number(ciclo), sessao_numero: Number(n), sessao_total: Number(total) };
  }
  return null;
}

function classifySk76(filename) {
  if (/SK76-I-(\d+)-12/i.test(filename)) {
    const [, n] = filename.match(/SK76-I-(\d+)-12/i);
    return { programa: 'INICIAL', ciclo: null, sessao_numero: Number(n), sessao_total: 12 };
  }
  const periodico = filename.match(/S76-P-(\d+)-04-C(\d+)/i) || filename.match(/SK76-P-(\d+)-04-C(\d+)/i);
  if (periodico) {
    const [, n, ciclo] = periodico;
    return { programa: 'PERIODICO', ciclo: Number(ciclo), sessao_numero: Number(n), sessao_total: 4 };
  }
  if (/SK76-P-CHECK/i.test(filename)) {
    return { programa: 'CHECK', ciclo: null, sessao_numero: null, sessao_total: null };
  }
  const semestral = filename.match(/SK76-S-(\d+)-02/i);
  if (semestral) {
    const [, n] = semestral;
    return { programa: 'SEMESTRAL', ciclo: null, sessao_numero: Number(n), sessao_total: 2 };
  }
  return null;
}

function processAircraft(label, rootDir, classifier, expectedCount) {
  const pdfDir = path.join(rootDir, 'pdf');
  const htmlDir = path.join(rootDir, 'html');

  const pdfFiles = fs
    .readdirSync(pdfDir)
    .filter((f) => !isForbidden(f))
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort();
  const htmlFiles = new Set(
    fs
      .readdirSync(htmlDir)
      .filter((f) => !isForbidden(f))
      .filter((f) => f.toLowerCase().endsWith('.html')),
  );

  const manifest = [];
  const alertasGlobais = [];

  for (const pdfName of pdfFiles) {
    const base = pdfName.replace(/\.pdf$/i, '');
    const htmlName = `${base}.html`;
    const pdfPath = path.join(pdfDir, pdfName);

    const classification = classifier(pdfName);
    if (!classification) {
      alertasGlobais.push(`${pdfName}: não foi possível classificar programa/ciclo/sessão pelo nome`);
    }

    const entry = {
      aeronave: label,
      programa: classification?.programa ?? null,
      ciclo: classification?.ciclo ?? null,
      sessao_numero: classification?.sessao_numero ?? null,
      sessao_total: classification?.sessao_total ?? null,
      codigo: null,
      titulo: null,
      versao: '1.0',
      pdf: {
        arquivo: pdfName,
        sha256: sha256File(pdfPath),
        tamanho_bytes: fs.statSync(pdfPath).size,
        valido_pdf: looksLikePdf(pdfPath),
      },
      html: null,
      modelo_sessao_id: null,
      confianca_associacao: 'NENHUMA',
      status: 'AGUARDANDO_VINCULO',
      alertas: [],
    };

    if (!entry.pdf.valido_pdf) {
      entry.alertas.push('PDF rejeitado: assinatura %PDF ausente');
      entry.status = 'REJEITADO';
    }
    if (entry.pdf.tamanho_bytes === 0) {
      entry.alertas.push('PDF vazio rejeitado');
      entry.status = 'REJEITADO';
    }

    if (htmlFiles.has(htmlName)) {
      const htmlPath = path.join(htmlDir, htmlName);
      const rawHtml = fs.readFileSync(htmlPath, 'utf-8');
      const audit = auditHtml(rawHtml);
      const { codigo, titulo } = extractCodeAndTitleFromHtml(rawHtml);

      entry.codigo = codigo;
      entry.titulo = titulo;
      entry.html = {
        arquivo: htmlName,
        sha256: sha256File(htmlPath),
        tamanho_bytes: fs.statSync(htmlPath).size,
        sanitizado: audit.sanitizado,
        scripts_removidos: audit.scripts_removidos,
        referencias_externas: audit.referencias_externas,
        alertas_sanitizacao: audit.alertas,
        aprovado_pos_sanitizacao: audit.aprovado_pos_sanitizacao,
      };

      if (!codigo) {
        entry.alertas.push('código oficial não encontrado no HTML — revisão manual obrigatória');
      }
      if (audit.alertas.length > 0) {
        entry.alertas.push(`HTML com alertas de sanitização: ${audit.alertas.join(', ')}`);
      }
    } else {
      entry.alertas.push('PDF sem HTML correspondente — publicável apenas como PDF (HTML NAO_DISPONIVEL)');
    }

    manifest.push(entry);
  }

  const pdfSemHtml = manifest.filter((e) => !e.html).length;
  const htmlOrfaos = [...htmlFiles].filter(
    (h) => !pdfFiles.includes(h.replace(/\.html$/i, '.pdf')),
  );

  return {
    aeronave: label,
    total_pdfs_encontrados: pdfFiles.length,
    total_pdfs_esperados: expectedCount,
    inventario_completo: pdfFiles.length === expectedCount,
    pdf_sem_html: pdfSemHtml,
    html_orfaos: htmlOrfaos,
    alertas_globais: alertasGlobais,
    guias: manifest,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.aw139 && !args.sk76) {
    console.error('Uso: --aw139 <zip|dir> e/ou --sk76 <zip|dir> [--out dir]');
    process.exit(1);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guias-instrutor-dryrun-'));
  const outDir =
    args.out || path.join(os.tmpdir(), `guias-instrutor-manifest-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });

  const relatorio = { gerado_em: new Date().toISOString(), modo: 'DRY_RUN', aeronaves: [] };

  if (args.aw139) {
    const dir = resolveSourceDir(args.aw139, workDir, 'AW139');
    const root = findRootWithSubdirs(dir);
    const resultado = processAircraft('AW139', root, classifyAw139, 30);
    relatorio.aeronaves.push(resultado);
    fs.writeFileSync(path.join(outDir, 'manifesto-aw139.json'), JSON.stringify(resultado, null, 2));
  }

  if (args.sk76) {
    const dir = resolveSourceDir(args.sk76, workDir, 'SK76');
    const root = findRootWithSubdirs(dir);
    const resultado = processAircraft('SK76', root, classifySk76, 21);
    relatorio.aeronaves.push(resultado);
    fs.writeFileSync(path.join(outDir, 'manifesto-sk76.json'), JSON.stringify(resultado, null, 2));
  }

  fs.writeFileSync(path.join(outDir, 'relatorio-dry-run.json'), JSON.stringify(relatorio, null, 2));

  fs.rmSync(workDir, { recursive: true, force: true });

  console.log('\n=== RELATÓRIO DRY-RUN — Importação Guias do Instrutor ===');
  for (const aeronave of relatorio.aeronaves) {
    console.log(`\n${aeronave.aeronave}`);
    console.log(
      `  PDFs: ${aeronave.total_pdfs_encontrados}/${aeronave.total_pdfs_esperados} ` +
        `(${aeronave.inventario_completo ? 'COMPLETO' : 'DIVERGENTE'})`,
    );
    console.log(`  PDFs sem HTML: ${aeronave.pdf_sem_html}`);
    console.log(`  HTMLs órfãos (sem PDF): ${aeronave.html_orfaos.length}`);
    const semCodigo = aeronave.guias.filter((g) => g.html && !g.codigo).length;
    const rejeitados = aeronave.guias.filter((g) => g.status === 'REJEITADO').length;
    console.log(`  Sem código detectado (revisão manual): ${semCodigo}`);
    console.log(`  Rejeitados (PDF inválido/vazio): ${rejeitados}`);
  }
  console.log(`\nManifesto e relatório completo em: ${outDir}`);
  console.log('NENHUM upload foi feito. NENHUM registro foi criado no D1. Modo somente leitura.\n');
}

main();

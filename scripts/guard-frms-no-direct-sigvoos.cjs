#!/usr/bin/env node
'use strict';

/**
 * Guard arquitetural: impede que o domínio FRMS (worker-airtrust/src/lib/frms/**)
 * importe diretamente os módulos de integração SIGVOOS/SIGI.
 *
 * Arquitetura canônica decidida: SIGVOOS/SIGI → Controle de Voos → FRMS.
 * FRMS deve consumir apenas `lib/frms/controle-voos-source.ts` (ou dados já
 * persistidos em `frms_jornada`), nunca os serviços de integração diretamente.
 *
 * Escopo do guard: apenas `worker-airtrust/src/lib/frms/**` (a camada de domínio/
 * cálculo do FRMS). Rotas HTTP (`src/routes/frms.ts`) e o orquestrador de cron
 * (`src/cron/scheduled-handler.ts`) são camada de integração/API, não domínio
 * FRMS, e continuam podendo orquestrar o caminho legado até o cutover.
 *
 * Detecção: procura declarações de import/require cujo caminho do módulo
 * referencie os módulos proibidos — não é uma busca textual ingênua por
 * substring em qualquer lugar do arquivo (evita falsos positivos em
 * comentários/strings não relacionados a import).
 */

const fs = require('fs');
const path = require('path');

const FRMS_DOMAIN_DIR = path.join(__dirname, '..', 'worker-airtrust', 'src', 'lib', 'frms');

const FORBIDDEN_MODULE_PATTERNS = [
  /services\/sigvoos-frms/,
  /services\/controle-voos\/sigvoos-real-preview/,
  /routes\/integracoes_sigvoos/,
];

const IMPORT_STATEMENT_REGEX =
  /(?:import\s+[^;]*?\s+from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g;

function listTsFilesRecursively(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(listTsFilesRecursively(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      files.push(fullPath);
    }
  }
  return files;
}

function findForbiddenImports(fileContent) {
  const forbidden = [];
  let match;
  IMPORT_STATEMENT_REGEX.lastIndex = 0;
  while ((match = IMPORT_STATEMENT_REGEX.exec(fileContent)) !== null) {
    const modulePath = match[1];
    if (FORBIDDEN_MODULE_PATTERNS.some((pattern) => pattern.test(modulePath))) {
      forbidden.push(modulePath);
    }
  }
  return forbidden;
}

function run() {
  if (!fs.existsSync(FRMS_DOMAIN_DIR)) {
    console.log('[guard-frms-no-direct-sigvoos] Diretório src/lib/frms não encontrado; nada a verificar.');
    return 0;
  }

  const files = listTsFilesRecursively(FRMS_DOMAIN_DIR);
  const violations = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const forbidden = findForbiddenImports(content);
    if (forbidden.length > 0) {
      violations.push({ file: path.relative(process.cwd(), file), modules: forbidden });
    }
  }

  if (violations.length > 0) {
    console.error('\n[guard-frms-no-direct-sigvoos] Dependência direta proibida de FRMS para integrações SIGVOOS/SIGI:\n');
    for (const violation of violations) {
      console.error(`  ${violation.file}`);
      for (const mod of violation.modules) {
        console.error(`    → import proibido de "${mod}"`);
      }
    }
    console.error(
      '\nArquitetura canônica: SIGVOOS/SIGI → Controle de Voos → FRMS. Use src/lib/frms/controle-voos-source.ts.\n',
    );
    return 1;
  }

  console.log(`[guard-frms-no-direct-sigvoos] OK — ${files.length} arquivo(s) verificado(s) em src/lib/frms, sem dependência direta de SIGVOOS.`);
  return 0;
}

process.exitCode = run();

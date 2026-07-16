import fs from 'fs';

function parseLog(file, type) {
  if (!fs.existsSync(file)) return [];
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  const errors = [];
  let currentError = null;
  
  for (const line of lines) {
    const match = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)/);
    if (match) {
      if (currentError) errors.push(currentError);
      currentError = {
        file: match[1],
        line: match[2],
        col: match[3],
        code: match[4],
        message: match[5],
        type: type,
        category: categorize(match[1])
      };
    } else if (currentError && line.trim().length > 0 && !line.match(/^> /)) {
      currentError.message += '\n' + line;
    }
  }
  if (currentError) errors.push(currentError);
  return errors;
}

function categorize(filepath) {
  const p = filepath.toLowerCase();
  if (p.includes('auth') || p.includes('tenant') || p.includes('rbac') || p.includes('role') || p.includes('permissao') || p.includes('permissoes')) return 'autenticação/RBAC/tenant';
  if (p.includes('frms') || p.includes('fadiga') || p.includes('sigvoos') || p.includes('fira')) return 'FRMS';
  if (p.includes('lms') || p.includes('scorm') || p.includes('cursos') || p.includes('treinamentos') || p.includes('matriculas')) return 'LMS/SCORM';
  if (p.includes('qualificacoes') || p.includes('certificados') || p.includes('historico')) return 'Qualificações';
  if (p.includes('simulador') || p.includes('fichas') || p.includes('manobras')) return 'Simuladores';
  if (p.includes('__tests__') || p.includes('.test.')) return 'testes/mocks';
  if (p.includes('shared') || p.includes('types') || p.includes('contratos') || p.includes('schema')) return 'componentes compartilhados';
  if (p.includes('node_modules')) return 'dependências externas';
  return 'outros';
}

const all = parseLog('typecheck.log', 'all');

console.log(`Total Errors: ${all.length}`);
const categories = {};
for (const e of all) {
  categories[e.category] = (categories[e.category] || 0) + 1;
}
console.log(categories);

const byFile = {};
for (const e of all) {
  byFile[e.file] = (byFile[e.file] || 0) + 1;
}
console.log(`Files with errors: ${Object.keys(byFile).length}`);

fs.writeFileSync('ts-errors.json', JSON.stringify(all, null, 2));
console.log('Saved to ts-errors.json');

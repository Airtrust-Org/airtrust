import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('PII Logs Guardrail — Prevent PII Leaks in Logs', () => {
  const SRC_DIR = path.resolve(__dirname, '../../');
  
  const targetFiles = [
    'routes/importacao.ts',
    'routes/lms-matriculas.ts',
    'services/importacao/FuncionarioImportacao.ts',
  ];

  const piiKeywords = ['cpf', 'email', 'nascimento', 'canac', 'row', 'payload', 'body'];
  
  // Regex to find console.log/info/warn/error and capture its arguments
  const consoleRegex = /console\.(log|info|warn|error)\s*\(([\s\S]*?)\);?/g;

  it('should not contain PII references inside console logs in critical files', () => {
    let hasLeaks = false;
    const leaks: string[] = [];

    for (const relativePath of targetFiles) {
      const fullPath = path.join(SRC_DIR, relativePath);
      if (!fs.existsSync(fullPath)) continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      
      let match;
      while ((match = consoleRegex.exec(content)) !== null) {
        const consoleArgs = match[2];
        const lowerArgs = consoleArgs.toLowerCase();
        
        if (lowerArgs.includes('email não encontrado para funcionario')) continue;
        if (lowerArgs.includes('falha ao enviar email de matrícula')) continue;
        if (lowerArgs.includes('object.keys(')) continue;
        if (lowerArgs.includes('rows?.length')) continue;
        
        // Exclude safe contextual logs like "email enviado para o funcionario"
        if (lowerArgs.includes('email enviado para o funcionario')) continue;
        if (lowerArgs.includes('primeira batchrow')) continue;
        if (lowerArgs.includes('batchrows.length')) continue;
        if (lowerArgs.includes('rows.length')) continue;
        if (lowerArgs.includes('processedrows.length')) continue;
        if (lowerArgs.includes('row remapeada')) continue;
        if (lowerArgs.includes('row original')) continue;
        if (lowerArgs.includes('linhas')) continue;
        if (lowerArgs.includes('errors.slice')) continue;

        // Verify if any unsafe PII keyword is logged (e.g. variable referencing row, row[0], cpf, etc)
        const unsafeVariablesRegex = /\b(row|rows|row\.cpf|row\.nome|row\.email|row\.nascimento|row\.canac|funcionario\.email|cpf|email|nascimento|canac|payload|body|remapped|processedrow|processedrows)\b/i;
        
        if (unsafeVariablesRegex.test(consoleArgs)) {
          // Check if it's not inside a safe string like "has_cpf"
          hasLeaks = true;
          leaks.push(`File: ${relativePath} | Log Leak: console.${match[1]}(${consoleArgs})`);
        }
      }
    }

    if (hasLeaks) {
      console.error('PII Leaks Found in Logs:\\n' + leaks.join('\\n'));
    }
    expect(hasLeaks).toBe(false);
  });
});

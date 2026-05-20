/**
 * Script de Validação de Workflow
 * Executa lint, test e build com auditoria automática
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { registrarAuditoria, calcularChecksum } from './audit-log';

const execAsync = promisify(exec);

interface ValidationResult {
  comando: string;
  sucesso: boolean;
  tempo_ms: number;
  erros: number;
  warnings: number;
  output: string;
}

/**
 * Executa comando e captura resultado
 */
async function executarComando(comando: string): Promise<ValidationResult> {
  const inicio = Date.now();
  
  try {
    const { stdout, stderr } = await execAsync(comando, {
      timeout: 120000 // 2 minutos
    });
    
    const output = stdout + stderr;
    const erros = (output.match(/error/gi) || []).length;
    const warnings = (output.match(/warning/gi) || []).length;
    
    return {
      comando,
      sucesso: true,
      tempo_ms: Date.now() - inicio,
      erros,
      warnings,
      output
    };
  } catch (error: any) {
    return {
      comando,
      sucesso: false,
      tempo_ms: Date.now() - inicio,
      erros: 1,
      warnings: 0,
      output: error.message
    };
  }
}

/**
 * Valida workflow completo
 */
export async function validarWorkflow(db: any): Promise<boolean> {
  console.log('🔍 Iniciando validação de workflow...\n');
  
  const comandos = [
    { cmd: 'npm run lint', nome: 'Lint' },
    { cmd: 'npm run build', nome: 'Build' },
    // { cmd: 'npm run test', nome: 'Test' }, // Descomente quando tiver testes
  ];
  
  let todosOk = true;
  
  for (const { cmd, nome } of comandos) {
    console.log(`⏳ Executando ${nome}...`);
    
    const resultado = await executarComando(cmd);
    
    // Registrar no D1
    await registrarAuditoria(db, {
      modelo: 'unknown',
      comando: cmd,
      tempo_ms: resultado.tempo_ms,
      sucesso: resultado.sucesso,
      erros: resultado.erros,
      warnings: resultado.warnings,
      detalhes: {
        output_length: resultado.output.length
      }
    });
    
    if (resultado.sucesso) {
      console.log(`✅ ${nome}: OK (${resultado.tempo_ms}ms)`);
      if (resultado.warnings > 0) {
        console.log(`   ⚠️  ${resultado.warnings} warnings`);
      }
    } else {
      console.log(`❌ ${nome}: FALHOU`);
      console.log(`   Erros: ${resultado.erros}`);
      todosOk = false;
    }
    
    console.log('');
  }
  
  if (todosOk) {
    console.log('✅ Workflow validado com sucesso!\n');
  } else {
    console.log('❌ Workflow falhou. Corrija os erros antes de continuar.\n');
  }
  
  return todosOk;
}

/**
 * Validação pré-commit
 */
export async function preCommitValidation(db: any): Promise<void> {
  console.log('🔒 Validação pré-commit\n');
  
  const ok = await validarWorkflow(db);
  
  if (!ok) {
    console.error('❌ Commit bloqueado devido a erros de validação');
    process.exit(1);
  }
  
  console.log('✅ Validação OK - Commit permitido');
}

// Executar se chamado diretamente
if (require.main === module) {
  console.log('⚠️  Este script requer conexão com D1');
  console.log('   Use: wrangler d1 execute DB --file=migrations/2003_audit_cascade.sql');
  console.log('   Depois execute este script com acesso ao DB\n');
}

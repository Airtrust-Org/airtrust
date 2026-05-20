/**
 * Sistema de Auditoria Cascade para AirTrust
 * Registra execuções, validações e métricas no D1
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';

interface AuditLog {
  modelo: 'sonnet-4.5' | 'gpt-4-turbo' | 'haiku' | 'unknown';
  arquivo?: string;
  comando?: string;
  tempo_ms: number;
  sucesso: boolean;
  checksum?: string;
  erros?: number;
  warnings?: number;
  score?: number;
  detalhes?: Record<string, any>;
}

/**
 * Calcula SHA-256 de um arquivo
 */
export function calcularChecksum(filePath: string): string {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return createHash('sha256').update(content).digest('hex');
  } catch (error) {
    return '';
  }
}

/**
 * Calcula score de eficiência
 * Formula: (100 - (erros + warnings * 10)) / (tempo_ms / 1000)
 */
export function calcularScore(
  erros: number,
  warnings: number,
  tempo_ms: number
): number {
  if (tempo_ms === 0) return 0;
  
  const penalidade = erros + warnings * 10;
  const base = Math.max(0, 100 - penalidade);
  const tempo_s = tempo_ms / 1000;
  
  // Score ajustado pelo tempo (quanto mais rápido, melhor)
  const score = base / Math.max(1, tempo_s / 10);
  
  return Math.min(100, Math.max(0, score));
}

/**
 * Registra execução no D1
 */
export async function registrarAuditoria(
  db: any,
  log: AuditLog
): Promise<void> {
  const score = log.score ?? calcularScore(
    log.erros ?? 0,
    log.warnings ?? 0,
    log.tempo_ms
  );

  await db.prepare(`
    INSERT INTO audit_cascade (
      modelo, arquivo, comando, tempo_ms, sucesso,
      checksum, erros, warnings, score, detalhes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    log.modelo,
    log.arquivo ?? null,
    log.comando ?? null,
    log.tempo_ms,
    log.sucesso ? 1 : 0,
    log.checksum ?? null,
    log.erros ?? 0,
    log.warnings ?? 0,
    score,
    log.detalhes ? JSON.stringify(log.detalhes) : null
  ).run();
}

/**
 * Busca métricas agregadas por modelo
 */
export async function buscarMetricas(db: any): Promise<any[]> {
  const result = await db.prepare(`
    SELECT * FROM vw_cascade_metrics
  `).all();
  
  return result.results || [];
}

/**
 * Busca últimas execuções
 */
export async function buscarRecentes(db: any, limit: number = 20): Promise<any[]> {
  const result = await db.prepare(`
    SELECT * FROM vw_cascade_recentes LIMIT ?
  `).bind(limit).all();
  
  return result.results || [];
}

/**
 * Verifica se score está abaixo do threshold
 */
export async function verificarScoreBaixo(
  db: any,
  threshold: number = 85
): Promise<boolean> {
  const result = await db.prepare(`
    SELECT AVG(score) as score_medio
    FROM audit_cascade
    WHERE created_at > datetime('now', '-1 hour')
  `).first();
  
  return (result?.score_medio ?? 100) < threshold;
}

/**
 * Exemplo de uso
 */
export async function exemplo(db: any) {
  const inicio = Date.now();
  
  // Simular execução
  const sucesso = true;
  const erros = 0;
  const warnings = 2;
  
  const tempo_ms = Date.now() - inicio;
  
  await registrarAuditoria(db, {
    modelo: 'sonnet-4.5',
    arquivo: 'src/worker/api/v2/qualificacoes.ts',
    comando: 'build',
    tempo_ms,
    sucesso,
    checksum: calcularChecksum('src/worker/api/v2/qualificacoes.ts'),
    erros,
    warnings,
    detalhes: {
      build_size: '2.5MB',
      chunks: 78
    }
  });
  
  console.log('✅ Auditoria registrada com sucesso');
}

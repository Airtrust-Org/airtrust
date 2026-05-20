/**
 * QUALIFICACOES - MÓDULO VALIDAÇÃO
 * Funções de validação e regras de negócio
 *
 * Exporta funções centralizadas para validação de qualificações
 */

import type { Env } from '../../types';

// ===== TIPOS =====
export interface ValidacaoResult {
  valido: boolean;
  erros: string[];
  avisos: string[];
}

export interface ElegibilidadeData {
  pode_renovar: boolean;
  pode_atribuir: boolean;
  motivos: string[];
}

// ===== VALIDAÇÕES DE DATA =====
export function validateDataRenovacao(
  dataVencimento: string,
  dataSolicitada: string,
): ValidacaoResult {
  const erros: string[] = [];
  const avisos: string[] = [];

  try {
    const vencimento = new Date(dataVencimento);
    const solicitada = new Date(dataSolicitada);
    const hoje = new Date();

    if (isNaN(vencimento.getTime())) {
      erros.push('Data de vencimento inválida');
    }
    if (isNaN(solicitada.getTime())) {
      erros.push('Data de solicitação inválida');
    }

    if (erros.length > 0) {
      return { valido: false, erros, avisos };
    }

    // Não pode renovar no passado
    if (solicitada < hoje) {
      erros.push('Data de renovação não pode ser no passado');
    }

    // Avisar se renovação é muito antecipada
    const diasAntecipacao = Math.floor(
      (solicitada.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diasAntecipacao > 180) {
      avisos.push(`Renovação com ${Math.abs(diasAntecipacao)} dias de antecedência`);
    }

    // Avisar se renovação é muito tardia
    if (diasAntecipacao < -30) {
      avisos.push(`Renovação com ${Math.abs(diasAntecipacao)} dias de atraso`);
    }
  } catch (e) {
    erros.push(`Erro ao validar datas: ${(e as Error).message}`);
  }

  return {
    valido: erros.length === 0,
    erros,
    avisos,
  };
}

// ===== VALIDAÇÕES DE REGRAS DE NEGÓCIO =====
export async function validateQualificacaoRules(
  db: D1Database,
  funcionarioId: number,
  qualificacaoId: number,
): Promise<ValidacaoResult> {
  const erros: string[] = [];
  const avisos: string[] = [];

  try {
    // Verificar funcionário
    const func = await db
      .prepare('SELECT id, status FROM funcionarios WHERE id = ? AND deleted_at IS NULL LIMIT 1')
      .bind(funcionarioId)
      .first();
    if (!func) {
      erros.push('Funcionário não existe ou foi deletado');
      return { valido: false, erros, avisos };
    }

    if ((func as any).status !== 'ATIVO') {
      avisos.push(`Funcionário tem status: ${(func as any).status}`);
    }

    // Verificar tipo
    const tipo = await db
      .prepare(
        'SELECT id, ativo FROM qualificacoes_tipos WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      )
      .bind(qualificacaoId)
      .first();
    if (!tipo) {
      erros.push('Tipo de qualificação não existe ou foi deletado');
      return { valido: false, erros, avisos };
    }

    if ((tipo as any).ativo === 0) {
      avisos.push('Tipo de qualificação está inativo');
    }
  } catch (e) {
    erros.push(`Erro ao validar regras: ${(e as Error).message}`);
  }

  return {
    valido: erros.length === 0,
    erros,
    avisos,
  };
}

// ===== CHECK DE CONFLITOS =====
export async function checkConflitos(
  db: D1Database,
  funcionarioId: number,
  qualificacaoId: number,
  dataRenovacao?: string,
): Promise<ValidacaoResult> {
  const erros: string[] = [];
  const avisos: string[] = [];

  try {
    // Verificar se já existe qualificação ativa para este funcionário
    const existing = await db
      .prepare(
        `SELECT id, data_vencimento FROM qualificacoes_historico 
         WHERE funcionario_id = ? AND qualificacao_id = ? AND deleted_at IS NULL 
         ORDER BY data_vencimento DESC LIMIT 1`,
      )
      .bind(funcionarioId, qualificacaoId)
      .first();

    if (existing) {
      const dataVencimento = (existing as any).data_vencimento;
      const hoje = new Date().toISOString().substring(0, 10);

      if (dataVencimento > hoje) {
        avisos.push(`Funcionário já possui esta qualificação válida até ${dataVencimento}`);
      }

      // Se está renovando, verificar se já existe renovação pendente
      if (dataRenovacao) {
        const renovacaoPendente = await db
          .prepare(
            `SELECT id FROM qualificacoes_renovacoes 
             WHERE qualificacao_historico_id = ? AND status = 'pendente' AND deleted_at IS NULL 
             LIMIT 1`,
          )
          .bind((existing as any).id)
          .first();

        if (renovacaoPendente) {
          erros.push('Já existe renovação pendente para esta qualificação');
        }
      }
    }
  } catch (e) {
    erros.push(`Erro ao verificar conflitos: ${(e as Error).message}`);
  }

  return {
    valido: erros.length === 0,
    erros,
    avisos,
  };
}

// ===== ELEGIBILIDADE =====
export async function getElegibilidade(
  db: D1Database,
  funcionarioId: number,
  qualificacaoId: number,
): Promise<ElegibilidadeData> {
  const pode_renovar = true;
  const pode_atribuir = true;
  const motivos: string[] = [];

  try {
    // Validar regras
    const regras = await validateQualificacaoRules(db, funcionarioId, qualificacaoId);
    if (!regras.valido) {
      motivos.push(...regras.erros);
    }

    // Verificar conflitos
    const conflitos = await checkConflitos(db, funcionarioId, qualificacaoId);
    if (conflitos.avisos.length > 0) {
      motivos.push(...conflitos.avisos);
    }

    return {
      pode_renovar: regras.valido && conflitos.valido,
      pode_atribuir: regras.valido,
      motivos,
    };
  } catch (e) {
    return {
      pode_renovar: false,
      pode_atribuir: false,
      motivos: [`Erro ao calcular elegibilidade: ${(e as Error).message}`],
    };
  }
}

// ===== COMPLIANCE CHECKS =====
export async function complianceCheck(
  db: D1Database,
  funcionarioId: number,
): Promise<ValidacaoResult> {
  const erros: string[] = [];
  const avisos: string[] = [];

  try {
    // Buscar qualificações vencidas
    const vencidas = await db
      .prepare(
        `SELECT COUNT(*) as count FROM qualificacoes_historico 
         WHERE funcionario_id = ? AND deleted_at IS NULL 
         AND julianday(data_vencimento) < julianday('now')`,
      )
      .bind(funcionarioId)
      .first();

    const countVencidas = Number((vencidas as any)?.count || 0);
    if (countVencidas > 0) {
      erros.push(`Funcionário tem ${countVencidas} qualificação(ões) vencida(s)`);
    }

    // Avisar se há vencendo em 30 dias
    const vencendo = await db
      .prepare(
        `SELECT COUNT(*) as count FROM qualificacoes_historico 
         WHERE funcionario_id = ? AND deleted_at IS NULL 
         AND julianday(data_vencimento) >= julianday('now') 
         AND julianday(data_vencimento) <= julianday('now', '+30 days')`,
      )
      .bind(funcionarioId)
      .first();

    const countVencendo = Number((vencendo as any)?.count || 0);
    if (countVencendo > 0) {
      avisos.push(`Funcionário tem ${countVencendo} qualificação(ões) vencendo em 30 dias`);
    }
  } catch (e) {
    erros.push(`Erro ao fazer compliance check: ${(e as Error).message}`);
  }

  return {
    valido: erros.length === 0,
    erros,
    avisos,
  };
}

// ===== VALIDAÇÃO DE DADOS DE ENTRADA =====
export function validateDataVencimento(dataVencimento: string): ValidacaoResult {
  const erros: string[] = [];
  const avisos: string[] = [];

  try {
    const data = new Date(dataVencimento);
    if (isNaN(data.getTime())) {
      erros.push('Formato de data inválido');
      return { valido: false, erros, avisos };
    }

    const hoje = new Date();
    if (data < hoje) {
      avisos.push('Data de vencimento é no passado');
    }

    // Avisar se vencimento é muito distante (mais de 10 anos)
    if (data.getFullYear() - hoje.getFullYear() > 10) {
      avisos.push('Data de vencimento é muito distante (mais de 10 anos)');
    }
  } catch (e) {
    erros.push(`Erro ao validar data: ${(e as Error).message}`);
  }

  return {
    valido: erros.length === 0,
    erros,
    avisos,
  };
}

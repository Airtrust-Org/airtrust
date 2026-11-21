/**
 * ESCALAS — substituição de alocação em conflito (conflito_override=1).
 */

import {
  findAlocacaoConflitanteDoTenant,
  softDeleteAlocacaoConflitante,
  softDeleteEventosAutomaticosDoConflito,
  type AlocacaoConflitanteRow,
} from '../../repositories/escalas-alocacoes-repository';
import { createLogger, toError } from '../../utils/logger';
import {
  recalcularCoberturaAeronave,
  regenerarEventosAutomaticosFuncionarioEscala,
  removerFolgaAutomaticaOrfa,
} from './alocacao-engine';
import { removerFuncionarioFeriasPorAlocacao } from './alocacao-helpers';

/**
 * Apaga (soft) a alocação em conflito — só se for do tenant — e refaz o que dela derivava
 * (eventos, folga órfã, cobertura). Devolve a alocação removida, ou null se não for do tenant.
 */
export async function substituirAlocacaoSobreposta(
  db: D1Database,
  params: {
    conflitoId: string;
    empresaId: number;
    userId: string;
    logger: ReturnType<typeof createLogger>;
  },
): Promise<AlocacaoConflitanteRow | null> {
  const conflito = await findAlocacaoConflitanteDoTenant(db, params.conflitoId, params.empresaId);
  if (!conflito) return null;

  const now = new Date().toISOString();
  await softDeleteAlocacaoConflitante(db, { id: conflito.id, empresaId: params.empresaId, now });
  await softDeleteEventosAutomaticosDoConflito(db, {
    alocacaoId: conflito.id,
    empresaId: params.empresaId,
    now,
  });

  if (conflito.situacao_tipo) {
    await removerFuncionarioFeriasPorAlocacao(db, conflito.id);
  }

  if (conflito.quinzena_id) {
    try {
      await removerFolgaAutomaticaOrfa(db, {
        escalaId: conflito.escala_id,
        funcionarioId: conflito.funcionario_id,
        quinzenaId: conflito.quinzena_id,
      });
    } catch (error) {
      params.logger.error('[alocacoes] conflito_override folga_orfa error', toError(error), {
        conflitoId: conflito.id,
      });
    }
  }

  try {
    await regenerarEventosAutomaticosFuncionarioEscala({
      db,
      empresa_id: params.empresaId,
      escala_id: conflito.escala_id,
      funcionario_id: conflito.funcionario_id,
      created_by: params.userId || 'system',
    });
  } catch (error) {
    params.logger.error('[alocacoes] conflito_override regenerar_eventos error', toError(error), {
      conflitoId: conflito.id,
    });
  }

  if (conflito.aeronave_id) {
    try {
      await recalcularCoberturaAeronave(
        db,
        conflito.escala_id,
        conflito.aeronave_id,
        Number(conflito.mes),
        Number(conflito.ano),
      );
    } catch (error) {
      params.logger.error('[alocacoes] conflito_override cobertura error', toError(error), {
        conflitoId: conflito.id,
      });
    }
  }

  return conflito;
}

/**
 * ESCALAS — edição e remoção de alocação individual (PUT/DELETE /:id/alocacoes/:aid).
 *
 * `planAlocacaoUpdate` e `buildAlocacaoUpdateSet` são puros; `atualizarAlocacao` e
 * `removerAlocacao` orquestram validações, gravação e efeitos derivados (que nunca desfazem o
 * estado principal). Falhas de negócio voltam como `{ ok: false, status, body }` para a rota
 * apenas responder.
 */

import type { z } from 'zod';
import {
  existeFuncionarioAtivo,
  existeRestricaoNaoPodeVoarJunto,
  findAlocacaoDaEscala,
  findAlocacaoParaRemocao,
  findParceiroDoSlot,
  softDeleteAlocacao,
  softDeleteEventosAutomaticosDaAlocacao,
  updateAlocacaoCampos,
  type AlocacaoAtualRow,
} from '../../repositories/escalas-alocacoes-repository';
import { publishDomainEvent } from '../../shared/domainEvents';
import { createLogger, toError } from '../../utils/logger';
import { getEscalaVerificada } from './eventos-base';
import { substituirAlocacaoSobreposta } from './alocacao-conflito';
import {
  recalcularCoberturaAeronave,
  regenerarEventosAutomaticosFuncionarioEscala,
  removerFolgaAutomaticaOrfa,
} from './alocacao-engine';
import {
  auditarAlocacao,
  buscarAlocacoesDetalhadas,
  cancelarFolgasSobrepostas,
  checarSobreposicaoFuncionario,
  checarSobreposicaoSlot,
  escalasClientError,
  formatarDescricaoSobreposicao,
  removerFolgaAutomaticaSeExiste,
  resolverQuinzenaPadraoPorPeriodo,
  verificarHabilitacaoModelo,
} from './alocacao-helpers';
import type { AlocacaoUpdateSchema } from './alocacao-schemas';

export type AlocacaoUpdateInput = z.infer<typeof AlocacaoUpdateSchema>;
type Logger = ReturnType<typeof createLogger>;
type Row = Awaited<ReturnType<typeof buscarAlocacoesDetalhadas>>[number];

export type AlocacaoResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; body: Record<string, unknown> };

const falha = (status: number, body: Record<string, unknown>): { ok: false; status: number; body: Record<string, unknown> } => ({
  ok: false,
  status,
  body,
});

const escalaNaoEncontrada = () =>
  falha(404, escalasClientError('Escala não encontrada', 'ESCALAS_NOT_FOUND', 404));
const alocacaoNaoEncontrada = () =>
  falha(404, escalasClientError('Alocação não encontrada', 'ESCALAS_ALOCACAO_NOT_FOUND', 404));

/** Valores efetivos após a edição (o enviado vence o atual) e quais verificações se aplicam. */
export function planAlocacaoUpdate(atual: AlocacaoAtualRow, d: AlocacaoUpdateInput) {
  return {
    novoFuncionarioId: d.funcionario_id ?? atual.funcionario_id,
    novaFuncao: d.funcao ?? atual.funcao,
    novaInicio: d.data_inicio ?? atual.data_inicio,
    novaFim: d.data_fim ?? atual.data_fim,
    /** Mudou o período sem informar a quinzena: resolver a quinzena padrão do novo período. */
    resolverQuinzena:
      (d.data_inicio !== undefined || d.data_fim !== undefined) && d.quinzena_id === undefined,
    /** Mudou algo que pode gerar sobreposição de funcionário/slot/par. */
    revalidar: Boolean(d.data_inicio || d.data_fim || d.funcao || d.funcionario_id),
  };
}

/** Colunas a atualizar (sempre `updated_at`) e seus valores, só para o que foi enviado. */
export function buildAlocacaoUpdateSet(d: AlocacaoUpdateInput, novaQuinzenaId: number | null) {
  const campos: string[] = ["updated_at = datetime('now')"];
  const valores: unknown[] = [];
  const add = (coluna: string, valor: unknown) => {
    campos.push(`${coluna} = ?`);
    valores.push(valor);
  };

  if (d.funcionario_id !== undefined) add('funcionario_id', d.funcionario_id);
  if (d.funcao !== undefined) add('funcao', d.funcao);
  if (d.data_inicio !== undefined) add('data_inicio', d.data_inicio);
  if (d.data_fim !== undefined) add('data_fim', d.data_fim);
  if (d.status !== undefined) add('status', d.status);
  if (d.base !== undefined) add('base', d.base);
  if (d.observacoes !== undefined) add('observacoes', d.observacoes);
  if (d.quinzena_id !== undefined || d.data_inicio !== undefined || d.data_fim !== undefined) {
    add('quinzena_id', novaQuinzenaId);
  }
  if (d.padrao_escala_id !== undefined) add('padrao_escala_id', d.padrao_escala_id);

  return { campos, valores, vazio: campos.length === 1 };
}

const falhaSobreposicao = (conflito: NonNullable<Awaited<ReturnType<typeof checarSobreposicaoFuncionario>>>) =>
  falha(409, {
    success: false,
    code: 'SOBREPOSICAO_FUNCIONARIO',
    error: `Funcionário já está alocado em ${formatarDescricaoSobreposicao(conflito)}`,
    conflito,
    requer_confirmacao: true,
  });

/** Valida a troca de funcionário (existência no tenant e habilitação no modelo da aeronave). */
async function validarNovoFuncionario(
  db: D1Database,
  input: { empresaId: number; funcionarioId: string; aeronaveId: number | null },
) {
  if (!(await existeFuncionarioAtivo(db, input.funcionarioId, input.empresaId))) {
    return falha(404, escalasClientError('Funcionário não encontrado', 'ESCALAS_FUNCIONARIO_NOT_FOUND', 404));
  }
  if (input.aeronaveId) {
    const habilitacao = await verificarHabilitacaoModelo(
      db,
      input.funcionarioId,
      input.aeronaveId,
      input.empresaId,
    );
    if (!habilitacao.habilitado) {
      return falha(400, {
        success: false,
        error: habilitacao.motivo || 'Modelo não habilitado',
        code: 'MODELO_NAO_HABILITADO',
      });
    }
  }
  return null;
}

/** Sobreposição do funcionário, slot ocupado e restrição de par; null quando nada impede. */
async function validarConflitos(
  db: D1Database,
  input: {
    empresaId: number;
    userId: string;
    logger: Logger;
    escalaId: string;
    alocacaoId: string;
    atual: AlocacaoAtualRow;
    plano: ReturnType<typeof planAlocacaoUpdate>;
    conflitoOverride: boolean;
  },
) {
  const { empresaId, escalaId, alocacaoId, atual, plano } = input;

  const sobreposicaoFunc = await checarSobreposicaoFuncionario(
    db,
    empresaId,
    plano.novoFuncionarioId,
    plano.novaInicio,
    plano.novaFim,
    alocacaoId,
    atual.aeronave_id ?? null,
  );
  if (sobreposicaoFunc) {
    if (!input.conflitoOverride) return falhaSobreposicao(sobreposicaoFunc);
    const removida = await substituirAlocacaoSobreposta(db, {
      conflitoId: sobreposicaoFunc.id,
      empresaId,
      userId: input.userId || 'system',
      logger: input.logger,
    });
    if (!removida) return falhaSobreposicao(sobreposicaoFunc);
  }

  if (!atual.aeronave_id) return null;

  const sobreposicaoSlot = await checarSobreposicaoSlot(
    db,
    escalaId,
    atual.aeronave_id,
    plano.novaFuncao,
    plano.novaInicio,
    plano.novaFim,
    alocacaoId,
  );
  if (sobreposicaoSlot) {
    return falha(409, {
      success: false,
      code: 'SLOT_OCUPADO',
      error: `Slot ${plano.novaFuncao} já está ocupado por ${sobreposicaoSlot.funcionario_nome} de ${sobreposicaoSlot.data_inicio} a ${sobreposicaoSlot.data_fim}`,
    });
  }

  if (plano.novaFuncao === 'PIC' || plano.novaFuncao === 'SIC') {
    const parceiro = await findParceiroDoSlot(db, {
      escalaId,
      aeronaveId: atual.aeronave_id,
      funcaoOposta: plano.novaFuncao === 'PIC' ? 'SIC' : 'PIC',
      alocacaoId,
      dataInicio: plano.novaInicio,
      dataFim: plano.novaFim,
    });
    if (
      parceiro &&
      (await existeRestricaoNaoPodeVoarJunto(db, plano.novoFuncionarioId, parceiro.funcionario_id, plano.novaInicio))
    ) {
      return falha(409, {
        success: false,
        code: 'RESTRICAO_PAR',
        error: 'Restrição de tripulação: estes pilotos não podem voar juntos',
      });
    }
  }
  return null;
}

/** Roda um efeito derivado; se falhar, só registra (o estado principal já foi gravado). */
async function melhorEsforco(logger: Logger, mensagem: string, ctx: Record<string, unknown>, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    logger.error(mensagem, toError(e), ctx);
  }
}

export async function atualizarAlocacao(
  db: D1Database,
  input: {
    escalaId: string;
    alocacaoId: string;
    empresaId: number;
    userId: string;
    dados: AlocacaoUpdateInput;
    logger: Logger;
  },
): Promise<AlocacaoResult<Row | null>> {
  const { escalaId, alocacaoId, empresaId, userId, logger } = input;
  const d = input.dados;

  const escala = await getEscalaVerificada(db, escalaId, empresaId);
  if (!escala) return escalaNaoEncontrada();

  const atual = await findAlocacaoDaEscala(db, alocacaoId, escalaId);
  if (!atual) return alocacaoNaoEncontrada();
  if (atual.status === 'cancelado') {
    return falha(
      409,
      escalasClientError('Não é possível editar uma alocação cancelada', 'ESCALAS_ALOCACAO_CANCELADA', 409),
    );
  }

  const plano = planAlocacaoUpdate(atual, d);
  let novaQuinzenaId = d.quinzena_id ?? atual.quinzena_id;
  if (plano.resolverQuinzena) {
    novaQuinzenaId = await resolverQuinzenaPadraoPorPeriodo(db, {
      empresaId,
      ano: Number(escala.mes ? escala.ano : 0),
      mes: Number(escala.mes),
      dataInicio: plano.novaInicio,
      dataFim: plano.novaFim,
    });
  }

  if (d.funcionario_id) {
    const erro = await validarNovoFuncionario(db, {
      empresaId,
      funcionarioId: d.funcionario_id,
      aeronaveId: atual.aeronave_id,
    });
    if (erro) return erro;
  }

  if (plano.revalidar) {
    const erro = await validarConflitos(db, {
      empresaId,
      userId,
      logger,
      escalaId,
      alocacaoId,
      atual,
      plano,
      conflitoOverride: d.conflito_override === 1,
    });
    if (erro) return erro;
  }

  const set = buildAlocacaoUpdateSet(d, novaQuinzenaId);
  if (set.vazio) {
    return falha(400, escalasClientError('Nenhum campo para atualizar', 'ESCALAS_EMPTY_UPDATE', 400));
  }
  await updateAlocacaoCampos(db, { escalaId, alocacaoId, empresaId, campos: set.campos, valores: set.valores });

  if (atual.quinzena_id && atual.quinzena_id !== novaQuinzenaId) {
    await removerFolgaAutomaticaOrfa(db, {
      escalaId,
      funcionarioId: atual.funcionario_id,
      quinzenaId: atual.quinzena_id,
    });
  }

  await melhorEsforco(logger, '[alocacoes] PUT limpar_folga_conflitante error', { escalaId, alocacaoId }, () =>
    cancelarFolgasSobrepostas(db, {
      escalaId,
      funcionarioId: plano.novoFuncionarioId,
      dataInicio: plano.novaInicio,
      dataFim: plano.novaFim,
      ignorarAlocacaoId: alocacaoId,
    }),
  );

  if (novaQuinzenaId) {
    await removerFolgaAutomaticaSeExiste(db, {
      escalaId,
      funcionarioId: plano.novoFuncionarioId,
      quinzenaId: novaQuinzenaId,
    });
  }

  await melhorEsforco(logger, '[alocacoes] PUT auditoria error', { escalaId, alocacaoId }, () =>
    auditarAlocacao(db, {
      escala_id: escalaId,
      acao: 'EDITAR_ALOCACAO',
      alocacao_id: alocacaoId,
      realizado_por: userId || 'system',
      valor_anterior: JSON.stringify({
        funcao: atual.funcao,
        data_inicio: atual.data_inicio,
        data_fim: atual.data_fim,
      }),
      valor_novo: JSON.stringify(d),
    }),
  );

  await melhorEsforco(logger, '[alocacoes] PUT gerarEventos error', { escalaId, alocacaoId }, async () => {
    for (const funcionarioId of new Set([atual.funcionario_id, plano.novoFuncionarioId])) {
      await regenerarEventosAutomaticosFuncionarioEscala({
        db,
        empresa_id: empresaId,
        escala_id: escalaId,
        funcionario_id: funcionarioId,
        created_by: userId || 'system',
      });
    }
  });

  await melhorEsforco(logger, '[alocacoes] PUT cobertura error', { escalaId, alocacaoId }, async () => {
    if (atual.aeronave_id) {
      await recalcularCoberturaAeronave(db, escalaId, atual.aeronave_id, Number(escala.mes), Number(escala.ano));
    }
  });

  const [atualizada] = await buscarAlocacoesDetalhadas(db, { escalaId, alocacaoId });
  return { ok: true, data: atualizada ?? null };
}

export async function removerAlocacao(
  db: D1Database,
  input: { escalaId: string; alocacaoId: string; empresaId: number; userId: string; logger: Logger },
): Promise<AlocacaoResult<{ eventos_removidos: number }>> {
  const { escalaId, alocacaoId, empresaId, userId, logger } = input;

  const escala = await getEscalaVerificada(db, escalaId, empresaId);
  if (!escala) return escalaNaoEncontrada();

  const alocacao = await findAlocacaoParaRemocao(db, alocacaoId, escalaId);
  if (!alocacao) return alocacaoNaoEncontrada();

  await softDeleteAlocacao(db, { alocacaoId, escalaId, empresaId });

  if (alocacao.quinzena_id) {
    await melhorEsforco(logger, '[alocacoes] DELETE folga_orf error', { escalaId, alocacaoId }, () =>
      removerFolgaAutomaticaOrfa(db, {
        escalaId,
        funcionarioId: alocacao.funcionario_id,
        quinzenaId: alocacao.quinzena_id as number,
      }),
    );
  }

  const eventosRemovidos = await softDeleteEventosAutomaticosDaAlocacao(db, alocacaoId, empresaId);

  await melhorEsforco(logger, '[alocacoes] DELETE gerarEventos error', { escalaId, alocacaoId }, () =>
    regenerarEventosAutomaticosFuncionarioEscala({
      db,
      empresa_id: empresaId,
      escala_id: escalaId,
      funcionario_id: alocacao.funcionario_id,
      created_by: userId || 'system',
    }),
  );

  await melhorEsforco(logger, '[alocacoes] DELETE auditoria error', { escalaId, alocacaoId }, () =>
    auditarAlocacao(db, {
      escala_id: escalaId,
      acao: 'REMOVER_ALOCACAO',
      alocacao_id: alocacaoId,
      realizado_por: userId || 'system',
      valor_anterior: JSON.stringify({ funcionario_id: alocacao.funcionario_id, funcao: alocacao.funcao }),
    }),
  );

  await melhorEsforco(logger, '[alocacoes] DELETE domain_event error', { escalaId, alocacaoId }, () =>
    publishDomainEvent(db, 'escalas', 'TRIPULANTE_REMOVIDO', {
      empresa_id: empresaId,
      origem_modulo: 'escalas',
      origem_usuario_id: userId,
      funcionario_id: alocacao.funcionario_id,
      escala_id: escalaId,
      alocacao_id: alocacaoId,
      papel: alocacao.funcao,
    }),
  );

  await melhorEsforco(logger, '[alocacoes] DELETE cobertura error', { escalaId, alocacaoId }, async () => {
    if (alocacao.aeronave_id) {
      await recalcularCoberturaAeronave(db, escalaId, alocacao.aeronave_id, Number(escala.mes), Number(escala.ano));
    }
  });

  return { ok: true, data: { eventos_removidos: eventosRemovidos } };
}

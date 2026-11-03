/**
 * SIMULADORES — fase "participantes + fichas" do PUT /sessoes/:id.
 *
 * `planParticipantes` é puro (compara a lista atual com a enviada); `applyParticipantes`
 * troca a lista no banco e cria a ficha — com manobras — de quem entrou agora.
 */

import { buildOperationalFichaManobras, type FichaManobraBase } from '../../constants/notechs';
import {
  existeFichaViva,
  findModeloIdDoTenant,
  findModeloIdPorTipoEAeronave,
  findTipoAeronaveDeFichaDaSessao,
  insertFichaManobras,
  insertFichaPendente,
  insertParticipanteConfirmado,
  listManobrasDoModelo,
  softDeleteFichasDoAluno,
  softDeleteParticipantesDaSessao,
  type FichaManobraInsert,
  type ParticipanteAtualRow,
  type SessaoAtualRow,
} from '../../repositories/simuladores/session-participants-repository';
import { getSimuladorModeloAeronave, instrutorEstaEntreParticipantes } from './shared';

/** Item de participante como recebido no corpo do PUT. */
export interface ParticipanteInput {
  funcionario_id?: string | number;
  funcao?: string;
}

export type ParticipanteValido = ParticipanteInput & { funcionario_id: string | number };

export interface ParticipantesPlan {
  novosValidos: ParticipanteValido[];
  /** O instrutor efetivo da sessão consta entre os participantes (autoavaliação) — deve ser recusado. */
  instrutorEntreParticipantes: boolean;
  /** Funcionários que estavam na sessão e não estão mais na lista enviada. */
  removidos: number[];
  /** A lista (ids + funções) mudou em relação à atual — dispara notificação. */
  alterados: boolean;
}

/** PIC para o primeiro participante, SIC para os demais, salvo função explícita. */
export function funcaoDoParticipante(part: ParticipanteInput, index: number): string {
  return part.funcao || (index === 0 ? 'PIC' : 'SIC');
}

export function planParticipantes(input: {
  atuais: ParticipanteAtualRow[];
  enviados: ParticipanteInput[];
  instrutorEfetivo: unknown;
}): ParticipantesPlan {
  const { atuais, enviados, instrutorEfetivo } = input;
  const idsAntigos = new Set(atuais.map((r) => Number(r.funcionario_id)));

  const novosValidos = enviados.filter((p): p is ParticipanteValido => Boolean(p.funcionario_id));
  const idsNovos = new Set(novosValidos.map((p) => Number(p.funcionario_id)));

  const assinaturaAntiga = atuais
    .map((p) => `${Number(p.funcionario_id)}:${String(p.funcao || '').toUpperCase()}`)
    .sort()
    .join('|');
  const assinaturaNova = novosValidos
    .map((p, index) => `${Number(p.funcionario_id)}:${funcaoDoParticipante(p, index).toUpperCase()}`)
    .sort()
    .join('|');

  return {
    novosValidos,
    instrutorEntreParticipantes: instrutorEstaEntreParticipantes(instrutorEfetivo, novosValidos),
    removidos: [...idsAntigos].filter((fid) => !idsNovos.has(fid)),
    alterados: assinaturaAntiga !== assinaturaNova,
  };
}

/** Campos do corpo do PUT que alimentam a criação das fichas novas. */
export interface FichaDefaultsBody {
  instrutor_id?: string | number | null;
  tipo_sessao?: string | null;
  data?: string | null;
  tipo_aeronave?: string | null;
  modelo_sessao_id?: string | number | null;
  template_id?: string | number | null;
}

async function resolverModeloIdParaFicha(
  db: D1Database,
  input: {
    empresaId: number;
    body: FichaDefaultsBody;
    sessaoAtual: SessaoAtualRow | null;
    tipoSessao: string;
    tipoAeronave: string | null;
  },
): Promise<number | null> {
  const candidate =
    input.body.modelo_sessao_id || input.body.template_id || input.sessaoAtual?.template_id || null;
  if (candidate) {
    const doTenant = await findModeloIdDoTenant(db, candidate, input.empresaId);
    if (doTenant) return doTenant;
  }
  return findModeloIdPorTipoEAeronave(db, {
    empresaId: input.empresaId,
    tipoSessaoCodigo: input.tipoSessao,
    tipoAeronave: input.tipoAeronave,
  });
}

async function criarFichaDoParticipante(
  db: D1Database,
  input: {
    empresaId: number;
    sessaoId: string;
    body: FichaDefaultsBody;
    sessaoAtual: SessaoAtualRow | null;
    alunoId: string | number;
  },
): Promise<void> {
  const { empresaId, sessaoId, body, sessaoAtual } = input;

  const tipoSessao = sessaoAtual?.tipo_sessao || body.tipo_sessao || 'TREINAMENTO';
  const instrutorIdFinal =
    body.instrutor_id !== undefined ? body.instrutor_id : sessaoAtual?.instrutor_id || null;
  const dataFichaFinal = body.data || sessaoAtual?.data || new Date().toISOString().split('T')[0];

  // Inferir tipo_aeronave: preferir payload, senão ficha existente da sessão, senão simulador da sessão
  let tipoAeronave: string | null = body.tipo_aeronave || null;
  if (!tipoAeronave) {
    tipoAeronave = await findTipoAeronaveDeFichaDaSessao(db, sessaoId, empresaId);
  }
  if (!tipoAeronave) {
    tipoAeronave =
      (await getSimuladorModeloAeronave(db, sessaoAtual?.simulador_id, empresaId)) || null;
  }

  const fichaId = await insertFichaPendente(db, {
    uuid: crypto.randomUUID(),
    sessaoId,
    alunoId: input.alunoId,
    instrutorId: instrutorIdFinal ?? null,
    tipoSessao,
    tipoAeronave,
    dataSessao: dataFichaFinal,
    empresaId,
  });

  // Popular manobras automaticamente
  const modeloId = await resolverModeloIdParaFicha(db, {
    empresaId,
    body,
    sessaoAtual,
    tipoSessao,
    tipoAeronave,
  });
  if (!modeloId) return;

  const manobrasModelo = await listManobrasDoModelo(db, empresaId, modeloId);
  const manobras = buildOperationalFichaManobras(manobrasModelo as FichaManobraBase[]);
  if (manobras.length > 0) {
    await insertFichaManobras(db, fichaId, manobras as FichaManobraInsert[]);
  }
}

/**
 * Troca a lista de participantes da sessão: apaga (soft) as fichas de quem saiu e os
 * participantes antigos, insere os novos CONFIRMADO e cria a ficha de quem ainda não tem.
 */
export async function applyParticipantes(
  db: D1Database,
  input: {
    empresaId: number;
    sessaoId: string;
    body: FichaDefaultsBody;
    sessaoAtual: SessaoAtualRow | null;
    plan: ParticipantesPlan;
  },
): Promise<void> {
  const { empresaId, sessaoId, body, sessaoAtual, plan } = input;

  for (const fid of plan.removidos) {
    await softDeleteFichasDoAluno(db, sessaoId, fid, empresaId);
  }

  await softDeleteParticipantesDaSessao(db, sessaoId, empresaId);

  for (const [index, part] of plan.novosValidos.entries()) {
    await insertParticipanteConfirmado(db, {
      uuid: crypto.randomUUID(),
      sessaoId,
      funcionarioId: part.funcionario_id,
      funcao: funcaoDoParticipante(part, index),
    });

    // Criar ficha para qualquer participante que ainda não a tenha (cobre retroativos)
    if (!(await existeFichaViva(db, sessaoId, part.funcionario_id))) {
      await criarFichaDoParticipante(db, {
        empresaId,
        sessaoId,
        body,
        sessaoAtual,
        alunoId: part.funcionario_id,
      });
    }
  }
}

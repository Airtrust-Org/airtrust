/**
 * SIMULADORES — cauda do PUT /sessoes/:id: efeitos derivados depois que a sessão foi salva.
 *
 * Tudo aqui é best-effort: falhas são absorvidas (ou devolvidas ao chamador para virar
 * 409 "integração pendente"); nenhuma delas desfaz o estado principal já persistido.
 */

import { isCompletedStatus } from '../../lib/status/status-codes';
import { enviarEmailFichaSessao } from '../../lib/fichaEmails';
import { publishDomainEvent } from '../../shared/domainEvents';
import type { Env } from '../../types';
import { listFichaIdsAvaliacaoPendente } from '../../repositories/simuladores/session-completion-repository';
import { listParticipantesAtivos } from '../../repositories/simuladores/session-participants-repository';
import {
  sendSimulatorSessionEmailNotifications,
  shouldNotifySimulatorSessionUpdate,
} from '../simuladores-session-notifications';
import { sincronizarQualificacoesDaSessaoConcluida } from './shared';

/** A sessão acabou de ser concluída (não estava e passou a estar). */
export function sessaoVirouConcluida(statusAnterior: unknown, statusNovo: unknown): boolean {
  return isCompletedStatus(String(statusNovo || '').toUpperCase()) &&
    !isCompletedStatus(String(statusAnterior || '').toUpperCase());
}

/** Sincroniza as qualificações da sessão concluída; o erro volta como valor para ir ao diagnóstico. */
export async function sincronizarQualificacoesAoConcluir(
  db: D1Database,
  input: { sessaoId: number; empresaId: number },
): Promise<{ atualizadas: number } | { erro: string }> {
  try {
    const result = await sincronizarQualificacoesDaSessaoConcluida(db, input);
    return { atualizadas: result.atualizadas };
  } catch (error: unknown) {
    return { erro: (error instanceof Error ? error.message : '') || String(error) };
  }
}

export interface SessaoSalvaRow {
  empresa_id?: number | string | null;
  data?: string | null;
  status?: string | null;
  tipo_sessao?: string | null;
}

/** Um evento de domínio por participante ativo: SIMULADOR_REALIZADO se concluída, senão AGENDADO. */
export async function publicarEventosDaSessao(
  db: D1Database,
  input: { sessaoId: string; empresaIdPadrao: number; sessao: SessaoSalvaRow | null },
): Promise<void> {
  try {
    const { sessaoId, sessao } = input;
    const eventEmpresaId = Number(sessao?.empresa_id || input.empresaIdPadrao);
    const participantes = await listParticipantesAtivos(db, sessaoId);
    if (eventEmpresaId > 0) {
      await Promise.allSettled(
        participantes.map((participante) =>
          publishDomainEvent(
            db,
            'simuladores',
            isCompletedStatus(sessao?.status) ? 'SIMULADOR_REALIZADO' : 'SIMULADOR_AGENDADO',
            {
              funcionario_id: String(participante.funcionario_id),
              empresa_id: eventEmpresaId,
              origem_modulo: 'simuladores',
              sessao_id: String(sessaoId),
              data_sessao: sessao?.data || null,
              tipo_sessao: sessao?.tipo_sessao || null,
            },
          ),
        ),
      );
    }
  } catch (error) {
    console.error('domain_event_error', error);
  }
}

/**
 * Enfileira (waitUntil) o e-mail de "sessão atualizada" quando algum campo relevante mudou
 * ou a lista de participantes mudou. `getExecutionCtx` é lazy: só é lido se for notificar.
 */
export function enfileirarEmailDeAtualizacao(input: {
  env: Env;
  db: D1Database;
  getExecutionCtx: () => { waitUntil: (p: Promise<unknown>) => void } | undefined;
  sessaoId: string;
  empresaIdPadrao: number;
  antes: Record<string, unknown>;
  depois: Record<string, unknown> | null;
  participantesAlterados: boolean;
}): void {
  const { sessaoId } = input;
  if (
    !shouldNotifySimulatorSessionUpdate(
      input.antes,
      input.depois as Record<string, unknown>,
      input.participantesAlterados,
    )
  ) {
    return;
  }
  const notificationEmpresaId = Number(input.depois?.empresa_id || input.empresaIdPadrao);
  input.getExecutionCtx()?.waitUntil(
    sendSimulatorSessionEmailNotifications(input.env, input.db, Number(sessaoId), {
      reason: 'updated',
      empresaId: notificationEmpresaId || undefined,
    })
      .then((results) => {
        const sent = results.filter((item) => item.status === 'sent').length;
        const skipped = results.filter((item) => item.status === 'skipped').length;
        const failed = results.filter((item) => item.status === 'failed').length;
        console.log('[simuladores] session update email notification queued', {
          sessao_id: sessaoId,
          sent,
          skipped,
          failed,
        });
      })
      .catch((error) => {
        console.error('[simuladores] session update email notification failed', error);
      }),
  );
}

/** Ao concluir a sessão, avisa o instrutor de cada ficha que aguarda a avaliação (fire-and-forget). */
export async function avisarInstrutorFichasPendentes(
  env: Env,
  db: D1Database,
  sessaoId: string,
): Promise<void> {
  try {
    for (const fichaId of await listFichaIdsAvaliacaoPendente(db, sessaoId)) {
      enviarEmailFichaSessao(env, db, fichaId, 'instrutor_avaliacao_pendente').catch((err) =>
        console.error('[fichaEmails] fire-and-forget error:', err),
      );
    }
  } catch (err) {
    console.error('[fichaEmails] Erro ao buscar fichas para notificação:', err);
  }
}

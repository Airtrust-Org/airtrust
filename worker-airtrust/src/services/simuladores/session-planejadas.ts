import {
  findModeloFallback,
  hasQualificacoesPlanejadas,
} from '../../repositories/simuladores/session-planejadas-repository';
import { criarQualificacoesPlanejadas, listarParticipantesDaSessaoParaQualificacao } from './shared';

/**
 * Criação tardia das qualificações PLANEJADAS de uma sessão (ex.: criada antes do deploy).
 * Movida de routes/simuladores-sessoes-update.ts sem mudar regras nem o diagnóstico
 * devolvido em `_diag_planejadas` (fixada por
 * simuladores-sessoes-update-planejadas.characterization.test).
 */

type Id = string | number;

/** Campos do corpo do PUT usados por esta fase. */
export interface PlanejadasBody {
  tipo_sessao?: unknown;
  tema_sessao?: unknown;
  data?: unknown;
}

/** Colunas da sessão (lidas antes do UPDATE) usadas por esta fase. */
export interface PlanejadasSessaoRow {
  tipo_sessao?: unknown;
  template_id?: unknown;
  nome?: unknown;
  data?: unknown;
}

/**
 * Se a sessão ainda não tem PLANEJADAS, escolhe o modelo (o da sessão ou um fallback que
 * prioriza os que geram qualificação) e as cria para os participantes. Nunca lança: falha
 * na criação vira `resultado: 'erro'` no diagnóstico, que o handler converte em 409 parcial.
 */
export async function ensureQualificacoesPlanejadas(
  db: D1Database,
  params: {
    empresaId: number;
    sessaoId: Id;
    sessao: PlanejadasSessaoRow;
    body: PlanejadasBody;
    templateIdFinal: number | null;
    modeloAeronaveSessao: string;
  },
): Promise<Record<string, unknown>> {
  const { empresaId, sessaoId, sessao: a, body: b, templateIdFinal, modeloAeronaveSessao } = params;
  const diag: Record<string, unknown> = {};

  const hasPlanejadas = await hasQualificacoesPlanejadas(db, sessaoId);
  diag.hasPlanejadas = hasPlanejadas;
  if (hasPlanejadas) {
    diag.resultado = 'ja_tem_planejadas';
    return diag;
  }

  const tipoSessaoPut = (b.tipo_sessao || a.tipo_sessao || '').toString();
  let modeloIdPut = Number(templateIdFinal || a.template_id || 0) || null;
  diag.tipoSessao = tipoSessaoPut;
  diag.modeloIdInicial = modeloIdPut;
  diag.templateIdFinal = templateIdFinal;

  // Robust model fallback: prioritize gera_qualificacao=1, then name match
  if (!modeloIdPut && tipoSessaoPut) {
    const upperNome = String(b.tema_sessao || a.nome || '')
      .trim()
      .toUpperCase();

    // Priority 1: model with gera_qualificacao=1 matching tipo_sessao + modelo_aeronave
    let fallbackModelo = await findModeloFallback(db, {
      empresaId,
      tipoSessao: tipoSessaoPut,
      modeloAeronave: modeloAeronaveSessao,
      upperNome,
      somenteGeraQualificacao: true,
    });

    // Priority 2: any model matching tipo_sessao + modelo_aeronave (prefer name match)
    if (!fallbackModelo) {
      fallbackModelo = await findModeloFallback(db, {
        empresaId,
        tipoSessao: tipoSessaoPut,
        modeloAeronave: modeloAeronaveSessao,
        upperNome,
        somenteGeraQualificacao: false,
      });
    }

    diag.fallbackModelo = fallbackModelo?.id ?? null;
    if (fallbackModelo) modeloIdPut = fallbackModelo.id;
  }
  diag.modeloIdFinal = modeloIdPut;

  if (!modeloIdPut) {
    diag.resultado = 'sem_modelo';
    return diag;
  }

  const participantesRows = await listarParticipantesDaSessaoParaQualificacao(db, sessaoId);
  diag.numParticipantes = participantesRows.length;
  if (participantesRows.length === 0) {
    diag.resultado = 'sem_participantes';
    return diag;
  }

  try {
    const res = await criarQualificacoesPlanejadas(db, {
      sessaoId: Number(sessaoId),
      modeloId: modeloIdPut,
      tipoSessao: tipoSessaoPut,
      data: (b.data || a.data) as string,
      participantes: participantesRows,
      empresaId,
    });
    diag.resultado = res.criadas > 0 ? 'criadas' : 'sem_novas';
    diag.criadas = res.criadas;
    diag.puladas = res.puladas;
    diag.conflitosUniques = res.conflitosUniques;
    diag.bloqueadasDataPassada = res.bloqueadasDataPassada;
  } catch (err) {
    diag.resultado = 'erro';
    diag.erro = (err as { message?: string } | null)?.message || String(err);
  }
  return diag;
}

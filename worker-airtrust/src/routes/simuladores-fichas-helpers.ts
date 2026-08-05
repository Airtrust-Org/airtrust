/**
 * SIMULADORES — Fichas Helpers
 * Business-logic helpers extracted from simuladores-fichas.ts.
 * Used by the main fichas router and fichas-simulador routes.
 */

import { audit } from './simuladores-shared';
import { upsertQualificacaoHistoricoDaFicha } from '../services/qualificacoes-historico-ficha';
import { realizarG1SemPendente } from '../services/qualificacoes-g1-sem';
import {
  calculateQualificationExpiry,
  normalizeValidityMonths,
} from '../services/qualification-history-atomic';

export type QualificacaoGerada = {
  codigo: string;
  nome: string;
  valida_ate: string | null;
  tipo: 'principal' | 'fap';
};

export type ResultadoGeracaoQualificacao = {
  qualificacao_id: number;
  funcionario: string;
  tipo: string;
  nome: string;
  valida_ate: string | null;
  faps_geradas: Array<{ codigo: string; nome: string; valida_ate: string | null }>;
  qualificacoes_geradas: QualificacaoGerada[];
};

type QualificationGenerationFichaRow = {
  status: string | null;
  aprovado: number | null;
  modelo_qualificacao_tipo_id: number | null;
  modelo_qualificacao_codigo: string | null;
  tipo_sessao: string | null;
  tipo_aeronave: string | null;
  modelo_qualificacao_nome: string | null;
  modelo_qualificacao_validade: number | string | null;
  data_sessao: string | null;
  aluno_empresa_id: number | null;
  colaborador_id_aluno: number | null;
  aluno_nome: string;
  empresa_id: number;
  agendamento_slot_id: number | null;
  tipo_curricular_codigo: string | null;
  tipo_curricular_nome: string | null;
  modelo_id: number | null;
};

type QualificationCheckRow = {
  qualificacao_tipo_id: number;
  qt_codigo: string;
  qt_nome: string;
  qt_validade: number | string | null;
};

function normalizeTipoCurricular(value?: string | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

/**
 * G1-SEM is a curricular completion, not a side effect of a six-month FAP.
 * Keep this intentionally strict: an unresolved curricular type must fail closed.
 */
export function isTipoCurricularSemestral(codigo?: string | null, nome?: string | null): boolean {
  const normalizedCodigo = normalizeTipoCurricular(codigo);
  const normalizedNome = normalizeTipoCurricular(nome);
  if (normalizedCodigo) {
    return normalizedCodigo === 'SEM' || normalizedCodigo === 'SEMESTRAL';
  }
  return normalizedNome === 'SEM' || normalizedNome === 'SEMESTRAL';
}

export function getQualificacaoGeracaoErrorStatus(message: string): number | null {
  if (message === 'Não encontrada') return 404;
  if (
    message === 'Status precisa ser APROVADO' ||
    message === 'Precisa estar aprovado' ||
    message.startsWith('Nenhuma qualificação foi gerada.')
  ) {
    return 400;
  }
  return null;
}

export async function gerarQualificacaoDaFicha(
  db: D1Database,
  fichaId: string | number,
): Promise<ResultadoGeracaoQualificacao> {
  const fid = String(fichaId);
  const f = await db
    .prepare(
      `SELECT f.*, aluno.nome as aluno_nome,
              aluno.empresa_id as aluno_empresa_id,
              sa.template_id as sessao_template_id,
              sac.modelo_sessao_id as atribuicao_modelo_sessao_id,
              ms.id as modelo_id,
              ms.qualificacao_tipo_id as modelo_qualificacao_tipo_id,
              qt.codigo as modelo_qualificacao_codigo,
              qt.nome as modelo_qualificacao_nome,
              qt.validade as modelo_qualificacao_validade,
              ts.codigo as tipo_curricular_codigo,
              ts.nome as tipo_curricular_nome
       FROM fichas_sessao f
       LEFT JOIN funcionarios aluno
         ON f.colaborador_id_aluno = aluno.id
        AND aluno.empresa_id = f.empresa_id
       LEFT JOIN simulador_agendamentos sa
         ON sa.id = f.agendamento_slot_id
        AND sa.empresa_id = f.empresa_id
        AND sa.deleted_at IS NULL
       LEFT JOIN simulador_atribuicoes_curriculares sac
         ON sac.id = f.atribuicao_curricular_id
        AND sac.empresa_id = f.empresa_id
        AND sac.deleted_at IS NULL
       LEFT JOIN modelos_sessao ms ON (
         (sac.modelo_sessao_id IS NOT NULL AND ms.id = sac.modelo_sessao_id)
         OR (sac.modelo_sessao_id IS NULL AND f.template_id IS NOT NULL AND ms.id = f.template_id)
         OR (sac.modelo_sessao_id IS NULL AND f.template_id IS NULL AND sa.template_id IS NOT NULL AND ms.id = sa.template_id)
         OR (sac.modelo_sessao_id IS NULL AND f.template_id IS NULL AND sa.template_id IS NULL AND ms.codigo = f.tipo_sessao)
       )
        AND ms.empresa_id = f.empresa_id
        AND ms.deleted_at IS NULL
       LEFT JOIN tipos_sessao ts
         ON ts.id = ms.tipo_sessao_id
        AND ts.empresa_id = ms.empresa_id
        AND ts.deleted_at IS NULL
       LEFT JOIN qualificacoes_tipos qt
         ON qt.id = ms.qualificacao_tipo_id
        AND qt.empresa_id = f.empresa_id
        AND qt.deleted_at IS NULL
       WHERE f.id = ? AND f.empresa_id IS NOT NULL AND f.deleted_at IS NULL`,
    )
    .bind(fid)
    .first<QualificationGenerationFichaRow>();

  if (!f) throw new Error('Não encontrada');
  if (!['CONCLUIDA', 'APROVADO'].includes(String(f.status || ''))) {
    throw new Error('Status precisa ser APROVADO');
  }
  if (f.aprovado !== 1) throw new Error('Precisa estar aprovado');

  const colaboradorId = f.colaborador_id_aluno;
  if (!colaboradorId) {
    throw new Error('Ficha sem colaborador válido para gerar qualificação');
  }

  const tipoQualifId: number | null = f.modelo_qualificacao_tipo_id || null;
  const qualifCodigo: string = f.modelo_qualificacao_codigo
    ? f.modelo_qualificacao_codigo
    : `${f.tipo_sessao}_${f.tipo_aeronave || 'GERAL'}`;
  const qualifNome: string = f.modelo_qualificacao_nome || qualifCodigo;
  const validadeMeses = normalizeValidityMonths(f.modelo_qualificacao_validade);

  // Usa a data da sessão para evitar problemas de fuso horário (servidor UTC vs horário local)
  const dataSessaoStr = (f.data_sessao || '').toString().slice(0, 10);
  const dt = dataSessaoStr ? new Date(dataSessaoStr + 'T12:00:00Z') : new Date();
  const dataConclusao = dt.toISOString().split('T')[0];
  const dataVencimentoPrincipal = calculateQualificationExpiry({
    completionDate: dataConclusao,
    validityMonths: validadeMeses,
  });

  const qualificacoesGeradas: QualificacaoGerada[] = [];
  const alunoEmpresaId: number | null = f.aluno_empresa_id || null;
  const hoje = new Date().toISOString().split('T')[0];
  const qualificacaoStatus = dataConclusao > hoje ? 'PLANEJADA' : 'CONCLUIDA';

  let qid: number | null = null;
  if (tipoQualifId) {
    const principalResult = await upsertQualificacaoHistoricoDaFicha(db, {
      fichaId: fid,
      funcionarioId: colaboradorId,
      qualificacaoId: tipoQualifId,
      qualificacaoCodigo: qualifCodigo,
      dataConclusao,
      dataVencimento: dataVencimentoPrincipal,
      observacoes: `Gerado da ficha #${fid}`,
      empresaId: alunoEmpresaId,
      status: qualificacaoStatus,
    });
    qid = principalResult.id;

    if (principalResult.action !== 'reuse') {
      await audit(db, {
        tabela: 'qualificacoes_historico',
        acao: principalResult.action === 'insert' ? 'INSERT' : 'UPDATE',
        registro_id: qid,
        dados_novos: principalResult.row,
      });
    }

    qualificacoesGeradas.push({
      codigo: qualifCodigo,
      nome: qualifNome,
      valida_ate: dataVencimentoPrincipal,
      tipo: 'principal',
    });
  }

  const fapsGeradas: Array<{
    codigo: string;
    nome: string;
    valida_ate: string | null;
  }> = [];
  let fichaTemCheckSemestral = false;

  if (f.agendamento_slot_id) {
    const checksMarcados = await db
      .prepare(
        `SELECT DISTINCT
                sc.qualificacao_tipo_id,
                qt.codigo as qt_codigo,
                qt.nome as qt_nome,
                qt.validade as qt_validade
         FROM sessoes_checks sc
         INNER JOIN simulador_agendamentos sa_check
           ON sa_check.id = sc.sessao_id
          AND sa_check.empresa_id = ?
          AND sa_check.deleted_at IS NULL
         INNER JOIN qualificacoes_tipos qt
           ON qt.id = sc.qualificacao_tipo_id
          AND qt.empresa_id = ?
          AND qt.deleted_at IS NULL
         WHERE sc.sessao_id = ? AND sc.deleted_at IS NULL
           AND sc.qualificacao_tipo_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM sessoes_checks_resultados scr2
             WHERE scr2.sessao_check_id = sc.id
               AND scr2.aprovado = 0
               AND scr2.deleted_at IS NULL
           )
           AND (
             EXISTS (
               SELECT 1 FROM sessoes_checks_resultados scr3
               WHERE scr3.sessao_check_id = sc.id
                 AND scr3.aprovado = 1
                 AND scr3.deleted_at IS NULL
             )
             OR NOT EXISTS (
               SELECT 1 FROM sessoes_checks_resultados scr4
               WHERE scr4.sessao_check_id = sc.id
                 AND scr4.deleted_at IS NULL
             )
           )
           AND NOT EXISTS (
             SELECT 1 FROM fichas_sessao f2
             WHERE f2.agendamento_slot_id = sc.sessao_id
               AND f2.colaborador_id_aluno != ?
               AND f2.deleted_at IS NULL
               AND (
                 (qt.codigo LIKE 'FAP13%' AND f2.tipo_sessao = 'CRED-EXA')
                 OR (qt.codigo LIKE 'FAP07%' AND f2.tipo_sessao = 'TRE-INST')
               )
           )`,
      )
      .bind(f.empresa_id, f.empresa_id, f.agendamento_slot_id, colaboradorId)
      .all<QualificationCheckRow>();

    for (const check of checksMarcados.results || []) {
      const validadeFAP = normalizeValidityMonths(check.qt_validade);
      if (validadeFAP === 6) fichaTemCheckSemestral = true;
      const dataVencimentoFap = calculateQualificationExpiry({
        completionDate: dataConclusao,
        validityMonths: validadeFAP,
      });
      const fapResult = await upsertQualificacaoHistoricoDaFicha(db, {
        fichaId: fid,
        funcionarioId: colaboradorId,
        qualificacaoId: check.qualificacao_tipo_id,
        qualificacaoCodigo: check.qt_codigo,
        dataConclusao,
        dataVencimento: dataVencimentoFap,
        observacoes: `FAP gerada da ficha #${fid} (check aprovado)`,
        empresaId: alunoEmpresaId,
        status: qualificacaoStatus,
      });

      if (fapResult.action !== 'reuse') {
        await audit(db, {
          tabela: 'qualificacoes_historico',
          acao: fapResult.action === 'insert' ? 'INSERT' : 'UPDATE',
          registro_id: fapResult.id,
          dados_novos: fapResult.row || {
            qualificacao_codigo: check.qt_codigo,
            funcionario_id: colaboradorId,
          },
        });
      }

      fapsGeradas.push({
        codigo: check.qt_codigo,
        nome: check.qt_nome,
        valida_ate: dataVencimentoFap,
      });
      qualificacoesGeradas.push({
        codigo: check.qt_codigo,
        nome: check.qt_nome,
        valida_ate: dataVencimentoFap,
        tipo: 'fap',
      });
    }
  }

  const tipoCurricularResolvido = isTipoCurricularSemestral(
    f.tipo_curricular_codigo,
    f.tipo_curricular_nome,
  );
  const tipoCurricularAusente =
    !normalizeTipoCurricular(f.tipo_curricular_codigo) &&
    !normalizeTipoCurricular(f.tipo_curricular_nome);

  if (fichaTemCheckSemestral && tipoCurricularAusente) {
    console.warn(
      `[gerarQualificacaoDaFicha] G1-SEM ignorada: tipo curricular não resolvido (ficha=${fid}, empresa=${String(f.empresa_id || '')}, modelo=${String(f.modelo_id || '')})`,
    );
  }

  if (fichaTemCheckSemestral && tipoCurricularResolvido) {
    try {
      const g1semResult = await realizarG1SemPendente(db, {
        funcionarioId: colaboradorId,
        dataConclusao,
        tipoTreinamento: 'SEMESTRAL',
        observacoes: `Realizada via ficha semestral #${fid}`,
      });
      if (g1semResult) {
        qualificacoesGeradas.push({
          codigo: 'G1-SEM',
          nome: 'G1-SEM (Semestral)',
          valida_ate: g1semResult.dataVencimento || dataConclusao,
          tipo: 'fap',
        });
        await audit(db, {
          tabela: 'qualificacoes_historico',
          acao: 'UPDATE',
          registro_id: g1semResult.id,
          dados_novos: {
            qualificacao_codigo: 'G1-SEM',
            data_conclusao: dataConclusao,
            status: 'CONCLUIDA',
            tipo_treinamento: 'SEMESTRAL',
            origem: `ficha #${fid}`,
          },
        });
      }
    } catch (g1semErr) {
      console.error(
        `[gerarQualificacaoDaFicha] Erro ao realizar G1-SEM para ficha #${fid}:`,
        g1semErr,
      );
    }
  }

  if (qualificacoesGeradas.length === 0) {
    throw new Error(
      'Nenhuma qualificação foi gerada. Verifique se o modelo possui tipo de qualificação configurado ou se há checks aprovados.',
    );
  }

  const primeiraFap = fapsGeradas[0];
  return {
    qualificacao_id: qid ?? 0,
    funcionario: f.aluno_nome,
    tipo: qid ? qualifCodigo : (primeiraFap?.codigo ?? ''),
    nome: qid ? qualifNome : (primeiraFap?.nome ?? ''),
    valida_ate: qid ? dataVencimentoPrincipal : (primeiraFap?.valida_ate ?? null),
    faps_geradas: fapsGeradas,
    qualificacoes_geradas: qualificacoesGeradas,
  };
}

export async function marcarNotificacoesFichaComoResolvidas(
  db: D1Database,
  {
    userId,
    tipos,
    fichaId,
  }: {
    userId: string;
    tipos: string[];
    fichaId: string | number;
  },
): Promise<void> {
  if (!userId || tipos.length === 0) return;

  const placeholders = tipos.map(() => '?').join(', ');

  try {
    await db
      .prepare(
        `UPDATE notificacoes_sistema
         SET lida = 1,
             lida_em = datetime('now'),
             lida_por = ?,
             updated_at = datetime('now')
         WHERE deleted_at IS NULL
           AND lida = 0
           AND user_id = ?
           AND tipo IN (${placeholders})
           AND link LIKE ?`,
      )
      .bind(userId, userId, ...tipos, `/simuladores/fichas/${String(fichaId)}%`)
      .run();
  } catch (e) {
    console.error('[NOTIF] Erro ao resolver notificação de ficha:', e);
  }
}

export async function listarManobrasPendentes(
  db: D1Database,
  fichaId: string | number,
): Promise<Array<{ ordem: number; descricao: string }>> {
  const result = await db
    .prepare(
      `SELECT ordem, COALESCE(nome, descricao, codigo, 'Manobra') AS descricao
       FROM fichas_sessao_manobras
       WHERE ficha_id = ?
         AND deleted_at IS NULL
         AND (
           resultado IS NULL
           OR TRIM(CAST(resultado AS TEXT)) = ''
         )
       ORDER BY ordem ASC`,
    )
    .bind(String(fichaId))
    .all<{ ordem: number; descricao: string }>();

  return result.results || [];
}

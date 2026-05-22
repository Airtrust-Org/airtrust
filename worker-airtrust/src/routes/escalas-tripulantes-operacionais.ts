import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaIdSafe } from './escalas-shared';
import {
  getTripulanteOperacional,
  getTripulantesOperacionaisPorModelo,
  getTripulantesOperacionaisTodos,
} from '../shared/getTripulanteOperacional';

const tripulantesOperacionais = new Hono<{ Bindings: Env }>();
const SEM_AERONAVE_VALUE = '__sem_aeronave__';

function formatarDataCurta(value: string | null | undefined): string {
  const texto = String(value || '').slice(0, 10);
  const [ano, mes, dia] = texto.split('-');
  if (!ano || !mes || !dia) return texto;
  return `${dia}/${mes}/${ano}`;
}

function isCompativelComFuncao(
  tripulante: { is_instrutor?: number | null; is_checador?: number | null },
  funcao: string | null | undefined,
): boolean {
  if (!funcao) return true;

  const normalizedFuncao = String(funcao).trim().toUpperCase();

  // INSTRUTOR slots: only instructors
  if (normalizedFuncao === 'INSTRUTOR') {
    return Boolean(tripulante.is_instrutor);
  }

  // CHK slots: only checkers
  if (normalizedFuncao.includes('CHK')) {
    return Boolean(tripulante.is_checador);
  }

  // PIC, SIC, FLEX: any habilitado pilot can be assigned
  return true;
}

function normalizeModeloOperacional(value: string | null | undefined): string {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');

  if (!normalized) return '';
  if (normalized.includes('SK76') || normalized.includes('S76')) return 'SK76';
  if (normalized.includes('AW139')) return 'AW139';
  return normalized;
}

function normalizeQuinzenaPreferencial(value: string | null | undefined): string | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (!normalized) return null;
  if (['primeira', '1', '1q', '1ª', '1a', 'primeira quinzena'].includes(normalized)) {
    return 'primeira';
  }
  if (['segunda', '2', '2q', '2ª', '2a', 'segunda quinzena'].includes(normalized)) {
    return 'segunda';
  }
  if (
    [
      'flex',
      'flexivel',
      'flexivel / personalizada',
      'flexível',
      'personalizada',
      'custom',
    ].includes(normalized)
  ) {
    return 'personalizada';
  }

  return normalized;
}

tripulantesOperacionais.get('/', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const aeronaveId = c.req.query('aeronave_id');
  const escalaId = c.req.query('escala_id');
  const funcaoFiltro = c.req.query('funcao');
  const dataInicioFiltro = c.req.query('data_inicio');
  const dataFimFiltro = c.req.query('data_fim');
  const quinzenaFiltro = c.req.query('quinzena');
  const incluirBloqueados = c.req.query('incluir_bloqueados') === 'true';
  const semAeronave = aeronaveId === SEM_AERONAVE_VALUE;

  if (!aeronaveId) {
    return c.json({ success: false, error: 'aeronave_id obrigatório' }, 400);
  }

  const aeronave = semAeronave
    ? { id: SEM_AERONAVE_VALUE, prefixo: 'Sem aeronave', modelo_codigo: null }
    : await db
        .prepare(
          `SELECT
             CAST(a.id AS TEXT) AS id,
             a.prefixo,
             a.modelo AS modelo_codigo
           FROM aeronaves a
           WHERE a.id = ?
             AND a.deleted_at IS NULL
             AND UPPER(COALESCE(NULLIF(TRIM(a.status), ''), 'ATIVO')) = 'ATIVO'
           LIMIT 1`,
        )
        .bind(aeronaveId)
        .first<{ id: string; prefixo: string | null; modelo_codigo: string | null }>();

  if (!aeronave) {
    return c.json({ success: false, error: 'Aeronave não encontrada' }, 404);
  }

  const modeloCodigo = semAeronave
    ? null
    : normalizeModeloOperacional(aeronave.modelo_codigo || aeronave.prefixo);
  if (!semAeronave && !modeloCodigo) {
    return c.json({ success: false, error: 'Aeronave sem modelo operacional configurado' }, 400);
  }

  const tripulantes = semAeronave
    ? await getTripulantesOperacionaisTodos(db, empresaId, escalaId)
    : await getTripulantesOperacionaisPorModelo(db, empresaId, modeloCodigo!, escalaId);

  // Adicionar quinzena + flags de cada tripulante (consulta em lote)
  type TripulanteComQuinzena = (typeof tripulantes)[number] & {
    quinzena?: string | null;
    is_instrutor?: number | null;
    is_checador?: number | null;
    /** Conflito suave com escala mensal diferente (nao bloqueia, permite selecao com aviso). */
    soft_conflict?: boolean;
    conflict_reason?: string | null;
    conflict_code?: string | null;
  };
  let tripulantesComQuinzena: TripulanteComQuinzena[] = tripulantes;
  if (tripulantes.length > 0) {
    const ids = tripulantes.map((t) => t.funcionario_id);
    const placeholders = ids.map(() => '?').join(',');
    const quinzenaRows = await db
      .prepare(
        `SELECT CAST(id AS TEXT) AS id, quinzena, is_instrutor, is_checador
           FROM funcionarios
          WHERE id IN (${placeholders})
            AND deleted_at IS NULL
            AND COALESCE(ativo, 1) = 1
            AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'`,
      )
      .bind(...ids)
      .all<{
        id: string;
        quinzena: string | null;
        is_instrutor: number | null;
        is_checador: number | null;
      }>();
    const flagsMap = new Map((quinzenaRows.results || []).map((r) => [r.id, r]));
    tripulantesComQuinzena = tripulantes.map((t) => {
      const flags = flagsMap.get(t.funcionario_id);
      return {
        ...t,
        quinzena: flags?.quinzena ?? null,
        is_instrutor: flags?.is_instrutor ?? 0,
        is_checador: flags?.is_checador ?? 0,
      };
    });
  }

  if (funcaoFiltro) {
    tripulantesComQuinzena = tripulantesComQuinzena.filter((t) =>
      isCompativelComFuncao(t, funcaoFiltro),
    );
  }

  if (quinzenaFiltro === 'primeira' || quinzenaFiltro === 'segunda') {
    tripulantesComQuinzena = tripulantesComQuinzena.map((tripulante) => {
      if (!tripulante.pode_ser_alocado) return tripulante;

      const quinzenaPreferencial = normalizeQuinzenaPreferencial(tripulante.quinzena);
      if (quinzenaPreferencial === quinzenaFiltro) return tripulante;

      let motivoBloqueio = 'Fora da quinzena operacional da escala mensal';
      if (quinzenaPreferencial === null) {
        motivoBloqueio = 'Quinzena não cadastrada para o tripulante na escala mensal';
      } else if (quinzenaPreferencial === 'personalizada') {
        motivoBloqueio = 'Quinzena personalizada; ajuste a escala mensal antes de escalar na EVD';
      }

      return {
        ...tripulante,
        pode_ser_alocado: false,
        motivo_bloqueio: motivoBloqueio,
        soft_conflict: false,
        conflict_reason: null,
        conflict_code: 'OUT_OF_QUINZENA',
      };
    });

    tripulantesComQuinzena = [...tripulantesComQuinzena].sort((a, b) =>
      Number(b.pode_ser_alocado) - Number(a.pode_ser_alocado),
    );
  }

  let conflitosPorFuncionario = new Map<
    string,
    {
      alocacao_id: string;
      escala_id: string;
      origem: 'alocacao_operacional' | 'escala_situacao' | 'funcionario_ferias';
      aeronave_id: string | null;
      quinzena_numero: number | null;
      aeronave_prefixo: string | null;
      funcao: string | null;
      data_inicio: string;
      data_fim: string;
      situacao_tipo?: string | null;
      situacao_nome?: string | null;
      motivo?: string | null;
    }
  >();

  if (dataInicioFiltro && dataFimFiltro && tripulantesComQuinzena.length > 0) {
    const ids = tripulantesComQuinzena.map((t) => t.funcionario_id);
    const placeholders = ids.map(() => '?').join(',');
    const conflitos = await db
      .prepare(
        `SELECT
           CAST(ea.funcionario_id AS TEXT) AS funcionario_id,
           CAST(ea.id AS TEXT) AS alocacao_id,
           CAST(ea.escala_id AS TEXT) AS escala_id,
           CASE
             WHEN ea.aeronave_id IS NOT NULL THEN 'alocacao_operacional'
             ELSE 'escala_situacao'
           END AS origem,
           CAST(ea.aeronave_id AS TEXT) AS aeronave_id,
           eq.numero AS quinzena_numero,
           a.prefixo AS aeronave_prefixo,
           ea.funcao,
           ea.data_inicio,
           ea.data_fim,
           ea.situacao_tipo,
           est.nome AS situacao_nome
         FROM escala_alocacoes ea
         LEFT JOIN aeronaves a ON a.id = ea.aeronave_id
         LEFT JOIN escalas_quinzenas eq ON eq.id = ea.quinzena_id
         LEFT JOIN escala_situacao_tipos est
           ON UPPER(est.codigo) = UPPER(COALESCE(ea.situacao_tipo, ''))
          AND est.deleted_at IS NULL
         WHERE CAST(ea.funcionario_id AS TEXT) IN (${placeholders})
           AND ea.deleted_at IS NULL
           AND ea.status != 'cancelado'
           AND (
             (ea.aeronave_id IS NOT NULL AND a.deleted_at IS NULL)
             OR (
               ea.aeronave_id IS NULL
               AND COALESCE(est.bloqueia_alocacao, 1) = 1
               AND (ea.situacao_tipo IS NULL OR UPPER(ea.situacao_tipo) != 'FOLGA')
             )
           )
           AND NOT (ea.data_fim < ? OR ea.data_inicio > ?)
         ORDER BY ea.data_inicio ASC`,
      )
      .bind(...ids, dataInicioFiltro, dataFimFiltro)
      .all<{
        funcionario_id: string;
        alocacao_id: string;
        escala_id: string;
        origem: 'alocacao_operacional' | 'escala_situacao';
        aeronave_id: string;
        quinzena_numero: number | null;
        aeronave_prefixo: string | null;
        funcao: string | null;
        data_inicio: string;
        data_fim: string;
        situacao_tipo: string | null;
        situacao_nome: string | null;
      }>();

    const conflitosRh = await db
      .prepare(
        `SELECT
           CAST(ff.funcionario_id AS TEXT) AS funcionario_id,
           CAST(ff.id AS TEXT) AS alocacao_id,
           '' AS escala_id,
            'funcionario_ferias' AS origem,
           NULL AS aeronave_id,
           NULL AS quinzena_numero,
           NULL AS aeronave_prefixo,
           NULL AS funcao,
           ff.data_inicio,
           ff.data_fim,
           ff.tipo AS situacao_tipo,
           COALESCE(est.nome, ff.tipo) AS situacao_nome
         FROM funcionario_ferias ff
         LEFT JOIN escala_situacao_tipos est
           ON UPPER(est.codigo) = UPPER(COALESCE(ff.tipo, ''))
          AND est.deleted_at IS NULL
         WHERE CAST(ff.funcionario_id AS TEXT) IN (${placeholders})
           AND ff.deleted_at IS NULL
           AND ff.escala_alocacao_id IS NULL
           AND NOT (ff.data_fim < ? OR ff.data_inicio > ?)
         ORDER BY ff.data_inicio ASC`,
      )
      .bind(...ids, dataInicioFiltro, dataFimFiltro)
      .all<{
        funcionario_id: string;
        alocacao_id: string;
        escala_id: string;
        origem: 'funcionario_ferias';
        aeronave_id: string | null;
        quinzena_numero: number | null;
        aeronave_prefixo: string | null;
        funcao: string | null;
        data_inicio: string;
        data_fim: string;
        situacao_tipo: string | null;
        situacao_nome: string | null;
      }>();

    conflitosPorFuncionario = new Map(
      [...(conflitos.results || []), ...(conflitosRh.results || [])].map((item) => {
        const periodo = `${formatarDataCurta(item.data_inicio)} → ${formatarDataCurta(item.data_fim)}`;
        const motivo = item.situacao_nome
          ? item.origem === 'funcionario_ferias'
            ? `Em ${item.situacao_nome} · ${periodo}. Remova em Funcionários > Perfil > Férias e Afastamentos para liberar este tripulante.`
            : `Em ${item.situacao_nome} · ${periodo}. Remova a situação na escala para liberar este tripulante.`
          : item.aeronave_prefixo
            ? `Alocado em ${item.aeronave_prefixo}${item.quinzena_numero ? ` Q${item.quinzena_numero}` : ''}`
            : null;
        return [item.funcionario_id, { ...item, motivo }];
      }),
    );

    tripulantesComQuinzena = tripulantesComQuinzena.map((tripulante) => {
      const conflito = conflitosPorFuncionario.get(tripulante.funcionario_id);
      if (!conflito) return tripulante;
      if (!tripulante.pode_ser_alocado) return tripulante;

      const mesmoEscalaAtual = escalaId && conflito.escala_id === escalaId;
      if (mesmoEscalaAtual) {
        return {
          ...tripulante,
          pode_ser_alocado: true,
          motivo_bloqueio: null,
          ja_alocado_em: conflito,
        };
      }

      // Ferias RH reais (escala_alocacao_id IS NULL filtrado na query): bloqueio duro.
      if (conflito.origem === 'funcionario_ferias') {
        return {
          ...tripulante,
          pode_ser_alocado: false,
          motivo_bloqueio: conflito.motivo || 'Tripulante em afastamento/ferias no periodo',
          ja_alocado_em: conflito,
        };
      }

      // Conflito com outra escala mensal: soft conflict — selecionavel com aviso.
      return {
        ...tripulante,
        pode_ser_alocado: true,
        soft_conflict: true,
        conflict_reason: conflito.motivo || 'Alocado em outra aeronave/escala mensal',
        conflict_code:
          conflito.origem === 'alocacao_operacional'
            ? 'MONTHLY_AIRCRAFT_DIFFERENCE'
            : 'MONTHLY_SITUATION_CONFLICT',
        ja_alocado_em: conflito,
      };
    });
  }

  const aptos = tripulantesComQuinzena.filter((tripulante) => tripulante.pode_ser_alocado);
  const bloqueados = tripulantesComQuinzena.filter((tripulante) => !tripulante.pode_ser_alocado);

  return c.json({
    success: true,
    data: {
      aeronave: {
        id: aeronave.id,
        prefixo: aeronave.prefixo,
        modelo: modeloCodigo,
      },
      tripulantes: incluirBloqueados ? tripulantesComQuinzena : aptos,
      resumo: {
        total_aptos: aptos.length,
        total_bloqueados: bloqueados.length,
        bloqueados_cma: bloqueados.filter((item) => item.status_operacional === 'BLOQUEADO_CMA')
          .length,
        bloqueados_frms: bloqueados.filter((item) => item.status_operacional === 'BLOQUEADO_FRMS')
          .length,
        atencao: aptos.filter((item) => item.status_operacional.startsWith('ATENCAO')).length,
        sem_habilitacao:
          tripulantesComQuinzena.length === 0
            ? `Nenhum tripulante compatível com ${modeloCodigo}`
            : null,
      },
    },
  });
});

tripulantesOperacionais.get('/:funcionarioId', auth(), async (c) => {
  const tripulante = await getTripulanteOperacional(
    c.env.DB,
    c.req.param('funcionarioId'),
    getEmpresaIdSafe(c),
  );

  if (!tripulante) {
    return c.json({ success: false, error: 'Tripulante não encontrado' }, 404);
  }

  return c.json({ success: true, data: tripulante });
});

export default tripulantesOperacionais;

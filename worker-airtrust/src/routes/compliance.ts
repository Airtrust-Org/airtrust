// ============================================================
// AIRTRUST - FASE 4: COMPLIANCE (Cálculo de Status)
// ============================================================
// Endpoints:
//  1. GET /api/funcionarios/:id/compliance - status individual
//  2. GET /api/compliance/funcionarios - lista de todos
// ============================================================

import { Hono } from 'hono';
import type { Context } from 'hono';
import { parseISO, differenceInDays } from 'date-fns';
import { getTableColumns, getFicha360 } from './ficha360';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import { createLogger, toError } from '../utils/logger';
import {
  appendEmployeeSectorFilter,
  assertFuncionarioInScope,
  getEmployeeSectorAccess,
} from '../services/employee-sector-access';
import {
  getQualificacoesAlertaDias,
  getTodayIsoSaoPaulo,
} from '../utils/qualificacoes-alerta-config';

type Env = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Env }>();

// ============================================================
// Tipos
// ============================================================

type RequisitoStatus = 'ok' | 'risco' | 'faltando';
type ComplianceStatus = 'conforme' | 'em_risco' | 'nao_conforme';

interface RequisitoCompliance {
  id: number;
  funcao: string;
  tipo_recurso: 'qualificacao' | 'licenca' | 'curso_lms';
  referencia: string;
  descricao?: string;
  status: RequisitoStatus;
  dias_restantes: number | null;
}

interface ComplianceResult {
  funcionario: Record<string, unknown>;
  status: ComplianceStatus;
  requisitos: RequisitoCompliance[];
}

// ============================================================
// Função auxiliar: calcular status de compliance
// ============================================================

function calcularStatusRequisito(
  req: Record<string, unknown>,
  qualificacoes: Array<Record<string, unknown>>,
  licencas: Array<Record<string, unknown>>,
  hoje: Date,
  thresholdDias: number,
  matriculasLms?: Array<Record<string, unknown>>,
): RequisitoCompliance {
  const normalizar = (valor: unknown) =>
    String(valor ?? '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const matchReferencia = (referencia: unknown, ...candidatos: unknown[]) => {
    const ref = normalizar(referencia);
    if (!ref) return false;
    return candidatos.some((candidato) => {
      const cand = normalizar(candidato);
      if (!cand) return false;
      return cand === ref || cand.includes(ref) || ref.includes(cand);
    });
  };

  const baseReq = {
    id: req.id as number,
    funcao: req.funcao as string,
    tipo_recurso: req.tipo_recurso as 'qualificacao' | 'licenca' | 'curso_lms',
    referencia: req.referencia as string,
    descricao: req.descricao as string | undefined,
  };

  // Curso LMS obrigatório: verificar matrícula concluída
  if (req.tipo_recurso === 'curso_lms') {
    const cursoId = Number(req.referencia);
    const matricula = (matriculasLms ?? []).find(
      (m) => Number(m.curso_id) === cursoId && m.status === 'CONCLUIDO',
    );
    if (matricula) {
      return { ...baseReq, status: 'ok', dias_restantes: null };
    }
    // Tem matrícula em andamento → risco (está tentando mas ainda não concluiu)
    const emAndamento = (matriculasLms ?? []).find(
      (m) =>
        Number(m.curso_id) === cursoId &&
        (m.status === 'EM_ANDAMENTO' || m.status === 'NAO_INICIADO'),
    );
    if (emAndamento) {
      return { ...baseReq, status: 'risco', dias_restantes: null };
    }
    return { ...baseReq, status: 'faltando', dias_restantes: null };
  }

  if (req.tipo_recurso === 'qualificacao') {
    // Buscar qualificação por código, nome ou identificador de tipo
    const qual = qualificacoes.find((q) =>
      matchReferencia(
        req.referencia,
        q.codigo,
        q.nome,
        q.tipo_id,
        q.tipo_qualificacao_id,
        q.qualificacao_id,
      ),
    );

    if (!qual || !qual.data_vencimento) {
      return { ...baseReq, status: 'faltando', dias_restantes: null };
    }

    const dtVenc = parseISO(qual.data_vencimento as string);
    const dias = differenceInDays(dtVenc, hoje);

    if (dias < 0) {
      return { ...baseReq, status: 'faltando', dias_restantes: dias };
    }
    if (dias <= thresholdDias) {
      return { ...baseReq, status: 'risco', dias_restantes: dias };
    }
    return { ...baseReq, status: 'ok', dias_restantes: dias };
  }

  if (req.tipo_recurso === 'licenca') {
    // Buscar licença por tipo/identificador textual
    const lic = licencas.find((l) =>
      matchReferencia(req.referencia, l.tipo, l.numero, l.nome, l.categoria),
    );

    if (!lic || !lic.data_vencimento) {
      return { ...baseReq, status: 'faltando', dias_restantes: null };
    }

    const dtVenc = parseISO(lic.data_vencimento as string);
    const dias = differenceInDays(dtVenc, hoje);

    if (dias < 0) {
      return { ...baseReq, status: 'faltando', dias_restantes: dias };
    }
    if (dias <= thresholdDias) {
      return { ...baseReq, status: 'risco', dias_restantes: dias };
    }
    return { ...baseReq, status: 'ok', dias_restantes: dias };
  }

  // Tipo desconhecido (evitar crash)
  return { ...baseReq, status: 'faltando', dias_restantes: null };
}

function calcularStatusGlobal(requisitos: RequisitoCompliance[]): ComplianceStatus {
  const temFaltando = requisitos.some((r) => r.status === 'faltando');
  const temRisco = requisitos.some((r) => r.status === 'risco');

  if (temFaltando) return 'nao_conforme';
  if (temRisco) return 'em_risco';
  return 'conforme';
}

// ============================================================
// GET /api/funcionarios/:id/compliance
// ============================================================

app.get('/funcionarios/:id/compliance', auth(), async (c: Context<{ Bindings: Env }>) => {
  try {
    const id = Number(c.req.param('id'));
    const empresaId = getEmpresaId(c as any);
    const access = await getEmployeeSectorAccess(c, empresaId);

    if (Number.isNaN(id)) {
      return c.json({ error: 'ID inválido' }, 400);
    }

    await assertFuncionarioInScope(c.env.DB, empresaId, id, access);

    const ficha = await getFicha360(c.env.DB, id, empresaId);

    if (!ficha) {
      return c.json({ error: 'Funcionário não encontrado' }, 404);
    }

    // Buscar matrículas LMS do funcionário (para verificar cursos obrigatórios)
    const lmsMatriculas = await c.env.DB.prepare(
      `SELECT curso_id, status FROM lms_matriculas
       WHERE funcionario_id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(id, empresaId)
      .all<Record<string, unknown>>();

    const hoje = parseISO(getTodayIsoSaoPaulo());
    const thresholdDias = await getQualificacoesAlertaDias(c.env.DB, empresaId);

    const requisitos = (ficha.requisitos as Array<Record<string, unknown>>).map((req) =>
      calcularStatusRequisito(
        req,
        ficha.qualificacoes as Array<Record<string, unknown>>,
        ficha.licencas as Array<Record<string, unknown>>,
        hoje,
        thresholdDias,
        lmsMatriculas.results ?? [],
      ),
    );

    const statusGlobal = calcularStatusGlobal(requisitos);

    const result: ComplianceResult = {
      funcionario: ficha.funcionario as Record<string, unknown>,
      status: statusGlobal,
      requisitos,
    };

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    createLogger(c, 'Compliance').error('Erro ao calcular compliance', toError(error));
    return c.json(
      {
        success: false,
        error: 'Erro ao calcular compliance',
      },
      500,
    );
  }
});

// ============================================================
// GET /api/compliance/funcionarios?funcao=&base=
// ============================================================

app.get('/compliance/funcionarios', auth(), async (c: Context<{ Bindings: Env }>) => {
  try {
    const funcaoFiltro = c.req.query('funcao') ?? '';

    // Filtro multi-tenant obrigatório
    const empresaId = getEmpresaId(c as any);
    const access = await getEmployeeSectorAccess(c, empresaId);

    // 1. Buscar todos os funcionários ativos (1 query)
    let fQuery = `SELECT id, nome, matricula, funcao FROM funcionarios WHERE deleted_at IS NULL AND ativo = 1`;
    const fParams: unknown[] = [];
    fQuery += ` AND empresa_id = ?`;
    fParams.push(empresaId);
    const scopeConditions: string[] = [];
    appendEmployeeSectorFilter(scopeConditions, fParams, access, 'funcionarios');
    if (scopeConditions.length > 0) {
      fQuery += ` AND ${scopeConditions.join(' AND ')}`;
    }
    if (funcaoFiltro) {
      fQuery += ` AND funcao = ?`;
      fParams.push(funcaoFiltro);
    }
    fQuery += ` ORDER BY nome LIMIT 2000`;

    const fStmt = await c.env.DB.prepare(fQuery)
      .bind(...fParams)
      .all();

    if (!fStmt.success || !fStmt.results) {
      return c.json({ success: false, error: 'Erro ao buscar funcionários' }, 500);
    }

    const funcionarios = fStmt.results as Array<Record<string, unknown>>;
    if (funcionarios.length === 0) {
      return c.json({ success: true, data: [], total: 0 });
    }

    const ids = funcionarios.map((f) => Number(f.id));
    const placeholders = ids.map(() => '?').join(',');

    // 2. Buscar schema de qualificacoes_historico (cached)
    const histCols = await getTableColumns(c.env.DB, 'qualificacoes_historico');
    const colInicio = histCols.has('data_realizacao') ? 'data_realizacao' : 'data_conclusao';
    const colFim = histCols.has('data_vencimento') ? 'data_vencimento' : 'data_validade';
    const colTipo = histCols.has('tipo_qualificacao_id')
      ? 'tipo_qualificacao_id'
      : 'qualificacao_id';

    // 3. Buscar qualificações vigentes (uma por código) em uma query
    const statusExpr = histCols.has('status') ? 'UPPER(COALESCE(q.status, \"\"))' : "''";
    const qualRaw = await c.env.DB.prepare(
      `WITH qualificacoes_ativas AS (
         SELECT
           q.funcionario_id,
           q.${colFim} as data_vencimento,
           tq.codigo,
           ROW_NUMBER() OVER (
             PARTITION BY q.funcionario_id, tq.codigo
             ORDER BY datetime(COALESCE(q.${colFim}, q.${colInicio}, q.updated_at, q.created_at)) DESC,
                      q.id DESC
           ) AS rn
         FROM qualificacoes_historico q
         JOIN qualificacoes_tipos tq ON q.${colTipo} = tq.id
         WHERE q.funcionario_id IN (${placeholders})
           AND q.deleted_at IS NULL
           AND ${statusExpr} != 'CANCELADA'
           AND COALESCE(q.${colFim}, q.${colInicio}) IS NOT NULL
       )
       SELECT funcionario_id, data_vencimento, codigo
       FROM qualificacoes_ativas
       WHERE rn = 1`,
    )
      .bind(...ids)
      .all();
    const qualByEmployee = new Map<
      number,
      Array<{ codigo: string; data_vencimento: string | null }>
    >();
    for (const q of qualRaw.results || []) {
      const row = q as Record<string, unknown>;
      const empId = Number(row.funcionario_id);
      if (!qualByEmployee.has(empId)) qualByEmployee.set(empId, []);
      qualByEmployee.get(empId)!.push({
        codigo: row.codigo as string,
        data_vencimento: (row.data_vencimento as string) || null,
      });
    }

    // 4. Buscar todas as licenças dos funcionários em uma query (1 query, tolerando ausência da tabela)
    const licByEmployee = new Map<
      number,
      Array<{ tipo: string; data_vencimento: string | null }>
    >();
    try {
      const licCols = await getTableColumns(c.env.DB, 'licencas');
      if (licCols.size > 0) {
        const licRaw = await c.env.DB.prepare(
          `SELECT funcionario_id, tipo, data_vencimento FROM licencas WHERE funcionario_id IN (${placeholders}) AND deleted_at IS NULL`,
        )
          .bind(...ids)
          .all();
        for (const l of licRaw.results || []) {
          const row = l as Record<string, unknown>;
          const empId = Number(row.funcionario_id);
          if (!licByEmployee.has(empId)) licByEmployee.set(empId, []);
          licByEmployee.get(empId)!.push({
            tipo: row.tipo as string,
            data_vencimento: (row.data_vencimento as string) || null,
          });
        }
      }
    } catch {
      /* licencas table may not exist */
    }

    // 5. Buscar todos os requisitos de compliance de uma vez (1 query)
    const reqMap = new Map<string, Array<Record<string, unknown>>>();
    try {
      const reqRaw = await c.env.DB.prepare(
        `SELECT * FROM requisitos_compliance WHERE empresa_id = ? AND deleted_at IS NULL ORDER BY funcao, tipo_recurso, referencia`,
      )
        .bind(empresaId)
        .all();
      for (const r of reqRaw.results || []) {
        const row = r as Record<string, unknown>;
        const fn = (row.funcao as string) || '';
        if (!reqMap.has(fn)) reqMap.set(fn, []);
        reqMap.get(fn)!.push(row);
      }
    } catch {
      /* requisitos_compliance may not exist */
    }

    // 5.1 Buscar matrículas LMS de todos os funcionários (para verificar cursos obrigatórios)
    const lmsByEmployee = new Map<number, Array<Record<string, unknown>>>();
    try {
      const lmsRaw = await c.env.DB.prepare(
        `SELECT funcionario_id, curso_id, status FROM lms_matriculas
         WHERE funcionario_id IN (${placeholders}) AND empresa_id = ? AND deleted_at IS NULL`,
      )
        .bind(...ids, empresaId)
        .all();
      for (const m of lmsRaw.results || []) {
        const row = m as Record<string, unknown>;
        const empId = Number(row.funcionario_id);
        if (!lmsByEmployee.has(empId)) lmsByEmployee.set(empId, []);
        lmsByEmployee.get(empId)!.push(row);
      }
    } catch {
      /* ignore */
    }

    // 6. Processar em memória
    const hoje = parseISO(getTodayIsoSaoPaulo());
    const thresholdDias = await getQualificacoesAlertaDias(c.env.DB, empresaId);
    const resultados = funcionarios.map((f) => {
      const empId = Number(f.id);
      const qualificacoes = qualByEmployee.get(empId) || [];
      const licencas = licByEmployee.get(empId) || [];
      const matriculasLms = lmsByEmployee.get(empId) || [];
      const funcao = (f.funcao as string) || 'Piloto';
      const requisitos = reqMap.get(funcao) || [];

      const reqStatus = requisitos.map((req) =>
        calcularStatusRequisito(
          req,
          qualificacoes as unknown as Array<Record<string, unknown>>,
          licencas as unknown as Array<Record<string, unknown>>,
          hoje,
          thresholdDias,
          matriculasLms,
        ),
      );
      const status = calcularStatusGlobal(reqStatus);

      return {
        funcionario_id: String(f.id),
        nome_completo: f.nome as string,
        matricula: f.matricula as string,
        funcao,
        base: null as string | null,
        status,
      };
    });

    return c.json({
      success: true,
      data: resultados,
      total: resultados.length,
    });
  } catch (error) {
    createLogger(c, 'Compliance').error('Erro ao listar compliance', toError(error));
    return c.json(
      {
        success: false,
        error: 'Erro ao listar compliance',
      },
      500,
    );
  }
});

export default app;

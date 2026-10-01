import { Hono } from 'hono';
import { requireRole } from '../middleware/rbac';
import { ApiError } from '../middleware/error-handler';
import { getEmpresaId } from '../middleware/tenant';
import type { Env } from '../types';
import { normalizeSearchText } from '../utils/text-search';
import {
  assertFuncionarioInScope,
  getEmployeeSectorAccess,
  type EmployeeSectorAccess,
} from '../services/employee-sector-access';
import type { TrainingComplianceSnapshot } from './compliance-treinamentos';

type ComplianceStatus = 'CONFORME' | 'VENCENDO' | 'VENCIDO' | 'NAO_REALIZADO' | 'EM_ANDAMENTO';
type CompliancePeople = TrainingComplianceSnapshot['people'];

type RequirementRoutesDeps = {
  buildSnapshot: (
    db: D1Database,
    empresaId: number,
    access: EmployeeSectorAccess,
  ) => Promise<TrainingComplianceSnapshot>;
};

function asPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function aggregateDistinctMandatoryRequirements(
  people: CompliancePeople,
  filters: { qualificacaoTipoId?: number | null; status?: ComplianceStatus | null } = {},
) {
  const map = new Map<
    number,
    {
      qualificacao_tipo_id: number;
      qualificacao_tipo_nome: string | null;
      qualificacao_tipo_codigo: string | null;
      pessoas_ids: Set<number>;
      obrigacoes_individuais: number;
      conformes: number;
      vencendo: number;
      vencidos: number;
      nao_realizados: number;
      em_andamento: number;
      origens: Set<string>;
      referencias_normativas: Set<string>;
      escopos: Set<string>;
      modalidades: Set<string>;
      perfis_competencia: Set<string>;
      aeronaves_modelos: Set<string>;
      condicoes: Set<string>;
    }
  >();

  for (const person of people) {
    for (const req of person.requisitos) {
      if (req.obrigatoriedade !== 'OBRIGATORIA') continue;
      if (filters.qualificacaoTipoId && req.qualificacao_tipo_id !== filters.qualificacaoTipoId) continue;
      if (filters.status && req.status_compliance !== filters.status) continue;
      const current = map.get(req.qualificacao_tipo_id) || {
        qualificacao_tipo_id: req.qualificacao_tipo_id,
        qualificacao_tipo_nome: req.qualificacao_tipo_nome,
        qualificacao_tipo_codigo: req.qualificacao_tipo_codigo,
        pessoas_ids: new Set<number>(),
        obrigacoes_individuais: 0,
        conformes: 0,
        vencendo: 0,
        vencidos: 0,
        nao_realizados: 0,
        em_andamento: 0,
        origens: new Set<string>(),
        referencias_normativas: new Set<string>(),
        escopos: new Set<string>(),
        modalidades: new Set<string>(),
        perfis_competencia: new Set<string>(),
        aeronaves_modelos: new Set<string>(),
        condicoes: new Set<string>(),
      };
      current.pessoas_ids.add(person.id);
      current.obrigacoes_individuais += 1;
      if (req.status_compliance === 'CONFORME') current.conformes += 1;
      if (req.status_compliance === 'VENCENDO') current.vencendo += 1;
      if (req.status_compliance === 'VENCIDO') current.vencidos += 1;
      if (req.status_compliance === 'NAO_REALIZADO') current.nao_realizados += 1;
      if (req.status_compliance === 'EM_ANDAMENTO') current.em_andamento += 1;
      if (req.origem) current.origens.add(req.origem);
      if (req.referencia_normativa) current.referencias_normativas.add(req.referencia_normativa);
      if (req.escopo) current.escopos.add(req.escopo);
      if (req.modalidade_requerida) current.modalidades.add(req.modalidade_requerida);
      if (req.perfil_competencia) current.perfis_competencia.add(req.perfil_competencia);
      if (req.aeronave_modelo) current.aeronaves_modelos.add(req.aeronave_modelo);
      if (req.condicao_nome) current.condicoes.add(req.condicao_nome);
      map.set(req.qualificacao_tipo_id, current);
    }
  }

  return Array.from(map.values())
    .map(
      ({
        pessoas_ids,
        origens,
        referencias_normativas,
        escopos,
        modalidades,
        perfis_competencia,
        aeronaves_modelos,
        condicoes,
        ...row
      }) => ({
        ...row,
        pessoas: pessoas_ids.size,
        origens: Array.from(origens).sort(),
        referencias_normativas: Array.from(referencias_normativas).sort(),
        escopos: Array.from(escopos).sort(),
        modalidades: Array.from(modalidades).sort(),
        perfis_competencia: Array.from(perfis_competencia).sort(),
        aeronaves_modelos: Array.from(aeronaves_modelos).sort(),
        condicoes: Array.from(condicoes).sort(),
      }),
    )
    .sort((a, b) =>
      String(a.qualificacao_tipo_nome || '').localeCompare(
        String(b.qualificacao_tipo_nome || ''),
        'pt-BR',
      ),
    );
}

export function createTrainingComplianceRequirementRoutes({ buildSnapshot }: RequirementRoutesDeps) {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/requisitos-aplicaveis', requireRole('admin', 'manager'), async (c) => {
    const empresaId = getEmpresaId(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const setorId = asPositiveInt(c.req.query('setor_id'));
    const funcaoId = asPositiveInt(c.req.query('funcao_id'));
    const funcionarioId = asPositiveInt(c.req.query('funcionario_id'));
    const qualificacaoTipoId = asPositiveInt(c.req.query('qualificacao_tipo_id'));
    const q = normalizeSearchText(c.req.query('q'));
    const rawStatus = String(c.req.query('status') || '').trim().toUpperCase();
    const allowedStatus = new Set<ComplianceStatus>([
      'CONFORME',
      'VENCENDO',
      'VENCIDO',
      'NAO_REALIZADO',
      'EM_ANDAMENTO',
    ]);
    const status = rawStatus ? (rawStatus as ComplianceStatus) : null;
    if (status && !allowedStatus.has(status)) {
      throw new ApiError('Status de compliance inválido', 400);
    }
    if (funcionarioId) await assertFuncionarioInScope(c.env.DB, empresaId, funcionarioId, access);

    const snapshot = await buildSnapshot(c.env.DB, empresaId, access);
    const people = snapshot.people.filter(
      (person) =>
        (!setorId || person.setor_id === setorId) &&
        (!funcaoId || person.funcao_id === funcaoId) &&
        (!funcionarioId || person.id === funcionarioId) &&
        (!q || normalizeSearchText(person.nome).includes(q)),
    );
    const data = aggregateDistinctMandatoryRequirements(people, { qualificacaoTipoId, status });
    return c.json({
      success: true,
      data,
      meta: {
        pessoas: people.length,
        requisitos_distintos: data.length,
        obrigacoes_individuais: data.reduce((sum, row) => sum + row.obrigacoes_individuais, 0),
      },
    });
  });

  return app;
}

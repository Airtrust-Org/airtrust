/**
 * Dry-run do contrato versionado Controle de Voos -> FRMS.
 *
 * Deliberadamente um arquivo separado de `routes/controle-voos.ts` (que
 * mantém um guard de arquitetura proibindo referências a FRMS/MRO/etc —
 * ver `nao referencia dominios externos fora do escopo da fase` em
 * `__tests__/routes/controle-voos.test.ts`) e de
 * `routes/controle-voos-rdv-workflow.ts`. Montado no mesmo prefixo
 * `/api/controle-voos`.
 *
 * Somente leitura: não grava em `frms_jornada`, não calcula score/fadiga,
 * não promove o AirTrust a fonte primária do FRMS (ver
 * `lib/frms/controle-voos-shadow-flag.ts`, default `false` para todo
 * tenant). Ver `lib/frms/controle-voos-contract.ts` para o schema.
 */
import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import { checkPermission, getEmpresaId } from '../middleware/tenant';
import type { Env } from '../types';
import {
  fetchControleVoosOperationalRecords,
  CONTROLE_VOOS_FRMS_KNOWN_GAPS,
} from '../lib/frms/controle-voos-source';
import {
  buildFrmsControleVoosContractV1Batch,
  FRMS_CONTROLE_VOOS_CONTRACT_VERSION,
} from '../lib/frms/controle-voos-contract';
import {
  parseSigvoosShadowCompareWindow,
  SigvoosShadowCompareError,
} from '../services/controle-voos/sigvoos-shadow-compare';

const controleVoosFrmsContract = new Hono<{ Bindings: Env }>();

function getEmpresaIdSafe(c: Parameters<typeof getEmpresaId>[0]): number {
  try {
    return getEmpresaId(c);
  } catch {
    const raw = (c.get as (key: string) => unknown)('empresaId');
    const parsed = typeof raw === 'string' ? Number(raw) : Number(raw || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}

controleVoosFrmsContract.get('/frms/contract-preview', auth(), async (c) => {
  if (!checkPermission(c, 'manager')) {
    throw new ApiError('Permissao insuficiente', 403, 'CONTROLE_VOOS_SIGVOOS_RBAC_FORBIDDEN');
  }

  const empresaId = getEmpresaIdSafe(c);
  if (!empresaId) {
    throw new ApiError(
      'Empresa nao identificada',
      401,
      'CONTROLE_VOOS_FRMS_CONTRACT_TENANT_REQUIRED',
    );
  }

  try {
    const window = parseSigvoosShadowCompareWindow({
      from: c.req.query('from'),
      to: c.req.query('to'),
    });
    const records = await fetchControleVoosOperationalRecords(
      c.env.DB,
      empresaId,
      window.from,
      window.to,
    );
    const contracts = buildFrmsControleVoosContractV1Batch(records);

    return c.json({
      success: true,
      data: {
        mode: 'dry_run',
        writesEnabled: false,
        frmsPromotedToPrimary: false,
        contractVersion: FRMS_CONTROLE_VOOS_CONTRACT_VERSION,
        empresaId,
        periodo: window,
        total: contracts.length,
        knownGaps: CONTROLE_VOOS_FRMS_KNOWN_GAPS,
        items: contracts,
      },
    });
  } catch (error) {
    const safeError = error as { name?: string; code?: unknown; status?: unknown };
    if (
      error instanceof SigvoosShadowCompareError ||
      (safeError.name === 'SigvoosShadowCompareError' && typeof safeError.code === 'string')
    ) {
      const status = typeof safeError.status === 'number' ? safeError.status : 400;
      throw new ApiError(
        'Janela invalida para preview do contrato FRMS',
        status,
        String(safeError.code),
      );
    }
    throw error;
  }
});

export default controleVoosFrmsContract;

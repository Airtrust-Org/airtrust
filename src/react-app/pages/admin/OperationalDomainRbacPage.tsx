import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { fetchWithAuth } from '@/react-app/config/api';
import { parseErrorPayload, parseJsonResponse } from '@/react-app/lib/parseJsonResponse';

const OPERATIONAL_DOMAINS = ['OPERACOES', 'MANUTENCAO', 'SGSO', 'FRMS', 'CORPORATIVO'] as const;
type OperationalDomain = (typeof OPERATIONAL_DOMAINS)[number];

interface ReadinessReport {
  ready: boolean;
  setores_sem_dominio: number;
  categorias_sem_dominio: number;
  gestores_sem_setor: number;
  cursos_sem_classificacao: number;
  bloqueios: string[];
}

interface UnclassifiedItem {
  id: number;
  nome?: string | null;
  titulo?: string | null;
}

interface UnclassifiedResponse {
  dominios_validos: OperationalDomain[];
  setores: UnclassifiedItem[];
  categorias: UnclassifiedItem[];
  cursos: UnclassifiedItem[];
}

type ResourceType = 'setor' | 'categoria' | 'curso';

function isReadinessReport(value: unknown): value is ReadinessReport {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.ready === 'boolean' && Array.isArray(v.bloqueios);
}

function isUnclassifiedResponse(value: unknown): value is UnclassifiedResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.setores) && Array.isArray(v.categorias) && Array.isArray(v.cursos);
}

function isEnvelope<T>(
  data: unknown,
  guard: (value: unknown) => value is T,
): data is { success: boolean; data: T } {
  if (typeof data !== 'object' || data === null) return false;
  const body = data as Record<string, unknown>;
  return typeof body.success === 'boolean' && guard(body.data);
}

const BASE = '/api/admin/operational-domain-rbac';

function itemLabel(item: UnclassifiedItem): string {
  return item.nome ?? item.titulo ?? `#${item.id}`;
}

export default function OperationalDomainRbacPage() {
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [unclassified, setUnclassified] = useState<UnclassifiedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [readinessRes, unclassifiedRes] = await Promise.all([
        fetchWithAuth(`${BASE}/readiness`),
        fetchWithAuth(`${BASE}/unclassified`),
      ]);

      if (!readinessRes.ok) {
        const err = await parseErrorPayload(readinessRes);
        throw new Error(err.error ?? `Erro ${readinessRes.status}`);
      }
      if (!unclassifiedRes.ok) {
        const err = await parseErrorPayload(unclassifiedRes);
        throw new Error(err.error ?? `Erro ${unclassifiedRes.status}`);
      }

      const readinessJson = await parseJsonResponse(readinessRes, (d): d is { success: boolean; data: ReadinessReport } =>
        isEnvelope(d, isReadinessReport),
      );
      const unclassifiedJson = await parseJsonResponse(
        unclassifiedRes,
        (d): d is { success: boolean; data: UnclassifiedResponse } => isEnvelope(d, isUnclassifiedResponse),
      );

      setReadiness(readinessJson.data);
      setUnclassified(unclassifiedJson.data);
    } catch (err) {
      toast.error('Erro ao carregar RBAC operacional', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const classificar = async (resourceType: ResourceType, resourceId: number, dominioCodigo: string) => {
    const key = `${resourceType}:${resourceId}`;
    setBusyKey(key);
    try {
      const res = await fetchWithAuth(`${BASE}/classify`, {
        method: 'POST',
        body: JSON.stringify({
          resource_type: resourceType,
          resource_id: resourceId,
          dominio_codigo: dominioCodigo,
        }),
      });
      if (!res.ok) {
        const err = await parseErrorPayload(res);
        throw new Error(err.error ?? `Erro ${res.status}`);
      }
      toast.success('Domínio classificado com sucesso');
      await carregar();
    } catch (err) {
      toast.error('Erro ao classificar', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyKey(null);
    }
  };

  const ativarOuDesativar = async (action: 'activate' | 'deactivate') => {
    setBusyKey(action);
    try {
      const res = await fetchWithAuth(`${BASE}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const err = await parseErrorPayload(res);
        throw new Error(err.error ?? `Erro ${res.status}`);
      }
      toast.success(
        action === 'activate' ? 'RBAC operacional ativado para este tenant' : 'RBAC operacional desativado',
      );
      await carregar();
    } catch (err) {
      toast.error('Erro ao alterar ativação', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyKey(null);
    }
  };

  const dominiosValidos = unclassified?.dominios_validos ?? OPERATIONAL_DOMAINS;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-semibold">RBAC Operacional — Autonomia do Gestor</h1>
          </div>
          <button
            type="button"
            onClick={carregar}
            disabled={loading}
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        {loading && !readiness && <p className="text-sm text-gray-500">Carregando...</p>}

        {readiness && (
          <section className="border rounded-lg p-4 space-y-3">
            <h2 className="font-medium flex items-center gap-2">
              {readiness.ready ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-amber-600" />
              )}
              Readiness: {readiness.ready ? 'Pronto para ativação' : 'Bloqueado'}
            </h2>
            <ul className="text-sm text-gray-600 grid grid-cols-2 gap-2">
              <li>Setores sem domínio: {readiness.setores_sem_dominio}</li>
              <li>Categorias sem domínio: {readiness.categorias_sem_dominio}</li>
              <li>Cursos sem classificação: {readiness.cursos_sem_classificacao}</li>
              <li>Gestores sem setor: {readiness.gestores_sem_setor}</li>
            </ul>
            {readiness.bloqueios.length > 0 && (
              <ul className="text-sm text-amber-700 list-disc list-inside">
                {readiness.bloqueios.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={!readiness.ready || busyKey === 'activate'}
                onClick={() => ativarOuDesativar('activate')}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white disabled:opacity-40"
              >
                Ativar RBAC neste tenant
              </button>
              <button
                type="button"
                disabled={busyKey === 'deactivate'}
                onClick={() => ativarOuDesativar('deactivate')}
                className="px-3 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-40"
              >
                Desativar (rollback)
              </button>
            </div>
          </section>
        )}

        {unclassified && (
          <>
            <ClassificationTable
              title="Setores sem domínio"
              items={unclassified.setores}
              resourceType="setor"
              dominios={dominiosValidos}
              busyKey={busyKey}
              onClassify={classificar}
            />
            <ClassificationTable
              title="Categorias de qualificação sem domínio"
              items={unclassified.categorias}
              resourceType="categoria"
              dominios={dominiosValidos}
              busyKey={busyKey}
              onClassify={classificar}
            />
            <ClassificationTable
              title="Cursos LMS sem domínio"
              items={unclassified.cursos}
              resourceType="curso"
              dominios={dominiosValidos}
              busyKey={busyKey}
              onClassify={classificar}
            />
          </>
        )}
      </div>
    </AppLayout>
  );
}

function ClassificationTable(props: {
  title: string;
  items: UnclassifiedItem[];
  resourceType: ResourceType;
  dominios: readonly OperationalDomain[];
  busyKey: string | null;
  onClassify: (resourceType: ResourceType, resourceId: number, dominioCodigo: string) => void;
}) {
  const { title, items, resourceType, dominios, busyKey, onClassify } = props;
  const [selected, setSelected] = useState<Record<number, OperationalDomain>>({});

  if (items.length === 0) {
    return (
      <section className="border rounded-lg p-4">
        <h2 className="font-medium mb-1">{title}</h2>
        <p className="text-sm text-gray-500">Nenhum item pendente.</p>
      </section>
    );
  }

  return (
    <section className="border rounded-lg p-4 space-y-2">
      <h2 className="font-medium">
        {title} ({items.length})
      </h2>
      <table className="w-full text-sm">
        <tbody>
          {items.map((item) => {
            const key = `${resourceType}:${item.id}`;
            const value = selected[item.id] ?? dominios[0];
            return (
              <tr key={item.id} className="border-t">
                <td className="py-2 pr-4">{itemLabel(item)}</td>
                <td className="py-2 pr-4">
                  <select
                    value={value}
                    onChange={(e) =>
                      setSelected((prev) => ({ ...prev, [item.id]: e.target.value as OperationalDomain }))
                    }
                    className="border rounded px-2 py-1 text-sm"
                  >
                    {dominios.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2">
                  <button
                    type="button"
                    disabled={busyKey === key}
                    onClick={() => onClassify(resourceType, item.id, value)}
                    className="px-2 py-1 text-sm rounded bg-gray-900 text-white disabled:opacity-40"
                  >
                    Classificar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

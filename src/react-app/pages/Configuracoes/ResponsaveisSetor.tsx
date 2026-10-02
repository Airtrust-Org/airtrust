import { useEffect, useMemo, useState } from 'react';
import { BellRing, LoaderCircle, ShieldCheck } from 'lucide-react';
import { fetchWithAuth } from '@/react-app/config/api';
import { showToast } from '../../utils/toast';

interface Setor {
  id: number;
  nome: string;
  codigo?: string;
}

interface FuncionarioElegivel {
  id: number;
  nome: string;
  email: string;
  cargo?: string | null;
  setor_id?: number | null;
  setor_nome?: string | null;
}

interface ResponsavelSetor {
  id: number;
  setor_id: number;
  setor_nome: string;
  funcionario_id: number;
  funcionario_nome: string;
  funcionario_email: string;
  funcionario_cargo?: string | null;
}

export function ResponsaveisSetor() {
  const [setores, setSetores] = useState<Setor[]>([]);
  const [funcionarios, setFuncionarios] = useState<FuncionarioElegivel[]>([]);
  const [responsaveis, setResponsaveis] = useState<ResponsavelSetor[]>([]);
  const [selectedSetorId, setSelectedSetorId] = useState<number | null>(null);
  const [selectedFuncionarioIds, setSelectedFuncionarioIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const cacheBust = `t=${Date.now()}`;
      const [setoresRes, funcionariosRes, responsaveisRes] = await Promise.all([
        fetchWithAuth(`/api/setores?${cacheBust}`),
        fetchWithAuth(`/api/setores-responsaveis-compliance/funcionarios-elegiveis?${cacheBust}`),
        fetchWithAuth(`/api/setores-responsaveis-compliance?${cacheBust}`),
      ]);

      if (!setoresRes.ok || !funcionariosRes.ok || !responsaveisRes.ok) {
        throw new Error('Falha ao carregar configuração de responsáveis');
      }

      const setoresBody = (await setoresRes.json()) as { data?: Setor[] };
      const funcionariosBody = (await funcionariosRes.json()) as { data?: FuncionarioElegivel[] };
      const responsaveisBody = (await responsaveisRes.json()) as { data?: ResponsavelSetor[] };

      setSetores(Array.isArray(setoresBody.data) ? setoresBody.data : []);
      setFuncionarios(Array.isArray(funcionariosBody.data) ? funcionariosBody.data : []);
      setResponsaveis(Array.isArray(responsaveisBody.data) ? responsaveisBody.data : []);
    } catch (error) {
      console.error(error);
      showToast.error('Erro ao carregar responsáveis por setor');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const responsaveisPorSetor = useMemo(() => {
    const map = new Map<number, ResponsavelSetor[]>();
    for (const item of responsaveis) {
      const current = map.get(item.setor_id) || [];
      current.push(item);
      map.set(item.setor_id, current);
    }
    return map;
  }, [responsaveis]);

  function selectSetor(setorId: number) {
    setSelectedSetorId(setorId);
    setSelectedFuncionarioIds(
      (responsaveisPorSetor.get(setorId) || []).map((item) => item.funcionario_id),
    );
  }

  function toggleFuncionario(funcionarioId: number, checked: boolean) {
    setSelectedFuncionarioIds((current) =>
      checked
        ? [...new Set([...current, funcionarioId])]
        : current.filter((id) => id !== funcionarioId),
    );
  }

  async function save() {
    if (!selectedSetorId) return;
    if (selectedFuncionarioIds.length === 0) {
      showToast.error('Selecione ao menos um responsável para o setor');
      return;
    }

    setSaving(true);
    try {
      const response = await fetchWithAuth(
        `/api/setores-responsaveis-compliance/bulk-assign/${selectedSetorId}`,
        {
          method: 'POST',
          body: JSON.stringify({ funcionario_ids: selectedFuncionarioIds }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        throw new Error(body.error || body.message || 'Falha ao salvar responsáveis');
      }
      showToast.success('Responsáveis pelo setor atualizados');
      await loadData();
      selectSetor(selectedSetorId);
    } catch (error) {
      console.error(error);
      showToast.error(error instanceof Error ? error.message : 'Erro ao salvar responsáveis');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const selectedSetor = setores.find((setor) => setor.id === selectedSetorId);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <BellRing className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-slate-900">Responsáveis por Setor</h3>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Defina quem recebe os alertas de vencimento do Compliance em cada setor. Esta atribuição
          não concede acesso ao setor e não altera o perfil de acesso da pessoa.
        </p>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <div className="flex gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Perfil de acesso e responsabilidade organizacional são independentes. Uma pessoa pode
            ser responsável por um setor sem ser Administrador da Empresa.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="font-semibold text-slate-900">Setores ({setores.length})</h4>
          <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto">
            {setores.map((setor) => {
              const count = responsaveisPorSetor.get(setor.id)?.length || 0;
              const selected = setor.id === selectedSetorId;
              return (
                <button
                  type="button"
                  key={setor.id}
                  onClick={() => selectSetor(setor.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    selected
                      ? 'border-primary bg-slate-50 font-semibold text-primary'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{setor.nome}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {count}
                    </span>
                  </div>
                  {setor.codigo ? (
                    <div className="mt-1 text-xs text-slate-500">{setor.codigo}</div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          {!selectedSetor ? (
            <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
              Selecione um setor para definir seus responsáveis.
            </div>
          ) : (
            <>
              <div className="mb-4">
                <h4 className="font-semibold text-slate-900">{selectedSetor.nome}</h4>
                <p className="mt-1 text-sm text-slate-600">
                  Selecione uma ou mais pessoas que receberão os alertas de Compliance deste setor.
                </p>
              </div>

              <div className="max-h-[420px] space-y-2 overflow-y-auto">
                {funcionarios.map((funcionario) => (
                  <label
                    key={funcionario.id}
                    className="flex items-start gap-3 rounded-lg border border-transparent p-2 hover:border-slate-200 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                      checked={selectedFuncionarioIds.includes(funcionario.id)}
                      onChange={(event) => toggleFuncionario(funcionario.id, event.target.checked)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900">{funcionario.nome}</div>
                      <div className="truncate text-xs text-slate-500">{funcionario.email}</div>
                      <div className="text-xs text-slate-500">
                        {[funcionario.cargo, funcionario.setor_nome].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <span className="text-sm text-slate-500">
                  {selectedFuncionarioIds.length} responsável(is) selecionado(s)
                </span>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || selectedFuncionarioIds.length === 0}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar responsáveis'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

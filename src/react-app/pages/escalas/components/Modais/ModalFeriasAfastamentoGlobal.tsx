import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/react-app/components/UI';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { getAccessToken } from '@/react-app/config/api';
import { useDebounce } from '@/react-app/hooks/useDebounce';
import { fmtDateShort } from '../../quinzena-tokens';

interface FuncionarioOption {
  id: number;
  nome?: string;
  guerra?: string;
  matricula?: string;
  funcao?: string;
  status?: string;
}

interface Props {
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}

function authHeaders() {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ModalFeriasAfastamentoGlobal({ onClose, onSaved }: Props) {
  const [busca, setBusca] = useState('');
  const [funcionarios, setFuncionarios] = useState<FuncionarioOption[]>([]);
  const [loadingFuncionarios, setLoadingFuncionarios] = useState(false);
  const [saving, setSaving] = useState(false);
  const [funcionarioId, setFuncionarioId] = useState<number | null>(null);
  const [tipo, setTipo] = useState<'FERIAS' | 'AFT'>('FERIAS');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [dataFimAuto, setDataFimAuto] = useState(false);
  const [observacoes, setObservacoes] = useState('');
  const debouncedBusca = useDebounce(busca, 300);

  useEffect(() => {
    if (tipo !== 'FERIAS' || !dataInicio) return;
    if (dataFim && !dataFimAuto) return;

    const data = new Date(`${dataInicio}T00:00:00`);
    data.setDate(data.getDate() + 30);
    setDataFim(data.toISOString().slice(0, 10));
    setDataFimAuto(true);
  }, [dataFim, dataFimAuto, dataInicio, tipo]);

  useEffect(() => {
    let cancelled = false;

    async function carregarFuncionarios() {
      setLoadingFuncionarios(true);
      try {
        const params = new URLSearchParams({
          limit: '50',
          status: 'ativo',
          search: debouncedBusca || '',
        });

        const response = await apiFetch(`/api/funcionarios?${params.toString()}`, {
          headers: {
            ...authHeaders(),
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || `Erro ao carregar funcionários (${response.status})`);
        }

        const lista = Array.isArray(data.data)
          ? data.data
          : Array.isArray(data.funcionarios)
            ? data.funcionarios
            : [];
        if (!cancelled) {
          setFuncionarios(lista);
        }
      } catch (error) {
        // Erro silenciado — lista fica vazia e usuário vê "Nenhum funcionário encontrado"
        if (!cancelled) {
          setFuncionarios([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingFuncionarios(false);
        }
      }
    }

    void carregarFuncionarios();

    return () => {
      cancelled = true;
    };
  }, [debouncedBusca]);

  const funcionarioSelecionado = useMemo(
    () => funcionarios.find((item) => item.id === funcionarioId) || null,
    [funcionarioId, funcionarios],
  );

  async function handleSalvar() {
    if (!funcionarioId) {
      toast.error('Selecione um funcionário');
      return;
    }
    if (!dataInicio || !dataFim) {
      toast.error('Preencha o período');
      return;
    }
    if (dataFim < dataInicio) {
      toast.error('Data fim deve ser maior ou igual à data início');
      return;
    }

    setSaving(true);
    try {
      const response = await apiFetch(`/api/funcionarios/${funcionarioId}/ferias`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tipo,
          data_inicio: dataInicio,
          data_fim: dataFim,
          observacoes: observacoes.trim() || null,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || `Erro ao registrar período (${response.status})`);
      }

      await onSaved?.();
      toast.success(
        `${tipo === 'FERIAS' ? 'Férias' : 'Afastamento'} registrado para ${
          funcionarioSelecionado?.guerra || funcionarioSelecionado?.nome || 'tripulante'
        }`,
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar período');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Registrar Férias / Afastamento"
      size="3xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} isLoading={saving}>
            Registrar período
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-900">Lançamento global do módulo Escalas</p>
          <p className="mt-1 text-xs text-slate-500">
            O período será propagado automaticamente para as escalas mensais existentes no intervalo
            e também reaplicado quando novas escalas do mês forem criadas.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(280px,1.05fr)_minmax(0,0.95fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Funcionário
            </label>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar por nome, guerra ou matrícula..."
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div className="min-h-[280px] max-h-[340px] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
              {loadingFuncionarios && (
                <div className="px-2 py-3 text-sm text-slate-400">Carregando funcionários...</div>
              )}
              {!loadingFuncionarios &&
                funcionarios.map((funcionario) => {
                  const selecionado = funcionario.id === funcionarioId;
                  return (
                    <button
                      key={funcionario.id}
                      type="button"
                      onClick={() => setFuncionarioId(funcionario.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                        selecionado
                          ? 'border-sky-700 bg-sky-700 text-white'
                          : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <div className="truncate text-sm font-semibold">
                        {funcionario.guerra || funcionario.nome || 'Sem nome'}
                      </div>
                      <div
                        className={`text-xs ${selecionado ? 'text-white/80' : 'text-slate-500'}`}
                      >
                        {funcionario.nome || 'Sem nome'}
                        {funcionario.matricula ? ` · ${funcionario.matricula}` : ''}
                        {funcionario.funcao ? ` · ${funcionario.funcao}` : ''}
                      </div>
                    </button>
                  );
                })}
              {!loadingFuncionarios && funcionarios.length === 0 && (
                <div className="px-2 py-3 text-sm text-slate-400">
                  Nenhum funcionário encontrado.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tipo
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { codigo: 'FERIAS' as const, label: 'Férias' },
                  { codigo: 'AFT' as const, label: 'Afastamento' },
                ].map((opcao) => {
                  const ativo = tipo === opcao.codigo;
                  return (
                    <button
                      key={opcao.codigo}
                      type="button"
                      onClick={() => setTipo(opcao.codigo)}
                      className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${
                        ativo
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {opcao.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Período
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(event) => {
                      const novaDataInicio = event.target.value;
                      setDataInicio(novaDataInicio);
                      if (!novaDataInicio) {
                        if (dataFimAuto) {
                          setDataFim('');
                          setDataFimAuto(false);
                        }
                        return;
                      }

                      if (tipo === 'FERIAS' && (!dataFim || dataFimAuto)) {
                        const d = new Date(`${novaDataInicio}T00:00:00`);
                        d.setDate(d.getDate() + 30);
                        setDataFim(d.toISOString().slice(0, 10));
                        setDataFimAuto(true);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                  {dataInicio && (
                    <span className="mt-1 block px-1 text-[11px] font-medium text-slate-500">
                      {fmtDateShort(dataInicio)}
                    </span>
                  )}
                </div>
                <div>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={(event) => {
                      setDataFim(event.target.value);
                      setDataFimAuto(false);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                  {dataFim && (
                    <span className="mt-1 block px-1 text-[11px] font-medium text-slate-500">
                      {fmtDateShort(dataFim)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Observações
              </label>
              <textarea
                rows={5}
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                placeholder="Observações operacionais ou administrativas..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

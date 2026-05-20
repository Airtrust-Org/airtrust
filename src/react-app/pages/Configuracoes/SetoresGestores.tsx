import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { fetchWithAuth } from '@/react-app/config/api';
import { showToast } from '../../utils/toast';
import { Plus, Trash2, LoaderCircle, AlertCircle } from 'lucide-react';

interface Setor {
  id: number;
  nome: string;
  codigo?: string;
  descricao?: string;
}

interface Gestor {
  id: number;
  nome: string;
  email: string;
  cargo?: string;
  empresa?: string;
  ativo?: boolean;
}

interface UsuarioEmpresa {
  id: number;
  nome: string;
  email: string;
  perfil?: string;
  active: number;
  empresa_id?: number;
  funcionario_nome?: string;
}

interface SetorGestor {
  id: number;
  setor_id: number;
  gestor_id: number;
  setor_nome: string;
  gestor_nome: string;
  gestor_email: string;
  role: 'manager' | 'backup' | 'observer';
  ativo: boolean;
}

export function SetoresGestores() {
  const { empresaAtualId } = useAuth();
  const [setores, setSetores] = useState<Setor[]>([]);
  const [gestores, setGestores] = useState<Gestor[]>([]);
  const [usuariosEmpresa, setUsuariosEmpresa] = useState<UsuarioEmpresa[]>([]);
  const [setoresGestores, setSetoresGestores] = useState<SetorGestor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSetorId, setSelectedSetorId] = useState<number | null>(null);
  const [selectedUsuariosIds, setSelectedUsuariosIds] = useState<number[]>([]);
  const [submittingSetor, setSubmittingSetor] = useState<number | null>(null);

  // Load data
  useEffect(() => {
    loadData();
  }, [empresaAtualId]);

  async function loadData() {
    try {
      setLoading(true);
      const cacheBust = `t=${Date.now()}`;
      const [setoresRes, gestoresRes, usuariosRes, sgRes] = await Promise.all([
        fetchWithAuth(`/api/setores?${cacheBust}`),
        fetchWithAuth(`/api/notificacoes/convocacoes/gestores?${cacheBust}`),
        fetchWithAuth(`/api/admin/usuarios?${cacheBust}`),
        fetchWithAuth(`/api/setores-gestores?${cacheBust}`),
      ]);

      if (setoresRes.ok) {
        const data = (await setoresRes.json().catch(() => ({}))) as {
          data?: unknown;
        };
        setSetores(Array.isArray(data.data) ? (data.data as Setor[]) : []);
      }

      if (gestoresRes.ok) {
        const data = (await gestoresRes.json().catch(() => ({}))) as {
          data?: unknown;
        };
        setGestores(Array.isArray(data.data) ? (data.data as Gestor[]) : []);
      }

      if (usuariosRes.ok) {
        const data = (await usuariosRes.json().catch(() => ({}))) as {
          data?: unknown;
        };
        const empresaAtualIdNum = Number(empresaAtualId || 0);
        const usuarios = (Array.isArray(data.data) ? data.data : []) as UsuarioEmpresa[];
        const filtrados = usuarios
          .filter((u) => Number(u.active || 0) === 1)
          .filter((u) => {
            if (!empresaAtualIdNum || !u.empresa_id) return true;
            return Number(u.empresa_id) === empresaAtualIdNum;
          })
          .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
        setUsuariosEmpresa(filtrados);
      }

      if (sgRes.ok) {
        const data = (await sgRes.json().catch(() => ({}))) as {
          data?: unknown;
        };
        setSetoresGestores(Array.isArray(data.data) ? (data.data as SetorGestor[]) : []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      showToast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetorSelect(setorId: number) {
    setSelectedSetorId(setorId);
    // Pre-select users already assigned to the selected setor via gestor email mapping
    const currentAssignments = setoresGestores.filter((sg) => sg.setor_id === setorId);
    const gestoresPorId = new Map(gestores.map((g) => [g.id, g]));
    const emailsSelecionados = new Set(
      currentAssignments
        .map((sg) => gestoresPorId.get(sg.gestor_id)?.email?.toLowerCase().trim())
        .filter(Boolean),
    );
    const usuarioIds = usuariosEmpresa
      .filter((u) =>
        emailsSelecionados.has(
          String(u.email || '')
            .toLowerCase()
            .trim(),
        ),
      )
      .map((u) => u.id);
    setSelectedUsuariosIds(usuarioIds);
  }

  async function syncGestoresFromUsuariosSelecionados(): Promise<number[]> {
    const selectedUsers = usuariosEmpresa.filter((u) => selectedUsuariosIds.includes(u.id));
    const gestorIds: number[] = [];
    const gestoresAtualizados = [...gestores];

    for (const user of selectedUsers) {
      const email = String(user.email || '')
        .trim()
        .toLowerCase();
      if (!email) continue;

      const nome = String(user.nome || user.funcionario_nome || user.email || '').trim();
      const cargo = user.perfil || null;
      const existente = gestoresAtualizados.find(
        (g) => String(g.email || '').toLowerCase() === email,
      );

      if (existente) {
        const precisaAtualizar =
          !existente.ativo ||
          String(existente.nome || '').trim() !== nome ||
          String(existente.cargo || '') !== String(cargo || '');

        if (precisaAtualizar) {
          const putRes = await fetchWithAuth(
            `/api/notificacoes/convocacoes/gestores/${existente.id}`,
            {
              method: 'PUT',
              body: JSON.stringify({
                nome,
                email,
                cargo,
                empresa: null,
                ativo: true,
              }),
            },
          );

          if (!putRes.ok) {
            throw new Error(`Falha ao atualizar gestor ${nome}`);
          }

          const updated = (await putRes.json().catch(() => ({}))) as { data?: Gestor };
          if (updated.data?.id) {
            const idx = gestoresAtualizados.findIndex((g) => g.id === updated.data!.id);
            if (idx >= 0) gestoresAtualizados[idx] = updated.data;
          }
        }

        gestorIds.push(existente.id);
        continue;
      }

      const postRes = await fetchWithAuth('/api/notificacoes/convocacoes/gestores', {
        method: 'POST',
        body: JSON.stringify({
          nome,
          email,
          cargo,
          empresa: null,
          ativo: true,
        }),
      });

      if (!postRes.ok) {
        throw new Error(`Falha ao criar gestor ${nome}`);
      }

      const created = (await postRes.json().catch(() => ({}))) as { data?: Gestor };
      if (!created.data?.id) {
        throw new Error(`Gestor ${nome} criado sem ID retornado`);
      }

      gestoresAtualizados.push(created.data);
      gestorIds.push(created.data.id);
    }

    setGestores(gestoresAtualizados);
    return gestorIds;
  }

  async function handleSaveAssignments() {
    if (selectedSetorId === null) return;

    try {
      setSubmittingSetor(selectedSetorId);
      const gestorIds = await syncGestoresFromUsuariosSelecionados();
      const response = await fetchWithAuth(`/api/setores-gestores/bulk-assign/${selectedSetorId}`, {
        method: 'POST',
        body: JSON.stringify({ gestor_ids: gestorIds }),
      });

      if (!response.ok) {
        throw new Error('Erro ao salvar');
      }

      const data = await response.json();
      if (data.success) {
        showToast.success('Gestores atribuídos ao setor com sucesso');
        // Reload data
        await loadData();
        setSelectedSetorId(null);
        setSelectedUsuariosIds([]);
      }
    } catch (error) {
      console.error('Error saving assignments:', error);
      showToast.error('Erro ao salvar atribuições');
    } finally {
      setSubmittingSetor(null);
    }
  }

  async function handleDeleteAssignment(setorGestorId: number) {
    if (!confirm('Deseja remover este gestor do setor?')) return;

    try {
      const response = await fetchWithAuth(`/api/setores-gestores/${setorGestorId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Erro ao deletar');
      }

      showToast.success('Gestor removido do setor');
      await loadData();
    } catch (error) {
      console.error('Error deleting assignment:', error);
      showToast.error('Erro ao remover gestor');
    }
  }

  function getSetorGestoresCount(setorId: number): number {
    return setoresGestores.filter((sg) => sg.setor_id === setorId).length;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Gestores por Setor</h3>
        <p className="mt-1 text-sm text-slate-600">
          Atribua gestores (CC) a cada setor. Os gestores aparecerão como opção nas convocações de
          funcionários desse setor.
        </p>
      </div>

      {/* Main Content: Setores List + Assignment Editor */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Setores List */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-1">
          <h4 className="font-semibold text-slate-900">Setores ({setores.length})</h4>
          <div className="mt-4 space-y-2 max-h-[500px] overflow-y-auto">
            {setores.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum setor cadastrado</p>
            ) : (
              setores.map((setor) => {
                const count = getSetorGestoresCount(setor.id);
                const isSelected = selectedSetorId === setor.id;
                return (
                  <button
                    key={setor.id}
                    onClick={() => handleSetorSelect(setor.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? 'border-primary bg-slate-50 text-primary font-semibold'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{setor.nome}</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {count}
                      </span>
                    </div>
                    {setor.codigo && (
                      <div className="text-xs text-slate-500 mt-1">{setor.codigo}</div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Assignment Editor */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          {selectedSetorId === null ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                <p className="text-slate-500">Selecione um setor para atribuir gestores</p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <h4 className="font-semibold text-slate-900">
                  Gestores: {setores.find((s) => s.id === selectedSetorId)?.nome}
                </h4>
                <p className="mt-1 text-sm text-slate-600">
                  Selecione quais gestores podem receber cópias de convocações para este setor
                </p>
              </div>

              {/* Gestores Checkboxes */}
              <div className="space-y-2 max-h-[350px] overflow-y-auto mb-4">
                {usuariosEmpresa.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nenhum usuário ativo encontrado para esta empresa.
                  </p>
                ) : (
                  usuariosEmpresa.map((usuario) => {
                    const hasEmail = Boolean(String(usuario.email || '').trim());
                    return (
                      <label
                        key={usuario.id}
                        className="flex items-start gap-3 rounded p-2 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUsuariosIds.includes(usuario.id)}
                          disabled={!hasEmail}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUsuariosIds([...selectedUsuariosIds, usuario.id]);
                            } else {
                              setSelectedUsuariosIds(
                                selectedUsuariosIds.filter((id) => id !== usuario.id),
                              );
                            }
                          }}
                          className="mt-1 h-4 w-4 rounded border-slate-300"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-900">{usuario.nome}</div>
                          <div className="text-xs text-slate-500">
                            {hasEmail ? usuario.email : 'Usuário sem e-mail cadastrado'}
                          </div>
                          {usuario.perfil && (
                            <div className="text-xs text-slate-500">Perfil: {usuario.perfil}</div>
                          )}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>

              {/* Quick Actions */}
              <div className="mb-4 flex gap-2">
                <button
                  onClick={() =>
                    setSelectedUsuariosIds(
                      usuariosEmpresa
                        .filter((u) => Boolean(String(u.email || '').trim()))
                        .map((u) => u.id),
                    )
                  }
                  className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Marcar todos
                </button>
                <button
                  onClick={() => setSelectedUsuariosIds([])}
                  className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Limpar
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleSaveAssignments}
                  disabled={submittingSetor === selectedSetorId}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {submittingSetor === selectedSetorId ? (
                    <>
                      <LoaderCircle className="inline h-4 w-4 animate-spin mr-2" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Plus className="inline h-4 w-4 mr-2" />
                      Salvar alterações
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* List of all assignments */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="font-semibold text-slate-900 mb-4">
          Todas as Atribuições ({setoresGestores.length})
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-2 text-left font-medium text-slate-600">Setor</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Gestor</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Email</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-2 text-center font-medium text-slate-600">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {setoresGestores.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-slate-500">
                    Nenhuma atribuição realizada
                  </td>
                </tr>
              ) : (
                setoresGestores.map((sg) => (
                  <tr key={sg.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{sg.setor_nome}</td>
                    <td className="px-4 py-3 text-slate-700">{sg.gestor_nome}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{sg.gestor_email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          sg.ativo ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {sg.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDeleteAssignment(sg.id)}
                        className="text-red-600 hover:text-red-700 p-1"
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/react-app/config/api';
import { showToast } from '../../utils/toast';
import { AlertCircle, LoaderCircle, Plus, Trash2 } from 'lucide-react';

interface Setor {
  id: number;
  nome: string;
  codigo?: string;
}

interface UsuarioGestorElegivel {
  id: number;
  nome: string;
  email: string;
  perfil: string;
  cargo?: string | null;
  funcionario_nome?: string | null;
}

interface SetorGestor {
  id: number;
  setor_id: number;
  usuario_id?: number | null;
  setor_nome: string;
  gestor_nome: string;
  gestor_email: string;
  gestor_cargo?: string | null;
  gestor_perfil?: string | null;
  role: 'manager' | 'backup' | 'observer';
  ativo: boolean;
}

export function SetoresGestores() {
  const [setores, setSetores] = useState<Setor[]>([]);
  const [usuariosGestores, setUsuariosGestores] = useState<UsuarioGestorElegivel[]>([]);
  const [setoresGestores, setSetoresGestores] = useState<SetorGestor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSetorId, setSelectedSetorId] = useState<number | null>(null);
  const [selectedUsuariosIds, setSelectedUsuariosIds] = useState<number[]>([]);
  const [submittingSetor, setSubmittingSetor] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const cacheBust = `t=${Date.now()}`;
      const [setoresRes, usuariosRes, sgRes] = await Promise.all([
        fetchWithAuth(`/api/setores?${cacheBust}`),
        fetchWithAuth(`/api/setores-gestores/usuarios-elegiveis/lista?${cacheBust}`),
        fetchWithAuth(`/api/setores-gestores?${cacheBust}`),
      ]);

      if (setoresRes.ok) {
        const data = (await setoresRes.json().catch(() => ({}))) as { data?: unknown };
        setSetores(Array.isArray(data.data) ? (data.data as Setor[]) : []);
      }

      if (usuariosRes.ok) {
        const data = (await usuariosRes.json().catch(() => ({}))) as { data?: unknown };
        const usuarios = (Array.isArray(data.data) ? data.data : []) as UsuarioGestorElegivel[];
        setUsuariosGestores(
          usuarios.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')),
        );
      }

      if (sgRes.ok) {
        const data = (await sgRes.json().catch(() => ({}))) as { data?: unknown };
        setSetoresGestores(Array.isArray(data.data) ? (data.data as SetorGestor[]) : []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      showToast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }

  function handleSetorSelect(setorId: number) {
    setSelectedSetorId(setorId);
    const currentAssignments = setoresGestores.filter((sg) => sg.setor_id === setorId);
    const usuarioIds = currentAssignments
      .map((sg) => Number(sg.usuario_id || 0))
      .filter((id) => Number.isInteger(id) && id > 0);
    setSelectedUsuariosIds(usuarioIds);
  }

  async function handleSaveAssignments() {
    if (selectedSetorId === null) return;

    try {
      setSubmittingSetor(selectedSetorId);
      const response = await fetchWithAuth(`/api/setores-gestores/bulk-assign/${selectedSetorId}`, {
        method: 'POST',
        body: JSON.stringify({ usuario_ids: selectedUsuariosIds }),
      });

      if (!response.ok) {
        throw new Error('Erro ao salvar');
      }

      showToast.success('Vínculos gestor-setor salvos com sucesso');
      await loadData();
      setSelectedSetorId(null);
      setSelectedUsuariosIds([]);
    } catch (error) {
      console.error('Error saving assignments:', error);
      showToast.error('Erro ao salvar vínculos');
    } finally {
      setSubmittingSetor(null);
    }
  }

  async function handleDeleteAssignment(setorGestorId: number) {
    if (!confirm('Deseja remover este vínculo gestor-setor?')) return;

    try {
      const response = await fetchWithAuth(`/api/setores-gestores/${setorGestorId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Erro ao deletar');
      }

      showToast.success('Vínculo removido com sucesso');
      await loadData();
    } catch (error) {
      console.error('Error deleting assignment:', error);
      showToast.error('Erro ao remover vínculo');
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
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Gestores por Setor</h3>
        <p className="mt-1 text-sm text-slate-600">
          Vincule apenas usuários com perfil de gestor aos setores autorizados. Esses vínculos
          alimentam o controle de acesso real no backend.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-1">
          <h4 className="font-semibold text-slate-900">Setores ({setores.length})</h4>
          <div className="mt-4 max-h-[500px] space-y-2 overflow-y-auto">
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
                        ? 'border-primary bg-slate-50 font-semibold text-primary'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{setor.nome}</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {count}
                      </span>
                    </div>
                    {setor.codigo ? <div className="mt-1 text-xs text-slate-500">{setor.codigo}</div> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          {selectedSetorId === null ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-center">
                <AlertCircle className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                <p className="text-slate-500">Selecione um setor para editar os gestores vinculados</p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <h4 className="font-semibold text-slate-900">
                  Gestores: {setores.find((s) => s.id === selectedSetorId)?.nome}
                </h4>
                <p className="mt-1 text-sm text-slate-600">
                  Escolha quais usuários gestores podem acessar este setor.
                </p>
              </div>

              <div className="mb-4 max-h-[350px] space-y-2 overflow-y-auto">
                {usuariosGestores.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nenhum usuário com perfil de gestor encontrado para esta empresa.
                  </p>
                ) : (
                  usuariosGestores.map((usuario) => {
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
                              setSelectedUsuariosIds((prev) => [...prev, usuario.id]);
                              return;
                            }
                            setSelectedUsuariosIds((prev) => prev.filter((id) => id !== usuario.id));
                          }}
                          className="mt-1 h-4 w-4 rounded border-slate-300"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-900">{usuario.nome}</div>
                          <div className="text-xs text-slate-500">
                            {hasEmail ? usuario.email : 'Usuário sem e-mail cadastrado'}
                          </div>
                          <div className="text-xs text-slate-500">
                            Perfil: {usuario.perfil}
                            {usuario.cargo ? ` • ${usuario.cargo}` : ''}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>

              <div className="mb-4 flex gap-2">
                <button
                  onClick={() =>
                    setSelectedUsuariosIds(
                      usuariosGestores
                        .filter((u) => Boolean(String(u.email || '').trim()))
                        .map((u) => u.id),
                    )
                  }
                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Marcar todos
                </button>
                <button
                  onClick={() => setSelectedUsuariosIds([])}
                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Limpar
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveAssignments}
                  disabled={submittingSetor === selectedSetorId}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {submittingSetor === selectedSetorId ? (
                    <>
                      <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 inline h-4 w-4" />
                      Salvar vínculos
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="mb-4 font-semibold text-slate-900">
          Todos os vínculos ({setoresGestores.length})
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-2 text-left font-medium text-slate-600">Setor</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Gestor</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Perfil</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-2 text-center font-medium text-slate-600">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {setoresGestores.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-slate-500">
                    Nenhum vínculo cadastrado
                  </td>
                </tr>
              ) : (
                setoresGestores.map((sg) => (
                  <tr key={sg.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{sg.setor_nome}</td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700">{sg.gestor_nome}</div>
                      <div className="text-xs text-slate-500">{sg.gestor_email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{sg.gestor_perfil || 'GESTOR'}</td>
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
                        className="p-1 text-red-600 hover:text-red-700"
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

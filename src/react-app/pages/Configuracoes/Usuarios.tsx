import React, { useState, useEffect, useRef } from 'react';
import { UserPlus, Trash2, Mail, Shield, User, Pencil, LogIn } from 'lucide-react';
import { API_BASE_URL, clearTokens, getAccessToken, setTokens } from '../../config/api';
import { clearAllScopedAuthStorage, clearLegacyPerfisCache } from '@/react-app/utils/auth-storage';
import { useToast } from '../../hooks/useToast';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { useLanguage } from '../../i18n/useLanguage';
import { SettingsSectionIntro } from './components/SettingsSectionIntro';

interface Usuario {
  id: number;
  email: string;
  nome: string;
  role: string;
  is_primary: number;
  modulos_ativos?: string[];
  created_at: string;
}

interface EmpresaResumo {
  id: number;
  nome: string;
  codigo?: string;
}

interface UsuariosProps {
  empresaId: number | null;
  empresasDisponiveis?: EmpresaResumo[];
}

interface AcessoEmpresa {
  perfis?: string[];
  empresa_id: number;
  empresa_nome: string;
  role: string;
  modulos_ativos: string[];
}

const MODULOS_DISPONIVEIS = [
  { key: 'painel' },
  { key: 'funcionarios' },
  { key: 'qualificacoes' },
  { key: 'simuladores' },
  { key: 'frms' },
  { key: 'configuracoes' },
];

const normalizeRoleForUi = (value: string) => {
  const role = String(value || 'viewer')
    .trim()
    .toLowerCase();

  if (role === 'admin' || role === 'administrador') return 'admin';
  if (role === 'manager' || role === 'gestor' || role === 'compliance') return 'manager';
  if (role === 'instructor' || role === 'instrutor') return 'instructor';
  if (role === 'student' || role === 'aluno') return 'student';
  return 'viewer';
};

export function UsuariosConfig({ empresaId, empresasDisponiveis = [] }: UsuariosProps) {
  const { t } = useLanguage();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empresasGerenciaveis, setEmpresasGerenciaveis] =
    useState<EmpresaResumo[]>(empresasDisponiveis);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const showToast = useToast();
  const [empresaSelecionadaId, setEmpresaSelecionadaId] = useState<number | null>(empresaId);

  // Form states
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [perfis, setPerfis] = useState<string[]>(['viewer']);
  const [empresasSelecionadas, setEmpresasSelecionadas] = useState<number[]>([]);
  const [modulosSelecionados, setModulosSelecionados] = useState<string[]>(
    MODULOS_DISPONIVEIS.map((m) => m.key),
  );
  const [inviting, setInviting] = useState(false);

  // Edit user access
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [editPerfis, setEditPerfis] = useState<string[]>(['viewer']);
  const [editEmpresasSelecionadas, setEditEmpresasSelecionadas] = useState<number[]>([]);
  const [editModulosSelecionados, setEditModulosSelecionados] = useState<string[]>(
    MODULOS_DISPONIVEIS.map((m) => m.key),
  );
  const [savingEdit, setSavingEdit] = useState(false);
  const latestLoadRequestRef = useRef(0);

  const getRoleLabel = (userRole: string) => {
    const normalizedRole = normalizeRoleForUi(userRole);
    if (normalizedRole === 'manager') return t('settings.users.role.manager');
    if (normalizedRole === 'instructor') return t('settings.users.role.instructor');
    if (normalizedRole === 'student') return t('settings.users.role.student');
    if (normalizedRole === 'admin') return t('settings.users.role.admin');
    return t('settings.users.role.viewer');
  };

  const getModuloLabel = (modulo: string) => {
    if (modulo === 'painel') return t('settings.users.module.panel');
    if (modulo === 'funcionarios') return t('settings.users.module.employees');
    if (modulo === 'qualificacoes') return t('settings.users.module.qualifications');
    if (modulo === 'simuladores') return t('settings.users.module.simulators');
    if (modulo === 'frms') return t('settings.users.module.frms');
    if (modulo === 'configuracoes') return t('settings.users.module.settings');
    return modulo;
  };

  useEffect(() => {
    setEmpresaSelecionadaId(empresaId);
  }, [empresaId]);

  useEffect(() => {
    setEmpresasGerenciaveis(empresasDisponiveis);
  }, [empresasDisponiveis]);

  useEffect(() => {
    const loadEmpresasGerenciaveis = async () => {
      try {
        const token = getAccessToken();
        if (!token) return;

        const res = await fetch(`${API_BASE_URL}/empresas`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data?.success && Array.isArray(data.data) && data.data.length > 0) {
          setEmpresasGerenciaveis(
            data.data.map((empresa: Record<string, unknown>) => ({
              id: Number(empresa.id),
              nome: String(empresa.nome || ''),
              codigo: String(empresa.codigo || ''),
            })),
          );
        }
      } catch {
        // fallback: mantém empresas do contexto
      }
    };

    loadEmpresasGerenciaveis();
  }, []);

  useEffect(() => {
    if (empresaSelecionadaId) {
      loadUsuarios();
    } else {
      setUsuarios([]);
    }
  }, [empresaSelecionadaId]);

  useEffect(() => {
    if (empresaSelecionadaId) {
      setEmpresasSelecionadas([empresaSelecionadaId]);
    }
  }, [empresaSelecionadaId]);

  useEffect(() => {
    if (!empresaSelecionadaId && empresasGerenciaveis.length > 0) {
      setEmpresaSelecionadaId(empresasGerenciaveis[0].id);
    }
  }, [empresaSelecionadaId, empresasGerenciaveis]);

  const toggleEmpresaSelection = (
    empresaIdValue: number,
    selected: number[],
    setter: React.Dispatch<React.SetStateAction<number[]>>,
  ) => {
    setter((prev) =>
      prev.includes(empresaIdValue)
        ? prev.filter((idValue) => idValue !== empresaIdValue)
        : [...prev, empresaIdValue],
    );
  };

  const toggleModuloSelection = (
    modulo: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setter((prev) =>
      prev.includes(modulo) ? prev.filter((m) => m !== modulo) : [...prev, modulo],
    );
  };

  const loadUsuarios = async () => {
    const requestId = ++latestLoadRequestRef.current;
    try {
      setLoading(true);
      const token = getAccessToken();
      if (!empresaSelecionadaId) {
        setUsuarios([]);
        return;
      }

      const res = await fetch(
        `${API_BASE_URL}/empresas/${empresaSelecionadaId}/usuarios?t=${Date.now()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
          cache: 'no-store',
        },
      );
      const data = await res.json();
      if (requestId !== latestLoadRequestRef.current) return;

      if (data.success) {
        setUsuarios(data.data);
      }
    } catch (err) {
      if (requestId !== latestLoadRequestRef.current) return;
      console.error('Erro ao carregar usuários:', err);
      showToast.error(t('settings.users.error.loadList'));
    } finally {
      if (requestId !== latestLoadRequestRef.current) return;
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || empresasSelecionadas.length === 0) {
      showToast.error(t('settings.users.error.selectOneCompany'));
      return;
    }

    const token = getAccessToken();
    if (!token) {
      showToast.error('Autenticação expirada. Faça login novamente.');
      return;
    }

    try {
      setInviting(true);
      const empresaRequestId = empresaSelecionadaId ?? empresasSelecionadas[0];
      const res = await fetch(`${API_BASE_URL}/empresas/${empresaRequestId}/usuarios/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email,
          perfis,
          nome,
          empresaIds: empresasSelecionadas,
          modulosAtivos: modulosSelecionados,
        }),
      });
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      // If the HTTP status is not OK, prefer the error message from the body (if any)
      if (!res.ok) {
        const errorMessage =
          (data && (data.error || data.message)) || text || t('settings.users.error.inviteUser');
        showToast.error(errorMessage);
        return;
      }

      // If the body explicitly indicates failure, surface it.
      if (data && data.success === false) {
        const errorMessage = data.error || data.message || t('settings.users.error.inviteUser');
        showToast.error(errorMessage);
        return;
      }

      // Treat HTTP OK as success even if the response couldn't be parsed as JSON.
      showToast.success(
        (data && (data.message || data.data?.message)) ||
          'Convite enviado com sucesso.',

      );
      setShowModal(false);
      setEmail('');
      setNome('');
      setPerfis(['viewer']);
      setModulosSelecionados(MODULOS_DISPONIVEIS.map((m) => m.key));
      if (empresaSelecionadaId) setEmpresasSelecionadas([empresaSelecionadaId]);
      loadUsuarios();
    } catch (err) {
      console.error('Erro ao enviar convite:', err);
      showToast.error(t('settings.users.error.inviteProcess'));
    } finally {
      setInviting(false);
    }
  };

  const handleImpersonate = async (usuario: Usuario) => {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/auth/impersonate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: usuario.id }),
      });
      const data = await res.json();
      if (data.success) {
        const accessToken = String(data?.data?.accessToken || '');
        const impersonatedUser = data?.data?.user || null;

        if (!accessToken || !impersonatedUser) {
          showToast.error('Resposta inválida ao impersonar usuário');
          return;
        }

        clearTokens();
        setTokens(accessToken);

        try {
          clearAllScopedAuthStorage();
          clearLegacyPerfisCache();
          sessionStorage.setItem('airtrust_user', JSON.stringify(impersonatedUser));
          sessionStorage.removeItem('airtrust_refresh_token');
          localStorage.removeItem('airtrust_refresh_token');
        } catch {
          // Sem ação: fallback em memória + novo carregamento
        }

        showToast.success(`Logado como ${usuario.nome}`);
        window.location.replace('/');
      } else {
        showToast.error(data.error || 'Erro ao impersonar usuário');
      }
    } catch {
      showToast.error('Erro ao impersonar usuário');
    }
  };

  const handleRemove = async (usuarioId: number) => {
    if (!(await confirmDialog(t('settings.users.confirm.removeUser')))) return;

    try {
      if (!empresaSelecionadaId) {
        showToast.error(t('settings.users.error.selectCompany'));
        return;
      }

      const token = getAccessToken();
      const res = await fetch(
        `${API_BASE_URL}/empresas/${empresaSelecionadaId}/usuarios/${usuarioId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();

      if (data.success) {
        showToast.success(t('settings.users.success.userRemoved'));
        loadUsuarios();
      } else {
        showToast.error(t('settings.users.error.removeUser'));
      }
    } catch (err) {
      showToast.error(t('settings.users.error.removeUser'));
    }
  };

  const handleOpenEditModal = async (usuario: Usuario) => {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/empresas/usuarios/${usuario.id}/acessos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!data.success) {
        showToast.error(data.error || t('settings.users.error.loadAccess'));
        return;
      }

      const acessos = (data.data?.acessos || []) as AcessoEmpresa[];
      setEditingUser(usuario);
      setEditEmpresasSelecionadas(acessos.map((a) => a.empresa_id));
      setEditPerfis(acessos[0]?.perfis?.length ? acessos[0].perfis : [normalizeRoleForUi(acessos[0]?.role || usuario.role || 'viewer')]);
      setEditModulosSelecionados(
        acessos[0]?.modulos_ativos?.length
          ? acessos[0].modulos_ativos
          : MODULOS_DISPONIVEIS.map((m) => m.key),
      );
      setShowEditModal(true);
    } catch {
      showToast.error(t('settings.users.error.loadEditData'));
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (editEmpresasSelecionadas.length === 0) {
      showToast.error(t('settings.users.error.selectOneCompany'));
      return;
    }

    try {
      setSavingEdit(true);
      const token = getAccessToken();
      const acessosPayload = editEmpresasSelecionadas.map((empresaIdValue) => ({
        empresaId: empresaIdValue,
        role: editPerfis,
        modulosAtivos: editModulosSelecionados,
      }));

      const res = await fetch(`${API_BASE_URL}/empresas/usuarios/${editingUser.id}/acessos`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ acessos: acessosPayload }),
      });
      const data = await res.json();

      if (data.success) {
        setUsuarios((prev) =>
          prev.map((userItem) =>
            userItem.id === editingUser.id ? { ...userItem, role: editPerfis[0] || 'viewer' } : userItem,
          ),
        );
        showToast.success(t('settings.users.success.accessUpdated'));
        setShowEditModal(false);
        setEditingUser(null);
        await loadUsuarios();
      } else {
        showToast.error(data.error || t('settings.users.error.updateAccess'));
      }
    } catch {
      showToast.error(t('settings.users.error.saveChanges'));
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-4">
      <SettingsSectionIntro
        badge="Acesso e convites"
        title={t('settings.users.title')}
        description={t('settings.users.subtitle')}
        icon={<User className="h-5 w-5" />}
        action={
          <div className="flex flex-wrap items-center justify-end gap-3">
            {empresasGerenciaveis.length > 1 && (
              <select
                value={empresaSelecionadaId ?? ''}
                onChange={(e) => setEmpresaSelecionadaId(Number(e.target.value) || null)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                title={t('settings.users.activeCompanyTitle')}
              >
                {empresasGerenciaveis.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.nome}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={() => setShowModal(true)}
              disabled={!empresaSelecionadaId}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserPlus size={18} />
              {t('settings.users.inviteButton')}
            </button>
          </div>
        }
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <th className="px-6 py-3 font-medium">{t('settings.users.table.user')}</th>
              <th className="px-6 py-3 font-medium">{t('settings.users.table.email')}</th>
              <th className="px-6 py-3 font-medium">{t('settings.users.table.profile')}</th>
              <th className="px-6 py-3 font-medium text-right">
                {t('settings.users.table.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  {t('settings.users.table.loading')}
                </td>
              </tr>
            ) : usuarios.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  {t('settings.users.table.empty')}
                </td>
              </tr>
            ) : (
              usuarios.map((u) => {
                const normalizedRole = normalizeRoleForUi(u.role);

                return (
                  <tr key={u.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                          {u.nome?.substring(0, 2).toUpperCase() || 'UN'}
                        </div>
                        <span className="font-medium text-slate-900">{u.nome}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{u.email}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${
                        normalizedRole === 'admin' || normalizedRole === 'manager'
                          ? 'bg-purple-100 text-purple-800'
                          : normalizedRole === 'instructor'
                            ? 'bg-blue-100 text-blue-800'
                            : normalizedRole === 'student'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-slate-100 text-slate-700'
                      }`}
                      >
                        {getRoleLabel(u.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleImpersonate(u)}
                        className="mr-2 p-1 text-slate-400 transition hover:text-emerald-600"
                        title="Entrar como este usuário"
                      >
                        <LogIn size={16} />
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(u)}
                        className="mr-2 p-1 text-slate-400 transition hover:text-blue-600"
                        title={t('settings.users.action.edit')}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleRemove(u.id)}
                        className="p-1 text-slate-400 transition hover:text-red-600"
                        title={t('settings.users.action.removeAccess')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold mb-1 text-slate-900">
              {t('settings.users.inviteModal.title')}
            </h3>
            <p className="text-sm text-slate-500 mb-5">{t('settings.users.subtitle')}</p>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t('settings.users.inviteModal.availableCompanies')}
                </label>
                <div className="max-h-40 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {empresasGerenciaveis.map((empresa) => (
                    <label
                      key={empresa.id}
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={empresasSelecionadas.includes(empresa.id)}
                        onChange={() =>
                          toggleEmpresaSelection(
                            empresa.id,
                            empresasSelecionadas,
                            setEmpresasSelecionadas,
                          )
                        }
                      />
                      <span>{empresa.nome}</span>
                    </label>
                  ))}
                  {empresasGerenciaveis.length === 0 && (
                    <p className="text-xs text-slate-500">
                      {t('settings.users.inviteModal.noCompanies')}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('settings.users.inviteModal.fullName')}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder={t('settings.users.inviteModal.namePlaceholder')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('settings.users.table.email')}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder={t('settings.users.inviteModal.emailPlaceholder')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('settings.users.inviteModal.profile')}
                </label>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {[
                    { value: 'manager', label: t('settings.users.roleOption.manager') },
                    { value: 'instructor', label: t('settings.users.roleOption.instructor') },
                    { value: 'student', label: t('settings.users.roleOption.student') },
                    { value: 'viewer', label: t('settings.users.roleOption.viewer') },
                  ].map((p) => (
                    <label key={p.value} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={perfis.includes(p.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPerfis([...perfis, p.value]);
                          } else {
                            if (perfis.length > 1) {
                              setPerfis(perfis.filter((v) => v !== p.value));
                            }
                          }
                        }}
                        className="rounded border-slate-300 text-primary focus:ring-primary/30"
                      />
                      <span className="text-sm text-slate-700">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t('settings.users.inviteModal.modules')}
                </label>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {MODULOS_DISPONIVEIS.map((modulo) => (
                    <label
                      key={modulo.key}
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={modulosSelecionados.includes(modulo.key)}
                        onChange={() => toggleModuloSelection(modulo.key, setModulosSelecionados)}
                      />
                      <span>{getModuloLabel(modulo.key)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={inviting || empresasSelecionadas.length === 0}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {inviting
                    ? t('settings.users.inviteModal.sending')
                    : t('settings.users.inviteModal.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold mb-1 text-slate-900">
              {t('settings.users.editModal.title')}
            </h3>
            <p className="text-sm text-slate-500 mb-5">
              {editingUser.nome} • {editingUser.email}
            </p>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t('settings.users.editModal.companies')}
                </label>
                <div className="max-h-40 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {empresasGerenciaveis.map((empresa) => (
                    <label
                      key={empresa.id}
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={editEmpresasSelecionadas.includes(empresa.id)}
                        onChange={() =>
                          toggleEmpresaSelection(
                            empresa.id,
                            editEmpresasSelecionadas,
                            setEditEmpresasSelecionadas,
                          )
                        }
                      />
                      <span>{empresa.nome}</span>
                    </label>
                  ))}
                  {empresasGerenciaveis.length === 0 && (
                    <p className="text-xs text-slate-500">
                      {t('settings.users.editModal.noCompanies')}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('settings.users.editModal.profile')}
                </label>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {[
                    { value: 'manager', label: t('settings.users.roleOption.manager') },
                    { value: 'instructor', label: t('settings.users.roleOption.instructor') },
                    { value: 'student', label: t('settings.users.roleOption.student') },
                    { value: 'viewer', label: t('settings.users.roleOption.viewer') },
                  ].map((p) => (
                    <label key={p.value} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={editPerfis.includes(p.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditPerfis([...editPerfis, p.value]);
                          } else {
                            if (editPerfis.length > 1) {
                              setEditPerfis(editPerfis.filter((v) => v !== p.value));
                            }
                          }
                        }}
                        className="rounded border-slate-300 text-primary focus:ring-primary/30"
                      />
                      <span className="text-sm text-slate-700">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t('settings.users.editModal.modules')}
                </label>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {MODULOS_DISPONIVEIS.map((modulo) => (
                    <label
                      key={modulo.key}
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={editModulosSelecionados.includes(modulo.key)}
                        onChange={() =>
                          toggleModuloSelection(modulo.key, setEditModulosSelecionados)
                        }
                      />
                      <span>{getModuloLabel(modulo.key)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingUser(null);
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || editEmpresasSelecionadas.length === 0}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingEdit
                    ? t('settings.users.editModal.saving')
                    : t('settings.users.editModal.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

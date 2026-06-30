import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Briefcase,
  Building2,
  ChevronRight,
  Edit,
  Plus,
  Shield,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { showToast } from '../../utils/toast';
import { API_BASE_URL, fetchWithAuth } from '../../config/api';
import { EmpresaForm } from '../../components/empresas/EmpresaForm';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useLanguage } from '@/react-app/i18n/useLanguage';
import { SettingsSectionIntro } from './components/SettingsSectionIntro';

interface Empresa {
  id: number;
  nome: string;
  codigo: string;
  cnpj?: string;
  plano: 'basic' | 'pro' | 'enterprise';
  ativo: number;
  created_at: string;
  max_funcionarios: number;
  max_storage_mb: number;
  logo_url?: string;
}

const PLANO_STYLES: Record<Empresa['plano'], string> = {
  basic: 'border-slate-200 bg-slate-100 text-slate-700',
  pro: 'border-blue-200 bg-blue-100 text-blue-700',
  enterprise: 'border-emerald-200 bg-emerald-100 text-emerald-700',
};

function getEmpresaLogoUrl(logoUrl?: string | null): string | null {
  if (!logoUrl) return null;
  if (
    logoUrl.startsWith('data:') ||
    logoUrl.startsWith('http://') ||
    logoUrl.startsWith('https://')
  ) {
    return logoUrl;
  }
  if (logoUrl.startsWith('/api/')) {
    const apiOrigin = API_BASE_URL.replace(/\/api$/, '');
    return `${apiOrigin}${logoUrl}`;
  }
  return logoUrl;
}

function getEmpresaInitials(nome?: string): string {
  if (!nome) return 'EM';
  const parts = nome.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return 'EM';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function GestaoEmpresas() {
  const { user, refreshEmpresas, empresaAtualId } = useAuth();
  const { isAdmin, can } = usePermissions();
  const { t } = useLanguage();
  const isSuperAdmin = isAdmin || can('admin.multiempresa') || user?.id === 1;

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingEmpresaId, setUpdatingEmpresaId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Empresa | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Empresa | null>(null);

  const fetchEmpresas = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`${API_BASE_URL}/empresas`);
      const data = await res.json();
      if (data.success) {
        setEmpresas(Array.isArray(data.data) ? data.data : []);
      } else {
        showToast.error(data.error || t('settings.companies.loadError'));
      }
    } catch (error) {
      console.error(error);
      showToast.error(t('settings.companies.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmpresas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resumo = useMemo(() => {
    const ativas = empresas.filter((empresa) => empresa.ativo === 1).length;
    const storageTotal = empresas.reduce((total, empresa) => total + empresa.max_storage_mb, 0);
    const funcionariosTotal = empresas.reduce(
      (total, empresa) => total + empresa.max_funcionarios,
      0,
    );

    return {
      total: empresas.length,
      ativas,
      storageTotal,
      funcionariosTotal,
    };
  }, [empresas]);

  const handleEdit = (empresa: Empresa) => {
    setEditando(empresa);
    setShowModal(true);
  };

  const handleCriarNova = () => {
    setEditando(null);
    setShowModal(true);
  };

  const fecharModal = () => {
    setShowModal(false);
    setEditando(null);
  };

  const deletarEmpresa = async (empresa: Empresa) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/empresas/${empresa.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (data.success) {
        showToast.success(t('settings.companies.deleteSuccess'));
        setConfirmDelete(null);
        await fetchEmpresas();
      } else {
        showToast.error(data.error || t('settings.companies.deleteError'));
      }
    } catch (error) {
      console.error('Erro ao deletar empresa:', error);
      showToast.error(t('settings.companies.deleteError'));
    }
  };

  const alternarEmpresaAtiva = async (empresa: Empresa) => {
    const proximoStatus = empresa.ativo === 1 ? 0 : 1;

    try {
      setUpdatingEmpresaId(empresa.id);
      const res = await fetchWithAuth(`${API_BASE_URL}/empresas/${empresa.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ativo: proximoStatus }),
      });
      const data = await res.json();

      if (!data.success) {
        showToast.error(data.error || 'Não foi possível atualizar o status da empresa');
        return;
      }

      setEmpresas((prev) =>
        prev.map((item) => (item.id === empresa.id ? { ...item, ativo: proximoStatus } : item)),
      );
      showToast.success(
        proximoStatus === 1
          ? `${empresa.nome} agora está ativa para o administrador.`
          : `${empresa.nome} foi ocultada do escopo ativo do administrador.`,
      );
      refreshEmpresas();
    } catch (error) {
      console.error('Erro ao atualizar status da empresa:', error);
      showToast.error('Não foi possível atualizar o status da empresa');
    } finally {
      setUpdatingEmpresaId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-slate-200 border-b-primary" />
          <p className="text-sm font-medium">Carregando empresas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SettingsSectionIntro
        badge={
          <>
            <Shield className="h-3.5 w-3.5 text-blue-600" />
            {isSuperAdmin ? 'Administração do sistema' : 'Empresa atual'}
          </>
        }
        title={t('settings.companies.title')}
        description={
          isSuperAdmin
            ? 'Visualize, edite e gerencie todas as empresas cadastradas na plataforma.'
            : t('settings.companies.subtitle')
        }
        icon={<Building2 className="h-5 w-5" />}
        action={
          isSuperAdmin ? (
            <button
              onClick={handleCriarNova}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus className="h-5 w-5" />
              {t('settings.companies.new')}
            </button>
          ) : null
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Empresas visíveis
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{resumo.total}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ativas</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{resumo.ativas}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Limite total de usuários
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{resumo.funcionariosTotal}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Storage contratado
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{resumo.storageTotal} MB</p>
          </div>
        </div>
      </SettingsSectionIntro>

      {!isSuperAdmin && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-900">
          Você está visualizando apenas a empresa ativa no momento. Para acessar outras empresas,
          entre com um usuário administrador do sistema.
        </section>
      )}

      {empresas.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white py-16 text-center shadow-sm">
          <Building2 className="mx-auto mb-4 h-16 w-16 text-slate-300" />
          <h3 className="mb-2 text-lg font-semibold text-slate-900">
            {t('settings.companies.empty.title')}
          </h3>
          <p className="mb-4 text-slate-600">{t('settings.companies.empty.subtitle')}</p>
          {isSuperAdmin && (
            <button
              onClick={handleCriarNova}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90"
            >
              <Plus className="h-5 w-5" />
              {t('settings.companies.new')}
            </button>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Empresas cadastradas</h2>
            <p className="mt-1 text-sm text-slate-500">
              {isSuperAdmin
                ? 'Use o botão de ativação para definir quais empresas permanecem ativas e entram no escopo operacional do administrador.'
                : 'Dados da empresa atualmente vinculada ao seu acesso.'}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2 xl:grid-cols-3">
            {empresas.map((empresa) => (
              <article
                key={empresa.id}
                className="group rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                      {getEmpresaLogoUrl(empresa.logo_url) ? (
                        <img
                          src={getEmpresaLogoUrl(empresa.logo_url) || ''}
                          alt={empresa.nome}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="text-sm font-semibold text-slate-500">
                          {getEmpresaInitials(empresa.nome)}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-900">{empresa.nome}</h3>
                        {empresaAtualId === empresa.id && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                            <BadgeCheck className="h-3.5 w-3.5" />
                            Atual
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        Código: {empresa.codigo}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      empresa.ativo === 1
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {empresa.ativo === 1
                      ? t('settings.companies.status.active')
                      : t('settings.companies.status.inactive')}
                  </span>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${PLANO_STYLES[empresa.plano]}`}
                  >
                    {empresa.plano.toUpperCase()}
                  </span>
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {t('settings.companies.cnpj')}
                  </p>
                  <p className="mt-1 font-medium text-slate-900">
                    {empresa.cnpj || t('settings.companies.notInformed')}
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Users className="h-4 w-4" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide">
                        {t('settings.companies.usersLimit')}
                      </span>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {empresa.max_funcionarios}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Briefcase className="h-4 w-4" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide">
                        {t('settings.companies.storage')}
                      </span>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {empresa.max_storage_mb}MB
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex gap-2">
                  {isSuperAdmin && (
                    <button
                      onClick={() => alternarEmpresaAtiva(empresa)}
                      disabled={updatingEmpresaId === empresa.id}
                      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        empresa.ativo === 1
                          ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {updatingEmpresaId === empresa.id
                        ? 'Atualizando...'
                        : empresa.ativo === 1
                          ? 'Desativar para admin'
                          : 'Ativar para admin'}
                    </button>
                  )}

                  <button
                    onClick={() => handleEdit(empresa)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    <Edit className="h-4 w-4" />
                    {t('settings.companies.edit')}
                  </button>

                  {isSuperAdmin && (
                    <button
                      onClick={() => setConfirmDelete(empresa)}
                      className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
                      title={t('settings.companies.delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
                  <span>ID #{empresa.id}</span>
                  <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                    Abrir edição
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  {editando
                    ? t('settings.companies.modal.editTitle')
                    : t('settings.companies.modal.createTitle')}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {editando
                    ? 'Atualize os dados cadastrais e a capacidade contratada da empresa.'
                    : 'Cadastre uma nova empresa e defina os limites iniciais da operação.'}
                </p>
              </div>

              <button
                onClick={fecharModal}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50">
              <EmpresaForm
                empresaId={editando?.id}
                isSelfEdit={!isSuperAdmin}
                onSuccess={() => {
                  fetchEmpresas();
                  refreshEmpresas();
                  fecharModal();
                }}
                onCancel={fecharModal}
              />
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-8 w-8 text-red-600" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-slate-900">
                {t('settings.companies.deleteConfirm.title')}
              </h3>
              <p className="mb-4 text-slate-600">
                {t('settings.companies.deleteConfirm.question')}{' '}
                <strong>{confirmDelete.nome}</strong>?
              </p>
              <p className="mb-6 text-sm text-red-600">
                {t('settings.companies.deleteConfirm.warning')}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => deletarEmpresa(confirmDelete)}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-red-700"
              >
                {t('settings.companies.delete')}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-xl bg-slate-200 px-4 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-300"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

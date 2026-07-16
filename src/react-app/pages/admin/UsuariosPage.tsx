/**
 * Gestão de Usuários — ADMINISTRADOR e GESTOR
 *
 * Permite:
 * - Listar todos os usuários da empresa
 * - Criar novo usuário (envia convite por link)
 * - Editar perfil e vínculo com funcionário
 * - Desativar usuário
 * - Reenviar convite
 * - Gerenciar permissões individuais (overrides)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { useAuth } from '@/react-app/hooks/useAuth';
import {
  readScopedPerfis,
  writeScopedPerfis,
  clearLegacyPerfisCache,
} from '@/react-app/utils/auth-storage';
import {
  Users,
  UserPlus,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldX,
  Check,
  X,
  Mail,
  ChevronRight,
  AlertTriangle,
  Search,
  Copy,
  Pencil,
  Trash2,
  SendHorizonal,
  ArrowLeft,
  Link,
  UserCog,
  LayoutGrid,
  Info,
  KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';
import AppLayout from '@/react-app/components/AppLayout';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface UsuarioRow {
  id: number;
  email: string;
  nome: string;
  perfil: string | null;
  active: number;
  funcionario_id: number | null;
  funcionario_nome: string | null;
  empresa_id: number;
  empresa_nome: string;
  is_primary: number;
  created_at: string;
  last_login: string | null;
  convite_pendente: number;
}

interface FuncionarioOpcao {
  id: number;
  nome: string;
  email: string | null;
  matricula: string | null;
  cargo: string | null;
}

interface PermissaoOverride {
  permissao: string;
  tipo: 'GRANT' | 'DENY';
}

interface UsuarioAtualizado extends UsuarioRow {}

const resetSenhaSchema = z
  .object({
    novaSenha: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres'),
    confirmarSenha: z.string().min(8, 'A confirmação deve ter no mínimo 8 caracteres'),
  })
  .refine((data) => data.novaSenha === data.confirmarSenha, {
    message: 'As senhas não coincidem',
    path: ['confirmarSenha'],
  });

// ─── Constantes ───────────────────────────────────────────────────────────────

const PERFIS = [
  { value: 'ADMINISTRADOR', label: 'Admin', color: 'bg-red-100 text-red-800' },
  { value: 'ADMIN', label: 'Admin', color: 'bg-red-100 text-red-800' }, // alias legado
  { value: 'GESTOR', label: 'Gestor', color: 'bg-blue-100 text-blue-700' },
  { value: 'MANAGER', label: 'Gestor', color: 'bg-blue-100 text-blue-700' },
  { value: 'INSTRUTOR', label: 'Instrutor', color: 'bg-green-100 text-green-800' },
  { value: 'ALUNO', label: 'Aluno', color: 'bg-gray-100 text-gray-600' },
  { value: 'USUARIO', label: 'Aluno', color: 'bg-gray-100 text-gray-600' },
  { value: 'VIEWER', label: 'Aluno', color: 'bg-gray-100 text-gray-600' },
];

const PERMISSOES_DISPONIVEIS = [
  {
    grupo: 'Funcionários',
    items: ['funcionarios.view', 'funcionarios.edit', 'funcionarios.delete'],
  },
  {
    grupo: 'Qualificações',
    items: ['qualificacoes.view', 'qualificacoes.edit', 'qualificacoes.delete'],
  },
  {
    grupo: 'Simuladores',
    items: [
      'simuladores.view',
      'simuladores.evaluate',
      'simuladores.schedule',
      'simuladores.config',
      'simuladores.sign_own',
      'simuladores.sign_student',
    ],
  },
  { grupo: 'Escalas', items: ['escalas.view', 'escalas.edit', 'escalas.publish'] },
  { grupo: 'FRMS', items: ['frms.view', 'frms.edit'] },
  { grupo: 'SGSO', items: ['sgso.view', 'sgso.edit'] },
  { grupo: 'Relatórios', items: ['relatorios.view', 'relatorios.export'] },
  { grupo: 'Admin', items: ['admin.usuarios', 'admin.config'] },
  { grupo: 'Pessoal', items: ['self.ficha', 'self.escala'] },
  { grupo: 'Dashboard', items: ['dashboard.view'] },
];

// Human-readable labels for each permission key
const PERM_LABELS: Record<string, string> = {
  'funcionarios.view': 'Ver funcionários',
  'funcionarios.edit': 'Editar funcionários',
  'funcionarios.delete': 'Excluir funcionários',
  'qualificacoes.view': 'Ver qualificações',
  'qualificacoes.edit': 'Editar qualificações',
  'qualificacoes.delete': 'Excluir qualificações',
  'simuladores.view': 'Ver simuladores',
  'simuladores.evaluate': 'Avaliar sessões',
  'simuladores.schedule': 'Agendar sessões',
  'simuladores.config': 'Configurar simuladores',
  'simuladores.sign_own': 'Assinar própria ficha',
  'simuladores.sign_student': 'Assinar ficha de aluno',
  'escalas.view': 'Ver escalas',
  'escalas.edit': 'Editar escalas',
  'escalas.publish': 'Publicar escalas',
  'frms.view': 'Ver FRMS',
  'frms.edit': 'Editar FRMS',
  'sgso.view': 'Ver SGSO',
  'sgso.edit': 'Editar SGSO',
  'relatorios.view': 'Ver relatórios',
  'relatorios.export': 'Exportar relatórios',
  'admin.usuarios': 'Gerenciar usuários',
  'admin.config': 'Configurações avançadas',
  'self.ficha': 'Ver própria ficha',
  'self.escala': 'Ver própria escala',
  'dashboard.view': 'Ver painel principal',
};

// Permissions granted by default for each role (null means wildcard/all)
const ROLE_DEFAULTS: Record<string, string[] | null> = {
  ADMINISTRADOR: null, // wildcard — all permissions
  ADMIN: null,
  GESTOR: null,
  INSTRUTOR: [
    'simuladores.view',
    'simuladores.evaluate',
    'simuladores.sign_own',
    'simuladores.sign_student',
    'escalas.view',
    'self.ficha',
    'self.escala',
  ],
  ALUNO: ['self.ficha', 'self.escala'],
};

const GESTOR_BLOCKED_PERMISSIONS = new Set(['admin.config', 'admin.multiempresa']);

/** Carrega perfis usando o novo helper escopado (legado global é ignorado) */
function loadPerfisScoped(
  empresaId: number | string | null | undefined,
  userId: number | string | null | undefined,
): Array<{ value: string; permissoes: string[] | null }> | null {
  clearLegacyPerfisCache();
  if (!empresaId || !userId) return null;
  return readScopedPerfis({ empresaId, userId });
}

/** Salva perfis usando o novo helper escopado */
function savePerfisScoped(
  empresaId: number | string | null | undefined,
  userId: number | string | null | undefined,
  perfis: Array<{ value: string; permissoes: string[] | null }>,
): void {
  if (!empresaId || !userId) return;
  clearLegacyPerfisCache();
  writeScopedPerfis({ empresaId, userId }, perfis);
}

function normalizePerfil(perfil: string | null | undefined): string {
  const normalized = (perfil || '').trim().toUpperCase();
  if (normalized === 'MANAGER') return 'GESTOR';
  if (normalized === 'VIEWER') return 'ALUNO';
  return normalized;
}

function roleHasPerm(
  perfil: string | null | undefined,
  perm: string,
  stored: Array<{ value: string; permissoes: string[] | null }> | null,
): boolean {
  const normalizedPerfil = normalizePerfil(perfil);
  if (normalizedPerfil === 'GESTOR' && GESTOR_BLOCKED_PERMISSIONS.has(perm)) return false;
  if (stored) {
    const p = stored.find((x) => x.value.toUpperCase() === normalizedPerfil);
    if (p !== undefined) {
      if (p.permissoes === null) return true;
      return p.permissoes.includes(perm);
    }
  }
  const defaults = ROLE_DEFAULTS[normalizedPerfil];
  if (defaults === null) return true;
  return defaults?.includes(perm) ?? false;
}

function perfilBadge(perfil: string | null | undefined) {
  const normalizedPerfil = normalizePerfil(perfil);
  if (!normalizedPerfil) return 'bg-gray-100 text-gray-500';
  const p = PERFIS.find((x) => x.value === normalizedPerfil);
  return p ? p.color : 'bg-gray-100 text-gray-700';
}

function perfilLabel(perfil: string | null | undefined) {
  const normalizedPerfil = normalizePerfil(perfil);
  if (!normalizedPerfil) return 'Sem perfil';
  const p = PERFIS.find((x) => x.value === normalizedPerfil);
  return p ? p.label : normalizedPerfil;
}

// ─── Helpers API ──────────────────────────────────────────────────────────────

async function apiFetch(path: string, init?: RequestInit) {
  const token = getAccessToken();
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function UsuariosPage() {
  const navigate = useNavigate();
  const { isAdmin, isGestor, can } = usePermissions();
  const { user, empresaAtualId } = useAuth();

  // Verificar acesso
  if (!isAdmin && !isGestor && !can('admin.usuarios')) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <AlertTriangle className="h-12 w-12 text-amber-500" />
          <h2 className="text-xl font-semibold text-slate-900">Acesso Restrito</h2>
          <p className="text-sm text-slate-600">Você não tem permissão para gerenciar usuários.</p>
          <button onClick={() => navigate(-1)} className="text-primary hover:underline text-sm">
            Voltar
          </button>
        </div>
      </AppLayout>
    );
  }

  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');

  // Modais
  const [modalCriar, setModalCriar] = useState(false);
  const [modalEditar, setModalEditar] = useState<UsuarioRow | null>(null);
  const [modalPermissoes, setModalPermissoes] = useState<UsuarioRow | null>(null);
  const [modalConvite, setModalConvite] = useState<{ link: string; email: string } | null>(null);
  const [modalPerfis, setModalPerfis] = useState(false);
  const [modalResetSenha, setModalResetSenha] = useState<UsuarioRow | null>(null);

  // Funcionários sem usuário (para vincular ao criar)
  const [funcionarios, setFuncionarios] = useState<FuncionarioOpcao[]>([]);

  // ─── Carregar dados ──────────────────────────────────────────────────────────

  const carregarUsuarios = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/admin/usuarios');
      const json = await res.json();
      if (json.success) setUsuarios(json.data || []);
      else toast.error(json.error || 'Erro ao carregar usuários');
    } catch {
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }, []);

  const carregarFuncionarios = useCallback(async () => {
    try {
      const res = await apiFetch('/admin/usuarios/funcionarios-sem-usuario');
      const json = await res.json();
      if (json.success) setFuncionarios(json.data || []);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    carregarUsuarios();
    carregarFuncionarios();
  }, [carregarUsuarios, carregarFuncionarios]);

  // ─── Filtro ──────────────────────────────────────────────────────────────────

  const filtrados = usuarios.filter(
    (u) =>
      !filtro ||
      u.nome.toLowerCase().includes(filtro.toLowerCase()) ||
      u.email.toLowerCase().includes(filtro.toLowerCase()) ||
      perfilLabel(u.perfil).toLowerCase().includes(filtro.toLowerCase()),
  );

  // ─── Ações ───────────────────────────────────────────────────────────────────

  const handleDesativar = async (u: UsuarioRow) => {
    if (!(await confirmDialog(`Desativar usuário "${u.nome}"?`))) return;
    // Remoção optimista: remove da lista imediatamente
    setUsuarios((prev) => prev.filter((x) => x.id !== u.id));
    const res = await apiFetch(`/admin/usuarios/${u.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      toast.success('Usuário desativado');
    } else {
      toast.error(json.error || 'Erro ao desativar usuário');
      carregarUsuarios(); // reverte em caso de erro
    }
  };

  const handleReenviarConvite = async (u: UsuarioRow) => {
    const res = await apiFetch(`/admin/usuarios/${u.id}/invite`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      setModalConvite({ link: json.data.inviteLink, email: u.email });
    } else {
      toast.error(json.error || 'Erro ao gerar convite');
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/configuracoes')}
              className="p-2 rounded-lg hover:bg-slate-100 transition"
            >
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Gestão de Usuários
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Cadastro, perfis, convites e permissões
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setModalPerfis(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition text-sm font-medium"
            >
              <LayoutGrid className="h-4 w-4 text-slate-500" />
              Ver Perfis
            </button>
            <button
              onClick={() => setModalCriar(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition text-sm font-medium"
            >
              <UserPlus className="h-4 w-4" />
              Novo Usuário
            </button>
          </div>
        </div>

        {/* Filtro */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar usuários..."
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : filtrados.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum usuário encontrado</p>
            </div>
          ) : (
            <table className="w-full min-w-[700px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Usuário</th>
                  <th className="px-4 py-3 text-left">Perfil</th>
                  <th className="px-4 py-3 text-left">Funcionário vinculado</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Último acesso</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map((u) => (
                  <tr
                    key={`${u.id}-${u.empresa_id}`}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs shrink-0">
                          {u.nome.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{u.nome}</p>
                          <p className="text-xs text-slate-500">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${perfilBadge(u.perfil)}`}
                      >
                        <Shield className="h-3 w-3" />
                        {perfilLabel(u.perfil)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {u.funcionario_nome ? (
                        <span className="flex items-center gap-1">
                          <Link className="h-3 w-3 text-slate-400" />
                          <FuncionarioLink
                            funcionarioId={u.funcionario_id}
                            nome={u.funcionario_nome}
                            className="hover:text-primary hover:underline"
                          />
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.convite_pendente ? (
                        <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                          <Mail className="h-3 w-3" />
                          Convite pendente
                        </span>
                      ) : u.active ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <Check className="h-3 w-3" />
                          Ativo
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                          <X className="h-3 w-3" />
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {u.last_login ? new Date(u.last_login).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* Redefinir Senha (apenas admin) */}
                        {isAdmin && (
                          <button
                            onClick={() => setModalResetSenha(u)}
                            title="Redefinir senha"
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-amber-600 transition"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                        )}
                        {/* Permissões */}
                        <button
                          onClick={() => setModalPermissoes(u)}
                          title="Permissões individuais"
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-primary transition"
                        >
                          <UserCog className="h-4 w-4" />
                        </button>
                        {/* Editar */}
                        <button
                          onClick={() => setModalEditar(u)}
                          title="Editar usuário"
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-primary transition"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {/* Reenviar convite */}
                        <button
                          onClick={() => handleReenviarConvite(u)}
                          title="Gerar / Reenviar convite"
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-amber-600 transition"
                        >
                          <SendHorizonal className="h-4 w-4" />
                        </button>
                        {/* Desativar */}
                        {u.active ? (
                          <button
                            onClick={() => handleDesativar(u)}
                            title="Desativar usuário"
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-red-600 transition"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Resumo */}
        <p className="text-xs text-slate-400">
          {filtrados.length} usuário{filtrados.length !== 1 ? 's' : ''} •{' '}
          {filtrados.filter((u) => u.active).length} ativo
          {filtrados.filter((u) => u.active).length !== 1 ? 's' : ''} •{' '}
          {filtrados.filter((u) => u.convite_pendente).length} com convite pendente
        </p>
      </div>

      {/* ─── Modal: Criar Usuário ───────────────────────────────────────────────── */}
      {modalCriar && (
        <ModalCriarUsuario
          funcionarios={funcionarios}
          isAdmin={isAdmin}
          onClose={() => setModalCriar(false)}
          onSuccess={(link, email) => {
            setModalCriar(false);
            setModalConvite({ link, email });
            carregarUsuarios();
            carregarFuncionarios();
          }}
        />
      )}

      {/* ─── Modal: Editar Usuário ──────────────────────────────────────────────── */}
      {modalEditar && (
        <ModalEditarUsuario
          usuario={modalEditar}
          funcionarios={funcionarios}
          isAdmin={isAdmin}
          onClose={() => setModalEditar(null)}
          onSuccess={(usuarioAtualizado) => {
            setUsuarios((prev) =>
              prev.map((item) =>
                item.id === usuarioAtualizado.id ? { ...item, ...usuarioAtualizado } : item,
              ),
            );
            setModalEditar(null);
            carregarUsuarios();
            carregarFuncionarios();
          }}
        />
      )}

      {/* ─── Modal: Permissões ─────────────────────────────────────────────────── */}
      {modalPermissoes && (
        <ModalPermissoes
          usuario={modalPermissoes}
          onClose={() => setModalPermissoes(null)}
          onSuccess={() => {
            setModalPermissoes(null);
            toast.success('Permissões atualizadas');
          }}
        />
      )}

      {/* ─── Modal: Link Convite ────────────────────────────────────────────────── */}
      {modalConvite && (
        <ModalLinkConvite
          link={modalConvite.link}
          email={modalConvite.email}
          onClose={() => setModalConvite(null)}
        />
      )}

      {/* ─── Modal: Perfis de Acesso ────────────────────────────────────────────── */}
      {modalPerfis && <ModalPerfis onClose={() => setModalPerfis(false)} />}

      {/* ─── Modal: Redefinir Senha ─────────────────────────────────────────────── */}
      {modalResetSenha && (
        <ModalResetSenha
          usuario={modalResetSenha}
          onClose={() => setModalResetSenha(null)}
          onSuccess={() => setModalResetSenha(null)}
        />
      )}
    </AppLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Criar Usuário
// ─────────────────────────────────────────────────────────────────────────────

function ModalCriarUsuario({
  funcionarios,
  isAdmin,
  onClose,
  onSuccess,
}: {
  funcionarios: FuncionarioOpcao[];
  isAdmin: boolean;
  onClose: () => void;
  onSuccess: (link: string, email: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [perfil, setPerfil] = useState('ALUNO');
  const [funcionarioId, setFuncionarioId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const perfisSelecionaveis = isAdmin ? PERFIS : PERFIS.filter((p) => p.value !== 'ADMINISTRADOR');

  // Auto-preencher email e nome do funcionário selecionado
  const handleFuncionarioChange = (id: string) => {
    const fid = Number(id) || null;
    setFuncionarioId(fid);
    if (fid) {
      const func = funcionarios.find((f) => f.id === fid);
      if (func) {
        if (!nome) setNome(func.nome);
        if (!email && func.email) setEmail(func.email);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch('/admin/usuarios', {
        method: 'POST',
        body: JSON.stringify({ nome, email, perfil, funcionario_id: funcionarioId }),
      });
      const json = await res.json();
      if (json.success) {
        onSuccess(json.data.inviteLink, email);
      } else {
        toast.error(json.error || 'Erro ao criar usuário');
      }
    } catch {
      toast.error('Erro ao criar usuário');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Novo Usuário
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nome completo</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              placeholder="João da Silva"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="joao@empresa.com.br"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Perfil */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Perfil de acesso
            </label>
            <select
              value={perfil}
              onChange={(e) => setPerfil(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
            >
              {perfisSelecionaveis.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              {perfil === 'ADMINISTRADOR' && 'Acesso total ao sistema.'}
              {perfil === 'GESTOR' &&
                'Acesso completo exceto configurações críticas e gestão de admins.'}
              {perfil === 'INSTRUTOR' &&
                'Pode visualizar programação e avaliar sessões de simulador.'}
              {perfil === 'ALUNO' && 'Visualiza apenas sua própria escala publicada e fichas.'}
            </p>
          </div>

          {/* Vínculo com funcionário (opcional) */}
          {(perfil === 'INSTRUTOR' || perfil === 'ALUNO') && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Vincular ao funcionário{' '}
                <span className="text-slate-400 font-normal">(opcional)</span>
              </label>
              <select
                value={funcionarioId ?? ''}
                onChange={(e) => handleFuncionarioChange(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
              >
                <option value="">— Nenhum —</option>
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                    {f.matricula ? ` (${f.matricula})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <strong>Fluxo de acesso:</strong> um link de convite será gerado. O usuário define sua
            senha ao acessar o link (válido por 48h).
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> Criando...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" /> Criar e gerar convite
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Editar Usuário
// ─────────────────────────────────────────────────────────────────────────────

function ModalEditarUsuario({
  usuario,
  funcionarios,
  isAdmin,
  onClose,
  onSuccess,
}: {
  usuario: UsuarioRow;
  funcionarios: FuncionarioOpcao[];
  isAdmin: boolean;
  onClose: () => void;
  onSuccess: (usuarioAtualizado: UsuarioAtualizado) => void;
}) {
  const [nome, setNome] = useState(usuario.nome);
  const [perfil, setPerfil] = useState(normalizePerfil(usuario.perfil) || 'ALUNO');
  const [funcionarioId, setFuncionarioId] = useState<number | null>(usuario.funcionario_id);
  const [saving, setSaving] = useState(false);

  // Incluir o funcionário atual na lista (já que pode já estar vinculado)
  const funcionariosOpcoes =
    usuario.funcionario_id && usuario.funcionario_nome
      ? [
          {
            id: usuario.funcionario_id,
            nome: usuario.funcionario_nome,
            email: null,
            matricula: null,
            cargo: null,
          },
          ...funcionarios.filter((f) => f.id !== usuario.funcionario_id),
        ]
      : funcionarios;

  const perfisSelecionaveis = isAdmin ? PERFIS : PERFIS.filter((p) => p.value !== 'ADMINISTRADOR');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch(`/admin/usuarios/${usuario.id}`, {
        method: 'PUT',
        body: JSON.stringify({ nome, perfil, funcionario_id: funcionarioId }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Usuário atualizado');
        const funcionarioSelecionado =
          funcionariosOpcoes.find((item) => item.id === funcionarioId) || null;
        onSuccess({
          ...usuario,
          nome,
          perfil,
          funcionario_id: funcionarioId,
          funcionario_nome: funcionarioSelecionado?.nome || null,
          ...(json.data || {}),
        });
      } else {
        toast.error(json.error || 'Erro ao atualizar usuário');
      }
    } catch {
      toast.error('Erro ao atualizar usuário');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Editar Usuário
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-slate-500">{usuario.email}</p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Perfil de acesso
            </label>
            <select
              value={perfil}
              onChange={(e) => setPerfil(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 bg-white"
            >
              {perfisSelecionaveis.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Funcionário vinculado <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <select
              value={funcionarioId ?? ''}
              onChange={(e) => setFuncionarioId(Number(e.target.value) || null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 bg-white"
            >
              <option value="">— Nenhum —</option>
              {funcionariosOpcoes.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                  {f.matricula ? ` (${f.matricula})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Permissões individuais (redesigned)
// ─────────────────────────────────────────────────────────────────────────────

// Module tabs definition for the left panel
const MODULOS_TABS = [
  { key: 'Funcionários', label: 'Funcionários' },
  { key: 'Qualificações', label: 'Qualificações' },
  { key: 'Simuladores', label: 'Simuladores' },
  { key: 'Escalas', label: 'Escalas' },
  { key: 'FRMS', label: 'FRMS' },
  { key: 'SGSO', label: 'SGSO' },
  { key: 'Relatórios', label: 'Relatórios' },
  { key: 'Pessoal', label: 'Acesso Pessoal' },
  { key: 'Admin', label: 'Admin' },
  { key: 'Dashboard', label: 'Dashboard' },
];

function ModalPermissoes({
  usuario,
  onClose,
  onSuccess,
}: {
  usuario: UsuarioRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { user, empresaAtualId } = useAuth();
  const [permissoes, setPermissoes] = useState<PermissaoOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(MODULOS_TABS[0].key);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch(`/admin/usuarios/${usuario.id}/permissoes`);
        const json = await res.json();
        if (json.success) {
          setPermissoes(
            (json.data || []).map((p: { permissao: string; tipo: string }) => ({
              permissao: p.permissao,
              tipo: p.tipo as 'GRANT' | 'DENY',
            })),
          );
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [usuario.id]);

  const getOverride = (perm: string): 'GRANT' | 'DENY' | null => {
    const o = permissoes.find((p) => p.permissao === perm);
    return o ? o.tipo : null;
  };

  const setOverride = (perm: string, tipo: 'GRANT' | 'DENY' | null) => {
    setPermissoes((prev) => {
      const filtered = prev.filter((p) => p.permissao !== perm);
      if (tipo) return [...filtered, { permissao: perm, tipo }];
      return filtered;
    });
  };

  const clearAll = () => setPermissoes([]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/admin/usuarios/${usuario.id}/permissoes`, {
        method: 'PUT',
        body: JSON.stringify({ permissoes }),
      });
      const json = await res.json();
      if (json.success) {
        onSuccess();
      } else {
        toast.error(json.error || 'Erro ao salvar permissões');
      }
    } catch {
      toast.error('Erro ao salvar permissões');
    } finally {
      setSaving(false);
    }
  };

  // Count overrides per module tab
  const countOverridesForTab = (tabKey: string) => {
    const grupo = PERMISSOES_DISPONIVEIS.find((g) => g.grupo === tabKey);
    if (!grupo) return 0;
    return grupo.items.filter((perm) => getOverride(perm) !== null).length;
  };

  // Items for the active tab
  const activeGrupo = PERMISSOES_DISPONIVEIS.find((g) => g.grupo === activeTab);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
              <UserCog className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Permissões individuais</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {usuario.nome}
                <span
                  className={`ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold ${perfilBadge(usuario.perfil)}`}
                >
                  <Shield className="h-2.5 w-2.5" />
                  {perfilLabel(usuario.perfil)}
                </span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Summary bar */}
        {!loading && (
          <div className="flex items-center justify-between px-6 py-2.5 bg-slate-50 border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Info className="h-3.5 w-3.5 text-slate-400" />
              {permissoes.length === 0 ? (
                <span>Nenhum override ativo — usando padrão do perfil</span>
              ) : (
                <span>
                  <strong className="text-slate-800">{permissoes.length}</strong> override
                  {permissoes.length !== 1 ? 's' : ''} ativo{permissoes.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {permissoes.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-red-500 hover:text-red-700 hover:underline font-medium transition"
              >
                Limpar todos
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 flex-1">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Left panel: module tabs */}
            <div className="w-48 shrink-0 border-r border-slate-200 overflow-y-auto bg-slate-50 py-2">
              {MODULOS_TABS.map((tab) => {
                const count = countOverridesForTab(tab.key);
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm transition rounded-none ${
                      isActive
                        ? 'bg-white text-primary font-semibold border-r-2 border-primary'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    <span className="truncate">{tab.label}</span>
                    {count > 0 && (
                      <span className="ml-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-blue-100 text-primary text-xs font-bold shrink-0">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Right panel: permissions for selected module */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {activeGrupo?.items.map((perm) => {
                const override = getOverride(perm);
                const storedPerfis = loadPerfisScoped(empresaAtualId, user?.id);
                const roleDefault = roleHasPerm(usuario.perfil, perm, storedPerfis);
                const hasOverride = override !== null;

                return (
                  <div
                    key={perm}
                    className={`rounded-xl border px-4 py-3 transition ${
                      override === 'GRANT'
                        ? 'border-emerald-200 bg-emerald-50'
                        : override === 'DENY'
                          ? 'border-red-200 bg-red-50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    {/* Linha 1 — nome + badge padrão do perfil */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-slate-800 flex-1">
                        {PERM_LABELS[perm] ?? perm}
                      </span>
                      {roleDefault ? (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-medium whitespace-nowrap">
                          <Check className="h-2.5 w-2.5" /> Liberado pelo perfil
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-medium whitespace-nowrap">
                          <X className="h-2.5 w-2.5" /> Negado pelo perfil
                        </span>
                      )}
                    </div>

                    {/* Linha 2 — código + botões de override */}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-slate-400 font-mono">{perm}</span>

                      {/* Segmented control */}
                      <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden shrink-0">
                        <button
                          onClick={() => setOverride(perm, null)}
                          className={`px-3 py-1.5 text-xs font-medium transition border-r border-slate-200 ${
                            !hasOverride
                              ? 'bg-slate-700 text-white'
                              : 'bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          Padrão
                        </button>
                        <button
                          onClick={() => setOverride(perm, override === 'GRANT' ? null : 'GRANT')}
                          className={`px-3 py-1.5 text-xs font-medium transition flex items-center gap-1 border-r border-slate-200 ${
                            override === 'GRANT'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white text-slate-500 hover:bg-emerald-50 hover:text-emerald-700'
                          }`}
                        >
                          <ShieldCheck className="h-3 w-3" />
                          Liberar
                        </button>
                        <button
                          onClick={() => setOverride(perm, override === 'DENY' ? null : 'DENY')}
                          className={`px-3 py-1.5 text-xs font-medium transition flex items-center gap-1 ${
                            override === 'DENY'
                              ? 'bg-red-600 text-white'
                              : 'bg-white text-slate-500 hover:bg-red-50 hover:text-red-700'
                          }`}
                        >
                          <ShieldX className="h-3 w-3" />
                          Bloquear
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> Salvando...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" /> Salvar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Perfis de Acesso (editable)
// ─────────────────────────────────────────────────────────────────────────────

interface PerfilEditavel {
  id?: number;
  value: string;
  label: string;
  color: string;
  headerBg: string;
  permissoes: string[] | null; // null = wildcard (all)
  is_builtin: boolean;
  dirty?: boolean;
}

const BUILTIN_COLORS: Record<string, { color: string; headerBg: string }> = {
  ADMINISTRADOR: { color: 'bg-purple-100 text-purple-800', headerBg: 'bg-purple-50' },
  GESTOR: { color: 'bg-blue-100 text-blue-800', headerBg: 'bg-blue-50' },
  INSTRUTOR: { color: 'bg-sky-100 text-sky-800', headerBg: 'bg-sky-50' },
  ALUNO: { color: 'bg-green-100 text-green-800', headerBg: 'bg-green-50' },
};

const CUSTOM_COLOR = { color: 'bg-orange-100 text-orange-800', headerBg: 'bg-orange-50' };

// Flat list of all permissions with their group label
const ALL_PERMS_FLAT: { perm: string; grupo: string }[] = PERMISSOES_DISPONIVEIS.flatMap((g) =>
  g.items.map((perm) => ({ perm, grupo: g.grupo })),
);

function buildDefaultPerfisEditaveis(): PerfilEditavel[] {
  return [
    {
      value: 'ADMINISTRADOR',
      label: 'Administrador',
      ...BUILTIN_COLORS.ADMINISTRADOR,
      permissoes: null,
      is_builtin: true,
    },
    {
      value: 'GESTOR',
      label: 'Gestor',
      ...BUILTIN_COLORS.GESTOR,
      permissoes: ROLE_DEFAULTS.GESTOR!,
      is_builtin: true,
    },
    {
      value: 'INSTRUTOR',
      label: 'Instrutor',
      ...BUILTIN_COLORS.INSTRUTOR,
      permissoes: ROLE_DEFAULTS.INSTRUTOR!,
      is_builtin: true,
    },
    {
      value: 'ALUNO',
      label: 'Aluno',
      ...BUILTIN_COLORS.ALUNO,
      permissoes: ROLE_DEFAULTS.ALUNO!,
      is_builtin: true,
    },
  ];
}

function ModalPerfis({ onClose }: { onClose: () => void }) {
  const { user, empresaAtualId } = useAuth();
  const [perfis, setPerfis] = useState<PerfilEditavel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showNovo, setShowNovo] = useState(false);
  const [novoLabel, setNovoLabel] = useState('');
  const [novoValue, setNovoValue] = useState('');
  const [activePerfilIdx, setActivePerfilIdx] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        // Try API first
        const res = await apiFetch('/admin/perfis');
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const loaded: PerfilEditavel[] = json.data.map((p: Record<string, unknown>) => {
            const colors = BUILTIN_COLORS[String(p.value).toUpperCase()] ?? CUSTOM_COLOR;
            return {
              id: p.id as number | undefined,
              value: String(p.value),
              label: String(p.label),
              color: colors.color,
              headerBg: colors.headerBg,
              permissoes: p.permissoes === null ? null : (p.permissoes as string[]),
              is_builtin: Boolean(p.is_builtin),
            };
          });
          setPerfis(loaded);
          setLoading(false);
          return;
        }
      } catch {
        /* API not available, fall through */
      }

      // Fallback: scoped localStorage
      const stored = loadPerfisScoped(empresaAtualId, user?.id);
      if (stored && stored.length > 0) {
        const loaded: PerfilEditavel[] = stored.map((p) => {
          const colors = BUILTIN_COLORS[p.value.toUpperCase()] ?? CUSTOM_COLOR;
          // Find label from defaults or use value
          const defaultPerfil = buildDefaultPerfisEditaveis().find(
            (d) => d.value.toUpperCase() === p.value.toUpperCase(),
          );
          return {
            value: p.value,
            label: defaultPerfil?.label ?? p.value,
            color: colors.color,
            headerBg: colors.headerBg,
            permissoes: p.permissoes,
            is_builtin: defaultPerfil?.is_builtin ?? false,
          };
        });
        // Ensure all builtin profiles are present
        const builtins = buildDefaultPerfisEditaveis();
        for (const b of builtins) {
          if (!loaded.find((l) => l.value === b.value)) {
            loaded.push(b);
          }
        }
        setPerfis(loaded);
      } else {
        setPerfis(buildDefaultPerfisEditaveis());
      }
      setLoading(false);
    };
    load();
  }, []);

  const togglePerm = (perfilIdx: number, perm: string) => {
    setPerfis((prev) =>
      prev.map((p, i) => {
        if (i !== perfilIdx) return p;
        if (p.permissoes === null) {
          // Wildcard: switch to explicit all-minus-this
          const all = ALL_PERMS_FLAT.map((x) => x.perm);
          return { ...p, permissoes: all.filter((x) => x !== perm), dirty: true };
        }
        const has = p.permissoes.includes(perm);
        return {
          ...p,
          permissoes: has ? p.permissoes.filter((x) => x !== perm) : [...p.permissoes, perm],
          dirty: true,
        };
      }),
    );
  };

  const setWildcard = (perfilIdx: number, on: boolean) => {
    setPerfis((prev) =>
      prev.map((p, i) => {
        if (i !== perfilIdx) return p;
        return { ...p, permissoes: on ? null : [], dirty: true };
      }),
    );
  };

  const hasPerm = (perfil: PerfilEditavel, perm: string) => {
    if (perfil.permissoes === null) return true;
    return perfil.permissoes.includes(perm);
  };

  const handleAddPerfil = () => {
    if (!novoLabel.trim()) return;
    const val =
      novoValue.trim().toUpperCase().replace(/\s+/g, '_') ||
      novoLabel.trim().toUpperCase().replace(/\s+/g, '_');
    const novo: PerfilEditavel = {
      value: val,
      label: novoLabel.trim(),
      ...CUSTOM_COLOR,
      permissoes: [],
      is_builtin: false,
      dirty: true,
    };
    setPerfis((prev) => [...prev, novo]);
    setActivePerfilIdx(perfis.length);
    setShowNovo(false);
    setNovoLabel('');
    setNovoValue('');
    setEditing(true);
  };

  const handleDeletePerfil = async (idx: number) => {
    const p = perfis[idx];
    if (p.is_builtin) return;
    if (
      !(await confirmDialog(
        `Excluir perfil "${p.label}"? Usuários com este perfil serão afetados.`,
      ))
    )
      return;
    setPerfis((prev) => prev.filter((_, i) => i !== idx));
    setActivePerfilIdx(0);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = perfis.map((p) => ({
        id: p.id,
        value: p.value,
        label: p.label,
        permissoes: p.permissoes,
        is_builtin: p.is_builtin,
      }));

      // Persist locally (always works, no backend required)
      savePerfisScoped(empresaAtualId, user?.id, payload.map((p) => ({ value: p.value, permissoes: p.permissoes })));

      // Attempt to also sync with API silently
      apiFetch('/admin/perfis', {
        method: 'PUT',
        body: JSON.stringify({ perfis: payload }),
      }).catch(() => {
        /* silent — localStorage is the source of truth */
      });

      toast.success('Perfis salvos com sucesso');
      setPerfis((prev) => prev.map((p) => ({ ...p, dirty: false })));
      setEditing(false);
    } catch {
      toast.error('Erro ao salvar perfis');
    } finally {
      setSaving(false);
    }
  };

  const activePerfil = perfis[activePerfilIdx];
  const hasDirty = perfis.some((p) => p.dirty);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
              <LayoutGrid className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Perfis de Acesso</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Defina permissões padrão por perfil e crie perfis personalizados
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
              <X className="h-5 w-5 text-slate-500" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 flex-1">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Left: profile list */}
            <div className="w-44 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
              <div className="flex-1 overflow-y-auto py-2">
                {perfis.map((p, idx) => (
                  <button
                    key={p.value + idx}
                    onClick={() => setActivePerfilIdx(idx)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition ${
                      activePerfilIdx === idx
                        ? 'bg-white text-slate-900 font-semibold border-r-2 border-primary'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${p.color.split(' ')[0]}`} />
                      <span className="truncate">{p.label}</span>
                    </div>
                    {p.dirty && (
                      <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
              {editing && (
                <div className="border-t border-slate-200 p-2">
                  {showNovo ? (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={novoLabel}
                        onChange={(e) => setNovoLabel(e.target.value)}
                        placeholder="Nome do perfil"
                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-primary/30"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddPerfil()}
                        autoFocus
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={handleAddPerfil}
                          className="flex-1 text-xs bg-primary text-white rounded px-2 py-1 hover:bg-primary/90 transition"
                        >
                          Criar
                        </button>
                        <button
                          onClick={() => {
                            setShowNovo(false);
                            setNovoLabel('');
                          }}
                          className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowNovo(true)}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-primary font-medium hover:bg-primary/5 rounded transition"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Novo perfil
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Right: permissions for selected profile */}
            {activePerfil && (
              <div className="flex-1 overflow-y-auto">
                {/* Profile header */}
                <div
                  className={`flex items-center justify-between px-5 py-3 border-b border-slate-200 ${activePerfil.headerBg}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${activePerfil.color}`}
                    >
                      <Shield className="h-3 w-3" />
                      {activePerfil.label}
                    </span>
                    {activePerfil.is_builtin && (
                      <span className="text-xs text-slate-500 italic">Perfil padrão</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {editing && (
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activePerfil.permissoes === null}
                          onChange={(e) => setWildcard(activePerfilIdx, e.target.checked)}
                          className="rounded"
                        />
                        Todas as permissões
                      </label>
                    )}
                    {editing && !activePerfil.is_builtin && (
                      <button
                        onClick={() => handleDeletePerfil(activePerfilIdx)}
                        className="p-1 rounded text-red-500 hover:bg-red-50 hover:text-red-600 transition"
                        title="Excluir perfil"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Permissions list */}
                <div className="p-4 space-y-0.5">
                  {activePerfil.permissoes === null ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center text-slate-500">
                      <ShieldCheck className="h-10 w-10 text-emerald-400 mb-2" />
                      <p className="text-sm font-medium text-slate-700">Acesso total</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Este perfil tem todas as permissões do sistema.
                      </p>
                    </div>
                  ) : (
                    (() => {
                      let lastGrupo = '';
                      return ALL_PERMS_FLAT.map(({ perm, grupo }) => {
                        const showHeader = grupo !== lastGrupo;
                        lastGrupo = grupo;
                        const granted = hasPerm(activePerfil, perm);
                        return (
                          <React.Fragment key={perm}>
                            {showHeader && (
                              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-4 pb-1 first:pt-1">
                                {grupo}
                              </div>
                            )}
                            <div
                              className={`flex items-center justify-between rounded-lg px-3 py-2.5 transition ${
                                granted ? 'bg-emerald-50' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div>
                                <p className="text-sm text-slate-800 font-medium">
                                  {PERM_LABELS[perm] ?? perm}
                                </p>
                                <p className="text-xs text-slate-400 font-mono">{perm}</p>
                              </div>
                              {editing ? (
                                <button
                                  onClick={() => togglePerm(activePerfilIdx, perm)}
                                  role="switch"
                                  aria-checked={granted}
                                  title={granted ? 'Desativar' : 'Ativar'}
                                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                                    granted ? 'bg-emerald-500' : 'bg-slate-200'
                                  }`}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                      granted ? 'translate-x-5' : 'translate-x-0.5'
                                    }`}
                                  />
                                </button>
                              ) : (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                    granted
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-slate-100 text-slate-400'
                                  }`}
                                >
                                  {granted ? (
                                    <>
                                      <Check className="h-3 w-3" />
                                      Ativo
                                    </>
                                  ) : (
                                    <>
                                      <X className="h-3 w-3" />
                                      Inativo
                                    </>
                                  )}
                                </span>
                              )}
                            </div>
                          </React.Fragment>
                        );
                      });
                    })()
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 shrink-0 bg-slate-50 rounded-b-2xl">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-slate-400" />
            {editing
              ? 'Clique nos toggles para alterar permissões. Salve para aplicar.'
              : 'Overrides individuais sobrepõem o padrão do perfil por usuário.'}
          </p>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => {
                    // Restore last saved state (localStorage or defaults)
                    const stored = loadPerfisScoped(empresaAtualId, user?.id);
                    if (stored && stored.length > 0) {
                      const restored = stored.map((p) => {
                        const colors = BUILTIN_COLORS[p.value.toUpperCase()] ?? CUSTOM_COLOR;
                        const def = buildDefaultPerfisEditaveis().find((d) => d.value === p.value);
                        return {
                          value: p.value,
                          label: def?.label ?? p.value,
                          color: colors.color,
                          headerBg: colors.headerBg,
                          permissoes: p.permissoes,
                          is_builtin: def?.is_builtin ?? false,
                        };
                      });
                      setPerfis(restored);
                    } else {
                      setPerfis(buildDefaultPerfisEditaveis());
                    }
                    setEditing(false);
                  }}
                  className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !hasDirty}
                  className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Salvando...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" /> Salvar alterações
                    </>
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition font-medium"
              >
                Fechar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Link de Convite
// ─────────────────────────────────────────────────────────────────────────────

function ModalLinkConvite({
  link,
  email,
  onClose,
}: {
  link: string;
  email: string;
  onClose: () => void;
}) {
  const handleCopy = () => {
    navigator.clipboard.writeText(link).then(() => toast.success('Link copiado!'));
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
            <Check className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Usuário criado!</h2>
            <p className="text-sm text-slate-500">Convite gerado para {email}</p>
          </div>
        </div>

        <p className="text-sm text-slate-700 mb-3">
          Compartilhe o link abaixo com o usuário para que ele defina sua senha de acesso. O link
          expira em <strong>48 horas</strong>.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={link}
            readOnly
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 bg-slate-50 focus:outline-none"
          />
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition text-sm"
          >
            <Copy className="h-4 w-4" />
            Copiar
          </button>
        </div>

        <div className="flex justify-end mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Redefinir Senha
// ─────────────────────────────────────────────────────────────────────────────

function ModalResetSenha({
  usuario,
  onClose,
  onSuccess,
}: {
  usuario: UsuarioRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [saving, setSaving] = useState(false);
  const validation = resetSenhaSchema.safeParse({ novaSenha, confirmarSenha });

  const erroConfirmacao =
    confirmarSenha && novaSenha !== confirmarSenha ? 'As senhas não coincidem' : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.success) {
      toast.error(validation.error.issues[0]?.message || 'Dados inválidos para redefinir senha');
      return;
    }
    try {
      setSaving(true);
      const res = await apiFetch(`/admin/usuarios/${usuario.id}/reset-senha`, {
        method: 'PATCH',
        body: JSON.stringify({ nova_senha: novaSenha }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Senha redefinida com sucesso');
        onSuccess();
      } else {
        toast.error(json.error || 'Erro ao redefinir senha');
      }
    } catch {
      toast.error('Erro ao redefinir senha');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-600" />
              Redefinir Senha
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {usuario.nome} · {usuario.email}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nova Senha *</label>
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              minLength={8}
              required
              autoFocus
              placeholder="Mínimo 8 caracteres"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Confirmar Nova Senha *
            </label>
            <input
              type="password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              required
              placeholder="Repita a nova senha"
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary ${erroConfirmacao ? 'border-red-400' : 'border-slate-300'}`}
            />
            {erroConfirmacao && <p className="text-xs text-red-500 mt-1">{erroConfirmacao}</p>}
          </div>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            ⚠️ O usuário precisará usar a nova senha no próximo acesso. Esta ação é registrada em
            auditoria.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !validation.success}
              className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition flex items-center gap-2"
            >
              {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              Confirmar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

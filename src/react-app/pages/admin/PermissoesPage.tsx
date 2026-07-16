import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, Save, RefreshCw } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { fetchWithAuth } from '@/react-app/config/api';
import { parseErrorPayload, parseJsonResponse } from '@/react-app/lib/parseJsonResponse';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
type Perfil = 'GESTOR' | 'INSTRUTOR' | 'ALUNO';
type Modulo = (typeof MODULOS)[number]['id'];
type Acao = (typeof ACOES)[number];

interface PermissaoRow {
  perfil: Perfil;
  modulo: Modulo;
  acao: Acao;
  permitido: 0 | 1;
}

// Chave composta para lookup rápido: "GESTOR:qualificacoes:visualizar"
type PermKey = `${Perfil}:${Modulo}:${Acao}`;

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const MODULOS = [
  { id: 'qualificacoes', label: 'Qualificações' },
  { id: 'escalas', label: 'Escalas' },
  { id: 'lms', label: 'LMS (Cursos)' },
  { id: 'certificados', label: 'Certificados' },
  { id: 'frms', label: 'FRMS' },
  { id: 'simuladores', label: 'Simuladores' },
  { id: 'funcionarios', label: 'Funcionários' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'agendamentos', label: 'Agendamentos' },
] as const;

const ACOES = ['visualizar', 'editar'] as const;

const PERFIS: { value: Perfil; label: string; color: string }[] = [
  { value: 'GESTOR', label: 'Gestor', color: 'bg-blue-100 text-blue-800' },
  { value: 'INSTRUTOR', label: 'Instrutor', color: 'bg-green-100 text-green-800' },
  { value: 'ALUNO', label: 'Aluno / Usuário', color: 'bg-gray-100 text-gray-700' },
];

// ---------------------------------------------------------------------------
// Validação runtime do payload (fronteira da API — nunca confiar em `any`)
// ---------------------------------------------------------------------------
function isPermissaoRow(value: unknown): value is PermissaoRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.perfil === 'string' &&
    typeof row.modulo === 'string' &&
    typeof row.acao === 'string' &&
    (row.permitido === 0 || row.permitido === 1)
  );
}

function isPermissoesResponse(
  data: unknown,
): data is { success: boolean; data: PermissaoRow[] } {
  if (typeof data !== 'object' || data === null) return false;
  const body = data as Record<string, unknown>;
  return (
    typeof body.success === 'boolean' &&
    Array.isArray(body.data) &&
    body.data.every(isPermissaoRow)
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function PermissoesPage() {
  const [permissoes, setPermissoes] = useState<Map<PermKey, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [abaPerfil, setAbaPerfil] = useState<Perfil>('GESTOR');

  // ─── Carregar permissões do servidor ───────────────────────────────────
  const carregarPermissoes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/admin/perfis/permissoes');
      if (!res.ok) {
        const err = await parseErrorPayload(res);
        throw new Error(err.error ?? `Erro ${res.status}`);
      }
      const json = await parseJsonResponse(res, isPermissoesResponse);
      const map = new Map<PermKey, boolean>();
      for (const p of json.data ?? []) {
        const key: PermKey = `${p.perfil}:${p.modulo}:${p.acao}`;
        map.set(key, p.permitido === 1);
      }
      setPermissoes(map);
    } catch (err) {
      toast.error('Erro ao carregar permissões', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarPermissoes();
  }, [carregarPermissoes]);

  // ─── Alternar permissão localmente ─────────────────────────────────────
  const toggle = (perfil: Perfil, modulo: Modulo, acao: Acao) => {
    const key: PermKey = `${perfil}:${modulo}:${acao}`;
    setPermissoes((prev) => {
      const next = new Map(prev);
      // Se não existe entrada, assume true como padrão (a maioria é permitida)
      const atual = prev.has(key) ? prev.get(key)! : getDefault(perfil, modulo, acao);
      next.set(key, !atual);
      return next;
    });
  };

  // Padrões razoáveis quando não há configuração salva
  function getDefault(perfil: Perfil, modulo: Modulo, acao: Acao): boolean {
    if (perfil === 'GESTOR') return true; // Gestor: tudo liberado por padrão
    if (acao === 'visualizar') return true; // Todos visualizam por padrão
    if (perfil === 'ALUNO') return false; // Aluno não edita por padrão
    return true; // Instrutor pode editar
  }

  function getPermissao(perfil: Perfil, modulo: Modulo, acao: Acao): boolean {
    const key: PermKey = `${perfil}:${modulo}:${acao}`;
    return permissoes.has(key) ? permissoes.get(key)! : getDefault(perfil, modulo, acao);
  }

  // ─── Salvar permissões ──────────────────────────────────────────────────
  const salvar = async () => {
    setSaving(true);
    try {
      const payload: { perfil: Perfil; modulo: string; acao: string; permitido: boolean }[] = [];

      for (const perfil of PERFIS.map((p) => p.value)) {
        for (const mod of MODULOS) {
          for (const acao of ACOES) {
            payload.push({
              perfil,
              modulo: mod.id,
              acao,
              permitido: getPermissao(perfil, mod.id, acao),
            });
          }
        }
      }

      const res = await fetchWithAuth('/api/admin/perfis/permissoes', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await parseErrorPayload(res);
        throw new Error(err.error ?? `Erro ${res.status}`);
      }

      toast.success('Permissões salvas com sucesso');
    } catch (err) {
      toast.error('Erro ao salvar permissões', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <ShieldCheck className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Permissões por Perfil</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Configure quais módulos cada perfil pode acessar ou editar
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={carregarPermissoes}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Recarregar
            </button>
            <button
              onClick={salvar}
              disabled={saving || loading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Salvando…' : 'Salvar Alterações'}
            </button>
          </div>
        </div>

        {/* Nota sobre ADMIN */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <strong>Nota:</strong> O perfil <strong>Administrador</strong> possui acesso total e não
          pode ser restrito. As configurações abaixo se aplicam apenas aos demais perfis.
        </div>

        {/* Abas por perfil */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50">
            {PERFIS.map((p) => (
              <button
                key={p.value}
                onClick={() => setAbaPerfil(p.value)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  abaPerfil === p.value
                    ? 'bg-white border-b-2 border-indigo-600 text-indigo-600'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Tabela de permissões */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-6 w-6 text-slate-400 animate-spin" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-5 py-3 font-medium text-slate-600 w-1/2">Módulo</th>
                  {ACOES.map((a) => (
                    <th
                      key={a}
                      className="text-center px-4 py-3 font-medium text-slate-600 capitalize"
                    >
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULOS.map((mod, i) => (
                  <tr
                    key={mod.id}
                    className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'} hover:bg-indigo-50/20 transition-colors`}
                  >
                    <td className="px-5 py-3.5 font-medium text-slate-800">{mod.label}</td>
                    {ACOES.map((acao) => {
                      const checked = getPermissao(abaPerfil, mod.id, acao);
                      return (
                        <td key={acao} className="text-center px-4 py-3.5">
                          <ToggleSwitch
                            checked={checked}
                            onChange={() => toggle(abaPerfil, mod.id, acao)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Resumo das permissões do perfil ativo */}
        <div className="text-xs text-slate-400 text-right">
          {MODULOS.reduce(
            (sum, mod) => sum + ACOES.filter((a) => getPermissao(abaPerfil, mod.id, a)).length,
            0,
          )}{' '}
          de {MODULOS.length * ACOES.length} permissões ativas para{' '}
          {PERFIS.find((p) => p.value === abaPerfil)?.label}
        </div>
      </div>
    </AppLayout>
  );
}

// ---------------------------------------------------------------------------
// Componente Toggle
// ---------------------------------------------------------------------------
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        checked ? 'bg-indigo-600' : 'bg-slate-200'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

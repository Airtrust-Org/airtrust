/**
 * Administração da Biblioteca de Guias do Instrutor de Simulador.
 *
 * Cadastro, publicação de novas versões, vínculo com modelo de sessão,
 * ativação/desativação e consulta de auditoria. Requer
 * `simuladores.guias.gerenciar` no backend (sem default de role — só
 * Platform Admin/Administrador Master ou GRANT explícito). O frontend usa
 * `useGuiasInstrutorPermissions()`, nunca texto de role/perfil.
 */

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, History, ShieldCheck, UploadCloud } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { Breadcrumbs } from '@/react-app/components/shared/Breadcrumbs';
import { PageHeader } from '@/react-app/components/UI/PageHeader';
import { Button, Card, EmptyState, Input, Select } from '@/react-app/components/UI';
import { useGuiasInstrutorPermissions } from '@/react-app/hooks/guias-instrutor/useGuiasInstrutorPermissions';
import { useTenantQueryKey } from '@/react-app/lib/useTenantQueryKey';
import { fetchWithAuth, API_BASE_URL } from '@/react-app/config/api';
import { useGuiasInstrutor, type GuiaInstrutor } from '@/react-app/lib/guias-instrutor/api';

async function postJson(path: string, body: unknown) {
  const res = await fetchWithAuth(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  if (!res.ok || !json?.success) throw new Error(json?.error || 'Falha na operação');
  return json;
}

async function putJson(path: string, body: unknown) {
  const res = await fetchWithAuth(`${API_BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  if (!res.ok || !json?.success) throw new Error(json?.error || 'Falha na operação');
  return json;
}

function useModelosAeronave() {
  return useQuery({
    queryKey: ['modelos-aeronave', 'select'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/modelos-aeronave`);
      const json = (await res.json()) as { data?: Array<{ id: number; nome: string; codigo: string }> };
      return json.data || [];
    },
  });
}

function useModelosSessao() {
  return useQuery({
    queryKey: ['modelos-sessao', 'select'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/simuladores/modelos-sessao`);
      const json = (await res.json()) as { data?: Array<{ id: number; nome: string; codigo: string }> };
      return json.data || [];
    },
  });
}

function NovoGuiaForm({ onCriado }: { onCriado: () => void }) {
  const { data: aeronaves } = useModelosAeronave();
  const [form, setForm] = useState({
    modelo_aeronave_id: '',
    programa: 'INICIAL',
    ciclo: '',
    sessao_numero: '',
    sessao_total: '',
    codigo: '',
    titulo: '',
    versao: '1.0',
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await postJson('/simuladores/guias-instrutor', {
        modelo_aeronave_id: Number(form.modelo_aeronave_id),
        programa: form.programa,
        ciclo: form.ciclo ? Number(form.ciclo) : null,
        sessao_numero: form.sessao_numero ? Number(form.sessao_numero) : null,
        sessao_total: form.sessao_total ? Number(form.sessao_total) : null,
        codigo: form.codigo,
        titulo: form.titulo,
        versao: form.versao,
      });
      onCriado();
      setForm((f) => ({ ...f, codigo: '', titulo: '' }));
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar guia');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold mb-3">Cadastrar novo guia (rascunho)</h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Select
          value={form.modelo_aeronave_id}
          onChange={(e) => setForm((f) => ({ ...f, modelo_aeronave_id: e.target.value }))}
          required
          placeholder="Aeronave…"
          options={(aeronaves || []).map((a) => ({ value: String(a.id), label: a.nome }))}
        />
        <Select
          value={form.programa}
          onChange={(e) => setForm((f) => ({ ...f, programa: e.target.value }))}
          options={[
            { value: 'INICIAL', label: 'Inicial' },
            { value: 'PERIODICO', label: 'Periódico' },
            { value: 'SEMESTRAL', label: 'Semestral' },
            { value: 'CHECK', label: 'Check' },
          ]}
        />
        <Input
          placeholder="Código oficial (ex: A139-P-02/04-C1)"
          value={form.codigo}
          onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
          required
        />
        <Input
          placeholder="Ciclo"
          type="number"
          value={form.ciclo}
          onChange={(e) => setForm((f) => ({ ...f, ciclo: e.target.value }))}
        />
        <Input
          placeholder="Sessão nº"
          type="number"
          value={form.sessao_numero}
          onChange={(e) => setForm((f) => ({ ...f, sessao_numero: e.target.value }))}
        />
        <Input
          placeholder="Sessão total"
          type="number"
          value={form.sessao_total}
          onChange={(e) => setForm((f) => ({ ...f, sessao_total: e.target.value }))}
        />
        <Input
          placeholder="Título amigável"
          className="sm:col-span-2"
          value={form.titulo}
          onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
          required
        />
        <Input
          placeholder="Versão (ex: 1.0)"
          value={form.versao}
          onChange={(e) => setForm((f) => ({ ...f, versao: e.target.value }))}
          required
        />
        <div className="sm:col-span-3 flex items-center gap-3">
          <Button type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Criar rascunho'}
          </Button>
          {erro && <span className="text-xs text-red-600">{erro}</span>}
        </div>
      </form>
    </Card>
  );
}

function LinhaGuia({ guia, onMudou }: { guia: GuiaInstrutor & { id: number }; onMudou: () => void }) {
  const { data: modelosSessao } = useModelosSessao();
  const [expandido, setExpandido] = useState(false);
  const [modeloSessaoId, setModeloSessaoId] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [novaVersao, setNovaVersao] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [auditoria, setAuditoria] = useState<Array<{ acao: string; created_at: string }> | null>(null);

  async function vincularModeloSessao() {
    if (!modeloSessaoId) return;
    setProcessando(true);
    try {
      await putJson(`/simuladores/guias-instrutor/${guia.id}`, {
        modelo_sessao_id: Number(modeloSessaoId),
        principal: 1,
      });
      setMensagem('Vínculo salvo.');
      onMudou();
    } catch (err) {
      setMensagem(err instanceof Error ? err.message : 'Erro ao vincular');
    } finally {
      setProcessando(false);
    }
  }

  async function enviarNovaVersao() {
    if (!pdfFile || !novaVersao) {
      setMensagem('PDF e versão são obrigatórios.');
      return;
    }
    setProcessando(true);
    setMensagem(null);
    try {
      const fd = new FormData();
      fd.append('versao', novaVersao);
      fd.append('pdf', pdfFile);
      if (htmlFile) fd.append('html', htmlFile);
      const res = await fetchWithAuth(`${API_BASE_URL}/simuladores/guias-instrutor/${guia.id}/versoes`, {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string; data?: { id: number } };
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Falha no upload');
      setMensagem(`Versão criada (id ${json.data?.id}). Ative-a quando validada.`);
      onMudou();
    } catch (err) {
      setMensagem(err instanceof Error ? err.message : 'Erro no upload');
    } finally {
      setProcessando(false);
    }
  }

  async function ativar() {
    setProcessando(true);
    try {
      await postJson(`/simuladores/guias-instrutor/${guia.id}/ativar`, {});
      setMensagem('Versão ativada.');
      onMudou();
    } catch (err) {
      setMensagem(err instanceof Error ? err.message : 'Erro ao ativar');
    } finally {
      setProcessando(false);
    }
  }

  async function desativar() {
    setProcessando(true);
    try {
      await postJson(`/simuladores/guias-instrutor/${guia.id}/desativar`, {});
      setMensagem('Versão desativada.');
      onMudou();
    } catch (err) {
      setMensagem(err instanceof Error ? err.message : 'Erro ao desativar');
    } finally {
      setProcessando(false);
    }
  }

  async function carregarAuditoria() {
    const res = await fetchWithAuth(`${API_BASE_URL}/simuladores/guias-instrutor/${guia.id}/auditoria`);
    const json = (await res.json()) as { data?: Array<{ acao: string; created_at: string }> };
    setAuditoria(json.data || []);
  }

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setExpandido((v) => !v)}
          className="text-left flex-1 min-w-[240px]"
        >
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{guia.titulo}</p>
          <p className="text-xs font-mono text-slate-500">{guia.codigo} · v{guia.versao}</p>
        </button>
        <span
          className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
            guia.status === 'ATIVO'
              ? 'bg-emerald-100 text-emerald-700'
              : guia.status === 'SUBSTITUIDO'
                ? 'bg-slate-200 text-slate-600'
                : guia.status === 'INATIVO'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
          }`}
        >
          {guia.status}
        </span>
        <span className="text-[11px] text-slate-500">HTML: {guia.html_status_validacao}</span>
        <span className="text-[11px] text-slate-500">PDF: {guia.pdf_disponivel ? 'sim' : 'não'}</span>
        {guia.status !== 'ATIVO' && guia.status !== 'SUBSTITUIDO' && (
          <Button size="sm" variant="secondary" disabled={processando} onClick={ativar}>
            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Ativar
          </Button>
        )}
        {guia.status === 'ATIVO' && (
          <Button size="sm" variant="danger" disabled={processando} onClick={desativar}>
            Desativar
          </Button>
        )}
      </div>

      {expandido && (
        <div className="mt-3 pl-1 space-y-4">
          {(guia.status === 'RASCUNHO' || guia.status === 'VALIDACAO') && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end bg-slate-50 dark:bg-slate-900 p-3 rounded">
              <Input
                placeholder="Nova versão (ex: 1.1)"
                value={novaVersao}
                onChange={(e) => setNovaVersao(e.target.value)}
              />
              <label className="text-xs">
                PDF
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  className="block text-xs mt-1"
                />
              </label>
              <label className="text-xs">
                HTML (opcional)
                <input
                  type="file"
                  accept="text/html"
                  onChange={(e) => setHtmlFile(e.target.files?.[0] || null)}
                  className="block text-xs mt-1"
                />
              </label>
              <Button size="sm" disabled={processando} onClick={enviarNovaVersao}>
                <UploadCloud className="w-3.5 h-3.5 mr-1" /> Enviar
              </Button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <Select
              value={modeloSessaoId}
              onChange={(e) => setModeloSessaoId(e.target.value)}
              className="max-w-xs"
              placeholder="Vincular a modelo de sessão…"
              options={(modelosSessao || []).map((m) => ({
                value: String(m.id),
                label: `${m.nome} (${m.codigo})`,
              }))}
            />
            <Button size="sm" variant="secondary" disabled={processando} onClick={vincularModeloSessao}>
              Salvar vínculo
            </Button>
          </div>

          <Button size="sm" variant="ghost" onClick={carregarAuditoria}>
            <History className="w-3.5 h-3.5 mr-1" /> Ver auditoria
          </Button>
          {auditoria && (
            <ul className="text-xs text-slate-500 space-y-1">
              {auditoria.map((a, i) => (
                <li key={i}>
                  {new Date(a.created_at).toLocaleString('pt-BR')} — {a.acao}
                </li>
              ))}
            </ul>
          )}

          {mensagem && <p className="text-xs text-slate-600 dark:text-slate-300">{mensagem}</p>}
        </div>
      )}
    </div>
  );
}

export default function GuiasInstrutorAdmin() {
  const { podeGerenciar, isLoading: permissoesCarregando } = useGuiasInstrutorPermissions();
  const { tenantKey } = useTenantQueryKey();
  const queryClient = useQueryClient();
  const [statusFiltro, setStatusFiltro] = useState('');

  const { data, isLoading, refetch } = useGuiasInstrutor({});
  const [todosStatus, setTodosStatus] = useState<GuiaInstrutor[] | null>(null);

  async function carregarTodos() {
    const params = new URLSearchParams({ admin: '1' });
    if (statusFiltro) params.set('status', statusFiltro);
    const res = await fetchWithAuth(`${API_BASE_URL}/simuladores/guias-instrutor?${params.toString()}`);
    const json = (await res.json()) as { data?: GuiaInstrutor[] };
    setTodosStatus(json.data || []);
  }

  useEffect(() => {
    carregarTodos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refrescar() {
    queryClient.invalidateQueries({ queryKey: tenantKey('guias-instrutor') });
    carregarTodos();
    refetch();
  }

  if (permissoesCarregando) {
    return (
      <AppLayout>
        <div className="px-4 sm:px-6 py-6 space-y-3">
          <div className="h-6 w-64 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-40 rounded-lg bg-slate-100 dark:bg-slate-800/60 animate-pulse" />
        </div>
      </AppLayout>
    );
  }

  if (!podeGerenciar) {
    return (
      <AppLayout>
        <EmptyState
          icon={<AlertTriangle className="w-10 h-10 text-amber-500" />}
          title="Acesso restrito"
          description="Esta área é exclusiva para gestores/administradores autorizados."
        />
      </AppLayout>
    );
  }

  const lista = todosStatus ?? data ?? [];

  return (
    <AppLayout>
      <div className="px-4 sm:px-6 pt-4">
        <Breadcrumbs />
      </div>
      <PageHeader
        title="Guias do Instrutor — Administração"
        description="Cadastro, versionamento, vínculo com modelos de sessão e auditoria."
      />
      <div className="px-4 sm:px-6 pb-10 space-y-6">
        <NovoGuiaForm onCriado={refrescar} />

        <div className="flex items-center gap-3">
          <Select
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
            className="max-w-xs"
            placeholder="Todos os status"
            options={[
              { value: 'RASCUNHO', label: 'Rascunho' },
              { value: 'VALIDACAO', label: 'Validação' },
              { value: 'ATIVO', label: 'Ativo' },
              { value: 'INATIVO', label: 'Inativo' },
              { value: 'SUBSTITUIDO', label: 'Substituído' },
            ]}
          />
          <Button size="sm" variant="secondary" onClick={carregarTodos}>
            Filtrar
          </Button>
        </div>

        <Card className="p-4">
          {isLoading && !todosStatus ? (
            <p className="text-sm text-slate-500">Carregando…</p>
          ) : lista.length === 0 ? (
            <EmptyState icon={<AlertTriangle className="w-8 h-8" />} title="Nenhum guia cadastrado" />
          ) : (
            <div>
              {lista.map((g) => (
                <LinhaGuia key={g.id} guia={g} onMudou={refrescar} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}

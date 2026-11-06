import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/AppLayout';
import PageHeader from '../../components/PageHeader';
import { useSgsoApi } from './useSgsoApi';

type Config = { configured: boolean; base_url?: string; enabled: boolean; token_configured: boolean; updated_at?: string };

export default function SgsoHfaIntegrationPage() {
  const navigate = useNavigate();
  const apiCall = useSgsoApi();
  const [config, setConfig] = useState<Config | null>(null);
  const [baseUrl, setBaseUrl] = useState('https://systemhfa-systemhfa.vercel.app');
  const [token, setToken] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await apiCall('/sgso/hfa/config');
    if (result.success) {
      setConfig(result.data);
      if (result.data?.base_url) setBaseUrl(result.data.base_url);
      setAtivo(result.data?.enabled !== false);
    } else setMessage(result.error ?? 'Não foi possível carregar a integração HFA.');
  }, [apiCall]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true); setMessage(null);
    try {
      const result = await apiCall('/sgso/hfa/config', {
        method: 'PUT',
        body: JSON.stringify({ base_url: baseUrl.trim(), api_token: token.trim() || undefined, enabled: ativo }),
      });
      if (!result.success) throw new Error(result.error ?? 'Falha ao salvar configuração.');
      setToken('');
      setMessage('Integração HFA salva. O token permanece criptografado e não é exibido novamente.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao salvar configuração.');
    } finally { setSaving(false); }
  }

  return (
    <AppLayout>
      <PageHeader title="Integração HFA" subtitle="Conecte o SGSO do AirTrust ao HFA sem iniciar análises automaticamente." actions={
        <button onClick={() => navigate('/sgso')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">Voltar ao SGSO</button>
      } />
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          O envio de RELPREV ao HFA é sempre manual. Sincronizar registra o evento no HFA com zero créditos consumidos; a análise de fatores humanos só começa depois de uma decisão explícita no HFA.
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <label className="block"><span className="text-sm font-medium text-slate-700">URL do HFA</span>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block"><span className="text-sm font-medium text-slate-700">Token de integração</span>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={config?.token_configured ? 'Deixe em branco para manter o token atual' : 'Cole o token gerado no HFA'} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <span className="mt-1 block text-xs text-slate-500">O token é criptografado antes de ser armazenado no AirTrust.</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Integração ativa</label>
          <div className="flex justify-end"><button disabled={saving || !baseUrl.trim() || (!config?.token_configured && !token.trim())} onClick={() => void save()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar integração'}</button></div>
        </div>
        {config?.configured && <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Status: <strong>{config.enabled ? 'Ativa' : 'Desativada'}</strong> · token {config.token_configured ? 'configurado' : 'ausente'}{config.updated_at ? ` · atualização ${new Date(config.updated_at).toLocaleString('pt-BR')}` : ''}</div>}
        {message && <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</div>}
      </div>
    </AppLayout>
  );
}

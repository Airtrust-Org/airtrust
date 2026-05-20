import { useState } from 'react';
import { ArrowLeft, KeyRound, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import api from '../services/api';

interface ChangePasswordResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export default function TrocarSenhaPage() {
  const navigate = useNavigate();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [salvando, setSalvando] = useState(false);

  const podeSalvar =
    senhaAtual.trim().length > 0 &&
    novaSenha.trim().length >= 8 &&
    confirmarSenha.trim().length >= 8 &&
    !salvando;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (novaSenha !== confirmarSenha) {
      toast.error('A confirmação da nova senha não confere.');
      return;
    }

    setSalvando(true);
    try {
      const response = await api.post<ChangePasswordResponse>('/auth/change-password', {
        senhaAtual,
        novaSenha,
        confirmarSenha,
      });
      const payload = response.data as ChangePasswordResponse | undefined;

      if (response.success && payload?.success) {
        toast.success(payload.message || 'Senha alterada com sucesso.');
        setSenhaAtual('');
        setNovaSenha('');
        setConfirmarSenha('');
        navigate('/home');
        return;
      }

      toast.error(payload?.error || response.error || 'Não foi possível alterar a senha.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar a senha.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="Trocar Senha" className="mb-0" />

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Atualize sua credencial</h2>
              <p className="mt-1 text-sm text-slate-600">
                Informe a senha atual e defina uma nova senha com pelo menos 8 caracteres.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Senha atual</label>
              <input
                type="password"
                value={senhaAtual}
                onChange={(event) => setSenhaAtual(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                autoComplete="current-password"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Nova senha</label>
              <input
                type="password"
                value={novaSenha}
                onChange={(event) => setNovaSenha(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Confirmar nova senha
              </label>
              <input
                type="password"
                value={confirmarSenha}
                onChange={(event) => setConfirmarSenha(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                autoComplete="new-password"
              />
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={() => navigate('/home')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </button>

              <button
                type="submit"
                disabled={!podeSalvar}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {salvando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                {salvando ? 'Salvando...' : 'Atualizar senha'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}

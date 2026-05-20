import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '@/react-app/config/api';
import { useSystemSettings } from '@/react-app/hooks/useSystemSettings';
import { useLanguage } from '@/react-app/i18n/useLanguage';

interface InviteData {
  email: string;
  nome: string;
  empresaNome: string;
  expiresAt: string;
}

export default function AceitarConvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => params.get('token') || '', [params]);
  const { logoSrc, settings } = useSystemSettings();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const validateInvite = async () => {
      if (!token) {
        setError(t('invite.error.missingToken'));
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `${API_BASE_URL}/auth/invite/validate?token=${encodeURIComponent(token)}`,
        );
        const json = await res.json();

        if (!res.ok || !json?.success) {
          setError(json?.error || t('invite.error.invalidOrExpired'));
          return;
        }

        setInviteData(json.data);
      } catch {
        setError(t('invite.error.validationFailed'));
      } finally {
        setLoading(false);
      }
    };

    validateInvite();
  }, [t, token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (senha.length < 8) {
      setError(t('invite.error.minPassword'));
      return;
    }

    if (senha !== confirmarSenha) {
      setError(t('invite.error.passwordMismatch'));
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE_URL}/auth/invite/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, senha }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        setError(json?.error || t('invite.error.acceptFailed'));
        return;
      }

      setSuccess(t('invite.success.passwordCreated'));
      setTimeout(() => navigate('/login'), 1200);
    } catch {
      setError(t('invite.error.acceptGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="flex justify-center mb-6">
          <img src={logoSrc} alt={settings.appName || 'AirTrust'} className="h-10 object-contain" />
        </div>

        <h1 className="text-xl font-semibold text-slate-900 text-center">
          {t('invite.createPassword.title')}
        </h1>

        {loading ? (
          <p className="text-sm text-slate-500 text-center mt-4">
            {t('invite.createPassword.validating')}
          </p>
        ) : (
          <>
            {inviteData && (
              <p className="text-sm text-slate-600 text-center mt-3">
                {t('invite.createPassword.inviteFor')} <strong>{inviteData.email}</strong> em{' '}
                <strong>{inviteData.empresaNome}</strong>
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 mt-6">
              <div>
                <label className="block text-sm text-slate-700 mb-1">
                  {t('invite.createPassword.newPassword')}
                </label>
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary/30"
                  placeholder={t('invite.createPassword.placeholder.password')}
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-slate-700 mb-1">
                  {t('invite.createPassword.confirmPassword')}
                </label>
                <input
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary/30"
                  placeholder={t('invite.createPassword.placeholder.confirm')}
                  required
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
              {success && <p className="text-sm text-green-600">{success}</p>}

              <button
                type="submit"
                disabled={submitting || !!success || !inviteData}
                className="w-full bg-primary hover:bg-primary/90 text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
              >
                {submitting
                  ? t('invite.createPassword.submitting')
                  : t('invite.createPassword.submit')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

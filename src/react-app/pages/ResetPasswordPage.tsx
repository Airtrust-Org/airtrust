import { FormEvent, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, LockKeyhole } from 'lucide-react';
import { API_BASE_URL } from '@/react-app/config/api';
import { controlledFetch } from '@/react-app/utils/request-control';

export default function ResetPasswordPage() {
  const token = useMemo(
    () => new URLSearchParams(window.location.search).get('token')?.trim() ?? '',
    [],
  );
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError('Este link de recuperação é inválido. Solicite um novo link.');
      return;
    }
    if (password.length < 8) {
      setError('A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('As senhas informadas não conferem.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await controlledFetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, password }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        code?: string;
      };

      if (!response.ok || payload.success === false) {
        const expiredOrInvalid =
          response.status === 400 || response.status === 401 || response.status === 404;
        setError(
          expiredOrInvalid
            ? 'Este link expirou ou já foi utilizado. Solicite um novo link de recuperação.'
            : 'Não foi possível redefinir a senha agora. Tente novamente em instantes.',
        );
        return;
      }

      setCompleted(true);
      setPassword('');
      setConfirmation('');
    } catch {
      setError('Não foi possível redefinir a senha agora. Tente novamente em instantes.');
    } finally {
      setSubmitting(false);
    }
  }

  if (completed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--at-bg-app)] p-4 text-[var(--at-text-primary)]">
        <section className="w-full max-w-md rounded-2xl border border-[var(--at-border)] bg-[var(--at-bg-surface)] p-6 shadow-sm">
          <CheckCircle2 className="mb-4 h-9 w-9 text-[var(--at-success)]" aria-hidden="true" />
          <h1 className="text-xl font-semibold">Senha redefinida</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--at-text-secondary)]">
            Sua nova senha foi registrada. Você já pode entrar novamente no AirTrust.
          </p>
          <a
            href="/login"
            className="mt-6 inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--at-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--at-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--at-focus)]"
          >
            Ir para o login
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--at-bg-app)] p-4 text-[var(--at-text-primary)]">
      <section className="w-full max-w-md rounded-2xl border border-[var(--at-border)] bg-[var(--at-bg-surface)] p-6 shadow-sm">
        <a
          href="/login"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--at-text-secondary)] hover:text-[var(--at-accent)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar ao login
        </a>

        <h1 className="text-xl font-semibold">Definir nova senha</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--at-text-secondary)]">
          Escolha uma nova senha com pelo menos 8 caracteres.
        </p>

        {!token && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-[color-mix(in_srgb,var(--at-critical)_35%,transparent)] bg-[var(--at-critical-soft)] px-3 py-2 text-sm text-[var(--at-critical)]"
          >
            Link de recuperação inválido. Solicite um novo link antes de continuar.
          </div>
        )}

        {error && token && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-[color-mix(in_srgb,var(--at-critical)_35%,transparent)] bg-[var(--at-critical-soft)] px-3 py-2 text-sm text-[var(--at-critical)]"
          >
            {error}
          </div>
        )}

        {token ? (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Nova senha</span>
              <span className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--at-border-strong)] bg-[var(--at-bg-field)] px-3 focus-within:ring-2 focus-within:ring-[var(--at-focus)]">
                <LockKeyhole className="h-4 w-4 text-[var(--at-text-subtle)]" aria-hidden="true" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={submitting}
                  className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-[var(--at-text-primary)] outline-none"
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Confirmar nova senha</span>
              <span className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--at-border-strong)] bg-[var(--at-bg-field)] px-3 focus-within:ring-2 focus-within:ring-[var(--at-focus)]">
                <LockKeyhole className="h-4 w-4 text-[var(--at-text-subtle)]" aria-hidden="true" />
                <input
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={submitting}
                  className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-[var(--at-text-primary)] outline-none"
                />
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[var(--at-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--at-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--at-focus)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Salvando…' : 'Redefinir senha'}
            </button>
          </form>
        ) : (
          <a
            href="/forgot-password"
            className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--at-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--at-accent-hover)]"
          >
            Solicitar novo link
          </a>
        )}
      </section>
    </main>
  );
}

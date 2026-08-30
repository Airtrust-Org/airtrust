import { FormEvent, useState } from 'react';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { API_BASE_URL } from '@/react-app/config/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!response.ok) {
        throw new Error('PASSWORD_RECOVERY_REQUEST_FAILED');
      }

      // The backend deliberately returns the same success response whether or
      // not the account exists, preventing user enumeration.
      setSubmitted(true);
    } catch {
      setError('Não foi possível solicitar a recuperação agora. Tente novamente em instantes.');
    } finally {
      setSubmitting(false);
    }
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

        {submitted ? (
          <div role="status" aria-live="polite">
            <CheckCircle2 className="mb-4 h-9 w-9 text-[var(--at-success)]" aria-hidden="true" />
            <h1 className="text-xl font-semibold">Confira seu e-mail</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--at-text-secondary)]">
              Se houver uma conta ativa para o endereço informado, enviaremos as instruções para
              redefinir a senha. Por segurança, não confirmamos se o e-mail está cadastrado.
            </p>
            <a
              href="/login"
              className="mt-6 inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--at-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--at-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--at-focus)]"
            >
              Voltar ao login
            </a>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Recuperar senha</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--at-text-secondary)]">
              Informe o e-mail usado no AirTrust. Se a conta estiver ativa, enviaremos um link de
              recuperação.
            </p>

            {error && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-[color-mix(in_srgb,var(--at-critical)_35%,transparent)] bg-[var(--at-critical-soft)] px-3 py-2 text-sm text-[var(--at-critical)]"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">E-mail</span>
                <span className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--at-border-strong)] bg-[var(--at-bg-field)] px-3 focus-within:ring-2 focus-within:ring-[var(--at-focus)]">
                  <Mail className="h-4 w-4 text-[var(--at-text-subtle)]" aria-hidden="true" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                    disabled={submitting}
                    className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-[var(--at-text-primary)] outline-none placeholder:text-[var(--at-text-subtle)]"
                    placeholder="seu@email.com"
                  />
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[var(--at-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--at-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--at-focus)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Enviando…' : 'Enviar instruções'}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

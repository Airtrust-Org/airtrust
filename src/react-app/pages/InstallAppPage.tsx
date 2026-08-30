import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Home,
  MoreVertical,
  Share2,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { detectInstallEnvironment, isStandaloneMode } from '../utils/installApp';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#12356A] text-sm font-bold text-white">
        {number}
      </span>
      <span className="pt-0.5 text-sm leading-6 text-slate-700">{children}</span>
    </li>
  );
}

function InstalledState() {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
      <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" aria-hidden="true" />
      <h2 className="mt-3 text-lg font-bold text-slate-900">AirTrust já está instalado</h2>
      <p className="mt-1 text-sm text-slate-600">
        Você pode abrir o AirTrust pelo ícone na tela inicial do seu aparelho.
      </p>
      <a
        href="/"
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#12356A] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#0A1D40] focus:outline-none focus:ring-2 focus:ring-[#32C3E6] focus:ring-offset-2"
      >
        <Home className="h-4 w-4" aria-hidden="true" />
        Entrar no AirTrust
      </a>
    </div>
  );
}

export default function InstallAppPage() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() =>
    typeof window !== 'undefined' ? isStandaloneMode() : false,
  );
  const [showManualAndroid, setShowManualAndroid] = useState(false);
  const [copied, setCopied] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);

  const environment = useMemo(() => {
    if (typeof navigator === 'undefined') {
      return detectInstallEnvironment('', '', false);
    }
    return detectInstallEnvironment(navigator.userAgent, navigator.vendor, installed);
  }, [installed]);

  const installUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/instalar';
    return `${window.location.origin}/instalar`;
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallDismissed(false);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const copyInstallLink = async () => {
    try {
      await navigator.clipboard.writeText(installUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = installUrl;
      textArea.setAttribute('readonly', '');
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }
  };

  const shareInstallLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Instalar AirTrust',
          text: 'Instale o AirTrust no seu celular para acessar como um aplicativo.',
          url: installUrl,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    await copyInstallLink();
  };

  const requestInstall = async () => {
    if (!installPrompt) {
      setShowManualAndroid(true);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === 'dismissed') {
      setInstallDismissed(true);
      setShowManualAndroid(true);
    }
  };

  const isInstalled = installed || environment.platform === 'installed';
  const canPromptInstall = installPrompt !== null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#F3F7FB] via-white to-[#EEF7F6] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <header className="text-center">
          <img
            src="/airtrust-pwa-icon-20260830-192.png"
            alt="AirTrust"
            className="mx-auto h-24 w-24 object-contain drop-shadow-lg"
          />
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-[#12356A]">
            AirTrust
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            AirTrust no seu celular
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base leading-7 text-slate-600">
            Crie o ícone do AirTrust na tela inicial e acesse o sistema como um aplicativo.
          </p>
        </header>

        <section className="mt-7 rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/50 sm:p-7">
          {isInstalled ? (
            <InstalledState />
          ) : environment.isIos ? (
            <div>
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-slate-100 p-2.5 text-[#12356A]">
                  <Smartphone className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-950">Instalar no iPhone</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    No iPhone, a Apple exige que a inclusão na Tela de Início seja confirmada pelo usuário.
                  </p>
                </div>
              </div>

              {environment.isInAppBrowser && (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex gap-3">
                    <ExternalLink className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
                    <div>
                      <p className="font-semibold text-amber-950">Você abriu pelo WhatsApp.</p>
                      <p className="mt-1 text-sm leading-6 text-amber-900">
                        Use o menu desta tela e escolha <strong>Abrir no Safari</strong>. Depois siga os passos abaixo.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!environment.isSafari && !environment.isInAppBrowser && (
                <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
                  Para o fluxo mais simples no iPhone, abra esta página no <strong>Safari</strong>.
                </div>
              )}

              <ol className="mt-6 space-y-4">
                <Step number={1}>
                  No Safari, toque no botão <strong>Compartilhar</strong>{' '}
                  <Share2 className="inline h-4 w-4 align-[-2px]" aria-hidden="true" />.
                </Step>
                <Step number={2}>
                  Role as opções e toque em <strong>Adicionar à Tela de Início</strong>.
                </Step>
                <Step number={3}>
                  Deixe <strong>Abrir como App da Web</strong> ativado e toque em <strong>Adicionar</strong>.
                </Step>
              </ol>

              <button
                type="button"
                onClick={shareInstallLink}
                className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#32C3E6] focus:ring-offset-2"
              >
                <Share2 className="h-4 w-4" aria-hidden="true" />
                Compartilhar este link
              </button>
            </div>
          ) : environment.isAndroid ? (
            <div>
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
                  <Download className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-950">Instalar no Android</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    O AirTrust será adicionado à tela inicial e abrirá em uma janela própria.
                  </p>
                </div>
              </div>

              {environment.isInAppBrowser && (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="font-semibold text-amber-950">Abra no Chrome para instalar.</p>
                  <p className="mt-1 text-sm leading-6 text-amber-900">
                    No menu{' '}
                    <MoreVertical className="inline h-4 w-4 align-[-2px]" aria-hidden="true" />, escolha{' '}
                    <strong>Abrir no Chrome</strong> e volte a tocar em Instalar AirTrust.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={requestInstall}
                disabled={environment.isInAppBrowser}
                className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#12356A] px-4 py-3 text-base font-bold text-white shadow-md transition hover:bg-[#0A1D40] focus:outline-none focus:ring-2 focus:ring-[#32C3E6] focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Download className="h-5 w-5" aria-hidden="true" />
                Instalar AirTrust
              </button>

              {(showManualAndroid || !canPromptInstall || installDismissed) && !environment.isInAppBrowser && (
                <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    Se a janela de instalação não aparecer:
                  </p>
                  <ol className="mt-3 space-y-3">
                    <Step number={1}>
                      Toque no menu{' '}
                      <MoreVertical className="inline h-4 w-4 align-[-2px]" aria-hidden="true" /> do navegador.
                    </Step>
                    <Step number={2}>
                      Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
                    </Step>
                    <Step number={3}>Confirme a instalação do AirTrust.</Step>
                  </ol>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-sky-50 p-2.5 text-sky-700">
                  <Smartphone className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-950">
                    {canPromptInstall ? 'Instalar AirTrust' : 'Abra este link no celular'}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {canPromptInstall
                      ? 'Este navegador permite instalar o AirTrust como aplicativo.'
                      : 'Envie ou copie este endereço e abra pelo iPhone ou Android.'}
                  </p>
                </div>
              </div>

              {canPromptInstall && (
                <button
                  type="button"
                  onClick={requestInstall}
                  className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#12356A] px-4 py-3 text-base font-bold text-white transition hover:bg-[#0A1D40] focus:outline-none focus:ring-2 focus:ring-[#32C3E6] focus:ring-offset-2"
                >
                  <Download className="h-5 w-5" aria-hidden="true" />
                  Instalar AirTrust
                </button>
              )}

              <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 pl-3">
                <span className="min-w-0 flex-1 truncate text-sm text-slate-600">{installUrl}</span>
                <button
                  type="button"
                  onClick={copyInstallLink}
                  className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>

              <button
                type="button"
                onClick={shareInstallLink}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
              >
                <Share2 className="h-4 w-4" aria-hidden="true" />
                Compartilhar link de instalação
              </button>
            </div>
          )}
        </section>

        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-4 backdrop-blur">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#12356A]" aria-hidden="true" />
          <p className="text-xs leading-5 text-slate-600">
            Instalação oficial do AirTrust. Não é necessário baixar APK, arquivo de configuração ou aplicativo de terceiros.
          </p>
        </div>

        <div className="mt-4 text-center">
          <a href="/login" className="text-sm font-semibold text-[#12356A] hover:underline">
            Já usa o AirTrust? Entrar no sistema
          </a>
        </div>
      </div>
    </main>
  );
}

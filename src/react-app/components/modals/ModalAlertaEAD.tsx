import { useState } from 'react';
import { BellRing, Mail, MessageSquare, RefreshCw, Send } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/react-app/utils/toast';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

type AlertaCanal = {
  tipo: 'email' | 'whatsapp';
  destino: string;
  status: 'enviado' | 'erro';
  mensagem?: string;
  erro?: string;
  provider?: string;
  providerStatus?: string;
  providerMessageId?: string;
  deliveryStatusPath?: string;
  manualFallbackUrl?: string;
};

type TwilioDeliveryStatus = {
  sid: string;
  status?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  diagnosis?: string | null;
};

type CanalResumo = {
  canal: 'email' | 'whatsapp';
  status: 'enviado' | 'erro';
  detalhe: string;
};

const TERMINAL_WHATSAPP_STATUSES = new Set(['delivered', 'read', 'failed', 'undelivered']);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollTwilioDeliveryStatus(
  deliveryStatusPath: string,
  attempts: number = 4,
  intervalMs: number = 2000,
): Promise<TwilioDeliveryStatus | null> {
  const token = getAccessToken();
  let latestStatus: TwilioDeliveryStatus | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`${API_BASE_URL}${deliveryStatusPath}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success || !data?.data) {
      return latestStatus;
    }

    latestStatus = data.data as TwilioDeliveryStatus;

    if (TERMINAL_WHATSAPP_STATUSES.has(String(latestStatus.status || '').toLowerCase())) {
      return latestStatus;
    }

    if (attempt < attempts - 1) {
      await sleep(intervalMs);
    }
  }

  return latestStatus;
}

interface ModalAlertaEADProps {
  isOpen: boolean;
  onClose: () => void;
  qualificacao: {
    id: number;
    funcionario_nome?: string;
    tipo_nome?: string;
    qualificacao_nome?: string;
    data_vencimento?: string;
  };
}

export function ModalAlertaEAD({ isOpen, onClose, qualificacao }: ModalAlertaEADProps) {
  const [enviarEmail, setEnviarEmail] = useState(true);
  const [enviarWhatsApp, setEnviarWhatsApp] = useState(true);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [manualFallbackUrl, setManualFallbackUrl] = useState<string | null>(null);
  const [canalResumo, setCanalResumo] = useState<CanalResumo[]>([]);

  // Calcular dias vencida
  const dataVencimento = qualificacao.data_vencimento
    ? new Date(qualificacao.data_vencimento)
    : null;
  const hoje = new Date();
  const diasVencida = dataVencimento
    ? Math.floor((hoje.getTime() - dataVencimento.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const mensagemPadrao = `🔔 *ALERTA - Treinamento EAD Vencido*

Funcionário: ${qualificacao.funcionario_nome || 'N/A'}
Qualificação: ${qualificacao.tipo_nome || qualificacao.qualificacao_nome || 'N/A'}
Vencimento: ${dataVencimento?.toLocaleDateString('pt-BR') || 'N/A'}
Vencida há: ${diasVencida} dias

Por favor, providencie a renovação o quanto antes.`;

  const [mensagem, setMensagem] = useState(mensagemPadrao);

  const handleEnviar = async () => {
    if (!enviarEmail && !enviarWhatsApp) {
      showToast.error('Selecione pelo menos um canal de envio');
      return;
    }

    setStatus(null);
    setManualFallbackUrl(null);
    setCanalResumo([]);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/alertas/ead-vencido/${qualificacao.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({
          mensagem,
          enviarEmail,
          enviarWhatsApp,
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch (e) {
        const msg = `Erro ao processar resposta do servidor (HTTP ${res.status})`;
        setStatus({ type: 'error', message: msg });
        showToast.error(msg);
        return;
      }

      if (res.ok && data.success) {
        const alertas = (data?.data?.alertas || []) as AlertaCanal[];
        const resumoBase: CanalResumo[] = alertas.map((alerta) => ({
          canal: alerta.tipo,
          status: alerta.status,
          detalhe:
            alerta.status === 'enviado'
              ? alerta.mensagem ||
                `${alerta.tipo.toUpperCase()} aceito para ${alerta.destino || 'destino informado'}`
              : alerta.erro || `Falha no envio por ${alerta.tipo.toUpperCase()}`,
        }));
        const twilioAlerta = alertas.find(
          (alerta) =>
            alerta.tipo === 'whatsapp' &&
            alerta.provider === 'twilio' &&
            alerta.providerMessageId &&
            alerta.deliveryStatusPath,
        );

        let deliveryStatus: TwilioDeliveryStatus | null = null;
        if (twilioAlerta?.deliveryStatusPath) {
          deliveryStatus = await pollTwilioDeliveryStatus(twilioAlerta.deliveryStatusPath);
        }

        const whatsappBlocked =
          twilioAlerta &&
          deliveryStatus &&
          ['failed', 'undelivered'].includes(String(deliveryStatus.status || '').toLowerCase());

        const canaisSucesso = alertas.filter((a) => a.status === 'enviado');
        const canaisErro = alertas.filter((a) => a.status === 'erro');
        const nomesSucesso = canaisSucesso.map((a) => a.tipo).join(' e ');
        const nomesErro = canaisErro.map((a) => a.tipo).join(' e ');
        const mensagemSucesso =
          canaisSucesso.length === 1 && canaisSucesso[0]?.mensagem
            ? canaisSucesso[0].mensagem
            : null;

        if (whatsappBlocked) {
          const outrosCanaisSucesso = canaisSucesso.filter((canal) => canal.tipo !== 'whatsapp');
          const diagnosis =
            deliveryStatus?.diagnosis ||
            deliveryStatus?.errorMessage ||
            'O WhatsApp nao entregou a mensagem apos o aceite inicial do provedor.';
          setCanalResumo(
            resumoBase.map((item) =>
              item.canal === 'whatsapp'
                ? {
                    ...item,
                    status: 'erro',
                    detalhe: `WhatsApp nao entregue. ${diagnosis}`,
                  }
                : item,
            ),
          );
          const mensagemFalha =
            outrosCanaisSucesso.length > 0
              ? `Alerta enviado parcialmente. Sucesso: ${outrosCanaisSucesso.map((canal) => canal.tipo).join(' e ')}. WhatsApp nao entregue. ${diagnosis}`
              : `WhatsApp nao entregue. ${diagnosis}`;

          if (twilioAlerta.manualFallbackUrl) {
            setManualFallbackUrl(twilioAlerta.manualFallbackUrl);
          }

          if (outrosCanaisSucesso.length > 0) {
            setStatus({ type: 'warning', message: mensagemFalha });
            showToast.warning(mensagemFalha, { duration: 10000 });
          } else {
            setStatus({ type: 'error', message: mensagemFalha });
            showToast.error(mensagemFalha, { duration: 10000 });
          }

          return;
        }

        setCanalResumo(resumoBase);

        if (canaisErro.length > 0 && canaisSucesso.length > 0) {
          const msg = `Alerta enviado parcialmente. Sucesso: ${nomesSucesso}. Falhou: ${nomesErro}.`;
          setStatus({ type: 'warning', message: msg });
          showToast.warning(msg, { duration: 8000 });
        } else {
          const msg =
            mensagemSucesso ||
            `Alerta enviado com sucesso via ${nomesSucesso || 'canal selecionado'}!`;
          setStatus({ type: 'success', message: msg });
          showToast.success(msg);
        }
      } else {
        // Exibir erros detalhados se houver
        if (data.detalhes && data.detalhes.length > 0) {
          const mensagemCompleta = `${data.error || 'Erro ao enviar alerta'}:\n\n${data.detalhes.join('\n')}`;
          setStatus({ type: 'error', message: mensagemCompleta });
          setCanalResumo([]);
          showToast.error(mensagemCompleta, { duration: 8000 });
        } else {
          const msg = data.error || `Erro ao enviar alerta (HTTP ${res.status})`;
          setStatus({ type: 'error', message: msg });
          setCanalResumo([]);
          showToast.error(msg);
        }
      }
    } catch (err) {
      const msg = 'Erro ao enviar alerta';
      setStatus({ type: 'error', message: msg });
      setCanalResumo([]);
      showToast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Enviar Alerta - Treinamento EAD Vencido"
      size="lg"
    >
      <div className="space-y-4">
        {status && (
          <div
            className={
              status.type === 'success'
                ? 'rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800'
                : status.type === 'warning'
                  ? 'rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800'
                  : 'rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800'
            }
          >
            <div className="text-sm whitespace-pre-line">{status.message}</div>
            {canalResumo.length > 0 && (
              <div className="mt-3 space-y-1">
                {canalResumo.map((item, index) => (
                  <div key={`${item.canal}-${index}`} className="text-xs leading-relaxed">
                    <span className="font-semibold">
                      {item.canal === 'email' ? 'Email' : 'WhatsApp'}{' '}
                      {item.status === 'enviado' ? 'enviado' : 'falhou'}:
                    </span>{' '}
                    {item.detalhe}
                  </div>
                ))}
              </div>
            )}
            {manualFallbackUrl && (
              <a
                href={manualFallbackUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center rounded-lg border border-current px-3 py-2 text-sm font-medium hover:opacity-80"
              >
                Abrir WhatsApp para envio manual
              </a>
            )}
          </div>
        )}
        {/* Informações da qualificação */}
        <div className="rounded-lg bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
              <BellRing className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900">
                {qualificacao.funcionario_nome || 'Funcionário'}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {qualificacao.tipo_nome || qualificacao.qualificacao_nome || 'Qualificação'}
              </p>
              <p className="mt-1 text-sm font-medium text-red-600">Vencida há {diasVencida} dias</p>
            </div>
          </div>
        </div>

        {/* Mensagem editável */}
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Mensagem do Alerta
          </label>
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-primary/30"
            placeholder="Digite a mensagem do alerta..."
          />
          <p className="mt-1 text-xs text-slate-500">
            Esta mensagem vale para email e para o link de envio manual.
          </p>
          <p className="mt-1 text-xs text-amber-700">
            No WhatsApp, o AirTrust usa o template correspondente ao alerta para operar fora da
            janela de 24 horas.
          </p>
        </div>

        {/* Opções de envio */}
        <div>
          <label className="mb-3 block text-sm font-medium text-slate-700">Canais de Envio</label>
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={enviarEmail}
                onChange={(e) => setEnviarEmail(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-primary/30"
              />
              <div className="flex flex-1 items-center gap-2">
                <Mail className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-900">Enviar por E-mail</span>
              </div>
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={enviarWhatsApp}
                onChange={(e) => setEnviarWhatsApp(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-primary/30"
              />
              <div className="flex flex-1 items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-900">Enviar por WhatsApp</span>
              </div>
            </label>
          </div>
        </div>

        {/* Ações */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleEnviar}
            disabled={loading || (!enviarEmail && !enviarWhatsApp)}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Enviar Alerta
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

import { useMemo, useState } from 'react';
import { BellRing, Mail, MessageCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import Button from '@/react-app/components/Button';
import { BaseModal } from '@/react-app/components/modals/BaseModal';
import { fetchWithAuth } from '@/react-app/config/api';
import type { LmsMatricula } from '@/react-app/hooks/useLms';

type AlertTarget = Pick<LmsMatricula, 'id' | 'funcionario_id' | 'funcionario_nome' | 'status'>;

type AlertSummary = {
  selecionados: number;
  processados: number;
  email_enviados: number;
  email_falhas: number;
  sem_email: number;
  whatsapp_enviados: number;
  whatsapp_falhas: number;
  sem_whatsapp: number;
  nao_encontradas: number;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  targets: AlertTarget[];
  cursoTitulo: string;
  onSent?: () => void;
};

export function isLmsEnrollmentAlertable(
  matricula: Pick<LmsMatricula, 'status'>,
): boolean {
  return matricula.status === 'NAO_INICIADO' || matricula.status === 'EM_ANDAMENTO';
}

function statusLabel(status: LmsMatricula['status']) {
  if (status === 'NAO_INICIADO') return 'Não iniciado';
  if (status === 'EM_ANDAMENTO') return 'Em andamento';
  return status.replace(/_/g, ' ');
}

async function readSummary(response: Response): Promise<AlertSummary> {
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: AlertSummary;
    error?: string;
  };
  if (!response.ok || json.success === false || !json.data) {
    throw new Error(json.error || 'Não foi possível enviar os alertas');
  }
  return json.data;
}

export function LmsEnrollmentAlertModal({
  isOpen,
  onClose,
  targets,
  cursoTitulo,
  onSent,
}: Props) {
  const [channels, setChannels] = useState({ email: true, whatsapp: true });
  const [sending, setSending] = useState(false);

  const statusCounts = useMemo(
    () => ({
      naoIniciado: targets.filter((target) => target.status === 'NAO_INICIADO').length,
      emAndamento: targets.filter((target) => target.status === 'EM_ANDAMENTO').length,
    }),
    [targets],
  );

  async function handleSend() {
    if (!targets.length) return;
    if (!channels.email && !channels.whatsapp) {
      toast.error('Selecione e-mail e/ou WhatsApp.');
      return;
    }

    setSending(true);
    try {
      const response = await fetchWithAuth('/api/lms/matriculas/convites/lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricula_ids: targets.map((target) => target.id),
          modo: 'alerta',
          canais: channels,
        }),
      });
      const result = await readSummary(response);
      const pieces = [
        channels.email ? `${result.email_enviados} e-mail(s)` : null,
        channels.whatsapp ? `${result.whatsapp_enviados} WhatsApp(s)` : null,
      ].filter(Boolean);
      const missing =
        (channels.email ? result.sem_email : 0) +
        (channels.whatsapp ? result.sem_whatsapp : 0);
      const failures =
        (channels.email ? result.email_falhas : 0) +
        (channels.whatsapp ? result.whatsapp_falhas : 0);

      if (result.processados === 0) {
        toast.warning('Nenhuma matrícula pendente válida foi encontrada para envio.');
      } else if (failures > 0) {
        toast.warning(
          `Alertas processados: ${pieces.join(' · ')}. ${failures} falha(s)${missing ? ` · ${missing} canal(is) sem contato cadastrado` : ''}.`,
        );
      } else {
        toast.success(
          `Alertas enviados: ${pieces.join(' · ')}${missing ? ` · ${missing} canal(is) sem contato cadastrado` : ''}.`,
        );
      }
      onSent?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar alertas');
    } finally {
      setSending(false);
    }
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Enviar alertas de treinamento"
      subtitle={cursoTitulo}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={sending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSend}
            disabled={!targets.length || (!channels.email && !channels.whatsapp) || sending}
            loading={sending}
          >
            <Send className="h-4 w-4" />
            Enviar {targets.length} alerta(s)
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-start gap-3">
            <BellRing className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {targets.length} matrícula(s) selecionada(s)
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {statusCounts.naoIniciado} não iniciada(s) · {statusCounts.emAndamento} em andamento.
                Matrículas concluídas ou canceladas não recebem este alerta.
              </p>
            </div>
          </div>
        </div>

        {targets.length <= 8 ? (
          <div className="space-y-2">
            {targets.map((target) => (
              <div
                key={target.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
              >
                <span className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-200">
                  {target.funcionario_nome ?? `Funcionário ${target.funcionario_id}`}
                </span>
                <span className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                  {statusLabel(target.status)}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Canais
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <input
                type="checkbox"
                checked={channels.email}
                onChange={(event) =>
                  setChannels((current) => ({ ...current, email: event.target.checked }))
                }
              />
              <Mail className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                E-mail
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <input
                type="checkbox"
                checked={channels.whatsapp}
                onChange={(event) =>
                  setChannels((current) => ({ ...current, whatsapp: event.target.checked }))
                }
              />
              <MessageCircle className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                WhatsApp
              </span>
            </label>
          </div>
        </div>

        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
          O alerta inclui o nome do treinamento, a situação da matrícula, o prazo de conclusão
          quando existir e o link direto para acesso ao treinamento no AirTrust.
        </p>
      </div>
    </BaseModal>
  );
}

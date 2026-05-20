import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

export type SessaoNotificacaoCanal = 'email' | 'whatsapp';

export type SessaoNotificacaoAlerta = {
  tipo: SessaoNotificacaoCanal;
  destino: string;
  funcionarioId: number;
  funcionarioNome: string;
  papel: string;
  status: 'enviado' | 'erro';
  mensagem?: string;
  erro?: string;
  provider?: string;
  providerStatus?: string;
  providerMessageId?: string;
  manualFallbackUrl?: string;
};

type SessaoNotificacaoResponse = {
  success: boolean;
  error?: string;
  detalhes?: string[];
  data?: {
    alertas?: SessaoNotificacaoAlerta[];
  };
};

export async function enviarNotificacaoSessao(
  sessaoId: number,
  canais: { enviarEmail?: boolean; enviarWhatsApp?: boolean },
  mensagem?: string,
): Promise<SessaoNotificacaoAlerta[]> {
  const response = await fetch(`${API_BASE_URL}/simuladores/sessoes/${sessaoId}/notificacoes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify({
      ...canais,
      ...(mensagem ? { mensagem } : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as SessaoNotificacaoResponse | null;
  const alertas = payload?.data?.alertas || [];

  if (!response.ok || !payload?.success) {
    const detalhes = payload?.detalhes?.length ? ` ${payload.detalhes.join(' | ')}` : '';
    throw new Error(payload?.error || `Erro ao enviar notificação da sessão.${detalhes}`);
  }

  return alertas;
}

export function montarResumoCanal(
  canal: SessaoNotificacaoCanal,
  alertas: SessaoNotificacaoAlerta[],
): {
  tipo: 'success' | 'warning' | 'error';
  mensagem: string;
} {
  const canalLabel = canal === 'email' ? 'E-mail' : 'WhatsApp';
  const filtrados = alertas.filter((alerta) => alerta.tipo === canal);
  const enviados = filtrados.filter((alerta) => alerta.status === 'enviado');
  const erros = filtrados.filter((alerta) => alerta.status === 'erro');

  if (enviados.length > 0 && erros.length === 0) {
    return {
      tipo: 'success',
      mensagem: `${canalLabel} enviado para ${enviados.length} destinatário(s).`,
    };
  }

  if (enviados.length > 0 && erros.length > 0) {
    return {
      tipo: 'warning',
      mensagem: `${canalLabel} enviado parcialmente (${enviados.length} enviado(s), ${erros.length} falha(s)).`,
    };
  }

  return {
    tipo: 'error',
    mensagem:
      erros[0]?.erro ||
      `Não foi possível concluir o envio por ${canalLabel.toLowerCase()} para a sessão.`,
  };
}

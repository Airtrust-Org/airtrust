export type ModuloEventoNome =
  | 'FUNCIONARIO_ATUALIZADO'
  | 'FUNCIONARIO_INATIVADO'
  | 'QUALIFICACAO_ATUALIZADA'
  | 'FRMS_ATUALIZADO'
  | 'SIMULADOR_ATUALIZADO'
  | 'TRIPULANTE_ALOCADO'
  | 'TRIPULANTE_REMOVIDO'
  | 'TRIPULANTE_ALTERADO'
  | 'ESCALA_PUBLICADA'
  | 'DOCUMENTO_ENVIADO'
  | 'DOCUMENTO_EXCLUIDO';

export interface ModuloEvento {
  modulo:
    | 'funcionarios'
    | 'qualificacoes'
    | 'frms'
    | 'simuladores'
    | 'escalas'
    | 'pasta_virtual'
    | 'compliance';
  tipo: ModuloEventoNome;
  funcionarioIds?: Array<number | string>;
  escalaId?: string | number | null;
  aeronaveId?: string | number | null;
  timestamp?: number;
}

export const INVALIDACOES: Record<ModuloEventoNome, Array<readonly unknown[]>> = {
  FUNCIONARIO_ATUALIZADO: [['funcionarios'], ['escalas-tripulantes-operacionais']],
  FUNCIONARIO_INATIVADO: [['funcionarios'], ['escalas-tripulantes-operacionais'], ['frms']],
  QUALIFICACAO_ATUALIZADA: [['qualificacoes'], ['escalas-tripulantes-operacionais']],
  FRMS_ATUALIZADO: [['frms'], ['escalas']],
  SIMULADOR_ATUALIZADO: [['simuladores'], ['escalas']],
  TRIPULANTE_ALOCADO: [['escalas'], ['escalas-tripulantes-operacionais'], ['frms']],
  TRIPULANTE_REMOVIDO: [['escalas'], ['escalas-tripulantes-operacionais'], ['frms']],
  TRIPULANTE_ALTERADO: [['escalas'], ['escalas-tripulantes-operacionais'], ['frms']],
  ESCALA_PUBLICADA: [['escalas'], ['escalas-pilotos'], ['escalas-tripulantes-operacionais']],
  DOCUMENTO_ENVIADO: [['pasta-virtual'], ['qualificacoes']],
  DOCUMENTO_EXCLUIDO: [['pasta-virtual'], ['qualificacoes']],
};

const CHANNEL_NAME = 'airtrust-modulos';
const WINDOW_EVENT_NAME = 'airtrust:modulo-evento';

function createChannel() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }

  return new BroadcastChannel(CHANNEL_NAME);
}

export function emitirEventoModulo(evento: ModuloEvento) {
  if (typeof window === 'undefined') {
    return;
  }

  const payload: ModuloEvento = {
    ...evento,
    timestamp: evento.timestamp ?? Date.now(),
  };

  window.dispatchEvent(new CustomEvent(WINDOW_EVENT_NAME, { detail: payload }));

  const channel = createChannel();
  if (!channel) {
    return;
  }

  channel.postMessage(payload);
  channel.close();
}

export function escutarEventosModulo(listener: (evento: ModuloEvento) => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleWindowEvent = (event: Event) => {
    const detail = (event as CustomEvent<ModuloEvento>).detail;
    if (detail) {
      listener(detail);
    }
  };

  window.addEventListener(WINDOW_EVENT_NAME, handleWindowEvent);

  const channel = createChannel();
  if (channel) {
    channel.onmessage = (message: MessageEvent<ModuloEvento>) => {
      if (message.data) {
        listener(message.data);
      }
    };
  }

  return () => {
    window.removeEventListener(WINDOW_EVENT_NAME, handleWindowEvent);
    channel?.close();
  };
}

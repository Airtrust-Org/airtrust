/**
 * ModalConfirmarTransicao — Modal de confirmação genérico para transições de status.
 * Usado para: Enviar para Revisão, Aprovar, Arquivar, Reabrir, Rejeitar.
 */

import { useState } from 'react';
import { AlertTriangle, Archive, CheckCircle, Send, RotateCcw, Eye } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/react-app/components/UI';
import type { StatusEscala } from '../../hooks/queries/useEscalasQuery';

type TransicaoTipo =
  | 'enviar-revisao'      // rascunho → em_revisao
  | 'aprovar'             // em_revisao → aprovada
  | 'rejeitar'            // em_revisao → rascunho
  | 'devolver-revisao'    // aprovada → em_revisao
  | 'reabrir'             // publicada → em_revisao
  | 'arquivar';           // publicada → arquivada

const TRANSICAO_CONFIG: Record<
  TransicaoTipo,
  {
    title: string;
    icon: React.ReactNode;
    descricao: string;
    confirmLabel: string;
    confirmVariant: 'primary' | 'secondary' | 'danger';
    confirmClass?: string;
    pedirJustificativa?: boolean;
    justificativaLabel?: string;
    justificativaPlaceholder?: string;
    avisoDestructive?: string;
    proximo: StatusEscala;
  }
> = {
  'enviar-revisao': {
    title: '📤 Enviar para Revisão',
    icon: <Send className="h-8 w-8 text-amber-500" />,
    descricao:
      'A escala será enviada para revisão. Os gestores poderão aprovar ou devolver para ajustes.',
    confirmLabel: 'Enviar para Revisão',
    confirmVariant: 'primary',
    confirmClass: 'bg-amber-500 hover:bg-amber-600 text-white',
    proximo: 'em_revisao',
  },
  aprovar: {
    title: '✅ Aprovar Escala',
    icon: <CheckCircle className="h-8 w-8 text-sky-500" />,
    descricao:
      'A escala será aprovada e poderá ser publicada para os tripulantes na próxima etapa.',
    confirmLabel: 'Aprovar Escala',
    confirmVariant: 'primary',
    confirmClass: 'bg-sky-600 hover:bg-sky-700 text-white',
    proximo: 'aprovada',
  },
  rejeitar: {
    title: '↩️ Rejeitar e Devolver',
    icon: <RotateCcw className="h-8 w-8 text-slate-500" />,
    descricao: 'A escala voltará para Rascunho para que os ajustes necessários sejam feitos.',
    confirmLabel: 'Devolver para Rascunho',
    confirmVariant: 'secondary',
    pedirJustificativa: true,
    justificativaLabel: 'Motivo da rejeição',
    justificativaPlaceholder: 'Descreva o que precisa ser ajustado...',
    proximo: 'rascunho',
  },
  'devolver-revisao': {
    title: '↩️ Devolver para Revisão',
    icon: <Eye className="h-8 w-8 text-amber-500" />,
    descricao:
      'A escala voltará para o status "Em Revisão" para que correções possam ser feitas antes de nova aprovação.',
    confirmLabel: 'Devolver para Revisão',
    confirmVariant: 'secondary',
    pedirJustificativa: true,
    justificativaLabel: 'Motivo da devolução',
    justificativaPlaceholder: 'Descreva o que precisa ser revisado...',
    proximo: 'em_revisao',
  },
  reabrir: {
    title: '✏️ Iniciar Nova Revisão',
    icon: <RotateCcw className="h-8 w-8 text-indigo-500" />,
    descricao:
      'A versão atual será salva no histórico e a escala entrará em modo de edição. Após os ajustes, publique uma nova revisão.',
    confirmLabel: 'Iniciar Revisão',
    confirmVariant: 'secondary',
    pedirJustificativa: true,
    justificativaLabel: 'Motivo da revisão (opcional)',
    justificativaPlaceholder: 'Ex: ajuste de escalas de férias, inclusão de piloto...',
    avisoDestructive:
      'A escala sairá do status Publicada. O snapshot atual fica preservado no histórico de revisões.',
    proximo: 'em_revisao',
  },
  arquivar: {
    title: '📦 Arquivar Escala',
    icon: <Archive className="h-8 w-8 text-stone-500" />,
    descricao:
      'A escala será arquivada. Esta ação é irreversível — a escala não poderá mais ser editada ou publicada.',
    confirmLabel: 'Arquivar Definitivamente',
    confirmVariant: 'danger',
    pedirJustificativa: true,
    justificativaLabel: 'Motivo do arquivamento',
    justificativaPlaceholder: 'Por que a escala está sendo arquivada?',
    avisoDestructive: 'Esta ação é permanente e não pode ser desfeita.',
    proximo: 'arquivada',
  },
};

interface Props {
  tipo: TransicaoTipo;
  escalaLabel: string;
  onConfirmar: (proximo: StatusEscala, justificativa?: string) => Promise<void>;
  onClose: () => void;
}

export default function ModalConfirmarTransicao({ tipo, escalaLabel, onConfirmar, onClose }: Props) {
  const cfg = TRANSICAO_CONFIG[tipo];
  const [justificativa, setJustificativa] = useState('');
  const [loading, setLoading] = useState(false);

  const podeConfirmar = !loading && (!cfg.pedirJustificativa || true); // justificativa is optional

  async function handleConfirmar() {
    setLoading(true);
    try {
      await onConfirmar(cfg.proximo, justificativa.trim() || undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={cfg.title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            isLoading={loading}
            disabled={!podeConfirmar}
            variant={cfg.confirmVariant === 'danger' ? 'danger' : 'primary'}
            className={cfg.confirmVariant !== 'danger' ? cfg.confirmClass : undefined}
          >
            {cfg.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 rounded-xl bg-slate-50 px-4 py-5 text-center">
          {cfg.icon}
          <div>
            <p className="text-sm font-semibold text-slate-800">{escalaLabel}</p>
            <p className="mt-1.5 text-sm text-slate-600">{cfg.descricao}</p>
          </div>
        </div>

        {cfg.avisoDestructive && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-xs text-red-800">{cfg.avisoDestructive}</p>
          </div>
        )}

        {cfg.pedirJustificativa && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {cfg.justificativaLabel || 'Observação'}{' '}
              <span className="normal-case font-normal text-slate-400">(opcional)</span>
            </label>
            <textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={3}
              placeholder={cfg.justificativaPlaceholder || ''}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

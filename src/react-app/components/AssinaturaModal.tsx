/**
 * MODAL DE ASSINATURA DIGITAL
 * Modelo atualizado: Campo de assinatura via mouse/touch + Declaração + Checkbox de confirmação
 * Data: 03/12/2025
 */

import { useRef, useState, useEffect } from 'react';
import { X, PenTool } from 'lucide-react';
import { toast } from 'sonner';

interface AssinaturaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSalvar: (aprovado?: boolean, signatureDataUrl?: string) => void;
  papel: 'INSTRUTOR' | 'TRIPULANTE';
  children?: React.ReactNode; // Conteúdo adicional (ex: avaliação de checks)
}

export default function AssinaturaModal({
  isOpen,
  onClose,
  onSalvar,
  papel,
  children,
}: AssinaturaModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [desenhando, setDesenhando] = useState(false);
  const [assinado, setAssinado] = useState(false);
  const [concordo, setConcordo] = useState(false);
  const [assinaturaTexto, setAssinaturaTexto] = useState('');
  const [aprovado, setAprovado] = useState<boolean | null>(null);

  const configurarCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width || canvas.clientWidth || 700);
    const cssHeight = Math.max(1, rect.height || canvas.clientHeight || 180);
    const pixelRatio = window.devicePixelRatio || 1;

    canvas.width = Math.round(cssWidth * pixelRatio);
    canvas.height = Math.round(cssHeight * pixelRatio);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5 * pixelRatio;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.imageSmoothingEnabled = true;
    }

    setAssinado(false);
    setDesenhando(false);
  };

  useEffect(() => {
    if (isOpen) {
      const frame = window.requestAnimationFrame(() => {
        configurarCanvas();
      });

      setConcordo(false);
      setAssinaturaTexto('');
      setAprovado(null);

      return () => window.cancelAnimationFrame(frame);
    }
  }, [isOpen]);

  const iniciarDesenho = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
      setDesenhando(true);
      setAssinado(true);
    }
  };

  const desenhar = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!desenhando) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
      ctx.stroke();
    }
  };

  const pararDesenho = () => {
    setDesenhando(false);
  };

  const limpar = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      setAssinado(false);
    }
  };

  const salvar = () => {
    // Validações opcionais para UX (backend não usa esses dados, apenas valida presença)
    if (!assinado) {
      toast.warning('Por favor, desenhe sua assinatura no campo acima');
      return;
    }

    if (!concordo) {
      toast.warning('Por favor, confirme a declaração antes de continuar');
      return;
    }

    // Instrutor DEVE escolher aprovação antes de assinar
    if (papel === 'INSTRUTOR' && aprovado === null) {
      toast.warning('Por favor, indique se a sessão foi APROVADA ou NÃO APROVADA');
      return;
    }

    const signatureDataUrl = canvasRef.current?.toDataURL('image/png');
    onSalvar(papel === 'INSTRUTOR' ? (aprovado ?? undefined) : undefined, signatureDataUrl);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <PenTool size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Assinatura Digital</h2>
              <p className="text-sm text-blue-100">
                {papel === 'INSTRUTOR' ? 'Instrutor-Administrador' : 'Participante'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Instruções */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-900 font-medium mb-1">
              <strong>Instruções:</strong> Desenhe sua assinatura no campo abaixo usando o mouse ou
              touch.
            </p>
            <p className="text-xs text-blue-700">
              Você pode limpar e refazer quantas vezes quiser antes de confirmar.
            </p>
          </div>

          {/* Campo de Assinatura (Canvas) */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Assinatura *</label>
            <div className="border-2 border-slate-300 rounded-lg overflow-hidden bg-slate-50 hover:border-blue-500 transition">
              <canvas
                ref={canvasRef}
                width={700}
                height={180}
                className="w-full cursor-crosshair touch-none"
                onMouseDown={iniciarDesenho}
                onMouseMove={desenhar}
                onMouseUp={pararDesenho}
                onMouseLeave={pararDesenho}
                onTouchStart={(e) => {
                  e.preventDefault();
                  const touch = e.touches[0];
                  const mouseEvent = new MouseEvent('mousedown', {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                  });
                  canvasRef.current?.dispatchEvent(mouseEvent);
                }}
                onTouchMove={(e) => {
                  e.preventDefault();
                  const touch = e.touches[0];
                  const mouseEvent = new MouseEvent('mousemove', {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                  });
                  canvasRef.current?.dispatchEvent(mouseEvent);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  const mouseEvent = new MouseEvent('mouseup', {});
                  canvasRef.current?.dispatchEvent(mouseEvent);
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-slate-500">Desenhe sua assinatura no campo acima</p>
              <button
                type="button"
                onClick={limpar}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                🗑️ Limpar Assinatura
              </button>
            </div>
          </div>

          {/* Declaração */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
            <p className="text-xs text-slate-700 mb-2">
              <strong className="text-slate-900">Declaração:</strong> Ao confirmar esta assinatura
              digital, declaro que:
            </p>
            <ul className="text-xs text-slate-600 space-y-1 ml-4 list-disc">
              <li>Li e concordo com as informações contidas nesta ficha</li>
              <li>A avaliação reflete fielmente o desempenho observado</li>
              <li>Esta assinatura tem validade legal para fins de registro</li>
            </ul>
          </div>

          {/* Checkbox de Confirmação */}
          <div className="flex items-start gap-3 mb-6">
            <input
              type="checkbox"
              id="concordo"
              checked={concordo}
              onChange={(e) => setConcordo(e.target.checked)}
              className="mt-1 w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-primary/30"
            />
            <label htmlFor="concordo" className="text-sm text-slate-700 cursor-pointer">
              * Campo obrigatório
            </label>
          </div>

          {/* Aprovação do Instrutor (OBRIGATÓRIO) */}
          {papel === 'INSTRUTOR' && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-5 mb-6">
              <label className="block text-sm font-bold text-amber-900 mb-3">
                ⚠️ Aprovação da Sessão *
              </label>
              <p className="text-xs text-amber-700 mb-4">
                Como instrutor, você deve indicar se a sessão foi APROVADA ou NÃO APROVADA.
              </p>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setAprovado(true)}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 font-semibold text-sm transition ${
                    aprovado === true
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-green-700 border-green-300 hover:bg-green-50'
                  }`}
                >
                  ✓ APROVADO
                </button>
                <button
                  type="button"
                  onClick={() => setAprovado(false)}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 font-semibold text-sm transition ${
                    aprovado === false
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
                  }`}
                >
                  ✗ NÃO APROVADO
                </button>
              </div>
            </div>
          )}

          {/* Conteúdo Adicional (ex: Avaliação de Checks) */}
          {children && <div className="mb-6">{children}</div>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 rounded-b-xl">
          <p className="text-xs text-slate-500">Data/Hora: {new Date().toLocaleString('pt-BR')}</p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={!assinado || !concordo || (papel === 'INSTRUTOR' && aprovado === null)}
              className="px-6 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              ✓ Confirmar Assinatura
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

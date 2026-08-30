import { UserRoundCog } from 'lucide-react';

type Ficha360OperationalContextProps = {
  status: string;
  funcao: string;
  base?: string | null;
  aeronave?: string | null;
  licenca?: string | null;
  updatedAtLabel: string;
  onOpenPersonalProfile: () => void;
};

export default function Ficha360OperationalContext({
  status,
  funcao,
  base,
  aeronave,
  licenca,
  updatedAtLabel,
  onOpenPersonalProfile,
}: Ficha360OperationalContextProps) {
  const active = status.toUpperCase() === 'ATIVO';

  return (
    <div className="min-h-[420px] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800">Contexto Operacional</h3>
          <p className="mt-1 text-xs text-slate-500">
            Dados necessários para leitura operacional da ficha.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenPersonalProfile}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        >
          <UserRoundCog className="h-3.5 w-3.5" aria-hidden="true" />
          Dados pessoais
        </button>
      </div>

      <dl className="space-y-2 text-sm text-gray-700">
        <div className="flex justify-between border-b pb-2">
          <dt className="font-medium text-gray-500">Status:</dt>
          <dd>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
              }`}
            >
              {status}
            </span>
          </dd>
        </div>
        <div className="flex justify-between border-b pb-2">
          <dt className="font-medium text-gray-500">Função:</dt>
          <dd>{funcao}</dd>
        </div>
        <div className="flex justify-between border-b pb-2">
          <dt className="font-medium text-gray-500">Base:</dt>
          <dd>{base ?? '-'}</dd>
        </div>
        <div className="flex justify-between border-b pb-2">
          <dt className="font-medium text-gray-500">Aeronave:</dt>
          <dd>{aeronave ?? '-'}</dd>
        </div>
        <div className="flex justify-between border-b pb-2">
          <dt className="font-medium text-gray-500">Licença principal:</dt>
          <dd>{licenca ?? '-'}</dd>
        </div>
        <div className="flex justify-between border-b pb-2">
          <dt className="font-medium text-gray-500">Atualizado em:</dt>
          <dd>{updatedAtLabel}</dd>
        </div>
      </dl>
    </div>
  );
}

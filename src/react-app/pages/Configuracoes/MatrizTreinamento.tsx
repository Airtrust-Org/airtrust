import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { TrainingComplianceApplicabilityEditor } from '@/react-app/components/compliance/TrainingComplianceApplicabilityEditor';
import { useQualificacaoTipos } from '@/react-app/hooks/useQualificacoesExt';

export function MatrizTreinamento() {
  const [selectedTipoId, setSelectedTipoId] = useState<number | null>(null);
  const { tipos } = useQualificacaoTipos(true, 500);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold text-slate-900">Matriz de Compliance de Treinamentos</h3>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Configure a aplicabilidade canônica por empresa, setor e cargo. Esta é a mesma regra usada
            nos modelos de qualificação, nos cursos EAD vinculados e no cálculo por pessoa.
          </p>
        </div>
        <Link
          to="/compliance-treinamentos"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Ver compliance operacional <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block max-w-2xl text-xs font-semibold uppercase tracking-wide text-slate-500">
          Treinamento / modelo de qualificação
          <select
            value={selectedTipoId ?? ''}
            onChange={(event) =>
              setSelectedTipoId(event.target.value ? Number(event.target.value) : null)
            }
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case text-slate-800"
          >
            <option value="">Selecione um treinamento</option>
            {tipos.map((tipo) => (
              <option key={String(tipo.id)} value={String(tipo.id)}>
                {tipo.nome}
                {tipo.codigo ? ` (${tipo.codigo})` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedTipoId ? (
        <TrainingComplianceApplicabilityEditor
          qualificacaoTipoId={selectedTipoId}
          title="Aplicabilidade canônica"
        />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          Selecione um treinamento para definir a obrigação. Não há mais uma segunda matriz por função:
          todas as telas editam o mesmo requisito canônico de compliance.
        </div>
      )}
    </div>
  );
}

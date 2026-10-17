import { useId, useMemo, useState } from 'react';
import type { QualificacaoTipoDTO } from '@/react-app/hooks/useQualificacoesExt';

type TrainingCompliancePickerProps = {
  tipos: QualificacaoTipoDTO[];
  value: number | null;
  onChange: (id: number | null) => void;
};

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

function normalized(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

export function TrainingCompliancePicker({ tipos, value, onChange }: TrainingCompliancePickerProps) {
  const [search, setSearch] = useState('');
  const searchId = useId();
  const selectId = useId();

  const groupedTipos = useMemo(() => {
    const term = normalized(search.trim());
    const groups = new Map<string, QualificacaoTipoDTO[]>();

    tipos.forEach((tipo) => {
      const area = tipo.area_nome?.trim() || 'Sem área definida';
      const searchable = normalized(`${tipo.nome} ${tipo.codigo || ''} ${area}`);
      if (term && !searchable.includes(term)) return;
      const group = groups.get(area) || [];
      group.push(tipo);
      groups.set(area, group);
    });

    return [...groups.entries()]
      .sort(([left], [right]) => collator.compare(left, right))
      .map(([area, options]) => ({
        area,
        options: [...options].sort((left, right) => {
          const byName = collator.compare(left.nome, right.nome);
          return byName || collator.compare(left.codigo || '', right.codigo || '');
        }),
      }));
  }, [search, tipos]);

  const visibleCount = groupedTipos.reduce((total, group) => total + group.options.length, 0);

  return (
    <div className="space-y-2">
      <label
        htmlFor={selectId}
        className="text-xs font-semibold uppercase tracking-wide text-slate-500"
      >
        Treinamento / modelo de qualificação
      </label>
      <div>
        <label htmlFor={searchId} className="sr-only">
          Buscar treinamento
        </label>
        <input
          id={searchId}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por treinamento, código ou área..."
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </div>
      <select
        id={selectId}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        aria-describedby={`${selectId}-count`}
      >
        <option value="">Selecione um treinamento</option>
        {groupedTipos.map(({ area, options }) => (
          <optgroup key={area} label={area}>
            {options.map((tipo) => (
              <option key={String(tipo.id)} value={String(tipo.id)}>
                {tipo.nome}
                {tipo.codigo ? ` (${tipo.codigo})` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p id={`${selectId}-count`} className="text-xs text-slate-500" aria-live="polite">
        {visibleCount === 1 ? '1 treinamento encontrado' : `${visibleCount} treinamentos encontrados`}
        {groupedTipos.length ? ` em ${groupedTipos.length} área${groupedTipos.length === 1 ? '' : 's'}` : ''}.
      </p>
    </div>
  );
}

import { useApi } from '@/react-app/hooks/useApi';

interface AeronaveSelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export default function AeronaveSelect({ value, onChange, className, placeholder = "Selecione uma aeronave" }: AeronaveSelectProps) {
  const { data: aeronaves } = useApi<any[]>('/api/aeronaves');

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">{placeholder}</option>
      {aeronaves?.map((aeronave) => (
        <option key={aeronave.id} value={aeronave.codigo}>
          {aeronave.codigo} - {aeronave.nome}
        </option>
      ))}
    </select>
  );
}

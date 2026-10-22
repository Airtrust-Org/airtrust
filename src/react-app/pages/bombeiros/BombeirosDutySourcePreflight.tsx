/**
 * BOA: real API preflight of fictitious source documents, staging only.
 * No mapping, persistence, operational denominator or scientific decision.
 */
import { useState, type ChangeEvent } from 'react';
import { useApiMutation } from '@/react-app/hooks/useApi';

type PreflightResult = {
  schema: string;
  status: 'SCHEMA_VALID_SOURCE_UNVERIFIED';
  input_sha256: string;
  record_count: number;
  candidate_totals_ms: {
    planned: number | null; actual: number | null;
    standby: number | null; activations: number | null;
  };
  missing_sources_count: Record<string, number>;
  tenant_identity_link: 'NOT_RESOLVED';
  source_approval: 'NOT_EVALUATED';
  scientific_risk_score: null;
  operational_exposure_denominator_ms: null;
  stored: false;
  dispatch_permission: 'NOT_GRANTED';
};
type Envelope = {
  success: boolean;
  data: PreflightResult;
  meta: { synthetic_only: true; write_performed: false };
};

export default function BombeirosDutySourcePreflight() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [notice, setNotice] = useState('');
  const { mutate, loading, error } = useApiMutation<Envelope>();

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setResult(null);
    setNotice('');
  };

  const validate = async () => {
    setNotice('');
    setResult(null);
    if (!file || file.size === 0 || file.size > 262144) {
      setNotice('Arquivo JSON fictício obrigatório, com no máximo 256 KiB.');
      return;
    }
    try {
      const raw = await file.text();
      const response = await mutate('/api/bombeiros/frms/fontes-operacionais/validar-qa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: raw,
      });
      if (!response?.success || !response.data || response.meta.write_performed !== false) {
        setNotice('Não foi possível comprovar o contrato de validação.');
        return;
      }
      setResult(response.data);
    } catch {
      // useApiMutation surfaces only the safe error. Do not log source JSON.
      setNotice('A validação não foi concluída. Nenhum dado foi importado.');
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-slate-300 bg-white p-4"
      aria-label="Pré-validação técnica de escalas fictícias">
      <h2 className="font-semibold text-slate-950">Conferência de escala e acionamentos — QA</h2>
      <p className="text-sm text-slate-700">
        Envie apenas um exportador JSON 100% fictício com contrato BOA_OPERATIONAL_SOURCE_BATCH_V1.
        A API verifica períodos planejados e realizados, sobreaviso, acionamentos e inconsistências.
        Sem fonte operacional BOA aprovada, este ensaio não vincula pessoas, não grava no banco,
        não calcula exposição ou fadiga e não autoriza voo.
      </p>
      <label className="block text-sm">
        Arquivo de origem fictícia (JSON, até 256 KiB)
        <input type="file" accept=".json,application/json" onChange={selectFile}
          className="mt-1 block max-w-full text-sm" />
      </label>
      <button type="button" onClick={() => void validate()}
        disabled={loading || !file}
        className="rounded border border-slate-600 px-3 py-2 text-sm disabled:opacity-50">
        {loading ? 'Validando contrato…' : 'Verificar exportação sem importar'}
      </button>
      {notice && <p role="alert" className="text-sm text-amber-900">{notice}</p>}
      {error && <p role="alert" className="text-sm text-red-700">
        Pré-validação indisponível ou fonte recusada. Nenhuma gravação autorizada: {error}
      </p>}
      {result && (
        <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-semibold">Estrutura sintética verificada. Origem BOA NÃO aprovada.</p>
          <p>Registros conferidos: {result.record_count}</p>
          <p>Vinculação a funcionários: não realizada. Persistência: não realizada.</p>
          <p>Índice científico de risco e denominador operacional: indisponíveis.</p>
          <p>SHA-256 do arquivo analisado: <code className="break-all">{result.input_sha256}</code></p>
          <h3 className="font-medium">Lacunas encontradas</h3>
          {Object.keys(result.missing_sources_count).length ? (
            <ul className="list-disc pl-5">
              {Object.entries(result.missing_sources_count).map(([key, count]) =>
                <li key={key}>{key}: {count} registros</li>)}
            </ul>
          ) : <p>Nenhuma lacuna sintática detectada; a origem permanece não verificada.</p>}
        </div>
      )}
    </section>
  );
}

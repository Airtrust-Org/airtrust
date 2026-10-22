import { useApi } from '@/react-app/hooks/useApi';

type QaReadiness = {
  status: 'QA_PRECONDITIONS_INCOMPLETE' | 'CONFIGURATION_CHECKS_PASSED_NOT_AUTHORIZED';
  accounts: {
    member_accounts: number; crew_links: number;
    manager_roles: number; admin_roles: number;
  };
  intended_user_count: 130;
  cohort_130_structurally_present: boolean;
  firefighter_profile_configuration_resolves: boolean;
  synthetic_tenant_write_gate_matches: boolean;
  official_boa_source: 'NOT_VERIFIED';
  scientific_validation: 'NOT_ATTESTED';
  privacy_authorization: 'NOT_ATTESTED';
  interactive_qa_login: 'NOT_TESTED';
  real_d1_checkin: 'NOT_TESTED';
  production_release: 'NOT_AUTHORIZED';
  operational_poc_accepted: false;
};
type Response = {
  success: boolean; data: QaReadiness;
  meta: { write_performed: false; evidence: string };
};

/** Staging-only operational prerequisites, obtained from authenticated API. */
export default function BombeirosQaReadinessPanel() {
  const { data, loading, error, refetch } = useApi<Response>(
    '/api/bombeiros/frms/qa/prontidao',
    { requireAuth: true, bypassGetCache: true, staleTime: 0 },
  );
  const snapshot = data?.success ? data.data : null;
  return (
    <section aria-label="Pré-requisitos da PoC BOA em staging"
      className="space-y-3 rounded-xl border border-slate-300 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-950">
        Situação operacional do ambiente BOA — staging
      </h2>
      <p className="text-sm text-slate-700">
        Consulta autenticada e somente leitura. Os indicadores abaixo mostram
        cadastros e configuração presentes no tenant selecionado, não uma
        demonstração homologada nem autorização para tratar dados reais de saúde.
      </p>
      {loading && <p role="status">Conferindo pré-requisitos no servidor…</p>}
      {error && <p role="alert" className="text-sm text-red-800">
        Não foi possível consultar os pré-requisitos: {error}
      </p>}
      {!loading && !error && !snapshot &&
        <p role="status">Nenhuma evidência operacional disponível nesta sessão.</p>}
      {snapshot && !error && <div className="space-y-2 text-sm">
        <p className="font-semibold">
          {snapshot.status === 'QA_PRECONDITIONS_INCOMPLETE'
            ? 'Pré-requisitos técnicos incompletos'
            : 'Configuração aparente conferida; PoC não autorizada'}
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Contas com vínculo à empresa: {snapshot.accounts.member_accounts} / {snapshot.intended_user_count}</li>
          <li>Vínculos de tripulantes ativos: {snapshot.accounts.crew_links}</li>
          <li>Gestores cadastrados: {snapshot.accounts.manager_roles}</li>
          <li>Administradores cadastrados: {snapshot.accounts.admin_roles}</li>
          <li>Perfil FIREFIGHTER_AVIATION resolvido: {snapshot.firefighter_profile_configuration_resolves ? 'sim' : 'não'}</li>
          <li>Flag técnico do tenant sintético: {snapshot.synthetic_tenant_write_gate_matches ? 'configurado' : 'desativado'}</li>
          <li>Fonte oficial de escalas BOA: não verificada</li>
          <li>Validação científica e autorização LGPD: não atestadas</li>
          <li>Login QA em staging e gravação D1 real: ainda não testados</li>
        </ul>
        <p className="font-medium">
          Esta consulta não concede permissão de voo, autorização de gravação
          ou aceite da prova de conceito.
        </p>
        <button type="button" className="rounded border border-slate-400 px-3 py-2"
          onClick={() => refetch()}>
          Conferir novamente
        </button>
      </div>}
    </section>
  );
}

/**
 * Player 3 admission must be rechecked on the Worker even for physical Native:
 * React Query caches LMS details by enrollment ID, not authenticated user.
 * A preceding account's cached enrollment is never sufficient for access.
 * SCORM-backed courses additionally require the server's activation marker.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMatriculaDetalhe } from '@/react-app/hooks/useLms';
import { useAuth } from '@/react-app/hooks/useAuth';
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';
import Player3AuthenticatedStagingEntry from './player3/Player3AuthenticatedStagingEntry';

type AdmissionCheck = { scope: string; admitted: boolean };
type Admission = { success?: boolean; data?: {
  matricula_id?: number; curso_id?: number; mode?: string;
  native_package?: string;
} };
const permittedStatuses = new Set(['NAO_INICIADO', 'EM_ANDAMENTO', 'CONCLUIDO']);

export default function LmsNativePlayer() {
  const { matriculaId } = useParams<{ matriculaId: string }>();
  const navigate = useNavigate();
  const {user,isAuthenticated,empresaAtualId}=useAuth();
  const validId = typeof matriculaId === 'string' && /^[1-9][0-9]{0,15}$/.test(matriculaId);
  const id = validId ? Number(matriculaId) : 0;
  const { data: matricula, isLoading } = useMatriculaDetalhe(id);
  const [admissionCheck, setAdmissionCheck] = useState<AdmissionCheck | null>(null);

  // A cached LMS query from the preceding logged-in user or selected tenant
  // is NOT admission. Hide it before render/effects and require a fresh child
  // launch on each authenticated identity transition. The Worker still checks
  // actual employee ownership, tenant, cycle and edition independently.
  const validActor=isAuthenticated && Number.isSafeInteger(user?.id) &&
    Number(user?.id)>0 && Number.isSafeInteger(empresaAtualId) &&
    Number(empresaAtualId)>0;
  const validEnrollment = validActor && validId && Number.isSafeInteger(id) && id > 0 &&
    !!matricula && matricula.id === id &&
    matricula.empresa_id === empresaAtualId &&
    Number.isSafeInteger(matricula.empresa_id) && matricula.empresa_id > 0 &&
    Number.isSafeInteger(matricula.curso_id) && matricula.curso_id > 0 &&
    permittedStatuses.has(matricula.status);
  const isAdmissionCandidate = validEnrollment &&
    (matricula.tipo_conteudo === 'native' || matricula.tipo_conteudo === 'scorm');
  const expectedMode = matricula?.status === 'CONCLUIDO' ? 'REVIEW' : 'LEARN';
  const scope = isAdmissionCandidate
    ? [user?.id,empresaAtualId,id,matricula.curso_id,matricula.status].join(':')
    : '';

  useEffect(() => {
    if (!isAdmissionCandidate) return;
    const controller = new AbortController();
    void (async () => {
      const response = await fetchWithAuth(
        API_BASE_URL + '/lms/native/matriculas/' + id + '/admissao',
        { method: 'GET', cache: 'no-store', signal: controller.signal },
      );
      if (!response.ok) throw Error('PLAYER3_ENROLLMENT_ADMISSION_DENIED');
      const body = await response.json() as Admission;
      if (body.success !== true || body.data?.matricula_id !== id ||
          body.data.curso_id !== matricula.curso_id ||
          body.data.mode !== expectedMode ||
          body.data.native_package !== 'NOT_YET_ENABLED') {
        throw Error('PLAYER3_ENROLLMENT_SCOPE_CONFLICT');
      }
      if (!controller.signal.aborted) setAdmissionCheck({ scope, admitted: true });
    })().catch(() => {
      if (!controller.signal.aborted) setAdmissionCheck({ scope, admitted: false });
    });
    return () => controller.abort();
  }, [isAdmissionCandidate,scope,id,expectedMode,matricula?.curso_id]);

  if (!validId || !Number.isSafeInteger(id) || id <= 0) {
    return <p role="alert">Identificador de matrícula inválido.</p>;
  }
  if (isLoading) return <p role="status">Carregando matrícula…</p>;
  if (!validEnrollment || (matricula.tipo_conteudo !== 'native' && matricula.tipo_conteudo !== 'scorm')) {
    return <p role="alert">Curso Native indisponível para esta matrícula.</p>;
  }
  // Never mount the learner or disclose cached course metadata before this
  // account's own tenant/enrollment admission was confirmed by the Worker.
  if (isAdmissionCandidate && admissionCheck?.scope !== scope) {
    return <p role="status">Verificando acesso à matrícula…</p>;
  }
  if (isAdmissionCandidate && admissionCheck?.admitted !== true) {
    return <p role="alert">Curso Native indisponível para esta matrícula.</p>;
  }
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b bg-white px-4 py-3">
        <button type="button" onClick={() => navigate(-1)} className="rounded border px-3 py-2">
          Voltar
        </button>
      </header>
      <Player3AuthenticatedStagingEntry
        key={[user?.id,empresaAtualId,id,matricula.curso_id].join(':')}
        matriculaId={id}
        empresaId={matricula.empresa_id}
        cursoId={matricula.curso_id}
        title={matricula.titulo ?? 'Treinamento'}
        active={matricula.status === 'EM_ANDAMENTO'}
      />
    </main>
  );
}

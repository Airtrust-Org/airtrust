/**
 * Native Player3 entry: a legacy physical SCORM row can become Native only
 * when the authenticated staging Worker confirms the immutable activation
 * marker for this precise learner enrollment. Never infer activation from
 * course metadata, feature flags in the browser, or URL query parameters.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMatriculaDetalhe } from '@/react-app/hooks/useLms';
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';
import Player3AuthenticatedStagingEntry from './player3/Player3AuthenticatedStagingEntry';

type MarkerCheck = { scope: string; admitted: boolean };
type Admission = { success?: boolean; data?: {
  matricula_id?: number; curso_id?: number; mode?: string;
  native_package?: string;
} };
const permittedStatuses = new Set(['NAO_INICIADO', 'EM_ANDAMENTO', 'CONCLUIDO']);

export default function LmsNativePlayer() {
  const { matriculaId } = useParams<{ matriculaId: string }>();
  const navigate = useNavigate();
  const validId = typeof matriculaId === 'string' && /^[1-9][0-9]{0,15}$/.test(matriculaId);
  const id = validId ? Number(matriculaId) : 0;
  const { data: matricula, isLoading } = useMatriculaDetalhe(id);
  const [markerCheck, setMarkerCheck] = useState<MarkerCheck | null>(null);

  const validEnrollment = validId && Number.isSafeInteger(id) && id > 0 &&
    !!matricula && matricula.id === id &&
    Number.isSafeInteger(matricula.empresa_id) && matricula.empresa_id > 0 &&
    Number.isSafeInteger(matricula.curso_id) && matricula.curso_id > 0 &&
    permittedStatuses.has(matricula.status);
  const isMarkerCandidate = validEnrollment && matricula.tipo_conteudo === 'scorm';
  const expectedMode = matricula?.status === 'CONCLUIDO' ? 'REVIEW' : 'LEARN';
  const scope = isMarkerCandidate
    ? [id,matricula.empresa_id,matricula.curso_id,matricula.status].join(':')
    : '';

  useEffect(() => {
    if (!isMarkerCandidate) return;
    const controller = new AbortController();
    void (async () => {
      const response = await fetchWithAuth(
        API_BASE_URL + '/lms/native/matriculas/' + id + '/admissao',
        { method: 'GET', cache: 'no-store', signal: controller.signal },
      );
      if (!response.ok) throw Error('PLAYER3_MARKER_ADMISSION_DENIED');
      const body = await response.json() as Admission;
      if (body.success !== true || body.data?.matricula_id !== id ||
          body.data.curso_id !== matricula.curso_id ||
          body.data.mode !== expectedMode ||
          body.data.native_package !== 'NOT_YET_ENABLED') {
        throw Error('PLAYER3_MARKER_SCOPE_CONFLICT');
      }
      if (!controller.signal.aborted) setMarkerCheck({ scope, admitted: true });
    })().catch(() => {
      if (!controller.signal.aborted) setMarkerCheck({ scope, admitted: false });
    });
    return () => controller.abort();
  }, [isMarkerCandidate,scope,id,expectedMode,matricula?.curso_id]);

  if (!validId || !Number.isSafeInteger(id) || id <= 0) {
    return <p role="alert">Identificador de matrícula inválido.</p>;
  }
  if (isLoading) return <p role="status">Carregando matrícula…</p>;
  if (!validEnrollment || !['native','scorm'].includes(matricula.tipo_conteudo)) {
    return <p role="alert">Curso Native indisponível para esta matrícula.</p>;
  }
  if (isMarkerCandidate && markerCheck?.scope !== scope) {
    return <p role="status">Verificando ativação Native autorizada…</p>;
  }
  if (isMarkerCandidate && markerCheck?.admitted !== true) {
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
        matriculaId={id}
        empresaId={matricula.empresa_id}
        cursoId={matricula.curso_id}
        title={matricula.titulo ?? 'Treinamento'}
        active={matricula.status === 'EM_ANDAMENTO'}
      />
    </main>
  );
}

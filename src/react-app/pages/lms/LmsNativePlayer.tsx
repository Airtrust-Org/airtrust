/**
 * Native V1: enrollment-bound staging preview, never a SCORM fallback.
 * Server admission controls tenant and environment; no completion action here.
 */
import { useNavigate, useParams } from 'react-router-dom';
import { useMatriculaDetalhe } from '@/react-app/hooks/useLms';
import Player3AuthenticatedStagingEntry from './player3/Player3AuthenticatedStagingEntry';

export default function LmsNativePlayer() {
  const { matriculaId } = useParams<{ matriculaId: string }>();
  const navigate = useNavigate();
  const validId = typeof matriculaId === 'string' && /^[1-9][0-9]{0,15}$/.test(matriculaId);
  const id = validId ? Number(matriculaId) : 0;
  const { data: matricula, isLoading } = useMatriculaDetalhe(id);

  if (!validId || !Number.isSafeInteger(id) || id <= 0) {
    return <p role="alert">Identificador de matrícula inválido.</p>;
  }
  if (isLoading) return <p role="status">Carregando matrícula…</p>;
  if (!matricula || matricula.id !== id || matricula.tipo_conteudo !== 'native') {
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

/**
 * HorasVooPage — Página standalone de Caderneta de Horas de Voo
 * Acessível por ADMIN/GESTOR (todos os pilotos) e INSTRUTOR/ALUNO (própria caderneta)
 * Rota: /horas-voo
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plane } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import Button from '@/react-app/components/Button';
import CadernetaHorasVoo from '@/react-app/pages/funcionarios/CadernetaHorasVoo';
import { useAuth } from '@/react-app/hooks/useAuth';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { useFuncionariosAtivos } from '@/react-app/hooks/qualificacoes/useFuncionariosAtivos';

export default function HorasVooPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, isGestor } = usePermissions();
  const canViewAll = isAdmin || isGestor;

  // Se admin/gestor, permite selecionar piloto; caso contrário usa o próprio ID
  const selfId = user?.funcionario_id ? Number(user.funcionario_id) : null;
  const [selectedId, setSelectedId] = useState<number | null>(selfId);

  const { data: funcionariosData } = useFuncionariosAtivos();
  const funcionarios: Array<{ id: number; nome: string; guerra?: string; cargo?: string }> =
    (funcionariosData as Array<{ id: number; nome: string; guerra?: string; cargo?: string }>) ||
    [];

  const pilotos = funcionarios.filter(
    (f) =>
      f.cargo?.toLowerCase().includes('piloto') ||
      f.cargo?.toLowerCase().includes('comandante') ||
      f.cargo?.toLowerCase().includes('copiloto') ||
      // fallback: exibe todos quando não há cargo definido
      !f.cargo,
  );

  const funcionarioAtual = funcionarios.find((f) => f.id === selectedId);
  const nomeAtual =
    funcionarioAtual?.nome ?? (selfId ? `Funcionário ${selfId}` : 'Selecione um piloto');

  return (
    <AppLayout>
      <div className="space-y-4">
        <PageHeader
          title="Caderneta de Horas de Voo"
          subtitle="Registro e totais de horas de voo por piloto — inclui saldo inicial, lançamentos e exportação"
          actions={
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Voltar
            </Button>
          }
        />

        {/* Seletor de piloto (visível somente para admin/gestor) */}
        {canViewAll && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Plane className="h-4 w-4 text-blue-600" />
                Piloto / Tripulante
              </div>
              <select
                value={selectedId ?? ''}
                onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Selecione um piloto —</option>
                {(pilotos.length > 0 ? pilotos : funcionarios).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                    {f.guerra ? ` (${f.guerra})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {selectedId ? (
          <CadernetaHorasVoo
            funcionarioId={selectedId}
            funcionarioNome={nomeAtual}
            canEdit={isAdmin || isGestor}
          />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-20 text-center">
            <Plane className="mb-3 h-10 w-10 text-slate-400" />
            <p className="text-sm text-slate-500">
              Selecione um piloto para visualizar a caderneta de horas de voo.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

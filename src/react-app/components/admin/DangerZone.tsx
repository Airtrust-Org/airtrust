/**
 * Danger Zone - Seção de ações destrutivas administrativas
 *
 * Permite apagar módulos completos do sistema para testes de importação.
 *
 * ⚠️ ADMIN ONLY ⚠️
 */

import { useState } from 'react';
import { AlertTriangle, Trash2, Database, Users, Award, Clock } from 'lucide-react';
import { ModalConfirmacaoDestrutiva } from './ModalConfirmacaoDestrutiva';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

interface ResetModule {
  id: string;
  title: string;
  description: string;
  confirmWord: string;
  icon: React.ReactNode;
  endpoint: string;
  impacto: string[];
}

const MODULES: ResetModule[] = [
  {
    id: 'funcionarios',
    title: 'Funcionários',
    description:
      'Apaga TODOS os funcionários cadastrados no sistema, incluindo suas habilitações, licenças e histórico de qualificações.',
    confirmWord: 'FUNCIONARIOS',
    icon: <Users size={24} />,
    endpoint: '/admin/reset/funcionarios',
    impacto: [
      'Todos os funcionários serão removidos',
      'Histórico de qualificações será perdido',
      'Habilitações e licenças serão apagadas',
      'Dados de sessões de treinamento serão mantidos (órfãos)',
    ],
  },
  {
    id: 'qualificacoes-tipos',
    title: 'Tipos de Qualificação',
    description:
      'Apaga TODOS os tipos de qualificação (CMA, Proficiência, etc) e o histórico associado.',
    confirmWord: 'TIPOS',
    icon: <Award size={24} />,
    endpoint: '/admin/reset/qualificacoes-tipos',
    impacto: [
      'Todos os tipos serão removidos (CMA, Proficiência, MLTE, etc)',
      'Histórico de qualificações será perdido',
      'Funcionários não serão afetados',
    ],
  },
  {
    id: 'qualificacoes-historico',
    title: 'Histórico de Qualificações',
    description:
      'Apaga TODO o histórico de qualificações (certificados, validades, datas de conclusão).',
    confirmWord: 'HISTORICO',
    icon: <Clock size={24} />,
    endpoint: '/admin/reset/qualificacoes-historico',
    impacto: [
      'Todo o histórico será removido',
      'Funcionários e tipos não serão afetados',
      'Mais seguro que os outros resets',
    ],
  },
];

export function DangerZone() {
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    module: string;
    success: boolean;
    deletedCount?: number;
    message?: string;
  } | null>(null);

  const currentModule = MODULES.find((m) => m.id === modalOpen);

  const handleReset = async (module: ResetModule) => {
    const token = getAccessToken();
    if (!token) {
      throw new Error('Token não encontrado. Faça login novamente.');
    }

    console.log('[DangerZone] Enviando requisição:', {
      endpoint: `${API_BASE_URL}${module.endpoint}`,
      hasToken: !!token,
      tokenPreview: token.substring(0, 20) + '...',
    });

    const response = await fetch(`${API_BASE_URL}${module.endpoint}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('[DangerZone] Response:', {
      status: response.status,
      ok: response.ok,
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || data.details || 'Erro ao executar reset');
    }

    setLastResult({
      module: module.id,
      success: true,
      deletedCount: data.deletedCount,
      message: data.message,
    });

    // Limpar mensagem após 10 segundos
    setTimeout(() => setLastResult(null), 10000);

    return data;
  };

  return (
    <div className="space-y-4">
      {/* Header tipo SettingsSectionIntro manual (tone danger) */}
      <section className="rounded-2xl border border-red-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              Operações destrutivas
            </div>
            <div className="mt-3 flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Zona de Perigo</h2>
                <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">
                  As ações abaixo são <strong>destrutivas e irreversíveis</strong>. Use apenas para
                  limpar o ambiente de testes antes de rodar importações limpas.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-red-100 px-6 py-4">
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm text-red-800">
              Todos os dados serão perdidos permanentemente. Certifique-se de ter um backup antes de prosseguir.
            </p>
          </div>
        </div>
      </section>

      {/* Resultado da última operação */}
      {lastResult && (
        <div
          className={`rounded-2xl border p-5 ${
            lastResult.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-3">
            <Database size={20} />
            <div>
              <strong>{lastResult.success ? '✅ Sucesso!' : '❌ Erro'}</strong>
              <p className="text-sm mt-1">
                {lastResult.message || `${lastResult.deletedCount || 0} registros apagados`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cards de Reset */}
      <div className="grid gap-4">
        {MODULES.map((module) => (
          <div
            key={module.id}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-colors hover:border-red-200"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 flex-1">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                  {module.icon}
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-slate-900 mb-1">{module.title}</h3>
                  <p className="text-sm text-slate-600 mb-3">{module.description}</p>

                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer hover:text-slate-700 font-medium">
                      Ver impacto detalhado
                    </summary>
                    <ul className="mt-2 ml-4 space-y-1 list-disc">
                      {module.impacto.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              </div>

              <button
                onClick={() => setModalOpen(module.id)}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
              >
                <Trash2 size={16} />
                Apagar Tudo
              </button>
            </div>
          </div>
        ))}
      </div>
      {/* Modal de Confirmação */}
      {currentModule && (
        <ModalConfirmacaoDestrutiva
          isOpen={modalOpen !== null}
          onClose={() => setModalOpen(null)}
          onConfirm={() => handleReset(currentModule)}
          title={`Apagar ${currentModule.title}?`}
          description={`${currentModule.description}\n\nImpacto:\n${currentModule.impacto
            .map((i) => `• ${i}`)
            .join(
              '\n',
            )}\n\nEsta ação NÃO PODE ser desfeita. Tenha certeza absoluta antes de prosseguir.`}
          confirmWord={currentModule.confirmWord}
          confirmWordLabel={`Digite "${currentModule.confirmWord}" para confirmar`}
          actionLabel={`Apagar ${currentModule.title}`}
        />
      )}
    </div>
  );
}

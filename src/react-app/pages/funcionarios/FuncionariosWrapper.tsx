import React, { Suspense, useState, useMemo } from 'react';
import { Plus, Upload, Download } from 'lucide-react';
import {
  PageHeader,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Button as UIButton,
} from '@/react-app/components/UI';
import { useFuncionarios } from '@/react-app/hooks/useFuncionarios';
import { ListaTab, CadastrosTab } from './tabs';
import { API_BASE_URL } from '@/react-app/config/api';
import { lazyWithRetry } from '@/react-app/utils/lazyWithRetry';
import type { FuncionarioCreate, FuncionarioUpdate } from '@/types';

const ModalFuncionario = lazyWithRetry(
  () => import('@/react-app/components/modals/ModalFuncionario'),
  'FuncionariosModalFuncionario',
);
const ImportarFuncionariosCSVModal = lazyWithRetry(
  () => import('@/react-app/components/ImportarFuncionariosCSVModal'),
  'FuncionariosImportarCSVModal',
);

/**
 * FuncionariosWrapper - Modernized Funcionários Module
 *
 * FASE 2 SPRINT 4: Refactoring with Design System
 * - PageHeader + Tabs + Table with Avatar
 * - Details Modal + Grid Cards
 * - Maintains backward compatibility
 */
export function FuncionariosWrapper() {
  const [activeTab, setActiveTab] = useState('lista');
  const {
    funcionarios,
    loading,
    error,
    criarFuncionario,
    atualizarFuncionario,
    carregarFuncionarios,
  } = useFuncionarios();
  const [modalAberto, setModalAberto] = useState(false);
  const [funcionarioSelecionado, setFuncionarioSelecionado] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const funcionariosLista = useMemo(() => {
    if (Array.isArray(funcionarios)) return funcionarios;
    // suportar formatos { data: [...] } ou { results: [...] }
    const shaped = funcionarios as unknown as { data?: unknown; results?: unknown };
    const data = (shaped?.data as unknown) || (shaped?.results as unknown);
    return Array.isArray(data) ? data : [];
  }, [funcionarios]);

  return (
    <div className="min-h-screen bg-background-light">
      {/* Page Header */}
      <div className="border-b border-slate-200 bg-white sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 md:px-8 py-4">
          <PageHeader
            title="Funcionários"
            description="Gerencie informações, documentos e histórico dos funcionários"
            action={
              <div className="flex gap-2">
                <UIButton
                  onClick={() => {
                    setFuncionarioSelecionado(null);
                    setModalAberto(true);
                  }}
                >
                  <Plus size={16} className="mr-2" />
                  Novo Funcionário
                </UIButton>
                <UIButton variant="secondary" onClick={() => setImportOpen(true)}>
                  <Upload size={16} className="mr-2" />
                  Importar
                </UIButton>
                <a
                  href={`${API_BASE_URL}/funcionarios/exportar`}
                  className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <Download size={16} className="mr-2" />
                  Exportar CSV
                </a>
              </div>
            }
          />
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 md:px-8 py-5">
        {/* Tabs Navigation */}
        <Tabs defaultValue="lista" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 border-b border-slate-200 -mx-4 px-4 md:-mx-8 md:px-8">
            <TabsTrigger value="lista">Lista</TabsTrigger>
            <TabsTrigger value="cadastros">Cadastros</TabsTrigger>
            <TabsTrigger value="importacao">Importação</TabsTrigger>
          </TabsList>

          <TabsContent value="lista" className="space-y-4">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <ListaTab funcionarios={funcionariosLista as any} loading={loading} />
          </TabsContent>

          <TabsContent value="cadastros" className="space-y-4">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <CadastrosTab funcionarios={funcionariosLista as any} loading={loading} />
          </TabsContent>

          <TabsContent value="importacao" className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Importação em massa</h3>
              <p className="text-sm text-slate-600 mb-4">
                Importe funcionários a partir de um arquivo CSV no padrão AirTrust. Você pode baixar
                o template e depois enviar.
              </p>
              <div className="flex gap-2">
                <UIButton onClick={() => setImportOpen(true)}>
                  <Upload size={16} className="mr-2" />
                  Importar CSV
                </UIButton>
                <a
                  href={`${API_BASE_URL}/templates/funcionarios.csv`}
                  download
                  className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <Download size={16} className="mr-2" />
                  Baixar Template
                </a>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Modal de Criar/Editar Funcionário */}
      {modalAberto && (
        <Suspense fallback={<div className="fixed inset-0 z-modal bg-black/30" />}>
          <ModalFuncionario
            aberto={modalAberto}
            funcionario={funcionarioSelecionado}
            onFechar={() => setModalAberto(false)}
            onSalvar={async (dados: Record<string, unknown>) => {
              try {
                if (funcionarioSelecionado?.id) {
                  await atualizarFuncionario(
                    String(funcionarioSelecionado.id),
                    dados as unknown as Partial<FuncionarioUpdate>,
                  );
                } else {
                  await criarFuncionario(dados as unknown as FuncionarioCreate);
                }
                setModalAberto(false);
                await carregarFuncionarios();
              } catch (e) {
                console.error('Erro ao salvar funcionário:', e);
              }
            }}
          />
        </Suspense>
      )}

      {/* Modal de Importação */}
      {importOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-modal bg-black/30" />}>
          <ImportarFuncionariosCSVModal
            isOpen={importOpen}
            onClose={() => setImportOpen(false)}
            onSuccess={() => {
              carregarFuncionarios();
              setActiveTab('lista');
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

export default FuncionariosWrapper;

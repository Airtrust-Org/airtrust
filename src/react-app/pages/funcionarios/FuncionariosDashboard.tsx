import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  PageHeader,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Button as UIButton,
} from '@/react-app/components/UI';
import { ListaFuncionarios } from './ListaFuncionarios';
import { Cadastros } from './Cadastros';

type AbaAtiva = 'nomes' | 'cadastros';

export default function FuncionariosDashboard() {
  const [activeTab, setActiveTab] = useState<AbaAtiva>('nomes');

  return (
    <div className="min-h-screen bg-background-light">
      {/* Page Header - Standardized across all modules */}
      <div className="border-b border-border-light bg-background-light sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 md:px-8 py-6">
          <PageHeader
            title="Funcionários"
            description="Licenças, Treinamentos e Pasta Virtual"
            action={
              <UIButton>
                <Plus size={16} className="mr-2" />
                Novo Funcionário
              </UIButton>
            }
          />
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 md:px-8 py-8">
        {/* Tabs Navigation - Standardized */}
        <Tabs
          defaultValue="nomes"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as AbaAtiva)}
        >
          <TabsList className="mb-6 border-b border-slate-200 -mx-4 px-4 md:-mx-8 md:px-8">
            <TabsTrigger value="nomes">Nomes</TabsTrigger>
            <TabsTrigger value="cadastros">Cadastros</TabsTrigger>
          </TabsList>

          <TabsContent value="nomes" className="space-y-6">
            <ListaFuncionarios />
          </TabsContent>

          <TabsContent value="cadastros" className="space-y-6">
            <Cadastros />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

import React from 'react';
import { toast } from 'sonner';

import { getAccessToken } from '@/react-app/config/api';
import { Upload, Download } from 'lucide-react';

interface ImportarUniversalProps {
  tipo: 'funcionarios' | 'treinamentos' | 'certificacoes' | 'simuladores' | 'manobras' | 'qualificacoes';
  onImportSuccess: () => void;
}

const IMPORTACAO_QUALIFICACOES_BLOQUEADA_MSG =
  'Importação de qualificações via ImportarUniversal está desabilitada neste componente legado. Use a tela dedicada de importação de qualificações.';

export const ImportarUniversal: React.FC<ImportarUniversalProps> = ({
  tipo,
  onImportSuccess
}) => {
  const [importing, setImporting] = React.useState(false);
  
  const tipoLabel = {
    funcionarios: 'Funcionários',
    treinamentos: 'Treinamentos',
    certificacoes: 'Certificações',
    simuladores: 'Simuladores',
    manobras: 'Manobras',
    qualificacoes: 'Qualificações'
  }[tipo];
  
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (tipo === 'qualificacoes') {
      toast.warning(IMPORTACAO_QUALIFICACOES_BLOQUEADA_MSG);
      e.target.value = '';
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.csv')) {
      toast.warning('Por favor, selecione um arquivo CSV');
      return;
    }
    
    setImporting(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const url = `/api/${tipo}/importar`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getAccessToken()}` },
        body: formData
      });
      
      const data = await response.json();
      
      if (data.success) {
        onImportSuccess();
      } else {
        toast.warning(`❌ Erro ao importar:\n\n${data.error}`);
      }
    } catch (error) {
      toast.warning(`❌ Erro ao importar:\n\n${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };
  
  const downloadTemplate = () => {
    if (tipo === 'qualificacoes') {
      toast.warning(IMPORTACAO_QUALIFICACOES_BLOQUEADA_MSG);
      return;
    }

    window.location.href = `/api/${tipo}/template`;
  };
  
  return (
    <div className="flex gap-2">
      <button
        onClick={downloadTemplate}
        className="flex items-center gap-2 px-4 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-50"
        title={`Baixar modelo CSV de ${tipoLabel}`}
      >
        <Download size={18} />
        Baixar Modelo
      </button>
      
      <label className={`flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer ${
        importing 
          ? 'bg-gray-400 cursor-not-allowed'
          : 'bg-primary hover:bg-primary/90'
      } text-white`}>
        {importing ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            Importando...
          </>
        ) : (
          <>
            <Upload size={18} />
            Importar CSV
          </>
        )}
        <input
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          disabled={importing}
          className="hidden"
        />
      </label>
    </div>
  );
};

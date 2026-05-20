import React from 'react';
import { useNavigate } from 'react-router-dom';

interface FichaSimulador {
  id: number;
  uuid?: string;
  ficha_uuid?: string;
  status_workflow: string;
  funcao_na_sessao: string;
  conceito_final?: string;
  aluno_nome?: string;
}

interface AcoesFichaProps {
  ficha: FichaSimulador;
}

const AcoesFicha: React.FC<AcoesFichaProps> = ({ ficha }) => {
  const navigate = useNavigate();

  const getUUID = () => {
    const uuid = ficha.ficha_uuid || ficha.uuid;
    console.log('🔍 DEBUG EXTRAÇÃO UUID:', {
      ficha_uuid: ficha.ficha_uuid,
      uuid: ficha.uuid,
      selectedUUID: uuid,
      isValid: uuid && uuid !== 'undefined' && uuid.length > 5
    });
    return uuid;
  };

  const handleVisualizarFicha = () => {
    const uuid = getUUID();
    const rota = `/simuladores/ficha/${uuid}/visualizar`;
    navigate(rota);
  };

  const handleEditarFicha = () => {
    const uuid = getUUID();
    const rota = `/simuladores/ficha/${uuid}/editar`;
    navigate(rota);
  };

  const handleAvaliarFicha = () => {
    const uuid = getUUID();
    const rota = `/simuladores/ficha/${uuid}/avaliar`;
    navigate(rota);
  };

  return (
    <div className="flex gap-2">
      <button 
        onClick={handleVisualizarFicha} 
        className="px-3 py-1 bg-primary/100 text-white rounded text-sm hover:bg-primary"
      >
        👁️ Visualizar
      </button>
      <button 
        onClick={handleEditarFicha} 
        className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
      >
        ✏️ Editar
      </button>
      <button 
        onClick={handleAvaliarFicha} 
        className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600"
      >
        📋 Avaliar
      </button>
    </div>
  );
};

export default AcoesFicha;

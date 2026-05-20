import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';

interface Agendamento {
  id: number;
  simulador_id: number;
  simulador_nome?: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  tipo_sessao: string;
  instrutor_id: number;
  instrutor_nome?: string;
  status: string;
  observacoes?: string;
  participantes: number[];
  participantes_nomes?: string[];
}

export function useAgendamentos() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgendamentos = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/agendamentos`);
      
      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setAgendamentos(data.data || data.agendamentos || []);
      } else {
        throw new Error(data.error || 'Erro desconhecido');
      }
    } catch (err) {
      console.error('Erro ao buscar agendamentos:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
      setAgendamentos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgendamentos();
  }, []);

  return { agendamentos, loading, error, refetch: fetchAgendamentos };
}

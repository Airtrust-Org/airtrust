import React, { useEffect, useState, useCallback } from 'react';
import { UserCheck, Plane, Briefcase, Building2 } from 'lucide-react';
import { API_BASE_URL } from '@/react-app/config/api';
import { useAuth } from '@/react-app/hooks/useAuth';

interface DashboardData {
  geral: {
    total: number;
    ativos: number;
    inativos: number;
    percentual_ativos: number;
  };
  por_aeronave: Array<{ aeronave: string; total: number; ativos: number }>;
  por_funcao: Array<{ funcao: string; total: number; ativos: number }>;
  por_setor: Array<{ setor: string; total: number; ativos: number }>;
  por_status: Array<{ status: string; total: number }>;
  qualificacoes: {
    funcionarios_com_qualificacoes: number;
    total_qualificacoes: number;
    qualificacoes_validas: number;
    qualificacoes_vencidas: number;
    percentual_validas: number;
  };
}

function normalizeAeronaveLabel(value: string): string {
  return ['S76', 'SK76'].includes(value.trim().toUpperCase()) ? 'SK76' : value;
}

export function DashboardStats() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/funcionarios/stats/dashboard`, { headers });

      if (!response.ok) {
        return;
      }

      const result = await response.json();

      if (result?.success && result?.data) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Grid Horizontal Compacto */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* Header com total de ativos */}
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg border border-emerald-300 p-3">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="w-4 h-4 text-emerald-700" />
            <h3 className="text-xs font-bold text-emerald-700 uppercase">Ativos</h3>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{data.geral.ativos}</p>
          <p className="text-xs text-emerald-600 mt-0.5">Funcionários ativos</p>
        </div>

        {/* Por Equipamento - Compacto */}
        <div className="bg-white rounded-lg border border-sky-200 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Plane className="w-4 h-4 text-sky-600" />
            <h3 className="text-xs font-bold text-slate-900 uppercase">Equipamentos</h3>
          </div>
          <div className="space-y-1.5">
            {data.por_aeronave.slice(0, 3).map((item, idx) => (
              <div key={idx}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700 truncate flex-1">
                    {normalizeAeronaveLabel(item.aeronave)}
                  </span>
                  <span className="text-sm font-bold text-sky-600 ml-2">{item.ativos}</span>
                </div>
              </div>
            ))}
          </div>
          {data.por_aeronave.length > 3 && (
            <p className="text-xs text-slate-400 mt-1">+{data.por_aeronave.length - 3} mais</p>
          )}
        </div>

        {/* Por Função - Compacto */}
        <div className="bg-white rounded-lg border border-purple-200 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase className="w-4 h-4 text-purple-600" />
            <h3 className="text-xs font-bold text-slate-900 uppercase">Funções</h3>
          </div>
          <div className="space-y-1.5">
            {data.por_funcao.slice(0, 3).map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 truncate flex-1">
                  {item.funcao}
                </span>
                <span className="text-sm font-bold text-purple-600 ml-2">{item.ativos}</span>
              </div>
            ))}
          </div>
          {data.por_funcao.length > 3 && (
            <p className="text-xs text-slate-400 mt-1">+{data.por_funcao.length - 3} mais</p>
          )}
        </div>

        {/* Por Setor - Compacto */}
        <div className="bg-white rounded-lg border border-indigo-200 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-bold text-slate-900 uppercase">Setores</h3>
          </div>
          <div className="space-y-1.5">
            {data.por_setor.slice(0, 3).map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 truncate flex-1">
                  {item.setor}
                </span>
                <span className="text-sm font-bold text-indigo-600 ml-2">{item.ativos}</span>
              </div>
            ))}
          </div>
          {data.por_setor.length > 3 && (
            <p className="text-xs text-slate-400 mt-1">+{data.por_setor.length - 3} mais</p>
          )}
        </div>
      </div>
    </div>
  );
}

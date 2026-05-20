/**
 * Tipos para o módulo de Qualificações
 */

export interface Exame {
  id: number;
  funcionario_id: number;
  tipo_exame: 'CMA' | 'ASO' | 'TOXICOLOGICO' | 'PSICOLOGICO';
  numero?: string;
  data_conclusao: string; // ISO 8601
  data_vencimento: string; // ISO 8601
  resultado?: string;
  observacoes?: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  
  nome?: string;
  matricula?: string;
}

export interface Check {
  id: number;
  funcionario_id: number;
  tipo_check: 'ICAO' | 'PF' | 'PC' | 'REQUALIFICACAO';
  nivel?: string;
  data_realizacao: string; // ISO 8601
  data_vencimento?: string; // ISO 8601
  instrutor?: string;
  resultado?: string;
  observacoes?: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  
  nome?: string;
  matricula?: string;
}

export interface ExamesResponse {
  success: boolean;
  data: Exame[];
  total: number;
  message?: string;
}

export interface ChecksResponse {
  success: boolean;
  data: Check[];
  total: number;
  message?: string;
}

export interface ExameStats {
  total: number;
  validos: number;
  vencidos: number;
  vencendo_30_dias: number;
}

export interface CheckStats {
  total: number;
  validos: number;
  vencidos: number;
  vencendo_30_dias: number;
}

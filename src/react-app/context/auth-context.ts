import { createContext } from 'react';

export interface User {
  id: number;
  email: string;
  nome: string;
  role: string; // ADMINISTRADOR | GESTOR | INSTRUTOR | ALUNO
  permissions: string[]; // Overrides individuais: 'GRANT:permissao' | 'DENY:permissao'
  funcionario_id: number | null;
}

export interface UsuarioEmpresa {
  id: number;
  nome: string;
  codigo: string;
  logo_url?: string | null;
  modulos_ativos?: string[] | null;
  role: string;
  is_primary: number;
  is_current: number;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  empresas: UsuarioEmpresa[];
  empresaAtualId: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  selectEmpresa: (empresaId: number) => Promise<void>;
  refreshEmpresas: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

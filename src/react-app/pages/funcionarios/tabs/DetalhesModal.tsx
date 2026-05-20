import React from 'react';
import { X, Mail, Phone, Calendar, Briefcase, MapPin, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/react-app/components/UI';
import Button from '@/react-app/components/Button';

interface Funcionario {
  id: number;
  nome: string;
  matricula: string;
  cargo: string;
  funcao?: string;
  departamento?: string;
  status?: 'ATIVO' | 'INATIVO' | 'AFASTADO' | 'FERIAS' | 'DEMITIDO';
  admissao: string;
  email?: string;
  telefone?: string;
  avatar_url?: string;
  setor?: string;
  cpf?: string;
  nascimento?: string;
  rg?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  salario?: number;
  data_demissao?: string;
}

interface DetalhesModalProps {
  funcionario: Funcionario;
  onClose: () => void;
}

export const DetalhesModal: React.FC<DetalhesModalProps> = ({ funcionario, onClose }) => {
  const safeFormatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return format(d, 'dd/MM/yyyy', { locale: ptBR });
  };

  const departamento =
    (funcionario as unknown as { setor?: string }).setor || funcionario.departamento;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header Sticky */}
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{funcionario.nome}</h2>
            <p className="text-sm text-slate-600 mt-1">Matrícula: {funcionario.matricula}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Fechar"
          >
            <X size={24} className="text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Avatar Section */}
          <div className="flex flex-col items-center py-6">
            {funcionario.avatar_url ? (
              <img
                src={funcionario.avatar_url}
                alt={funcionario.nome}
                className="w-24 h-24 rounded-full object-cover border-4 border-slate-200"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <UserIcon size={48} className="text-primary" />
              </div>
            )}
            <p className="mt-4 text-sm text-slate-600">{funcionario.funcao || funcionario.cargo}</p>
          </div>

          {/* Informações Pessoais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações Pessoais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Email */}
              {funcionario.email && (
                <div className="flex items-start gap-4">
                  <Mail size={20} className="text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Email</p>
                    <p className="text-slate-900 font-medium">{funcionario.email}</p>
                  </div>
                </div>
              )}

              {/* Telefone */}
              {funcionario.telefone && (
                <div className="flex items-start gap-4">
                  <Phone size={20} className="text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Telefone</p>
                    <p className="text-slate-900 font-medium">{funcionario.telefone}</p>
                  </div>
                </div>
              )}

              {/* Data de Nascimento */}
              {funcionario.nascimento && (
                <div className="flex items-start gap-4">
                  <Calendar size={20} className="text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Data de Nascimento
                    </p>
                    <p className="text-slate-900 font-medium">
                      {format(new Date(funcionario.nascimento), 'dd/MM/yyyy', {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </div>
              )}

              {/* CPF */}
              {funcionario.cpf && (
                <div className="flex items-start gap-4">
                  <UserIcon size={20} className="text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">CPF</p>
                    <p className="text-slate-900 font-medium font-mono">{funcionario.cpf}</p>
                  </div>
                </div>
              )}

              {/* RG */}
              {funcionario.rg && (
                <div className="flex items-start gap-4">
                  <UserIcon size={20} className="text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">RG</p>
                    <p className="text-slate-900 font-medium font-mono">{funcionario.rg}</p>
                  </div>
                </div>
              )}

              {/* Endereço */}
              {funcionario.endereco && (
                <div className="flex items-start gap-4">
                  <MapPin size={20} className="text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Endereço</p>
                    <p className="text-slate-900 font-medium">{funcionario.endereco}</p>
                    {(funcionario.cidade || funcionario.estado || funcionario.cep) && (
                      <p className="text-sm text-slate-600 mt-1">
                        {funcionario.cidade}, {funcionario.estado} {funcionario.cep}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Informações Profissionais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações Profissionais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Cargo */}
              <div className="flex items-start gap-4">
                <Briefcase size={20} className="text-slate-400 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Função</p>
                  <p className="text-slate-900 font-medium">
                    {(funcionario as any).funcao || funcionario.cargo}
                  </p>
                </div>
              </div>

              {/* Departamento */}
              {departamento && (
                <div className="flex items-start gap-4">
                  <Briefcase size={20} className="text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Departamento</p>
                    <p className="text-slate-900 font-medium">{departamento}</p>
                  </div>
                </div>
              )}

              {/* Data de Admissão */}
              <div className="flex items-start gap-4">
                <Calendar size={20} className="text-slate-400 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Data de Admissão</p>
                  <p className="text-slate-900 font-medium">
                    {safeFormatDate(funcionario.admissao)}
                  </p>
                </div>
              </div>

              {/* Salário */}
              {funcionario.salario && (
                <div className="flex items-start gap-4">
                  <Briefcase size={20} className="text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Salário</p>
                    <p className="text-slate-900 font-medium">
                      R${' '}
                      {funcionario.salario.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>
              )}

              {/* Data de Demissão */}
              {funcionario.data_demissao && (
                <div className="flex items-start gap-4">
                  <Calendar size={20} className="text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Data de Demissão
                    </p>
                    <p className="text-slate-900 font-medium">
                      {format(new Date(funcionario.data_demissao), 'dd/MM/yyyy', {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions Footer */}
          <div className="flex gap-3 justify-end pt-6 border-t border-slate-200">
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            <Button variant="primary" onClick={() => console.log('Editar funcionário')}>
              Editar Funcionário
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetalhesModal;

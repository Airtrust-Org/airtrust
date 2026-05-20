import { Mail, Phone, Calendar, User, Award, Plane } from 'lucide-react';

export default function AbaDadosPessoais({ funcionario }: any) {
  const calcularIdade = (dataNasc: string) => {
    if (!dataNasc) return 'N/A';
    const hoje = new Date();
    const nascimento = new Date(dataNasc);
    return Math.floor((hoje.getTime() - nascimento.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  };

  const campos = [
    { label: 'Nome Completo', valor: funcionario.nome, icone: User },
    { label: 'Nome de Guerra', valor: funcionario.guerra || 'N/A', icone: User },
    { label: 'Função', valor: funcionario.funcao_nome || funcionario.funcao, icone: Award },
    { label: 'Matrícula', valor: funcionario.matricula, icone: null },
    { label: 'CPF', valor: funcionario.cpf || 'N/A', icone: null },
    {
      label: 'Data de Nascimento',
      valor: funcionario.nascimento
        ? `${new Date(funcionario.nascimento + 'T00:00:00').toLocaleDateString(
            'pt-BR',
          )} (${calcularIdade(funcionario.nascimento)} anos)`
        : 'N/A',
      icone: Calendar,
    },
    { label: 'Código ANAC', valor: funcionario.codigo_anac || 'N/A', icone: null },
    { label: 'SISPAT', valor: funcionario.sispat || 'N/A', icone: null },
    { label: 'Prestador de Serviço', valor: funcionario.prestserv || 'N/A', icone: null },
    { label: 'E-mail', valor: funcionario.email || 'N/A', icone: Mail },
    { label: 'Telefone', valor: funcionario.telefone || 'N/A', icone: Phone },
    {
      label: 'Data de Admissão',
      valor: funcionario.admissao
        ? new Date(funcionario.admissao + 'T00:00:00').toLocaleDateString('pt-BR')
        : 'N/A',
      icone: Calendar,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Informações Pessoais */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          Informações Pessoais
        </h3>
        {campos.map((campo, index) => (
          <div key={index} className="flex items-center gap-3 py-2 border-b last:border-b-0">
            {campo.icone && <campo.icone className="w-5 h-5 text-gray-400" />}
            <div className="flex-1">
              <p className="text-sm text-gray-600">{campo.label}</p>
              <p className="font-medium">{campo.valor}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Equipamentos */}
      {funcionario.aeronaves && funcionario.aeronaves.length > 0 && (
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Plane className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Equipamentos Atribuídos</h3>
          </div>
          <div className="space-y-3">
            {funcionario.aeronaves.map((aeronave: any, index: number) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg">
                <Plane className="w-6 h-6 text-primary" />
                <div>
                  <p className="font-medium">{aeronave.modelo}</p>
                  <p className="text-sm text-gray-600">{aeronave.fabricante}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

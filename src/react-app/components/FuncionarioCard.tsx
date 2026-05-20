import {
  useFuncionario,
  useAtualizarFuncionario,
  useVerificarDependencias,
  useDeletarFuncionario,
} from '../hooks/useFuncionarios';
import { useState } from 'react';

export function FuncionarioCard({ id }: { id: number }) {
  const { data, isLoading } = useFuncionario(id, true);
  const updateMutation = useAtualizarFuncionario();
  const deleteMutation = useDeletarFuncionario();
  const depsQuery = useVerificarDependencias(id);
  const [editingNome, setEditingNome] = useState(false);
  const [novoNome, setNovoNome] = useState('');

  if (isLoading) return <div>Carregando...</div>;
  if (!data?.success) return <div>Não encontrado</div>;
  const funcionario = data.data;

  const handleToggleStatus = async () => {
    const next = funcionario.status === 'ATIVO' ? 'INATIVO' : 'ATIVO';
    await updateMutation.mutateAsync({ id, data: { status: next } });
  };

  const handleSalvarNome = async () => {
    if (!novoNome.trim()) return;
    await updateMutation.mutateAsync({ id, data: { nome: novoNome.trim() } });
    setEditingNome(false);
    setNovoNome('');
  };

  const handleSoftDelete = async () => {
    await deleteMutation.mutateAsync(id);
  };

  return (
    <div className="rounded border p-4 shadow bg-white space-y-6">
      <header className="flex items-start gap-4">
        {funcionario.foto_url && (
          <img
            src={funcionario.foto_url}
            alt={funcionario.nome}
            className="w-20 h-20 rounded-full object-cover"
          />
        )}
        <div className="flex-1">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            {funcionario.nome}
            {editingNome && (
              <div className="flex gap-2 ml-4">
                <input
                  className="border px-2 py-1 text-sm"
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="Novo nome"
                />
                <button
                  onClick={handleSalvarNome}
                  className="px-3 py-1 bg-primary text-white text-sm rounded"
                >
                  Salvar
                </button>
                <button
                  onClick={() => setEditingNome(false)}
                  className="px-3 py-1 bg-gray-300 text-sm rounded"
                >
                  Cancelar
                </button>
              </div>
            )}
          </h2>
          {funcionario.guerra && <p className="text-gray-600">"{funcionario.guerra}"</p>}
          <div className="flex gap-2 mt-2 flex-wrap">
            <span
              className={`px-2 py-1 text-xs rounded ${
                funcionario.status === 'ATIVO'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              {funcionario.status}
            </span>
            {funcionario.is_instrutor === 1 && (
              <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700">Instrutor</span>
            )}
            {funcionario.is_checador === 1 && (
              <span className="px-2 py-1 text-xs rounded bg-purple-100 text-purple-700">
                Checador
              </span>
            )}
            {funcionario.codigo_anac && (
              <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">
                CANAC: {funcionario.codigo_anac}
              </span>
            )}
          </div>
        </div>
      </header>

      <section>
        <h3 className="font-semibold mb-2">Perfil</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <Info label="Matrícula" value={funcionario.matricula} />
          <Info label="CPF" value={funcionario.cpf} />
          <Info label="Cargo" value={funcionario.cargo} />
          <Info label="Função" value={funcionario.funcao} />
          <Info label="Setor" value={funcionario.setor} />
          <Info label="Base" value={funcionario.base} />
          <Info label="Aeronave" value={funcionario.aeronave} />
          <Info label="Nível ICAO" value={funcionario.nivel_icao} />
          <Info label="Validade ICAO" value={formatDate(funcionario.validade_icao)} />
          <Info label="CMA" value={funcionario.cma} />
          <Info
            label="Validade CMA"
            value={formatDate(funcionario.validade_cma)}
            highlightNear
            expiry={funcionario.validade_cma}
          />
          <Info label="ASO" value={funcionario.aso} />
          <Info label="Validade ASO" value={formatDate(funcionario.validade_aso)} />
        </div>
      </section>

      <section>
        <h3 className="font-semibold mb-2">Endereço</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <Info label="CEP" value={funcionario.cep} />
          <Info label="Logradouro" value={funcionario.logradouro} />
          <Info label="Número" value={funcionario.numero} />
          <Info label="Complemento" value={funcionario.complemento} />
          <Info label="Bairro" value={funcionario.bairro} />
          <Info label="Cidade" value={funcionario.cidade} />
          <Info label="Estado" value={funcionario.estado} />
        </div>
      </section>

      <section>
        <h3 className="font-semibold mb-2">Contato</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <Info label="Telefone" value={funcionario.telefone} />
          <Info label="Telefone Emergência" value={funcionario.telefone_emergencia} />
          <Info label="Contato Emergência" value={funcionario.contato_emergencia_nome} />
        </div>
      </section>

      <DataList
        title={`Qualificações (${funcionario.qualificacoes?.length || 0})`}
        items={funcionario.qualificacoes}
        render={(q: any) => (
          <div
            className={`p-2 rounded border text-xs flex justify-between ${statusColor(
              q.status_qualificacao,
            )}`}
          >
            <span>{q.codigo || q.tipo_codigo}</span>
            <span>{q.status_qualificacao}</span>
          </div>
        )}
      />

      <DataList
        title={`Sessões Simulador (${funcionario.sessoes_simulador?.length || 0})`}
        items={funcionario.sessoes_simulador}
        render={(s: any) => (
          <div className="p-2 rounded border text-xs flex justify-between">
            <span>{s.tipo_sessao}</span>
            <span>{s.resultado || 'pendente'}</span>
          </div>
        )}
      />

      <div className="flex flex-wrap gap-3">
        <button
          className="px-4 py-2 bg-indigo-600 text-white rounded"
          onClick={() => setEditingNome(true)}
          disabled={updateMutation.isPending}
        >
          Editar Nome
        </button>
        <button
          className="px-4 py-2 bg-primary text-white rounded"
          onClick={handleToggleStatus}
          disabled={updateMutation.isPending}
        >
          {funcionario.status === 'ATIVO' ? 'Desativar' : 'Ativar'}
        </button>
        <button
          className="px-4 py-2 bg-red-600 text-white rounded"
          onClick={handleSoftDelete}
          disabled={deleteMutation.isPending || depsQuery.data?.data?.bloquear}
        >
          Soft Delete
        </button>
      </div>
      {depsQuery.data?.data?.bloquear && (
        <div className="text-sm text-red-600">Bloqueado: {depsQuery.data.data.motivo}</div>
      )}

      <div className="p-3 text-xs bg-blue-50 border border-blue-200 rounded">
        <strong>Reatividade:</strong> atualizações refletem em view, módulos e caches
        (qualificações, simulador, hospedagens, FRMS) + auditoria.
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  highlightNear,
  expiry,
}: {
  label: string;
  value?: string | null;
  highlightNear?: boolean;
  expiry?: string | null;
}) {
  const display = value || 'N/A';
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`font-medium ${highlightNear ? 'text-red-600' : ''}`}>{display}</div>
    </div>
  );
}

function DataList({
  title,
  items,
  render,
}: {
  title: string;
  items?: any[];
  render: (item: any) => JSX.Element;
}) {
  return (
    <section>
      <h3 className="font-semibold mb-2">{title}</h3>
      {items && items.length ? (
        <div className="space-y-1">{items.map(render)}</div>
      ) : (
        <div className="text-sm text-gray-500 italic">Nenhum registro</div>
      )}
    </section>
  );
}

function formatDate(d?: string | null) {
  if (!d) return 'N/A';
  try {
    return new Date(d).toLocaleDateString('pt-BR');
  } catch {
    return d;
  }
}

function statusColor(status?: string) {
  switch (status) {
    case 'VALIDA':
      return 'bg-green-50 border-green-200';
    case 'ATENCAO':
      return 'bg-yellow-50 border-yellow-200';
    case 'PROXIMA_VENCIMENTO':
      return 'bg-orange-50 border-orange-200';
    case 'VENCIDA':
      return 'bg-red-50 border-red-200';
    default:
      return 'bg-gray-50 border-gray-200';
  }
}

export default FuncionarioCard;

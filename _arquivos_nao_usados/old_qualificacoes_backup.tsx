/**
 * @file Qualificacoes.tsx
 * @description Página principal de gerenciamento de qualificações (treinamentos, exames e checks)
 * @module Pages/Qualificacoes
 * 
 * Funcionalidades principais:
 * - Listagem de qualificações com filtros e ordenação
 * - Criação e edição de qualificações via modais
 * - Upload e gerenciamento de certificados
 * - Configuração de colunas visíveis
 * - Importação em lote de qualificações
 * - Gerenciamento de tipos de qualificações
 * 
 * @requires react
 * @requires lucide-react
 * @requires ../components/CertificadoUpload
 * @requires ../components/CertificadoLista
 * @requires ./qualificacoes/ImportarQualificacoes
 * @requires ./qualificacoes/ConfigurarColunasQualificacoes
 * @requires ../components/shared/PageHeader
 * @requires ../components/qualificacoes/ModalEditarQualificacao
 * @requires ../components/qualificacoes/ModalNovaQualificacao
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Award,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Edit2,
  Trash2,
  Archive,
  History,
  Download,
  FolderOpen,
  Layers,
  Upload,
  Plus,
  Settings,
  Filter,
  X,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import CertificadoUpload from "../components/CertificadoUpload";
import CertificadoLista from "../components/CertificadoLista";
import ImportarQualificacoes from "./qualificacoes/ImportarQualificacoes";
import ConfigurarColunasQualificacoes, {
  carregarConfigColunas,
  type Coluna,
} from "./qualificacoes/ConfigurarColunasQualificacoes";
import ModalEditarQualificacao from "../components/qualificacoes/ModalEditarQualificacao";
import ModalNovaQualificacao from "../components/qualificacoes/ModalNovaQualificacao";
import PageHeader from "../components/shared/PageHeader";
import {
  QualificacoesHeader,
  QualificacoesFilters,
  QualificacoesTable,
} from "./qualificacoes/components";

type TipoQualificacao = "TREINAMENTO" | "EXAME" | "CHECK";
type StatusQualificacao =
  | "VALIDA"
  | "VENCENDO"
  | "VENCIDA"
  | "CANCELADA"
  | "RENOVADA";

interface Qualificacao {
  id: number;
  funcionario_id: number;
  funcionario_nome: string;
  funcionario_matricula: string;
  funcionario_codigo_anac?: string;
  tipo: TipoQualificacao;
  nome?: string;
  codigo: string;
  descricao?: string;
  data_conclusao?: string;
  data_realizado?: string;
  data_vencimento?: string;
  periodicidade_meses?: number;
  validade_meses?: number;
  dias_para_vencimento?: number;
  is_renovada?: number;
  status: StatusQualificacao;
  instrutor?: string;
  nota?: number;
  certificado_url?: string;
  arquivo_nome?: string;
}

interface FiltrosQualificacao {
  busca: string;
  tipo?: TipoQualificacao;
  status?: StatusQualificacao;
  funcionario_id?: number;
  funcionario_nome?: string;
  nome_qualificacao?: string;
  data_inicio?: string;
  data_fim?: string;
}

interface Stats {
  total: number;
  validas: number;
  vencendo: number;
  vencidas: number;
  renovadas?: number;
}

interface TipoQualificacaoCatalogo {
  id: number;
  tipo: TipoQualificacao;
  codigo: string;
  nome: string;
  descricao?: string;
  validade_meses: number;
  vencimento_tipo?: "DIA_EXATO" | "FIM_DO_MES";
  status: string;
}

export default function Qualificacoes() {
  const [qualificacoes, setQualificacoes] = useState<Qualificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState<FiltrosQualificacao>({ busca: "" });
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const itensPorPagina = 20;
  const [ordenacao, setOrdenacao] = useState<{
    campo: string;
    direcao: "asc" | "desc";
  }>({ campo: "data_vencimento", direcao: "asc" });

  const [stats, setStats] = useState<Stats>({
    total: 0,
    validas: 0,
    vencendo: 0,
    vencidas: 0,
    renovadas: 0,
  });

  const [mostrarFiltrosAvancados, setMostrarFiltrosAvancados] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<
    "historico" | "tipos" | "categorias"
  >("historico");
  const [tipos, setTipos] = useState<TipoQualificacaoCatalogo[]>([]);
  const [loadingTipos, setLoadingTipos] = useState(false);
  const [buscaTipos, setBuscaTipos] = useState("");
  const [filtroTipoTipo, setFiltroTipoTipo] = useState<TipoQualificacao | "">(
    "",
  );
  const [tipoEditando, setTipoEditando] =
    useState<TipoQualificacaoCatalogo | null>(null);
  const [mostrarModalImportar, setMostrarModalImportar] = useState(false);
  const [formTipo, setFormTipo] = useState({
    tipo: "" as TipoQualificacao | "",
    codigo: "",
    nome: "",
    descricao: "",
    validade_meses: 12,
    vencimento_tipo: "DIA_EXATO" as "DIA_EXATO" | "FIM_DO_MES",
    status: "ATIVO",
  });

  const [modalCertificado, setModalCertificado] = useState<Qualificacao | null>(
    null,
  );
  const [refreshCertificados, setRefreshCertificados] = useState(0);
  const [mostrarConfigurarColunas, setMostrarConfigurarColunas] =
    useState(false);
  const [refreshColunas, setRefreshColunas] = useState(0);
  const [configColunas, setConfigColunas] = useState<Coluna[]>([]);
  const [qualificacaoEditando, setQualificacaoEditando] = useState<
    number | null
  >(null);
  const [mostrarNovaQualificacao, setMostrarNovaQualificacao] = useState(false);

  // Carregar configuração de colunas
  useEffect(() => {
    setConfigColunas(carregarConfigColunas());
  }, [refreshColunas]);

  // Função para renderizar células na ordem correta
  const renderizarCelulas = (qual: Qualificacao) => {
    if (configColunas.length === 0) return null;

    return configColunas
      .filter((col) => col.visivel)
      .map((col) => {
        switch (col.id) {
          case "acoes":
            return (
              <td key="acoes" className="px-2 py-3 whitespace-nowrap">
                <div className="flex items-center gap-1">
                  {(qual.certificado_url || qual.arquivo_nome) && (
                    <button
                      onClick={() =>
                        handleDownload(
                          qual.id,
                          qual.arquivo_nome || `certificado-${qual.id}.pdf`,
                        )
                      }
                      disabled={downloading === qual.id}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded transition disabled:opacity-50"
                      title="Download certificado"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setModalCertificado(qual)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition"
                    title="Upload/Visualizar certificado"
                  >
                    <Upload className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleEditar(qual.id)}
                    className="p-1.5 text-gray-600 hover:bg-gray-50 rounded transition"
                    title="Editar"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() =>
                      handleExcluir(qual.id, qual.nome || qual.codigo)
                    }
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            );
          case "funcionario":
            return (
              <td key="funcionario" className="px-4 py-3 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      window.open(
                        `/pasta-virtual/${qual.funcionario_id}`,
                        "_blank",
                      )
                    }
                    className="text-blue-600 hover:text-blue-800 transition-colors"
                    title="Abrir Pasta Virtual"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </button>
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {qual.funcionario_nome}
                    </div>
                    <div className="text-xs text-gray-500">
                      {qual.funcionario_codigo_anac
                        ? `ANAC: ${qual.funcionario_codigo_anac}`
                        : `Mat: ${qual.funcionario_matricula}`}
                    </div>
                  </div>
                </div>
              </td>
            );
          case "tipo":
            return (
              <td key="tipo" className="px-4 py-3 whitespace-nowrap">
                {getTipoBadge(qual.tipo)}
              </td>
            );
          case "codigo":
            return (
              <td key="codigo" className="px-4 py-3 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {qual.codigo}
                </div>
              </td>
            );
          case "nome":
            return (
              <td key="nome" className="px-4 py-3">
                <div className="text-sm text-gray-900">{qual.nome || "-"}</div>
              </td>
            );
          case "realizado":
            return (
              <td
                key="realizado"
                className="px-4 py-3 whitespace-nowrap text-sm text-gray-500"
              >
                {qual.data_realizado
                  ? new Date(qual.data_realizado).toLocaleDateString("pt-BR")
                  : qual.data_conclusao
                    ? new Date(qual.data_conclusao).toLocaleDateString("pt-BR")
                    : "-"}
              </td>
            );
          case "validade":
            return (
              <td
                key="validade"
                className="px-4 py-3 whitespace-nowrap text-sm text-gray-500"
              >
                {qual.validade_meses ? `${qual.validade_meses} meses` : "-"}
              </td>
            );
          case "vencimento":
            return (
              <td
                key="vencimento"
                className="px-4 py-3 whitespace-nowrap text-sm text-gray-500"
              >
                {qual.data_vencimento
                  ? new Date(qual.data_vencimento).toLocaleDateString("pt-BR")
                  : "-"}
              </td>
            );
          case "status":
            return (
              <td key="status" className="px-4 py-3 whitespace-nowrap">
                {getStatusBadge(qual.status, qual.dias_para_vencimento)}
              </td>
            );
          default:
            return null;
        }
      });
  };

  // Função para renderizar colunas na ordem correta
  const renderizarColunas = () => {
    if (configColunas.length === 0) return null;

    return configColunas
      .filter((col) => col.visivel)
      .map((col) => {
        switch (col.id) {
          case "acoes":
            return (
              <th
                key="acoes"
                className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32"
              >
                Ações
              </th>
            );
          case "funcionario":
            return (
              <th
                key="funcionario"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition"
                onClick={() => handleOrdenar("funcionario_nome")}
              >
                <div className="flex items-center gap-2">
                  Funcionário
                  {getIconeOrdenacao("funcionario_nome")}
                </div>
              </th>
            );
          case "tipo":
            return (
              <th
                key="tipo"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition"
                onClick={() => handleOrdenar("tipo")}
              >
                <div className="flex items-center gap-2">
                  Tipo
                  {getIconeOrdenacao("tipo")}
                </div>
              </th>
            );
          case "codigo":
            return (
              <th
                key="codigo"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition"
                onClick={() => handleOrdenar("codigo")}
              >
                <div className="flex items-center gap-2">
                  Código
                  {getIconeOrdenacao("codigo")}
                </div>
              </th>
            );
          case "nome":
            return (
              <th
                key="nome"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition"
                onClick={() => handleOrdenar("nome")}
              >
                <div className="flex items-center gap-2">
                  Nome
                  {getIconeOrdenacao("nome")}
                </div>
              </th>
            );
          case "realizado":
            return (
              <th
                key="realizado"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Conclusão
              </th>
            );
          case "validade":
            return (
              <th
                key="validade"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Validade
              </th>
            );
          case "vencimento":
            return (
              <th
                key="vencimento"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition"
                onClick={() => handleOrdenar("data_vencimento")}
              >
                <div className="flex items-center gap-2">
                  Vencimento
                  {getIconeOrdenacao("data_vencimento")}
                </div>
              </th>
            );
          case "status":
            return (
              <th
                key="status"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition"
                onClick={() => handleOrdenar("status")}
              >
                <div className="flex items-center gap-2">
                  Status
                  {getIconeOrdenacao("status")}
                </div>
              </th>
            );
          default:
            return null;
        }
      });
  };

  const handleOrdenar = (campo: string) => {
    setOrdenacao((prev) => ({
      campo,
      direcao: prev.campo === campo && prev.direcao === "asc" ? "desc" : "asc",
    }));
  };

  const formatBR = (d: Date) => d.toLocaleDateString("pt-BR");
  const addMonths = (dateStr: string, months: number) => {
    const d = new Date(dateStr);
    d.setMonth(d.getMonth() + months);
    return d;
  };
  const endOfMonthOf = (dateStr: string, months: number) => {
    const d = new Date(dateStr);
    d.setMonth(d.getMonth() + months + 1, 0);
    return d;
  };

  const getIconeOrdenacao = (campo: string) => {
    if (ordenacao.campo !== campo) {
      return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
    }
    return ordenacao.direcao === "asc" ? (
      <ArrowUp className="h-4 w-4 text-blue-600" />
    ) : (
      <ArrowDown className="h-4 w-4 text-blue-600" />
    );
  };

  const handleEditar = (id: number) => {
    setQualificacaoEditando(id);
  };

  const handleExcluir = async (id: number, nome: string) => {
    if (!confirm(`Tem certeza que deseja excluir a qualificação "${nome}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/v2/qualificacoes/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        carregarQualificacoes();
      } else {
        alert(`Erro ao excluir: ${data.error}`);
      }
    } catch (error) {
      console.error("Erro ao excluir qualificação:", error);
      alert("Erro ao excluir qualificação");
    }
  };

  const [downloading, setDownloading] = useState<number | null>(null);

  const handleDownload = async (qualificacaoId: number, filename: string) => {
    try {
      setDownloading(qualificacaoId);

      const response = await fetch(
        `${window.location.origin}/api/v2/qualificacoes/${qualificacaoId}/certificado`,
      );

      if (!response.ok) {
        throw new Error("Erro ao baixar certificado");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `certificado-${qualificacaoId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      alert("Certificado baixado com sucesso!");
    } catch (error) {
      console.error("Erro ao baixar certificado:", error);
      alert("Erro ao baixar certificado");
    } finally {
      setDownloading(null);
    }
  };

  const carregarTipos = async () => {
    try {
      setLoadingTipos(true);
      const response = await fetch("/api/v2/tipos-qualificacoes");
      const data = await response.json();

      if (data.success) {
        setTipos(data.data || []);
      }
    } catch (error) {
      console.error("Erro ao carregar tipos:", error);
    } finally {
      setLoadingTipos(false);
    }
  };

  const handleEditarTipo = (tipo: TipoQualificacaoCatalogo) => {
    setTipoEditando(tipo);
    setFormTipo({
      tipo: tipo.tipo,
      codigo: tipo.codigo,
      nome: tipo.nome,
      descricao: tipo.descricao || "",
      validade_meses: tipo.validade_meses,
      vencimento_tipo: (tipo.vencimento_tipo as any) || "DIA_EXATO",
      status: tipo.status,
    });
  };

  const handleSalvarTipo = async () => {
    if (!tipoEditando) return;

    try {
      const houveMudanca =
        formTipo.validade_meses !== tipoEditando.validade_meses ||
        formTipo.vencimento_tipo !== (tipoEditando.vencimento_tipo as any) ||
        formTipo.nome !== tipoEditando.nome;
      if (houveMudanca) {
        const confirmar = window.confirm(
          "Atenção: Alterar nome, validade ou tipo de vencimento irá recalcular automaticamente TODAS as qualificações vinculadas a este tipo. Deseja continuar?",
        );
        if (!confirmar) return;
      }

      const response = await fetch(
        `/api/v2/tipos-qualificacoes/${tipoEditando.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formTipo),
        },
      );

      const data = await response.json();

      if (data.success) {
        // Tipo atualizado com sucesso
        setTipoEditando(null);
        carregarTipos();
      } else {
        alert(`Erro ao atualizar: ${data.error}`);
      }
    } catch (error) {
      console.error("Erro ao atualizar tipo:", error);
      alert("Erro ao atualizar tipo de qualificação");
    }
  };

  const handleExcluirTipo = async (id: number, nome: string) => {
    if (!confirm(`Tem certeza que deseja excluir o tipo "${nome}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/v2/tipos-qualificacoes/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        carregarTipos();
      } else {
        alert(`Erro ao excluir: ${data.error}`);
      }
    } catch (error) {
      console.error("Erro ao excluir tipo:", error);
      alert("Erro ao excluir tipo");
    }
  };

  const tiposFiltrados = tipos.filter((tipo) => {
    const matchBusca =
      !buscaTipos ||
      tipo.codigo.toLowerCase().includes(buscaTipos.toLowerCase()) ||
      tipo.nome.toLowerCase().includes(buscaTipos.toLowerCase());

    const matchTipo = !filtroTipoTipo || tipo.tipo === filtroTipoTipo;

    return matchBusca && matchTipo;
  });

  useEffect(() => {
    carregarQualificacoes();
  }, [filtros, paginaAtual, ordenacao]);

  useEffect(() => {
    const savedColumns = localStorage.getItem("qualificacoes_colunas");
    if (savedColumns) {
    }
  }, []);

  const carregarQualificacoes = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: paginaAtual.toString(),
        limit: itensPorPagina.toString(),
      });

      if (filtros.busca) params.append("busca", filtros.busca);
      if (filtros.tipo) params.append("tipo", filtros.tipo);
      if (filtros.status) params.append("status", filtros.status);
      if (filtros.funcionario_nome)
        params.append("funcionario_nome", filtros.funcionario_nome);
      if (filtros.nome_qualificacao)
        params.append("nome_qualificacao", filtros.nome_qualificacao);
      if (filtros.data_inicio)
        params.append("data_inicio", filtros.data_inicio);
      if (filtros.data_fim) params.append("data_fim", filtros.data_fim);

      params.append("orderBy", ordenacao.campo);
      params.append("orderDir", ordenacao.direcao);

      const response = await fetch(`/api/v2/qualificacoes?${params}`);
      const data = await response.json();

      if (data.success) {
        setQualificacoes(data.data || []);
        setStats(
          data.stats || {
            total: 0,
            validas: 0,
            vencendo: 0,
            vencidas: 0,
            renovadas: 0,
          },
        );
        setTotalPages(
          data.totalPages ||
            Math.ceil((data.stats?.total || 0) / itensPorPagina) ||
            1,
        );
        setTotal(data.stats?.total || 0);
        if (typeof data.page === "number") setPaginaAtual(data.page);
      }
    } catch (error) {
      console.error("Erro ao carregar qualificações:", error);
    } finally {
      setLoading(false);
    }
  };

  const aplicarFiltro = (campo: keyof FiltrosQualificacao, valor: any) => {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
    setPaginaAtual(1);
  };

  const limparFiltros = () => {
    setFiltros({ busca: "" });
    setPaginaAtual(1);
  };

  const getStatusBadge = (status: StatusQualificacao, dias?: number) => {
    const configs = {
      VALIDA: {
        color: "bg-green-100 text-green-800",
        icon: CheckCircle,
        label: "Válida",
      },
      VENCENDO: {
        color: "bg-yellow-100 text-yellow-800",
        icon: AlertTriangle,
        label: dias ? `Vence em ${dias} dias` : "Vencendo",
      },
      VENCIDA: {
        color: "bg-red-100 text-red-800",
        icon: XCircle,
        label: "Vencida",
      },
      CANCELADA: {
        color: "bg-gray-100 text-gray-800",
        icon: X,
        label: "Cancelada",
      },
      RENOVADA: {
        color: "bg-blue-100 text-blue-700",
        icon: Archive,
        label: "Renovada",
      },
    };

    const config = configs[status] || {
      color: "bg-gray-100 text-gray-800",
      icon: CheckCircle,
      label: status || "N/A",
    };
    const Icon = config.icon;

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}
      >
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
    );
  };

  const getTipoBadge = (tipo: TipoQualificacao) => {
    const configs = {
      TREINAMENTO: {
        color: "bg-blue-100 text-blue-700 border border-blue-300",
        label: "Treinamento",
      },
      EXAME: {
        color: "bg-purple-100 text-purple-700 border border-purple-300",
        label: "Exame",
      },
      CHECK: {
        color: "bg-emerald-100 text-emerald-700 border border-emerald-300",
        label: "Check",
      },
    };

    const config = configs[tipo];

    return (
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${config.color}`}
      >
        {config.label}
      </span>
    );
  };

  return (
    <div
      className="p-6 max-w-7xl mx-auto"
      key={`qualificacoes-${refreshColunas}`}
    >
      {/* Header */}
      <PageHeader
        title="Qualificações"
        subtitle="Gestão unificada de treinamentos, exames e checks"
      />

      {/* Abas */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setAbaAtiva("historico")}
            className={`${
              abaAtiva === "historico"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
          >
            <History className="h-4 w-4" />
            Histórico
          </button>
          <button
            onClick={() => {
              setAbaAtiva("tipos");
              if (tipos.length === 0) carregarTipos();
            }}
            className={`${
              abaAtiva === "tipos"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
          >
            <Settings className="h-4 w-4" />
            Tipos de Qualificações
          </button>
          <button
            onClick={() => setAbaAtiva("categorias")}
            className={`${
              abaAtiva === "categorias"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
          >
            <Layers className="h-4 w-4" />
            Categorias
          </button>
        </nav>
      </div>

      {/* Conteúdo da Aba Histórico */}
      {abaAtiva === "historico" && (
        <>
          {/* Barra de Ações */}
          <div className="flex gap-3 mb-6 justify-end">
            <button
              onClick={() => setMostrarModalImportar(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              <Upload className="h-4 w-4" />
              Importar
            </button>
            <button
              onClick={() => setMostrarNovaQualificacao(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <Plus className="h-4 w-4" />
              Nova Qualificação
            </button>
            <button
              onClick={() => setMostrarConfigurarColunas(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title="Configurar Colunas Visíveis"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Configurar Colunas</span>
            </button>
          </div>

          {/* Cards de Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.total}
                  </p>
                </div>
                <Award className="h-8 w-8 text-blue-500" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Válidas</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.validas}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Vencendo</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.vencendo}
                  </p>
                  <p className="text-xs text-yellow-600">≤ 30 dias</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Vencidas</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.vencidas}
                  </p>
                </div>
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow border-l-4 border-gray-400">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Renovadas</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.renovadas ?? stats.renovadas ?? 0}
                  </p>
                  <p className="text-xs text-gray-500">Histórico</p>
                </div>
                <Archive className="h-8 w-8 text-gray-400" />
              </div>
            </div>
          </div>

          {/* Filtros Avançados */}
          <div className="bg-white p-4 rounded-lg shadow mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">
                  Filtros Avançados
                </h3>
              </div>
              <button
                onClick={() =>
                  setMostrarFiltrosAvancados(!mostrarFiltrosAvancados)
                }
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {mostrarFiltrosAvancados ? "Ocultar" : "Mostrar mais filtros"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
              <select
                value={filtros.tipo || ""}
                onChange={(e) =>
                  aplicarFiltro("tipo", e.target.value || undefined)
                }
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">Todos os tipos</option>
                <option value="TREINAMENTO">Treinamentos</option>
                <option value="EXAME">Exames</option>
                <option value="CHECK">Checks</option>
              </select>

              <select
                value={filtros.status || ""}
                onChange={(e) =>
                  aplicarFiltro("status", e.target.value || undefined)
                }
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos os status</option>
                <option value="VALIDA">Válidas</option>
                <option value="VENCENDO">Vencendo (≤30 dias)</option>
                <option value="VENCIDA">Vencidas</option>
                <option value="RENOVADA">Renovadas</option>
                <option value="CANCELADA">Canceladas</option>
              </select>

              <input
                type="text"
                value={filtros.funcionario_nome || ""}
                onChange={(e) =>
                  aplicarFiltro("funcionario_nome", e.target.value || undefined)
                }
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="Filtrar por funcionário..."
              />

              <button
                onClick={limparFiltros}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
              >
                <X className="h-4 w-4" />
                Limpar
              </button>
            </div>

            {/* Filtros Avançados Adicionais */}
            {mostrarFiltrosAvancados && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-gray-200">
                <input
                  type="text"
                  value={filtros.nome_qualificacao || ""}
                  onChange={(e) =>
                    aplicarFiltro(
                      "nome_qualificacao",
                      e.target.value || undefined,
                    )
                  }
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Nome da qualificação..."
                />

                <input
                  type="date"
                  value={filtros.data_inicio || ""}
                  onChange={(e) =>
                    aplicarFiltro("data_inicio", e.target.value || undefined)
                  }
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Data início"
                />

                <input
                  type="date"
                  value={filtros.data_fim || ""}
                  onChange={(e) =>
                    aplicarFiltro("data_fim", e.target.value || undefined)
                  }
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Data fim"
                />
              </div>
            )}
          </div>

          {/* Tabela */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>{renderizarColunas()}</tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-6 py-12 text-center text-gray-500"
                      >
                        Carregando...
                      </td>
                    </tr>
                  ) : qualificacoes.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-6 py-12 text-center text-gray-500"
                      >
                        Nenhuma qualificação encontrada
                      </td>
                    </tr>
                  ) : (
                    qualificacoes.map((qual) => (
                      <tr key={qual.id} className="hover:bg-gray-50">
                        {renderizarCelulas(qual)}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                  disabled={paginaAtual === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() =>
                    setPaginaAtual((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={paginaAtual >= totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Mostrando{" "}
                    <span className="font-medium">
                      {(paginaAtual - 1) * itensPorPagina + 1}
                    </span>{" "}
                    a{" "}
                    <span className="font-medium">
                      {Math.min(paginaAtual * itensPorPagina, total)}
                    </span>{" "}
                    de <span className="font-medium">{total}</span> resultados
                    (página {paginaAtual} de {totalPages})
                  </p>
                </div>
                <div>
                  <nav
                    className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                    aria-label="Pagination"
                  >
                    <button
                      onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                      disabled={paginaAtual === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <span className="sr-only">Anterior</span>←
                    </button>
                    {/* Números de páginas */}
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .slice(
                        Math.max(0, paginaAtual - 3),
                        Math.max(0, paginaAtual - 3) + 5,
                      )
                      .map((page) => (
                        <button
                          key={page}
                          onClick={() => setPaginaAtual(page)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            page === paginaAtual
                              ? "z-10 bg-blue-600 border-blue-600 text-white"
                              : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    <button
                      onClick={() =>
                        setPaginaAtual((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={paginaAtual >= totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <span className="sr-only">Próxima</span>→
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Conteúdo da Aba Tipos */}
      {abaAtiva === "tipos" && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Tipos de Qualificações Cadastrados
              </h2>
              <div className="flex gap-3">
                <button
                  onClick={() => setMostrarModalImportar(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  <Upload className="h-4 w-4" />
                  Importar Tipos
                </button>
                <button
                  onClick={() =>
                    (window.location.href =
                      "/configuracoes/catalogo-treinamentos")
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  <Plus className="h-4 w-4" />
                  Novo Tipo
                </button>
              </div>
            </div>

            {/* Filtros da Aba Tipos */}
            <div className="flex gap-3 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por código ou nome..."
                  value={buscaTipos}
                  onChange={(e) => setBuscaTipos(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <select
                value={filtroTipoTipo}
                onChange={(e) =>
                  setFiltroTipoTipo(e.target.value as TipoQualificacao | "")
                }
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">Todos os tipos</option>
                <option value="TREINAMENTO">Treinamentos</option>
                <option value="EXAME">Exames</option>
                <option value="CHECK">Checks</option>
              </select>
              {(buscaTipos || filtroTipoTipo) && (
                <button
                  onClick={() => {
                    setBuscaTipos("");
                    setFiltroTipoTipo("");
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  <X className="h-4 w-4" />
                  Limpar
                </button>
              )}
            </div>

            {loadingTipos ? (
              <div className="text-center py-12 text-gray-500">
                Carregando...
              </div>
            ) : tipos.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                Nenhum tipo cadastrado
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Tipo
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Código
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Nome
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Validade
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {tiposFiltrados.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-6 py-12 text-center text-gray-500"
                        >
                          Nenhum tipo encontrado
                        </td>
                      </tr>
                    ) : (
                      tiposFiltrados.map((tipo) => (
                        <tr key={tipo.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${
                                tipo.tipo === "TREINAMENTO"
                                  ? "bg-blue-100 text-blue-700 border border-blue-300"
                                  : tipo.tipo === "EXAME"
                                    ? "bg-purple-100 text-purple-700 border border-purple-300"
                                    : "bg-green-100 text-green-700 border border-green-300"
                              }`}
                            >
                              {tipo.tipo}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            {tipo.codigo}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {tipo.nome}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {tipo.validade_meses} meses
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${
                                tipo.status === "ATIVO"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {tipo.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEditarTipo(tipo)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition"
                                title="Editar"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() =>
                                  handleExcluirTipo(tipo.id, tipo.nome)
                                }
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded transition"
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conteúdo da Aba Categorias */}
      {abaAtiva === "categorias" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Categorias de Qualificações
              </h2>
              <p className="text-gray-600 mt-1">
                Gerencie as categorias para tipos de qualificação e treinamentos
              </p>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              <Plus className="h-4 w-4" />
              Nova Categoria
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Card CHECK */}
            <div className="bg-white rounded-lg border-2 border-gray-200 p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <h3 className="text-lg font-bold text-gray-900">CHECK</h3>
                </div>
                <div className="flex gap-2">
                  <button
                    className="p-1.5 text-gray-600 hover:bg-gray-50 rounded transition"
                    title="Editar"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-600">Código:</span>
                  <p className="font-medium text-gray-900">CHECK</p>
                </div>
                <div>
                  <span className="text-gray-600">Descrição:</span>
                  <p className="text-gray-700">
                    Verificações de proficiência e competência
                  </p>
                </div>
              </div>
            </div>

            {/* Card EXAME */}
            <div className="bg-white rounded-lg border-2 border-gray-200 p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  <h3 className="text-lg font-bold text-gray-900">EXAME</h3>
                </div>
                <div className="flex gap-2">
                  <button
                    className="p-1.5 text-gray-600 hover:bg-gray-50 rounded transition"
                    title="Editar"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-600">Código:</span>
                  <p className="font-medium text-gray-900">EXAME</p>
                </div>
                <div>
                  <span className="text-gray-600">Descrição:</span>
                  <p className="text-gray-700">
                    Exames médicos e avaliações de saúde
                  </p>
                </div>
              </div>
            </div>

            {/* Card QUALIDADE */}
            <div className="bg-white rounded-lg border-2 border-gray-200 p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-pink-500"></div>
                  <h3 className="text-lg font-bold text-gray-900">QUALIDADE</h3>
                </div>
                <div className="flex gap-2">
                  <button
                    className="p-1.5 text-gray-600 hover:bg-gray-50 rounded transition"
                    title="Editar"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-600">Código:</span>
                  <p className="font-medium text-gray-900">QUALIDADE</p>
                </div>
                <div>
                  <span className="text-gray-600">Descrição:</span>
                  <p className="text-gray-700"></p>
                </div>
              </div>
            </div>

            {/* Card TREINAMENTO DE VOO */}
            <div className="bg-white rounded-lg border-2 border-gray-200 p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <h3 className="text-lg font-bold text-gray-900">
                    TREINAMENTO DE VOO
                  </h3>
                </div>
                <div className="flex gap-2">
                  <button
                    className="p-1.5 text-gray-600 hover:bg-gray-50 rounded transition"
                    title="Editar"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-600">Código:</span>
                  <p className="font-medium text-gray-900">TREINAMENTO_VOO</p>
                </div>
                <div>
                  <span className="text-gray-600">Descrição:</span>
                  <p className="text-gray-700">
                    Treinamentos práticos em simulador e aeronave
                  </p>
                </div>
              </div>
            </div>

            {/* Card TREINAMENTO TEÓRICO */}
            <div className="bg-white rounded-lg border-2 border-gray-200 p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <h3 className="text-lg font-bold text-gray-900">
                    TREINAMENTO TEÓRICO
                  </h3>
                </div>
                <div className="flex gap-2">
                  <button
                    className="p-1.5 text-gray-600 hover:bg-gray-50 rounded transition"
                    title="Editar"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-600">Código:</span>
                  <p className="font-medium text-gray-900">
                    TREINAMENTO_TEORICO
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Descrição:</span>
                  <p className="text-gray-700">
                    Treinamentos em sala de aula e cursos teóricos
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição de Tipo */}
      {tipoEditando && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  Editar Tipo de Qualificação
                </h2>
                <button
                  onClick={() => setTipoEditando(null)}
                  className="text-gray-400 hover:text-gray-600 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-5">
                {/* Nome */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Nome do Tipo *
                  </label>
                  <input
                    type="text"
                    value={formTipo.nome}
                    onChange={(e) =>
                      setFormTipo({ ...formTipo, nome: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ex: Conhecimentos Gerais de Aeronave"
                    required
                  />
                </div>

                {/* Código e Tipo */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Código *
                    </label>
                    <input
                      type="text"
                      value={formTipo.codigo}
                      onChange={(e) =>
                        setFormTipo({
                          ...formTipo,
                          codigo: e.target.value.toUpperCase(),
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ex: F1"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Código único identificador
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Tipo *
                    </label>
                    <select
                      value={formTipo.tipo}
                      onChange={(e) =>
                        setFormTipo({
                          ...formTipo,
                          tipo: e.target.value as TipoQualificacao,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    >
                      <option value="">Selecione...</option>
                      <option value="TREINAMENTO">Treinamento</option>
                      <option value="EXAME">Exame</option>
                      <option value="CHECK">Check</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Classificação do tipo
                    </p>
                  </div>
                </div>

                {/* Descrição */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Descrição
                  </label>
                  <textarea
                    value={formTipo.descricao}
                    onChange={(e) =>
                      setFormTipo({ ...formTipo, descricao: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                    placeholder="Descrição detalhada do tipo, objetivos e conteúdo..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Informações complementares sobre o tipo
                  </p>
                </div>

                {/* Configurações de Validade */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">
                    Configurações de Validade
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Validade (meses) *
                      </label>
                      <input
                        type="number"
                        value={formTipo.validade_meses}
                        onChange={(e) =>
                          setFormTipo({
                            ...formTipo,
                            validade_meses: parseInt(e.target.value) || 12,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        min="1"
                        max="120"
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Período entre 1 e 120 meses
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Vencimento *
                      </label>
                      <select
                        value={formTipo.vencimento_tipo}
                        onChange={(e) =>
                          setFormTipo({
                            ...formTipo,
                            vencimento_tipo: e.target.value as
                              | "DIA_EXATO"
                              | "FIM_DO_MES",
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      >
                        <option value="DIA_EXATO">No mesmo dia do mês</option>
                        <option value="FIM_DO_MES">No último dia do mês</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        {(() => {
                          const base = new Date();
                          const baseStr = base.toISOString().slice(0, 10);
                          const meses = formTipo.validade_meses || 12;
                          const diaExato = formatBR(addMonths(baseStr, meses));
                          const fimMes = formatBR(endOfMonthOf(baseStr, meses));
                          return formTipo.vencimento_tipo === "FIM_DO_MES"
                            ? `Exemplo: hoje + ${meses} meses → ${fimMes}`
                            : `Exemplo: hoje + ${meses} meses → ${diaExato}`;
                        })()}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Status *
                      </label>
                      <select
                        value={formTipo.status}
                        onChange={(e) =>
                          setFormTipo({ ...formTipo, status: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      >
                        <option value="ATIVO">Ativo</option>
                        <option value="INATIVO">Inativo</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Disponibilidade do tipo
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botões */}
              <div className="flex gap-3 mt-6 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setTipoEditando(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSalvarTipo}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition font-medium"
                >
                  Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Certificados */}
      {modalCertificado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Gerenciar Certificado
                </h2>
                <p className="text-gray-600 mt-1">
                  {modalCertificado.codigo} - {modalCertificado.nome}
                </p>
                <p className="text-sm text-gray-500">
                  Funcionário: {modalCertificado.funcionario_nome}
                </p>
              </div>
              <button
                onClick={() => setModalCertificado(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-8">
              {/* Upload */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Fazer Upload</h3>
                <CertificadoUpload
                  qualificacaoId={modalCertificado.id}
                  funcionarioId={modalCertificado.funcionario_id}
                  dataDocumento={modalCertificado.data_conclusao}
                  onUploadSuccess={() =>
                    setRefreshCertificados((prev) => prev + 1)
                  }
                />
              </div>

              <hr />

              {/* Lista */}
              <div>
                <CertificadoLista
                  funcionarioId={modalCertificado.funcionario_id}
                  refreshTrigger={refreshCertificados}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Importação */}
      {mostrarModalImportar && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Importar Qualificações
              </h2>
              <button
                onClick={() => setMostrarModalImportar(false)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6">
              <ImportarQualificacoes
                onImportSuccess={() => {
                  setMostrarModalImportar(false);
                  carregarQualificacoes();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Configurar Colunas - Completo */}
      {mostrarConfigurarColunas && (
        <ConfigurarColunasQualificacoes
          onClose={() => setMostrarConfigurarColunas(false)}
          onSave={() => {
            setRefreshColunas((prev) => prev + 1);
            setMostrarConfigurarColunas(false);
          }}
        />
      )}

      {/* Modal Editar Qualificação */}
      {qualificacaoEditando && (
        <ModalEditarQualificacao
          qualificacaoId={qualificacaoEditando}
          onClose={() => setQualificacaoEditando(null)}
          onSave={() => {
            carregarQualificacoes();
            setQualificacaoEditando(null);
          }}
        />
      )}

      {/* Modal Nova Qualificação */}
      {mostrarNovaQualificacao && (
        <ModalNovaQualificacao
          onClose={() => setMostrarNovaQualificacao(false)}
          onSave={() => {
            carregarQualificacoes();
            setMostrarNovaQualificacao(false);
          }}
        />
      )}
    </div>
  );
}

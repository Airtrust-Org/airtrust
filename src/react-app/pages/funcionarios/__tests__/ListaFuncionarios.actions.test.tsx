import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListaFuncionarios } from "../ListaFuncionarios";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/react-app/hooks/useAuth", () => ({
  useAuth: () => ({
    token: "test-token",
  }),
}));

vi.mock("@/react-app/hooks/useDebounce", () => ({
  useDebounce: (value) => value,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

let lastModalProps = null;
vi.mock("../ModalFuncionario", () => ({
  default: (props) => {
    lastModalProps = props;
    return props.aberto ? <div data-testid="modal-funcionario">Modal Aberto para {props.funcionario?.nome}</div> : null;
  },
}));

vi.mock("../ConfigurarColunas", async (importOriginal) => ({
  ...(await importOriginal()),
  default: () => null,
}));

vi.mock("../AdicionarFiltro", () => ({
  default: () => null,
}));

vi.mock("@/react-app/components/UI/Skeleton", () => ({
  SkeletonTable: () => <div>loading</div>,
}));

vi.mock("@/react-app/components/UI/EmptyState", () => ({
  EmptyState: ({ title, description }) => (
    <div>
      <div>{title}</div>
      <div>{description}</div>
    </div>
  ),
}));

vi.mock("@/react-app/utils/confirmDialog", () => ({
  confirmDialog: vi.fn(async () => false),
}));

const mockFetch = vi.fn();

const baseProps = {
  statusFilter: "ativos",
  funcaoFilter: "",
  aeronaveFilter: "",
  quinzenaFilter: "",
  setorFilter: [],
  configColunasAberto: false,
  onToggleConfigColunas: vi.fn(),
  showModalNovoFuncionario: false,
  onCloseModalNovoFuncionario: vi.fn(),
};

describe("ListaFuncionarios action buttons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastModalProps = null;
    vi.stubGlobal("fetch", mockFetch);
    localStorage.clear();
  });

  it("renders direct Editar button alongside Pasta 360 and More Actions", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            id: 29,
            nome: "Silvio Cesar de Sant Anna",
            guerra: "Santanna",
            funcao: "Comandante",
            setor: "Tripulação",
            aeronave: "SK76",
            status: "ATIVO",
            ativo: 1,
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 50,
          totalPages: 1,
        },
      }),
    });

    render(<ListaFuncionarios {...baseProps} termoBusca="" />);

    await waitFor(() => {
      expect(screen.getByText("Silvio Cesar de Sant Anna")).toBeInTheDocument();
    });

    const pasta360Button = screen.getByTitle("Abrir perfil");
    expect(pasta360Button).toBeInTheDocument();

    const directEditButtons = screen.getAllByTitle("Editar");
    expect(directEditButtons.length).toBeGreaterThanOrEqual(1);

    const moreActionsButton = screen.getByTitle("Mais ações");
    expect(moreActionsButton).toBeInTheDocument();

    fireEvent.click(directEditButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("modal-funcionario")).toBeInTheDocument();
      expect(screen.getByText(/Modal Aberto para Silvio Cesar de Sant Anna/)).toBeInTheDocument();
    });
  });
});

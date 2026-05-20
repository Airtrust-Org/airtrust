/**
 * 📋 GUIA DE IMPLEMENTAÇÃO - DESIGN SYSTEM GLOBAL
 *
 * Como aplicar o novo design a todas as páginas do AirTrust
 */

// ========== PASSO 1: IMPORTAR CSS GLOBAL ==========
// Em: src/react-app/main.tsx ou App.tsx
import '@/react-app/styles/design-system-global.css';

// ========== PASSO 2: IMPORTAR DESIGN SYSTEM TS ==========
// Em qualquer componente de página:
import { DesignSystemGlobal } from '@/react-app/styles/design-system-global';

// ========== PASSO 3: EXEMPLOS DE IMPLEMENTAÇÃO ==========

/**
 * EXEMPLO 1: Page Container com Título
 */
export function MinhaPage() {
  return (
    <div
      className={`${DesignSystemGlobal.spacing.pageContainer} ${DesignSystemGlobal.gradients.pageDefault}`}
    >
      {/* Título */}
      <div className={DesignSystemGlobal.spacing.sectionMargin}>
        <h1 className={DesignSystemGlobal.typography.h1}>Meu Módulo</h1>
        <p className={DesignSystemGlobal.typography.subtitle1}>Descrição do módulo</p>
      </div>

      {/* Conteúdo */}
    </div>
  );
}

/**
 * EXEMPLO 2: Dashboard Cards
 */
function DashboardCards() {
  return (
    <div className={`grid ${DesignSystemGlobal.grid.cols5} ${DesignSystemGlobal.grid.gap}`}>
      <div className={DesignSystemGlobal.cards.base}>
        <div className={DesignSystemGlobal.spacing.componentGap}>
          <p className={DesignSystemGlobal.typography.label}>Total</p>
          <p className="text-3xl font-bold text-primary">42</p>
        </div>
      </div>
    </div>
  );
}

/**
 * EXEMPLO 3: Botões
 */
function Buttons() {
  return (
    <div className="flex gap-4">
      <button className={DesignSystemGlobal.buttons.primary}>Primário</button>
      <button className={DesignSystemGlobal.buttons.secondary}>Secundário</button>
      <button className={DesignSystemGlobal.buttons.ghost}>Ghost</button>
      <button className={DesignSystemGlobal.buttons.danger}>Deletar</button>
    </div>
  );
}

/**
 * EXEMPLO 4: Tabela
 */
function Tabela() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className={DesignSystemGlobal.tables.header}>Coluna 1</th>
            <th className={DesignSystemGlobal.tables.header}>Coluna 2</th>
          </tr>
        </thead>
        <tbody>
          <tr className={DesignSystemGlobal.tables.row}>
            <td className={DesignSystemGlobal.tables.cell}>Dados</td>
            <td className={DesignSystemGlobal.tables.cell}>Dados</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * EXEMPLO 5: Tabs
 */
function Tabs() {
  const [activeTab, setActiveTab] = useState('tab1');

  return (
    <div>
      <div className={DesignSystemGlobal.tabs.container}>
        <button
          className={`${DesignSystemGlobal.tabs.tab} ${
            activeTab === 'tab1'
              ? DesignSystemGlobal.tabs.tabActive
              : DesignSystemGlobal.tabs.tabInactive
          }`}
          onClick={() => setActiveTab('tab1')}
        >
          Tab 1
        </button>
        <button
          className={`${DesignSystemGlobal.tabs.tab} ${
            activeTab === 'tab2'
              ? DesignSystemGlobal.tabs.tabActive
              : DesignSystemGlobal.tabs.tabInactive
          }`}
          onClick={() => setActiveTab('tab2')}
        >
          Tab 2
        </button>
      </div>
    </div>
  );
}

/**
 * EXEMPLO 6: Badges Status
 */
function StatusBadges() {
  return (
    <div className="flex gap-2">
      <span className={DesignSystemGlobal.badges.valid}>✓ Válido</span>
      <span className={DesignSystemGlobal.badges.expiring}>⚠ Vencendo</span>
      <span className={DesignSystemGlobal.badges.expired}>✕ Vencida</span>
      <span className={DesignSystemGlobal.badges.pending}>◯ Pendente</span>
    </div>
  );
}

/**
 * EXEMPLO 7: Inputs
 */
function Inputs() {
  return (
    <div className="space-y-4">
      <input type="text" placeholder="Digite algo..." className={DesignSystemGlobal.inputs.base} />
      <input
        type="text"
        placeholder="Pequeno"
        className={`${DesignSystemGlobal.inputs.base} ${DesignSystemGlobal.inputs.small}`}
      />
      <input
        type="text"
        placeholder="Grande"
        className={`${DesignSystemGlobal.inputs.base} ${DesignSystemGlobal.inputs.large}`}
      />
    </div>
  );
}

/**
 * EXEMPLO 8: Loading State
 */
function LoadingState() {
  return (
    <div className={DesignSystemGlobal.loading}>
      <div className={DesignSystemGlobal.loadingSpinner} />
      <p className="text-gray-600 font-medium mt-4">Carregando...</p>
    </div>
  );
}

/**
 * EXEMPLO 9: Empty State
 */
function EmptyState() {
  return (
    <div className={DesignSystemGlobal.emptyState}>
      <div className={DesignSystemGlobal.emptyStateIcon}>📭</div>
      <p className={DesignSystemGlobal.emptyStateText}>Nenhum dado encontrado</p>
    </div>
  );
}

/**
 * EXEMPLO 10: Card com Conteúdo
 */
function CardExemplo() {
  return (
    <div className={DesignSystemGlobal.cards.base}>
      <div className="p-6">
        <h3 className={DesignSystemGlobal.typography.h5}>Título do Card</h3>
        <p className={DesignSystemGlobal.typography.body2}>Conteúdo do card</p>
      </div>
    </div>
  );
}

// ========== PÁGINAS PARA APLICAR ==========
/**
 * Aplicar o design system a estas páginas (prioridade):
 *
 * 1. ✅ Habilitações.tsx (já feito)
 * 2. Qualificacoes.tsx
 * 3. Funcionarios.tsx
 * 4. Dashboard.tsx
 * 5. Treinamentos.tsx
 * 6. Simuladores.tsx
 * 7. Certificados.tsx
 * 8. Relatórios.tsx
 * 9. Configurações.tsx
 * 10. Empresas.tsx (admin)
 */

// ========== COMO ATUALIZAR UMA PÁGINA ==========
/**
 * 1. Adicionar import:
 *    import { DesignSystemGlobal } from '@/react-app/styles/design-system-global';
 *
 * 2. Envolver container com:
 *    className={`${DesignSystemGlobal.spacing.pageContainer} ${DesignSystemGlobal.gradients.pageDefault}`}
 *
 * 3. Usar classes para componentes:
 *    - Cards: DesignSystemGlobal.cards.base
 *    - Botões: DesignSystemGlobal.buttons.primary
 *    - Tabs: DesignSystemGlobal.tabs.container
 *    - Tipografia: DesignSystemGlobal.typography.h1
 *
 * 4. Testar responsividade em mobile
 *
 * 5. Verificar acessibilidade (dark mode, reduced motion)
 */

// ========== VARIÁVEIS CSS GLOBAIS ==========
/**
 * Disponíveis em qualquer CSS:
 *
 * var(--color-primary)
 * var(--color-primary-dark)
 * var(--color-success)
 * var(--color-warning)
 * var(--color-error)
 * var(--spacing-md)
 * var(--radius-xl)
 * var(--shadow-lg)
 * var(--transition-normal)
 */

// ========== CLASES CSS GLOBAIS ==========
/**
 * Disponíveis em qualquer HTML:
 *
 * .page-container - Container de página
 * .page-title - Título de página
 * .page-subtitle - Subtítulo
 * .card-base - Card padrão
 * .card-elevated - Card elevado
 * .dashboard-card - Card de dashboard
 * .btn - Botão base
 * .btn-primary - Botão primário
 * .badge-success - Badge de sucesso
 * .table-base - Tabela base
 * .tab-button - Botão de tab
 */

export default {};

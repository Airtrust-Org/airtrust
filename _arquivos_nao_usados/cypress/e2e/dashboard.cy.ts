describe('Dashboard AirTrust E2E Tests', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  describe('1. Main Navigation and Layout', () => {
    it('should display main navigation and logo', () => {
      cy.get('[data-testid="airtrust-logo"]').should('be.visible');
      cy.get('[data-testid="nav-dashboard"]').should('contain', 'Dashboard');
      cy.get('[data-testid="nav-funcionarios"]').should('contain', 'Funcionários');
      cy.get('[data-testid="nav-treinamentos"]').should('contain', 'Treinamentos');
    });

    it('should be accessible via keyboard navigation', () => {
      cy.get('body').tab();
      cy.focused().should('have.attr', 'data-testid', 'nav-dashboard');
      
      cy.tab();
      cy.focused().should('have.attr', 'data-testid', 'nav-funcionarios');
      
      cy.tab();  
      cy.focused().should('have.attr', 'data-testid', 'nav-treinamentos');
    });
  });

  describe('2. Dashboard KPIs and Data Loading', () => {
    it('should load and display dashboard KPIs', () => {
      cy.get('[data-testid="kpi-total-funcionarios"]').should('be.visible');
      cy.get('[data-testid="kpi-total-funcionarios"] .text-3xl').should('contain', '4');
      
      cy.get('[data-testid="kpi-funcoes-ativas"]').should('be.visible');
      cy.get('[data-testid="kpi-funcoes-ativas"] .text-3xl').should('contain', '5');
    });

    it('should handle loading states gracefully', () => {
      cy.intercept('GET', '/api/v2/funcionarios', { delay: 1000, fixture: 'funcionarios.json' }).as('getFuncionarios');
      cy.visit('/');
      
      // Should show loading state
      cy.get('[data-testid="dashboard-loading"]').should('be.visible');
      
      cy.wait('@getFuncionarios');
      cy.get('[data-testid="dashboard-loading"]').should('not.exist');
    });
  });

  describe('3. Funcionários Management Workflow', () => {
    it('should navigate to funcionários page and display list', () => {
      cy.get('[data-testid="nav-funcionarios"]').click();
      cy.url().should('include', '/funcionarios');
      
      cy.get('[data-testid="funcionarios-table"]').should('be.visible');
      cy.get('[data-testid="funcionario-row"]').should('have.length.at.least', 1);
    });

    it('should open edit modal and update funcionário data', () => {
      cy.visit('/funcionarios');
      cy.get('[data-testid="edit-funcionario-btn"]').first().click();
      
      cy.get('[data-testid="edit-funcionario-modal"]').should('be.visible');
      cy.get('[data-testid="funcionario-nome-input"]').clear().type('Nome Funcionario Teste E2E');
      cy.get('[data-testid="save-funcionario-btn"]').click();
      
      cy.get('[data-testid="success-toast"]').should('contain', 'Funcionário atualizado');
    });
  });

  describe('4. Treinamentos Dashboard Full Workflow', () => {
    it('should navigate to treinamentos and display dashboard', () => {
      cy.get('[data-testid="nav-treinamentos"]').click();
      cy.url().should('include', '/treinamentos');
      
      cy.get('[data-testid="dashboard-treinamentos"]').should('be.visible');
      cy.get('[data-testid="tab-visao-geral"]').should('have.class', 'border-blue-500');
    });

    it('should switch between dashboard tabs', () => {
      cy.visit('/treinamentos');
      
      // Test Certificações tab
      cy.get('[data-testid="tab-certificacoes"]').click();
      cy.get('[data-testid="certificacoes-list"]').should('be.visible');
      cy.get('[data-testid="add-certificacao-btn"]').should('be.visible');
      
      // Test search functionality
      cy.get('[data-testid="certificacoes-search"]').type('Ricardo');
      cy.get('[data-testid="certificacao-row"]').should('have.length.at.least', 1);
    });

    it('should add new certificação via modal', () => {
      cy.visit('/treinamentos');
      cy.get('[data-testid="tab-certificacoes"]').click();
      
      cy.get('[data-testid="add-certificacao-btn"]').click();
      cy.get('[data-testid="add-certificacao-modal"]').should('be.visible');
      
      // Fill form
      cy.get('[data-testid="treinamento-select"]').select('1');
      cy.get('[data-testid="data-conclusao-input"]').type('2024-12-01');
      cy.get('[data-testid="instrutor-input"]').type('Instrutor E2E Test');
      
      cy.get('[data-testid="save-certificacao-btn"]').click();
      cy.get('[data-testid="success-toast"]').should('contain', 'Certificação criada');
    });
  });

  describe('5. Accessibility and UX Requirements', () => {
    it('should meet ARIA requirements', () => {
      cy.visit('/');
      cy.get('[role="main"]').should('exist');
      cy.get('[role="navigation"]').should('exist');
      
      // Check ARIA labels on interactive elements
      cy.get('[data-testid="nav-dashboard"]').should('have.attr', 'aria-label');
      cy.get('[data-testid="nav-funcionarios"]').should('have.attr', 'aria-label');
    });

    it('should support keyboard navigation for all interactive elements', () => {
      cy.visit('/funcionarios');
      
      // Tab through action buttons
      cy.get('[data-testid="edit-funcionario-btn"]').first().focus();
      cy.focused().type('{enter}');
      
      cy.get('[data-testid="edit-funcionario-modal"]').should('be.visible');
      
      // ESC should close modal
      cy.focused().type('{esc}');
      cy.get('[data-testid="edit-funcionario-modal"]').should('not.exist');
    });

    it('should maintain focus management in modals', () => {
      cy.visit('/treinamentos');
      cy.get('[data-testid="tab-certificacoes"]').click();
      cy.get('[data-testid="add-certificacao-btn"]').click();
      
      // Focus should be trapped in modal
      cy.get('[data-testid="add-certificacao-modal"] input').first().should('be.focused');
      
      // Tab should cycle within modal
      for (let i = 0; i < 10; i++) {
        cy.tab();
      }
      cy.focused().should('be.visible').should('exist');
    });
  });

  describe('6. Performance and Error Handling', () => {
    it('should handle API errors gracefully', () => {
      cy.intercept('GET', '/api/v2/funcionarios', { statusCode: 500 }).as('getError');
      cy.visit('/funcionarios');
      
      cy.wait('@getError');
      cy.get('[data-testid="error-message"]').should('contain', 'Erro ao carregar');
      cy.get('[data-testid="retry-btn"]').should('be.visible');
    });

    it('should handle network timeout', () => {
      cy.intercept('GET', '/api/v2/funcionarios', { delay: 30000 }).as('getTimeout');
      cy.visit('/funcionarios');
      
      // Should show loading state for reasonable time
      cy.get('[data-testid="loading-spinner"]', { timeout: 5000 }).should('be.visible');
    });

    it('should validate form inputs properly', () => {
      cy.visit('/treinamentos');
      cy.get('[data-testid="tab-certificacoes"]').click();
      cy.get('[data-testid="add-certificacao-btn"]').click();
      
      // Try to submit empty form
      cy.get('[data-testid="save-certificacao-btn"]').click();
      cy.get('[data-testid="form-error"]').should('contain', 'obrigatórios');
      
      // Test XSS protection
      cy.get('[data-testid="instrutor-input"]').type('<script>alert("xss")</script>');
      cy.get('[data-testid="save-certificacao-btn"]').click();
      cy.get('[data-testid="form-error"]').should('not.contain', '<script>');
    });
  });

  describe('7. Integration and Data Consistency', () => {
    it('should maintain data consistency across pages', () => {
      // Add funcionário
      cy.visit('/funcionarios');
      cy.get('[data-testid="add-funcionario-btn"]').click();
      
      const uniqueName = `E2E Test User ${Date.now()}`;
      cy.get('[data-testid="funcionario-nome-input"]').type(uniqueName);
      cy.get('[data-testid="funcionario-funcao-select"]').select('PILOTO');
      cy.get('[data-testid="funcionario-email-input"]').type(`test${Date.now()}@example.com`);
      
      cy.get('[data-testid="save-funcionario-btn"]').click();
      cy.get('[data-testid="success-toast"]').should('be.visible');
      
      // Check if it appears in dashboard
      cy.visit('/');
      cy.get('[data-testid="kpi-total-funcionarios"] .text-3xl').should('contain', '5');
    });
  });
});

describe('Login Flow', () => {
  beforeEach(() => {
    // Limpar localStorage antes de cada teste
    cy.clearLocalStorage();
    cy.visit('http://localhost:5173/login');
  });

  it('should display login page correctly', () => {
    cy.contains('AirTrust v2').should('be.visible');
    cy.contains('Sistema de Gestão de Treinamentos').should('be.visible');
    cy.get('input[type="email"]').should('be.visible');
    cy.get('input[type="password"]').should('be.visible');
    cy.get('button[type="submit"]').should('be.visible');
  });

  it('should show validation errors for empty fields', () => {
    cy.get('button[type="submit"]').click();
    // HTML5 validation will prevent submission
    cy.get('input[type="email"]:invalid').should('exist');
  });

  it('should login successfully with valid credentials', () => {
    cy.get('input[type="email"]').type('admin@airtrust.com');
    cy.get('input[type="password"]').type('admin123');
    cy.get('button[type="submit"]').click();

    // Should redirect to dashboard
    cy.url().should('eq', 'http://localhost:5173/');
    
    // Should have token in localStorage
    cy.window().then((window) => {
      const token = window.localStorage.getItem('token');
      expect(token).to.exist;
      expect(token).to.be.a('string');
      expect(token?.length).to.be.greaterThan(0);
    });

    // Should display dashboard
    cy.contains('Dashboard').should('be.visible');
  });

  it('should show error for invalid credentials', () => {
    cy.get('input[type="email"]').type('invalid@email.com');
    cy.get('input[type="password"]').type('wrongpassword');
    cy.get('button[type="submit"]').click();

    // Should show error message
    cy.contains('Erro', { matchCase: false }).should('be.visible');
    
    // Should stay on login page
    cy.url().should('include', '/login');
  });

  it('should show loading state during login', () => {
    cy.get('input[type="email"]').type('admin@airtrust.com');
    cy.get('input[type="password"]').type('admin123');
    cy.get('button[type="submit"]').click();

    // Should show loading state
    cy.contains('Entrando...').should('be.visible');
  });

  it('should display development credentials', () => {
    cy.contains('Credenciais de Desenvolvimento').should('be.visible');
    cy.contains('admin@airtrust.com').should('be.visible');
    cy.contains('admin123').should('be.visible');
  });
});

describe('Protected Routes', () => {
  it('should redirect to login when not authenticated', () => {
    cy.clearLocalStorage();
    cy.visit('http://localhost:5173/');
    cy.url().should('include', '/login');
  });

  it('should access dashboard when authenticated', () => {
    // Login first
    cy.visit('http://localhost:5173/login');
    cy.get('input[type="email"]').type('admin@airtrust.com');
    cy.get('input[type="password"]').type('admin123');
    cy.get('button[type="submit"]').click();

    // Wait for redirect
    cy.url().should('eq', 'http://localhost:5173/');
    
    // Should see dashboard content
    cy.contains('Dashboard').should('be.visible');
  });
});

describe('Logout Flow', () => {
  beforeEach(() => {
    // Login before each test
    cy.clearLocalStorage();
    cy.visit('http://localhost:5173/login');
    cy.get('input[type="email"]').type('admin@airtrust.com');
    cy.get('input[type="password"]').type('admin123');
    cy.get('button[type="submit"]').click();
    cy.url().should('eq', 'http://localhost:5173/');
  });

  it('should logout successfully', () => {
    // Click logout button
    cy.contains('Sair').click();

    // Should redirect to login
    cy.url().should('include', '/login');

    // Should clear localStorage
    cy.window().then((window) => {
      const token = window.localStorage.getItem('token');
      expect(token).to.be.null;
    });
  });

  it('should not access protected routes after logout', () => {
    // Logout
    cy.contains('Sair').click();
    cy.url().should('include', '/login');

    // Try to access dashboard
    cy.visit('http://localhost:5173/');
    
    // Should redirect to login
    cy.url().should('include', '/login');
  });
});

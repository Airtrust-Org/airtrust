/// <reference types="cypress" />

// Custom commands for AirTrust testing

Cypress.Commands.add('loginAs', (role: 'ADMIN' | 'FUNCIONARIO' = 'ADMIN') => {
  // Since we're in dev mode, this would set the mock user
  cy.window().then((win) => {
    win.localStorage.setItem('dev_user_role', role);
  });
});

Cypress.Commands.add('waitForApiReady', () => {
  cy.request('GET', '/api/v2/system/health').then((response) => {
    expect(response.status).to.eq(200);
    expect(response.body).to.have.property('status');
  });
});

Cypress.Commands.add('cleanupTestData', () => {
  // Clean up any test data created during E2E tests
  cy.request('DELETE', '/api/v2/test/cleanup').then(() => {
    cy.log('Test data cleanup completed');
  });
});

// Check for accessibility violations
Cypress.Commands.add('checkA11y', (selector?: string) => {
  const target = selector || 'body';
  
  cy.get(target).then(($el) => {
    // Basic accessibility checks
    // Check for alt text on images
    $el.find('img').each((_, img) => {
      expect(img).to.have.attr('alt');
    });
    
    // Check for form labels
    $el.find('input, textarea, select').each((_, input) => {
      const id = input.getAttribute('id');
      if (id) {
        expect($el.find(`label[for="${id}"]`)).to.exist;
      }
    });
  });
});

declare global {
  namespace Cypress {
    interface Chainable {
      loginAs(role?: 'ADMIN' | 'FUNCIONARIO'): Chainable<void>;
      waitForApiReady(): Chainable<void>;
      cleanupTestData(): Chainable<void>;
      checkA11y(selector?: string): Chainable<void>;
    }
  }
}

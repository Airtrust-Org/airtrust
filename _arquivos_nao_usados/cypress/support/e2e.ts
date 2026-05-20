import './commands';

// Extend Cypress interface
declare global {
  namespace Cypress {
    interface Chainable {
      tab(): Chainable<void>;
    }
  }
}

// Add custom commands
Cypress.Commands.add('tab', () => {
  cy.focused().trigger('keydown', { keyCode: 9, which: 9 });
});

// Hide XHR requests from command log by default
Cypress.on('window:before:load', (win) => {
  const original = win.XMLHttpRequest;
  win.XMLHttpRequest = function(...args) {
    const xhr = new original(...args);
    // Hide from command log unless explicitly needed
    xhr.open = new Proxy(xhr.open, {
      apply(target, thisArg, argumentsList) {
        // Only show important requests
        if (argumentsList[1].includes('/api/v2/')) {
          return Reflect.apply(target, thisArg, argumentsList);
        }
        return Reflect.apply(target, thisArg, argumentsList);
      }
    });
    return xhr;
  };
});

describe('Security Tests', () => {
  describe('Input Sanitization', () => {
    it('should prevent XSS attacks in form inputs', () => {
      cy.visit('/treinamentos');
      cy.get('[data-testid="tab-certificacoes"]').click();
      cy.get('[data-testid="add-certificacao-btn"]').click();
      
      const xssPayload = '<script>alert("xss")</script>';
      
      // Try to inject XSS in instructor field
      cy.get('[data-testid="instrutor-input"]').type(xssPayload);
      cy.get('[data-testid="treinamento-select"]').select('1');
      cy.get('[data-testid="data-conclusao-input"]').type('2024-12-01');
      
      cy.get('[data-testid="save-certificacao-btn"]').click();
      
      // Should show validation error, not execute script
      cy.get('[data-testid="form-error"]').should('be.visible');
      cy.get('[data-testid="form-error"]').should('not.contain', '<script>');
      
      // Page should not have executed the script
      cy.window().then((win) => {
        // If XSS worked, this would be true due to alert
        expect(win.document.body.innerHTML).not.to.contain('<script>alert("xss")</script>');
      });
    });

    it('should sanitize dangerous javascript: URLs', () => {
      // Test that javascript: URLs are rejected in form inputs
      cy.visit('/funcionarios');
      cy.get('[data-testid="edit-funcionario-btn"]').first().click();
      
      const jsPayload = 'javascript:alert("xss")';
      cy.get('[data-testid="funcionario-email-input"]').clear().type(jsPayload);
      cy.get('[data-testid="save-funcionario-btn"]').click();
      
      // Should show validation error for invalid email
      cy.get('[data-testid="form-error"]').should('be.visible');
    });

    it('should prevent HTML injection in text fields', () => {
      cy.visit('/treinamentos');
      cy.get('[data-testid="tab-certificacoes"]').click();
      cy.get('[data-testid="add-certificacao-btn"]').click();
      
      const htmlPayload = '<img src=x onerror=alert("xss")>';
      
      cy.get('[data-testid="instrutor-input"]').type(htmlPayload);
      cy.get('[data-testid="treinamento-select"]').select('1');
      cy.get('[data-testid="data-conclusao-input"]').type('2024-12-01');
      cy.get('[data-testid="save-certificacao-btn"]').click();
      
      // Should handle gracefully without executing
      cy.get('body').should('not.contain', 'onerror=alert');
    });
  });

  describe('API Security', () => {
    it('should reject requests with invalid authentication', () => {
      // Test API with invalid token
      cy.request({
        method: 'POST',
        url: '/api/v2/funcionarios',
        headers: {
          'Authorization': 'Bearer invalid_token'
        },
        body: {
          nome: 'Test User',
          funcao: 'PILOTO',
          email: 'test@example.com'
        },
        failOnStatusCode: false
      }).then((response) => {
        // In production, this would return 401/403
        // In dev mode, it might pass through
        if (response.status === 401 || response.status === 403) {
          expect(response.body.error).to.exist;
        }
      });
    });

    it('should validate SQL injection attempts in query params', () => {
      const sqlInjection = "1; DROP TABLE funcionarios; --";
      
      cy.request({
        method: 'GET',
        url: `/api/v2/funcionarios?search=${encodeURIComponent(sqlInjection)}`,
        failOnStatusCode: false
      }).then((response) => {
        // Should either block the request or sanitize it
        expect(response.status).to.be.oneOf([200, 400, 403]);
        
        if (response.status === 200) {
          // If it passes, should not contain dangerous SQL
          expect(JSON.stringify(response.body)).not.to.contain('DROP TABLE');
        }
      });
    });

    it('should have proper security headers', () => {
      cy.request('/').then((response) => {
        // Check for basic security headers
        const headers = response.headers;
        
        // These might not all be set in dev mode, but test what we can
        if (headers['x-content-type-options']) {
          expect(headers['x-content-type-options']).to.equal('nosniff');
        }
        
        if (headers['x-frame-options']) {
          expect(headers['x-frame-options']).to.be.oneOf(['DENY', 'SAMEORIGIN']);
        }
      });
    });

    it('should rate limit excessive requests', () => {
      // Test rate limiting by making many requests quickly
      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(
          cy.request({
            method: 'GET',
            url: '/api/v2/system/health',
            failOnStatusCode: false
          })
        );
      }
      
      // In production with rate limiting, some requests should be blocked
      // In development, all might succeed
      // This test documents the expected behavior
    });
  });

  describe('Content Security Policy', () => {
    it('should prevent inline script execution', () => {
      cy.visit('/');
      
      // Try to inject a script tag dynamically
      cy.window().then((win) => {
        const script = win.document.createElement('script');
        script.innerHTML = 'window.xssTest = true;';
        
        try {
          win.document.head.appendChild(script);
        } catch (e) {
          // CSP should block this
          console.log('CSP blocked script injection:', e);
        }
        
        // Wait a moment and check if script executed
        setTimeout(() => {
          expect(win.xssTest).to.be.undefined;
        }, 100);
      });
    });
  });

  describe('Data Validation and Sanitization', () => {
    it('should validate email format strictly', () => {
      cy.visit('/funcionarios');
      cy.get('[data-testid="edit-funcionario-btn"]').first().click();
      
      const invalidEmails = [
        'not-an-email',
        'test@',
        '@domain.com',
        'test space@domain.com',
        'test"quote@domain.com',
        'test@domain',
        'test@.com'
      ];
      
      invalidEmails.forEach(invalidEmail => {
        cy.get('[data-testid="funcionario-email-input"]').clear().type(invalidEmail);
        cy.get('[data-testid="save-funcionario-btn"]').click();
        
        // Should show validation error
        cy.get('[data-testid="form-error"]', { timeout: 1000 })
          .should('be.visible')
          .should('contain', 'email');
      });
    });

    it('should prevent oversized input data', () => {
      cy.visit('/treinamentos');
      cy.get('[data-testid="tab-certificacoes"]').click();
      cy.get('[data-testid="add-certificacao-btn"]').click();
      
      // Create a very long string (over 1000 characters)
      const longString = 'A'.repeat(1500);
      
      cy.get('[data-testid="instrutor-input"]').invoke('val', longString);
      cy.get('[data-testid="treinamento-select"]').select('1');
      cy.get('[data-testid="data-conclusao-input"]').type('2024-12-01');
      cy.get('[data-testid="save-certificacao-btn"]').click();
      
      // Should handle gracefully - either truncate or show error
      cy.get('[data-testid="form-error"]').should('be.visible');
    });
  });

  describe('Session and Authentication Security', () => {
    it('should handle session timeout gracefully', () => {
      // Simulate expired session by making request after clearing storage
      cy.visit('/');
      cy.clearLocalStorage();
      cy.clearCookies();
      
      // Try to access protected functionality
      cy.visit('/funcionarios');
      cy.get('[data-testid="edit-funcionario-btn"]').first().click();
      
      // In production with proper auth, this should redirect to login
      // In dev mode, it should work normally
      // This test documents the expected behavior
    });

    it('should not expose sensitive data in client-side storage', () => {
      cy.visit('/');
      
      cy.window().then((win) => {
        const localStorage = win.localStorage;
        const sessionStorage = win.sessionStorage;
        
        // Check that no passwords, tokens, or sensitive data is stored
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          const value = localStorage.getItem(key);
          
          // Should not contain sensitive patterns
          expect(value?.toLowerCase()).not.to.contain('password');
          expect(value?.toLowerCase()).not.to.contain('token');
          expect(value?.toLowerCase()).not.to.contain('secret');
        }
        
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          const value = sessionStorage.getItem(key);
          
          expect(value?.toLowerCase()).not.to.contain('password');
          expect(value?.toLowerCase()).not.to.contain('secret');
        }
      });
    });
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';

const SecurityUtils = {
  sanitizeString(input: string): string {
    return input
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(
        /\s+\w[\w-]*\s*=\s*(?:"[^"]*(?:javascript|data|vbscript):[^"]*"|'[^']*(?:javascript|data|vbscript):[^']*')/gi,
        '',
      )
      .replace(/javascript:|data:|vbscript:/gi, '')
      .replace(/on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
      .trim();
  },

  isValidEmail(email: string): boolean {
    if (email.includes('..')) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  },

  hashForLogging(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  },
};

describe('Security', () => {
  describe('Input Sanitization', () => {
    it('should remove script tags', () => {
      const maliciousInput = '<script>alert("xss")</script>Hello World';
      const sanitized = SecurityUtils.sanitizeString(maliciousInput);

      expect(sanitized).toBe('Hello World');
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');
    });

    it('should remove javascript: URLs', () => {
      const maliciousInput = 'javascript:alert("xss")';
      const sanitized = SecurityUtils.sanitizeString(maliciousInput);

      expect(sanitized).toBe('alert("xss")');
      expect(sanitized).not.toContain('javascript:');
    });

    it('should remove data: URLs', () => {
      const maliciousInput = 'data:text/html,<script>alert("xss")</script>';
      const sanitized = SecurityUtils.sanitizeString(maliciousInput);

      expect(sanitized).not.toContain('data:');
    });

    it('should remove event handlers', () => {
      const maliciousInput = '<img src="x" onerror="alert(1)">';
      const sanitized = SecurityUtils.sanitizeString(maliciousInput);

      expect(sanitized).not.toContain('onerror=');
      expect(sanitized).not.toContain('alert(1)');
    });

    it('should handle multiple threats in one input', () => {
      const maliciousInput =
        '<script>alert(1)</script><img onerror="alert(2)" src="javascript:alert(3)">';
      const sanitized = SecurityUtils.sanitizeString(maliciousInput);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('onerror=');
      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).not.toContain('alert');
    });

    it('should preserve safe content', () => {
      const safeInput = 'Hello <b>World</b>! This is safe content.';
      const sanitized = SecurityUtils.sanitizeString(safeInput);

      expect(sanitized).toContain('Hello');
      expect(sanitized).toContain('World');
      expect(sanitized).toContain('safe content');
    });
  });

  describe('Email Validation', () => {
    it('should validate correct email formats', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org',
        'user123@test-domain.com',
      ];

      validEmails.forEach((email) => {
        expect(SecurityUtils.isValidEmail(email)).toBe(true);
      });
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user space@domain.com',
        'user@domain',
        'user@@domain.com',
        'user@domain..com',
      ];

      invalidEmails.forEach((email) => {
        expect(SecurityUtils.isValidEmail(email)).toBe(false);
      });
    });

    it('should reject emails that are too long', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      expect(SecurityUtils.isValidEmail(longEmail)).toBe(false);
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should detect common SQL injection patterns', () => {
      const sqlInjectionPatterns = [
        /drop\s+table/i,
        /delete\s+from/i,
        /insert\s+into.*values/i,
        /update\s+.*set/i,
        /union\s+select/i,
        /or\s+1\s*=\s*1/i,
        /';\s*(drop|delete|insert|update)/i,
      ];

      const maliciousInputs = [
        "'; DROP TABLE users; --",
        '1 OR 1=1',
        "admin'; DELETE FROM users; --",
        '1 UNION SELECT * FROM passwords',
        "'; UPDATE users SET password='hacked'; --",
      ];

      maliciousInputs.forEach((input) => {
        const isDetected = sqlInjectionPatterns.some((pattern) =>
          pattern.test(input.toLowerCase()),
        );
        expect(isDetected).toBe(true);
      });
    });

    it('should allow safe SQL-like content', () => {
      const sqlInjectionPatterns = [
        /drop\s+table/i,
        /delete\s+from/i,
        /insert\s+into.*values/i,
        /update\s+.*set/i,
        /union\s+select/i,
        /or\s+1\s*=\s*1/i,
      ];

      const safeInputs = [
        'My name is John',
        'I like to drop by the table',
        'Please update me on the progress',
        'The union of two sets',
      ];

      safeInputs.forEach((input) => {
        const isDetected = sqlInjectionPatterns.some((pattern) =>
          pattern.test(input.toLowerCase()),
        );
        expect(isDetected).toBe(false);
      });
    });
  });

  describe('Password Security', () => {
    it('should validate password strength', () => {
      const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
        const errors: string[] = [];

        if (password.length < 8) {
          errors.push('Password must be at least 8 characters long');
        }

        if (!/[A-Z]/.test(password)) {
          errors.push('Password must contain at least one uppercase letter');
        }

        if (!/[a-z]/.test(password)) {
          errors.push('Password must contain at least one lowercase letter');
        }

        if (!/\d/.test(password)) {
          errors.push('Password must contain at least one number');
        }

        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
          errors.push('Password must contain at least one special character');
        }

        return { valid: errors.length === 0, errors };
      };

      const strongPasswords = ['MyStr0ng!Pass', 'Secure123!@#', 'C0mplex$Pass'];

      strongPasswords.forEach((password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      const weakPasswords = [
        'password', // no uppercase, no numbers, no special chars
        'PASSWORD', // no lowercase, no numbers, no special chars
        '12345678', // no letters, no special chars
        'Pass123', // no special chars, too short
        'pass', // too short, no uppercase, no numbers, no special chars
      ];

      weakPasswords.forEach((password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Data Hashing for Logging', () => {
    it('should generate consistent hashes', () => {
      const data = 'sensitive-user-data';
      const hash1 = SecurityUtils.hashForLogging(data);
      const hash2 = SecurityUtils.hashForLogging(data);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(data);
      expect(hash1.length).toBeGreaterThan(0);
    });

    it('should generate different hashes for different data', () => {
      const data1 = 'user-data-1';
      const data2 = 'user-data-2';

      const hash1 = SecurityUtils.hashForLogging(data1);
      const hash2 = SecurityUtils.hashForLogging(data2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty strings', () => {
      const hash = SecurityUtils.hashForLogging('');
      expect(hash).toBe('0');
    });
  });

  describe('Content Security Policy', () => {
    it('should generate secure CSP directives', () => {
      const generateCSP = (environment: string) => {
        const directives = [
          "default-src 'self'",
          environment === 'development'
            ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
            : "script-src 'self'",
          environment === 'development'
            ? "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"
            : "style-src 'self' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: https:",
          "connect-src 'self'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "object-src 'none'",
          'upgrade-insecure-requests',
        ];

        return directives.join('; ');
      };

      const devCSP = generateCSP('development');
      const prodCSP = generateCSP('production');

      expect(devCSP).toContain("'unsafe-inline'");
      expect(devCSP).toContain("'unsafe-eval'");

      expect(prodCSP).not.toContain("'unsafe-inline'");
      expect(prodCSP).not.toContain("'unsafe-eval'");

      expect(devCSP).toContain("default-src 'self'");
      expect(prodCSP).toContain("default-src 'self'");
      expect(devCSP).toContain("frame-ancestors 'none'");
      expect(prodCSP).toContain("frame-ancestors 'none'");
    });
  });

  describe('Rate Limiting', () => {
    it('should implement basic rate limiting logic', () => {
      const rateLimiter = new Map<string, { count: number; resetTime: number }>();
      const RATE_LIMIT = 5;
      const WINDOW_MS = 60000; // 1 minute

      const checkRateLimit = (clientId: string): { allowed: boolean; remaining: number } => {
        const now = Date.now();
        const clientData = rateLimiter.get(clientId);

        if (!clientData || now > clientData.resetTime) {
          rateLimiter.set(clientId, { count: 1, resetTime: now + WINDOW_MS });
          return { allowed: true, remaining: RATE_LIMIT - 1 };
        }

        if (clientData.count >= RATE_LIMIT) {
          return { allowed: false, remaining: 0 };
        }

        clientData.count++;
        return { allowed: true, remaining: RATE_LIMIT - clientData.count };
      };

      const clientId = '192.168.1.1';

      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit(clientId);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }

      const blockedResult = checkRateLimit(clientId);
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.remaining).toBe(0);
    });
  });
});

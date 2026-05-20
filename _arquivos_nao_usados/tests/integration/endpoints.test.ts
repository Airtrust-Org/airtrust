import { describe, it, expect, beforeAll } from 'vitest';

describe('AirTrust Endpoints Integration Tests', () => {
  const baseURL = 'http://localhost:8787';
  
  beforeAll(async () => {
    // Garantir que o worker está rodando
    const health = await fetch(`${baseURL}/health`);
    if (!health.ok) {
      throw new Error('Worker não está rodando. Execute: npm run dev:worker');
    }
  });
  
  describe('Health Checks', () => {
    it('GET /health deve retornar 200', async () => {
      const res = await fetch(`${baseURL}/health`);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.db).toBeDefined();
      expect(data.db.connected).toBe(true);
    });
    
    it('GET /api/v2/health deve retornar 200', async () => {
      const res = await fetch(`${baseURL}/api/v2/health`);
      expect(res.status).toBe(200);
    });
  });
  
  describe('Funcionários', () => {
    it('GET /api/v2/funcionarios deve retornar lista', async () => {
      const res = await fetch(`${baseURL}/api/v2/funcionarios`);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
    
    it('POST /api/v2/funcionarios-batch sem dados deve retornar 400', async () => {
      const res = await fetch(`${baseURL}/api/v2/funcionarios-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      expect(res.status).toBe(400);
    });
  });
  
  describe('Qualificações', () => {
    it('GET /api/qualificacoes deve retornar lista', async () => {
      const res = await fetch(`${baseURL}/api/qualificacoes`);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
    
    it('GET /api/qualificacoes com limit deve respeitar', async () => {
      const res = await fetch(`${baseURL}/api/qualificacoes?limit=5`);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.data.length).toBeLessThanOrEqual(5);
    });
  });
  
  describe('Catálogos', () => {
    it('GET /api/v2/funcoes deve retornar lista', async () => {
      const res = await fetch(`${baseURL}/api/v2/funcoes`);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.success).toBe(true);
    });
    
    it('GET /api/v2/aeronaves deve retornar lista', async () => {
      const res = await fetch(`${baseURL}/api/v2/aeronaves`);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.success).toBe(true);
    });
    
    it('GET /api/v2/setores deve retornar lista', async () => {
      const res = await fetch(`${baseURL}/api/v2/setores`);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
  
  describe('Operacional', () => {
    it('GET /api/v2/exames deve retornar lista', async () => {
      const res = await fetch(`${baseURL}/api/v2/exames`);
      expect(res.status).toBe(200);
    });
    
    it('GET /api/v2/checks deve retornar lista', async () => {
      const res = await fetch(`${baseURL}/api/v2/checks`);
      expect(res.status).toBe(200);
    });
    
    it('GET /api/v2/treinamentos deve retornar lista', async () => {
      const res = await fetch(`${baseURL}/api/v2/treinamentos`);
      expect(res.status).toBe(200);
    });
  });
  
  describe('Sistema', () => {
    it('GET /api/v2/dashboard deve retornar dados', async () => {
      const res = await fetch(`${baseURL}/api/v2/dashboard`);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    });
    
    it('GET /api/v2/compliance deve retornar lista', async () => {
      const res = await fetch(`${baseURL}/api/v2/compliance`);
      expect(res.status).toBe(200);
    });
    
    it('GET /api/v2/auditoria deve retornar lista', async () => {
      const res = await fetch(`${baseURL}/api/v2/auditoria`);
      expect(res.status).toBe(200);
    });
    
    it('GET /api/v2/importacoes deve retornar lista', async () => {
      const res = await fetch(`${baseURL}/api/v2/importacoes`);
      expect(res.status).toBe(200);
    });
  });
  
  describe('Performance', () => {
    it('Health check deve responder em menos de 100ms', async () => {
      const start = Date.now();
      await fetch(`${baseURL}/health`);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100);
    });
    
    it('Endpoints devem responder em menos de 500ms', async () => {
      const endpoints = [
        '/api/v2/funcionarios',
        '/api/qualificacoes',
        '/api/v2/funcoes'
      ];
      
      for (const endpoint of endpoints) {
        const start = Date.now();
        await fetch(`${baseURL}${endpoint}`);
        const duration = Date.now() - start;
        
        expect(duration).toBeLessThan(500);
      }
    });
  });
});

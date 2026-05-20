/**
 * Testes para o módulo de upload de qualificações
 * @module tests/qualificacoes-upload
 */

import { describe, it, expect, beforeAll } from 'vitest';

describe('Qualificações - Upload de Certificados', () => {
  const API_URL = 'http://localhost:8787';
  
  describe('POST /api/v2/qualificacoes/upload-certificado', () => {
    it('deve rejeitar upload sem arquivo', async () => {
      const formData = new FormData();
      formData.append('funcionarioId', '1');
      
      const response = await fetch(`${API_URL}/api/v2/qualificacoes/upload-certificado`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('obrigatório');
    });
    
    it('deve rejeitar arquivo com tipo não permitido', async () => {
      const formData = new FormData();
      const file = new File(['test'], 'test.exe', { type: 'application/x-msdownload' });
      formData.append('file', file);
      formData.append('funcionarioId', '1');
      
      const response = await fetch(`${API_URL}/api/v2/qualificacoes/upload-certificado`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('não permitido');
    });
    
    it('deve rejeitar arquivo maior que 10MB', async () => {
      const formData = new FormData();
      // Criar arquivo de 11MB
      const largeFile = new File([new ArrayBuffer(11 * 1024 * 1024)], 'large.pdf', { type: 'application/pdf' });
      formData.append('file', largeFile);
      formData.append('funcionarioId', '1');
      
      const response = await fetch(`${API_URL}/api/v2/qualificacoes/upload-certificado`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('muito grande');
    });
    
    it('deve aceitar arquivo PDF válido', async () => {
      const formData = new FormData();
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      formData.append('file', file);
      formData.append('funcionarioId', '1');
      
      const response = await fetch(`${API_URL}/api/v2/qualificacoes/upload-certificado`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.path).toBeDefined();
      expect(data.filename).toBe('test.pdf');
    });
    
    it('deve aceitar arquivo JPG válido', async () => {
      const formData = new FormData();
      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });
      formData.append('file', file);
      formData.append('funcionarioId', '1');
      
      const response = await fetch(`${API_URL}/api/v2/qualificacoes/upload-certificado`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.path).toBeDefined();
    });
  });
  
  describe('Validações de MIME type', () => {
    const allowedTypes = [
      { type: 'application/pdf', ext: 'pdf' },
      { type: 'image/jpeg', ext: 'jpg' },
      { type: 'image/png', ext: 'png' },
      { type: 'application/msword', ext: 'doc' },
      { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' }
    ];
    
    allowedTypes.forEach(({ type, ext }) => {
      it(`deve aceitar arquivo ${ext.toUpperCase()}`, async () => {
        const formData = new FormData();
        const file = new File(['test'], `test.${ext}`, { type });
        formData.append('file', file);
        formData.append('funcionarioId', '1');
        
        const response = await fetch(`${API_URL}/api/v2/qualificacoes/upload-certificado`, {
          method: 'POST',
          body: formData
        });
        
        expect(response.status).toBe(200);
      });
    });
  });
});

describe('Qualificações - CRUD com arquivo_url', () => {
  const API_URL = 'http://localhost:8787';
  
  it('deve criar qualificação com arquivo_url', async () => {
    const payload = {
      funcionario_id: 1,
      tipo: 'TREINAMENTO',
      codigo: 'TEST-001',
      nome: 'Teste de Qualificação',
      data_conclusao: '2025-01-01',
      arquivo_url: 'qualificacoes/1/test.pdf'
    };
    
    const response = await fetch(`${API_URL}/api/v2/qualificacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.arquivo_url).toBe(payload.arquivo_url);
  });
  
  it('deve atualizar arquivo_url de qualificação existente', async () => {
    const qualificacaoId = 1; // Assumindo que existe
    const payload = {
      arquivo_url: 'qualificacoes/1/novo-arquivo.pdf',
      arquivo_nome: 'novo-arquivo.pdf'
    };
    
    const response = await fetch(`${API_URL}/api/v2/qualificacoes/${qualificacaoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});

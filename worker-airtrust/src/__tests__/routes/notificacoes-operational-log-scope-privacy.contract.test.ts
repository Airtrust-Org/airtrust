import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve(__dirname, '../../routes/notificacoes.ts'), 'utf8');

describe('notificações operacionais — RBAC, tenant e privacidade', () => {
  it('restringe logs operacionais e configuração a admin/gestor', () => {
    expect(source).toContain(
      "app.get('/whatsapp/overview', auth(), requireRole('admin', 'manager')",
    );
    expect(source).toContain("app.get('/log', auth(), requireRole('admin', 'manager')");
    expect(source).toContain("app.get('/config', auth(), requireRole('admin', 'manager')");
  });

  it('aplica escopo setorial e joins tenant-aware aos logs com PII', () => {
    expect(source).toContain(
      "appendEmployeeSectorFilter(recentLogConditions, recentLogBindings, access, 'f')",
    );
    expect(source).toContain("appendEmployeeSectorFilter(conditions, params, access, 'f')");
    expect(source).toContain(
      "appendEmployeeSectorFilter(statsConditions, statsBindings, access, 'f')",
    );
    expect(source).toContain('AND f.empresa_id = nl.empresa_id');
    expect(source).toContain('AND qh.empresa_id = nl.empresa_id');
    expect(source).toContain('AND qt.empresa_id = nl.empresa_id');
  });

  it('não devolve mensagem interna do processamento ao cliente', () => {
    const processRoute = source.slice(
      source.indexOf("app.post('/processar'"),
      source.indexOf("app.get('/whatsapp/overview'"),
    );
    expect(processRoute).not.toContain('details: errorMessage');
    expect(processRoute).toContain("code: 'NOTIFICACOES_PROCESS_ERROR'");
  });

  it('preserva notificações pessoais do sistema sem exigir papel administrativo', () => {
    expect(source).toContain("app.get('/sistema', auth(), async (c) => {");
    expect(source).toContain("app.get('/sistema/contador', auth(), async (c) => {");
    expect(source).toContain("app.put('/sistema/:id/marcar-lida', auth(), async (c) => {");
  });
});

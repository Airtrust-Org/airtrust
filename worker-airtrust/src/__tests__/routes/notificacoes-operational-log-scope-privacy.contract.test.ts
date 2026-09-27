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

  it('mantém defaults globais separados de overrides tenant-scoped após o Schema 0516', () => {
    const overview = source.slice(
      source.indexOf("app.get('/whatsapp/overview'"),
      source.indexOf("app.get('/log'"),
    );
    expect(overview).toContain("tipo = 'WHATSAPP'");
    expect(overview).toContain('empresa_id IS NULL');

    const legacyConfig = source.slice(
      source.indexOf("app.get('/config'"),
      source.indexOf("app.put('/config/:id'"),
    );
    expect(legacyConfig).toContain('empresa_id IS NULL');
    expect(source).toContain(
      "app.get('/configuracoes-qualificacoes', auth(), requireRole('admin', 'manager')",
    );
    expect(source).toContain('(empresa_id IS NULL OR empresa_id = ?)');
    expect(source).toContain(
      "app.put('/configuracoes-qualificacoes/:codigo', auth(), requireRole('admin')",
    );
  });

  it('protege escrita das configurações de módulos e SGSO como admin tenant-scoped', () => {
    expect(source).toContain(
      "app.get('/configuracoes-modulos', auth(), requireRole('admin', 'manager')",
    );
    expect(source).toContain("app.put('/configuracoes-modulos', auth(), requireRole('admin')");
    expect(source).toContain(
      "app.get('/configuracoes-sgso-sla', auth(), requireRole('admin', 'manager')",
    );
    expect(source).toContain("app.put('/configuracoes-sgso-sla', auth(), requireRole('admin')");
    expect(source).toContain('WHERE empresa_id = ?');
  });

  it('preserva notificações pessoais do sistema sem exigir papel administrativo', () => {
    expect(source).toContain("app.get('/sistema', auth(), async (c) => {");
    expect(source).toContain("app.get('/sistema/contador', auth(), async (c) => {");
    expect(source).toContain("app.put('/sistema/:id/marcar-lida', auth(), async (c) => {");
  });
});

-- Migration 1017: RBAC (Role-Based Access Control)
-- Criado em: 2025-10-19
-- Descrição: Sistema completo de controle de acesso baseado em roles

-- Tabela de Roles
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Tabela de Permissões
CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Tabela de Relacionamento Role-Permission
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- Tabela de Relacionamento User-Role
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);
CREATE INDEX IF NOT EXISTS idx_permissions_action ON permissions(action);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);

-- Seed: Roles Padrão
INSERT INTO roles (name, description) VALUES
('ADMIN', 'Administrador com acesso total ao sistema'),
('GESTOR', 'Gestor com acesso de leitura e escrita'),
('VISUALIZADOR', 'Usuário com acesso apenas de leitura');

-- Seed: Permissões de Funcionários
INSERT INTO permissions (name, resource, action, description) VALUES
('funcionarios.create', 'funcionarios', 'CREATE', 'Criar novos funcionários'),
('funcionarios.read', 'funcionarios', 'READ', 'Visualizar funcionários'),
('funcionarios.update', 'funcionarios', 'UPDATE', 'Atualizar dados de funcionários'),
('funcionarios.delete', 'funcionarios', 'DELETE', 'Excluir funcionários');

-- Seed: Permissões de Qualificações
INSERT INTO permissions (name, resource, action, description) VALUES
('qualificacoes.create', 'qualificacoes', 'CREATE', 'Criar qualificações'),
('qualificacoes.read', 'qualificacoes', 'READ', 'Visualizar qualificações'),
('qualificacoes.update', 'qualificacoes', 'UPDATE', 'Atualizar qualificações'),
('qualificacoes.delete', 'qualificacoes', 'DELETE', 'Excluir qualificações'),
('qualificacoes.upload', 'qualificacoes', 'UPLOAD', 'Upload de certificados');

-- Seed: Permissões de Dashboard
INSERT INTO permissions (name, resource, action, description) VALUES
('dashboard.view', 'dashboard', 'READ', 'Visualizar dashboard'),
('dashboard.export', 'dashboard', 'EXPORT', 'Exportar relatórios');

-- Seed: Permissões de Auditoria
INSERT INTO permissions (name, resource, action, description) VALUES
('auditoria.read', 'auditoria', 'READ', 'Visualizar logs de auditoria');

-- Associar permissões ao role ADMIN (todas)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions;

-- Associar permissões ao role GESTOR (sem delete e auditoria)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions 
WHERE action IN ('CREATE', 'READ', 'UPDATE', 'UPLOAD', 'EXPORT');

-- Associar permissões ao role VISUALIZADOR (apenas leitura)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions 
WHERE action = 'READ';

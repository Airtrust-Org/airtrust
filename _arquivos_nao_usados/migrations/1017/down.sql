-- Rollback Migration 1017: RBAC

DROP INDEX IF EXISTS idx_user_roles_user;
DROP INDEX IF EXISTS idx_role_permissions_role;
DROP INDEX IF EXISTS idx_permissions_action;
DROP INDEX IF EXISTS idx_permissions_resource;

DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;

INSERT OR IGNORE INTO user_platform_roles
  (user_id, role_code, granted_by_user_id, granted_reason, created_at, updated_at)
VALUES
  (
    1,
    'platform_admin',
    1,
    'F7 hardening: formalizing legacy userId=1 as explicit platform_admin role',
    datetime('now'),
    datetime('now')
  );

-- Align the persisted RBAC contract with the application roles.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rbac_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_rbac_role_check
  CHECK (rbac_role IN ('student', 'author', 'medical_reviewer', 'editor', 'admin'));

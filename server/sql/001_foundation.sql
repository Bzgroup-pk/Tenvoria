CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('founder','public')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_users_scope_idx ON app_users(scope);
CREATE TABLE IF NOT EXISTS agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('founder','public')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 180),
  department text NOT NULL CHECK (department IN ('Research','Development','Media Studio','Growth & Sales','Finance','Quality')),
  description text NOT NULL CHECK (char_length(description) BETWEEN 3 AND 12000),
  status text NOT NULL DEFAULT 'needs_approval' CHECK (status IN ('needs_approval','approved','in_progress','completed','failed','rejected')),
  result text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope='founder') OR (scope='public'))
);
CREATE INDEX IF NOT EXISTS agent_tasks_owner_scope_created_idx ON agent_tasks(owner_id,scope,created_at DESC);
CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  scope text NOT NULL CHECK (scope IN ('founder','public')),
  task_id uuid REFERENCES agent_tasks(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_scope_created_idx ON audit_events(scope,created_at DESC);

/*
# Add owner role and single-session enforcement

## Changes
1. Modified `employees` table:
   - role constraint updated to include 'owner' (owner > manager > employee)
   - Added `session_token` (text, nullable) - stores a unique token per active login session
   When a user logs in, a new random token is generated and stored. On each app load,
   the client compares its local token with the server token. If they differ, the
   session was taken over by another login and the current device is logged out.

2. Updated the existing admin user to 'owner' role so they have full control.

## Security
- RLS policies remain the same (anon + authenticated full CRUD, app-layer access control).
- The session_token column is accessible via the same policies as the rest of the employees table.
*/

-- Add session_token column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'session_token'
  ) THEN
    ALTER TABLE employees ADD COLUMN session_token text;
  END IF;
END $$;

-- Update role constraint to include 'owner'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'employees' AND constraint_name = 'employees_role_check'
  ) THEN
    ALTER TABLE employees DROP CONSTRAINT employees_role_check;
  END IF;
END $$;

ALTER TABLE employees ADD CONSTRAINT employees_role_check
  CHECK (role IN ('employee', 'manager', 'owner'));

-- Promote existing admin to owner
UPDATE employees SET role = 'owner' WHERE username = 'admin';
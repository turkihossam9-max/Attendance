/*
# Employee Attendance App - Initial Schema

## Overview
Creates a complete schema for a professional employee attendance tracking system
with GPS-based check-in/check-out, multiple work locations, and role-based access
(employee vs manager).

## Tables

### employees
Stores employee accounts. Each employee has a username and password (hashed),
a role (employee or manager), and a display name.
- id (uuid, PK)
- username (text, unique, not null) - login identifier
- password_hash (text, not null) - bcrypt-style hash stored in app
- full_name (text, not null) - display name
- role (text, not null, default 'employee') - 'employee' or 'manager'
- active (boolean, default true) - can be deactivated
- created_at (timestamptz)
- updated_at (timestamptz)

### work_locations
Stores work locations where employees can check in. Each has GPS coordinates
and a radius (in meters) defining the allowed check-in area.
- id (uuid, PK)
- name (text, not null) - location name
- address (text) - human-readable address
- latitude (double precision, not null)
- longitude (double precision, not null)
- radius_meters (integer, not null, default 100) - allowed check-in radius
- active (boolean, default true)
- created_at (timestamptz)

### attendance_records
Stores individual check-in/check-out events.
- id (uuid, PK)
- employee_id (uuid, FK to employees, not null)
- work_location_id (uuid, FK to work_locations, not null)
- type (text, not null) - 'check_in' or 'check_out'
- latitude (double precision, not null) - GPS lat at time of record
- longitude (double precision, not null) - GPS lng at time of record
- timestamp (timestamptz, not null, default now())
- note (text) - optional note
- created_at (timestamptz)

## Security (RLS)
This app uses username/password auth stored in the `employees` table (NOT Supabase Auth).
The frontend talks to Supabase with the anon key. RLS policies allow anon+authenticated
full CRUD on all tables because access control is enforced in the app layer based on
the logged-in employee's role. This is a single-tenant business app where all employees
share the same data.
*/

-- Employees table
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'manager')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_employees" ON employees;
CREATE POLICY "anon_select_employees" ON employees FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_employees" ON employees;
CREATE POLICY "anon_insert_employees" ON employees FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_employees" ON employees;
CREATE POLICY "anon_update_employees" ON employees FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_employees" ON employees;
CREATE POLICY "anon_delete_employees" ON employees FOR DELETE
TO anon, authenticated USING (true);

-- Work locations table
CREATE TABLE IF NOT EXISTS work_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  radius_meters integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE work_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_locations" ON work_locations;
CREATE POLICY "anon_select_locations" ON work_locations FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_locations" ON work_locations;
CREATE POLICY "anon_insert_locations" ON work_locations FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_locations" ON work_locations;
CREATE POLICY "anon_update_locations" ON work_locations FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_locations" ON work_locations;
CREATE POLICY "anon_delete_locations" ON work_locations FOR DELETE
TO anon, authenticated USING (true);

-- Attendance records table
CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_location_id uuid NOT NULL REFERENCES work_locations(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('check_in', 'check_out')),
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_attendance" ON attendance_records;
CREATE POLICY "anon_select_attendance" ON attendance_records FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_attendance" ON attendance_records;
CREATE POLICY "anon_insert_attendance" ON attendance_records FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_attendance" ON attendance_records;
CREATE POLICY "anon_update_attendance" ON attendance_records FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_attendance" ON attendance_records;
CREATE POLICY "anon_delete_attendance" ON attendance_records FOR DELETE
TO anon, authenticated USING (true);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_timestamp ON attendance_records(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_location ON attendance_records(work_location_id);
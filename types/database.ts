export type EmployeeRole = 'employee' | 'manager' | 'owner';

export interface Employee {
  id: string;
  username: string;
  password_hash: string;
  full_name: string;
  role: EmployeeRole;
  active: boolean;
  session_token: string | null;
  device_info: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkLocation {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  active: boolean;
  created_at: string;
}

export type AttendanceType = 'check_in' | 'check_out';

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  work_location_id: string;
  type: AttendanceType;
  latitude: number;
  longitude: number;
  timestamp: string;
  note: string | null;
  selfie_data: string | null;
  created_at: string;
  employee?: Employee;
  work_location?: WorkLocation;
}

export interface AttendanceWithDetails extends AttendanceRecord {
  employee_name?: string;
  location_name?: string;
}

export function isPrivileged(role: EmployeeRole): boolean {
  return role === 'manager' || role === 'owner';
}

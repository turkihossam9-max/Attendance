import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from './supabase';
import type { Employee } from '../types/database';

interface AuthContextType {
  user: Employee | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'attendance_app_user';

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function detectDevice(): string {
  if (typeof navigator === 'undefined') return 'Unknown';
  const ua = navigator.userAgent;
  const isMobile = /Android|iPhone|iPad|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile/i.test(ua);
  const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua);

  let browser = 'Unknown';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  let os = 'Unknown';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Mac OS/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  const deviceType = isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Desktop';
  return `${deviceType} - ${browser}/${os}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredUser();
  }, []);

  async function loadStoredUser() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: Employee = JSON.parse(stored);
        const { data } = await supabase
          .from('employees')
          .select('*')
          .eq('id', parsed.id)
          .maybeSingle();
        if (data && (data as Employee).active) {
          const serverUser = data as Employee;
          setUser(serverUser);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(serverUser));
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }

  async function login(username: string, password: string) {
    const hashed = await hashPassword(password);
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('username', username)
      .eq('password_hash', hashed)
      .eq('active', true)
      .maybeSingle();

    if (error) {
      return { success: false, error: 'Connection error. Please try again.' };
    }
    if (!data) {
      return { success: false, error: 'Invalid username or password' };
    }

    const deviceInfo = detectDevice();
    const { error: updateErr } = await supabase
      .from('employees')
      .update({
        device_info: deviceInfo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id);

    if (updateErr) {
      return { success: false, error: 'Login failed. Please try again.' };
    }

    const loggedInUser = { ...(data as Employee), device_info: deviceInfo };
    setUser(loggedInUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedInUser));
    return { success: true };
  }

  function logout() {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  async function refreshUser() {
    if (!user) return;
    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (data) {
      setUser(data as Employee);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { hashPassword };

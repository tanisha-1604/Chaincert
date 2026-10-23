import { User } from '../types';
import { apiRequest, API_BASE_URL } from './apiConfig';

const AUTH_STORAGE_KEY = 'chaincert_auth_user';

interface BackendUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  institution_id: string | null;
  roll_number?: string | null;
}

interface LoginResponse {
  success: boolean;
  access_token: string;
  user: BackendUser;
}

function mapBackendUser(bu: BackendUser, token: string): User {
  const role = bu.role === 'PLATFORM_ADMIN' || bu.role === 'INSTITUTION_ADMIN' || bu.role === 'ISSUER'
    ? 'institution'
    : bu.role === 'STUDENT'
    ? 'student'
    : 'public';
  return {
    id: bu.id,
    name: bu.display_name,
    email: bu.email,
    role,
    institutionId: bu.institution_id ?? undefined,
    studentId: bu.roll_number ?? undefined,
    token,
  };
}

export const authService = {
  getCurrentUser(): User | null {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async loginInstitution(email: string, password: string): Promise<User> {
    const data = await apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const user = mapBackendUser(data.user, data.access_token);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    return user;
  },

  async loginStudent(identifier: string, password: string): Promise<User> {
    // Students may log in with email or student ID — try email login against the API
    const data = await apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: identifier, password }),
    });
    const user = mapBackendUser(data.user, data.access_token);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    return user;
  },

  async logout(): Promise<void> {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const headers: Record<string, string> = {};
      if (parsed?.token) {
        headers['Authorization'] = `Bearer ${parsed.token}`;
      }
      await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', headers });
    } catch {
      // Best-effort — always clear local session
    }
    localStorage.removeItem(AUTH_STORAGE_KEY);
  },
};

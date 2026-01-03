import { useAuth } from '@clerk/clerk-react';

const API_BASE = '/api';

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {},
  getToken: () => Promise<string | null>
): Promise<ApiResponse<T>> {
  const token = await getToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'An error occurred');
  }

  return data;
}

export function useApi() {
  const { getToken } = useAuth();

  return {
    get: <T>(endpoint: string) => fetchWithAuth<T>(endpoint, { method: 'GET' }, getToken),
    post: <T>(endpoint: string, body: unknown) =>
      fetchWithAuth<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }, getToken),
    put: <T>(endpoint: string, body: unknown) =>
      fetchWithAuth<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }, getToken),
    delete: <T>(endpoint: string) => fetchWithAuth<T>(endpoint, { method: 'DELETE' }, getToken),
  };
}

// Types for API responses
export interface UserSettings {
  hasOpenaiKey: boolean;
  hasNotionKey: boolean;
  notionDatabaseId: string;
  openaiKeyPreview: string;
  notionKeyPreview: string;
}

export interface Lead {
  id: string;
  url: string;
  title: string;
  description: string;
  email?: string;
  domainAge?: number;
  traffic?: number;
  score: number;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
}

export interface DiscoverRequest {
  keywords: string[];
  minDomainAge?: number;
  minTraffic?: number;
}

export interface DiscoverResponse {
  leads: Lead[];
  totalFound: number;
}

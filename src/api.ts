import { CapacitorHttp } from '@capacitor/core';
import type { ApiEnvelope, DriverDashboard } from './types';

const URL_KEY = 'rotas.appsScriptUrl';
const TOKEN_KEY = 'rotas.driverToken';

export function getApiUrl(): string {
  return localStorage.getItem(URL_KEY)?.trim() || '';
}

export function getDriverToken(): string {
  return localStorage.getItem(TOKEN_KEY)?.trim() || '';
}

export function saveConnection(apiUrl: string, token: string): void {
  localStorage.setItem(URL_KEY, apiUrl.trim().replace(/[?#].*$/, ''));
  localStorage.setItem(TOKEN_KEY, token.trim());
}

export function clearConnection(): void {
  localStorage.removeItem(URL_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

function endpoint(action: string): string {
  const base = getApiUrl();
  if (!base) throw new Error('Informe a URL do Apps Script.');
  return `${base}?api=1&action=${encodeURIComponent(action)}`;
}

async function post<T>(action: string, data: Record<string, unknown>): Promise<T> {
  const response = await CapacitorHttp.post({
    url: endpoint(action),
    headers: { 'Content-Type': 'application/json' },
    data,
    connectTimeout: 20000,
    readTimeout: 30000
  });

  let payload = response.data as ApiEnvelope<T> | string;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload) as ApiEnvelope<T>; }
    catch { throw new Error(`Resposta inválida do servidor (HTTP ${response.status}).`); }
  }

  if (response.status < 200 || response.status >= 300 || !payload?.ok) {
    throw new Error(payload?.error || payload?.message || `Erro HTTP ${response.status}.`);
  }
  return payload.data as T;
}

export async function healthCheck(apiUrl: string): Promise<string> {
  const old = getApiUrl();
  localStorage.setItem(URL_KEY, apiUrl.trim().replace(/[?#].*$/, ''));
  try {
    const data = await post<{ message: string }>('health', {});
    return data.message;
  } finally {
    if (old) localStorage.setItem(URL_KEY, old); else localStorage.removeItem(URL_KEY);
  }
}

export async function fetchDashboard(): Promise<DriverDashboard> {
  const token = getDriverToken();
  if (!token) throw new Error('Informe o token do motorista.');
  return post<DriverDashboard>('driverDashboard', { token });
}

export async function startRoute(routeId: string): Promise<DriverDashboard> {
  return post<DriverDashboard>('startRoute', { token: getDriverToken(), routeId });
}

export async function checkStop(stopId: string): Promise<DriverDashboard> {
  return post<DriverDashboard>('checkStop', { token: getDriverToken(), stopId });
}

export function locationUrl(routeId: string): string {
  return `${getApiUrl()}?api=1&action=location&token=${encodeURIComponent(getDriverToken())}&routeId=${encodeURIComponent(routeId)}`;
}
